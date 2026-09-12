import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedRaycastView } from '../src/trusted-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { TrustedRaycastViewMessage, TrustedRaycastViewNode } from '../src/trusted-raycast-contract.ts'

class Element extends EventTarget {
  children: Element[] = []; value = ''; hidden = false; disabled = false; isConnected = true; open = false
  tag: string; document: { activeElement: Element | undefined }
  constructor(tag: string, document: { activeElement: Element | undefined }) { super(); this.tag = tag; this.document = document }
  append(...children: Element[]) { this.children.push(...children) }
  setAttribute() {}
  replaceChildren() { this.children = [] }
  focus() { this.document.activeElement = this }
  contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)) }
  querySelector(tag: string) { return this.children.find(child => child.tag === tag) }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
function setup(extensionId = 'google-translate') {
  const nodes: Element[] = []; const sent: unknown[] = []; let closed = 0
  const document = { activeElement: undefined as Element | undefined, createElement(tag: string) { const node = new Element(tag, this); nodes.push(node); return node } }
  const view = createTrustedRaycastView(document as unknown as Document, { async trustedRaycastEvent(event: unknown) { sent.push(event) } } as unknown as LauncherPreloadBridge, () => { closed++ })
  const input = nodes.find(node => node.tag === 'input')!
  let revision = 0
  const update = (children: TrustedRaycastViewNode[], detail = true) => view.update({ type: revision ? 'patch' : 'ready', extensionId, sessionId: 's', generation: 'g', revision: revision++, root: { type: 'raycast-list', props: { isShowingDetail: detail, searchEventId: 'search' }, children } } as TrustedRaycastViewMessage)
  const key = (key: string, composing = false, keyCode = 0, options: Partial<KeyboardEvent> = {}) => {
    const event = new Event('keydown', { bubbles: true, cancelable: true })
    Object.defineProperties(event, Object.fromEntries(Object.entries({ key, isComposing: composing, keyCode, target: input, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...options }).map(([key, value]) => [key, { value }])))
    view.element.dispatchEvent(event)
    // src/launcher.ts owning bubble handler closes the active tool on an unconsumed Escape.
    const ownerClosed = key === 'Escape' && !event.cancelBubble
    return { event, ownerClosed }
  }
  return { view, input, document, sent, update, key, get closed() { return closed } }
}
const row = (props: Record<string, string | boolean> = { actionEventId: 'toggle' }): TrustedRaycastViewNode => ({ type: 'raycast-list-item', props: { title: 'translation' }, children: [{ type: 'raycast-action', props: { title: 'Toggle Full Text', ...props }, children: [] }] })

test('composing keys preserve native defaults/focus and never reach owner close or source actions', async () => {
  for (const fallback of [false, true]) for (const key of ['Enter', 'ArrowDown', 'ArrowUp', 'Escape', 'Backspace']) {
    const harness = setup(); harness.update([row()]); await tick()
    const result = harness.key(key, !fallback, fallback ? 229 : 0)
    assert.equal(harness.sent.length, 0, `${key}: no action`)
    assert.equal(harness.document.activeElement, harness.input, `${key}: focus preserved`)
    assert.equal(result.event.defaultPrevented, false, `${key}: native composition preserved`)
    assert.equal(result.ownerClosed, false, `${key}: no owner close`)
  }
})

test('Backspace from an empty root search returns to launcher results without sending a child pop', () => {
  for (const extension of ['kaomoji-search', 'google-translate', 'can-i-use']) {
    const harness = setup(extension); harness.update([row()], false)
    const result = harness.key('Backspace')
    assert.equal(harness.closed, 1, `${extension}: return through the Back to Results callback`)
    assert.equal(result.event.defaultPrevented, true)
    assert.equal(harness.sent.length, 0, 'root exit is owned by the launcher, not the extension child')
    harness.view.dispose()
  }
})

test('root Backspace preserves editing, modifiers, repeats and composition', () => {
  const harness = setup('kaomoji-search'); harness.update([row()], false)
  harness.input.value = 'cat'
  assert.equal(harness.key('Backspace').event.defaultPrevented, false)
  harness.input.value = ''
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey']) {
    assert.equal(harness.key('Backspace', false, 0, { [modifier]: true }).event.defaultPrevented, false)
  }
  for (const tagName of ['INPUT', 'TEXTAREA']) {
    const target = Object.assign(new EventTarget(), { tagName })
    assert.equal(harness.key('Backspace', false, 0, { target }).event.defaultPrevented, false)
  }
  const target = Object.assign(new EventTarget(), { isContentEditable: true })
  assert.equal(harness.key('Backspace', false, 0, { target }).event.defaultPrevented, false)
  harness.key('Backspace', false, 0, { repeat: true })
  harness.key('Backspace', true)
  harness.key('Backspace', false, 229)
  assert.equal(harness.closed, 0)
  assert.equal(harness.sent.length, 0)
  harness.view.dispose()
})

test('Detail Escape bubbles to owner unless an admitted toggle actually starts', async () => {
  for (const state of ['loading', 'empty query', 'service failure', 'unavailable', 'missing handle', 'busy', 'pending input']) {
    const harness = setup(); harness.update([row()]); await tick()
    if (['loading', 'empty query', 'service failure'].includes(state)) harness.update(state === 'loading' ? [{ type: 'raycast-empty', props: { title: 'Translating...' }, children: [] }] : [])
    if (state === 'unavailable') harness.update([row({ unavailable: true, actionEventId: 'toggle' })])
    if (state === 'missing handle') harness.update([row({})])
    if (state === 'busy') { harness.key('Enter'); await tick() }
    if (state === 'pending input') { harness.input.value = 'new'; harness.input.dispatchEvent(new Event('input')) }
    const count = harness.sent.length
    const result = harness.key('Escape')
    assert.equal(result.ownerClosed, true, state)
    assert.equal(result.event.defaultPrevented, false, state)
    assert.equal(harness.sent.length, count, state)
  }
  const executable = setup(); executable.update([row()]); await tick()
  const result = executable.key('Escape')
  assert.equal(result.ownerClosed, false)
  assert.equal(result.event.defaultPrevented, true)
  assert.equal(executable.sent.length, 1)
})
