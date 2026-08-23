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
  private disposed = false

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
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.any([signal, this.lifetime.signal]),
      })
      if (!response.ok) return { operationId: request.identity.operationId, status: 'unavailable' }
      return await response.json() as DesktopMicrophoneResult
    } catch {
      return signal.aborted
        ? { operationId: request.identity.operationId, status: 'cancelled' }
        : { operationId: request.identity.operationId, status: 'unavailable' }
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.lifetime.abort()
  }
}
