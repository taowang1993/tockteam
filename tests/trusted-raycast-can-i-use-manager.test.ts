import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
// @ts-expect-error First-party candidate assembler.
import { assembleTrustedRaycastCanIUseArtifact } from '../scripts/trusted-raycast-can-i-use-artifact.mjs'
// @ts-expect-error First-party build helper.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { loadTrustedRaycastCanIUseData } from '../src/trusted-raycast-can-i-use-runtime.ts'
import { TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-can-i-use-preferences.ts'
import { getTrustedRaycastDescriptor, getTrustedRaycastRuntimeDescriptor } from '../src/trusted-raycast-descriptors.ts'
import { inspectTrustedRaycastProjection, isTrustedRaycastTrustRequest, isTrustedRaycastNativeRequest, type TrustedRaycastViewMessage, type TrustedRaycastViewNode } from '../src/trusted-raycast-contract.ts'

const preferences = { ...TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, defaultQuery: 'chrome 100' }
const owner = { webContentsId: 7801 }
const nodes = (root: TrustedRaycastViewNode, type: string): TrustedRaycastViewNode[] => [
  ...(root.type === type ? [root] : []), ...root.children.flatMap(child => typeof child === 'string' ? [] : nodes(child, type)),
]

test('the internal Can I Use candidate does not admit public trust or native requests', () => {
  assert.equal(getTrustedRaycastRuntimeDescriptor('can-i-use')!.extensionId, 'can-i-use')
  assert.equal(getTrustedRaycastDescriptor('can-i-use'), undefined)
  for (const action of ['prepare', 'approve', 'cancel', 'disable']) assert.equal(isTrustedRaycastTrustRequest({ extensionId: 'can-i-use', action }), false)
  assert.equal(isTrustedRaycastNativeRequest({ type: 'nativeRequest', extensionId: 'can-i-use', sessionId: 's', generation: 'g', requestId: 'request', kind: 'openBrowser', payload: 'https://caniuse.com/css-grid' }), false)
})

// Candidate creation currently uses macOS BSD tar; this is not a cross-platform packaging gate.
test('real manager searches all Can I Use features and rejects foreign or stale requests', { timeout: 30000, skip: process.platform !== 'darwin' }, async t => {
  const work = mkdtempSync(join(tmpdir(), 'can-i-use-manager-'))
  const messages: TrustedRaycastViewMessage[] = []
  const errors: string[] = []
  const pids: number[] = []
  const opened: string[] = []
  const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast-can-i-use'), nodePath: process.execPath,
    onMessage: (_owner, message) => messages.push(message), onError: (_owner, error) => errors.push(error.message),
    openCanIUse: async url => { opened.push(url); if (opened.length === 2) throw new Error('Browser opening failed') } })
  try {
    const artifact = join(work, 'candidate.tar')
    assert.equal(assembleTrustedRaycastCanIUseArtifact(artifact).sha256, '0e23b06703ad85e91f9c6793c5de689204e9fe3bdb0fed3106a1324406bf3858')
    await buildTrustedRaycast(work, artifact, 'can-i-use')
    await manager.previewRuntime(join(work, 'trusted-raycast-can-i-use'), 'can-i-use')
    assert.equal(manager.active, false)
    await manager.start(owner, { extensionId: 'can-i-use', command: 'index', sessionId: 'can-i-use-manager', generation: 'g1', preferences })
    const pid = (manager as unknown as { session: { child: { pid: number } } }).session.child.pid
    pids.push(pid)
    const initial = messages.at(-1)!
    assert.equal(initial.root!.props.visibleCount, 64)
    assert.equal(initial.root!.props.matchCount, 581)
    assert.equal(initial.root!.props.totalCount, 581)
    assert.equal(inspectTrustedRaycastProjection(initial.root).itemNodes, 64)
    const data = loadTrustedRaycastCanIUseData(resolve('plugins/trusted-raycast/vendor'))
    const feature = data.catalog.entries[500]!
    assert.equal(JSON.stringify(initial.root).includes(feature.title), false)
    const search = { extensionId: 'can-i-use' as const, sessionId: initial.sessionId, generation: initial.generation,
      revision: initial.revision, eventId: String(initial.root!.props.searchEventId), kind: 'searchChanged' as const, value: feature.slug }
    assert.throws(() => manager.send({ webContentsId: owner.webContentsId + 1 }, search), /stale/)
    assert.throws(() => manager.send(owner, { ...search, generation: 'foreign' }), /stale/)
    manager.send(owner, search)
    assert.throws(() => manager.send(owner, search), /stale/, 'in-flight search handles must be consumed')
    const waitFor = async (count: number) => {
      const until = Date.now() + 5000
      while (messages.length < count && errors.length === 0 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10))
      assert.deepEqual(errors, [])
      assert.ok(messages.length >= count)
      return messages.at(-1)!
    }
    const found = await waitFor(2)
    assert.ok(JSON.stringify(found.root).includes(feature.title))
    assert.ok(inspectTrustedRaycastProjection(found.root).itemNodes <= 64)
    assert.equal(found.root!.props.queryCurrent, true)
    assert.throws(() => manager.send(owner, search), /stale/)
    const details = nodes(found.root!, 'raycast-action')[0]!
    assert.equal(details.props.title, 'Show Details')
    assert.equal(details.props.unavailable, false)
    assert.equal(typeof details.props.actionEventId, 'string')
    const open = { extensionId: 'can-i-use' as const, sessionId: found.sessionId, generation: found.generation,
      revision: found.revision, eventId: String(details.props.actionEventId), kind: 'action' as const }
    assert.throws(() => manager.send({ webContentsId: owner.webContentsId + 1 }, open), /stale/)
    assert.throws(() => manager.send(owner, { ...open, eventId: 'forged' }), /stale/)
    manager.send(owner, open)
    assert.throws(() => manager.send(owner, open), /stale/)
    const detail = await waitFor(3)
    assert.equal(detail.root!.props.navigationDepth, 1)
    assert.equal(inspectTrustedRaycastProjection(detail.root).itemNodes, 14)
    assert.equal(nodes(detail.root!, 'raycast-list')[0]!.props.navigationTitle, feature.title)
    assert.ok(nodes(detail.root!, 'raycast-list-item').some(row => row.props.title === 'Chrome'))
    assert.equal(nodes(detail.root!, 'raycast-action').some(action => action.props.title === 'Show Details'), false)
    assert.throws(() => manager.send(owner, { ...open, revision: detail.revision }), /stale/)
    const browser = nodes(detail.root!, 'raycast-action')[0]!
    assert.equal(browser.props.title, 'Open in Browser')
    assert.equal(browser.props.unavailable, false)
    const browse = { ...open, revision: detail.revision, eventId: String(browser.props.actionEventId) }
    assert.throws(() => manager.send(owner, { ...browse, value: 'https://evil.test' }), /stale/)
    assert.throws(() => manager.send({ webContentsId: owner.webContentsId + 1 }, browse), /stale/)
    manager.send(owner, browse)
    assert.throws(() => manager.send(owner, browse), /busy/)
    const outcome = await waitFor(4)
    assert.equal(outcome.type, 'outcome')
    assert.equal(outcome.succeeded, true)
    assert.deepEqual(opened, [`https://caniuse.com/${feature.slug}`])
    const back = { ...open, kind: 'navigation' as const, revision: detail.revision, eventId: String(detail.root!.props.navigationEventId), value: 'can-i-use:pop' }
    assert.throws(() => manager.send(owner, { ...back, eventId: 'forged' }), /stale/)
    manager.send(owner, back)
    assert.throws(() => manager.send(owner, back), /stale/)
    const returned = await waitFor(5)
    assert.equal(returned.root!.props.navigationDepth, 0)
    assert.equal(returned.root!.props.matchCount, 1, 'Back must preserve the root search')
    assert.ok(JSON.stringify(returned.root).includes(feature.title))
    assert.throws(() => manager.send(owner, open), /stale/)
    assert.throws(() => manager.send(owner, { ...browse, revision: returned.revision }), /stale/)
    assert.deepEqual(opened, [`https://caniuse.com/${feature.slug}`])
    const rootBrowser = nodes(returned.root!, 'raycast-action')[1]!
    manager.send(owner, { ...open, revision: returned.revision, eventId: String(rootBrowser.props.actionEventId) })
    const failedOpen = await waitFor(6)
    assert.equal(failedOpen.type, 'outcome')
    assert.equal(failedOpen.succeeded, false)
    assert.equal(manager.active, true, 'an unavailable browser must not destroy the searchable view')
    assert.deepEqual(opened, Array(2).fill(`https://caniuse.com/${feature.slug}`))
    manager.send(owner, { ...search, revision: returned.revision, eventId: String(returned.root!.props.searchEventId), value: 'zzzz-no-match' })
    const empty = await waitFor(7)
    assert.equal(empty.root!.props.visibleCount, 0)
    assert.equal(empty.root!.props.matchCount, 0)
    assert.equal(inspectTrustedRaycastProjection(empty.root).itemNodes, 0)
    const changedPreferences = { ...preferences, briefMode: true, showReleaseDate: false }
    await assert.rejects(manager.restartCanIUse({ webContentsId: owner.webContentsId + 1 }, changedPreferences), /stale/)
    await manager.restartCanIUse(owner, changedPreferences)
    const replaced = messages.at(-1)!
    assert.equal(replaced.type, 'ready')
    assert.notEqual(replaced.generation, initial.generation)
    assert.notEqual(replaced.sessionId, initial.sessionId)
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    pids.push((manager as unknown as { session: { child: { pid: number } } }).session.child.pid)
    for (const row of nodes(replaced.root!, 'raycast-list-item')) {
      const accessory = JSON.parse(String(row.props.accessories))[0]
      assert.match(accessory.text, /^(LS|REC|PR|CR|WD|OTHER|UNOFF)$/, 'fresh import must use the new brief-mode preference')
    }
    assert.throws(() => manager.send(owner, browse), /stale/)
    // The same Host replacement seam supports theme changes without accepting child authority.
    await manager.restartCanIUse(owner)
    const themed = messages.at(-1)!
    assert.notEqual(themed.generation, replaced.generation)
    pids.push((manager as unknown as { session: { child: { pid: number } } }).session.child.pid)
    const interrupted = manager.restartCanIUse(owner)
    const closed = manager.closeOwner(owner)
    await assert.rejects(interrupted, /cancelled/)
    await closed
    assert.equal(manager.active, false)
    assert.throws(() => manager.send(owner, search), /stale/)
    for (const bad of [TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, { ...preferences, defaultQuery: 'last 2 versions' }, { ...preferences, path: '.' }]) {
      await assert.rejects(manager.start(owner, { extensionId: 'can-i-use', command: 'index', sessionId: 'invalid', generation: 'bad', preferences: bad }), /DATA_UNAVAILABLE|QUERY_UNSUPPORTED|WORKSPACE_UNAVAILABLE/)
      assert.equal(manager.active, false)
    }
  } finally {
    await manager.close()
    for (const pid of pids) {
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
      assert.throws(() => process.kill(-pid, 0), { code: 'ESRCH' })
      t.diagnostic(JSON.stringify({ pid, processGroupGone: true }))
    }
    rmSync(work, { recursive: true, force: true })
  }
})
