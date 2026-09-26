import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
// @ts-expect-error Build helper is JavaScript.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'
import { createTrustedRaycastLineReader, TRUSTED_RAYCAST_INPUT_FRAME_BYTES, isTrustedRaycastViewEvent, KAOMOJI_PREFERENCE_DEFAULTS, parseTrustedRaycastChildMessage, type TrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'

test('child framing admits split and coalesced messages but rejects oversized individual frames', () => {
  const read = createTrustedRaycastLineReader(8)
  assert.deepEqual(read('1234'), [])
  assert.deepEqual(read('5678\nabcdefgh\nxy'), ['12345678', 'abcdefgh'])
  assert.deepEqual(read('z\n'), ['xyz'])
  assert.deepEqual(read('éééé\n'), ['éééé'])
  for (const chunks of [['123456789\n'], ['12345678', '9'], ['ééééé\n']]) {
    const bounded = createTrustedRaycastLineReader(8)
    assert.throws(() => { for (const chunk of chunks) bounded(chunk) }, /bound/)
  }
  const event = { extensionId: 'google-translate', sessionId: '\u0001'.repeat(128), generation: '\u0001'.repeat(128),
    revision: Number.MAX_SAFE_INTEGER, eventId: '\u0001'.repeat(128), kind: 'searchChanged', value: '\u0001'.repeat(16 * 1024) }
  assert.equal(isTrustedRaycastViewEvent(event), true)
  const line = JSON.stringify(event)
  assert.deepEqual(createTrustedRaycastLineReader(TRUSTED_RAYCAST_INPUT_FRAME_BYTES)(`${line}\n${line}\n`), [line, line])
})

test('manager child admission fails closed before accepting wrong identity, stale or malformed output', () => {
  const session = { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate' as const, preferences: {} }
  const ready = { type: 'ready', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 0, root: { type: 'root', props: {}, children: [] } }
  assert.equal(parseTrustedRaycastChildMessage(JSON.stringify(ready), session, -1).type, 'ready')
  for (const changed of [{ extensionId: 'google-translate' as const, sessionId: 'foreign' }, { generation: 'old' }, { revision: -1 }, { extra: true }, { type: 'patch', status: 'ready' }]) assert.throws(() => parseTrustedRaycastChildMessage(JSON.stringify({ ...ready, ...changed }), session, -1))
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
  assert.throws(() => manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'a', generation: 'b', eventId: 'c', revision: 0, kind: 'searchChanged', value: 'hello' }), /stale/)
  await assert.rejects(manager.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'a', generation: 'b', command: 'translate', preferences: {} }))
  await manager.close()
})
test('one global manager forbids preview while any trusted extension child is active', async () => {
  const resolved: string[] = []
  const manager = new TrustedRaycastManager({ runtimeDir: extensionId => { resolved.push(extensionId); return '/missing' }, nodePath: process.execPath, onMessage() {} })
  if (process.platform === 'darwin') manager.availableFor('kaomoji-search')
  assert.ok(process.platform !== 'darwin' || resolved.includes('kaomoji-search'))
  ;(manager as unknown as { session: unknown }).session = { input: { extensionId: 'google-translate' }, revoked: false }
  await assert.rejects(manager.previewRuntime('/missing', 'kaomoji-search'), /busy/)
  ;(manager as unknown as { session: undefined }).session = undefined
  await assert.rejects(manager.previewRuntime('/missing', 'kaomoji-search'), /ENOENT|build\.json/)
  await assert.rejects(manager.previewRuntime('/missing', 'kaomoji-search'), /ENOENT|build\.json/, 'failed setup releases the preview reservation')
  const orphan = mkdtempSync(join(tmpdir(), 'raycast-preview-orphan-'))
  ;(manager as unknown as { preview: unknown }).preview = { child: { exitCode: 0, signalCode: null, pid: undefined }, workspace: orphan, phase: 'cleanup-failed' }
  await assert.rejects(manager.previewRuntime('/missing', 'kaomoji-search'), /ENOENT|build\.json/)
  assert.equal(existsSync(orphan), false, 'the normal preview flow retries retained cleanup before creating another child')
})

