import assert from 'node:assert/strict'
import { spawn, execFile as execFileCallback } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { ensureElectronInstalled } from './electron-runtime.mjs'
import { createFocusProofClient, focusProofDescendants, readFocusProofProcessSnapshot, type ProofProcessRow } from './trusted-raycast-focus-proof-client.ts'
import { TRUSTED_PROOF_PAGE_SELECTOR_SOURCE, waitForTrustedProofPage } from './trusted-raycast-proof-pages.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'
import { trustedRaycastDataPaths } from '../src/trusted-raycast-paths.ts'
import { saveTrustedRaycastPreferences } from '../src/trusted-raycast-preferences.ts'
import { saveKaomojiPreferences, KAOMOJI_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-kaomoji-preferences.ts'
import { TRUSTED_RAYCAST_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-contract.ts'

const execFile = promisify(execFileCallback)
const repository = resolve('.')
const evidence = await mkdtemp(join(tmpdir(), 'can-i-use-electron-evidence-'))
const userData = await mkdtemp(join(tmpdir(), 'can-i-use-electron-profile-'))
const session = `can-i-use-electron-${process.pid}`
// The CLI sandbox exposes Page waits, not Node's timer globals.
const selectors = `const setTimeout = (callback, ms) => page.waitForTimeout(ms).then(callback); ${TRUSTED_PROOF_PAGE_SELECTOR_SOURCE}`
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
const manifest = (roots: readonly string[]): string => {
  const entries: string[] = []
  const walk = (path: string): void => {
    if (!existsSync(path)) { entries.push(`${path}:absent`); return }
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) { entries.push(`${path}:symlink`); return }
    if (!stat.isDirectory()) { entries.push(`${path}:${digest(path)}`); return }
    entries.push(`${path}:directory`)
    // Can I Use owns its nested namespace, not any legacy installation bytes.
    for (const name of readdirSync(path).sort()) if (!(path.endsWith('/trusted-raycast-install') && name === 'can-i-use')) walk(join(path, name))
  }
  roots.forEach(walk); return entries.join('\n')
}
const legacyPaths = (home: string): string[] => (['google-translate', 'kaomoji-search'] as const).flatMap(id => Object.values(trustedRaycastDataPaths(home, id)))
const livePaths = ['TockTeam-Desktop', 'TockTeam-Desktop-Dev'].flatMap(name => {
  const home = join(homedir(), 'Library/Application Support', name)
  return [...legacyPaths(home), ...Object.values(trustedRaycastDataPaths(home, 'can-i-use')), join(home, 'dsh/profiles/desktop')]
})
const liveBefore = manifest(livePaths)
const checkpoints: unknown[] = []
const focusEvents: unknown[] = []
const cliAbort = new AbortController()
const observed = new Map<number, ProofProcessRow>()
let electron: ReturnType<typeof spawn> | undefined
let focus: ReturnType<typeof createFocusProofClient> | undefined
let attached = false
let legacyBefore = ''
let failure: unknown
let port = 0
let log = ''
let result: unknown
let sampler: NodeJS.Timeout | undefined
let sampling: Promise<void> = Promise.resolve()
const observe = async (): Promise<void> => {
  if (!electron?.pid) return
  const rows = await readFocusProofProcessSnapshot()
  for (const row of [...focusProofDescendants(rows, process.pid), ...rows.filter(row => row.command.includes(session) || row.command.includes(userData))]) observed.set(row.pid, row)
}
const cli = async (...args: string[]) => {
  const output = await execFile('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 60000, maxBuffer: 2 * 1024 * 1024, ...(['detach', 'close'].includes(args[0]!) ? {} : { signal: cliAbort.signal }) })
  if (/### Error/u.test(output.stdout)) throw new Error(output.stdout)
  return output.stdout
}
const capture = async (name: string): Promise<void> => {
  const target = await waitForTrustedProofPage(async () => ((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { title: string; url: string; webSocketDebuggerUrl: string }[]).map(target => ({ target, title: async () => target.title, url: () => target.url })), 'launcher')
  const socket = new WebSocket(target.target.webSocketDebuggerUrl)
  const timeout = setTimeout(() => socket.close(), 10000)
  try {
    const result = await new Promise<string>((resolve, reject) => {
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { captureBeyondViewport: false, format: 'png', fromSurface: true } })))
      socket.addEventListener('message', event => { const value = JSON.parse(String(event.data)); if (value.id === 1) value.error ? reject(new Error(value.error.message)) : resolve(value.result.data) })
      socket.addEventListener('error', () => reject(new Error('Screenshot connection failed')))
      socket.addEventListener('close', () => reject(new Error('Screenshot connection closed')))
    })
    await writeFile(join(evidence, name), Buffer.from(result, 'base64'))
  } finally { clearTimeout(timeout); socket.close() }
}
const run = async (body: string) => {
  const output = await cli('run-code', `async page => { ${selectors} const [launcher, workbench] = await Promise.all([waitForTrustedProofPage(() => page.context().pages(), 'launcher'), waitForTrustedProofPage(() => page.context().pages(), 'workbench')]); ${body} }`)
  await writeFile(join(evidence, 'interactions.txt'), output, { flag: 'a' })
  await observe(); checkpoints.push(await focus!.checkpoint('interaction'))
  return output
}
try {
  assert.equal(process.platform, 'darwin')
  console.log(JSON.stringify({ evidence, userData, runnerPid: process.pid }))
  for (const args of [['scripts/build.mjs'], ['scripts/stage-dsh.mjs', '--quick']]) {
    const built = await execFile(process.execPath, args, { cwd: repository, timeout: 180000, maxBuffer: 4 * 1024 * 1024 }); log += built.stdout + built.stderr
  }
  for (const id of ['google-translate', 'kaomoji-search'] as const) {
    const paths = trustedRaycastDataPaths(userData, id)
    if (id === 'google-translate') await saveTrustedRaycastPreferences(paths.preferencesFile, { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: false })
    else await saveKaomojiPreferences(paths.preferencesFile, KAOMOJI_PREFERENCE_DEFAULTS)
    const manager = new TrustedRaycastManager({ runtimeDir: '', nodePath: process.execPath, onMessage: () => {} })
    const store = new TrustedRaycastTrustStore({ descriptor: trustedRaycastDescriptors[id], installRoot: paths.installRoot, stateFile: paths.trustFile,
      candidateDir: join(repository, id === 'google-translate' ? 'dist/trusted-raycast' : 'dist/trusted-raycast-kaomoji'), preview: directory => manager.previewRuntime(directory, id) })
    try { store.stage(); await store.preview(); store.apply(); store.enable() } finally { await manager.close() }
  }
  legacyBefore = manifest(legacyPaths(userData))
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); port = (server.address() as { port: number }).port; await new Promise<void>(resolve => server.close(() => resolve()))
  const nonce = randomBytes(32).toString('hex')
  electron = spawn(ensureElectronInstalled(repository), ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    cwd: repository, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, TOCKTEAM_LAUNCHER_INACTIVE_VISUAL_PROOF: '1', TOCKTEAM_LAUNCHER_VISUAL_PROOF_NONCE: nonce,
      TOCKTEAM_LAUNCHER_SMOKE_EXTENDED_DISPLAY: '1', TOCKTEAM_LAUNCHER_SMOKE_REQUIRE_EXTENDED_DISPLAY: '1', TOCKTEAM_TRUSTED_RAYCAST_DENY_EFFECTS_PROOF: '1' },
  })
  await writeFile(join(evidence, 'root-pid.json'), JSON.stringify({ pid: electron.pid }))
  electron.stdout?.on('data', chunk => { log = `${log}${chunk}`.slice(-131072) }); electron.stderr?.on('data', chunk => { log = `${log}${chunk}`.slice(-131072) })
  focus = createFocusProofClient(electron, nonce)
  electron.on('message', (raw: any) => {
    if (raw?.nonce === nonce && raw.type === 'FOCUS_INCONCLUSIVE') {
      focusEvents.push({ kind: raw.kind, sequence: raw.sequence, windowId: raw.windowId, timestamp: Date.now() })
      cliAbort.abort(new Error('Proof focus event; interaction aborted'))
    }
  })
  await focus.ready()
  sampler = setInterval(() => { sampling = sampling.then(observe).catch(error => { failure ??= error }) }, 200)
  const until = Date.now() + 60000
  while (Date.now() < until) { try { const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { title: string }[]; if (pages.length) break } catch {}; await new Promise(resolve => setTimeout(resolve, 100)) }
  await cli('attach', `--cdp=http://127.0.0.1:${port}`); attached = true
  await cli('run-code', `async page => { ${selectors} const workbench = await waitForTrustedProofPage(() => page.context().pages(), 'workbench'); await workbench.evaluate(() => window.dshDesktop.launcher.show()); return true; }`)
  checkpoints.push(await focus.checkpoint('launcher-ready'))
  await run(`
    await launcher.evaluate(() => { window.__canProofViolations = []; document.addEventListener('securitypolicyviolation', event => window.__canProofViolations.push(event.effectiveDirective)); });
    await workbench.evaluate(() => window.dshDesktop.launcher.settings.updateSetting('window.hideWindowOn', []));
    await workbench.evaluate(() => window.dshDesktop.syncLauncherTheme({ mode: 'dark', skinId: 'tockteam-skin-deep-current' }));
    await launcher.locator('#launcher-search').fill('Can I Use');
    await launcher.locator('[data-result-id="trusted-raycast:setup:can-i-use"]').waitFor(); await launcher.locator('#launcher-search').press('Enter');
    await launcher.getByRole('button', { name: 'Approve and Open', exact: true }).waitFor();
    await launcher.keyboard.press('Escape');
    if (await launcher.locator('#launcher-search').inputValue() !== 'Can I Use') throw new Error('Escape lost search');
    if ((await launcher.evaluate(() => window.tockteamLauncher.getTrustedRaycastTrust('can-i-use'))).installed) throw new Error('Review mutated installation');
    await launcher.locator('#launcher-search').press('Enter');
    await launcher.getByRole('button', { name: 'Approve and Open', exact: true }).waitFor();
    await launcher.keyboard.press('Enter');
    await launcher.getByRole('textbox', { name: 'Browser Targets' }).waitFor(); return true;
  `)
  await capture('setup-dark.png')
  await run(`
    await launcher.getByRole('textbox', { name: 'Browser Targets' }).fill('defaults'); await launcher.keyboard.press('Meta+Enter');
    await launcher.getByRole('alert').filter({ hasText: 'Use supported exact browser targets' }).waitFor();
    await launcher.getByRole('textbox', { name: 'Browser Targets' }).fill('chrome 100'); await launcher.keyboard.press('Meta+Enter');
    await launcher.getByRole('status').filter({ hasText: 'Showing 64 of 581 matches.' }).waitFor();
    const search = launcher.getByRole('searchbox', { name: 'Search Web Features' }); await search.fill('textcontent');
    await launcher.getByRole('status').filter({ hasText: 'Showing 1 of 1 matches.' }).waitFor(); await search.press('Enter');
    await launcher.getByRole('status').filter({ hasText: 'Showing 14 of 14 browsers.' }).waitFor();
    if (await launcher.getByRole('img', { name: 'Supported', exact: true }).first().evaluate(element => getComputedStyle(element).color) !== 'rgb(74, 222, 128)') throw Error('dark support color missing'); return true;
  `)
  await capture('detail-dark.png')
  await run(`
    await launcher.getByRole('button', { name: 'Open in Browser', exact: true }).click(); await launcher.getByRole('alert').filter({ hasText: 'Browser opening is disabled' }).waitFor();
    await launcher.keyboard.press('Escape'); await launcher.getByRole('status').filter({ hasText: 'Showing 1 of 1 matches.' }).waitFor();
    return { dark: true, preferences: true, browserDenied: true, back: true };
  `)
  await run(`
    await workbench.evaluate(() => window.dshDesktop.syncLauncherTheme({ mode: 'light', skinId: null }));
    await launcher.waitForFunction(() => document.documentElement.style.colorScheme === 'light');
    const search = launcher.getByRole('searchbox', { name: 'Search Web Features' });
    await launcher.getByRole('status').filter({ hasText: 'Showing 1 of 1 matches.' }).waitFor();
    if (await search.inputValue() !== 'textcontent') throw Error('theme lost search');
    await launcher.waitForFunction(() => !document.querySelector('#trusted-raycast-search').disabled);
    await search.press('Enter'); await launcher.getByRole('status').filter({ hasText: 'Showing 14 of 14 browsers.' }).waitFor();
    if (await launcher.getByRole('img', { name: 'Supported', exact: true }).first().evaluate(element => getComputedStyle(element).color) !== 'rgb(21, 128, 61)') throw Error('light support color missing'); return true;
  `)
  await capture('detail-light.png')
  await run(`
    const search = launcher.getByRole('searchbox', { name: 'Search Web Features' });
    await launcher.getByRole('button', { name: 'Preferences', exact: true }).click();
    await launcher.getByRole('combobox', { name: 'Brief Mode' }).selectOption('true'); await launcher.keyboard.press('Meta+Enter');
    await launcher.getByRole('status').filter({ hasText: 'Showing 64 of 581 matches.' }).waitFor();
    await search.fill('no-such-feature-for-proof'); await launcher.getByRole('status').filter({ hasText: 'Showing 0 of 0 matches.' }).waitFor(); return true;
  `)
  await capture('empty-light.png')
  await run(`
    if ((await launcher.evaluate(() => window.__canProofViolations)).length) throw Error('Can I Use violated the launcher CSP');
    await launcher.keyboard.press('Escape');
    for (const [query, id, label] of [['Translate', 'google-translate:translate', 'Google Translate'], ['Search Kaomoji', 'kaomoji-search:index', 'Kaomoji Search']]) {
      await launcher.locator('#launcher-search').fill(query); await launcher.locator('[data-result-id="trusted-raycast:' + id + '"]').waitFor(); await launcher.locator('#launcher-search').press('Enter');
      await launcher.locator('section[aria-label="' + label + '"]').waitFor(); await launcher.keyboard.press('Escape');
    }
    return { light: true, empty: true, preferencesReopened: true, legacyCommandsOpened: true };
  `)
  assert.equal(JSON.parse(readFileSync(trustedRaycastDataPaths(userData, 'can-i-use').preferencesFile, 'utf8')).briefMode, true)
  assert.equal(manifest(legacyPaths(userData)), legacyBefore)
  assert.equal(manifest(livePaths), liveBefore)
  result = { passed: true, checkpoints, legacyUnchanged: true, liveProfilesUnchanged: true, externalBrowserOpened: false,
    artifact: trustedRaycastDescriptors['can-i-use'].artifactSha256, identity: JSON.parse(readFileSync(join(trustedRaycastDataPaths(userData, 'can-i-use').installRoot, 'current/build.json'), 'utf8')) }
} catch (error) {
  failure = error
  if (attached && focusEvents.length === 0) {
    await capture('failure.png').catch(() => {})
    await cli('run-code', `async page => { ${selectors} const launcher = await waitForTrustedProofPage(() => page.context().pages(), 'launcher'); return await launcher.evaluate(async () => ({ text: document.body.innerText, canIUse: await window.tockteamLauncher.getTrustedRaycastTrust('can-i-use') })); }`).then(output => writeFile(join(evidence, 'failure-ui.txt'), output)).catch(() => {})
  }
}
finally {
  const errors: unknown[] = []
  if (sampler) clearInterval(sampler)
  await sampling
  if (attached) {
    await cli('detach').catch(error => errors.push(error))
    await cli('close').catch(error => errors.push(error))
  }
  await observe().catch(error => errors.push(error))
  if (focus) await focus.shutdownAndWait().catch(error => errors.push(error))
  if (electron?.pid && !focus?.closed) { try { process.kill(-electron.pid, 'SIGTERM') } catch {} }
  await new Promise(resolve => setTimeout(resolve, 300))
  const owned = (row: ProofProcessRow) => row.pid === electron?.pid || observed.get(row.pid)?.command === row.command || row.command.includes(session) || row.command.includes(userData)
  let residue = (await readFocusProofProcessSnapshot()).filter(owned)
  if (residue.length) {
    errors.push(new Error(`Graceful cleanup left owned processes: ${residue.map(row => row.pid).join(',')}`))
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
      for (const row of residue) { try { process.kill(row.pgid === row.pid ? -row.pid : row.pid, signal) } catch {} }
      await new Promise(resolve => setTimeout(resolve, 300))
      residue = (await readFocusProofProcessSnapshot()).filter(owned)
    }
  }
  if (residue.length) errors.push(new Error(`Owned processes remain: ${residue.map(row => row.pid).join(',')}`))
  if (!residue.length) await rm(userData, { recursive: true, force: true })
  if (manifest(livePaths) !== liveBefore) errors.push(new Error('Live profile changed; no restoration attempted'))
  await writeFile(join(evidence, 'server.log'), log)
  await writeFile(join(evidence, 'proof.json'), JSON.stringify({ result, checkpoints, focusEvents, rootPid: electron?.pid, observedPids: [...observed.keys()], allOwnedProcessesGone: residue.length === 0, failure: failure instanceof Error ? failure.stack : failure, cleanupErrors: errors.map(String) }, null, 2))
  console.log(`Evidence: ${evidence}`)
  if (failure || errors.length) throw new AggregateError([failure, ...errors].filter(Boolean), 'Can I Use Electron verification failed')
}
