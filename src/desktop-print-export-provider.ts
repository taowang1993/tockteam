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
  private disposed = false
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
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.any([signal, this.lifetime.signal]),
      })
      return response.ok ? await response.json() as DesktopPrintExportResult : { operationId: request.identity.operationId, status: 'unavailable' }
    } catch {
      return signal.aborted ? { operationId: request.identity.operationId, status: 'cancelled' } : { operationId: request.identity.operationId, status: 'unavailable' }
    }
  }
  dispose(): void { if (!this.disposed) { this.disposed = true; this.lifetime.abort() } }
}
