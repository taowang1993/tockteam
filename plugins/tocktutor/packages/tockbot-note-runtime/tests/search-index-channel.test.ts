import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createConnection, createServer, type Socket } from 'node:net'
import { PassThrough, Readable } from 'node:stream'
import { test } from 'node:test'
import { decodeIndexFrames, encodeIndexFrame, INDEX_FRAME_BYTES, IndexChannel } from '../src/search-index-channel.ts'

async function collect(values: AsyncIterable<unknown>): Promise<unknown[]> {
  const result: unknown[] = []
  for await (const value of values) result.push(value)
  return result
}

const frame = (payload: Buffer): Buffer => {
  const header = Buffer.alloc(4)
  header.writeUInt32BE(payload.length)
  return Buffer.concat([header, payload])
}

test('index frames survive fragmented headers, split Unicode, and coalescing', async () => {
  const values = [{ text: '中文 🎵' }, { sequence: 2 }]
  const bytes = Buffer.concat(values.map(encodeIndexFrame))
  // Object mode prevents Readable from coalescing these one-byte chunks.
  const input = Readable.from([...bytes].map(byte => Buffer.from([byte])), { objectMode: true })
  assert.deepEqual(await collect(decodeIndexFrames(input)), values)
  const coalesced = new PassThrough()
  coalesced.end(bytes)
  assert.deepEqual(await collect(decodeIndexFrames(coalesced)), values)
})

test('index framing rejects invalid bytes and lengths before accepting a payload', async () => {
  for (const bytes of [
    Buffer.from([0, 1, 0, 1]), // 65537: must reject without waiting for body
    Buffer.alloc(4),
    frame(Buffer.from([0xff])),
    frame(Buffer.from('{')),
    Buffer.from([0, 0]),
    Buffer.concat([Buffer.from([0, 0, 0, 4]), Buffer.from('{}')]),
  ]) {
    const input = new PassThrough()
    const result = collect(decodeIndexFrames(input))
    input.end(bytes)
    await assert.rejects(result, /index frame/iu)
  }
})

test('oversized announced frames reject without receiving a body or EOF', async () => {
  const input = new PassThrough()
  const result = collect(decodeIndexFrames(input))
  input.write(Buffer.from([0, 1, 0, 1]))
  await assert.rejects(result, /index frame size/iu)
  assert.equal(input.destroyed, true)
})

test('index frame byte ceiling includes the JSON envelope', () => {
  const exact = 'x'.repeat(INDEX_FRAME_BYTES - 2)
  assert.equal(encodeIndexFrame(exact).length, INDEX_FRAME_BYTES + 4)
  assert.throws(() => encodeIndexFrame(exact + 'x'), /index frame/iu)
  assert.throws(() => encodeIndexFrame(undefined), /index frame/iu)
})

test('index channel exchanges framed data over loopback and closes all sockets', { timeout: 5000 }, async () => {
  const server = createServer({ highWaterMark: INDEX_FRAME_BYTES })
  const sockets: Socket[] = []
  server.on('connection', socket => sockets.push(socket))
  try {
    const accepted = once(server, 'connection')
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const connectionOptions = { host: '127.0.0.1', port: address.port, highWaterMark: INDEX_FRAME_BYTES }
    const client = createConnection(connectionOptions)
    sockets.push(client)
    await once(client, 'connect')
    const [peer] = await accepted as [Socket]
    const host = new IndexChannel(peer)
    const child = new IndexChannel(client)
    const incoming = host.frames.next()
    await child.send({ type: 'hello', value: '中文' })
    assert.deepEqual((await incoming).value, { type: 'hello', value: '中文' })
    const response = child.frames.next()
    await host.send({ type: 'accepted' })
    assert.deepEqual((await response).value, { type: 'accepted' })
    host.close()
    child.close()
    await assert.rejects(child.send({ type: 'late' }), /closed/iu)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('closing a backpressured index channel rejects pending writes without an error event', { timeout: 1000 }, async () => {
  const socket = new PassThrough({ highWaterMark: 1 })
  const channel = new IndexChannel(socket)
  const writes = Array.from({ length: 4 }, (_, id) => channel.send({ id }).catch(error => error))
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.ok(socket.writableLength > 0)
  assert.equal(socket.writableNeedDrain, true)
  channel.close()
  assert.ok((await Promise.all(writes)).every(result => result instanceof Error))
})

test('index channel rejects excess queued writes rather than buffering indefinitely', async () => {
  const socket = new PassThrough({ highWaterMark: 1 })
  const channel = new IndexChannel(socket)
  const writes = Array.from({ length: 4 }, (_, id) => channel.send({ id }).catch(error => error))
  await assert.rejects(channel.send({ id: 5 }), /queue/iu)
  socket.destroy(new Error('test shutdown'))
  assert.ok((await Promise.all(writes)).every(result => result instanceof Error))
})
