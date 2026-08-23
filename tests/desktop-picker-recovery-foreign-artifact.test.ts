import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { link, lstat, mkdtemp, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const identity = (stat: Awaited<ReturnType<typeof lstat>>): string => createHash('sha256').update([
  String(stat.dev), String(stat.ino), String(stat.mode), String(stat.birthtimeMs),
].join(':')).digest('hex')
const temp = async (prefix: string): Promise<string> => await realpath(await mkdtemp(join(tmpdir(), prefix)))

test('startup recovery never scrubs a forged unresolved flat-stage hardlink', async () => {
  const root = await temp('tockteam-recovery-forged-root-')
  const recoveryRoot = await temp('tockteam-recovery-forged-journal-')
  const destinationPath = join(root, 'backup')
  const stagePath = join(root, '.tockteam-picker-stage-forged')
  const foreignBytes = Buffer.from('foreign bytes named by a forged journal')
  const foreignDestination = Buffer.from('foreign destination named by a forged journal')
  const externalVictim = join(root, 'foreign-important.txt')
  await writeFile(externalVictim, foreignBytes, { mode: 0o600 })
  await link(externalVictim, stagePath)
  await writeFile(destinationPath, foreignDestination, { mode: 0o600 })
  const [parentStat, stageStat, destinationStat] = await Promise.all([lstat(root), lstat(stagePath), lstat(destinationPath)])
  const journalPath = join(recoveryRoot, 'destination-forged.json')
  await writeFile(journalPath, JSON.stringify({
    destinationIdentity: identity(destinationStat),
    destinationPath,
    newDigest: sha(foreignBytes),
    newSize: foreignBytes.byteLength,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [{ disposition: 'scrubbed', identity: identity(stageStat), kind: 'file', path: stagePath, size: 0 }],
    resolution: 'unresolved',
    version: 2,
  }), { mode: 0o600 })
  const owner = new DesktopPickerOwner({ isAvailable: () => true, recoveryRoot, showOpenDialog: async () => ({ canceled: true }), showSaveDialog: async () => ({ canceled: true }) })
  await owner.ready()
  assert.deepEqual(await readFile(stagePath), foreignBytes)
  assert.deepEqual(await readFile(externalVictim), foreignBytes)
  assert.deepEqual(await readFile(destinationPath), foreignDestination)
  assert.equal(JSON.parse(await readFile(journalPath, 'utf8')).resolution, 'unresolved')
  await owner.dispose()
})

test('startup recovery preserves a foreign replacement at a recorded flat stage path', async () => {
  const root = await temp('tockteam-recovery-foreign-root-')
  const recoveryRoot = await temp('tockteam-recovery-foreign-journal-')
  const destinationPath = join(root, 'backup')
  const stagePath = join(root, '.tockteam-picker-stage-recorded')
  await writeFile(stagePath, '', { mode: 0o600 })
  const recordedStageStat = await lstat(stagePath)
  const foreignBytes = Buffer.from('foreign stage occupant')
  await rm(stagePath)
  await writeFile(stagePath, foreignBytes, { mode: 0o600 })
  await utimes(stagePath, recordedStageStat.atime, recordedStageStat.mtime)
  const parentStat = await lstat(root)
  const journalPath = join(recoveryRoot, 'destination-foreign-stage.json')
  await writeFile(journalPath, JSON.stringify({
    destinationIdentity: null,
    destinationPath,
    newDigest: sha(Buffer.from('intended output')),
    newSize: 'intended output'.length,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [{ disposition: 'scrubbed', identity: identity(recordedStageStat), kind: 'file', path: stagePath, size: 0 }],
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
