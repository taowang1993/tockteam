import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedRaycastView } from '../src/trusted-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { TrustedRaycastViewEvent, TrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'

class Element extends EventTarget {
  children: Element[] = []
  value = ''; hidden = false; disabled = false; isConnected = true
  append(...children: Element[]) { this.children.push(...children) }
  setAttribute() {}
  replaceChildren() { this.children = [] }
  focus() {}
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const projection = (revision: number): TrustedRaycastViewMessage => ({ type: revision ? 'patch' : 'ready', sessionId: 's', generation: 'g', revision, root: { type: 'raycast-list', props: { searchEventId: `e${revision}` }, children: [] } })

test('latest typed input is coalesced and retried when a newer projection overtakes delivery', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const completions: { resolve: () => void; reject: (error: Error) => void }[] = []
  const bridge = { trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event); return new Promise<void>((resolve, reject) => completions.push({ resolve, reject })) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const input = nodes[6]!
  const type = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')) }
  view.update(projection(0))
  type('old'); type('intermediate'); type('latest')
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
