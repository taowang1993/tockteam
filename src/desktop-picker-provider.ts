import {
  TockTeamDesktopVaultSelection,
  type TockTeamDesktopVaultSelectionBindInput,
  type TockTeamDesktopVaultSelectionBindResult,
  type TockTeamDesktopVaultSelectionConsumeInput,
  type TockTeamDesktopVaultSelectionConsumeResult,
  type TockTeamDesktopVaultSelectionReleaseInput,
} from 'tockbot-note-runtime'
import {
  TockTeamDesktopGrantError,
  type AbortDesktopDestinationRequest,
  type AbortDesktopDestinationResult,
  type BeginDesktopDestinationRequest,
  type BeginDesktopDestinationResult,
  type BeginDesktopSourceRequest,
  type BeginDesktopSourceResult,
  type DesktopPickerRequest,
  type DesktopPickerResult,
  type FinalizeDesktopDestinationRequest,
  type FinalizeDesktopDestinationResult,
  type ListDesktopSourceRequest,
  type ListDesktopSourceResult,
  type LockDesktopDestinationPlanRequest,
  type LockDesktopDestinationPlanResult,
  type ReadDesktopSourceRequest,
  type ReadDesktopSourceResult,
  type ReleaseDesktopSourceRequest,
  type ReleaseDesktopSourceResult,
  type RevokeDesktopDestinationPlanRequest,
  type RevokeDesktopDestinationPlanResult,
  type RevalidateDesktopSourceRequest,
  type RevalidateDesktopSourceResult,
  type StatDesktopSourceRequest,
  type StatDesktopSourceResult,
  type TockTeamDesktopPickerService,
  type WriteDesktopDestinationChunkRequest,
  type WriteDesktopDestinationChunkResult,
} from './host-contract.ts'

export interface DesktopPickerProviderEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
}

const MAX_ERROR_TEXT = 256

function endpointOf(environment: DesktopPickerProviderEnvironment): URL | undefined {
  if (environment.endpoint === undefined || environment.token === undefined) return undefined
  try {
    const endpoint = new URL(environment.endpoint)
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1') return undefined
    return endpoint
  } catch {
    return undefined
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, MAX_ERROR_TEXT) : String(error).slice(0, MAX_ERROR_TEXT)
}

function decodeBytes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBytes)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  if (typeof record.__desktopBytes === 'string') return Uint8Array.from(Buffer.from(record.__desktopBytes, 'base64'))
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decodeBytes(item)]))
}

export class DesktopPickerProvider implements TockTeamDesktopPickerService {
  private readonly endpoint: URL | undefined
  private readonly token: string | undefined
  private readonly lifetime = new AbortController()
  private readonly fetcher: typeof fetch
  private readonly sourceSessions = new Set<ReleaseDesktopSourceRequest['session']>()
  private readonly destinationSessions = new Set<AbortDesktopDestinationRequest['session']>()
  private disposed = false

  constructor(
    environment: DesktopPickerProviderEnvironment = {
      endpoint: process.env.DSH_DESKTOP_PICKER_ENDPOINT,
      token: process.env.DSH_DESKTOP_PICKER_TOKEN,
    },
    fetcher: typeof fetch = fetch,
  ) {
    this.endpoint = endpointOf(environment)
    this.token = environment.token
    this.fetcher = fetcher
  }

  async pick(request: DesktopPickerRequest, signal: AbortSignal): Promise<DesktopPickerResult> {
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    return await this.call('pick', request, signal) as DesktopPickerResult
  }

  async beginSource(request: BeginDesktopSourceRequest, signal: AbortSignal): Promise<BeginDesktopSourceResult> {
    const result = await this.call('beginSource', request, signal) as BeginDesktopSourceResult
    this.sourceSessions.add(result.session)
    return result
  }

  async listSource(request: ListDesktopSourceRequest, signal: AbortSignal): Promise<ListDesktopSourceResult> {
    return await this.call('listSource', request, signal) as ListDesktopSourceResult
  }

  async statSource(request: StatDesktopSourceRequest, signal: AbortSignal): Promise<StatDesktopSourceResult> {
    return await this.call('statSource', request, signal) as StatDesktopSourceResult
  }

  async readSource(request: ReadDesktopSourceRequest, signal: AbortSignal): Promise<ReadDesktopSourceResult> {
    return await this.call('readSource', request, signal) as ReadDesktopSourceResult
  }

  async revalidateSource(request: RevalidateDesktopSourceRequest, signal: AbortSignal): Promise<RevalidateDesktopSourceResult> {
    return await this.call('revalidateSource', request, signal) as RevalidateDesktopSourceResult
  }

  async releaseSource(request: ReleaseDesktopSourceRequest): Promise<ReleaseDesktopSourceResult> {
    if (this.disposed) return { status: 'already-released' }
    try {
      return await this.call('releaseSource', request) as ReleaseDesktopSourceResult
    } finally {
      this.sourceSessions.delete(request.session)
    }
  }

