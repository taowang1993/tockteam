import { execFile } from 'node:child_process'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function delay(milliseconds) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { resolve('timeout') }, milliseconds)
    timer.unref()
  })
}

function trustedWindowsTool(name) {
  const systemRoot = process.env.SystemRoot?.trim()
  if (typeof systemRoot !== 'string' || !isAbsolute(systemRoot)) throw new Error('Windows SystemRoot must be an absolute path')
  return join(systemRoot, 'System32', name)
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

export async function assertOwnedProcessGone(executablePath, attempts = 20) {
  if (process.platform !== 'win32') return
  const systemRoot = process.env.SystemRoot?.trim()
  if (typeof systemRoot !== 'string' || !isAbsolute(systemRoot)) throw new Error('Windows SystemRoot must be an absolute path')
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const target = String(executablePath).replaceAll("'", "''")
  const script = `$target = '${target}'; $found = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target -or ($_.CommandLine -ne $null -and $_.CommandLine -like ('*' + $target + '*')) }); if ($found.Count -gt 0) { $found | ConvertTo-Json -Compress }`
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).catch(error => { throw new Error(`unable to inspect Windows process ownership: ${error.message}`) })
    if (result.stdout.trim() === '') return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`processes owned by ${String(executablePath)} did not stop`)
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
