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
  type DesktopDestinationPlanAuthorization,
  type DesktopPickerIdentity,
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

export type DesktopPickerCurrentVault = () =>
  | { active: false; generation: number }
  | { active: true; generation: number; id: string }
  | undefined

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
  private readonly sourceSessions = new Map<ReleaseDesktopSourceRequest['session'], DesktopPickerIdentity>()
  private readonly destinationSessions = new Map<AbortDesktopDestinationRequest['session'], DesktopPickerIdentity>()
  private readonly destinationPlans = new Map<DesktopDestinationPlanAuthorization, DesktopPickerIdentity>()
  private readonly closedDestinations = new Map<AbortDesktopDestinationRequest['session'], AbortDesktopDestinationResult>()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly currentVault: DesktopPickerCurrentVault | undefined
  private disposed = false
  private disposal: Promise<void> | undefined

  constructor(
    environment: DesktopPickerProviderEnvironment = {
      endpoint: process.env.DSH_DESKTOP_PICKER_ENDPOINT,
      token: process.env.DSH_DESKTOP_PICKER_TOKEN,
    },
    fetcher: typeof fetch = fetch,
    currentVault?: DesktopPickerCurrentVault,
  ) {
    this.endpoint = endpointOf(environment)
    this.token = environment.token
    this.fetcher = fetcher
    this.currentVault = currentVault
  }

  async pick(request: DesktopPickerRequest, signal: AbortSignal): Promise<DesktopPickerResult> {
    if (signal.aborted) return { operationId: request.identity.operationId, status: 'cancelled' }
    if (request.kind !== 'vault') this.assertCurrentVault(request.identity)
    return await this.call('pick', request, signal) as DesktopPickerResult
  }

  async beginSource(request: BeginDesktopSourceRequest, signal: AbortSignal): Promise<BeginDesktopSourceResult> {
    this.assertCurrentVault(request.identity)
    return await this.call('beginSource', request, signal, result => {
      this.sourceSessions.set((result as BeginDesktopSourceResult).session, request.identity)
    }) as BeginDesktopSourceResult
  }

  async listSource(request: ListDesktopSourceRequest, signal: AbortSignal): Promise<ListDesktopSourceResult> {
    await this.assertSourceSession(request.session)
    return await this.call('listSource', request, signal) as ListDesktopSourceResult
  }

  async statSource(request: StatDesktopSourceRequest, signal: AbortSignal): Promise<StatDesktopSourceResult> {
    await this.assertSourceSession(request.session)
    return await this.call('statSource', request, signal) as StatDesktopSourceResult
  }

  async readSource(request: ReadDesktopSourceRequest, signal: AbortSignal): Promise<ReadDesktopSourceResult> {
    await this.assertSourceSession(request.session)
    return await this.call('readSource', request, signal) as ReadDesktopSourceResult
  }

  async revalidateSource(request: RevalidateDesktopSourceRequest, signal: AbortSignal): Promise<RevalidateDesktopSourceResult> {
    await this.assertSourceSession(request.session)
    return await this.call('revalidateSource', request, signal) as RevalidateDesktopSourceResult
  }

  async releaseSource(request: ReleaseDesktopSourceRequest): Promise<ReleaseDesktopSourceResult> {
    if (this.disposed) throw new TockTeamDesktopGrantError('owner-lost')
    return await this.call('releaseSource', request, undefined, () => {
      this.sourceSessions.delete(request.session)
    }) as ReleaseDesktopSourceResult
  }

  async lockDestinationPlan(
    request: LockDesktopDestinationPlanRequest,
    signal: AbortSignal,
  ): Promise<LockDesktopDestinationPlanResult> {
    this.assertCurrentVault(request.identity)
    return await this.call('lockDestinationPlan', request, signal, result => {
      this.destinationPlans.set((result as LockDesktopDestinationPlanResult).authorization, request.identity)
    }) as LockDesktopDestinationPlanResult
  }

  async revokeDestinationPlan(
    request: RevokeDesktopDestinationPlanRequest,
  ): Promise<RevokeDesktopDestinationPlanResult> {
    if (this.disposed) throw new TockTeamDesktopGrantError('owner-lost')
    return await this.call('revokeDestinationPlan', request, undefined, () => {
      this.destinationPlans.delete(request.authorization)
    }) as RevokeDesktopDestinationPlanResult
  }

  async beginDestination(request: BeginDesktopDestinationRequest, signal: AbortSignal): Promise<BeginDesktopDestinationResult> {
    this.assertCurrentVault(request.identity)
    const planIdentity = this.destinationPlans.get(request.authorization)
    if (planIdentity === undefined || planIdentity.vaultId !== request.identity.vaultId
      || planIdentity.vaultGeneration !== request.identity.vaultGeneration) throw new TockTeamDesktopGrantError('stale')
    return await this.call('beginDestination', request, signal, result => {
      this.destinationPlans.delete(request.authorization)
      this.destinationSessions.set((result as BeginDesktopDestinationResult).session, request.identity)
    }) as BeginDesktopDestinationResult
  }

  async writeDestinationChunk(request: WriteDesktopDestinationChunkRequest, signal: AbortSignal): Promise<WriteDesktopDestinationChunkResult> {
    await this.assertDestinationSession(request.session)
    return await this.call('writeDestinationChunk', {
      ...request,
      bytes: Buffer.from(request.bytes).toString('base64'),
    }, signal) as WriteDesktopDestinationChunkResult
  }

  async finalizeDestination(request: FinalizeDesktopDestinationRequest, signal: AbortSignal): Promise<FinalizeDesktopDestinationResult> {
    await this.assertDestinationSession(request.session)
    return await this.call('finalizeDestination', request, signal, () => {
      this.destinationSessions.delete(request.session)
    }) as FinalizeDesktopDestinationResult
  }

  async abortDestination(request: AbortDesktopDestinationRequest): Promise<AbortDesktopDestinationResult> {
    if (this.disposed) {
      const closed = this.closedDestinations.get(request.session)
      if (closed === undefined) throw new TockTeamDesktopGrantError('owner-lost')
      return { ...closed, status: 'already-closed' }
    }
    return await this.call('abortDestination', request, undefined, result => {
      this.destinationSessions.delete(request.session)
      this.rememberDestination(request.session, result as AbortDesktopDestinationResult)
    }) as AbortDesktopDestinationResult
  }

  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.lifetime.abort()
    this.disposal = this.finishDispose()
    return this.disposal
  }

  private async finishDispose(): Promise<void> {
    await Promise.allSettled([...this.pending])
    let cleanupFailed = false
    let remaining = Number.POSITIVE_INFINITY
    while (this.sourceSessions.size + this.destinationSessions.size + this.destinationPlans.size < remaining) {
      remaining = this.sourceSessions.size + this.destinationSessions.size + this.destinationPlans.size
      await Promise.all([
        ...[...this.sourceSessions.keys()].map(async session => {
          try {
            await this.request('releaseSource', { session })
            this.sourceSessions.delete(session)
          } catch { cleanupFailed = true }
        }),
        ...[...this.destinationSessions.keys()].map(async session => {
          try {
            const result = await this.request('abortDestination', { session }) as AbortDesktopDestinationResult
            this.destinationSessions.delete(session)
            this.rememberDestination(session, result)
            if (result.cleanup.status !== 'complete') cleanupFailed = true
          } catch { cleanupFailed = true }
        }),
        ...[...this.destinationPlans.keys()].map(async authorization => {
          try {
            await this.request('revokeDestinationPlan', { authorization })
            this.destinationPlans.delete(authorization)
          } catch { cleanupFailed = true }
        }),
      ])
    }
    if (this.sourceSessions.size !== 0 || this.destinationSessions.size !== 0 || this.destinationPlans.size !== 0 || cleanupFailed) {
      throw new Error('TockTeam Desktop picker cleanup was incomplete')
    }
  }

  private assertCurrentVault(identity: DesktopPickerIdentity): void {
    const state = this.currentVault?.()
    if (state === undefined) throw new TockTeamDesktopGrantError('owner-lost')
    if (!state.active || state.id !== identity.vaultId || state.generation !== identity.vaultGeneration) {
      throw new TockTeamDesktopGrantError('stale')
    }
  }

  private async assertSourceSession(session: ReleaseDesktopSourceRequest['session']): Promise<void> {
    const identity = this.sourceSessions.get(session)
    if (identity === undefined) throw new TockTeamDesktopGrantError('closed')
    try {
      this.assertCurrentVault(identity)
    } catch (cause) {
      try {
        await this.call('releaseSource', { session }, undefined, () => {
          this.sourceSessions.delete(session)
        })
      } catch {}
      throw cause
    }
  }

  private async assertDestinationSession(session: AbortDesktopDestinationRequest['session']): Promise<void> {
    const identity = this.destinationSessions.get(session)
    if (identity === undefined) throw new TockTeamDesktopGrantError('closed')
    try {
      this.assertCurrentVault(identity)
    } catch (cause) {
      try {
        await this.call('abortDestination', { session }, undefined, result => {
          this.destinationSessions.delete(session)
          this.rememberDestination(session, result as AbortDesktopDestinationResult)
        })
      } catch {}
      throw cause
    }
  }

  private rememberDestination(session: AbortDesktopDestinationRequest['session'], result: AbortDesktopDestinationResult): void {
    this.closedDestinations.set(session, result)
    if (this.closedDestinations.size > 1024) {
      const oldest = this.closedDestinations.keys().next().value
      if (oldest !== undefined) this.closedDestinations.delete(oldest)
    }
  }

  async nativeRequest(method: string, request: unknown, signal?: AbortSignal): Promise<unknown> {
    return await this.call(method, request, signal)
  }

  private async request(method: string, request: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.endpoint === undefined || this.token === undefined) throw new Error('TockTeam Desktop picker owner is unavailable')
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ method, request }),
        signal: signal ?? null,
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

  private async call(
    method: string,
    request: unknown,
    signal?: AbortSignal,
    accept?: (result: unknown) => void,
  ): Promise<unknown> {
    if (this.disposed) throw new Error('TockTeam Desktop picker owner is unavailable')
    const combined = signal === undefined ? this.lifetime.signal : AbortSignal.any([this.lifetime.signal, signal])
    combined.throwIfAborted()
    const work = this.request(method, request, combined).then(result => {
      accept?.(result)
      return result
    })
    this.pending.add(work)
    try {
      return await work
    } finally {
      this.pending.delete(work)
    }
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
