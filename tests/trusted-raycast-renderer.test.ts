import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedRaycastView } from '../src/trusted-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { TrustedRaycastViewEvent, TrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'

class Element extends EventTarget {
  children: Element[] = []
  attributes = new Map<string, string>()
  value = ''; textContent = ''; placeholder = ''; hidden = false; disabled = false; isConnected = true; tabIndex = 0; open = false
  className = ''
  id = ''
  focused = false
  get options(): Element[] { return this.children }
  append(...children: Element[]) { this.children.push(...children) }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  getAttribute(name: string) { return this.attributes.get(name) ?? null }
  replaceChildren() { this.children = [] }
  focus() { this.focused = true }
  contains() { return false }
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const projection = (revision: number): TrustedRaycastViewMessage => ({ type: revision ? 'patch' : 'ready', sessionId: 's', generation: 'g', revision, root: { type: 'raycast-list', props: { searchEventId: `e${revision}` }, children: [] } })
const inputOf = (nodes: Element[]): Element => nodes.find(node => node.id === 'trusted-raycast-search')!
const errorOf = (nodes: Element[]): Element => nodes.find(node => node.getAttribute('role') === 'alert')!

test('launcher focus requests target the visible Translate search control', () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, {} as LauncherPreloadBridge, () => {})
  view.update(projection(0))
  const input = inputOf(nodes)
  input.focused = false
  view.focus()
  assert.equal(input.focused, true)
})

test('latest typed input is coalesced and retried when a newer projection overtakes delivery', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const completions: { resolve: () => void; reject: (error: Error) => void }[] = []
  const bridge = { trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event); return new Promise<void>((resolve, reject) => completions.push({ resolve, reject })) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const input = inputOf(nodes)
  const type = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')) }
  view.update(projection(0))
  type('old'); type('intermediate'); type('latest')
  view.update({ type: 'toast', sessionId: 's', generation: 'g', revision: 0, querySequence: 0, style: 'failure', title: 'Old Query Failed', message: 'obsolete' })
  assert.equal(errorOf(nodes).hidden, true, 'old service toast cannot overtake pending input')
  assert.equal(sent.length, 1, 'one in-flight input, not a queue of obsolete queries')
  completions[0]!.reject(new Error("Error invoking remote method: Translate event is stale"))
  await flush()
  assert.equal(sent.length, 1, 'do not spin on the same stale handle')
  view.update(projection(1))
  assert.equal(sent[1]?.value, 'latest')
  assert.equal(sent[1]?.revision, 1)
  // The next projection may arrive before the rejection of the previous event.
  type('final')
  view.update(projection(2))
  completions[1]!.reject(new Error('Translate event is stale'))
  await flush()
  assert.equal(sent[2]?.value, 'final')
  assert.equal(sent[2]?.eventId, 'e2')
  completions[2]!.resolve(); await flush()
  view.update(projection(3)); await flush()
  assert.equal(sent.length, 3, 'accepted input must not be sent for every render')
  type('closing')
  view.update({ type: 'error', sessionId: 's', generation: 'g', revision: 4, message: 'closed' })
  completions[3]!.reject(new Error('Translate event is stale')); await flush()
  assert.equal(sent.length, 4)
  assert.equal(input.disabled, true)
})

test('source action outcomes remain visible when React commits after callback completion', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const message: TrustedRaycastViewMessage = { ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: '<img src=x onerror=alert(1)>' }, children: [{ type: 'raycast-action', props: { title: 'Copy Translation', actionEventId: 'copy' }, children: [] }] }] } }
  view.update(message)
  nodes.find(node => node.textContent === 'Copy Translation')!.dispatchEvent(new Event('click'))
  assert.equal((view.element as unknown as Element).getAttribute('aria-busy'), 'true')
  await flush()
  assert.equal(sent[0]?.eventId, 'copy')
  view.update({ type: 'outcome', sessionId: 's', generation: 'g', revision: 0, eventId: 'copy', succeeded: true, message: '' })
  assert.equal((view.element as unknown as Element).getAttribute('aria-busy'), 'false')
  assert.ok(nodes.some(node => node.textContent === 'Action Completed'), 'completion status is visible')
  view.update({ ...message, type: 'patch', revision: 1, status: 'ready' })
  assert.ok(nodes.some(node => node.textContent === 'Action Completed'), 'outcome-before-commit must not disappear')
  assert.ok(nodes.some(node => node.textContent === '<img src=x onerror=alert(1)>'), 'translation rendered as text, not HTML')
})

