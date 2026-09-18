import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// @ts-expect-error Build helper is JavaScript.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'
import { TrustedRaycastManager, type TrustedRaycastOwner } from '../src/trusted-raycast-manager.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'
import { KAOMOJI_PREFERENCE_DEFAULTS, loadKaomojiPreferenceState, saveKaomojiPreferences } from '../src/trusted-raycast-kaomoji-preferences.ts'
import { trustedRaycastDataPaths } from '../src/trusted-raycast-paths.ts'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'
import { isTrustedRaycastKaomojiSvg, type TrustedRaycastViewMessage, type TrustedRaycastViewNode } from '../src/trusted-raycast-contract.ts'

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
  const effects: Array<{ acknowledged: boolean; kind: 'copy' | 'paste'; text: string }> = []
  const owner: TrustedRaycastOwner = { webContentsId: 701 }
  const childPids: number[] = []
  let copyMode: 'fail' | 'hold' | 'succeed' = 'succeed'
  let pasteFails = false
  const copyGate: { release?: () => void } = {}
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
      preferencesConfigured: () => existsSync(kaomojiPaths.preferencesFile),
      savePreferences: async (preferences, extensionId) => { assert.equal(extensionId, 'kaomoji-search'); await saveKaomojiPreferences(kaomojiPaths.preferencesFile, preferences) },
      copyText: async text => {
        effects.push({ acknowledged: false, kind: 'copy', text })
        if (copyMode === 'fail') throw new Error('Mock Copy denied')
        if (copyMode === 'hold') await new Promise<void>(resolve => { copyGate.release = resolve })
        effects.push({ acknowledged: true, kind: 'copy', text })
      },
      pasteText: async text => { effects.push({ acknowledged: false, kind: 'paste', text }); if (pasteFails) throw new Error('Mock Paste denied'); effects.push({ acknowledged: true, kind: 'paste', text }) },
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

    let currentSessionId = 'runtime'
    let currentGeneration = 'list'
    const latestRoot = (): TrustedRaycastViewMessage => messages.findLast(message => message.root !== undefined)!
    const currentNodes = (): TrustedRaycastViewNode[] => visit(latestRoot().root!)
    const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
      const deadline = Date.now() + 15_000
      while (!predicate() && diagnostics.length === 0 && violations.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      assert.deepEqual(diagnostics, [], `${label}: ${diagnostics.join('; ')}`)
      assert.deepEqual(violations, [], `${label}: ${violations.join('; ')}`)
      assert.equal(predicate(), true, label)
    }
    const search = async (value: string): Promise<number> => {
      const projection = latestRoot(); const sequence = Number(projection.root!.props.querySequence); const started = Date.now()
      manager!.send(owner, { extensionId: 'kaomoji-search', sessionId: currentSessionId, generation: currentGeneration, revision: projection.revision, eventId: String(projection.root!.props.searchEventId), kind: 'searchChanged', value })
      await waitFor(() => messages.some(message => message.root?.props.queryCurrent === true && message.root.props.querySequence === sequence + 1), `search did not settle: ${value}`)
      return Date.now() - started
    }
    const invoke = async (title: string, itemTitle?: string): Promise<TrustedRaycastViewMessage> => {
      const projection = latestRoot(); const nodes = visit(projection.root!)
      const scope = itemTitle === undefined ? projection.root! : nodes.find(node => (node.type === 'raycast-list-item' || node.type === 'raycast-grid-item') && node.props.title === itemTitle)
      assert.ok(scope, `missing item ${itemTitle}`)
      const action = visit(scope).find(node => node.type === 'raycast-action' && node.props.title === title)
      assert.ok(action?.props.actionEventId, `missing action ${title}`)
      const eventId = String(action.props.actionEventId); const before = messages.length
      manager!.send(owner, { extensionId: 'kaomoji-search', sessionId: currentSessionId, generation: currentGeneration, revision: projection.revision, eventId, kind: 'action' })
      await waitFor(() => messages.slice(before).some(message => message.type === 'outcome' && message.eventId === eventId), `missing ${title} outcome`)
      return messages.slice(before).find(message => message.type === 'outcome' && message.eventId === eventId)!
    }
    const state = (): { favoriteKaomoji: Array<{ id: string; name: string }>; recentKaomoji: Array<{ id: string; name: string }> } => JSON.parse(readFileSync(kaomojiPaths.stateFile, 'utf8'))

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
    await search('')
    const activeItems = currentNodes().filter(node => node.type === 'raycast-list-item')
    const initialTitle = String(activeItems[0]!.props.title)
    const actionOrder = visit(activeItems[0]!).filter(node => node.type === 'raycast-action').map(node => String(node.props.title))
    assert.equal(actionOrder[0], 'Paste in Active App')
    const projection = latestRoot()
    const copyAction = visit(activeItems[0]!).find(node => node.type === 'raycast-action' && node.props.title === 'Copy to Clipboard')!
    const authenticated = { extensionId: 'kaomoji-search' as const, sessionId: currentSessionId, generation: currentGeneration, revision: projection.revision, eventId: String(copyAction.props.actionEventId), kind: 'action' as const }
    assert.throws(() => manager!.send({ webContentsId: owner.webContentsId + 1 }, authenticated), /stale/)
    assert.throws(() => manager!.send(owner, { ...authenticated, extensionId: 'google-translate' }), /stale/)
    assert.throws(() => manager!.send(owner, { ...authenticated, sessionId: 'wrong' }), /stale/)
    assert.throws(() => manager!.send(owner, { ...authenticated, generation: 'wrong' }), /stale/)
    assert.throws(() => manager!.send(owner, { ...authenticated, revision: authenticated.revision + 1 }), /stale/)
    assert.throws(() => manager!.send(owner, { ...authenticated, eventId: randomUUID() }), /stale/)

    copyMode = 'hold'; delete copyGate.release
    const pendingCopy = invoke('Copy to Clipboard', initialTitle)
    await waitFor(() => copyGate.release !== undefined, 'mock Host did not receive Copy')
    assert.throws(() => manager!.send(owner, authenticated), /busy/, 'duplicate in-flight action was accepted')
    assert.equal(effects.at(-1)?.text, initialTitle)
    assert.equal(existsSync(kaomojiPaths.stateFile), false, 'callback ran before Host acknowledgement')
    copyGate.release!(); copyMode = 'succeed'
    assert.equal((await pendingCopy).succeeded, true)
    await waitFor(() => existsSync(kaomojiPaths.stateFile) && state().recentKaomoji.length === 1, 'successful Copy callback did not persist exactly once')
    assert.equal(state().recentKaomoji[0]!.name, initialTitle)
    assert.throws(() => manager!.send(owner, authenticated), /stale/, 'replayed action was accepted')

    await invoke('Pin to Favorites', initialTitle)
    await waitFor(() => state().favoriteKaomoji.length === 1, 'Pin did not persist')
    assert.ok(messages.some(message => message.type === 'toast' && message.title === 'Pinned to Favorites'))
    await invoke('Unpin from Favorites', initialTitle)
    await waitFor(() => state().favoriteKaomoji.length === 0, 'Unpin did not persist')
    assert.ok(messages.some(message => message.type === 'toast' && message.title === 'Unpinned from Favorites'))
    await invoke('Pin to Favorites', initialTitle)
    await waitFor(() => state().favoriteKaomoji.length === 1, 'repin did not persist')

    const recentTitles = [...new Set(activeItems.map(item => String(item.props.title)))].slice(0, 17)
    assert.equal(recentTitles.length, 17)
    for (const title of recentTitles) assert.equal((await invoke('Copy to Clipboard', title)).succeeded, true)
    await waitFor(() => state().recentKaomoji.length === 16, 'recents did not cap at 16')
    await invoke('Copy to Clipboard', recentTitles[0]!)
    await waitFor(() => state().recentKaomoji[0]?.name === recentTitles[0], 'recent duplicate did not move to front')
    assert.equal(new Set(state().recentKaomoji.map(item => item.name)).size, 16)

    const beforeFailure = readFileSync(kaomojiPaths.stateFile, 'utf8')
    copyMode = 'fail'
    assert.equal((await invoke('Copy to Clipboard', recentTitles[1]!)).succeeded, false)
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(readFileSync(kaomojiPaths.stateFile, 'utf8'), beforeFailure)
    copyMode = 'hold'; delete copyGate.release
    const timeoutStarted = Date.now()
    const timedOut = await invoke('Copy to Clipboard', recentTitles[2]!)
    const nativeTimeoutMs = Date.now() - timeoutStarted
    assert.equal(timedOut.succeeded, false)
    assert.match(String(timedOut.message), /timed out/)
    assert.ok(nativeTimeoutMs >= 9_000 && nativeTimeoutMs <= 12_000, `native timeout escaped its 10-second bound: ${nativeTimeoutMs}ms`)
    assert.equal(readFileSync(kaomojiPaths.stateFile, 'utf8'), beforeFailure)
    ;(copyGate.release as (() => void) | undefined)?.(); copyMode = 'succeed'
    pasteFails = true
    assert.equal((await invoke('Paste in Active App', recentTitles[3]!)).succeeded, false)
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(readFileSync(kaomojiPaths.stateFile, 'utf8'), beforeFailure)
    pasteFails = false
    assert.equal((await invoke('Paste in Active App', recentTitles[3]!)).succeeded, true)
    await waitFor(() => state().recentKaomoji[0]?.name === recentTitles[3], 'Paste callback did not update recents')
    assert.ok(effects.some(effect => effect.kind === 'paste' && effect.acknowledged && effect.text === recentTitles[3]))
    const datasetContent = new Set(dataset.map(entry => entry.entry))
    assert.equal(effects.every(effect => datasetContent.has(effect.text)), true, 'mock Host received content outside the fixed dataset')

    await invoke('Open Extension Preferences', initialTitle)
    await waitFor(() => latestRoot().root!.props.preferenceSetup === true, 'managed preferences did not open')
    const preferenceProjection = latestRoot()
    assert.equal(preferenceProjection.root!.props.navigationDepth, 1)
    assert.ok(currentNodes().some(node => node.type === 'raycast-form'))
    const beforePop = messages.length
    assert.doesNotThrow(() => manager!.send(owner, { extensionId: 'kaomoji-search', sessionId: currentSessionId, generation: currentGeneration, revision: preferenceProjection.revision, eventId: 'language-nav', kind: 'navigation', value: 'language:pop' }))
    await waitFor(() => messages.slice(beforePop).some(message => message.root?.props.navigationDepth === 0 && message.root.props.searchable === true), 'managed preference pop did not restore search')
    assert.ok(latestRoot().revision > preferenceProjection.revision)
    assert.equal(latestRoot().root!.props.preferenceSetup, false)
    await invoke('Open Extension Preferences', initialTitle)
    await waitFor(() => latestRoot().root!.props.preferenceSetup === true && latestRoot().root!.props.navigationDepth === 1, 'managed preferences did not reopen')
    const fields = currentNodes().filter(node => node.type === 'raycast-form-dropdown')
    assert.deepEqual(fields.map(field => field.props.title), ['Display Mode', 'Primary Action'])
    for (const [field, value] of [[fields[0]!, 'grid'], [fields[1]!, 'copy-to-clipboard']] as const) {
      manager.send(owner, { extensionId: 'kaomoji-search', sessionId: currentSessionId, generation: currentGeneration, revision: latestRoot().revision, eventId: String(field.props.fieldEventId), kind: 'fieldChanged', value })
    }
    assert.equal((await invoke('Save Preferences')).succeeded, true)
    await waitFor(() => existsSync(kaomojiPaths.preferencesFile), 'preferences did not persist')
    assert.deepEqual(loadKaomojiPreferenceState(kaomojiPaths.preferencesFile).values, { displayMode: 'grid', primaryAction: 'copy-to-clipboard' })

    await manager.stop('owner-closed')
    assert.equal(processExists(childPid), false); assert.equal(processExists(childPid, true), false)
    messages.length = 0; currentSessionId = 'runtime-grid'; currentGeneration = 'grid'
    const gridStarted = Date.now()
    await manager.start(owner, { extensionId: 'kaomoji-search', sessionId: currentSessionId, generation: currentGeneration, command: 'index', preferences: loadKaomojiPreferenceState(kaomojiPaths.preferencesFile).values })
    const gridPid = ((manager as unknown as { session?: { child?: { pid?: number } } }).session?.child?.pid ?? 0)
    assert.ok(gridPid > 0); childPids.push(gridPid)
    await waitFor(() => currentNodes().some(node => node.type === 'raycast-grid-item'), 'Grid did not render')
    const gridNodes = currentNodes(); const gridItems = gridNodes.filter(node => node.type === 'raycast-grid-item')
    assert.ok(gridItems.length > 0 && gridItems.length <= 64)
    assert.ok(gridNodes.some(node => node.type === 'raycast-section' && node.props.title === 'Pinned Favorites'))
    const gridActions = visit(gridItems[0]!).filter(node => node.type === 'raycast-action').map(node => String(node.props.title))
    assert.equal(gridActions[0], 'Copy to Clipboard')
    const svgChecks: Record<string, number> = {}
    for (const [key, fill] of [['contentDark', '#fff'], ['contentLight', '#000']] as const) {
      const url = String(gridItems[0]!.props[key]); assert.match(url, /^data:image\/svg\+xml;base64,/); assert.ok(url.length <= 6144)
      assert.equal(isTrustedRaycastKaomojiSvg(url, fill), true, `invalid canonical ${key} SVG`)
      const decoded = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8')
      svgChecks[key] = decoded.length
    }
    assert.ok(maxProjectionBytes <= 1024 * 1024)
    assert.equal(lstatSync(kaomojiPaths.stateFile).isFile(), true)
    assert.equal(lstatSync(kaomojiPaths.stateFile).mode & 0o777, 0o600)
    assert.equal(readdirSync(join(root, 'profile', 'launcher')).some(name => name.includes('.tmp-')), false)
    assert.deepEqual([digest(googlePaths.preferencesFile), digest(googlePaths.stateFile)], translateBefore)
    assert.equal(liveSnapshot(join(homedir(), 'Library/Application Support/TockTeam')), beforeLive)
    await manager.stop('owner-closed')
    assert.equal(processExists(gridPid), false); assert.equal(processExists(gridPid, true), false)
    if (evidencePath) writeFileSync(evidencePath, `${JSON.stringify({
      artifactSha256: expectedArtifact,
      authentication: { duplicateInFlightDenied: true, replayDenied: true, staleRevisionDenied: true, wrongActionDenied: true, wrongExtensionDenied: true, wrongGenerationDenied: true, wrongOwnerDenied: true, wrongSessionDenied: true },
      buildIdentity: identity,
      datasetEntries: dataset.length,
      defaultProjection: { actionableHandles: initialNodes.filter(node => node.type === 'raycast-action' && typeof node.props.actionEventId === 'string').length, itemLimit: 64, items: initialItems.length, primaryAction: actionOrder[0], truncatedFromDataset: true },
      diagnostics,
      effects: { acknowledgedCopyCalls: effects.filter(effect => effect.kind === 'copy' && effect.acknowledged).length, acknowledgedPasteCalls: effects.filter(effect => effect.kind === 'paste' && effect.acknowledged).length, callbackAfterAcknowledgement: true, deniedCopyUnmutated: true, deniedPasteUnmutated: true, exactText: true, timeoutMs: nativeTimeoutMs, timeoutUnmutated: true },
      extensionId: 'kaomoji-search',
      grid: { items: gridItems.length, primaryAction: gridActions[0], svgChecks },
      installedOnlyInDisposableRoot: true,
      liveDataUnchanged: true,
      maxProjectionBytes,
      mockedEffectsOnly: true,
      preferences: loadKaomojiPreferenceState(kaomojiPaths.preferencesFile).values,
      projectionViolations: violations,
      search: { emptyResult: true, emptyTimeMs: emptyMs, outsideInitialProjection: outside, outsideResultFound: true, timeMs: searchMs },
      state: { atomicMode: '0600', favoriteCount: state().favoriteKaomoji.length, orderedWritesDrained: true, recentCount: state().recentKaomoji.length, recentUnique: new Set(state().recentKaomoji.map(item => item.name)).size, symlinkDefenseCoveredByFocusedTest: true, twoConsumerConvergence: true },
      timings: { gridMs: Date.now() - gridStarted, listScenarioMs: Date.now() - started },
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
