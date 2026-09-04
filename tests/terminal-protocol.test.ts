import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BETTER_SIDEBAR_TERMINAL_WS_PATH, TerminalSocket } from '../plugins/panel-controls/src/terminal/terminal-socket.ts'
import { adaptBetterSidebarHost } from '../scripts/better-sidebar-upstream-adapter.mjs'

test('desktop terminal uses the Better Sidebar host endpoint', () => {
  assert.equal(BETTER_SIDEBAR_TERMINAL_WS_PATH, '/sidebar/ws/terminal')
})

test('Better Sidebar adapter frames session exits without changing agent terminals', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('../upstream/DSH-better-sidebar/package.json', import.meta.url),
    'utf8',
  )) as { version?: string }
  assert.equal(manifest.version, '0.15.2')
  const source = readFileSync(new URL('../upstream/DSH-better-sidebar/src/index.ts', import.meta.url), 'utf8')
  assert.match(source, /'open\.external'/u)
  const adapted = adaptBetterSidebarHost(source)
  assert.doesNotMatch(adapted, /launchExternal|'open\.external'/u)
  assert.match(adapted, /control\.type === 'park'/u)
  const gitSource = readFileSync(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url), 'utf8')
  assert.match(gitSource, /windowsHide: true/u)
  assert.equal((adapted.match(/tockteam-terminal-exit/g) ?? []).length, 1)
  assert.equal((adapted.match(/\[process exited with code/g) ?? []).length, 1)
  const crlfSource = source.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')
  assert.equal((adaptBetterSidebarHost(crlfSource).match(/tockteam-terminal-exit/g) ?? []).length, 1)
  assert.throws(() => adaptBetterSidebarHost(adapted), /seam changed upstream/u)
})

test('terminal exit is a binary control frame, never PTY text', () => {
  class FakeWebSocket {
    static readonly OPEN = 1
    readonly OPEN = 1
    binaryType = ''
    readyState = FakeWebSocket.OPEN
    onopen: (() => void) | null = null
    onmessage: ((event: { data: unknown }) => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(_url: string) {}
    send(_value: unknown): void {}
    close(): void {}
  }
  const previous = globalThis.WebSocket
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FakeWebSocket })
  try {
    const errors: string[] = []
    const exits: Array<number | null> = []
    const output: string[] = []
    const socket = new TerminalSocket('ws://127.0.0.1/terminal')
    socket.connect(80, 24, {
      onError: message => { errors.push(message) },
      onExit: code => { exits.push(code) },
      onOutput: data => { output.push(data) },
      onReady() {},
    }, { sessionId: 'session', tabId: 'tab' })
    const transport = (socket as unknown as { socket: FakeWebSocket }).socket
    transport.onmessage?.({ data: '[process exited with code 7]' })
    assert.equal(exits.length, 0)
    assert.deepEqual(output, ['[process exited with code 7]'])

    const bytes = new TextEncoder().encode(JSON.stringify({ code: 7, type: 'tockteam-terminal-exit' }))
    transport.onmessage?.({ data: bytes.buffer })
    assert.deepEqual(exits, [7])

    const failedExits: Array<number | null> = []
    const failed = new TerminalSocket('ws://127.0.0.1/terminal')
    failed.connect(80, 24, {
      onError: message => { errors.push(message) },
      onExit: code => { failedExits.push(code) },
      onOutput() {},
      onReady() {},
    }, { sessionId: 'session', tabId: 'failed' })
    const failedTransport = (failed as unknown as { socket: FakeWebSocket }).socket
    failedTransport.onerror?.()
    failedTransport.onclose?.()
    assert.deepEqual(errors, ['connection failed'])
    assert.deepEqual(failedExits, [])
  } finally {
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: previous })
  }
})

test('terminal parks on conversation switches and closes on tab removal', () => {
  class FakeWebSocket {
    static readonly OPEN = 1
    readonly OPEN = 1
    binaryType = ''
    readyState = FakeWebSocket.OPEN
    onopen: (() => void) | null = null
    onmessage: ((event: { data: unknown }) => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    readonly sent: unknown[] = []
    constructor(_url: string) {}
    send(value: unknown): void { this.sent.push(value) }
    close(): void {}
  }
  const previous = globalThis.WebSocket
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FakeWebSocket })
  try {
    const handlers = {
      onError() {},
      onExit() {},
      onOutput() {},
      onReady() {},
    }
    const parked = new TerminalSocket('ws://127.0.0.1/terminal')
    parked.connect(80, 24, handlers, { sessionId: 'session', tabId: 'parked' })
    const parkedTransport = (parked as unknown as { socket: FakeWebSocket }).socket
    parked.close('park')
    assert.deepEqual(parkedTransport.sent, [JSON.stringify({ type: 'park' })])

    const closed = new TerminalSocket('ws://127.0.0.1/terminal')
    closed.connect(80, 24, handlers, { sessionId: 'session', tabId: 'closed' })
    const closedTransport = (closed as unknown as { socket: FakeWebSocket }).socket
    closed.close()
    assert.deepEqual(closedTransport.sent, [JSON.stringify({ type: 'close' })])
  } finally {
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: previous })
  }
})
