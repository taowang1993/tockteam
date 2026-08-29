import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const WINDOWS_PORTABLE_MARKER = '.tockteam-portable.json'

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function backupPath(directory, destination) {
  const stem = `${basename(destination)}-before`
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const name = suffix === 0 ? stem : `${stem}-${String(suffix)}`
    const candidate = join(directory, name)
    if (!await exists(candidate)) return candidate
  }
  throw new Error('unable to reserve a portable TockTeam backup path')
}

export async function validateWindowsPortableRoot(rootPath, expected) {
  const marker = JSON.parse(await readFile(join(rootPath, WINDOWS_PORTABLE_MARKER), 'utf8'))
  assert.equal(marker.schemaVersion, 1)
  assert.equal(marker.version, expected.version)
  assert.equal(marker.appId, expected.appId)
  const executable = join(rootPath, 'win-unpacked', `${expected.productName}.exe`)
  assert.equal((await stat(executable)).isFile(), true, 'portable TockTeam executable is missing')
  return Object.freeze({ marker, executable })
}

export async function replaceWindowsPortableArchive(options) {
  const archive = resolve(options.archive)
  const destination = resolve(options.destination)
  const backupDirectory = resolve(options.backupDirectory)
  const extractArchive = options.extractArchive
  const validateInstall = options.validateInstall
  const pending = join(dirname(destination), `.${basename(destination)}.install-${String(process.pid)}-${randomBytes(6).toString('hex')}`)
  const lock = join(dirname(destination), `.${basename(destination)}.install.lock`)
  let backup
  let previousMoved = false
  let promoted = false

  await access(archive, constants.R_OK)
  try {
    await mkdir(lock)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('another TockTeam portable install is already in progress')
    throw error
  }
  try {
    await extractArchive(archive, pending)
    await validateInstall(pending)
    await mkdir(backupDirectory, { recursive: true })
    if (await exists(destination)) {
      backup = await backupPath(backupDirectory, destination)
      await rename(destination, backup)
      previousMoved = true
    }
    try {
      await rename(pending, destination)
      promoted = true
      await validateInstall(destination)
    } catch (error) {
      try {
        if (promoted) await rm(destination, { recursive: true, force: true })
        if (previousMoved && backup !== undefined && !await exists(destination)) await rename(backup, destination)
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'portable TockTeam install and rollback both failed')
      }
      throw error
    }
    return Object.freeze({ backup, destination })
  } finally {
    await rm(pending, { recursive: true, force: true })
    await rm(lock, { recursive: true, force: true })
  }
}
