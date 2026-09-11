import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { trustedRaycastCatalog, TRUSTED_RAYCAST_TRUST_HANDLER, TRUSTED_RAYCAST_CAN_I_USE_HANDLER } from '../src/trusted-raycast-catalog.ts'

const cold = { digest: '', digestApproved: false, enabled: false, installed: false, candidateAvailable: true }
test('bundled extensions bootstrap before launcher discovery', async () => {
  const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
  assert.match(main, /\[\['Translate', trustedRaycastTrust\], \['Kaomoji', trustedRaycastKaomojiTrust\], \['Can I Use', trustedRaycastCanIUseTrust\]\]/u)
  assert.match(main, /store\?\.installBundledDefault\(\)/u)
})
test('cold Can I Use is discoverable through setup, never through the runtime handler', () => {
  const command = trustedRaycastCatalog(true, cold, undefined, cold).find(item => item.name === 'Can I Use')
  assert.ok(command)
  assert.equal(command.defaultAction.handlerKey, TRUSTED_RAYCAST_TRUST_HANDLER)
  assert.equal(command.defaultAction.argument, 'can-i-use')
  assert.deepEqual(trustedRaycastCatalog(false, cold, undefined, cold), [])
  assert.equal(trustedRaycastCatalog(true, cold).some(item => item.name === 'Can I Use'), false)
  assert.equal(trustedRaycastCatalog(true, cold, undefined, { ...cold, candidateAvailable: false }).some(item => item.name === 'Can I Use'), false)
})
test('warm Can I Use opens directly; disabled commands retain explicit setup', () => {
  const installed = { ...cold, digest: 'd'.repeat(64), digestApproved: true, installed: true, enabled: true }
  assert.equal(trustedRaycastCatalog(true, cold, undefined, installed).find(item => item.name === 'Can I Use')?.defaultAction.handlerKey, TRUSTED_RAYCAST_CAN_I_USE_HANDLER)
  assert.equal(trustedRaycastCatalog(true, cold, undefined, { ...installed, enabled: false }).find(item => item.name === 'Can I Use')?.defaultAction.handlerKey, TRUSTED_RAYCAST_TRUST_HANDLER)
})

import { createTrustedRaycastFirstUse } from '../src/trusted-raycast-first-use.ts'
import { createTrustedRaycastMutex } from '../src/trusted-raycast-mutex.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'
const extensionId = 'can-i-use' as const
const digest = trustedRaycastDescriptors[extensionId].artifactSha256
function orchestration() {
  const calls: string[] = []
  let state = { ...cold, candidateDigest: digest, digest: '', hasPrevious: false, previewed: false, recovery: '' as import('../src/trusted-raycast-contract.ts').TrustedRaycastTrustRecovery, staged: false }
  let preview = async () => {}
  let apply = () => {}
  let live = true
  let launch = async (check: () => void) => { check(); calls.push('launch') }
  const store = {
    status: () => state,
    stage: () => { calls.push('stage'); state = { ...state, staged: true }; return state },
    preview: async () => { calls.push('preview'); await preview(); state = { ...state, previewed: true }; return state },
    apply: () => { calls.push('apply'); apply(); state = { ...state, installed: true, digestApproved: true, digest }; return state },
    enable: () => { calls.push('enable'); state = { ...state, enabled: true }; return state },
  }
  const flow = createTrustedRaycastFirstUse({ mutex: createTrustedRaycastMutex(), active: () => live, store: () => store,
    rescan: async () => { calls.push('rescan') }, launch: async (_owner, _extension, check) => { await launch(check) } })
  flow.begin(1, extensionId)
  const run = (mode: 'approve' | 'enable' = 'approve', approvedDigest = digest) => flow.run(1, { extensionId, mode, digest: approvedDigest })
  return { flow, run, calls, launch: (fn: typeof launch) => { launch = fn }, state: () => state, set: (value: Partial<typeof state>) => { state = { ...state, ...value } }, preview: (fn: () => Promise<void>) => { preview = fn }, apply: (fn: () => void) => { apply = fn }, revoke: () => { live = false } }
}
test('Host serializes exact consent through stage/preview/apply/enable/rescan/fresh launch', async () => {
  const h = orchestration(); await h.run()
  assert.deepEqual(h.calls, ['stage', 'preview', 'apply', 'enable', 'rescan', 'launch'])
  await assert.rejects(h.run(), /consumed/)
  const disabled = orchestration(); disabled.set({ installed: true, digestApproved: true, digest })
  await assert.rejects(disabled.run(), /Enable and Open/)
  await disabled.run('enable'); assert.deepEqual(disabled.calls, ['enable', 'rescan', 'launch'])
})
test('candidate mismatch and recovery cannot mutate; failed preview/apply are retryable', async () => {
  const recovery = orchestration(); recovery.set({ recovery: 'invalid-install' }); await assert.rejects(recovery.run(), /Recover/); assert.deepEqual(recovery.calls, [])
  const wrong = orchestration(); await assert.rejects(wrong.run('approve', 'f'.repeat(64)), /candidate/); assert.deepEqual(wrong.calls, [])
  for (const phase of ['preview', 'apply'] as const) {
    const h = orchestration(); h[phase](() => { throw new Error(`${phase} failed`) })
    await assert.rejects(h.run(), new RegExp(`${phase} failed`)); assert.equal(h.state().enabled, false); assert.ok(!h.calls.includes('launch'))
    if (phase === 'preview') h.preview(async () => {}); else h.apply(() => {})
    await h.run(); assert.equal(h.calls.at(-1), 'launch')
  }
})
test('duplicate, Escape, owner loss, capability loss and interleaved management fence further steps', async () => {
  for (const reason of ['escape', 'owner', 'capability', 'management'] as const) {
    const h = orchestration(); let release!: () => void
    h.preview(() => new Promise<void>(resolve => { release = resolve }))
    const pending = h.run(); await new Promise(resolve => setImmediate(resolve))
    await assert.rejects(h.run(), /busy/)
    if (reason === 'capability') h.revoke()
    else if (reason === 'management') h.flow.invalidate(extensionId)
    else h.flow.cancel(1)
    release(); await assert.rejects(pending, /canceled/)
    assert.deepEqual(h.calls, ['stage', 'preview'])
  }
})

