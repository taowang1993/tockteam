import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { DESKTOP_PICKER_CHANNEL_PATH, DesktopPickerOwner } from './desktop-picker-owner.ts'
import { TockTeamDesktopGrantError, type DesktopPickerRequest } from './host-contract.ts'

const MAX_BODY_BYTES = 8 * 1024 * 1024
const MAX_RESULT_BYTES = 8 * 1024 * 1024

type PickerMethod =
  | 'pick'
  | 'beginSource'
  | 'listSource'
  | 'statSource'
  | 'readSource'
  | 'revalidateSource'
  | 'releaseSource'
  | 'beginDestination'
  | 'writeDestinationChunk'
  | 'finalizeDestination'
  | 'abortDestination'
  | 'beginVaultActivation'
  | 'commitVaultActivation'
  | 'abortVaultActivation'

export interface DesktopPickerChannelEnvironment {
  endpoint: string
  token: string
}

function authorized(value: string | undefined, expected: string): boolean {
  if (value === undefined) return false
  const actual = Buffer.from(value)
  const target = Buffer.from(expected)
  return actual.length === target.length && timingSafeEqual(actual, target)
}

function responseJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function requestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      request.destroy()
      return undefined
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function operationIdOf(value: unknown): string {
  if (typeof value !== 'object' || value === null) return ''
  const operationId = (value as Record<string, unknown>).identity
  if (typeof operationId !== 'object' || operationId === null) return ''
  const id = (operationId as Record<string, unknown>).operationId
  return typeof id === 'string' ? id.slice(0, 256) : ''
}

/** Authenticated one-child transport for the Desktop picker owner. */
export class DesktopPickerChannel {
  private server: Server | undefined
  private readonly owner: DesktopPickerOwner
  private environmentValue: DesktopPickerChannelEnvironment | undefined
  private lifetime = new AbortController()
  private stopping = false
  private readonly pending = new Set<Promise<void>>()
  private readonly consumedPickOperations = new Set<string>()

  constructor(owner: DesktopPickerOwner) {
    this.owner = owner
  }

  get environment(): DesktopPickerChannelEnvironment | undefined {
    return this.environmentValue
  }

  async start(): Promise<DesktopPickerChannelEnvironment> {
    if (this.server !== undefined) throw new Error('Desktop picker channel is already running')
    this.owner.reopen()
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
      throw new Error('Desktop picker channel did not receive a TCP address')
    }
    this.server = server
    this.environmentValue = {
      endpoint: `http://127.0.0.1:${String(address.port)}${DESKTOP_PICKER_CHANNEL_PATH}`,
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
    this.consumedPickOperations.clear()
    if (server !== undefined) {
      await new Promise<void>(resolve => {
        server.close(() => { resolve() })
        if (!server.listening) resolve()
      })
    }
    await Promise.allSettled([...this.pending])
    await this.owner.dispose()
  }

  private async handle(request: IncomingMessage, response: ServerResponse, token: string): Promise<void> {
    if (request.method !== 'POST' || request.url !== DESKTOP_PICKER_CHANNEL_PATH) {
      response.writeHead(404).end()
      return
    }
    if (!authorized(request.headers.authorization, `Bearer ${token}`)) {
      response.writeHead(401).end()
      return
    }
    const requestLifetime = new AbortController()
    const abortRequest = (): void => { requestLifetime.abort() }
    const onRequestClose = (): void => { if (!request.complete) abortRequest() }
    const onResponseClose = (): void => { if (!response.writableEnded) abortRequest() }
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
    const body = await requestBody(request)
    if (body === undefined) {
      response.writeHead(413).end()
      return
    }
    let raw: unknown
    try { raw = JSON.parse(body) } catch {
      response.writeHead(400).end()
      return
    }
    if (typeof raw !== 'object' || raw === null) {
      response.writeHead(400).end()
      return
    }
    const input = raw as Record<string, unknown>
    const method = input.method
    const requestValue = input.request
    if (typeof method !== 'string' || !this.isMethod(method) || typeof requestValue !== 'object' || requestValue === null) {
      response.writeHead(400).end()
      return
    }
    const operationId = operationIdOf(requestValue)
    if (method === 'pick') {
      if (this.consumedPickOperations.has(operationId)) {
        responseJson(response, 200, { ok: true, value: { operationId, status: 'denied' } })
        return
      }
      this.consumedPickOperations.add(operationId)
    }
    if (this.stopping || signal.aborted) {
      responseJson(response, 200, { ok: true, value: { operationId, status: 'cancelled' } })
      return
    }
    const decoded = { ...requestValue } as Record<string, unknown>
    if (method === 'writeDestinationChunk' && typeof decoded.bytes === 'string') {
      try { decoded.bytes = Uint8Array.from(Buffer.from(decoded.bytes, 'base64')) } catch {
        responseJson(response, 200, { ok: false, error: { code: 'invalid-entry' } })
        return
      }
    }
    try {
      const value = await this.call(method, decoded, signal)
      const rendered = JSON.stringify(value ?? null, (_key, item) => item instanceof Uint8Array
        ? { __desktopBytes: Buffer.from(item).toString('base64') }
        : item)
      if (Buffer.byteLength(rendered) > MAX_RESULT_BYTES) {
        responseJson(response, 200, { ok: false, error: { code: 'limit-exceeded' } })
        return
      }
      responseJson(response, 200, { ok: true, value: JSON.parse(rendered) })
    } catch (cause) {
      const code = cause instanceof TockTeamDesktopGrantError ? cause.code : signal.aborted ? 'aborted' : 'owner-lost'
      responseJson(response, 200, { ok: false, error: { code } })
    }
  }

  private isMethod(value: string): value is PickerMethod {
    return value === 'pick' || value === 'beginSource' || value === 'listSource'
      || value === 'statSource' || value === 'readSource' || value === 'revalidateSource'
      || value === 'releaseSource' || value === 'beginDestination'
      || value === 'writeDestinationChunk' || value === 'finalizeDestination'
      || value === 'abortDestination' || value === 'beginVaultActivation'
      || value === 'commitVaultActivation' || value === 'abortVaultActivation'
  }

  private async call(method: PickerMethod, value: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    switch (method) {
      case 'pick': return await this.owner.pick(value as unknown as DesktopPickerRequest, signal)
      case 'beginSource': return await this.owner.beginSource(value as never, signal)
      case 'listSource': return await this.owner.listSource(value as never, signal)
      case 'statSource': return await this.owner.statSource(value as never, signal)
      case 'readSource': return await this.owner.readSource(value as never, signal)
      case 'revalidateSource': return await this.owner.revalidateSource(value as never, signal)
      case 'releaseSource': return await this.owner.releaseSource(value as never)
      case 'beginDestination': return await this.owner.beginDestination(value as never, signal)
      case 'writeDestinationChunk': return await this.owner.writeDestinationChunk(value as never, signal)
      case 'finalizeDestination': return await this.owner.finalizeDestination(value as never, signal)
      case 'abortDestination': return await this.owner.abortDestination(value as never)
      case 'beginVaultActivation': return await this.owner.beginVaultActivation(value as never, signal)
      case 'commitVaultActivation': return await this.owner.commitVaultActivation(value as never, signal)
      case 'abortVaultActivation': return await this.owner.abortVaultActivation(String(value.activationId ?? ''))
    }
  }
}
