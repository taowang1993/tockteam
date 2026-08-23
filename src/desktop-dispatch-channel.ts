import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { DesktopDispatchOwner } from './desktop-dispatch-owner.ts'
import type {
  DesktopDispatchCompletionRequest,
  DesktopQuickAction,
  NativeOperationIdentity,
} from './host-contract.ts'

export const DESKTOP_DISPATCH_CHANNEL_PATH = '/tockteam/desktop-dispatch'
const MAX_BODY_BYTES = 64 * 1024

export interface DesktopDispatchChannelEnvironment {
  endpoint: string
  token: string
}

export interface DesktopDispatchChannelOptions {
  identity(operationId: string, requestId: string, channelSessionId: string): NativeOperationIdentity | undefined
  isAvailable(): boolean
}

function authorized(value: string | undefined, expected: string): boolean {
  if (value === undefined) return false
  const actual = Buffer.from(value)
  const target = Buffer.from(expected)
  return actual.length === target.length && timingSafeEqual(actual, target)
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function body(request: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/** Authenticated live-child queue for typed native dispatch. */
export class DesktopDispatchChannel {
  private readonly options: DesktopDispatchChannelOptions
  private owner: DesktopDispatchOwner | undefined
  private server: Server | undefined
  private environmentValue: DesktopDispatchChannelEnvironment | undefined
  private lifetime = new AbortController()
  private readonly pending = new Set<Promise<void>>()

  constructor(options: DesktopDispatchChannelOptions) {
    this.options = options
  }

  get environment(): DesktopDispatchChannelEnvironment | undefined {
    return this.environmentValue
  }

  publishQuickAction(action: DesktopQuickAction): boolean {
    return this.owner?.publishQuickAction(action) ?? false
  }

  publishProtocol(raw: string): boolean {
    return this.owner?.publishProtocol(raw) ?? false
  }

  async start(): Promise<DesktopDispatchChannelEnvironment> {
    if (this.server !== undefined) throw new Error('Desktop dispatch channel is already running')
    this.lifetime = new AbortController()
    const token = randomBytes(32).toString('base64url')
    const channelSessionId = randomBytes(24).toString('base64url')
    this.owner = new DesktopDispatchOwner({
      identity: (operationId, requestId) => this.options.identity(operationId, requestId, channelSessionId),
      isAvailable: this.options.isAvailable,
    })
    const server = createServer((request, response) => {
      const work = this.handle(request, response, token)
      this.pending.add(work)
      void work.finally(() => { this.pending.delete(work) })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Desktop dispatch channel has no address')
    this.server = server
    this.environmentValue = {
      endpoint: `http://127.0.0.1:${String(address.port)}${DESKTOP_DISPATCH_CHANNEL_PATH}`,
      token,
    }
    return this.environmentValue
  }

  async stop(): Promise<void> {
    this.lifetime.abort()
    const server = this.server
    this.server = undefined
    this.environmentValue = undefined
    this.owner?.dispose()
    this.owner = undefined
    if (server !== undefined) {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
        if (!server.listening) resolve()
      })
    }
    await Promise.allSettled([...this.pending])
  }

  private async handle(request: IncomingMessage, response: ServerResponse, token: string): Promise<void> {
    if (request.method !== 'POST' || request.url !== DESKTOP_DISPATCH_CHANNEL_PATH) {
      response.writeHead(404).end()
      return
    }
    if (!authorized(request.headers.authorization, `Bearer ${token}`)) {
      response.writeHead(401).end()
      return
    }
    const requestLifetime = new AbortController()
    const abort = (): void => { requestLifetime.abort(); request.destroy() }
    this.lifetime.signal.addEventListener('abort', abort, { once: true })
    request.once('aborted', abort)
    response.once('close', abort)
    const signal = AbortSignal.any([this.lifetime.signal, requestLifetime.signal])
    try {
      const input = await body(request)
      if (typeof input !== 'object' || input === null) throw new Error('invalid request')
      const record = input as Record<string, unknown>
      if (record.method === 'next' && Object.keys(record).length === 1) {
        json(response, 200, { event: await this.owner?.next(signal) ?? null })
        return
      }
      if (record.method === 'complete' && Object.keys(record).length === 2
        && typeof record.request === 'object' && record.request !== null) {
        json(response, 200, { result: await this.owner?.complete(record.request as DesktopDispatchCompletionRequest, signal) })
        return
      }
      throw new Error('invalid request')
    } catch {
      if (!response.headersSent && !response.destroyed) response.writeHead(400).end()
    } finally {
      this.lifetime.signal.removeEventListener('abort', abort)
      request.removeListener('aborted', abort)
      response.removeListener('close', abort)
    }
  }
}
