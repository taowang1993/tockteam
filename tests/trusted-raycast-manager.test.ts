import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
// @ts-expect-error Build helper is JavaScript.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'
import { parseTrustedRaycastChildMessage, type TrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'

test('manager child admission fails closed before accepting wrong identity, stale or malformed output', () => {
  const session = { sessionId: 's', generation: 'g', command: 'translate' as const, preferences: {} }
  const ready = { type: 'ready', sessionId: 's', generation: 'g', revision: 0, root: { type: 'root', props: {}, children: [] } }
  assert.equal(parseTrustedRaycastChildMessage(JSON.stringify(ready), session, -1).type, 'ready')
  for (const changed of [{ sessionId: 'foreign' }, { generation: 'old' }, { revision: -1 }, { extra: true }, { type: 'patch', status: 'ready' }]) assert.throws(() => parseTrustedRaycastChildMessage(JSON.stringify({ ...ready, ...changed }), session, -1))
  assert.throws(() => parseTrustedRaycastChildMessage(JSON.stringify(ready), session, 0))
  assert.throws(() => parseTrustedRaycastChildMessage('not-json', session, -1))
  assert.throws(() => parseTrustedRaycastChildMessage('x'.repeat(1024 * 1024 + 1), session, -1), /bound/)
  const patch = { ...ready, type: 'patch', status: 'ready', revision: 1 }
  assert.equal(parseTrustedRaycastChildMessage(JSON.stringify(patch), session, 0).type, 'patch')
  assert.throws(() => parseTrustedRaycastChildMessage(JSON.stringify(patch), session, 1))
})

test('manager has no default artifact fallback and rejects events without a live owner', async () => {
  const manager = new TrustedRaycastManager({ runtimeDir: '/nonexistent/tockteam-runtime', nodePath: process.execPath, onMessage() {} })
  assert.equal(manager.available, false)
  assert.throws(() => manager.send({ webContentsId: 1 }, { sessionId: 'a', generation: 'b', eventId: 'c', revision: 0, kind: 'searchChanged', value: 'hello' }), /stale/)
  await assert.rejects(manager.start({ webContentsId: 1 }, { sessionId: 'a', generation: 'b', command: 'translate', preferences: {} }))
  await manager.close()
})
test('configured unchanged component translates interactive input and revokes owner', { timeout: 30000 }, async t => {
  const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!artifact) return t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR for real Google integration')
  const work = mkdtempSync(join(tmpdir(), 'raycast-manager-test-'))
  const messages: TrustedRaycastViewMessage[] = []
  const errors: string[] = []
  const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, onMessage: (_, message) => messages.push(message), onError: (_, error) => errors.push(error.message) })
  try {
    await buildTrustedRaycast(work, artifact)
    await manager.start({ webContentsId: 1 }, { sessionId: 'test', generation: '1', command: 'translate', preferences: {} })
    assert.equal(messages[0]?.type, 'ready')
    const latest = messages.at(-1)!
    const event = { sessionId: 'test', generation: '1', revision: latest.revision, eventId: latest.root!.props.searchEventId as string, kind: 'searchChanged' as const, value: 'TockTeam compatibility tracer: hello world' }
    assert.throws(() => manager.send({ webContentsId: 2 }, event), /stale/)
    manager.send({ webContentsId: 1 }, event)
    const deadline = Date.now() + 16000
    while (!messages.some(message => /[\u3400-\u9fff]/u.test(JSON.stringify(message))) && Date.now() < deadline && !errors.length) await new Promise(resolve => setTimeout(resolve, 50))
    assert.ok(messages.some(message => /[\u3400-\u9fff]/u.test(JSON.stringify(message))), JSON.stringify(errors))
    await manager.closeOwner({ webContentsId: 2 }); assert.equal(manager.active, true)
    await manager.closeOwner({ webContentsId: 1 }); assert.equal(manager.active, false)
    assert.throws(() => manager.send({ webContentsId: 1 }, event), /stale/)
    const count = messages.length
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(messages.length, count)
  } finally { await manager.close(); rmSync(work, { recursive: true, force: true }) }
})
