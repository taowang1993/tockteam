import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// @ts-expect-error Build helper is JavaScript.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'
import { TrustedRaycastManager, type TrustedRaycastOwner } from '../src/trusted-raycast-manager.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'
import { KAOMOJI_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-kaomoji-preferences.ts'
import { trustedRaycastDataPaths } from '../src/trusted-raycast-paths.ts'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'
import type { TrustedRaycastViewMessage, TrustedRaycastViewNode } from '../src/trusted-raycast-contract.ts'

const enabled = process.env.TOCKTEAM_KAOMOJI_RUNTIME_PROOF === '1'
const expectedArtifact = '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f'
const visit = (node: TrustedRaycastViewNode): TrustedRaycastViewNode[] => [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : visit(child))]
const digestBuffer = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex')
const digest = (path: string): string => digestBuffer(readFileSync(path))

function processExists(pid: number, group = false): boolean {
  try { process.kill(group ? -pid : pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}

function liveSnapshot(path: string): string {
  if (!existsSync(path)) return 'absent'
  const rows: string[] = []
  const walk = (current: string, relative = ''): void => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name); const child = join(relative, name); const stat = statSync(full)
      if (stat.isDirectory()) walk(full, child)
      else if (/kaomoji|trusted-raycast/i.test(child)) rows.push(`${child}\t${stat.size}\t${digest(full)}`)
    }
  }
  walk(path)
  return rows.join('\n') || 'no-matching-files'
}

