import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function delay(milliseconds) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { resolve('timeout') }, milliseconds)
    timer.unref()
  })
}

async function signalProcessTree(child, force = false) {
  const pid = child.pid
  if (!Number.isSafeInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', [
      '/PID', String(pid),
      '/T',
      ...(force ? ['/F'] : []),
    ], { windowsHide: true }).catch(() => {})
    return
  }
  // Detached Electron/DSH launches own a process group. Signal that group
  // first so helper processes cannot outlive the launcher parent.
  try { process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM') } catch { /* already stopped */ }
  try {
    if (child.exitCode === null && child.signalCode === null) child.kill(force ? 'SIGKILL' : 'SIGTERM')
  } catch { /* already stopped */ }
}

export async function stopChildProcess(child, graceMs = 5_000, killMs = 1_000) {
  const closed = new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve('closed')
      return
    }
    child.once('close', () => { resolve('closed') })
  })
  // Do not return early for an exited parent: its detached process group/tree
  // may still contain Electron helpers.
  await signalProcessTree(child)
  if (await Promise.race([closed, delay(graceMs)]) === 'closed') {
    await signalProcessTree(child, true)
    return
  }
  await signalProcessTree(child, true)
  if (await Promise.race([closed, delay(killMs)]) !== 'closed'
    && child.exitCode === null && child.signalCode === null) {
    throw new Error('child process did not stop after process-tree termination')
  }
}
