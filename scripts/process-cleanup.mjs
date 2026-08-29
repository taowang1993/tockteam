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

export function parseWindowsProcessSnapshot(output) {
  let parsed
  try { parsed = JSON.parse(String(output)) } catch { return [] }
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.flatMap(row => {
    const pid = Number(row?.ProcessId)
    const parentPid = Number(row?.ParentProcessId)
    return Number.isSafeInteger(pid) && pid > 0 && Number.isSafeInteger(parentPid) && parentPid > 0
      ? [{ pid, parentPid }]
      : []
  })
}

export function windowsProcessTreePids(snapshot, rootPid) {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return []
  const pids = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const row of snapshot) {
      if (pids.has(row.parentPid) && !pids.has(row.pid)) {
        pids.add(row.pid)
        changed = true
      }
    }
  }
  return [...pids].sort((left, right) => left - right)
}

export function windowsTasklistPids(output) {
  const pids = new Set()
  for (const line of String(output).split(/\r?\n/u)) {
    const fields = line.match(/"(?:[^"]|"")*"/gu)?.map(field => field.slice(1, -1).replaceAll('""', '"'))
    const pid = Number(fields?.[1])
    if (Number.isSafeInteger(pid) && pid > 0) pids.add(pid)
  }
  return pids
}

async function snapshotWindowsProcessTree(rootPid) {
  const powershell = trustedWindowsTool('WindowsPowerShell\\v1.0\\powershell.exe')
  const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'
  const result = await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
  return windowsProcessTreePids(parseWindowsProcessSnapshot(result.stdout), rootPid)
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

export async function assertOwnedProcessGone(executablePath, attempts = 20, additionalPath = undefined) {
  if (process.platform !== 'win32') return
  const systemRoot = process.env.SystemRoot?.trim()
  if (typeof systemRoot !== 'string' || !isAbsolute(systemRoot)) throw new Error('Windows SystemRoot must be an absolute path')
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const targets = [executablePath, additionalPath].filter(value => value !== undefined).map(value => `'${String(value).replaceAll("'", "''")}'`).join(', ')
  const script = `$targets = @(${targets}); $found = @(Get-CimInstance Win32_Process | Where-Object { $process = $_; $targets | Where-Object { $process.ExecutablePath -eq $_ -or ($process.CommandLine -ne $null -and $process.CommandLine -like ('*' + $_ + '*')) } }); if ($found.Count -gt 0) { $found | ConvertTo-Json -Compress }`
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).catch(error => { throw new Error(`unable to inspect Windows process ownership: ${error.message}`) })
    if (result.stdout.trim() === '') return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`processes owned by ${String(executablePath)} did not stop`)
}

export async function assertProcessTreeGone(child, attempts = 20, treePids = undefined) {
  const pid = child.pid
  if (!Number.isSafeInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    const expectedPids = treePids ?? await snapshotWindowsProcessTree(pid)
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await execFileAsync(trustedWindowsTool('tasklist.exe'), ['/FO', 'CSV', '/NH'], { windowsHide: true }).catch(() => ({ stdout: '' }))
      const livePids = windowsTasklistPids(result.stdout)
      if (expectedPids.every(expectedPid => !livePids.has(expectedPid))) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`process tree for ${String(pid)} did not stop`)
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await execFileAsync('/usr/bin/pgrep', ['-g', String(pid)]).catch(() => ({ stdout: '' }))
    if (result.stdout.trim() === '') return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`process tree for ${String(pid)} did not stop`)
}

export async function stopChildProcess(child, graceMs = 5_000, killMs = 1_000) {
  const windowsTreePids = process.platform === 'win32' && Number.isSafeInteger(child.pid) && child.pid > 0
    ? await snapshotWindowsProcessTree(child.pid)
    : undefined
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
    await assertProcessTreeGone(child, 20, windowsTreePids)
    return
  }
  await signalProcessTree(child, true)
  if (await Promise.race([closed, delay(killMs)]) !== 'closed'
    && child.exitCode === null && child.signalCode === null) {
    throw new Error('child process did not stop after process-tree termination')
  }
  await assertProcessTreeGone(child, 20, windowsTreePids)
}
