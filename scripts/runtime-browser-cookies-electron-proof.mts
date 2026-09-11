import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CdpPage } from './launcher-packaged-smoke.mjs'
import { ensureElectronInstalled } from './electron-runtime.mjs'
import { stopChildProcess } from './process-cleanup.mjs'
import { createFocusProofClient } from './trusted-raycast-focus-proof-client.ts'

// Bounded, inactive real-app proof; deliberately reuses a disposable persisted cookie jar.
assert.equal(process.platform, 'darwin', 'This inactive Electron proof currently targets macOS')
const repository = resolve('.')
const home = await mkdtemp(join(tmpdir(), 'tockteam-cookie-startup-'))
const checkpoints: unknown[] = []
const protectedPaths = ['dsh/profiles/desktop/package.json', 'dsh/profiles/desktop/cordis.yml', 'dsh/profiles/desktop/cordis.patch.yml', 'dsh/.credentials.yaml']
const protectedHashes = () => Promise.all(protectedPaths.map(async path => createHash('sha256').update(await readFile(join(home, path))).digest('hex')))

async function boot(phase: 'seed' | 'verify'): Promise<void> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  const nonce = randomBytes(32).toString('hex')
  const child = spawn(ensureElectronInstalled(repository), ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${home}`], {
    cwd: repository, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, TOCKTEAM_LAUNCHER_INACTIVE_VISUAL_PROOF: '1', TOCKTEAM_LAUNCHER_VISUAL_PROOF_NONCE: nonce,
      TOCKTEAM_LAUNCHER_SMOKE_EXTENDED_DISPLAY: '1', TOCKTEAM_LAUNCHER_SMOKE_REQUIRE_EXTENDED_DISPLAY: '1', TOCKTEAM_TRUSTED_RAYCAST_DENY_EFFECTS_PROOF: '1' },
  })
  console.log(JSON.stringify({ phase, rootPid: child.pid }))
  const focus = createFocusProofClient(child, nonce)
  let diagnostics = ''
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => { diagnostics = (diagnostics + String(chunk).replace(/([?&]token=)[^\s)]+/gu, '$1<redacted>')).slice(-16000) })
  let page: Awaited<ReturnType<typeof CdpPage.connect>> | undefined
  try {
    await focus.ready()
    const deadline = Date.now() + 45000
    let target: { url: string; webSocketDebuggerUrl: string } | undefined
    while (Date.now() < deadline) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json()
        target = targets.find((value: { type: string; url: string }) => value.type === 'page' && value.url.startsWith('http:'))
        if (target) break
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(target, 'workbench page missing')
    page = await CdpPage.connect(target.webSocketDebuggerUrl)
    let mounted = false
    while (Date.now() < deadline) {
      const state = await page.evaluate('({ mounted: document.documentElement.dataset.tockteamDesktop === "true", body: document.body?.innerText ?? "" })')
      assert.ok(!state.body.includes('Failed to load plugins'), state.body.slice(0, 5000))
      if (state.mounted) { mounted = true; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(mounted, 'Desktop browser client did not mount')
    checkpoints.push(await focus.checkpoint(phase))
    if (phase === 'seed') {
      const url = new URL(target.url).origin
      const expires = Math.floor(Date.now() / 1000) + 86400
      const cookies = Array.from({ length: 61 }, (_, index) => ({
        name: `dsh-auth-${createHash('sha256').update(`127.0.0.1:${42000 + index}`).digest('base64url')}`,
        value: 'x'.repeat(173), url, path: '/', httpOnly: true, sameSite: 'Strict', expires,
      }))
      await page.call('Network.setCookies', { cookies: [...cookies, { name: 'unrelated-proof-cookie', value: 'preserve-me', url, path: '/', expires }] })
    } else {
      const { cookies } = await page.call('Network.getAllCookies')
      assert.equal(cookies.filter((cookie: { name: string }) => cookie.name.startsWith('dsh-auth-')).length, 1, 'only the active runtime auth cookie should remain')
      assert.ok(cookies.some((cookie: { name: string; value: string }) => cookie.name === 'unrelated-proof-cookie' && cookie.value === 'preserve-me'))
      console.log('Desktop mounted; active authentication and unrelated cookie preserved')
    }
  } catch (error) {
    console.error(diagnostics)
    throw error
  } finally {
    page?.close()
    try { await focus.shutdownAndWait() } finally { await stopChildProcess(child) }
    console.log(JSON.stringify({ phase, processGroupStopped: child.pid }))
  }
}

try {
  await boot('seed')
  const database = new DatabaseSync(join(home, 'Cookies'), { readOnly: true })
  try {
    const row = database.prepare('SELECT COUNT(*) AS count FROM cookies WHERE name LIKE ?').get('dsh-auth-%')
    assert.ok(Number(row?.count) >= 61, 'stale cookies must actually persist across app launches')
  } finally { database.close() }
  const before = await protectedHashes()
  await boot('verify')
  assert.deepEqual(await protectedHashes(), before, 'profiles and runtime credentials must remain unchanged')
  console.log(JSON.stringify({ result: 'passed', staleCookies: 61, profilesAndCredentialsUnchanged: true, checkpoints }))
} finally {
  await rm(home, { recursive: true, force: true })
  console.log('Disposable profile removed')
}
