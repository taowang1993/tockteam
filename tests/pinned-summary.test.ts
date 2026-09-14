import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import {
  appendSummaryMarkdown,
  apply,
  latestSummary,
  SUMMARY_PREVIEW_LIMIT,
  summaryState,
  truncateSummary,
  type SessionListSummary,
  type PinnedSummary,
} from '../plugins/pinned-summary/src/client.ts'

class FakeTextNode {
  readonly nodeName = '#text'
  readonly textContent: string
  constructor(textContent: string) {
    this.textContent = textContent
  }
}

class FakeElement extends EventTarget {
  readonly children: Array<FakeElement | FakeTextNode> = []
  readonly dataset: Record<string, string> = {}
  href = ''
  rel = ''
  target = ''
  #text = ''
  id = ''
  hidden = false
  parent: FakeElement | undefined
  readonly attributes = new Map<string, string>()
  readonly classList = { add: (..._names: string[]) => {}, remove: (..._names: string[]) => {} }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value) }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  toggleAttribute(name: string, force: boolean): void {
    if (force) this.setAttribute(name, '')
    else this.attributes.delete(name)
  }
  replaceChildren(...children: Array<FakeElement | FakeTextNode>): void {
    this.textContent = ''
    this.append(...children)
  }
  appendChild(child: FakeElement): FakeElement { this.append(child); return child }
  remove(): void {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1)
  }
  get childElementCount(): number { return this.children.length }

  readonly tagName: string

  constructor(tagName: string) {
    super()
    this.tagName = tagName
  }

  get textContent(): string {
    return this.#text || this.children.map(child => child.textContent).join('')
  }

  set textContent(value: string | null) {
    this.#text = value ?? ''
    this.children.splice(0, this.children.length)
  }

  append(...children: Array<FakeElement | FakeTextNode>): void {
    this.children.push(...children)
    for (const child of children) if (child instanceof FakeElement) child.parent = this
  }
}

class FakeDocument extends EventTarget {
  readonly documentElement = new FakeElement('html')
  readonly body = new FakeElement('body')
  readonly activeElement = null
  getElementById(id: string): FakeElement | null {
    return descendants(this.body).find(node => node.id === id) ?? null
  }
  createElementNS(_namespace: string, tagName: string): FakeElement { return this.createElement(tagName) }
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName)
  }

  createTextNode(text: string): FakeTextNode {
    return new FakeTextNode(text)
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(child => child instanceof FakeElement ? descendants(child) : [])]
}

function session(overrides: Partial<SessionListSummary> = {}): SessionListSummary {
  return {
    id: 'session-1',
    displayTitle: 'Session 1',
    running: false,
    blank: false,
    updatedAt: 1,
    ...overrides,
  }
}

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  openState: 'open',
  openError: null,
  nodes: [],
  pending: [],
  running: false,
  blank: false,
  ...overrides,
})

test('selects the latest usable compaction summary before assistant text blocks', () => {
  assert.deepEqual(
    latestSummary([
      { kind: 'assistant', blocks: [{ kind: 'text', text: 'older answer' }] },
      { kind: 'compaction', summary: '  durable context summary  ' },
      { kind: 'assistant', blocks: [
        { kind: 'reasoning', text: 'internal reasoning' },
        { kind: 'text', text: 'first part' },
        { kind: 'tool-call', name: 'shell' },
        { kind: 'text', text: 'second part' },
      ] },
    ]),
    { kind: 'context', text: 'durable context summary' },
  )
  assert.deepEqual(
    latestSummary([{ kind: 'assistant', blocks: [
      { kind: 'reasoning', text: 'internal reasoning' },
      { kind: 'text', text: 'first part' },
      { kind: 'tool-result', text: 'not rendered' },
    ] }]),
    { kind: 'assistant', text: 'first part' },
  )
  const longAnswer = 'a'.repeat(6_000)
  assert.deepEqual(
    latestSummary([{ kind: 'assistant', blocks: [{ kind: 'text', text: longAnswer }] }]),
    { kind: 'assistant', text: longAnswer },
  )
  assert.equal(latestSummary([{ kind: 'assistant', blocks: [] }]), undefined)
})

function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    listeners,
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: (next: T) => { value = next; for (const listener of listeners) listener() },
  }
}

