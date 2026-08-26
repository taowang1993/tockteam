import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { desktopBearerAuthorized } from './desktop-loopback.ts'
import { DesktopPopOutOwner } from './desktop-popout-owner.ts'

export const DESKTOP_POPOUT_CHANNEL_PATH = '/tockteam/desktop-popout'
const MAX_BODY_BYTES = 16 * 1024

export interface DesktopPopOutChannelEnvironment { endpoint: string; token: string }

type PopOutMethod = 'open' | 'close' | 'closeAll' | 'disposeProvider'

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > MAX_BODY_BYTES) throw new Error('too large')
    chunks.push(value)
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid')
  return parsed as Record<string, unknown>
}

function json(response: ServerResponse, value: unknown): void {
  const rendered = JSON.stringify(value)
  response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json', 'content-length': Buffer.byteLength(rendered) })
  response.end(rendered)
}

export class DesktopPopOutChannel {
  private readonly owner: DesktopPopOutOwner
  private server: Server | undefined
  private environmentValue: DesktopPopOutChannelEnvironment | undefined
  private lifetime = new AbortController()
  private generation = 0
  private readonly pending = new Set<Promise<void>>()

  constructor(owner: DesktopPopOutOwner) { this.owner = owner }
  get environment(): DesktopPopOutChannelEnvironment | undefined { return this.environmentValue }

  async start(): Promise<DesktopPopOutChannelEnvironment> {
    if (this.server !== undefined) throw new Error('Desktop pop-out channel is already running')
    const generation = ++this.generation
    this.owner.reopen()
    this.lifetime = new AbortController()
    const token = randomBytes(32).toString('base64url')
    const server = createServer((request, response) => {
      const work = this.handle(request, response, token)
      this.pending.add(work)
      void work.finally(() => this.pending.delete(work))
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    if (generation !== this.generation) {
      await new Promise<void>(resolve => server.close(() => resolve()))
      throw new Error('Desktop pop-out channel start was cancelled')
    }
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Desktop pop-out channel has no address')
    this.server = server
    this.environmentValue = { endpoint: `http://127.0.0.1:${String(address.port)}${DESKTOP_POPOUT_CHANNEL_PATH}`, token }
    return this.environmentValue
  }

  async stop(): Promise<void> {
    this.generation += 1
    this.lifetime.abort()
    this.owner.dispose()
    const server = this.server
    this.server = undefined
    this.environmentValue = undefined
    if (server !== undefined) await new Promise<void>(resolve => { server.close(() => resolve()); if (!server.listening) resolve() })
    await Promise.allSettled([...this.pending])
  }

  private async handle(request: IncomingMessage, response: ServerResponse, token: string): Promise<void> {
    if (request.method !== 'POST' || request.url !== DESKTOP_POPOUT_CHANNEL_PATH) { response.writeHead(404).end(); return }
    if (!desktopBearerAuthorized(request.headers.authorization, `Bearer ${token}`)) { response.writeHead(401).end(); return }
    const controller = new AbortController()
    const abort = (): void => { controller.abort(); request.destroy() }
    this.lifetime.signal.addEventListener('abort', abort, { once: true })
    request.once('aborted', abort)
    const onResponseClose = (): void => { if (!response.writableEnded) abort() }
    response.once('close', onResponseClose)
    const signal = AbortSignal.any([this.lifetime.signal, controller.signal])
    try {
      const input = await body(request)
      const method = input.method
      if ((method !== 'open' && method !== 'close' && method !== 'closeAll' && method !== 'disposeProvider') || typeof input.request !== 'object' || input.request === null) throw new Error('invalid')
      const value = method === 'open'
        ? await this.owner.open(input.request as never, signal)
        : method === 'close'
          ? await this.owner.close(input.request as never, signal)
          : method === 'closeAll'
            ? await this.owner.closeAll(input.request as never, signal)
            : this.owner.disposeProvider()
      if (signal.aborted && method === 'open' && value.status === 'opened' && 'windowId' in value) {
        this.owner.rollbackOpen(value.windowId)
        return
      }
      json(response, value)
    } catch {
      if (!response.headersSent && !response.destroyed) response.writeHead(400).end()
    } finally {
      this.lifetime.signal.removeEventListener('abort', abort)
      request.removeListener('aborted', abort)
      response.removeListener('close', onResponseClose)
    }
  }
}
