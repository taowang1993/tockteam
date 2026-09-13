import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  appendSummaryMarkdown,
  latestSummary,
  SUMMARY_PREVIEW_LIMIT,
  summaryState,
  truncateSummary,
  type SessionListSummary,
} from '../plugins/pinned-summary/src/client.ts'

class FakeTextNode {
  readonly nodeName = '#text'
  readonly textContent: string
  constructor(textContent: string) {
    this.textContent = textContent
  }
}

class FakeElement {
  readonly children: Array<FakeElement | FakeTextNode> = []
  readonly dataset: Record<string, string> = {}
  href = ''
  rel = ''
  target = ''
  #text = ''

  readonly tagName: string

  constructor(tagName: string) {
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
  }
}

class FakeDocument {
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
  assert.equal(latestSummary([{ kind: 'assistant', blocks: [] }]), undefined)
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
    { expected: 'ready', session: session(), value: snapshot({ nodes: [{ kind: 'compaction', summary: 'ready' }] }) },
  ] as const

  for (const scenario of cases) {
    assert.equal(summaryState(scenario.session, scenario.value), scenario.expected)
  }
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
