import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'
import { TerminalSocket } from '../plugins/panel-controls/src/terminal/terminal-socket.ts'
import { adaptBetterSidebarHost } from '../scripts/better-sidebar-upstream-adapter.mjs'

const upstream = fileURLToPath(new URL('../upstream/DSH-better-sidebar/', import.meta.url))
const { WebSocketServer } = createRequire(join(upstream, 'package.json'))('ws')

async function terminalHost(temporary) {
  // Resolve the same installed dependencies used by the source Host build.
  await symlink(join(upstream, 'node_modules'), join(temporary, 'node_modules'), 'dir')
  const entry = join(upstream, 'src/index.ts')
  const bundle = join(temporary, 'host.mjs')
  await build({
    stdin: {
      contents: `${adaptBetterSidebarHost(await readFile(entry, 'utf8'))}\nexport { attachTerminal };`,
      loader: 'ts', resolveDir: dirname(entry),
    },
    outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    external: ['@deepseek-ai/*', 'cordis', 'node-pty', 'schemastery', 'ws'],
  })
  return (await import(pathToFileURL(bundle).href)).attachTerminal
}

test('terminal paste cannot resize, park, or close the shell', { timeout: 10_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tockteam-terminal-input-'))
  const server = createServer()
  const sockets = new WebSocketServer({ server })
  const received = new EventEmitter()
  const terminal = new TerminalSocket()
  const oldWindow = globalThis.window
  const events = []
  let hostSocket
  const handle = {
    key: 'session/tab', transcript: '', exited: false,
    pty: {
      onData: () => ({ dispose() {} }),
      onExit: () => ({ dispose() {} }),
      write: text => { events.push({ type: 'input', text }); received.emit('input') },
      resize: (cols, rows) => { events.push({ type: 'resize', cols, rows }); received.emit('input') },
    },
  }
  const manager = {
    open: () => handle,
    isParked: () => false,
    park: () => { events.push({ type: 'park' }); received.emit('input') },
    scheduleClose: (_key, delay) => { events.push({ type: 'close', delay }); received.emit('input') },
  }
  try {
    const attachTerminal = await terminalHost(temporary)
    sockets.on('connection', (socket, request) => {
      hostSocket = socket
      void attachTerminal({ sessions: { get: () => ({ header: { cwd: temporary } }) } },
        manager, null, socket, request, { reconnectGraceMs: 1000 }, () => undefined)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    Object.assign(globalThis, { window: { location: { protocol: 'http:', host: `127.0.0.1:${address.port}` } } })
    const ready = once(received, 'input')
    terminal.connect(80, 24, {
      onOutput() {}, onReady() {}, onExit() {},
      onError: message => received.emit('error', new Error(message)),
    }, { sessionId: 'session', tabId: 'tab' })
    await ready
    assert.deepEqual(events.pop(), { type: 'resize', cols: 80, rows: 24 })

    for (const text of ['{"type":"close"}', '{"type":"park"}', '{"type":"resize","cols":1,"rows":1}', '中文 😀\r\n\u0003']) {
      const next = once(received, 'input')
      terminal.sendInput(text)
      await next
      assert.deepEqual(events.pop(), { type: 'input', text }, 'pasted bytes must reach the shell verbatim')
    }
    const resized = once(received, 'input')
    terminal.sendResize(120, 40)
    await resized
    assert.deepEqual(events.pop(), { type: 'resize', cols: 120, rows: 40 })
    const closed = once(received, 'input')
    const disconnected = once(hostSocket, 'close')
    terminal.close('close')
    await closed
    assert.deepEqual(events.pop(), { type: 'close', delay: 0 }, 'explicit tab close must still terminate the shell')
    await disconnected
    assert.deepEqual(events, [], 'socket disconnect must not replace an explicit close with the reconnect grace')
  } finally {
    terminal.close()
    Object.assign(globalThis, { window: oldWindow })
    for (const socket of sockets.clients) socket.terminate()
    await new Promise(resolve => sockets.close(resolve))
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    assert.equal(server.listening, false)
    await rm(temporary, { recursive: true, force: true })
  }
})

test('disconnect during session lookup does not create an orphaned shell', { timeout: 10_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tockteam-terminal-disconnect-'))
  const server = createServer()
  const sockets = new WebSocketServer({ server })
  const metadata = Promise.withResolvers()
  const shells = []
  let attached
  let client
  const manager = {
    open: () => {
      const handle = {
        key: 'cold/tab', transcript: '', exited: false,
        pty: { onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }) },
      }
      shells.push(handle)
      return handle
    },
  }
  try {
    const attachTerminal = await terminalHost(temporary)
    sockets.on('connection', (socket, request) => {
      attached = attachTerminal({
        sessions: { get: () => undefined },
        get: () => ({ inspect: () => metadata.promise }),
      }, manager, null, socket, request, { reconnectGraceMs: 1000 }, () => undefined)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const connection = once(sockets, 'connection')
    client = new WebSocket(`ws://127.0.0.1:${address.port}/sidebar/ws/terminal?sessionId=cold&tab=tab`)
    await once(client, 'open')
    const [socket] = await connection
    const closed = once(socket, 'close')
    client.close()
    await closed
    metadata.resolve({ meta: { cwd: temporary } })
    await attached
    assert.deepEqual(shells, [], 'a completed lookup must not spawn a shell for a disconnected view')
  } finally {
    metadata.resolve({ meta: { cwd: temporary } })
    await attached
    client?.close()
    for (const socket of sockets.clients) socket.terminate()
    await new Promise(resolve => sockets.close(resolve))
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    assert.equal(server.listening, false)
    await rm(temporary, { recursive: true, force: true })
  }
})
