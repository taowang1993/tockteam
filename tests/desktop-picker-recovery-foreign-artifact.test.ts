import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const identity = (stat: Awaited<ReturnType<typeof lstat>>): string => createHash('sha256').update([
  String(stat.dev), String(stat.ino), String(stat.mode), String(stat.birthtimeMs),
].join(':')).digest('hex')
const temp = async (prefix: string): Promise<string> => await realpath(await mkdtemp(join(tmpdir(), prefix)))

test('startup recovery preserves a foreign replacement at a recorded stage path', async () => {
  const root = await temp('tockteam-recovery-foreign-root-')
  const recoveryRoot = await temp('tockteam-recovery-foreign-journal-')
  const destinationPath = join(root, 'backup')
  const stageRoot = join(root, '.tockteam-picker-stage-recorded')
  const stagePath = join(stageRoot, 'selected-file')
  await mkdir(stageRoot, { mode: 0o700 })
  await writeFile(stagePath, '', { mode: 0o600 })
  const recordedStageStat = await lstat(stagePath)
  const foreignBytes = Buffer.from('foreign stage occupant')
  await rm(stagePath)
  await writeFile(stagePath, foreignBytes, { mode: 0o600 })
  await utimes(stagePath, recordedStageStat.atime, recordedStageStat.mtime)
  const [parentStat, stageRootStat] = await Promise.all([lstat(root), lstat(stageRoot)])
  const journalPath = join(recoveryRoot, 'destination-foreign-stage.json')
  await writeFile(journalPath, JSON.stringify({
    destinationIdentity: null,
    destinationPath,
    newDigest: sha(Buffer.from('intended output')),
    newSize: 'intended output'.length,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [
      { disposition: 'scrubbed', identity: identity(stageRootStat), kind: 'directory', path: stageRoot, size: 0 },
      { disposition: 'scrubbed', identity: identity(recordedStageStat), kind: 'file', path: stagePath, size: 0 },
    ],
    resolution: 'scrubbed',
    version: 2,
  }), { mode: 0o600 })
  const owner = new DesktopPickerOwner({ isAvailable: () => true, recoveryRoot, showOpenDialog: async () => ({ canceled: true }), showSaveDialog: async () => ({ canceled: true }) })
  await owner.ready()
  assert.deepEqual(await readFile(stagePath), foreignBytes)
  await assert.rejects(readFile(destinationPath), { code: 'ENOENT' })
  await readFile(journalPath)
  await owner.dispose()
})
