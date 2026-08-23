import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { DesktopMicrophoneOwner } from './desktop-microphone-owner.ts'
import type { DesktopMicrophoneRequest } from './host-contract.ts'

export const DESKTOP_MICROPHONE_CHANNEL_PATH = '/tockteam/desktop-microphone'
const MAX_BODY_BYTES = 8 * 1024

export interface DesktopMicrophoneChannelEnvironment {
  endpoint: string
  token: string
}

function authorized(value: string | undefined, expected: string): boolean {
  if (value === undefined) return false
  const actual = Buffer.from(value)
  const target = Buffer.from(expected)
  return actual.length === target.length && timingSafeEqual(actual, target)
}

async function body(request: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > MAX_BODY_BYTES) throw new Error('too large')
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const rendered = JSON.stringify(value)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(rendered),
  })
  response.end(rendered)
}

export class DesktopMicrophoneChannel {
  private server: Server | undefined
  private readonly owner: DesktopMicrophoneOwner
  private environmentValue: DesktopMicrophoneChannelEnvironment | undefined
  private lifetime = new AbortController()
  private generation = 0
  private readonly pending = new Set<Promise<void>>()

  constructor(owner: DesktopMicrophoneOwner) {
    this.owner = owner
  }

  get environment(): DesktopMicrophoneChannelEnvironment | undefined {
    return this.environmentValue
  }

  async start(): Promise<DesktopMicrophoneChannelEnvironment> {
    if (this.server !== undefined) throw new Error('Desktop microphone channel is already running')
    const generation = ++this.generation
    this.owner.reopen()
    this.lifetime = new AbortController()
    const token = randomBytes(32).toString('base64url')
    const server = createServer((request, response) => {
      const work = this.handle(request, response, token)
      this.pending.add(work)
      void work.finally(() => this.pending.delete(work))
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    if (generation !== this.generation) {
      await new Promise<void>(resolve => server.close(() => resolve()))
      throw new Error('Desktop microphone channel start was cancelled')
    }
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Desktop microphone channel has no address')
    this.server = server
    this.environmentValue = {
      endpoint: `http://127.0.0.1:${String(address.port)}${DESKTOP_MICROPHONE_CHANNEL_PATH}`,
      token,
    }
    return this.environmentValue
  }

  async stop(): Promise<void> {
    this.generation += 1
    this.lifetime.abort()
    this.owner.dispose()
    const server = this.server
    this.server = undefined
    this.environmentValue = undefined
    if (server !== undefined) {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
        if (!server.listening) resolve()
      })
    }
    await Promise.allSettled([...this.pending])
  }

  private async handle(request: IncomingMessage, response: ServerResponse, token: string): Promise<void> {
    if (request.method !== 'POST' || request.url !== DESKTOP_MICROPHONE_CHANNEL_PATH) {
      response.writeHead(404).end()
      return
    }
    if (!authorized(request.headers.authorization, `Bearer ${token}`)) {
      response.writeHead(401).end()
      return
    }
    const requestController = new AbortController()
    const abort = (): void => { requestController.abort(); request.destroy() }
    this.lifetime.signal.addEventListener('abort', abort, { once: true })
    request.once('aborted', abort)
    const signal = AbortSignal.any([this.lifetime.signal, requestController.signal])
    try {
      const input = await body(request)
      if (typeof input === 'object' && input !== null && (input as Record<string, unknown>).disposeProvider === true) {
        this.owner.disposeProvider()
        json(response, 200, { status: 'closed' })
      } else {
        const result = await this.owner.request(input as DesktopMicrophoneRequest, signal)
        if (signal.aborted && result.status === 'granted') {
          this.owner.disposeProvider()
          return
        }
        json(response, 200, result)
      }
    } catch {
      if (!response.headersSent && !response.destroyed) response.writeHead(400).end()
    } finally {
      this.lifetime.signal.removeEventListener('abort', abort)
      request.removeListener('aborted', abort)
    }
  }
}
