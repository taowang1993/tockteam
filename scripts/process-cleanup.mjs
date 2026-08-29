import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function delay(milliseconds) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { resolve('timeout') }, milliseconds)
    timer.unref()
  })
}

function trustedWindowsTool(name) {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  return `${systemRoot}\\System32\\${name}`
}

async function signalProcessTree(child, force = false) {
  const pid = child.pid
  if (!Number.isSafeInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    await execFileAsync(trustedWindowsTool('taskkill.exe'), [
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

export async function assertProcessTreeGone(child, attempts = 20) {
  const pid = child.pid
  if (!Number.isSafeInteger(pid) || pid <= 0) return
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (process.platform === 'win32') {
      const result = await execFileAsync(trustedWindowsTool('tasklist.exe'), ['/FI', `PID eq ${String(pid)}`, '/FO', 'CSV', '/NH'], { windowsHide: true }).catch(() => ({ stdout: '' }))
      if (!result.stdout.includes(`"${String(pid)}"`)) return
    } else {
      const result = await execFileAsync('/usr/bin/pgrep', ['-g', String(pid)]).catch(() => ({ stdout: '' }))
      if (result.stdout.trim() === '') return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`process tree for ${String(pid)} did not stop`)
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
    await assertProcessTreeGone(child)
    return
  }
  await signalProcessTree(child, true)
  if (await Promise.race([closed, delay(killMs)]) !== 'closed'
    && child.exitCode === null && child.signalCode === null) {
    throw new Error('child process did not stop after process-tree termination')
  }
  await assertProcessTreeGone(child)
}
