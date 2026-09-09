import assert from 'node:assert/strict'
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { ensureElectronInstalled } from './electron-runtime.mjs'
import { createFocusProofClient, findFocusProofResidue, focusProofDescendants, readFocusProofProcessSnapshot, type FocusProofCheckpoint, type ProofProcessRow } from './trusted-raycast-focus-proof-client.ts'
import { extractKaomojiReferenceImages } from './trusted-raycast-kaomoji-reference.ts'
import { cleanupPostBaselineTrustedRaycastWorkspaces } from './trusted-raycast-proof-cleanup.ts'
import { publishTrustedRaycastProofExclusive } from './trusted-raycast-proof-publication.ts'
import { TRUSTED_PROOF_PAGE_SELECTOR_SOURCE, waitForTrustedProofPage, type TrustedProofPageRole } from './trusted-raycast-proof-pages.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { trustedRaycastDescriptors, type TrustedRaycastExtensionId } from '../src/trusted-raycast-descriptors.ts'
import { KAOMOJI_PREFERENCE_DEFAULTS, saveKaomojiPreferences } from '../src/trusted-raycast-kaomoji-preferences.ts'
import { isTrustedRaycastKaomojiSvg, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-contract.ts'
import { trustedRaycastDataPaths } from '../src/trusted-raycast-paths.ts'
import { saveTrustedRaycastPreferences } from '../src/trusted-raycast-preferences.ts'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'

const execFile = promisify(execFileCallback)
const repository = resolve('.')
const finalEvidence = join(repository, '.beads/reports/tocklauncher-kaomoji-visual')
const artifact = join(repository, 'plugins/trusted-raycast/vendor/kaomoji-search.tar')
const expectedArtifact = '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f'
const digest = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex')
const fileDigest = (path: string): string => digest(readFileSync(path))
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()) })
  const address = server.address(); assert.ok(typeof address === 'object' && address)
  await new Promise<void>(resolve => server.close(() => resolve()))
  return address.port
}
async function processGroupId(pid: number): Promise<number> {
  const result = await execFile('/bin/ps', ['-o', 'pgid=', '-p', String(pid)], { timeout: 5000 })
  const pgid = Number(result.stdout.trim()); assert.ok(Number.isSafeInteger(pgid) && pgid > 0, 'Could not establish proof process group'); return pgid
}
async function frontmostProcess(): Promise<{ bundleId: string; pgid: number; pid: number; timestampMs: number }> {
  const asn = (await execFile('/usr/bin/lsappinfo', ['front'], { timeout: 5000 })).stdout.trim()
  assert.match(asn, /^ASN:0x[0-9a-f]+-0x[0-9a-f]+:$/iu, 'Malformed frontmost application identity')
  const info = (await execFile('/usr/bin/lsappinfo', ['info', '-only', 'pid,bundleID', asn], { timeout: 5000 })).stdout
  const pid = Number(info.match(/^"pid"=(\d+)$/mu)?.[1]); assert.ok(Number.isSafeInteger(pid) && pid > 0, 'Missing frontmost process identity')
  const rawBundleId = info.match(/^"CFBundleIdentifier"="([^"]*)"$/mu)?.[1] ?? '-'
  const bundleId = /^(?:-|[A-Za-z0-9][A-Za-z0-9._-]{0,254})$/u.test(rawBundleId) ? rawBundleId : '-'
  return { bundleId, pgid: await processGroupId(pid), pid, timestampMs: Date.now() }
}
async function pages(port: number): Promise<Array<{ title: string; url: string; webSocketDebuggerUrl: string }>> { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as Array<{ title: string; url: string; webSocketDebuggerUrl: string }> }
function manifest(paths: readonly string[]): string {
  const rows: string[] = []
  const walk = (path: string, label: string): void => {
    if (!existsSync(path)) { rows.push(`${label}\tabsent`); return }
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) { rows.push(`${label}\tsymlink`); return }
    if (!stat.isDirectory()) { rows.push(`${label}\t${stat.size}\t${fileDigest(path)}`); return }
    rows.push(`${label}/\tdirectory`)
    for (const name of readdirSync(path).sort()) walk(join(path, name), `${label}/${name}`)
  }
  paths.forEach((path, index) => walk(path, String(index)))
  return rows.join('\n')
}
function extensionPaths(root: string, extensionId: TrustedRaycastExtensionId): string[] {
  const paths = trustedRaycastDataPaths(root, extensionId)
  return [paths.installRoot, paths.preferencesFile, paths.stateFile, paths.trustFile]
}
function protectedLivePaths(): string[] {
  return ['TockTeam-Desktop-Dev', 'TockTeam-Desktop'].flatMap(name => {
    const root = join(homedir(), 'Library/Application Support', name)
    return [...extensionPaths(root, 'google-translate'), ...extensionPaths(root, 'kaomoji-search'), join(root, 'dsh/profiles/desktop')]
  })
}

