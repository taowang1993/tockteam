import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTrustedRaycastSettings } from '../src/trusted-raycast-settings.ts'
import { parseTrustedSettingsUpdate, parseTrustedSettingsSnapshot } from '../src/trusted-raycast-settings-contract.ts'
import { TRUSTED_RAYCAST_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-contract.ts'
import { registerWorkbenchLauncherIpcHandlers } from '../src/launcher-window-ipc.ts'
import { TRUSTED_SETTINGS_CHANNELS } from '../src/trusted-raycast-settings-contract.ts'
import type { TrustedRaycastExtensionId } from '../src/trusted-raycast-descriptors.ts'

test('workbench extension IPC guards before reads, rejects extras and sanitizes failures', async () => {
  const { service } = harness()
  const handlers = new Map<string, (...args: any[]) => unknown>()
  let allowed = true
  const dispose = registerWorkbenchLauncherIpcHandlers({
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: channel => { handlers.delete(channel) } },
    assertTrustedMainIpc: () => { if (!allowed) throw new Error('untrusted') },
    controller: { getState: () => ({ visible: false } as never), show: async () => {} },
    extensionSettings: service,
  })
  const get = handlers.get(TRUSTED_SETTINGS_CHANNELS.get)!
  const update = handlers.get(TRUSTED_SETTINGS_CHANNELS.update)!
  const enable = handlers.get(TRUSTED_SETTINGS_CHANNELS.enable)!
  const current = await get({}, 'google-translate')
  assert.equal((current as { extensionId: string }).extensionId, 'google-translate')
  await assert.rejects(async () => get({}, 'google-translate', 'extra'))
  await assert.rejects(async () => enable({}, 'google-translate', true, 'extra'))
  await assert.rejects(async () => update({}, { extensionId: 'unknown' }))
  allowed = false
  for (const handler of [get, update, enable]) await assert.rejects(async () => handler({}, {}), /untrusted/u)
  dispose()
  assert.equal(handlers.size, 0)
})

function harness() {
  const values: Partial<Record<TrustedRaycastExtensionId, Record<string, string | boolean>>> = {}
  const writes: string[] = []
  const trust = { active: true, candidateAvailable: true, candidateDigest: '', digest: 'a'.repeat(64), digestApproved: true, enabled: false, hasPrevious: false, installed: true, previewed: true, recovery: '' as const, staged: false }
  const service = createTrustedRaycastSettings({ read: id => values[id] ?? {}, write: async (id, next) => { writes.push(id); values[id] = { ...next } }, trust: () => trust, setEnabled: async (_id, enabled) => { trust.enabled = enabled } })
  return { service, values, writes, trust }
}

test('settings reads launch nothing; preferences save with revision fencing independent of enablement', async () => {
  const { service, writes, trust } = harness()
  const initial = service.get('google-translate')
  assert.deepEqual(initial.values, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS)
  assert.deepEqual(writes, [])
  assert.equal((await service.update({ extensionId: initial.extensionId, revision: initial.revision, patch: { lang1: 'zh-CN' } })).ok, true)
  assert.equal(trust.enabled, false)
  assert.equal(service.get('google-translate').values.lang1, 'zh-CN')
  assert.deepEqual(await service.update({ extensionId: initial.extensionId, revision: initial.revision, patch: { lang1: 'en' } }), { ok: false, reason: 'conflict' })
  assert.equal(writes.length, 1)
})

test('parallel writes and stale inline preferences cannot silently overwrite a workbench edit', async () => {
  const { service } = harness()
  const before = service.get('kaomoji-search')
  const [a, b] = await Promise.all([
    service.update({ extensionId: before.extensionId, revision: before.revision, patch: { displayMode: 'grid' } }),
    service.update({ extensionId: before.extensionId, revision: before.revision, patch: { primaryAction: 'copy-to-clipboard' } }),
  ])
  assert.equal(a.ok, true)
  assert.deepEqual(b, { ok: false, reason: 'conflict' })
  await assert.rejects(service.saveFromCommand('kaomoji-search', { ...before.values, primaryAction: 'copy-to-clipboard' }, before.values), /changed/u)
  const current = service.get('kaomoji-search')
  await service.saveFromCommand('kaomoji-search', { ...current.values, primaryAction: 'copy-to-clipboard' }, current.values)
  assert.equal(service.get('kaomoji-search').values.primaryAction, 'copy-to-clipboard')
})

test('credential-bearing or malformed proxies are never echoed; unrelated edits preserve stored override', async () => {
  const { service, values } = harness()
  for (const proxy of ['http://username:password@127.0.0.1:8000', 'not a URL secret']) {
    values['google-translate'] = { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, proxy }
    const current = service.get('google-translate')
    assert.equal(current.proxyRedacted, true)
    assert.equal(current.values.proxy, '')
    assert.ok(!JSON.stringify(current).includes('secret'))
    assert.ok(!JSON.stringify(current).includes('password'))
    assert.equal((await service.update({ extensionId: current.extensionId, revision: current.revision, patch: { lang2: 'fr' } })).ok, true)
    assert.equal(values['google-translate']?.proxy, proxy)
  }
  const current = service.get('google-translate')
  assert.throws(() => parseTrustedSettingsUpdate({ extensionId: current.extensionId, revision: current.revision, patch: { proxy: 'socks5://localhost:9000' } }))
  assert.equal((await service.update({ extensionId: current.extensionId, revision: current.revision, patch: { proxy: '' } })).ok, true)
})

test('Can I Use retains only supported exact targets and never accepts workspace configuration', async () => {
  const { service } = harness()
  for (const patch of [{ defaultQuery: 'defaults' }, { defaultQuery: 'last 2 versions' }, { path: '/tmp/workspace' }, { defaultQuery: 'chrome 9999' }]) {
    const current = service.get('can-i-use')
    const result = await service.update({ extensionId: current.extensionId, revision: current.revision, patch })
    assert.deepEqual(result, { ok: false, reason: 'invalid' })
  }
  const current = service.get('can-i-use')
  assert.equal((await service.update({ extensionId: current.extensionId, revision: current.revision, patch: { defaultQuery: 'firefox 100, chrome 100', briefMode: true } })).ok, true)
  assert.equal(service.get('can-i-use').values.defaultQuery, 'chrome 100,firefox 100')
})

test('settings schemas reject unknown IDs/keys, invalid fields and sensitive snapshot data', () => {
  const { service } = harness()
  const current = service.get('google-translate')
  const base = { extensionId: current.extensionId, revision: current.revision, patch: { lang1: 'fr' } }
  for (const value of [{ ...base, extensionId: '../unknown' }, { ...base, path: '/tmp' }, { ...base, patch: { unknown: true } }, { ...base, patch: { lang1: 'unknown' } }, { ...base, patch: {} }]) assert.throws(() => parseTrustedSettingsUpdate(value))
  assert.deepEqual(parseTrustedSettingsSnapshot(current), current)
  assert.throws(() => parseTrustedSettingsSnapshot({ ...current, values: { ...current.values, proxy: 'http://a:b@localhost' } }))
})

test('enablement uses only the existing trust owner and does not install or approve artifacts', async () => {
  const { service, trust, writes } = harness()
  assert.equal((await service.setEnabled('google-translate', true)).state.enabled, true)
  assert.equal(writes.length, 0)
  trust.installed = false
  await assert.rejects(service.setEnabled('google-translate', true))
})