test('atomic apply may finish after cancel, but enable and launch do not follow', async () => {
  const h = orchestration(); h.apply(() => h.flow.cancel(1))
  await assert.rejects(h.run(), /canceled/)
  assert.equal(h.state().installed, true)
  assert.equal(h.state().enabled, false)
  assert.deepEqual(h.calls, ['stage', 'preview', 'apply'])
})
test('superseding commands and wrong owners cannot continue an earlier approval', async () => {
  const h = orchestration()
  await assert.rejects(h.flow.run(2, { extensionId, digest, mode: 'approve' }), /review/)
  const oldLaunch = h.flow.captureLaunch(1, extensionId)
  h.flow.begin(1, 'kaomoji-search')
  assert.throws(oldLaunch, /canceled/)
  await assert.rejects(h.run(), /review/)
  assert.deepEqual(h.calls, [])
})

import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { LauncherActionStore } from '../src/launcher-actions.ts'
// @ts-expect-error First-party pinned candidate build helper.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'
// @ts-expect-error First-party pinned candidate assembler.
import { assembleTrustedRaycastCanIUseArtifact } from '../scripts/trusted-raycast-can-i-use-artifact.mjs'

test('real pinned store and action publication reach required preferences from an uninstalled command', { skip: process.platform !== 'darwin', timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'first-use-store-'))
  const owner = { role: 'launcher' as const, webContentsId: 71 }
  const messages: import('../src/trusted-raycast-contract.ts').TrustedRaycastViewMessage[] = []
  let store: TrustedRaycastTrustStore
  const manager = new TrustedRaycastManager({ runtimeDir: () => store.runtimeDir() ?? '', nodePath: process.execPath, onMessage: (_owner, message) => { messages.push(message) } })
  let flow: ReturnType<typeof createTrustedRaycastFirstUse>
  const mutex = createTrustedRaycastMutex()
  const actions = new LauncherActionStore({ execute: async record => {
    if (record.handlerKey === TRUSTED_RAYCAST_TRUST_HANDLER) { flow.begin(owner.webContentsId, extensionId); return }
    const check = flow.captureLaunch(owner.webContentsId, extensionId)
    await mutex(async () => {
      check(); assert.equal(store.status().enabled && store.status().digestApproved, true)
      try {
        await manager.start(owner, { extensionId, command: 'index', sessionId: 'first-use', generation: 'first-use-generation', preferences: {} }, '', check)
        check()
      } catch (error) { await manager.closeOwner(owner); throw error }
    })
  } })
  try {
    const artifact = join(root, 'candidate.tar'); assembleTrustedRaycastCanIUseArtifact(artifact)
    await buildTrustedRaycast(root, artifact, extensionId)
    store = new TrustedRaycastTrustStore({ descriptor: trustedRaycastDescriptors[extensionId], candidateDir: join(root, 'trusted-raycast-can-i-use'), installRoot: join(root, 'install'), stateFile: join(root, 'trust.json'), preview: staged => manager.previewRuntime(staged, extensionId) })
    const catalog = () => trustedRaycastCatalog(true, cold, undefined, store.status()).filter(item => item.name === 'Can I Use')
    flow = createTrustedRaycastFirstUse({ mutex, active: () => true, store: () => store, rescan: async () => { actions.clear() }, launch: async (_owner, _extension, check) => {
      check(); const item = catalog().find(item => item.defaultAction.handlerKey === TRUSTED_RAYCAST_CAN_I_USE_HANDLER)!
      const fresh = actions.publish({ owner, items: [item] }).items[0]!
      await actions.invoke({ owner, actionId: fresh.defaultAction.actionId })
    } })
    const setup = actions.publish({ owner, items: catalog() }).items[0]!
    await actions.invoke({ owner, actionId: setup.defaultAction.actionId })
    assert.equal(existsSync(join(root, 'trust.json')), false, 'discovery and review cannot install or enable')
    await flow.run(owner.webContentsId, { extensionId, digest, mode: 'approve' })
    assert.equal(store.status().installed && store.status().enabled, true)
    assert.equal(messages.at(-1)?.root?.props.preferenceSetup, true)
    assert.equal((manager as unknown as { session?: unknown }).session, undefined, 'source stays unloaded until required preferences')
    await assert.rejects(actions.invoke({ owner, actionId: setup.defaultAction.actionId }), /consumed/)
    await manager.closeOwner(owner)
    const count = messages.length
    await assert.rejects(manager.start(owner, { extensionId, command: 'index', sessionId: 'revoked-setup', generation: 'revoked-setup', preferences: {} }, '', () => { throw new Error('Extension opening canceled') }), /canceled/)
    assert.equal(messages.length, count, 'revoked preference setup cannot publish ready')
    assert.equal(manager.active, false)
  } finally { await manager.close(); rmSync(root, { recursive: true, force: true }) }
})

