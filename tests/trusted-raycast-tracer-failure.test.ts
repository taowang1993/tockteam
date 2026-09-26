import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseTrustedRaycastResult } from '../src/trusted-raycast-tracer-contract.ts'
// @ts-expect-error First-party installed proof helpers.
import { runCanIUseInstalledSmoke, runBundledTrustedRaycastInstalledSmoke, runTrustedRaycastInstalledRestartSmoke } from '../scripts/trusted-raycast-can-i-use-installed-proof.mjs'
// @ts-expect-error Existing first-party process-group cleanup helper.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'

const input = 'TockTeam compatibility tracer: hello world'

/** Exercise the real CLI, admitted source, and manager; replace only external HTTP. */
async function trace(noResult: boolean) {
  const work = mkdtempSync(join(tmpdir(), 'raycast-tracer-test-'))
  const metadata = join(work, 'child.json')
  const network = join(work, 'network.mjs')
  const preload = join(work, 'preload.mjs')
  writeFileSync(network, `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const preferences = JSON.parse(process.env.TRUSTED_RAYCAST_PREFERENCES);
assert.equal(preferences.lang1, 'zh-CN');
assert.equal(preferences.autoInput, false);
const { MockAgent, setGlobalDispatcher } = createRequire(join(process.cwd(), 'child.mjs'))('undici');
const agent = new MockAgent(); agent.disableNetConnect(); setGlobalDispatcher(agent);
agent.get('https://translate.google.com').intercept({ path: /^\\/translate_a\\/single\\?/, method: 'GET' }).reply(options => {
  const url = new URL(options.path, 'https://translate.google.com');
  const query = url.searchParams.get('q');
  const translated = url.searchParams.get('tl') === 'zh-CN' ? '离线翻译' : 'offline translation';
  return { statusCode: 200, data: JSON.stringify([[[translated, query]], null, 'en', null, null, null, null, null, [['en']]]) };
}).persist();
`)
  writeFileSync(preload, `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { writeFileSync } from 'node:fs';
const spawn = childProcess.spawn;
childProcess.spawn = (file, args, options) => {
  const owned = args?.some(arg => arg.endsWith('/child.mjs'));
  const child = spawn(file, owned ? ['--import', ${JSON.stringify(pathToFileURL(network).href)}, ...args] : args, options);
  if (owned) writeFileSync(${JSON.stringify(metadata)}, JSON.stringify({ pid: child.pid, workspace: options.cwd }));
  return child;
};
syncBuiltinESMExports();
`)
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/trusted-raycast-tracer.mjs'], {
    env: { ...process.env, TRUSTED_RAYCAST_ARTIFACT_TAR: resolve('plugins/trusted-raycast/vendor/google-translate.tar'), TRUSTED_RAYCAST_FORCE_NO_RESULT: noResult ? '1' : '0', TRUSTED_RAYCAST_CHILD_DEADLINE_MS: noResult ? '300' : '5000' },
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let timer: NodeJS.Timeout | undefined
  try {
    return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      let stdout = ''; let stderr = ''
      const append = (chunk: Buffer, error: boolean): void => {
        if (error) stderr += chunk.toString(); else stdout += chunk.toString()
        if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 1024 * 1024) reject(new Error('Tracer output exceeded its bound'))
      }
      child.stdout.on('data', chunk => append(chunk, false))
      child.stderr.on('data', chunk => append(chunk, true))
      child.once('error', reject)
      child.once('close', code => resolve({ code, stdout, stderr }))
      timer = setTimeout(() => reject(new Error('Tracer test timed out')), 20000)
    })
  } finally {
    clearTimeout(timer)
    // The tracer normally closes its detached child in finally. Also cover timeouts.
    await stopOwnedChild(child, 250, true)
    try {
      const child = JSON.parse(readFileSync(metadata, 'utf8')) as { pid: number; workspace: string }
      await stopOwnedChild({ pid: child.pid, exitCode: 0, signalCode: null }, 250, true)
      rmSync(child.workspace, { recursive: true, force: true })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    rmSync(work, { recursive: true, force: true })
  }
}

test('tracer reaches readiness before rejecting a child that emits no result', { skip: process.platform === 'win32', timeout: 30000 }, async () => {
  const result = await trace(true)
  assert.equal(result.code, 1)
  assert.match(result.stdout, /^READY\n/m)
  assert.doesNotMatch(result.stdout, /^RESULT /m)
  assert.match(result.stderr, /trusted Raycast child deadline: no validated translation result/)
})

test('tracer emits an admitted Chinese translation without external network access', { skip: process.platform === 'win32', timeout: 30000 }, async () => {
  const result = await trace(false)
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /^READY\n/m)
  assert.deepEqual(parseTrustedRaycastResult(result.stdout, input), { input, target: 'zh-CN', translated: '离线翻译' })
})

test('every installed trusted-command proof skips non-macOS without driving a renderer', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const unexpected = () => { throw new Error('Unsupported proof must not drive the renderer') }
  try {
    for (const value of ['linux', 'win32']) {
      Object.defineProperty(process, 'platform', { ...platform, value })
      for (const proof of [runCanIUseInstalledSmoke, runBundledTrustedRaycastInstalledSmoke, runTrustedRaycastInstalledRestartSmoke]) {
        assert.deepEqual(await proof({ evaluate: unexpected }, '/unused', { waitFor: unexpected, clickExactText: unexpected }), {
          verified: false, reason: 'Trusted compatibility invocation is macOS-only',
        })
      }
    }
  } finally { Object.defineProperty(process, 'platform', platform) }
})
