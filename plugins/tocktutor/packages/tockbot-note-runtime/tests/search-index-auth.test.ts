import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createConnection, type Socket } from 'node:net'
import { test } from 'node:test'
import { connectIndexPeer, listenForIndexPeer } from '../src/search-index-auth.ts'
import { IndexChannel } from '../src/search-index-channel.ts'

function socketClosed(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    // Denied/aborted unauthenticated peers may receive FIN or RST; both must close.
    socket.once('error', error => { if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error) })
    socket.once('close', () => resolve())
  })
}

test('index peers authenticate before exchanging generation-bound frames', { timeout: 5000 }, async () => {
  const controller = new AbortController()
  const listener = await listenForIndexPeer(controller.signal)
  let client
  try {
    client = await connectIndexPeer(listener.bootstrap, controller.signal)
    const server = await listener.peer
    assert.equal(client.generation, server.generation)
    const received = server.channel.frames.next()
    await client.channel.send({ type: 'test', generation: client.generation })
    assert.deepEqual((await received).value, { type: 'test', generation: server.generation })
    const refused = createConnection({ host: '127.0.0.1', port: JSON.parse(listener.bootstrap).port })
    await once(refused, 'error')
    refused.destroy()
  } finally {
    client?.channel.close()
    await listener.close()
    controller.abort()
  }
})

test('bad authentication receives no privileged data and does not consume the valid peer', { timeout: 5000 }, async () => {
  const controller = new AbortController()
  const listener = await listenForIndexPeer(controller.signal)
  let client
  try {
    const wrong = { ...JSON.parse(listener.bootstrap), token: '0'.repeat(64) }
    await assert.rejects(connectIndexPeer(JSON.stringify(wrong), controller.signal))
    client = await connectIndexPeer(listener.bootstrap, controller.signal)
    assert.equal((await listener.peer).generation, client.generation)
  } finally {
    client?.channel.close()
    await listener.close()
    controller.abort()
  }
})

test('unauthenticated stalled sockets are closed on abort; the listener does not survive', { timeout: 5000 }, async () => {
  const controller = new AbortController()
  const listener = await listenForIndexPeer(controller.signal)
  const rejection = assert.rejects(listener.peer)
  const socket = createConnection({ host: '127.0.0.1', port: JSON.parse(listener.bootstrap).port })
  try {
    await once(socket, 'connect')
    const closed = socketClosed(socket)
    controller.abort()
    await rejection
    await closed
    await listener.close()
  } finally { socket.destroy(); await listener.close() }
})

test('index authentication rejects extra fields and bounded repeated attempts', { timeout: 5000 }, async () => {
  const controller = new AbortController()
  const listener = await listenForIndexPeer(controller.signal)
  const rejection = assert.rejects(listener.peer, /attempt/iu)
  const bootstrap = JSON.parse(listener.bootstrap)
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const socket = createConnection({ host: '127.0.0.1', port: bootstrap.port })
      const closed = socketClosed(socket)
      const channel = new IndexChannel(socket)
      await channel.send({ type: 'hello', version: 1, generation: bootstrap.generation, token: bootstrap.token, extra: true })
      await closed
    }
    await rejection
  } finally { controller.abort(); await listener.close() }
})

test('authenticating the valid peer evicts a stalled competitor without killing the winner', { timeout: 5000 }, async () => {
  const controller = new AbortController()
  const listener = await listenForIndexPeer(controller.signal)
  const stalled = createConnection({ host: '127.0.0.1', port: JSON.parse(listener.bootstrap).port })
  let client
  try {
    await once(stalled, 'connect')
    const closed = socketClosed(stalled)
    client = await connectIndexPeer(listener.bootstrap, controller.signal)
    const winner = await listener.peer
    await closed
    const next = winner.channel.frames.next()
    await client.channel.send({ winner: true })
    assert.deepEqual((await next).value, { winner: true })
  } finally { stalled.destroy(); client?.channel.close(); await listener.close(); controller.abort() }
})

test('stalled unauthenticated peer expires after two seconds without blocking a valid peer', { timeout: 5000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  const listener = await listenForIndexPeer(controller.signal)
  const socket = createConnection({ host: '127.0.0.1', port: JSON.parse(listener.bootstrap).port })
  let client
  try {
    await once(socket, 'connect')
    const closed = socketClosed(socket)
    t.mock.timers.tick(2000)
    await closed
    client = await connectIndexPeer(listener.bootstrap, controller.signal)
    assert.equal((await listener.peer).generation, client.generation)
  } finally { socket.destroy(); client?.channel.close(); await listener.close(); controller.abort() }
})

test('authentication has an absolute deadline even with no peer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const listener = await listenForIndexPeer(new AbortController().signal)
  try {
    const rejection = assert.rejects(listener.peer, /timed out/iu)
    t.mock.timers.tick(15_000)
    await rejection
  } finally { await listener.close() }
})

test('index child rejects malformed bootstrap and an already-aborted launch', async () => {
  for (const value of ['{}', 'null', '{', JSON.stringify({ port: 65536, token: 'x', generation: 'x' })]) {
    await assert.rejects(connectIndexPeer(value, new AbortController().signal), /bootstrap/iu)
  }
  const signal = AbortSignal.abort()
  await assert.rejects(listenForIndexPeer(signal))
})