import { spawn } from 'node:child_process'
// @ts-expect-error Existing helper terminates and verifies the complete owned process group.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'

test('revocation during pending startup suppresses ready, returns cancellation and stops the child', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  for (const reason of ['capability', 'owner', 'superseded'] as const) {
    const workspace = mkdtempSync(join(tmpdir(), 'first-use-delayed-start-'))
    // Only the process boundary is injected; no fixture is admitted as a reviewed extension.
    const child = spawn(process.execPath, ['-e', 'process.stdin.once("data", data => { process.stdout.write(data); }); setInterval(() => {}, 1000)'], { detached: true })
    t.diagnostic(`owned delayed-start root PID/group: ${child.pid}`)
    const h = orchestration()
    const owner = { webContentsId: 1 }
    const messages: import('../src/trusted-raycast-contract.ts').TrustedRaycastViewMessage[] = []
    const manager = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage: (_owner, message) => { messages.push(message) } })
    Reflect.set(manager, 'createWorkspace', () => ({ child, workspace }))
    const input = { extensionId: 'google-translate' as const, command: 'translate' as const, sessionId: 'delayed', generation: 'delayed', preferences: {} }
    const mutex = createTrustedRaycastMutex()
    let started!: () => void
    const starting = new Promise<void>(resolve => { started = resolve })
    h.launch(async check => {
      await mutex(async () => {
        check()
        try {
          const pending = manager.start(owner, input, '', check)
          started()
          await pending
          check()
        } catch (error) { await manager.closeOwner(owner); throw error }
      })
    })
    const pending = h.run()
    const rejected = assert.rejects(pending, /Extension opening canceled/)
    try {
      await starting
      if (reason === 'capability') h.revoke()
      else if (reason === 'owner') h.flow.cancel(owner.webContentsId)
      else h.flow.begin(owner.webContentsId, 'kaomoji-search')
      const stopping = mutex(async () => { await manager.closeOwner(owner) })
      child.stdin.write(JSON.stringify({ ...input, command: undefined, preferences: undefined, type: 'ready', revision: 0, root: { type: 'root', props: { querySequence: 0 }, children: [] } }) + '\n')
      await rejected
      await stopping
      assert.equal(messages.some(message => message.type === 'ready'), false, `${reason}: canceled startup must not dispose approval`)
      assert.equal(manager.active, false)
      assert.equal(existsSync(workspace), false)
    } finally {
      await manager.close()
      await stopOwnedChild(child, 30, true)
      rmSync(workspace, { recursive: true, force: true })
      assert.throws(() => process.kill(-child.pid!, 0), { code: 'ESRCH' })
    }
  }
})