test('footer actions follow selection, open by pointer, and clamp after results shrink', () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  const item = (title: string, action: string, eventId: string): NonNullable<TrustedRaycastViewMessage['root']> => ({ type: 'raycast-list-item', props: { title }, children: [{ type: 'raycast-action', props: { title: action, actionEventId: eventId }, children: [] }] })
  view.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [item('Hello', 'Copy Translation', 'copy-translation'), item('Source', 'Copy', 'copy')] } })
  const resultRows = nodes.filter(node => node.className.startsWith('rounded-lg px-3 py-2'))
  let primary = nodes.find(node => node.getAttribute('aria-label') === 'Copy Translation')!
  resultRows[1]!.dispatchEvent(new Event('focusin'))
  assert.equal(primary.getAttribute('aria-label'), 'Copy')
  const trigger = nodes.find(node => node.textContent === 'Actions' && node.className.includes('inline-flex min-h-9'))!
  const menus = nodes.filter(node => node.children.some(child => child.textContent === 'Actions' && child.className === 'sr-only'))
  trigger.dispatchEvent(new Event('click', { bubbles: true }))
  assert.equal(menus[1]!.open, true)
  view.update({ ...projection(1), root: { type: 'raycast-list', props: { searchEventId: 'search-1' }, children: [item('Hello', 'Copy Translation', 'copy-translation')] } })
  primary = nodes.findLast(node => node.getAttribute('aria-label') === 'Copy Translation')!
  assert.equal(primary.disabled, false)
})

test('empty results stay centered and retain root language-set actions', () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  view.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search', searchBarPlaceholder: 'Enter text to translate' }, children: [
    { type: 'raycast-empty', props: { title: 'No Results' }, children: [] },
    { type: 'raycast-action', props: { title: 'Next Language Set', actionEventId: 'next' }, children: [] },
  ] } })
  assert.ok(nodes.some(node => node.textContent === 'No Results' && node.className.includes('font-medium')))
  assert.equal(inputOf(nodes).placeholder, 'Enter text to translate')
  const trigger = nodes.findLast(node => node.textContent === 'Actions' && node.className.includes('inline-flex min-h-9'))!
  assert.equal(trigger.disabled, false)
  trigger.dispatchEvent(new Event('click', { bubbles: true }))
  const menu = nodes.findLast(node => node.children.some(child => child.textContent === 'Actions' && child.className === 'sr-only'))!
  assert.equal(menu.open, true)
})

test('EmptyView renders explicit Hourglass and neutral implicit search icons', () => {
  const nodes: Element[] = []
  const document = {
    createElement() { const node = new Element(); nodes.push(node); return node },
    createElementNS(_namespace: string, tag: string) { const node = new Element(); node.setAttribute('tag', tag); nodes.push(node); return node },
  } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  view.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-empty', props: { title: 'Translating…', icon: 'Hourglass' }, children: [] }] } })
  assert.equal(nodes.filter(node => node.getAttribute('tag') === 'path').length, 4)
  assert.equal(nodes.some(node => node.getAttribute('tag') === 'circle'), false)
  view.update({ ...projection(1), root: { type: 'raycast-list', props: { searchEventId: 'search-1' }, children: [{ type: 'raycast-empty', props: { title: 'No Results' }, children: [] }] } })
  assert.equal(nodes.some(node => node.getAttribute('tag') === 'circle'), true)
})

