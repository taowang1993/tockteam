import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, open, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupPostBaselineTrustedRaycastWorkspaces, snapshotTrustedRaycastWorkspaces } from '../scripts/trusted-raycast-proof-cleanup.ts'

async function fixture(): Promise<string> { return await mkdtemp(join(tmpdir(), 'tockteam-proof-cleanup-test-')) }

test('an injected mid-gate failure removes only a verified post-baseline workspace', async () => {
  const root = await fixture()
  try {
    const existing = join(root, 'tockteam-trusted-raycast-existing'); await mkdir(existing, { mode: 0o700 })
    const baseline = await snapshotTrustedRaycastWorkspaces(root)
    const created = join(root, 'tockteam-trusted-raycast-ABC123'); await mkdir(created, { mode: 0o700 }); await writeFile(join(created, 'child.mjs'), 'trusted fixture')
    let failure: unknown
    try { throw new Error('injected mid-gate failure') } catch (error) { failure = error } finally { await cleanupPostBaselineTrustedRaycastWorkspaces(root, baseline) }
    assert.match(String(failure), /injected mid-gate failure/u)
    assert.deepEqual(await snapshotTrustedRaycastWorkspaces(root), baseline)
    assert.equal(await realpath(existing), join(await realpath(root), 'tockteam-trusted-raycast-existing'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('refuses pre-existing, symlinked, and unowned workspace candidates', async () => {
  const root = await fixture(); const outside = await fixture()
  try {
    const existing = join(root, 'tockteam-trusted-raycast-existing'); await mkdir(existing, { mode: 0o700 })
    const baseline = await snapshotTrustedRaycastWorkspaces(root)
    const linked = join(root, 'tockteam-trusted-raycast-LNK123'); await symlink(outside, linked)
    await assert.rejects(() => cleanupPostBaselineTrustedRaycastWorkspaces(root, baseline), /symbolic link/u)
    assert.equal(await realpath(linked), await realpath(outside))
    await rm(linked)
    const candidate = join(root, 'tockteam-trusted-raycast-OWN123'); await mkdir(candidate, { mode: 0o700 })
    await assert.rejects(() => cleanupPostBaselineTrustedRaycastWorkspaces(root, baseline, { expectedUid: (process.getuid?.() ?? 0) + 1 }), /not owned by the proof user/u)
    assert.deepEqual((await snapshotTrustedRaycastWorkspaces(root)).sort(), [...baseline, 'tockteam-trusted-raycast-OWN123'].sort())
    assert.equal((await snapshotTrustedRaycastWorkspaces(root)).includes('tockteam-trusted-raycast-existing'), true, 'pre-existing workspace remains untouched')
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
})

test('refuses symlink entries and open files before removing a workspace', async () => {
  const root = await fixture(); const outside = await fixture()
  try {
    const baseline = await snapshotTrustedRaycastWorkspaces(root)
    const candidate = join(root, 'tockteam-trusted-raycast-XYZ789'); await mkdir(candidate, { mode: 0o700 })
    await symlink(outside, join(candidate, 'escape'))
    await assert.rejects(() => cleanupPostBaselineTrustedRaycastWorkspaces(root, baseline), /contains a symbolic link/u)
    await rm(join(candidate, 'escape'))
    const file = join(candidate, 'open.txt'); await writeFile(file, 'open')
    const handle = await open(file, 'r')
    try { await assert.rejects(() => cleanupPostBaselineTrustedRaycastWorkspaces(root, baseline), /has open files or process references/u) } finally { await handle.close() }
    const listener = spawn(process.execPath, ['-e', "require('node:net').createServer().listen(0, '127.0.0.1', () => console.log('ready'))"], { cwd: candidate, stdio: ['ignore', 'pipe', 'ignore'] })
    try { await once(listener.stdout!, 'data'); await assert.rejects(() => cleanupPostBaselineTrustedRaycastWorkspaces(root, baseline), /has open files or process references|appears in a process cwd/u) } finally { listener.kill('SIGTERM'); await once(listener, 'close') }
    await cleanupPostBaselineTrustedRaycastWorkspaces(root, baseline)
    assert.deepEqual(await snapshotTrustedRaycastWorkspaces(root), baseline)
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
})
