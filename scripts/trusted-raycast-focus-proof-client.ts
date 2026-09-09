import { execFile as execFileCallback, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { LAUNCHER_FOCUS_PROOF_CHANNEL, type LauncherFocusProofMessage } from '../src/launcher-focus-proof.ts'

const execFile = promisify(execFileCallback)

export interface FocusProofChild {
  readonly connected: boolean
  readonly pid?: number
  disconnect(): void
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'message', listener: (message: unknown) => void): unknown
  send(message: unknown, callback: (error: Error | null) => void): boolean
}
export interface ProofProcessRow { readonly command: string; readonly pgid: number; readonly pid: number; readonly ppid: number }
export interface FocusProofCheckpoint { readonly checkpoint: string; readonly focusedWindowCount: number; readonly windows: readonly { focused: boolean; id: number }[] }

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const base = ['channel', 'faulted', 'focusFaultCount', 'nonce', 'sequence'] as const
const validCount = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max

function parseMessage(value: unknown): LauncherFocusProofMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid focus proof protocol response')
  const message = value as Record<string, unknown>
  if (message.channel !== LAUNCHER_FOCUS_PROOF_CHANNEL || typeof message.nonce !== 'string' || !Number.isSafeInteger(message.sequence) || Number(message.sequence) <= 0 || typeof message.faulted !== 'boolean' || !validCount(message.focusFaultCount, 64)) throw new Error('Invalid focus proof protocol response')
  if (message.type === 'READY' && exactKeys(message, [...base, 'type'])) return message as unknown as LauncherFocusProofMessage
  if (message.type === 'FOCUS_FAULT' && (message.kind === 'app-activate' || message.kind === 'app-window-focus' || message.kind === 'checkpoint-focused' || message.kind === 'window-focus') && (message.windowId === undefined || Number.isSafeInteger(message.windowId) && Number(message.windowId) > 0) && exactKeys(message, [...base, 'kind', 'type', ...(message.windowId === undefined ? [] : ['windowId'])])) return message as unknown as LauncherFocusProofMessage
  if (message.type === 'CHECKPOINT_ACK' && validCount(message.focusedWindowCount, 32) && Number.isSafeInteger(message.requestSequence) && Number(message.requestSequence) > 0 && Array.isArray(message.windows) && message.windows.length <= 32 && message.windows.every(window => typeof window === 'object' && window !== null && !Array.isArray(window) && exactKeys(window as Record<string, unknown>, ['focused', 'id']) && typeof (window as Record<string, unknown>).focused === 'boolean' && Number.isSafeInteger((window as Record<string, unknown>).id) && Number((window as Record<string, unknown>).id) >= 0) && exactKeys(message, [...base, 'focusedWindowCount', 'requestSequence', 'type', 'windows'])) return message as unknown as LauncherFocusProofMessage
  if ((message.type === 'SHUTDOWN_ACK' || message.type === 'SHUTDOWN_REJECTED') && Number.isSafeInteger(message.requestSequence) && Number(message.requestSequence) > 0 && exactKeys(message, [...base, 'requestSequence', 'type'])) return message as unknown as LauncherFocusProofMessage
  throw new Error('Invalid focus proof protocol response')
}

export async function readFocusProofProcessSnapshot(): Promise<readonly ProofProcessRow[]> {
  const result = await execFile('/bin/ps', ['-Aeww', '-o', 'pid=,ppid=,pgid=,command='], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 })
  return Object.freeze(result.stdout.trim().split(/\n/u).filter(Boolean).map(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u)
    if (!match) throw new Error('Could not parse the proof process snapshot')
    return Object.freeze({ command: match[4]!, pgid: Number(match[3]), pid: Number(match[1]), ppid: Number(match[2]) })
  }))
}

export function focusProofDescendants(snapshot: readonly ProofProcessRow[], rootPid: number): readonly ProofProcessRow[] {
  const children = new Map<number, ProofProcessRow[]>()
  for (const row of snapshot) { const siblings = children.get(row.ppid); if (siblings) siblings.push(row); else children.set(row.ppid, [row]) }
  const owned = new Set([rootPid]); const pending = [rootPid]
  while (pending.length > 0) for (const row of children.get(pending.pop()!) ?? []) if (!owned.has(row.pid)) { owned.add(row.pid); pending.push(row.pid) }
  return Object.freeze(snapshot.filter(row => row.pid !== rootPid && owned.has(row.pid)))
}

export function findFocusProofResidue(before: readonly ProofProcessRow[], after: readonly ProofProcessRow[], options: Readonly<{ gatePgid: number; markers: readonly string[]; observedDescendants?: readonly ProofProcessRow[] }>): readonly ProofProcessRow[] {
  const baselinePids = new Set(before.map(row => row.pid))
  const observed = new Map((options.observedDescendants ?? []).map(row => [row.pid, row.command]))
  return Object.freeze(after.filter(row => row.pgid === options.gatePgid
    || observed.get(row.pid) === row.command
    || !baselinePids.has(row.pid) && options.markers.some(marker => marker !== '' && row.command.includes(marker))).sort((left, right) => left.pid - right.pid))
}

