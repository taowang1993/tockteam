import test from 'node:test'
import assert from 'node:assert/strict'
import { DesktopTrustedRaycastChannel } from '../src/trusted-raycast-channel.ts'
import { activateTrustedRaycast } from '../src/trusted-raycast-provider.ts'

test('only authenticated live Host activation exposes capability and disconnect revokes it', async () => {
  const states: boolean[] = []
  const channel = new DesktopTrustedRaycastChannel(async active => { states.push(active) })
  const env = await channel.start()
  try {
    const denied = await fetch(env.endpoint, { method: 'POST', body: '{}' })
    assert.equal(denied.status, 401); assert.equal(channel.active, false)
    const invalid = await fetch(env.endpoint, { method: 'POST', headers: { authorization: `Bearer ${env.token}` }, body: '{"extra":1}' })
    assert.equal(invalid.status, 413)
    const host = activateTrustedRaycast(env)
    await host.ready
    assert.equal(channel.active, true)
    await host.dispose()
    for (let i = 0; i < 100 && channel.active; i++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(channel.active, false)
    assert.deepEqual(states, [true, false])
    const second = activateTrustedRaycast(env)
    await second.ready
    await channel.stop()
    await second.dispose()
    assert.equal(channel.active, false)
  } finally { await channel.stop() }
})

test('Host activation remains live beyond fetch body timeout and disposal revokes it', { timeout: 330000, skip: !process.env.TRUSTED_RAYCAST_IDLE_TEST_MS }, async () => {
  const channel = new DesktopTrustedRaycastChannel(async () => {})
  const host = activateTrustedRaycast(await channel.start())
  try {
    await host.ready
    await new Promise(resolve => setTimeout(resolve, Math.max(305000, Number(process.env.TRUSTED_RAYCAST_IDLE_TEST_MS))))
    assert.equal(channel.active, true, 'idle transport must retain capability')
  } finally { await host.dispose(); await channel.stop() }
})


test('activation uses lifetime-owned HTTP rather than global fetch and awaits disposal', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('fetch transport must not own activation') })
  const channel = new DesktopTrustedRaycastChannel(async () => {})
  const host = activateTrustedRaycast(await channel.start())
  try { await host.ready; assert.equal(channel.active, true) }
  finally { await host.dispose(); await channel.stop() }
  assert.equal(channel.active, false)
})