test('install-store runtime resolution fails closed before any child can load', async () => {
  const unresolved = new TrustedRaycastManager({ runtimeDir: () => undefined, nodePath: process.execPath, onMessage() {} })
  assert.equal(unresolved.available, false)
  await assert.rejects(unresolved.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'a', generation: 'b', command: 'translate', preferences: {} }), /not installed/)
  await unresolved.close()
  const missing = new TrustedRaycastManager({ runtimeDir: () => '/nonexistent/tockteam-runtime', nodePath: process.execPath, onMessage() {} })
  assert.equal(missing.available, false)
  await assert.rejects(missing.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'a', generation: 'b', command: 'translate', preferences: {} }))
  await missing.close()
})
test('reviewed child accepts maximum escaped search input without closing its session', { timeout: 30000 }, async t => {
  if (process.platform === 'win32') return t.skip('POSIX trusted-child integration is unsupported on Windows')
  const work = mkdtempSync(join(tmpdir(), 'raycast-input-bound-'))
  let pid: number | undefined
  const messages: TrustedRaycastViewMessage[] = []
  const errors: string[] = []
  const manager = new TrustedRaycastManager({
    runtimeDir: join(work, 'trusted-raycast-kaomoji'), nodePath: process.execPath,
    onMessage: (_, message) => { messages.push(message) }, onError: (_, error) => { errors.push(error.message) },
  })
  try {
    await buildTrustedRaycast(work, join(process.cwd(), 'plugins/trusted-raycast/vendor/kaomoji-search.tar'), 'kaomoji-search')
    await manager.start({ webContentsId: 1 }, { extensionId: 'kaomoji-search', sessionId: 'input', generation: '1', command: 'index', preferences: KAOMOJI_PREFERENCE_DEFAULTS })
    pid = (manager as unknown as { session: { child: { pid: number } } }).session.child.pid
    assert.ok(pid > 0)
    const latest = messages.findLast(message => message.root)!
    manager.send({ webContentsId: 1 }, { extensionId: 'kaomoji-search', sessionId: 'input', generation: '1', revision: latest.revision,
      eventId: String(latest.root!.props.searchEventId), kind: 'searchChanged', value: '\u0001'.repeat(16 * 1024) })
    const deadline = Date.now() + 5000
    while (!messages.some(message => message.root?.props.querySequence === 1) && manager.active && errors.length === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.deepEqual(errors, [])
    assert.equal(manager.active, true)
    assert.ok(messages.some(message => message.root?.props.querySequence === 1), 'the admitted search must reach the source child')
  } finally {
    await manager.close()
    if (pid) for (const processId of [pid, -pid]) assert.throws(() => process.kill(processId, 0), { code: 'ESRCH' })
    rmSync(work, { recursive: true, force: true })
  }
})

test('configured unchanged component translates interactive input and revokes owner', { timeout: 30000 }, async t => {
  if (process.platform === 'win32') return t.skip('POSIX trusted-child integration is unsupported on Windows')
  const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!artifact) return t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR for real Google integration')
  const work = mkdtempSync(join(tmpdir(), 'raycast-manager-test-'))
  const messages: TrustedRaycastViewMessage[] = []
  const errors: string[] = []
  const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, onMessage: (_, message) => messages.push(message), onError: (_, error) => errors.push(error.message) })
  try {
    await buildTrustedRaycast(work, artifact)
    await manager.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'test', generation: '1', command: 'translate', preferences: {} })
    assert.equal(messages[0]?.type, 'ready')
    const latest = messages.at(-1)!
    const event = { extensionId: 'google-translate' as const, sessionId: 'test', generation: '1', revision: latest.revision, eventId: latest.root!.props.searchEventId as string, kind: 'searchChanged' as const, value: 'TockTeam compatibility tracer: hello world' }
    assert.throws(() => manager.send({ webContentsId: 2 }, event), /stale/)
    manager.send({ webContentsId: 1 }, event)
    const deadline = Date.now() + 16000
    while (!messages.some(message => /[\u3400-\u9fff]/u.test(JSON.stringify(message))) && Date.now() < deadline && !errors.length) await new Promise(resolve => setTimeout(resolve, 50))
    assert.ok(messages.some(message => /[\u3400-\u9fff]/u.test(JSON.stringify(message))), JSON.stringify(errors))
    const visit = (node: import('../src/trusted-raycast-contract.ts').TrustedRaycastViewNode): import('../src/trusted-raycast-contract.ts').TrustedRaycastViewNode[] => [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : visit(child))]
    const wait = async (predicate: () => boolean) => { const until = Date.now() + 4000; while (!predicate() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20)); assert.ok(predicate(), JSON.stringify(errors)) }
    const act = (title: string) => {
      const latest = messages.findLast(message => message.root)!
      const action = visit(latest.root!).find(node => node.type === 'raycast-action' && node.props.title === title)!
      assert.ok(action?.props.actionEventId, title)
      const eventId = String(action.props.actionEventId)
      manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'test', generation: '1', revision: latest.revision, eventId, kind: 'action' })
      return eventId
    }
    const copyId = act('Copy Translation')
    await wait(() => messages.some(message => message.type === 'outcome' && message.eventId === copyId))
    assert.equal(messages.find(message => message.type === 'outcome' && message.eventId === copyId)?.succeeded, false, 'native unavailability must not claim Copy success')
    assert.equal(manager.active, true, 'ordinary native denial is recoverable')
    const detailId = act('Toggle Full Text')
    await wait(() => messages.some(message => message.type === 'outcome' && message.eventId === detailId))
    await wait(() => visit(messages.findLast(message => message.root)!.root!).some(node => node.type === 'raycast-list' && node.props.isShowingDetail === true))
    const browserId = act('Open in Google Translate')
    await wait(() => messages.some(message => message.type === 'outcome' && message.eventId === browserId))
    assert.match(messages.find(message => message.type === 'outcome' && message.eventId === browserId)?.message ?? '', /unavailable/)
    assert.equal(manager.active, true)
    await manager.closeOwner({ webContentsId: 2 }); assert.equal(manager.active, true)
    await manager.closeOwner({ webContentsId: 1 }); assert.equal(manager.active, false)
    assert.throws(() => manager.send({ webContentsId: 1 }, event), /stale/)
    const count = messages.length
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(messages.length, count)
  } finally { await manager.close(); rmSync(work, { recursive: true, force: true }) }
})

test('configured isolated preview boots the staged runtime to first readiness and tears down cleanly', { timeout: 40000 }, async t => {
  if (process.platform === 'win32') return t.skip('POSIX trusted-child integration is unsupported on Windows')
  const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!artifact) return t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR for the real preview boot')
  const work = mkdtempSync(join(tmpdir(), 'raycast-preview-test-'))
  const manager = new TrustedRaycastManager({ runtimeDir: () => join(work, 'trusted-raycast'), nodePath: process.execPath, onMessage() {} })
  try {
    await buildTrustedRaycast(work, artifact)
    assert.equal(manager.available, true)
    assert.equal(await manager.previewRuntime(join(work, 'trusted-raycast')), '')
    assert.equal(manager.active, false, 'preview owns its child and never publishes a live session')
  } finally {
    await manager.close()
    rmSync(work, { recursive: true, force: true })
  }
})