export function createFocusProofClient(child: FocusProofChild, nonce: string, options: Readonly<{ maxMessages?: number; timeoutMs?: number }> = {}) {
  if (!/^[0-9a-f]{64}$/u.test(nonce) || !child.connected) throw new Error('Focus proof client requires authenticated inherited IPC')
  const maxMessages = options.maxMessages ?? 128
  const timeoutMs = options.timeoutMs ?? 10_000
  let inboundSequence = 0
  let requestSequence = 0
  let messageCount = 0
  let readyMessage: LauncherFocusProofMessage | undefined
  let fault: Error | undefined
  let closed = false
  let closeCode: number | null = null
  let readyResolve!: () => void
  let readyReject!: (error: Error) => void
  let closeResolve!: () => void
  let pendingResponse: { reject(error: Error): void; requestSequence: number; resolve(message: LauncherFocusProofMessage): void; type: 'CHECKPOINT_ACK' | 'SHUTDOWN' } | undefined
  const readyPromise = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  const closePromise = new Promise<void>(resolve => { closeResolve = resolve })
  const fail = (error: Error): void => {
    fault ??= error
    if (!readyMessage) readyReject(error)
    if (pendingResponse && pendingResponse.type !== 'SHUTDOWN') { pendingResponse.reject(error); pendingResponse = undefined }
  }
  child.on('error', () => { fail(new Error('Focus proof child process failed')) })
  child.on('message', raw => {
    messageCount += 1
    if (messageCount > maxMessages) { fail(new Error('Focus proof response bound exceeded')); return }
    let message: LauncherFocusProofMessage
    try { message = parseMessage(raw) } catch { fail(new Error('Invalid focus proof protocol response')); return }
    if (message.nonce !== nonce || message.sequence !== inboundSequence + 1) { fail(new Error('Invalid focus proof protocol sequence or nonce')); return }
    inboundSequence = message.sequence
    if (message.type === 'FOCUS_FAULT') { fail(new Error('TockTeam focus fault observed')); return }
    if (message.type === 'READY') {
      if (readyMessage || message.faulted || message.focusFaultCount !== 0) { fail(new Error('Invalid focus proof READY state')); return }
      readyMessage = message; readyResolve(); return
    }
    if (!readyMessage || !pendingResponse) { fail(new Error('Unexpected focus proof response')); return }
    if (message.requestSequence !== pendingResponse.requestSequence) { fail(new Error('Invalid focus proof response request sequence')); return }
    if (pendingResponse.type === 'CHECKPOINT_ACK' && message.type !== 'CHECKPOINT_ACK' || pendingResponse.type === 'SHUTDOWN' && message.type !== 'SHUTDOWN_ACK' && message.type !== 'SHUTDOWN_REJECTED') { fail(new Error('Unexpected focus proof response type')); return }
    const pending = pendingResponse; pendingResponse = undefined; pending.resolve(message)
  })
  child.on('close', code => { closed = true; closeCode = code; if (!readyMessage) readyReject(new Error('Focus proof child closed before READY')); pendingResponse?.reject(new Error('Focus proof child closed before response')); pendingResponse = undefined; closeResolve() })

  const wait = async <T>(promise: Promise<T>, label: string): Promise<T> => await Promise.race([promise, delay(timeoutMs, undefined, { ref: false }).then(() => { throw new Error(`${label} timeout`) })])
  const send = async (command: 'CHECKPOINT' | 'SHUTDOWN'): Promise<{ message: LauncherFocusProofMessage; requestSequence: number }> => {
    const sequence = ++requestSequence
    const response = new Promise<LauncherFocusProofMessage>((resolve, reject) => { pendingResponse = { reject, requestSequence: sequence, resolve, type: command === 'CHECKPOINT' ? 'CHECKPOINT_ACK' : 'SHUTDOWN' } })
    await new Promise<void>((resolve, reject) => { try { child.send({ channel: LAUNCHER_FOCUS_PROOF_CHANNEL, command, nonce, sequence }, error => { if (error) reject(new Error('Focus proof command send failed')); else resolve() }) } catch { reject(new Error('Focus proof command send failed')) } })
    return { message: await wait(response, command === 'CHECKPOINT' ? 'Focus proof checkpoint acknowledgment' : 'Focus proof shutdown acknowledgment'), requestSequence: sequence }
  }
  return Object.freeze({
    get closed() { return closed },
    get messageCount() { return messageCount },
    async ready(): Promise<void> { await wait(readyPromise, 'Focus proof READY') ; if (fault) throw fault },
    async checkpoint(checkpoint: string): Promise<FocusProofCheckpoint> {
      if (fault) throw fault
      const { message } = await send('CHECKPOINT')
      if (message.type !== 'CHECKPOINT_ACK' || message.faulted || message.focusFaultCount !== 0 || message.focusedWindowCount !== 0 || message.windows.some(window => window.focused)) throw new Error('Focus proof checkpoint reported focus')
      return Object.freeze({ checkpoint, focusedWindowCount: message.focusedWindowCount, windows: message.windows })
    },
    async shutdownAndWait(): Promise<void> {
      let shutdownError: Error | undefined
      try {
        const { message } = await send('SHUTDOWN')
        if (message.type !== 'SHUTDOWN_ACK' || message.faulted || message.focusFaultCount !== 0) shutdownError = new Error('Focus proof shutdown was rejected')
      } catch (error) {
        shutdownError = error as Error
        if (child.connected) child.disconnect()
      }
      try {
        await wait(closePromise, 'Focus proof child close')
      } catch (error) {
        if (child.connected) child.disconnect()
        await wait(closePromise, 'Focus proof child close after disconnect')
        throw error
      }
      if (fault) throw fault
      if (shutdownError) throw shutdownError
      if (!closed || closeCode !== 0) throw new Error('Focus proof child did not close cleanly')
    },
    async assertClean(): Promise<void> { if (fault) throw fault },
  })
}

export type FocusProofElectronChild = ChildProcess & FocusProofChild
