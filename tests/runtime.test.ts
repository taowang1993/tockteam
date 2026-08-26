import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DshRuntimeSupervisor, dshLaunchSpec } from '../src/runtime.ts'

test('DSH launch specs apply the configured process wrapper consistently', () => {
  assert.deepEqual(dshLaunchSpec({
    cliEntry: '/runtime/cli.js',
    launcher: { args: ['--policy', 'sandbox'], command: 'sandbox' },
    nodeBinary: '/runtime/node',
  }, ['profile', 'list']), {
    args: ['--policy', 'sandbox', '/runtime/node', '/runtime/cli.js', 'profile', 'list'],
    command: 'sandbox',
  })
})

test('runtime supervisor rejects malformed readiness without retaining the child', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-runtime-invalid-'))
  const entry = join(root, 'fake-runtime.mjs')
  writeFileSync(entry, [
    "console.log('dsh web: http://[')",
    'setInterval(() => {}, 1000)',
    "process.on('SIGTERM', () => process.exit(0))",
  ].join('\n'))
  const supervisor = new DshRuntimeSupervisor({
    args: [], cliEntry: entry, cwd: root, env: process.env,
    nodeBinary: process.execPath, readyTimeoutMs: 2_000,
  })
  try {
    await assert.rejects(supervisor.start(), /invalid DSH runtime readiness URL/u)
    assert.equal(supervisor.running, false)
  } finally {
    await supervisor.stop()
    rmSync(root, { recursive: true, force: true })
  }
})

test('runtime supervisor waits for the DSH settlement URL and stops cleanly', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-runtime-'))
  const entry = join(root, 'fake-runtime.mjs')
  writeFileSync(entry, [
    "console.log('booting')",
    "setTimeout(() => console.log('dsh web: http://127.0.0.1:43210'), 20)",
    'setInterval(() => {}, 1000)',
    "process.on('SIGTERM', () => process.exit(0))",
  ].join('\n'))
  const lines: string[] = []
  const supervisor = new DshRuntimeSupervisor({
    args: [],
    cliEntry: entry,
    cwd: root,
    env: process.env,
    nodeBinary: process.execPath,
    onLog: (_stream, line) => { lines.push(line) },
    readyTimeoutMs: 2_000,
  })
  try {
    const url = await supervisor.start()
    assert.equal(url.href, 'http://127.0.0.1:43210/')
    assert.equal(supervisor.running, true)
    assert.deepEqual(lines, ['booting', 'dsh web: http://127.0.0.1:43210'])
    await supervisor.stop()
    assert.equal(supervisor.running, false)
  } finally {
    await supervisor.stop()
    rmSync(root, { recursive: true, force: true })
  }
})