test('result accessories are bounded text and malformed values stay inert', () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  const row = (accessories: string): NonNullable<TrustedRaycastViewMessage['root']> => ({ type: 'raycast-list-item', props: { title: 'Hello', accessories }, children: [{ type: 'raycast-action', props: { title: 'Copy', actionEventId: 'copy' }, children: [] }] })
  view.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [row(JSON.stringify([{ text: 'French → English', tooltip: 'French to English' }]))] } })
  const accessory = nodes.find(node => node.textContent === 'French → English')!
  assert.equal((accessory as unknown as { title: string }).title, 'French to English')
  const oversized = 'x'.repeat(257)
  view.update({ ...projection(1), root: { type: 'raycast-list', props: { searchEventId: 'search-1' }, children: [row(JSON.stringify([{ text: oversized }]))] } })
  assert.equal(nodes.some(node => node.textContent === oversized), false)
})

test('terminal errors clear query and action busy state', () => {
  const actionNodes: Element[] = []
  const actionDocument = { createElement() { const node = new Element(); actionNodes.push(node); return node } } as unknown as Document
  const actionView = createTrustedRaycastView(actionDocument, { trustedRaycastEvent: () => new Promise<void>(() => {}) } as unknown as LauncherPreloadBridge, () => {})
  actionView.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: 'result' }, children: [{ type: 'raycast-action', props: { title: 'Copy', actionEventId: 'copy' }, children: [] }] }] } })
  actionNodes.find(node => node.textContent === 'Copy')!.dispatchEvent(new Event('click'))
  assert.equal((actionView.element as unknown as Element).getAttribute('aria-busy'), 'true')
  actionView.update({ type: 'error', sessionId: 's', generation: 'g', revision: 1, message: 'closed' })
  assert.equal((actionView.element as unknown as Element).getAttribute('aria-busy'), 'false')

  const queryNodes: Element[] = []
  const queryDocument = { createElement() { const node = new Element(); queryNodes.push(node); return node } } as unknown as Document
  const queryView = createTrustedRaycastView(queryDocument, { trustedRaycastEvent: () => new Promise<void>(() => {}) } as unknown as LauncherPreloadBridge, () => {})
  queryView.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search', queryCurrent: false }, children: [{ type: 'raycast-empty', props: { title: 'Translating…', icon: 'Hourglass' }, children: [] }] } })
  const queryResults = queryNodes.find(node => node.getAttribute('aria-label') === 'Translations')!
  const queryInput = inputOf(queryNodes)
  const languageSet = queryNodes.find(node => node.getAttribute('aria-label') === 'Language Set')!
  const status = queryNodes.find(node => node.getAttribute('role') === 'status')!
  const panelActions = queryNodes.find(node => node.className.startsWith('flex flex-wrap items-start'))!
  const footerActions = queryNodes.find(node => node.getAttribute('aria-label') === 'Command Actions')!
  assert.equal(footerActions.getAttribute('role'), 'group')
  assert.equal(queryResults.children.length, 1)
  assert.equal((queryView.element as unknown as Element).getAttribute('aria-busy'), 'true')
  queryView.update({ type: 'error', sessionId: 's', generation: 'g', revision: 1, message: 'closed' })
  assert.equal((queryView.element as unknown as Element).getAttribute('aria-busy'), 'false')
  assert.equal(queryInput.disabled, true)
  assert.equal(languageSet.disabled, true)
  assert.equal(status.textContent, '')
  assert.equal(status.hidden, true)
  assert.equal(queryResults.children.length, 0, 'terminal errors replace the stale Hourglass projection')
  assert.equal(panelActions.hidden, true)
  assert.equal(footerActions.children.length, 0)
  const alert = errorOf(queryNodes)
  assert.equal(alert.hidden, false)
  assert.match(alert.className, /items-center justify-center text-center/u)
  assert.equal(alert.textContent, 'closed')
})

