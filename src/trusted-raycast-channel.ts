import { randomBytes } from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { desktopBearerAuthorized } from './desktop-loopback.ts'

export const TRUSTED_RAYCAST_ACTIVATION_PATH = '/trusted-raycast/activate'
export type TrustedRaycastEnvironment = { endpoint: string; token: string }

/** A live authenticated Host connection, never an arbitrary RPC endpoint. */
export class DesktopTrustedRaycastChannel {
  private server: Server | undefined
  private response: ServerResponse | undefined
  private pending = Promise.resolve()
  private readonly changed: (active: boolean) => Promise<void>
  environment: TrustedRaycastEnvironment | undefined
  constructor(changed: (active: boolean) => Promise<void>) { this.changed = changed }
  get active(): boolean { return this.response !== undefined }
  async start(): Promise<TrustedRaycastEnvironment> {
    if (this.server) throw new Error('Translate activation already started')
    const token = randomBytes(32).toString('base64url')
    const server = createServer((request, response) => {
      const reject = (status: number): void => { response.writeHead(status, { connection: 'close' }).end(); request.resume() }
      if (request.url !== TRUSTED_RAYCAST_ACTIVATION_PATH || request.method !== 'POST') return reject(404)
      if (!desktopBearerAuthorized(request.headers.authorization, `Bearer ${token}`)) return reject(401)
      let body = ''; let size = 0
      request.setTimeout(5000, () => request.destroy())
      request.on('error', () => response.destroy())
      request.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 2) { reject(413); request.destroy() } else body += chunk.toString()
      })
      request.on('end', () => {
        request.setTimeout(0)
        if (response.headersSent) return
        if (body !== '{}') return reject(400)
        if (this.response || this.server !== server) return reject(409)
        this.response = response
        response.once('close', () => {
          if (this.response !== response) return
          this.response = undefined
          this.pending = this.pending.catch(() => {}).then(() => this.changed(false))
          void this.pending.catch(() => {})
        })
        this.pending = this.pending.catch(() => {}).then(() => this.changed(true))
        void this.pending.then(() => {
          if (this.response !== response) return
          response.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' })
          response.write('{"active":true}\n')
        }).catch(() => response.destroy())
      })
    })
    this.server = server
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Translate activation has no address')
      this.environment = { endpoint: `http://127.0.0.1:${address.port}${TRUSTED_RAYCAST_ACTIVATION_PATH}`, token }
      return this.environment
    } catch (error) { await this.stop(); throw error }
  }
  async stop(): Promise<void> {
    const server = this.server
    this.server = undefined
    this.environment = undefined
    const response = this.response
    this.response = undefined
    response?.destroy()
    if (response) this.pending = this.pending.catch(() => {}).then(() => this.changed(false))
    if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
    await this.pending
  }
}
