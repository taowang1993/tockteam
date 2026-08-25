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

function closeRequest(request: IncomingMessage, response: ServerResponse, status: number): void {
  response.writeHead(status, { connection: 'close' })
  response.end(() => { request.destroy() })
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

type RequestBody =
  | { status: 'aborted' }
  | { status: 'ready'; value: string }
  | { status: 'too-large' }

async function bodyOf(request: IncomingMessage, signal: AbortSignal): Promise<RequestBody> {
  return await new Promise<RequestBody>((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    let settled = false
    const cleanup = (): void => {
      request.removeListener('data', onData)
      request.removeListener('end', onEnd)
      request.removeListener('error', onError)
      signal.removeEventListener('abort', onAbort)
    }
    const finish = (result: RequestBody): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_DESKTOP_REVEAL_BODY_BYTES) {
        request.pause()
        finish({ status: 'too-large' })
      } else {
        chunks.push(buffer)
      }
    }
    const onEnd = (): void => {
      finish({ status: 'ready', value: Buffer.concat(chunks).toString('utf8') })
    }
    const onError = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAbort = (): void => {
      request.destroy()
      finish({ status: 'aborted' })
    }
    request.on('data', onData)
    request.once('end', onEnd)
    request.once('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}

/** One authenticated, reveal-only request channel for the current DSH child. */
export class DesktopRevealChannel {
  private readonly options: DesktopRevealChannelOptions
  private server: Server | undefined
  private environmentValue: DesktopRevealChannelEnvironment | undefined
  private readonly consumed = new Set<string>()
  private readonly pending = new Set<Promise<void>>()
  private lifetime = new AbortController()
  private starting = false
  private stopping = false

  constructor(options: DesktopRevealChannelOptions) {
    this.options = options
  }

  get environment(): DesktopRevealChannelEnvironment | undefined {
    return this.environmentValue
  }

  async start(): Promise<DesktopRevealChannelEnvironment> {
    if (this.server !== undefined || this.starting) throw new Error('Desktop reveal channel is already running')
    this.starting = true
    this.stopping = false
    this.lifetime = new AbortController()
    const token = randomBytes(32).toString('base64url')
    const server = createServer((request, response) => {
      const work = this.handle(request, response, token)
      this.pending.add(work)
      void work.catch(() => {
        if (!response.headersSent) response.writeHead(500).end()
        else if (!response.writableEnded) response.destroy()
      }).finally(() => { this.pending.delete(work) })
    })
    try {
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
      if (this.stopping) {
        await new Promise<void>(resolve => { server.close(() => { resolve() }) })
        throw new Error('Desktop reveal channel was stopped while starting')
      }
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
    } finally {
      this.starting = false
    }
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
      closeRequest(request, response, 404)
      return
    }
    if (!authorized(request.headers.authorization, `Bearer ${token}`)) {
      closeRequest(request, response, 401)
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
    const body = await bodyOf(request, signal)
    if (body.status === 'aborted') return
    if (body.status === 'too-large') {
      response.writeHead(413, { connection: 'close' })
      response.end(() => { request.destroy() })
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(body.value)
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
