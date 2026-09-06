import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedRaycastView } from '../src/trusted-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { TrustedRaycastViewEvent, TrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'

class Element extends EventTarget {
  children: Element[] = []
  attributes = new Map<string, string>()
  value = ''; textContent = ''; hidden = false; disabled = false; isConnected = true; tabIndex = 0; open = false
  className = ''
  id = ''
  get options(): Element[] { return this.children }
  append(...children: Element[]) { this.children.push(...children) }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  getAttribute(name: string) { return this.attributes.get(name) ?? null }
  replaceChildren() { this.children = [] }
  focus() {}
  contains() { return false }
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const projection = (revision: number): TrustedRaycastViewMessage => ({ type: revision ? 'patch' : 'ready', sessionId: 's', generation: 'g', revision, root: { type: 'raycast-list', props: { searchEventId: `e${revision}` }, children: [] } })
const inputOf = (nodes: Element[]): Element => nodes.find(node => node.id === 'trusted-raycast-search')!
const errorOf = (nodes: Element[]): Element => nodes.find(node => node.getAttribute('role') === 'alert')!

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
  await flush()
  assert.equal(sent[0]?.eventId, 'copy')
  view.update({ type: 'outcome', sessionId: 's', generation: 'g', revision: 0, eventId: 'copy', succeeded: true, message: '' })
  assert.ok(nodes.some(node => node.textContent === 'Action Completed'), 'completion status is visible')
  view.update({ ...message, type: 'patch', revision: 1, status: 'ready' })
  assert.ok(nodes.some(node => node.textContent === 'Action Completed'), 'outcome-before-commit must not disappear')
  assert.ok(nodes.some(node => node.textContent === '<img src=x onerror=alert(1)>'), 'translation rendered as text, not HTML')
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
