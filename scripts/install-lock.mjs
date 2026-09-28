import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OWNER_FILE = 'owner.json'
const RECOVERY_DIRECTORY = '.recovery'
const MAX_LOCK_AGE_MS = 24 * 60 * 60 * 1000

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true }
  catch (error) { return error?.code !== 'ESRCH' }
}

async function inspectLock(lockPath) {
  try {
    const metadata = await lstat(lockPath)
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) return undefined
    let ownerText
    try { ownerText = await readFile(join(lockPath, OWNER_FILE), 'utf8') }
    catch { return { device: metadata.dev, inode: metadata.ino, ownerText: undefined, ownerValid: false, stale: Date.now() - metadata.mtimeMs > MAX_LOCK_AGE_MS } }
    let owner
    try { owner = JSON.parse(ownerText) }
    catch { return { device: metadata.dev, inode: metadata.ino, ownerText, ownerValid: false, stale: Date.now() - metadata.mtimeMs > MAX_LOCK_AGE_MS } }
    const ownerValid = Number.isSafeInteger(owner?.pid) && owner.pid > 0 && Number.isFinite(owner?.createdAt)
    return { device: metadata.dev, inode: metadata.ino, ownerText, ownerValid, stale: ownerValid && !processIsAlive(owner.pid) }
  } catch { return undefined }
}

function sameLock(left, right) {
  return left !== undefined
    && right !== undefined
    && left.device === right.device
    && left.inode === right.inode
    && left.ownerText === right.ownerText
}

async function recoverInstallLock(lockPath, observed, depth) {
  const recoveryPath = join(lockPath, RECOVERY_DIRECTORY)
  // Recovery is itself owned: a crash must not leave an immortal anonymous claim.
  try { await acquireOwnedLock(recoveryPath, 'installer recovery is busy', depth + 1) }
  catch { return false }

  const temporaryOwner = join(lockPath, `${OWNER_FILE}.${process.pid}.${randomUUID()}.tmp`)
  try {
    const current = await inspectLock(lockPath)
    if (!sameLock(observed, current) || (current.ownerValid && !current.stale)) return false
    await writeFile(temporaryOwner, JSON.stringify({ createdAt: Date.now(), pid: process.pid }), { flag: 'wx', mode: 0o600 })
    await rename(temporaryOwner, join(lockPath, OWNER_FILE))
    return true
  } finally {
    await rm(temporaryOwner, { force: true })
    await rm(recoveryPath, { force: true, recursive: true })
  }
}

async function acquireOwnedLock(lockPath, conflictMessage, depth) {
  // Bound repeated crashes or hostile nested claims; uncertain ownership always fails closed.
  if (depth > 8) throw new Error(conflictMessage)
  try {
    await mkdir(lockPath)
    try {
      await writeFile(join(lockPath, OWNER_FILE), JSON.stringify({ createdAt: Date.now(), pid: process.pid }), { flag: 'wx', mode: 0o600 })
      return
    } catch (error) {
      await rm(lockPath, { force: true, recursive: true })
      throw error
    }
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const observed = await inspectLock(lockPath)
    if (observed?.stale && await recoverInstallLock(lockPath, observed, depth)) return
    throw new Error(conflictMessage)
  }
}

export async function acquireInstallLock(lockPath, conflictMessage) {
  await acquireOwnedLock(lockPath, conflictMessage, 0)
}
