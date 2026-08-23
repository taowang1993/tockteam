import type {
  DesktopPopOutCloseAllRequest,
  DesktopPopOutCloseResult,
  DesktopPopOutOpenRequest,
  DesktopPopOutOpenResult,
  DesktopPopOutWindowRequest,
  TockTeamDesktopPopOut,
} from './host-contract.ts'
import type { DesktopPickerCurrentVault } from './desktop-picker-provider.ts'
import { TockTeamDesktopGrantError } from './host-contract.ts'

export interface DesktopPopOutProviderEnvironment { endpoint?: string | undefined; token?: string | undefined }

function endpointOf(environment: DesktopPopOutProviderEnvironment): URL | undefined {
  if (environment.endpoint === undefined || environment.token === undefined) return undefined
  try {
    const value = new URL(environment.endpoint)
    return value.protocol === 'http:' && value.hostname === '127.0.0.1' ? value : undefined
  } catch { return undefined }
}

export class DesktopPopOutProvider implements TockTeamDesktopPopOut {
  private readonly endpoint: URL | undefined
  private readonly token: string | undefined
  private readonly fetcher: typeof fetch
  private readonly currentVault: DesktopPickerCurrentVault
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private disposed = false
  private disposal: Promise<void> | undefined

  constructor(
    environment: DesktopPopOutProviderEnvironment = {
      endpoint: process.env.DSH_DESKTOP_POPOUT_ENDPOINT,
      token: process.env.DSH_DESKTOP_POPOUT_TOKEN,
    },
    fetcher: typeof fetch = fetch,
    currentVault: DesktopPickerCurrentVault = () => undefined,
  ) {
    this.endpoint = endpointOf(environment)
    this.token = environment.token
    this.fetcher = fetcher
    this.currentVault = currentVault
  }

  async open(request: DesktopPopOutOpenRequest, signal: AbortSignal): Promise<DesktopPopOutOpenResult> {
    return await this.call('open', request, signal) as DesktopPopOutOpenResult
  }

  async close(request: DesktopPopOutWindowRequest, signal: AbortSignal): Promise<DesktopPopOutCloseResult> {
    return await this.call('close', request, signal) as DesktopPopOutCloseResult
  }

  async closeAll(request: DesktopPopOutCloseAllRequest, signal: AbortSignal): Promise<DesktopPopOutCloseResult> {
    return await this.call('closeAll', request, signal) as DesktopPopOutCloseResult
  }

  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.disposal = this.finishDispose()
    return this.disposal
  }

  private async finishDispose(): Promise<void> {
    await Promise.allSettled([...this.pending])
    try {
      if (this.endpoint !== undefined && this.token !== undefined) {
        const result = await this.request('disposeProvider', {}) as { status?: string }
        if (result.status !== 'closed') throw new Error('TockTeam Desktop pop-out cleanup was incomplete')
      }
    } finally {
      this.lifetime.abort()
    }
  }

  private current(identity: DesktopPopOutOpenRequest['identity']): boolean {
    const state = this.currentVault()
    return state?.active === true && state.id === identity.vaultId && state.generation === identity.vaultGeneration
  }

  private async call(method: string, request: DesktopPopOutOpenRequest | DesktopPopOutWindowRequest | DesktopPopOutCloseAllRequest, signal: AbortSignal): Promise<unknown> {
    if (!this.current(request.identity)) return { operationId: request.identity.operationId, status: 'stale' }
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    if (this.disposed || this.endpoint === undefined || this.token === undefined) return { operationId: request.identity.operationId, status: 'unavailable' }
    const work = this.request(method, request, this.lifetime.signal)
    this.pending.add(work)
    try {
      const result = await work
      if (signal.aborted) {
        if (method === 'open' && typeof result === 'object' && result !== null
          && (result as Record<string, unknown>).status === 'opened'
          && typeof (result as Record<string, unknown>).windowId === 'string') {
          await this.request('close', { identity: request.identity, windowId: (result as Record<string, unknown>).windowId })
        }
        return { operationId: request.identity.operationId, status: 'cancelled' }
      }
      return result
    } catch {
      return signal.aborted
        ? { operationId: request.identity.operationId, status: 'cancelled' }
        : { operationId: request.identity.operationId, status: 'unavailable' }
    } finally {
      this.pending.delete(work)
    }
  }

  private async request(method: string, request: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.endpoint === undefined || this.token === undefined) throw new TockTeamDesktopGrantError('owner-lost')
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ method, request }),
      signal: signal ?? null,
    })
    if (!response.ok) throw new TockTeamDesktopGrantError('owner-lost')
    return await response.json()
  }
}