test('internal stale or busy action rejections surface as a neutral retry message, not runtime text', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event); return Promise.reject(new Error('Translate event is stale')) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const message: TrustedRaycastViewMessage = { ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: 'result' }, children: [{ type: 'raycast-action', props: { title: 'Play Text-To-Speech', actionEventId: 'play' }, children: [] }] }] } }
  view.update(message)
  nodes.find(node => node.textContent === 'Play Text-To-Speech')!.dispatchEvent(new Event('click'))
  await flush()
  assert.equal(sent[0]?.eventId, 'play')
  const alert = errorOf(nodes)
  assert.equal(alert.hidden, false, 'a visible retry message exists')
  assert.equal(alert.textContent.includes('stale'), false, 'internal stale text must not leak')
  assert.match(alert.textContent, /try again|重试/)
})

test('internal stale or busy child outcomes also surface as the neutral retry message', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const bridge = { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const message: TrustedRaycastViewMessage = { ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: 'result' }, children: [{ type: 'raycast-action', props: { title: 'Play Text-To-Speech', actionEventId: 'play' }, children: [] }] }] } }
  view.update(message)
  nodes.find(node => node.textContent === 'Play Text-To-Speech')!.dispatchEvent(new Event('click'))
  await flush()
  view.update({ type: 'outcome', sessionId: 's', generation: 'g', revision: 0, eventId: 'play', succeeded: false, message: 'Translate action is stale or busy' })
  const alert = errorOf(nodes)
  assert.equal(alert.hidden, false)
  assert.equal(alert.textContent.includes('stale'), false)
  assert.match(alert.textContent, /try again|重试/)
})

