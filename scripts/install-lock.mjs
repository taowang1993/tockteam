import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OWNER_FILE = 'owner.json'
const MAX_LOCK_AGE_MS = 24 * 60 * 60 * 1000

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true }
  catch (error) { return error?.code !== 'ESRCH' }
}

async function staleLock(lockPath) {
  try {
    const metadata = await lstat(lockPath)
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) return false
    let owner
    try { owner = JSON.parse(await readFile(join(lockPath, OWNER_FILE), 'utf8')) }
    catch { return Date.now() - metadata.mtimeMs > MAX_LOCK_AGE_MS }
    if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 || !Number.isFinite(owner?.createdAt)) return false
    return !processIsAlive(owner.pid) || Date.now() - owner.createdAt > MAX_LOCK_AGE_MS
  } catch { return false }
}

export async function acquireInstallLock(lockPath, conflictMessage) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
      if (attempt > 0 || !await staleLock(lockPath)) throw new Error(conflictMessage)
      await rm(lockPath, { force: true, recursive: true })
    }
  }
}
