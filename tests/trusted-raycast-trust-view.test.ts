import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedRaycastTrustView } from '../src/trusted-raycast-trust-view.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { TrustedRaycastTrustState } from '../src/trusted-raycast-contract.ts'

class Element extends EventTarget {
  children: Element[] = []
  attributes = new Map<string, string>()
  value = ''; textContent = ''; hidden = false; disabled = false; title = ''; tag = ''
  className = ''
  get options(): Element[] { return this.children }
  append(...children: Element[]) { this.children.push(...children) }
  replaceChildren(...children: Element[]) { this.children = children }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  getAttribute(name: string) { return this.attributes.get(name) ?? null }
  querySelectorAll(selector: string): Element[] { return selector === 'button' ? this.descendants('button') : [] }
  descendants(tag: string): Element[] { return this.children.flatMap(child => [...(child.tag === tag ? [child] : []), ...child.descendants(tag)]) }
  focus() {}
}
type Tagged = Element

const flush = () => new Promise(resolve => setImmediate(resolve))
const trustState = (overrides: Partial<TrustedRaycastTrustState> = {}): TrustedRaycastTrustState => ({
  active: true, candidateAvailable: true, candidateDigest: 'd'.repeat(64), digest: '', digestApproved: false, enabled: false,
  hasPrevious: false, installed: false, previewed: false, recovery: '', staged: false, ...overrides,
})

type Harness = Readonly<{
  nodes: Element[]
  buttons: () => Tagged[]
  status: () => Element
  error: () => Element
  actions: string[]
  states: TrustedRaycastTrustState[]
  setState: (state: TrustedRaycastTrustState) => void
}>

async function makeView(state: TrustedRaycastTrustState, actionResult?: { ok: boolean; error?: string }): Promise<Harness> {
  const nodes: Element[] = []
  const document = { createElement(tag: string) { const node = new Element() as Tagged; node.tag = tag; nodes.push(node); return node } } as unknown as Document
  const actions: string[] = []
  const states: TrustedRaycastTrustState[] = []
  let current: TrustedRaycastTrustState = state
  const bridge = {
    getTrustedRaycastTrust: async () => current,
    trustedRaycastTrustAction: async (action: string) => {
      actions.push(action)
      if (actionResult === undefined && action === 'prepare') current = { ...current, staged: true, previewed: true }
      return actionResult === undefined ? { ok: true, state: current } : { ok: actionResult.ok, state: current, error: actionResult.error ?? '' }
    },
  } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastTrustView(document, bridge, () => {}, 'en-US')
  await flush()
  const section = nodes.find(node => node.attributes.get('aria-label') === 'Trusted Extensions')!
  const byRole = (role: string): Element => section.descendants('p').find(node => node.attributes.get('role') === role)!
  const buttons = (): Tagged[] => section.descendants('button').filter(button => button.textContent !== 'Back to Results')
  void states
  return {
    nodes,
    buttons,
    status: () => byRole('status'),
    error: () => byRole('alert'),
    actions,
    states,
    setState(next) { current = next },
  }
}

test('trust surface installs through the explicit two-step approve and keeps enabled separate', async () => {
  const harness = await makeView(trustState())
  assert.equal(harness.status().textContent, 'Not Installed')
  assert.deepEqual(harness.buttons().map(button => button.textContent), ['Install Reviewed Extension'])
  harness.buttons()[0]!.dispatchEvent(new Event('click'))
  await flush()
  assert.deepEqual(harness.buttons().map(button => button.textContent), ['Approve & Install'])
  harness.buttons()[0]!.dispatchEvent(new Event('click'))
  await flush()
  assert.deepEqual(harness.actions, ['prepare', 'apply'])
  assert.equal(harness.status().textContent, 'Not Installed')
})

test('installed capability exposes enable, disable and confirmed remove; recovery surfaces its action', async () => {
  const installed = await makeView(trustState({ installed: true, digest: 'abc123', digestApproved: true }))
  assert.equal(installed.status().textContent, 'Installed · Disabled')
  assert.deepEqual(installed.buttons().map(button => button.textContent), ['Enable Translate', 'Remove Extension'])
  installed.buttons()[0]!.dispatchEvent(new Event('click'))
  assert.deepEqual(installed.actions, ['enable'])
  const enabled = await makeView(trustState({ installed: true, enabled: true, digest: 'abc123', digestApproved: true }))
  assert.equal(enabled.status().textContent, 'Installed · Enabled')
  assert.deepEqual(enabled.buttons().map(button => button.textContent), ['Disable Translate', 'Remove Extension'])
  enabled.buttons()[0]!.dispatchEvent(new Event('click'))
  assert.deepEqual(enabled.actions, ['disable'])
  const removing = await makeView(trustState({ installed: true, enabled: true, digest: 'abc123', digestApproved: true }))
  removing.buttons()[1]!.dispatchEvent(new Event('click'))
  assert.deepEqual(removing.buttons().map(button => button.textContent), ['Disable Translate', 'Confirm Remove'])
  removing.buttons()[1]!.dispatchEvent(new Event('click'))
  assert.deepEqual(removing.actions, ['remove'])
  const recovering = await makeView(trustState({ recovery: 'invalid-install' }))
  assert.equal(recovering.status().textContent, 'Recovery Required')
  assert.deepEqual(recovering.buttons().map(button => button.textContent), ['Recover Installation'])
  recovering.buttons()[0]!.dispatchEvent(new Event('click'))
  assert.deepEqual(recovering.actions, ['recover'])
})

test('inactive capability and failed actions stay honest and visible', async () => {
  const inactive = await makeView(trustState({ active: false }))
  assert.equal(inactive.status().textContent, 'Capability Inactive')
  assert.deepEqual(inactive.buttons(), [])
  const failing = await makeView(trustState(), { ok: false, error: 'Reviewed candidate fails its digest check' })
  failing.buttons()[0]!.dispatchEvent(new Event('click'))
  failing.buttons()[0]!.dispatchEvent(new Event('click'))
  await flush()
  assert.equal(failing.error().hidden, false)
  assert.match(failing.error().textContent, /digest check/)
  const notInstalled = await makeView(trustState({ candidateAvailable: false }))
  assert.equal(notInstalled.status().textContent, 'Not Installed')
  assert.deepEqual(notInstalled.buttons(), [], 'no install action without a reviewed candidate')
})

test('zh-CN locale renders localized Title Case-free copy', async () => {
  const nodes: Element[] = []
  const document = { createElement(tag: string) { const node = new Element() as Tagged; node.tag = tag; nodes.push(node); return node } } as unknown as Document
  const bridge = { getTrustedRaycastTrust: async () => trustState() } as unknown as LauncherPreloadBridge
  createTrustedRaycastTrustView(document, bridge, () => {}, 'zh-CN')
  await flush()
  const section = nodes.find(node => node.attributes.get('aria-label') === '可信扩展')!
  const buttons = section.descendants('button')
  assert.ok(buttons.some(button => button.textContent === '安装已审核扩展'))
  assert.ok(buttons.some(button => button.textContent === '返回结果'))
})
