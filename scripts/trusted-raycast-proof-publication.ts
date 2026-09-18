import assert from 'node:assert/strict'
import { link, lstat, mkdir, readdir, rmdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'

async function assertEvidenceTree(path: string): Promise<void> {
  const stat = await lstat(path)
  assert.equal(stat.isSymbolicLink(), false, 'Evidence staging contains a symbolic link')
  assert.equal(stat.isDirectory() || stat.isFile(), true, 'Evidence staging contains a special file')
  if (stat.isDirectory()) for (const name of await readdir(path)) await assertEvidenceTree(join(path, name))
}

async function moveEntryExclusive(source: string, destination: string): Promise<void> {
  const stat = await lstat(source)
  assert.equal(stat.isSymbolicLink(), false, 'Evidence staging contains a symbolic link')
  assert.equal(stat.isDirectory() || stat.isFile(), true, 'Evidence staging contains a special file')
  if (stat.isFile()) { await link(source, destination); await unlink(source); return }
  await mkdir(destination, { mode: stat.mode & 0o777 })
  for (const name of (await readdir(source)).sort()) await moveEntryExclusive(join(source, name), join(destination, name))
  await rmdir(source)
}

/** Publish proof output without replacing any pre-existing path; proof.json is linked last. */
export async function publishTrustedRaycastProofExclusive(staging: string, destination: string): Promise<void> {
  const entries = (await readdir(staging)).sort()
  assert.equal(entries.includes('proof.json'), true, 'Evidence staging is incomplete')
  await assertEvidenceTree(staging)
  await mkdir(destination, { mode: 0o700 })
  for (const name of [...entries.filter(name => name !== 'proof.json'), 'proof.json']) await moveEntryExclusive(join(staging, name), join(destination, name))
  await rmdir(staging)
}
