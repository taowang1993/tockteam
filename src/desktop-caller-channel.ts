import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { DesktopCallerAuthorizations } from './desktop-caller-authorization.ts'
import type { DesktopCallerClaimRequest, NativeOperationIdentity } from './host-contract.ts'

export const DESKTOP_CALLER_CHANNEL_PATH = '/tockteam/desktop-caller'
const MAX_BODY_BYTES = 4 * 1024

export interface DesktopCallerChannelEnvironment {
  endpoint: string
  token: string
}

interface DesktopCallerChannelOptions {
  authorizations: DesktopCallerAuthorizations
  identity(
    operationId: string,
    requestId: string,
    windowId: string,
    frameId: string,
    sessionId: string,
  ): NativeOperationIdentity | undefined
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

async function settleWithin(work: Promise<unknown>, milliseconds: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      work,
      new Promise<void>(resolve => { timer = setTimeout(resolve, milliseconds) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
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

/** Private authenticated channel that converts a trusted-main bearer into one Host identity. */
export class DesktopCallerChannel {
  private readonly authorizations: DesktopCallerAuthorizations
  private readonly createIdentity: DesktopCallerChannelOptions['identity']
  private server: Server | undefined
  private environmentValue: DesktopCallerChannelEnvironment | undefined
  private lifetime = new AbortController()
  private generation = 0
  private readonly pending = new Set<Promise<void>>()

  constructor(options: DesktopCallerChannelOptions) {
    this.authorizations = options.authorizations
    this.createIdentity = options.identity
  }

  get environment(): DesktopCallerChannelEnvironment | undefined {
    return this.environmentValue
  }

  async start(): Promise<DesktopCallerChannelEnvironment> {
    if (this.server !== undefined) throw new Error('Desktop caller channel is already running')
    const generation = ++this.generation
    this.authorizations.clear()
    this.lifetime = new AbortController()
    const token = randomBytes(32).toString('base64url')
    const sessionId = randomBytes(32).toString('base64url')
    const lifetime = this.lifetime.signal
    const server = createServer((request, response) => {
      const work = this.handle(request, response, token, sessionId, lifetime)
      this.pending.add(work)
      void work.finally(() => this.pending.delete(work))
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    if (generation !== this.generation) {
      await new Promise<void>(resolve => server.close(() => resolve()))
      throw new Error('Desktop caller channel start was cancelled')
    }
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Desktop caller channel has no address')
    this.server = server
    this.environmentValue = {
      endpoint: `http://127.0.0.1:${String(address.port)}${DESKTOP_CALLER_CHANNEL_PATH}`,
      token,
    }
    return this.environmentValue
  }

  async stop(): Promise<void> {
    this.generation += 1
    this.lifetime.abort()
    this.authorizations.clear()
    const server = this.server
    this.server = undefined
    this.environmentValue = undefined
    if (server !== undefined) {
      const closed = new Promise<void>(resolve => {
        server.close(() => resolve())
        if (!server.listening) resolve()
      })
      server.closeAllConnections()
      await settleWithin(closed, 1_000)
    }
    await settleWithin(Promise.allSettled([...this.pending]), 1_000)
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
    sessionId: string,
    lifetime: AbortSignal,
  ): Promise<void> {
    if (request.method !== 'POST' || request.url !== DESKTOP_CALLER_CHANNEL_PATH) {
      response.writeHead(404).end()
      return
    }
    if (!authorized(request.headers.authorization, `Bearer ${token}`)) {
      response.writeHead(401).end()
      return
    }
    const abort = (): void => { request.destroy() }
    lifetime.addEventListener('abort', abort, { once: true })
    try {
      if (lifetime.aborted) throw new Error('caller channel stopped')
      const input = await body(request) as DesktopCallerClaimRequest
      if (lifetime.aborted) throw new Error('caller channel stopped')
      const identity = this.authorizations.claim(input, (operationId, requestId, windowId, frameId) => {
        return this.createIdentity(operationId, requestId, windowId, frameId, sessionId)
      })
      if (identity === undefined) json(response, 409, { status: 'stale' })
      else json(response, 200, identity)
    } catch {
      if (!response.headersSent && !response.destroyed) response.writeHead(400).end()
    } finally {
      lifetime.removeEventListener('abort', abort)
    }
  }
}