test('language set dropdown change sends a bounded fieldChanged event', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const root: TrustedRaycastViewMessage['root'] = {
    type: 'raycast-list', props: { searchEventId: 'search' },
    children: [
      { type: 'raycast-dropdown', props: { value: JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN'] }), fieldEventId: 'manage-dropdown' }, children: [
        { type: 'raycast-dropdown-item', props: { title: 'Manage language sets...', value: 'manage' }, children: [] },
        { type: 'raycast-dropdown-item', props: { title: 'Auto -> Simplified Chinese', value: JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN'] }) }, children: [] },
      ] },
    ],
  }
  view.update({ ...projection(0), root })
  const select = nodes.find(node => node.getAttribute('aria-label') === 'Language Set')!
  assert.equal(select.hidden, false)
  select.value = 'manage'
  select.dispatchEvent(new Event('change'))
  await flush()
  assert.equal(sent[0]?.kind, 'fieldChanged')
  assert.equal(sent[0]?.eventId, 'manage-dropdown')
  assert.equal(sent[0]?.value, 'manage')
})

test('first-run preferences use the Raycast-like centered hierarchy and keyboard submit', async () => {
  const nodes: Element[] = []
  const sent: TrustedRaycastViewEvent[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  const options = [{ type: 'raycast-form-dropdown-item', props: { title: 'English', value: 'en' }, children: [] }] as const
  view.update({ ...projection(0), root: { type: 'root', props: { preferenceSetup: true }, children: [{ type: 'raycast-form', props: {}, children: [
    { type: 'raycast-form-dropdown', props: { title: 'Translate from', value: 'auto', fieldEventId: 'from' }, children: [{ type: 'raycast-form-dropdown-item', props: { title: 'Auto-Detect', value: 'auto' }, children: [] }] },
    { type: 'raycast-form-dropdown', props: { title: 'Primary Language', value: 'en', fieldEventId: 'primary' }, children: options },
    { type: 'raycast-form-dropdown', props: { title: 'Secondary Language', value: 'en', fieldEventId: 'secondary' }, children: options },
    { type: 'raycast-action', props: { title: 'Continue', actionEventId: 'continue' }, children: [] },
  ] }] } })
  assert.equal(view.element.getAttribute('data-view'), 'preference-setup')
  assert.ok(nodes.some(node => node.getAttribute('alt') === 'Google Translate'))
  assert.ok(nodes.some(node => node.textContent === 'Google Translate'))
  assert.ok(nodes.some(node => node.textContent.includes('Before you can start using this extension')))
  assert.ok(nodes.some(node => node.textContent === 'Continue'))
  assert.ok(nodes.some(node => node.className.includes('max-w-[38rem]')), 'the form uses a centered readable measure')
  const submit = Object.assign(new Event('keydown'), { key: 'Enter', isComposing: false, keyCode: 13, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })
  view.element.dispatchEvent(submit)
  await flush()
  assert.equal(sent.at(-1)?.kind, 'action')
  assert.equal(sent.at(-1)?.eventId, 'continue')
  view.update(projection(1))
  view.update({ type: 'outcome', sessionId: 's', generation: 'g', revision: 1, eventId: 'continue', succeeded: true })
  assert.ok(!nodes.some(node => node.getAttribute('role') === 'status' && node.textContent === 'Action Completed'), 'setup completion does not leak into a fresh command view')
})

test('nested AddLanguageForm renders fields and submits through the source action', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const formRoot: TrustedRaycastViewMessage['root'] = {
    type: 'raycast-form', props: { navigationDepth: 1 },
    children: [
      { type: 'raycast-form-dropdown', props: { title: 'Source Language', value: 'auto', fieldEventId: 'from' }, children: [{ type: 'raycast-form-dropdown-item', props: { title: 'Auto Detect', value: 'auto' }, children: [] }] },
      { type: 'raycast-form-dropdown', props: { title: 'Target Language 1', value: 'en', fieldEventId: 'to0' }, children: [{ type: 'raycast-form-dropdown-item', props: { title: 'English', value: 'en' }, children: [] }, { type: 'raycast-form-dropdown-item', props: { title: 'French', value: 'fr' }, children: [] }] },
      { type: 'raycast-action', props: { title: 'Add Language Set', actionEventId: 'submit-action' }, children: [] },
    ],
  }
  view.update({ ...projection(0), root: formRoot })
  const search = inputOf(nodes)
  assert.equal(search.hidden, false, 'stub lacks real layout: search row visibility comes from searchEventId')
  const from = nodes.find(node => node.getAttribute('aria-label') === 'Source Language')!
  assert.equal(from.value, 'auto')
  from.value = 'en'; from.dispatchEvent(new Event('change'))
  await flush()
  assert.equal(sent[0]?.kind, 'fieldChanged')
  assert.equal(sent[0]?.eventId, 'from')
  assert.equal(sent[0]?.value, 'en')
  nodes.find(node => node.textContent === 'Add Language Set')!.dispatchEvent(new Event('click'))
  await flush()
  assert.equal(sent[1]?.kind, 'action')
  assert.equal(sent[1]?.eventId, 'submit-action')
})

test('Escape pops a nested view instead of closing the command', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  let closed = false
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => { closed = true })
  const root: TrustedRaycastViewMessage['root'] = { type: 'raycast-list', props: { navigationDepth: 1 }, children: [] }
  view.update({ ...projection(0), root })
  const event = Object.assign(new Event('keydown'), { key: 'Escape', isComposing: false, keyCode: 27, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })
  view.element.dispatchEvent(event)
  await flush()
  assert.equal(sent[0]?.kind, 'navigation')
  assert.equal(sent[0]?.value, 'language:pop')
  assert.equal(closed, false, 'nested Escape must not close the command')
})

test('source-initiated search text (autoInput or pop restore) syncs into the input', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const bridge = { async trustedRaycastEvent() {} } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const root: TrustedRaycastViewMessage['root'] = { type: 'raycast-list', props: { searchEventId: 'search', searchText: 'TockTeam trusted Raycast selection fixture' }, children: [] }
  view.update({ ...projection(0), root })
  assert.equal(inputOf(nodes).value, 'TockTeam trusted Raycast selection fixture')
})
