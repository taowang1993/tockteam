import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { request } from 'node:http'
import { isAbsolute } from 'node:path'
import { promisify } from 'node:util'

export type GuardedSystemRequest = { action: 'processes' } | {
  action: 'sandbox'
  policy: string
  executable: string
  args: readonly string[]
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  maxBuffer: number
}
interface SystemResult { code: number | null; signal: string | null; stdout: string; stderr: string }

/** Optional private Pi capability. Once advertised, any failure stays a failure. */
export async function requestGuardedSystem(
  input: GuardedSystemRequest,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SystemResult | undefined> {
  const configPath = environment.PI_GUARDED_SYSTEM
  if (configPath === undefined) return undefined
  if (!isAbsolute(configPath) || (await stat(configPath)).size > 4096) throw new Error('Invalid guarded system capability')
  const config: unknown = JSON.parse(await readFile(configPath, 'utf8'))
  if (config === null || typeof config !== 'object' || !('socket' in config) || typeof config.socket !== 'string' || !isAbsolute(config.socket)
    || !('token' in config) || typeof config.token !== 'string' || !/^[a-f0-9]{64}$/.test(config.token)) throw new Error('Invalid guarded system capability')
  const { socket, token } = config
  const timeoutMs = input.action === 'sandbox' ? input.timeoutMs : 5000
  const maxBuffer = input.action === 'sandbox' ? input.maxBuffer : 8 * 1024 * 1024
  const body = JSON.stringify(input)
  if (Buffer.byteLength(body) > 1024 * 1024) throw new Error('Guarded system request too large')
  return await new Promise<SystemResult>((resolve, reject) => {
    const req = request({
      socketPath: socket, path: '/', method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', connection: 'close' },
      signal: AbortSignal.timeout(timeoutMs + 5000),
    }, res => {
      const chunks: Buffer[] = []; let bytes = 0
      res.on('error', reject)
      res.on('data', (data: Buffer) => {
        bytes += data.length
        if (bytes > maxBuffer * 6 + 4096) req.destroy(new Error('Guarded system response too large'))
        else chunks.push(data)
      })
      res.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<SystemResult> & { error?: unknown }
          if (res.statusCode !== 200) throw new Error(`Guarded system request failed: ${String(value?.error ?? res.statusCode)}`)
          if (!value || (value.code !== null && !Number.isSafeInteger(value.code)) || (value.signal !== null && typeof value.signal !== 'string')
            || typeof value.stdout !== 'string' || typeof value.stderr !== 'string'
            || Buffer.byteLength(value.stdout) + Buffer.byteLength(value.stderr) > maxBuffer) throw new Error('Invalid guarded system response')
          resolve(value as SystemResult)
        } catch (error) { reject(error) }
      })
    })
    req.on('error', reject); req.end(body)
  })
}

export async function readSystemProcesses(): Promise<string> {
  const guarded = await requestGuardedSystem({ action: 'processes' })
  if (guarded !== undefined) {
    if (guarded.code !== 0 || guarded.signal !== null) throw new Error(`Process inspection failed: ${guarded.stderr}`)
    return guarded.stdout
  }
  return (await promisify(execFile)('/bin/ps', ['-Aeww', '-o', 'pid=,ppid=,pgid=,command='], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 })).stdout
}
