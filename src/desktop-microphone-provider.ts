import type {
  DesktopMicrophoneRequest,
  DesktopMicrophoneResult,
  TockTeamDesktopMicrophone,
} from './host-contract.ts'
import { TockTeamDesktopGrantError } from './host-contract.ts'
import type { DesktopPickerCurrentVault } from './desktop-picker-provider.ts'

export interface DesktopMicrophoneProviderEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
}

function endpointOf(environment: DesktopMicrophoneProviderEnvironment): URL | undefined {
  if (environment.endpoint === undefined || environment.token === undefined) return undefined
  try {
    const endpoint = new URL(environment.endpoint)
    return endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' ? endpoint : undefined
  } catch { return undefined }
}

export class DesktopMicrophoneProvider implements TockTeamDesktopMicrophone {
  private readonly endpoint: URL | undefined
  private readonly token: string | undefined
  private readonly currentVault: DesktopPickerCurrentVault
  private readonly fetcher: typeof fetch
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private disposed = false
  private disposal: Promise<void> | undefined
  private admitted = false

  constructor(
    environment: DesktopMicrophoneProviderEnvironment = {
      endpoint: process.env.DSH_DESKTOP_MICROPHONE_ENDPOINT,
      token: process.env.DSH_DESKTOP_MICROPHONE_TOKEN,
    },
    fetcher: typeof fetch = fetch,
    currentVault: DesktopPickerCurrentVault = () => undefined,
  ) {
    this.endpoint = endpointOf(environment)
    this.token = environment.token
    this.fetcher = fetcher
    this.currentVault = currentVault
  }

  async request(request: DesktopMicrophoneRequest, signal: AbortSignal): Promise<DesktopMicrophoneResult> {
    const state = this.currentVault()
    if (state === undefined) throw new TockTeamDesktopGrantError('owner-lost')
    if (!state.active || state.id !== request.identity.vaultId
      || state.generation !== request.identity.vaultGeneration) {
      return { operationId: request.identity.operationId, status: 'stale' }
    }
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    if (this.disposed || this.endpoint === undefined || this.token === undefined) {
      return { operationId: request.identity.operationId, status: 'unavailable' }
    }
    this.admitted = true
    const work = this.nativeRequest(request, AbortSignal.any([signal, this.lifetime.signal]))
    this.pending.add(work)
    try {
      const result = await work as DesktopMicrophoneResult
      if (signal.aborted) {
        if (result.status === 'granted') await this.nativeRequest({ disposeProvider: true })
        return { operationId: request.identity.operationId, status: 'cancelled' }
      }
      return result
    } catch {
      if (signal.aborted) {
        await this.nativeRequest({ disposeProvider: true }).catch(() => undefined)
        return { operationId: request.identity.operationId, status: 'cancelled' }
      }
      return { operationId: request.identity.operationId, status: 'unavailable' }
    } finally {
      this.pending.delete(work)
    }
  }

  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.disposal = this.finishDispose()
    return this.disposal
  }

  private async finishDispose(): Promise<void> {
    this.lifetime.abort()
    await Promise.allSettled([...this.pending])
    if (this.admitted && this.endpoint !== undefined && this.token !== undefined) {
      const result = await this.nativeRequest({ disposeProvider: true }) as { status?: string }
      if (result.status !== 'closed') throw new Error('TockTeam Desktop microphone cleanup was incomplete')
    }
  }

  private async nativeRequest(request: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.endpoint === undefined || this.token === undefined) throw new TockTeamDesktopGrantError('owner-lost')
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: signal ?? null,
    })
    if (!response.ok) throw new TockTeamDesktopGrantError('owner-lost')
    return await response.json()
  }
}
