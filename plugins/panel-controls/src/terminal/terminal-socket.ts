export interface TerminalSocketHandlers {
  onOutput(data: string): void
  onReady(cwd: string): void
  onExit(code: number | null): void
  onError(message: string): void
}

export interface TerminalSocketScope {
  cwd?: string
  sessionId: string
  tabId: string
}

export const BETTER_SIDEBAR_TERMINAL_WS_PATH = '/sidebar/ws/terminal'

export function terminalWebSocketUrl(scope: TerminalSocketScope): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(`${protocol}//${window.location.host}${BETTER_SIDEBAR_TERMINAL_WS_PATH}`)
  url.searchParams.set('sessionId', scope.sessionId)
  url.searchParams.set('tab', scope.tabId)
  if (scope.cwd !== undefined) url.searchParams.set('cwd', scope.cwd)
  return url.href
}

/** TockTeam terminal UI adapter for Better Sidebar's raw PTY protocol. */
export class TerminalSocket {
  private readonly url: string | undefined
  private socket: WebSocket | undefined
  private status: 'connecting' | 'ready' | 'error' | 'closed' = 'connecting'

  constructor(url?: string) {
    this.url = url
  }

  connect(
    cols: number,
    rows: number,
    handlers: TerminalSocketHandlers,
    scope: TerminalSocketScope,
  ): void {
    if (this.socket !== undefined) return
    const socket = new WebSocket(this.url ?? terminalWebSocketUrl(scope))
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    this.status = 'connecting'
    socket.onopen = () => {
      this.status = 'ready'
      handlers.onReady(scope.cwd ?? '')
      this.sendControl({ type: 'resize', cols, rows })
    }
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        handlers.onOutput(event.data)
        return
      }
      if (!(event.data instanceof ArrayBuffer) || this.status === 'closed') return
      try {
        const control: unknown = JSON.parse(new TextDecoder().decode(event.data))
        if (typeof control !== 'object' || control === null || Array.isArray(control)) return
        const record = control as Record<string, unknown>
        if (Object.keys(record).length !== 2 || record.type !== 'tockteam-terminal-exit'
          || typeof record.code !== 'number' || !Number.isSafeInteger(record.code)) return
        this.status = 'closed'
        handlers.onExit(record.code)
      } catch {
        // Binary frames are reserved for trusted Host control messages.
      }
    }
    socket.onclose = () => {
      if (this.status === 'closed' || this.status === 'error') return
      this.status = 'closed'
      handlers.onExit(null)
    }
    socket.onerror = () => {
      if (this.status === 'closed' || this.status === 'error') return
      this.status = 'error'
      handlers.onError('connection failed')
    }
  }

  sendInput(data: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data)
  }

  sendResize(cols: number, rows: number): void {
    this.sendControl({ type: 'resize', cols, rows })
  }

  close(mode: 'close' | 'park' = 'close'): void {
    const socket = this.socket
    this.socket = undefined
    if (socket === undefined) return
    socket.onclose = null
    socket.onerror = null
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: mode }))
    socket.close()
  }

  private sendControl(message: { type: 'resize'; cols: number; rows: number }): void {
    if (this.socket?.readyState === WebSocket.OPEN) socketSend(this.socket, message)
  }
}

function socketSend(socket: WebSocket, message: unknown): void {
  socket.send(JSON.stringify(message))
}
