import { desktopLoopbackEndpoint } from './desktop-loopback.ts'
import type { DesktopPickerCurrentVault } from './desktop-picker-provider.ts'
import {
  TockTeamDesktopGrantError,
  type DesktopCallerClaimRequest,
  type NativeOperationIdentity,
  type TockTeamDesktopCaller,
} from './host-contract.ts'

export interface DesktopCallerProviderEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
}

function identity(value: unknown): value is NativeOperationIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => ![
    'operationId',
    'requestId',
    'sessionId',
    'vaultGeneration',
    'vaultId',
    'windowId',
  ].includes(key))) return false
  return ['operationId', 'requestId', 'sessionId', 'windowId']
    .every(key => typeof record[key] === 'string' && String(record[key]).length > 0)
    && Number.isSafeInteger(record.vaultGeneration) && Number(record.vaultGeneration) >= 0
    && (record.vaultId === null || typeof record.vaultId === 'string')
}

/** Host-only consumer of trusted-main caller authorizations. */
export class DesktopCallerProvider implements TockTeamDesktopCaller {
  private readonly endpoint: URL | undefined
  private readonly token: string | undefined
  private readonly fetcher: typeof fetch
  private readonly currentVault: DesktopPickerCurrentVault
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private disposed = false

  constructor(
    environment: DesktopCallerProviderEnvironment = {
      endpoint: process.env.DSH_DESKTOP_CALLER_ENDPOINT,
      token: process.env.DSH_DESKTOP_CALLER_TOKEN,
    },
    fetcher: typeof fetch = fetch,
    currentVault: DesktopPickerCurrentVault = () => undefined,
  ) {
    this.endpoint = desktopLoopbackEndpoint(environment)
    this.token = environment.token
    this.fetcher = fetcher
    this.currentVault = currentVault
  }

  async claim(request: DesktopCallerClaimRequest, signal: AbortSignal): Promise<NativeOperationIdentity> {
    if (signal.aborted) throw new TockTeamDesktopGrantError('owner-lost')
    if (this.disposed || this.endpoint === undefined || this.token === undefined) {
      throw new TockTeamDesktopGrantError('owner-lost')
    }
    const endpoint = this.endpoint
    const token = this.token
    const before = this.currentVault()
    if (endpoint === undefined || token === undefined || before === undefined
      || (request.operation !== 'activate-vault' && !before.active)) {
      throw new TockTeamDesktopGrantError('stale')
    }
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const work = (async (): Promise<NativeOperationIdentity> => {
      const response = await this.fetcher(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: combined,
      })
      if (combined.aborted) throw new TockTeamDesktopGrantError('owner-lost')
      if (response.status === 409) throw new TockTeamDesktopGrantError('stale')
      if (!response.ok) throw new TockTeamDesktopGrantError('owner-lost')
      const result: unknown = await response.json()
      if (!identity(result)) throw new TockTeamDesktopGrantError('owner-lost')
      const after = this.currentVault()
      const stable = after !== undefined
        && before.generation === after.generation
        && (before.active && after.active
          ? before.id === after.id
          : !before.active && !after.active)
      const bound = result.vaultGeneration === before.generation
        && (before.active ? result.vaultId === before.id : result.vaultId === null)
      if (!stable || !bound) throw new TockTeamDesktopGrantError('stale')
      return result
    })()
    this.pending.add(work)
    try {
      return await work
    } catch (error) {
      if (error instanceof TockTeamDesktopGrantError) throw error
      throw new TockTeamDesktopGrantError('owner-lost')
    } finally {
      this.pending.delete(work)
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.lifetime.abort()
    await Promise.allSettled([...this.pending])
  }
}
