import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apply, inject } from '../plugins/trusted-raycast/src/index.ts'
import { trustedRaycastCatalog } from '../src/trusted-raycast-catalog.ts'
import { BUNDLED_DESKTOP_HOST_PLUGINS, BUNDLED_DESKTOP_CLIENT_PLUGINS } from '../src/profile.ts'
import { DesktopTrustedRaycastChannel } from '../src/trusted-raycast-channel.ts'
import { scrubDesktopAuthorityEnvironment } from '../src/desktop-runtime-environment.ts'

test('catalog requires both live Host capability and admitted artifact and never hides on invoke', () => {
  for (const [active, admitted] of [[false, false], [false, true], [true, false]]) assert.deepEqual(trustedRaycastCatalog(active!, admitted!), [])
  const item = trustedRaycastCatalog(true, true)[0]!
  assert.equal(item.defaultAction.hideWindowAfterInvocation, false)
  assert.equal(item.id.startsWith('tockteam-route:'), false)
})
test('Desktop Host effect alone owns activation and disposal', async () => {
  const channel = new DesktopTrustedRaycastChannel(async () => {})
  const env = await channel.start()
  const old = { ...process.env }
  let dispose: (() => Promise<void>) | undefined
  try {
    process.env.DSH_DESKTOP_TRUSTED_RAYCAST_ENDPOINT = env.endpoint
    process.env.DSH_DESKTOP_TRUSTED_RAYCAST_TOKEN = env.token
    const context = (kind: string) => ({ get: () => ({ kind }), effect: (effect: () => (() => Promise<void>)) => { dispose = effect() } })
    apply(context('web')); apply(context('tui')); assert.equal(dispose, undefined)
    apply(context('desktop'))
    for (let i = 0; i < 100 && !channel.active; i++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(channel.active, true)
    await dispose!()
    for (let i = 0; i < 100 && channel.active; i++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(channel.active, false)
    assert.deepEqual(inject, ['tockTeamSurface'])
    assert.ok(BUNDLED_DESKTOP_HOST_PLUGINS.includes('@tockteam/trusted-raycast'))
    assert.equal((BUNDLED_DESKTOP_CLIENT_PLUGINS as readonly string[]).includes('@tockteam/trusted-raycast'), false)
    const environment = { DSH_DESKTOP_TRUSTED_RAYCAST_ENDPOINT: env.endpoint, DSH_DESKTOP_TRUSTED_RAYCAST_TOKEN: env.token }
    scrubDesktopAuthorityEnvironment(environment)
    assert.deepEqual(environment, {})
    for (const file of ['web/cordis.patch.yml', 'plugins/tui/cordis.patch.yml']) assert.doesNotMatch(readFileSync(file, 'utf8'), /trusted-raycast/)
  } finally { await dispose?.(); await channel.stop(); process.env = old }
})
