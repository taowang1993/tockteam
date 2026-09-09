export const LAUNCHER_FOCUS_PROOF_CHANNEL = 'tockteam-launcher-focus-proof' as const
const MAX_FOCUS_EVENTS = 64
const MAX_WINDOWS = 32

type FocusKind = 'app-activate' | 'app-window-focus' | 'checkpoint-focused' | 'window-focus'
type WindowState = Readonly<{ focused: boolean; id: number }>
interface MessageBase { readonly channel: typeof LAUNCHER_FOCUS_PROOF_CHANNEL; readonly focusFaultCount: number; readonly faulted: boolean; readonly nonce: string; readonly sequence: number }
export type LauncherFocusProofMessage = Readonly<MessageBase & (
  | { type: 'READY' }
  | { kind: FocusKind; type: 'FOCUS_FAULT'; windowId?: number }
  | { focusedWindowCount: number; requestSequence: number; type: 'CHECKPOINT_ACK'; windows: readonly WindowState[] }
  | { requestSequence: number; type: 'SHUTDOWN_ACK' | 'SHUTDOWN_REJECTED' }
)>

type ParentCommand = Readonly<{ channel: typeof LAUNCHER_FOCUS_PROOF_CHANNEL; command: 'CHECKPOINT' | 'SHUTDOWN'; nonce: string; sequence: number }>
export interface LauncherFocusProofWindow { readonly id: number; isFocused(): boolean; on(event: 'focus', listener: () => void): unknown }
export interface LauncherFocusProofApp {
  on(event: 'activate', listener: () => void): unknown
  on(event: 'browser-window-focus', listener: (event: unknown, window: LauncherFocusProofWindow) => void): unknown
  on(event: 'browser-window-created', listener: (event: unknown, window: LauncherFocusProofWindow) => void): unknown
}
export interface LauncherFocusProofChannel {
  readonly connected: boolean
  on(event: 'disconnect', listener: () => void): unknown
  on(event: 'message', listener: (message: unknown) => void): unknown
  send(message: LauncherFocusProofMessage, callback: (error: Error | null) => void): boolean
}

export interface LauncherFocusProofController { readonly enabled: boolean; readonly focusFaultCount: number; readonly faulted: boolean }

const validNonce = (value: string): boolean => /^[0-9a-f]{64}$/u.test(value)
const parentCommand = (value: unknown): value is ParentCommand => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return Object.keys(entry).sort().join(',') === 'channel,command,nonce,sequence'
    && entry.channel === LAUNCHER_FOCUS_PROOF_CHANNEL
    && (entry.command === 'CHECKPOINT' || entry.command === 'SHUTDOWN')
    && typeof entry.nonce === 'string'
    && Number.isSafeInteger(entry.sequence) && Number(entry.sequence) > 0
}

export function installLauncherFocusProof(options: Readonly<{
  app: LauncherFocusProofApp
  channel: LauncherFocusProofChannel | undefined
  enabled: boolean
  emergencyExit(exitCode: 1): void
  getAllWindows(): readonly LauncherFocusProofWindow[]
  nonce: string | undefined
  scheduleExit(callback: () => void): void
  shutdown(exitCode: 0 | 1): void
}>): LauncherFocusProofController {
  if (!options.enabled) return Object.freeze({ enabled: false, focusFaultCount: 0, faulted: false })
  if (!options.channel?.connected || typeof options.nonce !== 'string' || !validNonce(options.nonce)) throw new Error('Inactive visual proof requires authenticated parent IPC')
  const channel = options.channel
  const nonce = options.nonce
  let outboundSequence = 0
  let expectedRequestSequence = 1
  let focusFaultCount = 0
  let protocolFault = false
  let pendingSends = 0
  let shutdownRequested = false
  let exitScheduled = false
  let exited = false
  const attachedWindows = new WeakSet<object>()
  const isFaulted = (): boolean => protocolFault || focusFaultCount > 0
  const response = <T extends Omit<LauncherFocusProofMessage, keyof MessageBase>>(message: T): void => {
    const envelope = Object.freeze({ ...message, channel: LAUNCHER_FOCUS_PROOF_CHANNEL, focusFaultCount, faulted: isFaulted(), nonce, sequence: ++outboundSequence }) as LauncherFocusProofMessage
    pendingSends += 1
    try {
      channel.send(envelope, error => {
        pendingSends -= 1
        if (error) protocolFault = true
        requestExit()
      })
    } catch { pendingSends -= 1; protocolFault = true; requestExit() }
  }
  const performShutdown = (): void => {
    if (exited || !shutdownRequested || pendingSends > 0) return
    exited = true
    options.shutdown(isFaulted() ? 1 : 0)
  }
  function requestExit(): void {
    if (!shutdownRequested || pendingSends > 0 || exitScheduled || exited) return
    exitScheduled = true
    options.scheduleExit(() => { exitScheduled = false; if (pendingSends > 0) requestExit(); else performShutdown() })
  }
  const latchFocus = (kind: FocusKind, window?: LauncherFocusProofWindow): void => {
    if (focusFaultCount >= MAX_FOCUS_EVENTS) { protocolFault = true; requestExit(); return }
    focusFaultCount += 1
    const windowId = Number.isSafeInteger(window?.id) && window!.id > 0 ? window!.id : undefined
    response({ kind, type: 'FOCUS_FAULT', ...(windowId === undefined ? {} : { windowId }) })
  }
  const attachWindow = (window: LauncherFocusProofWindow): void => { if (attachedWindows.has(window)) return; attachedWindows.add(window); window.on('focus', () => latchFocus('window-focus', window)) }

  // These listeners are installed synchronously before READY and before main
  // bootstrap can construct its first BrowserWindow.
  options.app.on('activate', () => latchFocus('app-activate'))
  options.app.on('browser-window-focus', (_event, window) => latchFocus('app-window-focus', window))
  options.app.on('browser-window-created', (_event, window) => attachWindow(window))
  for (const window of options.getAllWindows()) attachWindow(window)
  channel.on('disconnect', () => {
    protocolFault = true
    shutdownRequested = true
    if (!exited) { exited = true; options.shutdown(1) }
    options.emergencyExit(1)
  })
  channel.on('message', message => {
    if (shutdownRequested) { protocolFault = true; requestExit(); return }
    if (!parentCommand(message) || message.nonce !== nonce || message.sequence !== expectedRequestSequence) { protocolFault = true; return }
    expectedRequestSequence += 1
    if (message.command === 'CHECKPOINT') {
      const windows = options.getAllWindows()
      if (windows.length > MAX_WINDOWS) protocolFault = true
      const states = windows.slice(0, MAX_WINDOWS).map(window => {
        let focused = false
        try { focused = window.isFocused() } catch { protocolFault = true }
        if (focused) latchFocus('checkpoint-focused', window)
        return Object.freeze({ focused, id: Number.isSafeInteger(window.id) && window.id > 0 ? window.id : 0 })
      })
      response({ focusedWindowCount: states.filter(state => state.focused).length, requestSequence: message.sequence, type: 'CHECKPOINT_ACK', windows: Object.freeze(states) })
      return
    }
    shutdownRequested = true
    response({ requestSequence: message.sequence, type: isFaulted() ? 'SHUTDOWN_REJECTED' : 'SHUTDOWN_ACK' })
    requestExit()
  })
  response({ type: 'READY' })
  return Object.freeze({ enabled: true, get focusFaultCount() { return focusFaultCount }, get faulted() { return isFaulted() } })
}
