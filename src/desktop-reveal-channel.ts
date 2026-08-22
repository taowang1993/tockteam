import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  DESKTOP_REVEAL_CHANNEL_PATH,
  MAX_DESKTOP_REVEAL_BODY_BYTES,
  MAX_DESKTOP_REVEAL_RESULT_BYTES,
  validateDesktopRevealInput,
  validateDesktopRevealResult,
  type DesktopRevealInput,
  type DesktopRevealResult,
} from './desktop-reveal.ts'

export interface DesktopRevealChannelEnvironment {
  endpoint: string
  token: string
}

export interface DesktopRevealChannelOptions {
  isAvailable(): boolean
  onReveal(input: DesktopRevealInput, signal: AbortSignal): Promise<DesktopRevealResult>
}

function authorized(value: string | undefined, expected: string): boolean {
  if (value === undefined) return false
  const actual = Buffer.from(value)
  const target = Buffer.from(expected)
  return actual.length === target.length && timingSafeEqual(actual, target)
}

function jsonResponse(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function bodyOf(request: IncomingMessage): Promise<string | undefined> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_DESKTOP_REVEAL_BODY_BYTES) {
      request.destroy()
      return undefined
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** One authenticated, reveal-only request channel for the current DSH child. */
export class DesktopRevealChannel {
  private readonly options: DesktopRevealChannelOptions
  private server: Server | undefined
  private environmentValue: DesktopRevealChannelEnvironment | undefined
  private readonly consumed = new Set<string>()
  private readonly pending = new Set<Promise<void>>()
  private lifetime = new AbortController()
  private stopping = false

  constructor(options: DesktopRevealChannelOptions) {
    this.options = options
  }

  get environment(): DesktopRevealChannelEnvironment | undefined {
    return this.environmentValue
  }

  async start(): Promise<DesktopRevealChannelEnvironment> {
    if (this.server !== undefined) throw new Error('Desktop reveal channel is already running')
    this.stopping = false
    this.lifetime = new AbortController()
    const token = randomBytes(32).toString('base64url')
    const server = createServer((request, response) => {
      const work = this.handle(request, response, token)
      this.pending.add(work)
      void work.then(
        () => { this.pending.delete(work) },
        () => { this.pending.delete(work) },
      )
    })
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.removeListener('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        server.removeListener('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(0, '127.0.0.1')
    })
    const address = server.address()
    if (address === null || typeof address === 'string') {
      server.close()
      throw new Error('Desktop reveal channel did not receive a TCP address')
    }
    this.server = server
    this.environmentValue = {
      endpoint: `http://127.0.0.1:${String(address.port)}${DESKTOP_REVEAL_CHANNEL_PATH}`,
      token,
    }
    return this.environmentValue
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.lifetime.abort()
    const server = this.server
    this.server = undefined
    this.environmentValue = undefined
    this.consumed.clear()
    if (server !== undefined) {
      await new Promise<void>(resolve => {
        server.close(() => { resolve() })
        if (!server.listening) resolve()
      })
    }
    await Promise.allSettled([...this.pending])
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
  ): Promise<void> {
    if (request.method !== 'POST' || request.url !== DESKTOP_REVEAL_CHANNEL_PATH) {
      response.writeHead(404).end()
      return
    }
    if (!authorized(request.headers.authorization, `Bearer ${token}`)) {
      response.writeHead(401).end()
      return
    }
    const requestLifetime = new AbortController()
    const abortRequest = (): void => { requestLifetime.abort() }
    const onRequestClose = (): void => {
      if (!request.complete) abortRequest()
    }
    const onResponseClose = (): void => {
      if (!response.writableEnded) abortRequest()
    }
    request.once('aborted', abortRequest)
    request.once('close', onRequestClose)
    response.once('close', onResponseClose)
    const signal = AbortSignal.any([this.lifetime.signal, requestLifetime.signal])
    try {
      await this.handleAuthorized(request, response, signal)
    } finally {
      request.removeListener('aborted', abortRequest)
      request.removeListener('close', onRequestClose)
      response.removeListener('close', onResponseClose)
    }
  }

  private async handleAuthorized(
    request: IncomingMessage,
    response: ServerResponse,
    signal: AbortSignal,
  ): Promise<void> {
    const body = await bodyOf(request)
    if (body === undefined) {
      response.writeHead(413).end()
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(body)
    } catch {
      response.writeHead(400).end()
      return
    }
    const input = validateDesktopRevealInput(raw)
    if (input === undefined) {
      response.writeHead(400).end()
      return
    }
    if (signal.aborted || this.stopping || !this.options.isAvailable()) {
      jsonResponse(response, 200, { operationId: input.operationId, status: 'cancelled' })
      return
    }
    if (this.consumed.has(input.operationId)) {
      jsonResponse(response, 200, { operationId: input.operationId, status: 'denied' })
      return
    }
    this.consumed.add(input.operationId)
    let result: DesktopRevealResult
    try {
      result = await this.options.onReveal(input, signal)
    } catch {
      result = signal.aborted
        ? { operationId: input.operationId, status: 'cancelled' }
        : { operationId: input.operationId, status: 'unavailable' }
    }
    const validated = validateDesktopRevealResult(result)
    if (validated === undefined || validated.operationId !== input.operationId) {
      jsonResponse(response, 200, { operationId: input.operationId, status: 'unavailable' })
      return
    }
    const rendered = JSON.stringify(validated)
    if (Buffer.byteLength(rendered) > MAX_DESKTOP_REVEAL_RESULT_BYTES) {
      jsonResponse(response, 200, { operationId: input.operationId, status: 'unavailable' })
      return
    }
    jsonResponse(response, 200, validated)
  }
}
