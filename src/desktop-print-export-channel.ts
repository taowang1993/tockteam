import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { DesktopPrintExportOwner } from './desktop-print-export-owner.ts'
import { MAX_PRINT_EXPORT_HTML_BYTES, type DesktopPrintExportRequest } from './host-contract.ts'

export const DESKTOP_PRINT_EXPORT_CHANNEL_PATH = '/tockteam/desktop-print-export'
const MAX_BODY_BYTES = MAX_PRINT_EXPORT_HTML_BYTES + 16 * 1024
export interface DesktopPrintExportChannelEnvironment { endpoint: string; token: string }

function authorized(value: string | undefined, expected: string): boolean {
  if (value === undefined) return false
  const actual = Buffer.from(value); const target = Buffer.from(expected)
  return actual.length === target.length && timingSafeEqual(actual, target)
}

export class DesktopPrintExportChannel {
  private readonly owner: DesktopPrintExportOwner
  private server: Server | undefined
  private environmentValue: DesktopPrintExportChannelEnvironment | undefined
  private lifetime = new AbortController()
  private generation = 0
  private readonly pending = new Set<Promise<void>>()
  constructor(owner: DesktopPrintExportOwner) { this.owner = owner }
  get environment(): DesktopPrintExportChannelEnvironment | undefined { return this.environmentValue }

  async start(): Promise<DesktopPrintExportChannelEnvironment> {
    if (this.server !== undefined) throw new Error('Desktop print/export channel is already running')
    const generation = ++this.generation
    this.owner.reopen(); this.lifetime = new AbortController()
    const token = randomBytes(32).toString('base64url')
    const server = createServer((request, response) => {
      const work = this.handle(request, response, token); this.pending.add(work); void work.finally(() => this.pending.delete(work))
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    if (generation !== this.generation) {
      await new Promise<void>(resolve => server.close(() => resolve()))
      throw new Error('Desktop print/export channel start was cancelled')
    }
    const address = server.address(); if (address === null || typeof address === 'string') throw new Error('no address')
    this.server = server
    this.environmentValue = { endpoint: `http://127.0.0.1:${String(address.port)}${DESKTOP_PRINT_EXPORT_CHANNEL_PATH}`, token }
    return this.environmentValue
  }

  async stop(): Promise<void> {
    this.generation += 1
    this.lifetime.abort(); this.owner.dispose()
    const server = this.server; this.server = undefined; this.environmentValue = undefined
    if (server !== undefined) await new Promise<void>(resolve => { server.close(() => resolve()); if (!server.listening) resolve() })
    await Promise.allSettled([...this.pending])
  }

  private async handle(request: IncomingMessage, response: ServerResponse, token: string): Promise<void> {
    if (request.method !== 'POST' || request.url !== DESKTOP_PRINT_EXPORT_CHANNEL_PATH) { response.writeHead(404).end(); return }
    if (!authorized(request.headers.authorization, `Bearer ${token}`)) { response.writeHead(401).end(); return }
    const controller = new AbortController(); const abort = (): void => { controller.abort(); request.destroy() }
    this.lifetime.signal.addEventListener('abort', abort, { once: true }); request.once('aborted', abort)
    const onResponseClose = (): void => { if (!response.writableEnded) abort() }
    response.once('close', onResponseClose)
    try {
      let size = 0; const chunks: Buffer[] = []
      for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length; if (size > MAX_BODY_BYTES) throw new Error('large'); chunks.push(value) }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as DesktopPrintExportRequest
      const value = await this.owner.render(input, AbortSignal.any([controller.signal, this.lifetime.signal]))
      const rendered = JSON.stringify(value)
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json', 'content-length': Buffer.byteLength(rendered) }); response.end(rendered)
    } catch { if (!response.headersSent && !response.destroyed) response.writeHead(400).end() }
    finally { this.lifetime.signal.removeEventListener('abort', abort); request.removeListener('aborted', abort); response.removeListener('close', onResponseClose) }
  }
}