await test('reviewed Kaomoji default and search projections stay finite in disposable trust', { skip: !enabled, timeout: 120_000 }, async () => {
  const root = join(tmpdir(), `tockteam-kaomoji-runtime-proof-${process.pid}-${randomUUID()}`)
  const artifact = resolve('plugins/trusted-raycast/vendor/kaomoji-search.tar')
  const evidencePath = process.env.TOCKTEAM_KAOMOJI_EVIDENCE_PATH
  const beforeWorkspaces = readdirSync(tmpdir()).filter(name => name.startsWith('tockteam-trusted-raycast-')).sort()
  const beforeLive = liveSnapshot(join(homedir(), 'Library/Application Support/TockTeam'))
  const messages: TrustedRaycastViewMessage[] = []
  const diagnostics: string[] = []
  const violations: string[] = []
  const owner: TrustedRaycastOwner = { webContentsId: 701 }
  const childPids: number[] = []
  let manager: TrustedRaycastManager | undefined
  let maxProjectionBytes = 0
  try {
    mkdirSync(root, { recursive: true })
    const googlePaths = trustedRaycastDataPaths(join(root, 'profile'), 'google-translate')
    const kaomojiPaths = trustedRaycastDataPaths(join(root, 'profile'), 'kaomoji-search')
    mkdirSync(join(root, 'profile', 'launcher'), { recursive: true })
    writeFileSync(googlePaths.preferencesFile, 'translate-preferences-sentinel')
    writeFileSync(googlePaths.stateFile, 'translate-state-sentinel')
    const translateBefore = [digest(googlePaths.preferencesFile), digest(googlePaths.stateFile)]

    assert.equal(digest(artifact), expectedArtifact)
    await buildTrustedRaycast(root, artifact, 'kaomoji-search')
    const candidate = join(root, 'trusted-raycast-kaomoji')
    const identity = JSON.parse(readFileSync(join(candidate, 'build.json'), 'utf8')) as Record<string, string>
    assert.deepEqual({ artifactSha256: identity.artifactSha256, command: identity.command, extensionId: identity.extensionId }, { artifactSha256: expectedArtifact, command: 'index', extensionId: 'kaomoji-search' })

    let store: TrustedRaycastTrustStore
    manager = new TrustedRaycastManager({
      runtimeDir: () => store.runtimeDir(),
      nodePath: process.execPath,
      stateFile: kaomojiPaths.stateFile,
      onMessage: (_owner, message) => {
        const bytes = Buffer.byteLength(JSON.stringify(message)); maxProjectionBytes = Math.max(maxProjectionBytes, bytes)
        if (message.root) {
          const nodes = visit(message.root)
          const items = nodes.filter(node => node.type === 'raycast-list-item' || node.type === 'raycast-grid-item').length
          const actions = nodes.filter(node => node.type === 'raycast-action' && typeof node.props.actionEventId === 'string').length
          if (items > 64) violations.push(`${message.type} r${message.revision}: ${items} items`)
          if (actions > 256) violations.push(`${message.type} r${message.revision}: ${actions} actions`)
        }
        messages.push(message)
      },
      onError: (_owner, error) => diagnostics.push(error.message),
    })
    store = new TrustedRaycastTrustStore({
      descriptor: trustedRaycastDescriptors['kaomoji-search'],
      installRoot: kaomojiPaths.installRoot,
      candidateDir: candidate,
      stateFile: kaomojiPaths.trustFile,
      preview: staged => manager!.previewRuntime(staged, 'kaomoji-search'),
    })
    store.stage()
    assert.equal(digest(join(kaomojiPaths.installRoot, 'stage/artifact.tar')), expectedArtifact)
    await store.preview()
    store.apply()
    store.enable()
    const trusted = store.status()
    assert.equal(trusted.installed && trusted.enabled && trusted.digestApproved, true)
    assert.equal(trusted.digest, expectedArtifact)

    const latestRoot = (): TrustedRaycastViewMessage => messages.findLast(message => message.root !== undefined)!
    const currentNodes = (): TrustedRaycastViewNode[] => visit(latestRoot().root!)
    const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
      const deadline = Date.now() + 10_000
      while (!predicate() && diagnostics.length === 0 && violations.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      assert.deepEqual(diagnostics, [], `${label}: ${diagnostics.join('; ')}`)
      assert.deepEqual(violations, [], `${label}: ${violations.join('; ')}`)
      assert.equal(predicate(), true, label)
    }
    const search = async (value: string): Promise<number> => {
      const projection = latestRoot(); const sequence = Number(projection.root!.props.querySequence); const started = Date.now()
      manager!.send(owner, { extensionId: 'kaomoji-search', sessionId: 'runtime', generation: 'list', revision: projection.revision, eventId: String(projection.root!.props.searchEventId), kind: 'searchChanged', value })
      await waitFor(() => messages.some(message => message.root?.props.queryCurrent === true && message.root.props.querySequence === sequence + 1), `search did not settle: ${value}`)
      return Date.now() - started
    }

    const started = Date.now()
    await manager.start(owner, { extensionId: 'kaomoji-search', sessionId: 'runtime', generation: 'list', command: 'index', preferences: KAOMOJI_PREFERENCE_DEFAULTS })
    const childPid = ((manager as unknown as { session?: { child?: { pid?: number } } }).session?.child?.pid ?? 0)
    assert.ok(childPid > 0); childPids.push(childPid)
    await waitFor(() => currentNodes().some(node => node.type === 'raycast-list-item'), 'default List did not render')
    const initialNodes = currentNodes()
    const initialItems = initialNodes.filter(node => node.type === 'raycast-list-item')
    assert.equal(initialItems.length, 64)
    assert.ok(initialNodes.some(node => node.type === 'raycast-section'))
    const initialTitles = new Set(initialItems.map(item => String(item.props.title)))

    const artifactRoot = 'tockteam-raycast-kaomoji-artifact'
    const checks = execFileSync('/usr/bin/tar', ['xOf', artifact, `${artifactRoot}/RUNTIME-CHECKS.sha256`], { encoding: 'utf8', timeout: 15_000 })
    const datasetBytes = execFileSync('/usr/bin/tar', ['xOf', artifact, `${artifactRoot}/runtime/node_modules/asciilib/lib.json`], { timeout: 15_000 })
    const recordedDatasetDigest = checks.split('\n').find(line => line.endsWith('  node_modules/asciilib/lib.json'))?.split('  ')[0]
    assert.equal(digestBuffer(datasetBytes), recordedDatasetDigest)
    const dataset = Object.values(JSON.parse(datasetBytes.toString('utf8')) as Record<string, { category: string; entry: string; keywords: string[]; name: string }>)
    assert.equal(dataset.length, 1822)
    assert.equal(dataset.every(entry => typeof entry.category === 'string' && typeof entry.entry === 'string' && Array.isArray(entry.keywords) && entry.keywords.every(keyword => typeof keyword === 'string') && typeof entry.name === 'string'), true)
    const outside = dataset.find(entry => !initialTitles.has(entry.entry))
    assert.ok(outside, 'no dataset entry outside the initial 64')
    const query = outside.name.toLowerCase()
    assert.ok(dataset.filter(entry => entry.name.toLowerCase().includes(query) || entry.keywords.some(keyword => keyword.toLowerCase().includes(query)) || entry.category.toLowerCase().includes(query)).includes(outside), 'proof lookup diverged from audited search semantics')
    const searchMs = await search(outside.name)
    assert.ok(currentNodes().some(node => node.type === 'raycast-list-item' && node.props.title === outside.entry), 'search did not resolve an entry outside the initial 64')
    const emptyMs = await search(`no-result-${randomUUID()}`)
    assert.equal(currentNodes().filter(node => node.type === 'raycast-list-item').length, 0)

    assert.equal(existsSync(kaomojiPaths.stateFile), false, 'projection-only run mutated Kaomoji state')
    assert.deepEqual([digest(googlePaths.preferencesFile), digest(googlePaths.stateFile)], translateBefore)
    assert.equal(liveSnapshot(join(homedir(), 'Library/Application Support/TockTeam')), beforeLive)
    assert.ok(maxProjectionBytes <= 1024 * 1024)
    await manager.stop('owner-closed')
    assert.equal(processExists(childPid), false); assert.equal(processExists(childPid, true), false)
    if (evidencePath) writeFileSync(evidencePath, `${JSON.stringify({
      artifactSha256: expectedArtifact,
      buildIdentity: identity,
      datasetEntries: dataset.length,
      defaultProjection: { actionableHandles: initialNodes.filter(node => node.type === 'raycast-action' && typeof node.props.actionEventId === 'string').length, itemLimit: 64, items: initialItems.length, truncatedFromDataset: true },
      diagnostics,
      extensionId: 'kaomoji-search',
      installedOnlyInDisposableRoot: true,
      liveDataUnchanged: true,
      maxProjectionBytes,
      nativeEffectsConfigured: [],
      projectionViolations: violations,
      search: { emptyResult: true, emptyTimeMs: emptyMs, outsideInitialProjection: outside, outsideResultFound: true, timeMs: searchMs },
      stateUnmutated: true,
      timings: { initialListMs: Date.now() - started },
      translateStateUnchanged: true,
      trust: trusted,
    }, null, 2)}\n`)
  } finally {
    try { await manager?.close() } finally { rmSync(root, { recursive: true, force: true }) }
    for (const pid of childPids) {
      assert.equal(processExists(pid), false, `child ${pid} survived cleanup`)
      assert.equal(processExists(pid, true), false, `process group ${pid} survived cleanup`)
    }
    assert.deepEqual(readdirSync(tmpdir()).filter(name => name.startsWith('tockteam-trusted-raycast-')).sort(), beforeWorkspaces)
    assert.equal(liveSnapshot(join(homedir(), 'Library/Application Support/TockTeam')), beforeLive)
    assert.equal(existsSync(root), false)
  }
})
