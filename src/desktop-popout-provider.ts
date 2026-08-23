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
  private disposed = false

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

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.lifetime.abort()
  }

  private current(identity: DesktopPopOutOpenRequest['identity']): boolean {
    const state = this.currentVault()
    return state?.active === true && state.id === identity.vaultId && state.generation === identity.vaultGeneration
  }

  private async call(method: string, request: DesktopPopOutOpenRequest | DesktopPopOutWindowRequest | DesktopPopOutCloseAllRequest, signal: AbortSignal): Promise<unknown> {
    if (!this.current(request.identity)) return { operationId: request.identity.operationId, status: 'stale' }
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    if (this.disposed || this.endpoint === undefined || this.token === undefined) return { operationId: request.identity.operationId, status: 'unavailable' }
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ method, request }),
        signal: AbortSignal.any([signal, this.lifetime.signal]),
      })
      if (!response.ok) throw new TockTeamDesktopGrantError('owner-lost')
      return await response.json()
    } catch {
      return signal.aborted
        ? { operationId: request.identity.operationId, status: 'cancelled' }
        : { operationId: request.identity.operationId, status: 'unavailable' }
    }
  }
}
