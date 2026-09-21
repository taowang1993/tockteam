import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apply, inject } from '../plugins/trusted-raycast/src/index.ts'
import { trustedRaycastAssetUrl, trustedRaycastCatalog } from '../src/trusted-raycast-catalog.ts'
import { BUNDLED_DESKTOP_HOST_PLUGINS, BUNDLED_DESKTOP_CLIENT_PLUGINS } from '../src/profile.ts'
import { DesktopTrustedRaycastChannel } from '../src/trusted-raycast-channel.ts'
import { scrubDesktopAuthorityEnvironment } from '../src/desktop-runtime-environment.ts'

test('catalog separates runnable commands from safe setup and gates discovery on activation', () => {
  const approved = { digest: 'a'.repeat(64), digestApproved: true }
  for (const [active, trust] of [[false, { ...approved, installed: false, enabled: false }], [false, { ...approved, installed: true, enabled: true }]] as const) assert.deepEqual(trustedRaycastCatalog(active, trust), [])
  for (const trust of [{ ...approved, installed: false, enabled: false }, { ...approved, installed: true, enabled: false }, { ...approved, installed: false, enabled: true }, { digest: 'b'.repeat(64), digestApproved: false, installed: true, enabled: true }]) {
    const items = trustedRaycastCatalog(true, trust)
    assert.equal(items.some(item => item.defaultAction.handlerKey === 'trusted-raycast-translate'), false)
    assert.equal(items.at(-1)!.id, 'trusted-raycast:trust')
    if (trust.installed) assert.equal(items[0]!.id, 'trusted-raycast:setup:google-translate')
  }
  const [item, trustItem] = trustedRaycastCatalog(true, { ...approved, installed: true, enabled: true })
  assert.equal(item!.defaultAction.hideWindowAfterInvocation, false)
  assert.equal(item!.imageKey, 'trusted-raycast-google-translate')
  assert.equal(item!.id.startsWith('tockteam-route:'), false)
  assert.equal(trustItem!.id, 'trusted-raycast:trust')
  assert.equal(trustItem!.imageKey, 'ueli-command')
  const [translate, kaomoji, manage] = trustedRaycastCatalog(true, { ...approved, installed: true, enabled: true }, { ...approved, installed: true, enabled: true })
  assert.deepEqual([translate!.name, kaomoji!.name], ['Google Translate', 'Kaomoji Search'])
  assert.equal(translate!.id, 'trusted-raycast:google-translate:translate')
  assert.equal(kaomoji!.id, 'trusted-raycast:kaomoji-search:index')
  assert.equal(kaomoji!.imageKey, 'trusted-raycast-kaomoji-search')
  assert.equal(kaomoji!.defaultAction.handlerKey, 'trusted-raycast-kaomoji')
  assert.equal(trustedRaycastAssetUrl(kaomoji!.imageKey), './trusted-raycast-kaomoji/kaomoji-search.png')
  assert.equal(manage!.id, 'trusted-raycast:trust')
  assert.equal(trustedRaycastCatalog(true, { ...approved, installed: false, enabled: false }, { ...approved, installed: true, enabled: true })[0]!.id, 'trusted-raycast:kaomoji-search:index')
})
test('catalog keeps an approved command in setup when runtime availability is false', () => {
  const approved = { digest: 'a'.repeat(64), digestApproved: true, enabled: true, installed: true }
  const unavailable = { 'google-translate': false, 'kaomoji-search': true, 'can-i-use': true } as const
  const [item] = trustedRaycastCatalog(true, approved, undefined, undefined, unavailable)
  assert.equal(item!.id, 'trusted-raycast:setup:google-translate')
  assert.equal(item!.defaultAction.handlerKey, 'trusted-raycast-trust')
  assert.equal(item!.defaultAction.argument, 'google-translate')
})

test('Can I Use runtime action requires its own approved installation and fixed command image', () => {
  const approved = { digest: 'c'.repeat(64), digestApproved: true, enabled: true, installed: true }
  const absent = { ...approved, enabled: false, installed: false }
  for (const trust of [absent, { ...approved, digestApproved: false }, { ...approved, digest: '' }]) {
    assert.deepEqual(trustedRaycastCatalog(true, absent, absent, trust).map(row => row.id), [...(trust.installed ? ['trusted-raycast:setup:can-i-use'] : []), 'trusted-raycast:trust'])
  }
  assert.deepEqual(trustedRaycastCatalog(false, approved, approved, approved), [])
  const [row] = trustedRaycastCatalog(true, absent, absent, approved)
  assert.equal(row!.id, 'trusted-raycast:can-i-use:index')
  assert.equal(row!.defaultAction.handlerKey, 'trusted-raycast-can-i-use')
  assert.equal(row!.defaultAction.hideWindowAfterInvocation, false)
  assert.equal(trustedRaycastAssetUrl(row!.imageKey), './trusted-raycast-can-i-use/can-i-use.png')
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
