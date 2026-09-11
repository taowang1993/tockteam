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
    trustedRaycastTrustAction: async (extensionId: string, action: string) => {
      actions.push(`${extensionId}:${action}`)
      if (actionResult === undefined && action === 'prepare') current = { ...current, staged: true, previewed: true }
      return actionResult === undefined ? { extensionId, ok: true, state: current } : { extensionId, ok: actionResult.ok, state: current, error: actionResult.error ?? '' }
    },
  } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastTrustView(document, bridge, () => {}, 'en-US')
  await flush()
  const section = nodes.find(node => node.attributes.get('aria-label') === 'Extensions')!
  const byRole = (role: string): Element => section.descendants('p').find(node => node.attributes.get('role') === role)!
  const buttons = (): Tagged[] => section.descendants('button').filter(button => button.textContent !== 'Back to Results' && button.attributes.get('role') !== 'tab')
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
  assert.deepEqual(harness.actions, ['google-translate:prepare', 'google-translate:apply'])
  assert.equal(harness.status().textContent, 'Not Installed')
})

test('trust actions stay bound to the selected reviewed extension', async () => {
  const harness = await makeView(trustState())
  const kaomoji = harness.nodes.find(node => node.attributes.get('role') === 'tab' && node.attributes.get('data-extension-id') === 'kaomoji-search')!
  kaomoji.dispatchEvent(new Event('click'))
  await flush()
  harness.buttons()[0]!.dispatchEvent(new Event('click'))
  await flush()
  assert.deepEqual(harness.actions, ['kaomoji-search:prepare'])
})

test('installed capability exposes enable, disable and confirmed remove; recovery surfaces its action', async () => {
  const installed = await makeView(trustState({ installed: true, digest: 'abc123', digestApproved: true }))
  assert.equal(installed.status().textContent, 'Installed · Disabled')
  assert.deepEqual(installed.buttons().map(button => button.textContent), ['Enable Extension', 'Remove Extension'])
  installed.buttons()[0]!.dispatchEvent(new Event('click'))
  assert.deepEqual(installed.actions, ['google-translate:enable'])
  const enabled = await makeView(trustState({ installed: true, enabled: true, digest: 'abc123', digestApproved: true }))
  assert.equal(enabled.status().textContent, 'Installed · Enabled')
  assert.deepEqual(enabled.buttons().map(button => button.textContent), ['Disable Extension', 'Remove Extension'])
  enabled.buttons()[0]!.dispatchEvent(new Event('click'))
  assert.deepEqual(enabled.actions, ['google-translate:disable'])
  const removing = await makeView(trustState({ installed: true, enabled: true, digest: 'abc123', digestApproved: true }))
  removing.buttons()[1]!.dispatchEvent(new Event('click'))
  assert.deepEqual(removing.buttons().map(button => button.textContent), ['Disable Extension', 'Confirm Remove'])
  removing.buttons()[1]!.dispatchEvent(new Event('click'))
  assert.deepEqual(removing.actions, ['google-translate:remove'])
  const recovering = await makeView(trustState({ recovery: 'invalid-install' }))
  assert.equal(recovering.status().textContent, 'Recovery Required')
  assert.deepEqual(recovering.buttons().map(button => button.textContent), ['Recover Installation'])
  recovering.buttons()[0]!.dispatchEvent(new Event('click'))
  assert.deepEqual(recovering.actions, ['google-translate:recover'])
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
  const section = nodes.find(node => node.attributes.get('aria-label') === '扩展')!
  const buttons = section.descendants('button')
  assert.ok(buttons.some(button => button.textContent === '安装已审核扩展'))
  assert.ok(buttons.some(button => button.textContent === '返回结果'))
})

