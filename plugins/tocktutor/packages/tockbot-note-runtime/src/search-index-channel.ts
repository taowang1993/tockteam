import type { Duplex, Readable } from 'node:stream'

export const INDEX_FRAME_BYTES = 64 * 1024
const MAX_QUEUED_WRITES = 4

export function encodeIndexFrame(value: unknown): Buffer {
  const json = JSON.stringify(value)
  if (json === undefined || Buffer.byteLength(json) > INDEX_FRAME_BYTES) throw new Error('Invalid index frame size')
  const payload = Buffer.from(json)
  const result = Buffer.allocUnsafe(4 + payload.length)
  result.writeUInt32BE(payload.length)
  payload.copy(result, 4)
  return result
}

/** Retains only one bounded payload plus its four-byte header. */
export async function* decodeIndexFrames(input: Readable): AsyncGenerator<unknown> {
  const header = Buffer.alloc(4)
  const utf8 = new TextDecoder('utf-8', { fatal: true })
  let headerBytes = 0
  let payload: Buffer | undefined
  let payloadBytes = 0
  for await (const chunk of input) {
    if (!Buffer.isBuffer(chunk)) throw new Error('Invalid index frame stream')
    let offset = 0
    while (offset < chunk.length) {
      if (payload === undefined) {
        const count = Math.min(4 - headerBytes, chunk.length - offset)
        chunk.copy(header, headerBytes, offset, offset + count)
        offset += count
        headerBytes += count
        if (headerBytes !== 4) continue
        const length = header.readUInt32BE()
        if (length === 0 || length > INDEX_FRAME_BYTES) throw new Error('Invalid index frame size')
        payload = Buffer.allocUnsafe(length)
        payloadBytes = 0
      }
      const count = Math.min(payload.length - payloadBytes, chunk.length - offset)
      chunk.copy(payload, payloadBytes, offset, offset + count)
      offset += count
      payloadBytes += count
      if (payloadBytes !== payload.length) continue
      let value: unknown
      try { value = JSON.parse(utf8.decode(payload)) } catch { throw new Error('Invalid index frame JSON or UTF-8') }
      payload = undefined
      headerBytes = 0
      yield value
    }
  }
  if (headerBytes !== 0 || payload !== undefined) throw new Error('Truncated index frame')
}

/** Internal transport only; generation, capability and action validation belong to the protocol. */
export class IndexChannel {
  readonly frames: AsyncGenerator<unknown>
  private readonly socket: Duplex
  private queued = 0
  private tail: Promise<void> = Promise.resolve()

  constructor(socket: Duplex) {
    this.socket = socket
    // A peer can fail before the first read. Reads/writes still propagate the error.
    socket.on('error', () => {})
    this.frames = decodeIndexFrames(socket)
  }

  async send(value: unknown): Promise<void> {
    if (this.socket.destroyed) throw new Error('Index channel is closed')
    if (this.queued >= MAX_QUEUED_WRITES) throw new Error('Index channel write queue exceeded')
    const bytes = encodeIndexFrame(value)
    this.queued += 1
    const write = this.tail.then(() => new Promise<void>((resolve, reject) => {
      if (this.socket.destroyed) { reject(new Error('Index channel is closed')); return }
      const finish = (error?: Error | null): void => {
        this.socket.removeListener('error', failed)
        this.socket.removeListener('close', closed)
        if (error) reject(error)
        else resolve()
      }
      const failed = (error: Error): void => finish(error)
      const closed = (): void => finish(new Error('Index channel is closed'))
      this.socket.once('error', failed)
      this.socket.once('close', closed)
      this.socket.write(bytes, finish)
    }))
    this.tail = write.catch(() => {})
    try { await write } finally { this.queued -= 1 }
  }

  close(): void { this.socket.destroy() }
}