class Cdp {
  private next = 1
  private pending = new Map<number, { reject(error: Error): void; resolve(value: any): void; timer: NodeJS.Timeout }>()
  constructor(private socket: WebSocket) {
    socket.addEventListener('message', event => { const value = JSON.parse(String(event.data)); const waiting = this.pending.get(value.id); if (!waiting) return; this.pending.delete(value.id); clearTimeout(waiting.timer); value.error ? waiting.reject(new Error(value.error.message)) : waiting.resolve(value.result) })
    socket.addEventListener('close', () => this.rejectPending(new Error('CDP connection closed')))
    socket.addEventListener('error', () => this.rejectPending(new Error('CDP connection failed')))
  }
  private rejectPending(error: Error): void { for (const waiting of this.pending.values()) { clearTimeout(waiting.timer); waiting.reject(error) }; this.pending.clear() }
  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('Timed out connecting to CDP')) }, 10_000)
      socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Failed to connect to CDP')) }, { once: true })
    })
    return new Cdp(socket)
  }
  call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out waiting for CDP ${method}`)) }, 15_000)
      this.pending.set(id, { resolve, reject, timer })
      try { this.socket.send(JSON.stringify({ id, method, params })) } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }
  close(): void { this.socket.close(); this.rejectPending(new Error('CDP connection closed')) }
}
async function capture(target: { webSocketDebuggerUrl: string }, path: string): Promise<void> {
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl)
  try { const result = await cdp.call('Page.captureScreenshot', { captureBeyondViewport: false, format: 'png', fromSurface: true }); await writeFile(path, Buffer.from(result.data, 'base64')) } finally { cdp.close() }
}

let evidence = ''
let userData = ''
let electronChild: ReturnType<typeof spawn> | undefined
let attached = false
let debugPort = 0
let focusClient: ReturnType<typeof createFocusProofClient> | undefined
const focusCheckpoints: Array<FocusProofCheckpoint & { frontmost: Awaited<ReturnType<typeof frontmostProcess>> }> = []
let processBefore: readonly ProofProcessRow[] = []
let gatePgid = 0
let focusProofNonce = ''
let residueMarkers: readonly string[] = []
let observedDescendants: readonly ProofProcessRow[] = []
let liveBefore = ''
let tempGoogleBefore = ''
let workspacesBefore: string[] = []
let workspaceSnapshotCaptured = false
let workspaceCleanupRemoved: readonly string[] = []
let log = ''
let failure: unknown
let completed = false
const session = `tockteam-kaomoji-visual-${process.pid}`
try {
  assert.equal(existsSync(finalEvidence), false, 'Final Kaomoji evidence already exists')
  assert.equal(process.platform, 'darwin', 'The bounded Retina visual gate requires macOS')
  evidence = await mkdtemp(join(tmpdir(), 'tockteam-kaomoji-visual-evidence-'))
  userData = await mkdtemp(join(tmpdir(), 'tockteam-kaomoji-electron-proof-'))
  await mkdir(join(evidence, 'reference'), { recursive: true })
  processBefore = await readFocusProofProcessSnapshot()
  workspacesBefore = readdirSync(tmpdir()).filter(name => name.startsWith('tockteam-trusted-raycast-')).sort()
  workspaceSnapshotCaptured = true
  liveBefore = manifest(protectedLivePaths())
  await writeFile(join(evidence, 'live-before.manifest'), `${liveBefore}\n`)
  assert.equal(fileDigest(artifact), expectedArtifact)
  const build = await execFile(process.execPath, ['scripts/build.mjs'], { cwd: repository, timeout: 180_000, maxBuffer: 2 * 1024 * 1024 })
  log += build.stdout + build.stderr

  const install = async (extensionId: TrustedRaycastExtensionId): Promise<void> => {
    const paths = trustedRaycastDataPaths(userData, extensionId)
    let store: TrustedRaycastTrustStore
    const manager = new TrustedRaycastManager({ runtimeDir: () => store.runtimeDir(), nodePath: process.execPath, stateFile: paths.stateFile, onMessage: () => {} })
    store = new TrustedRaycastTrustStore({ descriptor: trustedRaycastDescriptors[extensionId], installRoot: paths.installRoot, candidateDir: join(repository, extensionId === 'kaomoji-search' ? 'dist/trusted-raycast-kaomoji' : 'dist/trusted-raycast'), stateFile: paths.trustFile, preview: staged => manager.previewRuntime(staged, extensionId) })
    try { store.stage(); await store.preview(); store.apply(); store.enable(); assert.equal(store.status().enabled && store.status().digestApproved, true) } finally { await manager.close() }
  }
  const kaomoji = trustedRaycastDataPaths(userData, 'kaomoji-search')
  const google = trustedRaycastDataPaths(userData, 'google-translate')
  await saveKaomojiPreferences(kaomoji.preferencesFile, KAOMOJI_PREFERENCE_DEFAULTS)
  await saveTrustedRaycastPreferences(google.preferencesFile, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS)
  writeFileSync(google.stateFile, JSON.stringify({ visualProofSentinel: true }), { mode: 0o600 })
  await install('google-translate'); await install('kaomoji-search')
  tempGoogleBefore = manifest(extensionPaths(userData, 'google-translate'))
  await writeFile(join(evidence, 'disposable-google-before.manifest'), `${tempGoogleBefore}\n`)
  const identities = JSON.parse(await readFile(join(kaomoji.installRoot, 'current/build.json'), 'utf8')) as Record<string, unknown>
  for (const key of ['artifactSha256', 'childSha256', 'projectionSha256', 'resolutionSha256', 'metadataSha256']) assert.match(String(identities[key]), /^[0-9a-f]{64}$/u)

  const references: Array<{ file: string; height: number; sha256: string; size: number; width: number }> = []
  for (const reference of await extractKaomojiReferenceImages(artifact)) {
    await writeFile(join(evidence, 'reference', reference.name), reference.bytes)
    references.push({ file: reference.name, height: reference.height, sha256: reference.sha256, size: reference.bytes.length, width: reference.width })
  }
  await writeFile(join(evidence, 'reference', 'source.json'), `${JSON.stringify({ collectionLabel: 'Official Raycast extension repository metadata; not called Recommended', extension: 'Kaomoji Search', references, sourceCommit: 'b7845053e3f39dadcf984217be5249fb51ab2ce8', subtree: '377d7eb3cd9f3463c14eacb8f290c7558a4571ed', visualComparison: 'Approximate: official captures are 2000×1250 and may represent an earlier Raycast host release.' }, null, 2)}\n`)

  debugPort = await freePort()
  const electron = ensureElectronInstalled(repository)
  focusProofNonce = randomBytes(32).toString('hex')
  residueMarkers = Object.freeze([userData, `--remote-debugging-port=${debugPort}`, `TOCKTEAM_LAUNCHER_VISUAL_PROOF_NONCE=${focusProofNonce}`, electron.includes('.app/') ? electron.slice(0, electron.indexOf('.app/') + 4) : electron])
  electronChild = spawn(electron, ['.', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`], {
    cwd: repository, detached: true,
    env: { ...process.env, TOCKTEAM_LAUNCHER_INACTIVE_VISUAL_PROOF: '1', TOCKTEAM_LAUNCHER_SMOKE_EXTENDED_DISPLAY: '1', TOCKTEAM_LAUNCHER_SMOKE_REQUIRE_EXTENDED_DISPLAY: '1', TOCKTEAM_LAUNCHER_VISUAL_PROOF_NONCE: focusProofNonce, TOCKTEAM_TRUSTED_RAYCAST_DENY_EFFECTS_PROOF: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  focusClient = createFocusProofClient(electronChild, focusProofNonce)
  electronChild.stdout?.on('data', chunk => { log = `${log}${chunk}`.slice(-16_384) }); electronChild.stderr?.on('data', chunk => { log = `${log}${chunk}`.slice(-16_384) })
  await focusClient.ready()
  gatePgid = await processGroupId(electronChild.pid!); assert.equal(gatePgid, electronChild.pid, 'Proof Electron did not own its process group')
  const assertNoFocusTheft = async (checkpoint: string): Promise<void> => { focusCheckpoints.push({ ...(await focusClient!.checkpoint(checkpoint)), frontmost: await frontmostProcess() }) }
  const target = async (role: TrustedProofPageRole) => {
    const selected = await waitForTrustedProofPage(async () => (await pages(debugPort)).map(target => ({ target, title: async () => target.title, url: () => target.url })), role)
    return selected.target
  }
  await target('workbench')
  await assertNoFocusTheft('workbench-ready')
  const cli = async (...args: string[]): Promise<string> => {
    const result = await execFile('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 })
    if (/### Error/u.test(result.stdout)) throw new Error(result.stdout)
    return result.stdout
  }
  await cli('attach', `--cdp=http://127.0.0.1:${debugPort}`); attached = true
  await cli('run-code', `async page => { ${TRUSTED_PROOF_PAGE_SELECTOR_SOURCE} const workbench = await waitForTrustedProofPage(() => page.context().pages(), 'workbench'); await workbench.evaluate(() => window.dshDesktop.launcher.show()); return true; }`)
  await target('launcher')
  await assertNoFocusTheft('launcher-shown')
  const run = async (body: string): Promise<any> => {
    const output = await cli('run-code', `async page => { ${TRUSTED_PROOF_PAGE_SELECTOR_SOURCE} const [launcher, workbench] = await Promise.all([waitForTrustedProofPage(() => page.context().pages(), 'launcher'), waitForTrustedProofPage(() => page.context().pages(), 'workbench')]); ${body} }`)
    const match = output.match(/### Result\s*\n([^\n]+)/u); return match ? JSON.parse(match[1]!) : undefined
  }
  const geometry = await run(`
    await workbench.evaluate(() => window.dshDesktop.launcher.settings.updateSetting('window.hideWindowOn', []));
    await workbench.evaluate(() => window.dshDesktop.syncLauncherTheme({ mode: 'dark', skinId: 'tockteam-skin-deep-current' }));
    await launcher.waitForFunction(() => document.documentElement.dataset.launcherReady === 'true' && document.documentElement.style.colorScheme === 'dark');
    const input = launcher.locator('#launcher-search'); await input.fill('Kaomoji Search');
    await launcher.locator('[data-result-id="trusted-raycast:kaomoji-search:index"]').waitFor(); await input.press('Enter');
    const section = launcher.locator('section[aria-label="Kaomoji Search"]'); await section.waitFor();
    await launcher.waitForFunction(() => document.querySelectorAll('section[aria-label="Kaomoji Search"] li.launcher-command-row').length === 64);
    const facts = await launcher.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, screenX, screenY, availLeft: screen.availLeft, availTop: screen.availTop, colorScheme: document.documentElement.style.colorScheme, node: typeof window.process, require: typeof window.require }));
    const rows = section.locator('li.launcher-command-row'); const actions = section.locator('button.launcher-command-menu-item');
    if (facts.width !== 750 || facts.height !== 475 || facts.dpr !== 2 || facts.availLeft === 0 || facts.node !== 'undefined' || facts.require !== 'undefined') throw new Error('Geometry/isolation mismatch: ' + JSON.stringify(facts));
    if (await rows.count() !== 64 || await actions.count() !== 256) throw new Error('DOM projection exceeded 64/256');
    const searchboxCount = await launcher.getByRole('searchbox', { name: 'Search Kaomoji', exact: true }).count(); if (searchboxCount !== 1) throw new Error('Kaomoji searchbox computed accessible name mismatch: ' + searchboxCount);
    const listCount = await launcher.getByRole('list', { name: 'Kaomoji Results', exact: true }).count(); if (listCount !== 1) throw new Error('Kaomoji result list explicit role/name mismatch: ' + listCount);
    const disclosure = 'Showing 64 results. Search all 1,822 kaomoji.'; if (await launcher.getByText(disclosure, { exact: true }).count() !== 1) throw new Error('Missing truncation disclosure');
    return { ...facts, actionCount: await actions.count(), itemCount: await rows.count(), truncation: disclosure };
  `)
  await capture(await target('launcher'), join(evidence, 'list-dark.png'))

  const actionPanel = await run(`
    const section = launcher.locator('section[aria-label="Kaomoji Search"]'); const input = launcher.getByRole('searchbox', { name: 'Search Kaomoji', exact: true });
    await input.press('Meta+k'); const menu = section.locator('details[open] .launcher-command-menu'); await menu.waitFor();
    const firstFocused = await launcher.evaluate(() => document.activeElement?.textContent?.replace(/\\s+/g, ' ').trim());
    await launcher.keyboard.press('ArrowDown'); const secondFocused = await launcher.evaluate(() => document.activeElement?.textContent?.replace(/\\s+/g, ' ').trim());
    await launcher.keyboard.press('Escape'); const restoredToRow = await launcher.evaluate(() => document.activeElement?.classList.contains('launcher-command-row'));
    await input.focus(); await input.press('Meta+k'); await input.click(); const outsideDismissed = await section.locator('details[open]').count() === 0 && await input.evaluate(node => node === document.activeElement);
    await input.press('Meta+k'); await menu.waitFor(); const order = (await menu.locator('button').allTextContents()).map(value => value.replace(/\\s+/g, ' ').trim());
    if (JSON.stringify(order) !== JSON.stringify(['Paste in Active App','Copy to Clipboard','Pin to Favorites','Open Extension Preferences']) || firstFocused !== 'Paste in Active App' || secondFocused !== 'Copy to Clipboard' || !restoredToRow || !outsideDismissed) throw new Error('Action keyboard contract mismatch');
    return { firstFocused, order, outsideDismissed, restoredToRow, secondFocused };
  `)
  await capture(await target('launcher'), join(evidence, 'action-panel-dark.png'))
  await run(`
    const section = launcher.locator('section[aria-label="Kaomoji Search"]'); await launcher.keyboard.press('Escape'); await launcher.keyboard.press('Enter');
    await section.getByRole('alert').filter({ hasText: 'Paste is disabled in the bounded visual proof' }).waitFor(); return { enterPrimaryDenied: true };
  `)
  assert.equal(existsSync(kaomoji.stateFile), false, 'denied Paste mutated state')

  const search = await run(`
    const input = launcher.getByRole('searchbox', { name: 'Search Kaomoji', exact: true }); await input.fill('Upside Down Lenny');
    const row = launcher.locator('li.launcher-command-row').filter({ hasText: '( ͜。 ͡ʖ ͜。)' }); await row.waitFor();
    return { outsideInitialFound: true, value: await input.inputValue(), result: await row.innerText() };
  `)
  await capture(await target('launcher'), join(evidence, 'search-outside-initial-dark.png'))
  await run(`const input = launcher.getByRole('searchbox', { name: 'Search Kaomoji', exact: true }); await input.fill('no-result-${randomUUID()}'); await launcher.getByText('No Results', { exact: true }).waitFor(); return { empty: true };`)
  await capture(await target('launcher'), join(evidence, 'empty-dark.png'))
  const preferenceContract = await run(`
    const input = launcher.getByRole('searchbox', { name: 'Search Kaomoji', exact: true }); await input.fill(''); await launcher.waitForFunction(() => document.querySelectorAll('li.launcher-command-row').length === 64);
    await input.press('Meta+k'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('Enter');
    const form = launcher.locator('section[aria-label="Kaomoji Search"] form'); await form.waitFor();
    const labels = await form.locator('select').evaluateAll(nodes => nodes.map(node => ({ label: node.getAttribute('aria-label'), options: [...node.options].map(option => ({ title: option.textContent, value: option.value })), value: node.value })));
    if (JSON.stringify(labels) !== JSON.stringify([{label:'Display Mode',options:[{title:'List',value:'list'},{title:'Grid',value:'grid'}],value:'list'},{label:'Primary Action',options:[{title:'Copy to Clipboard',value:'copy-to-clipboard'},{title:'Paste to Active App',value:'paste-to-active-app'}],value:'paste-to-active-app'}])) throw new Error('Preference contract mismatch: ' + JSON.stringify(labels));
    if (await launcher.evaluate(() => document.activeElement?.getAttribute('aria-label')) !== 'Display Mode') throw new Error('First preference is not focused'); return labels;
  `)
  await capture(await target('launcher'), join(evidence, 'preferences-list-paste-dark.png'))
  await run(`await launcher.keyboard.press('Escape'); await launcher.getByRole('searchbox', { name: 'Search Kaomoji', exact: true }).waitFor(); return { nestedEscapeReturned: true };`)
  await run(`
    const input = launcher.getByRole('searchbox', { name: 'Search Kaomoji', exact: true }); await input.press('Meta+k'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('Enter');
    await launcher.getByLabel('Display Mode').selectOption('grid'); await launcher.getByLabel('Primary Action').selectOption('copy-to-clipboard');
    await launcher.getByRole('button', { name: 'Save Preferences', exact: true }).click(); await launcher.waitForFunction(() => document.querySelectorAll('li.launcher-command-row img[src^="data:image/svg+xml;base64,"]').length > 0);
    const section = launcher.locator('section[aria-label="Kaomoji Search"]'); const rows = section.locator('li.launcher-command-row'); const actions = section.locator('button.launcher-command-menu-item');
    const sources = await rows.locator('img').evaluateAll(images => images.map(image => image.getAttribute('src')));
    if (await rows.count() > 64 || await actions.count() > 256 || sources.some(src => !src?.startsWith('data:image/svg+xml;base64,'))) throw new Error('Grid projection/image bound failed');
    if (await section.locator('footer').getByRole('button', { name: 'Copy to Clipboard' }).count() !== 1) throw new Error('Copy did not become primary'); return { rows: await rows.count(), actions: await actions.count(), sources };
  `).then(grid => {
    assert.equal(grid.sources.length, grid.rows)
    for (const source of grid.sources as string[]) assert.equal(isTrustedRaycastKaomojiSvg(Buffer.from(source.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')), true, 'non-canonical Kaomoji SVG reached the renderer')
  })
  await capture(await target('launcher'), join(evidence, 'grid-dark.png'))
  await run(`
    const section = launcher.locator('section[aria-label="Kaomoji Search"]'); await section.locator('li.launcher-command-row').first().focus(); await launcher.keyboard.press('Enter');
    await section.getByRole('alert').filter({ hasText: 'Clipboard Copy is disabled in the bounded visual proof' }).waitFor(); return { enterPrimaryDenied: true };
  `)
  assert.equal(existsSync(kaomoji.stateFile), false, 'denied Copy mutated state')
  await run(`await workbench.evaluate(() => window.dshDesktop.syncLauncherTheme({ mode: 'light', skinId: null })); await launcher.waitForFunction(() => document.documentElement.style.colorScheme === 'light'); return await launcher.locator('li.launcher-command-row img').evaluateAll(images => images.map(image => image.getAttribute('src')));`).then(sources => {
    for (const source of sources as string[]) { assert.ok(source.startsWith('data:image/svg+xml;base64,')); assert.equal(isTrustedRaycastKaomojiSvg(Buffer.from(source.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')), true, 'non-canonical light Kaomoji SVG reached the renderer') }
  })
  await capture(await target('launcher'), join(evidence, 'grid-light.png'))
  const preferencesChanged = await run(`
    const input = launcher.getByRole('searchbox', { name: 'Search Kaomoji', exact: true }); await input.focus(); await input.press('Meta+k'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('ArrowDown'); await launcher.keyboard.press('Enter');
    await launcher.getByLabel('Display Mode').waitFor(); return { displayMode: await launcher.getByLabel('Display Mode').inputValue(), primaryAction: await launcher.getByLabel('Primary Action').inputValue() };
  `)
  await capture(await target('launcher'), join(evidence, 'preferences-grid-copy-light.png'))
  await run(`await launcher.getByLabel('Display Mode').selectOption('list'); await launcher.getByLabel('Primary Action').selectOption('paste-to-active-app'); await launcher.getByRole('button', { name: 'Save Preferences', exact: true }).click(); await launcher.waitForFunction(() => document.querySelectorAll('li.launcher-command-row').length === 64); return true;`)
  await capture(await target('launcher'), join(evidence, 'list-light.png'))

  await assertNoFocusTheft('interactions-complete')
  assert.equal(existsSync(kaomoji.stateFile), false)
  const tempGoogleAfter = manifest(extensionPaths(userData, 'google-translate'))
  const liveAfter = manifest(protectedLivePaths())
  await writeFile(join(evidence, 'disposable-google-after.manifest'), `${tempGoogleAfter}\n`)
  await writeFile(join(evidence, 'live-after.manifest'), `${liveAfter}\n`)
  assert.equal(tempGoogleAfter, tempGoogleBefore)
  assert.equal(liveAfter, liveBefore)
  assert.equal(fileDigest(join(evidence, 'disposable-google-after.manifest')), fileDigest(join(evidence, 'disposable-google-before.manifest')))
  assert.equal(fileDigest(join(evidence, 'live-after.manifest')), fileDigest(join(evidence, 'live-before.manifest')))
  const screenshots = ['list-dark.png','action-panel-dark.png','search-outside-initial-dark.png','empty-dark.png','preferences-list-paste-dark.png','grid-dark.png','grid-light.png','preferences-grid-copy-light.png','list-light.png']
  const dimensions = []
  for (const file of screenshots) {
    const result = await execFile('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', join(evidence, file)], { timeout: 5000 })
    const width = Number(result.stdout.match(/pixelWidth: (\d+)/)?.[1]); const height = Number(result.stdout.match(/pixelHeight: (\d+)/)?.[1])
    assert.deepEqual({ width, height }, { width: 1500, height: 950 }); dimensions.push({ file, height, width })
  }
  await writeFile(join(evidence, 'proof.json'), `${JSON.stringify({ accessibility: { actionPanel, firstPreferenceFocused: true, listLabel: 'Kaomoji Results', nestedEscapeReturned: true, searchLabel: 'Search Kaomoji' }, artifactSha256: expectedArtifact, captureMethod: 'CDP Page.captureScreenshot', derivedIdentities: identities, focusProof: { checkpoints: focusCheckpoints, policy: 'Any TockTeam gate-app activation or BrowserWindow focus makes this proof inconclusive; unrelated frontmost application changes are allowed.' }, geometry, manifestSnapshots: { disposableGoogle: { after: { file: 'disposable-google-after.manifest', sha256: fileDigest(join(evidence, 'disposable-google-after.manifest')) }, before: { file: 'disposable-google-before.manifest', sha256: fileDigest(join(evidence, 'disposable-google-before.manifest')) }, entries: tempGoogleBefore.split('\n').length }, liveProfiles: { after: { file: 'live-after.manifest', sha256: fileDigest(join(evidence, 'live-after.manifest')) }, before: { file: 'live-before.manifest', sha256: fileDigest(join(evidence, 'live-before.manifest')) }, completeDesktopProfileTrees: true, entries: liveBefore.split('\n').length, roots: ['TockTeam-Desktop-Dev', 'TockTeam-Desktop'] } }, mockedEffects: { copyDeniedWithoutStateMutation: true, pasteDeniedWithoutStateMutation: true }, preferenceContract, preferencesChanged, references, screenshots: dimensions, search, stateUnmutated: true, translateStateUnchanged: true, visualScope: 'Official Featured Kaomoji operational scope; not described as Recommended.' }, null, 2)}\n`)
  completed = true
} catch (error) { failure = error }

const cleanupErrors: unknown[] = []
let childClosed = electronChild === undefined
let helperResidueGone = electronChild === undefined
if (attached) await execFile('playwright-cli', [`-s=${session}`, 'detach'], { cwd: evidence || tmpdir(), timeout: 30_000 }).catch(error => cleanupErrors.push(error))
if (focusClient) {
  if (electronChild?.pid) await readFocusProofProcessSnapshot().then(snapshot => { observedDescendants = focusProofDescendants(snapshot, electronChild!.pid!) }).catch(error => cleanupErrors.push(error))
  await focusClient.shutdownAndWait().catch(error => cleanupErrors.push(error))
  childClosed = focusClient.closed
}
if (electronChild && !focusClient) cleanupErrors.push(new Error('Proof Electron launched without an authenticated focus client'))
if (childClosed && electronChild) {
  await readFocusProofProcessSnapshot().then(after => {
    const residue = findFocusProofResidue(processBefore, after, { gatePgid, markers: residueMarkers, observedDescendants })
    if (residue.length > 0) throw new Error(`Proof Electron helper residue remained: ${residue.length}`)
    helperResidueGone = true
  }).catch(error => cleanupErrors.push(error))
}
const cleanupOwnershipReleased = childClosed && helperResidueGone
if (workspaceSnapshotCaptured && cleanupOwnershipReleased) await cleanupPostBaselineTrustedRaycastWorkspaces(tmpdir(), workspacesBefore).then(result => { workspaceCleanupRemoved = result.removed }).catch(error => cleanupErrors.push(error))
if (userData && cleanupOwnershipReleased) await rm(userData, { recursive: true, force: true }).catch(error => cleanupErrors.push(error))
try { if (userData) assert.equal(existsSync(userData), false); if (workspaceSnapshotCaptured) assert.deepEqual(readdirSync(tmpdir()).filter(name => name.startsWith('tockteam-trusted-raycast-')).sort(), workspacesBefore); if (liveBefore) assert.equal(manifest(protectedLivePaths()), liveBefore); if (debugPort > 0) await assert.rejects(() => fetch(`http://127.0.0.1:${debugPort}/json/list`)) } catch (error) { cleanupErrors.push(error) }
if (failure !== undefined || cleanupErrors.length > 0 || !completed) {
  if (evidence && cleanupOwnershipReleased) await rm(evidence, { recursive: true, force: true }).catch(() => {})
  if (failure !== undefined && cleanupErrors.length > 0) throw new AggregateError([failure, ...cleanupErrors], 'Bounded Electron proof and cleanup failed')
  throw failure ?? new AggregateError(cleanupErrors, 'Bounded Electron proof cleanup failed')
}
const proofPath = join(evidence, 'proof.json')
const proof = JSON.parse(await readFile(proofPath, 'utf8')) as Record<string, any>
proof.focusProof.messageCount = focusClient?.messageCount
proof.cleanup = { childClosed, debugPortClosed: true, electronPid: electronChild?.pid, helperResidueGone, temporaryRootRemoved: true, trustedWorkspaceRootsRemoved: workspaceCleanupRemoved, trustedWorkspacesRestored: true }
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`)
await publishTrustedRaycastProofExclusive(evidence, finalEvidence)