test('mounted summary follows only the RC.1 chat target and releases replaced sources', t => {
  const document = new FakeDocument()
  const old = { document: globalThis.document, HTMLElement: globalThis.HTMLElement }
  Object.assign(globalThis, { document, HTMLElement: FakeElement })
  const cleanups: Array<() => void> = []
  t.after(() => { for (const cleanup of cleanups.reverse()) cleanup(); Object.assign(globalThis, old) })
  const list = observable<{ current?: string; byId: Record<string, SessionListSummary> }>({ current: 'session-1', byId: { 'session-1': session() } })
  const firstSession = observable<unknown>(snapshot())
  const firstChat = observable<unknown>(undefined)
  let currentSession = firstSession
  let currentChat = firstChat
  let provided: PinnedSummary | undefined
  const locale = observable({ active: 'en', revision: 1 })
  apply({
    get: name => ({
      sessions: { list, binding: (id: string) => list.getSnapshot().byId[id] ? { session: currentSession } : undefined },
      uiConversation: { binding: (id: string) => {
        assert.ok(list.getSnapshot().byId[id], 'never bind an absent session')
        return { target: (target: string) => { assert.equal(target, 'chat'); return currentChat } }
      } },
      locale: { ...locale, register: () => () => {}, bind: () => (key: string) => key },
    })[name],
    effect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup) },
    reflect: { provide: (_name, value) => { provided = value as PinnedSummary; return () => {} } },
  })
  assert.ok(provided)
  const panel = document.getElementById('tockteam-pinned-summary')!
  const content = document.getElementById('tockteam-pinned-summary-content')!
  const chat = (text: string) => ({ legacy: { nodes: [{ kind: 'compaction', summary: text }] } })
  firstChat.set(chat('RC.1 context'))
  assert.equal(content.textContent, 'RC.1 context')
  assert.equal(panel.getAttribute('data-state'), 'ready')
  firstSession.set(snapshot({ nodes: [{ kind: 'compaction', summary: 'wrong session-owned nodes' }] }))
  assert.equal(content.textContent, 'RC.1 context')
  firstChat.set({ legacy: { nodes: [{ kind: 'assistant', blocks: [{ kind: 'text', text: 'final answer' }] }], partial: { text: 'not final' } } })
  assert.equal(content.textContent, 'final answer')
  for (const [fields, expected] of [
    [{ queue: [{}] }, 'waiting'], [{ running: true }, 'running'],
    [{ openState: 'cold' }, 'loading'], [{ promptError: {} }, 'error'], [{ blank: true }, 'blank'],
  ] as const) {
    firstSession.set(snapshot(fields))
    assert.equal(panel.getAttribute('data-state'), expected)
  }
  firstSession.set(snapshot())
  for (const value of [undefined, {}, { nodes: [{ kind: 'compaction', summary: 'wrong shape' }] }, { legacy: { nodes: [], partial: { text: 'not final' } } }]) {
    firstChat.set(value)
    assert.equal(panel.getAttribute('data-state'), 'unavailable')
    assert.equal(content.textContent, 'summary.unavailable')
  }
  currentChat = observable<unknown>(chat('replacement chat'))
  list.set({ ...list.getSnapshot() })
  assert.equal(firstChat.listeners.size, 0)
  assert.equal(currentChat.listeners.size, 1)
  assert.equal(content.textContent, 'replacement chat')
  currentSession = observable<unknown>(snapshot())
  list.set({ ...list.getSnapshot() })
  assert.equal(firstSession.listeners.size, 0)
  assert.equal(currentSession.listeners.size, 1)
  list.set({ current: 'session-2', byId: { 'session-2': session({ id: 'session-2' }) } })
  assert.equal(currentChat.listeners.size, 1)
  list.set({ byId: {} })
  assert.equal(currentChat.listeners.size, 0)
  assert.equal(currentSession.listeners.size, 0)
  assert.equal(panel.getAttribute('data-state'), 'no-session')
  assert.doesNotMatch(content.textContent, /replacement chat/)
  list.set({ current: 'removed-session', byId: {} })
  assert.equal(panel.getAttribute('data-state'), 'no-session')
  list.set({ current: 'session-1', byId: { 'session-1': session() } })
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  assert.equal(document.getElementById('tockteam-pinned-summary'), null)
  for (const source of [list, locale, firstSession, firstChat, currentSession, currentChat]) assert.equal(source.listeners.size, 0)
})

