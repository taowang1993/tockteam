import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
// @ts-expect-error Existing helper owns bounded process-group termination.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'

type Clipboard = Readonly<{ writeText(text: string): void; readText(): string }>

/** Production uses Electron. Only trusted development main supplies the fixed proof script. */
export async function copyTrustedRaycastText(text: string, clipboard: Clipboard, proofScript?: string): Promise<Readonly<{ pid: number; restoration: 'RESTORED' }> | undefined> {
  if (proofScript === undefined) {
    clipboard.writeText(text)
    if (clipboard.readText() !== text) throw new Error('Clipboard Copy was not accepted')
    return
  }
  if (Buffer.byteLength(text) > 131072) throw new Error('Clipboard proof text exceeded its bound')
  const identity = randomUUID()
  const child = spawn('/usr/bin/swift', [proofScript], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let timer: ReturnType<typeof setTimeout> | undefined
  let revoked = false
  try {
    await new Promise<void>((resolve, reject) => {
      let pending = ''; let outputBytes = 0; let armed = false; let completed = false
      const fail = () => { revoked = true; reject(new Error('Clipboard proof owner expired, exited or rejected Copy')) }
      child.once('error', fail)
      child.once('close', () => { if (!completed) fail() })
      child.stdin.on('error', fail)
      child.stderr.on('data', (chunk: Buffer) => { outputBytes += chunk.length; if (outputBytes > 4096) fail() })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        if (revoked) return
        outputBytes += Buffer.byteLength(chunk)
        if (outputBytes > 4096) { fail(); return }
        pending += chunk
        let end: number
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1)
          if (!armed && line === `ARMED ${identity}` && child.exitCode === null && child.signalCode === null) {
            armed = true
            // This command does NOT authorize an Electron write. The serial Swift owner must
            // independently admit its live single-use lease, write, verify and restore in RAM.
            child.stdin.write(`COPY ${identity}\n`)
          } else if (armed && !completed && line === `RESULT ${identity} true RESTORED`) {
            completed = true; resolve()
          } else fail()
        }
      })
      timer = setTimeout(fail, 8000)
      child.stdin.write(`ARM ${identity} ${Buffer.from(text).toString('base64')}\n`)
    })
  } finally {
    revoked = true
    if (timer) clearTimeout(timer)
    if (!child.stdin.destroyed) child.stdin.end('CLOSE\n')
    // Let the serial owner finish any synchronous guarded restoration before escalation.
    if (child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => {
      const grace = setTimeout(resolve, 1000)
      child.once('close', () => { clearTimeout(grace); resolve() })
    })
    await stopOwnedChild(child, 1000, true)
  }
  return { pid: child.pid!, restoration: 'RESTORED' }
}