  async lockDestinationPlan(
    request: LockDesktopDestinationPlanRequest,
    signal: AbortSignal,
  ): Promise<LockDesktopDestinationPlanResult> {
    return await this.call('lockDestinationPlan', request, signal) as LockDesktopDestinationPlanResult
  }

  async revokeDestinationPlan(
    request: RevokeDesktopDestinationPlanRequest,
  ): Promise<RevokeDesktopDestinationPlanResult> {
    if (this.disposed) return { status: 'already-closed' }
    return await this.call('revokeDestinationPlan', request) as RevokeDesktopDestinationPlanResult
  }

  async beginDestination(request: BeginDesktopDestinationRequest, signal: AbortSignal): Promise<BeginDesktopDestinationResult> {
    const result = await this.call('beginDestination', request, signal) as BeginDesktopDestinationResult
    this.destinationSessions.add(result.session)
    return result
  }

  async writeDestinationChunk(request: WriteDesktopDestinationChunkRequest, signal: AbortSignal): Promise<WriteDesktopDestinationChunkResult> {
    return await this.call('writeDestinationChunk', {
      ...request,
      bytes: Buffer.from(request.bytes).toString('base64'),
    }, signal) as WriteDesktopDestinationChunkResult
  }

  async finalizeDestination(request: FinalizeDesktopDestinationRequest, signal: AbortSignal): Promise<FinalizeDesktopDestinationResult> {
    try {
      return await this.call('finalizeDestination', request, signal) as FinalizeDesktopDestinationResult
    } finally {
      this.destinationSessions.delete(request.session)
    }
  }

  async abortDestination(request: AbortDesktopDestinationRequest): Promise<AbortDesktopDestinationResult> {
    if (this.disposed) return { cleanup: { status: 'complete' }, stagedBytes: 0, stagedEntries: 0, status: 'already-closed' }
    try {
      return await this.call('abortDestination', request) as AbortDesktopDestinationResult
    } finally {
      this.destinationSessions.delete(request.session)
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    await Promise.allSettled([
      ...[...this.sourceSessions].map(session => this.call('releaseSource', { session })),
      ...[...this.destinationSessions].map(session => this.call('abortDestination', { session })),
    ])
    this.sourceSessions.clear()
    this.destinationSessions.clear()
    this.disposed = true
    this.lifetime.abort()
  }

  async nativeRequest(method: string, request: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.disposed || this.endpoint === undefined || this.token === undefined) {
      throw new Error('TockTeam Desktop picker owner is unavailable')
    }
    const combined = signal === undefined ? this.lifetime.signal : AbortSignal.any([this.lifetime.signal, signal])
    combined.throwIfAborted()
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ method, request }),
        signal: combined,
      })
      if (!response.ok) throw new Error(`Desktop picker owner rejected request (${String(response.status)})`)
      const payload = await response.json() as unknown
      if (typeof payload !== 'object' || payload === null) throw new Error('Desktop picker owner response is invalid')
      const envelope = payload as Record<string, unknown>
      if (envelope.ok !== true) {
        const error = envelope.error
        const code = typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).code === 'string'
          ? (error as Record<string, unknown>).code
          : 'owner-lost'
        throw new TockTeamDesktopGrantError(code as never)
      }
      return decodeBytes(envelope.value)
    } catch (error) {
      if (error instanceof TockTeamDesktopGrantError) throw error
      if (isAbort(error) || signal?.aborted === true) throw new TockTeamDesktopGrantError('aborted')
      throw new Error(`TockTeam Desktop picker owner failed: ${errorText(error)}`, { cause: error })
    }
  }

  private async call(method: string, request: unknown, signal?: AbortSignal): Promise<unknown> {
    return await this.nativeRequest(method, request, signal)
  }
}

/** Runtime 0.1.2 Host-only adapter for two-phase vault selection authority. */
export class DesktopVaultSelectionProvider extends TockTeamDesktopVaultSelection {
  private readonly transport: DesktopPickerProvider

  constructor(
    ctx: unknown,
    environment?: DesktopPickerProviderEnvironment,
    fetcher?: typeof fetch,
  ) {
    super(ctx as never)
    this.transport = new DesktopPickerProvider(environment, fetcher)
  }

  async consume(
    input: TockTeamDesktopVaultSelectionConsumeInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
    return await this.transport.nativeRequest('consumeVaultSelection', input, signal) as TockTeamDesktopVaultSelectionConsumeResult
  }

  async bind(
    input: TockTeamDesktopVaultSelectionBindInput,
    signal: AbortSignal,
  ): Promise<TockTeamDesktopVaultSelectionBindResult> {
    return await this.transport.nativeRequest('bindVaultSelection', input, signal) as TockTeamDesktopVaultSelectionBindResult
  }

  async release(input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
    await this.transport.nativeRequest('releaseVaultSelection', input)
  }

  async close(): Promise<void> {
    await this.transport.dispose()
  }
}
