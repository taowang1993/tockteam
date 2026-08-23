import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, lstat, mkdtemp, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const revision = (stat: Awaited<ReturnType<typeof lstat>>): string => createHash('sha256').update([
  String(stat.dev), String(stat.ino), String(stat.size), String(stat.mode), String(stat.birthtimeMs),
].join(':')).digest('hex')
const temp = async (prefix: string): Promise<string> => await realpath(await mkdtemp(join(tmpdir(), prefix)))

test('startup recovery preserves a foreign replacement at a recorded snapshot path', async () => {
  const root = await temp('tockteam-recovery-foreign-root-')
  const recoveryRoot = await temp('tockteam-recovery-foreign-journal-')
  const destinationPath = join(root, 'backup')
  const snapshotPath = join(root, '.tockteam-picker-snapshot-recorded')
  const newBytes = Buffer.from('published selected-file archive bytes')
  const oldBytes = Buffer.from('old destination bytes')
  const foreignBytes = Buffer.from('x'.repeat(oldBytes.length))
  await writeFile(destinationPath, newBytes)
  await writeFile(snapshotPath, oldBytes, { mode: 0o600 })
  const destinationStat = await lstat(destinationPath)
  const recordedSnapshotStat = await lstat(snapshotPath)
  const recordedSnapshotIdentity = revision(recordedSnapshotStat)
  await rm(snapshotPath)
  await writeFile(snapshotPath, foreignBytes, { mode: 0o600 })
  await utimes(snapshotPath, recordedSnapshotStat.atime, recordedSnapshotStat.mtime)
  const parentStat = await lstat(root)
  const journalPath = join(recoveryRoot, 'destination-foreign-snapshot.json')
  await writeFile(journalPath, JSON.stringify({
    backupIdentity: null,
    backupPath: null,
    commitIdentity: null,
    commitPath: null,
    destinationPath,
    newDigest: sha(newBytes),
    newIdentity: revision(destinationStat),
    newSize: newBytes.byteLength,
    oldDigest: sha(oldBytes),
    oldIdentity: 'recorded-old-identity',
    oldSize: oldBytes.byteLength,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    snapshotIdentity: recordedSnapshotIdentity,
    snapshotPath,
    state: 'published',
    version: 1,
  }), { mode: 0o600 })
  await chmod(journalPath, 0o600)
  const owner = new DesktopPickerOwner({ isAvailable: () => true, recoveryRoot, showOpenDialog: async () => ({ canceled: true }), showSaveDialog: async () => ({ canceled: true }) })
  await owner.ready()
  assert.deepEqual(await readFile(snapshotPath), foreignBytes)
  assert.deepEqual(await readFile(destinationPath), newBytes)
  await readFile(journalPath)
})
