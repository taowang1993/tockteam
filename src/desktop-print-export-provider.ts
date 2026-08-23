import type { DesktopPrintExportRequest, DesktopPrintExportResult, TockTeamDesktopPrintExport } from './host-contract.ts'
import type { DesktopPickerCurrentVault } from './desktop-picker-provider.ts'

export interface DesktopPrintExportProviderEnvironment { endpoint?: string | undefined; token?: string | undefined }
function endpointOf(environment: DesktopPrintExportProviderEnvironment): URL | undefined {
  if (environment.endpoint === undefined || environment.token === undefined) return undefined
  try { const value = new URL(environment.endpoint); return value.protocol === 'http:' && value.hostname === '127.0.0.1' ? value : undefined } catch { return undefined }
}

export class DesktopPrintExportProvider implements TockTeamDesktopPrintExport {
  private readonly endpoint: URL | undefined
  private readonly token: string | undefined
  private readonly fetcher: typeof fetch
  private readonly currentVault: DesktopPickerCurrentVault
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private disposed = false
  private disposal: Promise<void> | undefined
  constructor(
    environment: DesktopPrintExportProviderEnvironment = { endpoint: process.env.DSH_DESKTOP_PRINT_EXPORT_ENDPOINT, token: process.env.DSH_DESKTOP_PRINT_EXPORT_TOKEN },
    fetcher: typeof fetch = fetch,
    currentVault: DesktopPickerCurrentVault = () => undefined,
  ) { this.endpoint = endpointOf(environment); this.token = environment.token; this.fetcher = fetcher; this.currentVault = currentVault }

  async render(request: DesktopPrintExportRequest, signal: AbortSignal): Promise<DesktopPrintExportResult> {
    const state = this.currentVault()
    if (state?.active !== true || state.id !== request.identity.vaultId || state.generation !== request.identity.vaultGeneration) {
      return { operationId: request.identity.operationId, status: 'stale' }
    }
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    if (this.disposed || this.endpoint === undefined || this.token === undefined) return { operationId: request.identity.operationId, status: 'unavailable' }
    const work = (async () => {
      const response = await this.fetcher(this.endpoint as URL, {
        method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.any([signal, this.lifetime.signal]),
      })
      return response.ok ? await response.json() as DesktopPrintExportResult : { operationId: request.identity.operationId, status: 'unavailable' as const }
    })()
    this.pending.add(work)
    try {
      return await work
    } catch {
      return signal.aborted ? { operationId: request.identity.operationId, status: 'cancelled' } : { operationId: request.identity.operationId, status: 'unavailable' }
    } finally {
      this.pending.delete(work)
    }
  }
  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.disposal = Promise.allSettled([...this.pending]).then(() => { this.lifetime.abort() })
    return this.disposal
  }
}