test('bounds previews and keeps short text unchanged', () => {
  assert.equal(SUMMARY_PREVIEW_LIMIT, 480)
  assert.deepEqual(truncateSummary('  short summary  ', 32), {
    text: 'short summary',
    truncated: false,
  })
  assert.deepEqual(truncateSummary('0123456789abcdef', 12), {
    text: '0123456789a…',
    truncated: true,
  })
  assert.deepEqual(truncateSummary('😀😀😀', 2), {
    text: '😀…',
    truncated: true,
  })
})

test('maps verified DSH conversation fields to explicit lifecycle states', () => {
  const cases = [
    { expected: 'no-session', session: undefined, value: undefined },
    { expected: 'loading', session: session(), value: undefined },
    { expected: 'loading', session: session(), value: snapshot({ openState: 'cold' }) },
    { expected: 'error', session: session(), value: snapshot({ openState: 'error', openError: { message: 'offline' } }) },
    { expected: 'error', session: session(), value: snapshot({ promptError: { error: { message: 'failed' } } }) },
    { expected: 'blank', session: session({ blank: true }), value: snapshot() },
    { expected: 'waiting', session: session(), value: snapshot({ pending: [{ kind: 'question' }] }) },
    { expected: 'waiting', session: session(), value: snapshot({ pendingSubmissions: [{ requestId: 'request-1' }] }) },
    { expected: 'waiting', session: session(), value: snapshot({ queue: [{ id: 'queued-1' }] }) },
    { expected: 'running', session: session({ running: true }), value: snapshot() },
    { expected: 'unavailable', session: session(), value: snapshot() },
    { expected: 'unavailable', session: session(), value: snapshot({ nodes: [{ kind: 'compaction', summary: 'not a chat projection' }] }) },
  ] as const

  for (const scenario of cases) {
    assert.equal(summaryState(scenario.session, scenario.value), scenario.expected)
  }
  assert.equal(summaryState(session(), snapshot(), { kind: 'context', text: 'ready' }), 'ready')
})

test('renders only the restricted rich-text subset and safe external links', () => {
  const previousDocument = globalThis.document
  Object.assign(globalThis, { document: new FakeDocument() })
  try {
    const root = new FakeElement('article')
    appendSummaryMarkdown(root as unknown as HTMLElement, [
      '# Safe <img src=x onerror=alert(1)>',
      '',
      '**bold** and `code` and [safe](https://example.test/path)',
      '[unsafe](javascript:alert(1))',
      '[credential](https://user:secret@example.test/)',
      '<script>alert(1)</script>',
    ].join('\n'))
    const nodes = descendants(root)
    assert.equal(nodes.some(node => node.tagName === 'script' || node.tagName === 'img'), false)
    assert.equal(nodes.some(node => node.tagName === 'strong'), true)
    assert.equal(nodes.some(node => node.tagName === 'code'), true)
    const links = nodes.filter(node => node.tagName === 'a')
    assert.equal(links.length, 1)
    assert.equal(links[0]?.href, 'https://example.test/path')
    assert.equal(links[0]?.target, '_blank')
    assert.equal(links[0]?.rel, 'noreferrer noopener')
    assert.match(root.textContent, /<script>alert\(1\)<\/script>/u)
    assert.match(root.textContent, /\[unsafe\]\(javascript:alert\(1\)\)/u)
  } finally {
    Object.assign(globalThis, { document: previousDocument })
  }
})

test('renders long malformed link syntax in bounded time', () => {
  const previousDocument = globalThis.document
  Object.assign(globalThis, { document: new FakeDocument() })
  try {
    const spaces = ' '.repeat(40_000)
    for (const { markdown, expected } of [
      { markdown: '['.repeat(40_000), expected: '['.repeat(40_000) },
      { markdown: '[x]('.repeat(10_000), expected: '[x]('.repeat(10_000) },
      { markdown: `\`\`\`${spaces}\``, expected: `\`\`${spaces}` },
      { markdown: `# ${spaces}\u2028`, expected: `# ${spaces}\u2028` },
      { markdown: `- ${spaces}\u2028`, expected: `- ${spaces}\u2028` },
      { markdown: `1. ${spaces}\u2028`, expected: `1. ${spaces}\u2028` },
    ]) {
      const root = new FakeElement('article')
      const start = performance.now()
      appendSummaryMarkdown(root as unknown as HTMLElement, markdown)
      const elapsed = performance.now() - start
      assert.equal(root.textContent, expected)
      assert.ok(elapsed < 100, `malformed Markdown took ${elapsed.toFixed(1)}ms`)
    }
  } finally {
    Object.assign(globalThis, { document: previousDocument })
  }
})
