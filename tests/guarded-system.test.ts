import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { requestGuardedSystem } from '../plugins/shared/guarded-system.ts'
import { readFocusProofProcessSnapshot } from '../scripts/trusted-raycast-focus-proof-client.ts'
import { cleanupPostBaselineTrustedRaycastWorkspaces } from '../scripts/trusted-raycast-proof-cleanup.ts'
import { ProductionMarketplacePlatform } from '../plugins/plugin-marketplace/src/host/platform.ts'

// The wire is the external system boundary; no native command is faked in production.
test('guarded system client is opt-in and fails closed on rejected, missing or malformed capability responses', { skip: process.platform === 'win32' ? 'Unix-socket capability' : false }, async () => {
  assert.equal(await requestGuardedSystem({ action: 'processes' }, {}), undefined)
  const root = await mkdtemp(join(tmpdir(), 'guarded-client-'))
  const path = join(root, 'config.json'), socket = join(root, 's')
  const env = { PI_GUARDED_SYSTEM: path }
  let status = 200, body: unknown = { code: 0, signal: null, stdout: '1 0 1 node\n', stderr: '' }
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${'a'.repeat(64)}`)
    req.resume(); res.writeHead(status); res.end(JSON.stringify(body))
  })
  try {
    await assert.rejects(requestGuardedSystem({ action: 'processes' }, env), /ENOENT/)
    await new Promise<void>(resolve => server.listen(socket, resolve))
    await writeFile(path, JSON.stringify({ socket, token: 'a'.repeat(64) }))
    assert.equal((await requestGuardedSystem({ action: 'processes' }, env))?.stdout, '1 0 1 node\n')
    status = 401; body = { error: 'Unauthorized' }
    await assert.rejects(requestGuardedSystem({ action: 'processes' }, env), /Unauthorized/)
    status = 200; body = { stdout: '' }
    await assert.rejects(requestGuardedSystem({ action: 'processes' }, env), /Invalid guarded system response/)
    body = { code: 7, signal: null, stdout: '', stderr: 'denied' }
    assert.equal((await requestGuardedSystem({ action: 'processes' }, env))?.code, 7)
    await writeFile(path, JSON.stringify({ socket: 'relative', token: 'bad' }))
    await assert.rejects(requestGuardedSystem({ action: 'processes' }, env), /Invalid guarded system capability/)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

test('real consumers use the capability and refuse cleanup or preview when it fails', { skip: process.platform !== 'darwin' ? 'macOS preview sandbox capability' : false }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'guarded-consumers-'))
  const candidate = join(root, 'tockteam-trusted-raycast-ABC123')
  const path = join(root, 'config.json'), socket = join(root, 's')
  const before = process.env.PI_GUARDED_SYSTEM
  let status = 200
  const seen: Array<Record<string, unknown>> = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    seen.push(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>)
    res.writeHead(status)
    res.end(JSON.stringify(status === 200
      ? { code: 0, signal: null, stdout: `${process.pid} 1 ${process.pid} proof-owner\n`, stderr: '' }
      : { error: 'inspection unavailable' }))
  })
  try {
    await new Promise<void>(resolve => server.listen(socket, resolve))
    await writeFile(path, JSON.stringify({ socket, token: 'a'.repeat(64) }))
    process.env.PI_GUARDED_SYSTEM = path
    assert.deepEqual(await readFocusProofProcessSnapshot(), [{ pid: process.pid, ppid: 1, pgid: process.pid, command: 'proof-owner' }])
    status = 503
    await assert.rejects(readFocusProofProcessSnapshot(), /inspection unavailable/)
    await mkdir(candidate, { mode: 0o700 })
    await assert.rejects(cleanupPostBaselineTrustedRaycastWorkspaces(root, []), /inspection unavailable/)
    assert.ok((await stat(candidate)).isDirectory(), 'failed inspection cannot authorize deletion')
    const platform = new ProductionMarketplacePlatform({ cwd: root, env: {}, nodeBinary: process.execPath, pnpmEntry: '/unused/pnpm.mjs', cliEntry: '/unused/dsh.mjs' })
    await assert.rejects(platform.buildBundle({ checkout: root, sandboxRoot: root, scripts: ['prepare'] }), /inspection unavailable/)
    const preview = seen.at(-1)!
    assert.equal(preview.action, 'sandbox')
    assert.match(String(preview.policy), /\(deny default\)/)
    assert.equal(preview.executable, process.execPath)
    assert.equal((preview.env as Record<string, string>).PI_GUARDED_SYSTEM, undefined, 'preview code does not inherit the broker capability')
  } finally {
    if (before === undefined) delete process.env.PI_GUARDED_SYSTEM
    else process.env.PI_GUARDED_SYSTEM = before
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