test('first use reviews exact candidate without mutation; approval is explicit and duplicate/repeated Enter is fenced', async () => {
  const { createTrustedRaycastFirstUseView } = await import('../src/trusted-raycast-trust-view.ts')
  const nodes: Element[] = []
  const document = { createElement(tag: string) { const node = new Element(); node.tag = tag; nodes.push(node); return node } } as unknown as Document
  const approvals: unknown[] = []
  let finish!: () => void
  const view = createTrustedRaycastFirstUseView(document, { getTrustedRaycastTrust: async () => trustState() } as unknown as LauncherPreloadBridge, 'can-i-use', () => {}, async (...args) => { approvals.push(args); await new Promise<void>(resolve => { finish = resolve }) }, () => {})
  await flush()
  assert.deepEqual(approvals, [])
  assert.ok(nodes.some(node => node.textContent.includes('d'.repeat(64))))
  const button = nodes.find(node => node.textContent === 'Approve and Open')!
  const key = new Event('keydown', { cancelable: true }); Object.defineProperties(key, { key: { value: 'Enter' }, repeat: { value: true } })
  view.element.dispatchEvent(key)
  assert.equal(key.defaultPrevented, true)
  assert.deepEqual(approvals, [])
  button.dispatchEvent(new Event('click')); button.dispatchEvent(new Event('click'))
  assert.deepEqual(approvals, [['d'.repeat(64), 'approve']])
  assert.ok(nodes.some(node => node.textContent === 'Preparing…'))
  view.dispose(); finish(); await flush()
})

test('retry refreshes partial success and new candidates without automatically consenting', async () => {
  const { createTrustedRaycastFirstUseView } = await import('../src/trusted-raycast-trust-view.ts')
  const nodes: Element[] = []
  const document = { createElement(tag: string) { const node = new Element(); node.tag = tag; nodes.push(node); return node } } as unknown as Document
  let current = trustState()
  const approved: unknown[] = []
  createTrustedRaycastFirstUseView(document, { getTrustedRaycastTrust: async () => current } as unknown as LauncherPreloadBridge, 'can-i-use', () => {}, async (...args) => {
    approved.push(args); current = trustState({ installed: true, digestApproved: true, digest: 'd'.repeat(64) }); throw new Error('Launch failed')
  }, () => {})
  await flush(); nodes.find(node => node.textContent === 'Approve and Open')!.dispatchEvent(new Event('click')); await flush()
  assert.equal(approved.length, 1)
  assert.ok(nodes.some(node => node.textContent === 'Enable and Open' && !node.disabled))
  assert.ok(nodes.some(node => node.textContent === 'Launch failed' && !node.hidden))
})
test('recovery is reachable without a candidate and selected management rows are not disabled', async () => {
  const { createTrustedRaycastFirstUseView } = await import('../src/trusted-raycast-trust-view.ts')
  const nodes: Element[] = []
  const document = { createElement(tag: string) { const node = new Element(); node.tag = tag; nodes.push(node); return node } } as unknown as Document
  let managed = false
  createTrustedRaycastFirstUseView(document, { getTrustedRaycastTrust: async () => trustState({ candidateAvailable: false, recovery: 'invalid-install' }) } as unknown as LauncherPreloadBridge, 'can-i-use', () => {}, async () => { assert.fail('no implicit recovery') }, () => { managed = true })
  await flush(); const recover = nodes.find(node => node.textContent === 'Extensions')!; assert.equal(recover.disabled, false); recover.dispatchEvent(new Event('click')); assert.equal(managed, true)
  const h = await makeView(trustState()); const tab = h.nodes.find(node => node.getAttribute('aria-selected') === 'true')!; assert.equal(tab.disabled, false)
})

test('a failed review read retries in place without approving', async () => {
  const { createTrustedRaycastFirstUseView } = await import('../src/trusted-raycast-trust-view.ts')
  const nodes: Element[] = []; let reads = 0
  const document = { createElement(tag: string) { const node = new Element(); node.tag = tag; nodes.push(node); return node } } as unknown as Document
  createTrustedRaycastFirstUseView(document, { getTrustedRaycastTrust: async () => { if (++reads === 1) throw Error('Temporarily unavailable'); return trustState() } } as unknown as LauncherPreloadBridge, 'can-i-use', () => {}, async () => { assert.fail('retry is not consent') }, () => {})
  await flush(); const retry = nodes.find(node => node.textContent === 'Retry')!; assert.ok(retry); assert.equal(retry.disabled, false)
  retry.dispatchEvent(new Event('click')); await flush()
  assert.equal(reads, 2); assert.ok(nodes.some(node => node.textContent === 'Approve and Open'))
})
