import {
  TockTeamDesktopGrantError,
  type DesktopDispatchCompletionRequest,
  type DesktopDispatchCompletionResult,
  type DesktopDispatchEvent,
  type TockTeamDesktopDispatch,
} from './host-contract.ts'
import type { DesktopPickerCurrentVault } from './desktop-picker-provider.ts'

export interface DesktopDispatchProviderEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
}

function endpointOf(environment: DesktopDispatchProviderEnvironment): URL | undefined {
  if (environment.endpoint === undefined || environment.token === undefined) return undefined
  try {
    const endpoint = new URL(environment.endpoint)
    return endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' ? endpoint : undefined
  } catch { return undefined }
}

function validEvent(value: unknown): value is DesktopDispatchEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Record<string, unknown>
  if (typeof event.identity !== 'object' || event.identity === null) return false
  const identity = event.identity as Record<string, unknown>
  if ([identity.operationId, identity.requestId, identity.sessionId, identity.windowId]
    .some(item => typeof item !== 'string' || item.length === 0)) return false
  const generation = identity.vaultGeneration
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) return false
  if (identity.vaultId !== null && typeof identity.vaultId !== 'string') return false
  if (event.kind === 'quick-action') return ['new', 'daily', 'capture', 'search'].includes(String(event.action))
  return event.kind === 'protocol' && typeof event.request === 'object' && event.request !== null
}

/** Host-side polling adapter for the Desktop dispatch queue. */
export class DesktopDispatchProvider implements TockTeamDesktopDispatch {
  private readonly endpoint: URL | undefined
  private readonly token: string | undefined
  private readonly fetcher: typeof fetch
  private readonly currentVault: DesktopPickerCurrentVault
  private readonly lifetime = new AbortController()
  private readonly listeners = new Set<(event: DesktopDispatchEvent) => void>()
  private polling: Promise<void> | undefined
  private disposed = false

  constructor(
    environment: DesktopDispatchProviderEnvironment = {
      endpoint: process.env.DSH_DESKTOP_DISPATCH_ENDPOINT,
      token: process.env.DSH_DESKTOP_DISPATCH_TOKEN,
    },
    fetcher: typeof fetch = fetch,
    currentVault: DesktopPickerCurrentVault = () => undefined,
  ) {
    this.endpoint = endpointOf(environment)
    this.token = environment.token
    this.fetcher = fetcher
    this.currentVault = currentVault
  }

  subscribe(listener: (event: DesktopDispatchEvent) => void): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    this.polling ??= this.poll()
    return () => { this.listeners.delete(listener) }
  }

  async complete(
    request: DesktopDispatchCompletionRequest,
    signal: AbortSignal,
  ): Promise<DesktopDispatchCompletionResult> {
    const value = await this.call({ method: 'complete', request }, signal)
    if (typeof value !== 'object' || value === null || typeof (value as Record<string, unknown>).result !== 'object') {
      throw new TockTeamDesktopGrantError('owner-lost')
    }
    return (value as { result: DesktopDispatchCompletionResult }).result
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.lifetime.abort()
    await Promise.allSettled(this.polling === undefined ? [] : [this.polling])
  }

  private current(event: DesktopDispatchEvent): boolean {
    const state = this.currentVault()
    if (state === undefined) return false
    return state.active
      ? event.identity.vaultId === state.id && event.identity.vaultGeneration === state.generation
      : event.identity.vaultId === null && event.identity.vaultGeneration === state.generation
  }

  private async poll(): Promise<void> {
    try {
      while (!this.disposed && this.listeners.size > 0) {
        let response: unknown
        try { response = await this.call({ method: 'next' }, this.lifetime.signal) } catch {
          if (!this.disposed) await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }
        const event = typeof response === 'object' && response !== null
          ? (response as Record<string, unknown>).event
          : undefined
        if (event === null || !validEvent(event)) continue
        if (!this.current(event)) {
          await this.complete({ operationId: event.identity.operationId, status: 'stale' }, this.lifetime.signal).catch(() => undefined)
          continue
        }
        for (const listener of [...this.listeners]) {
          try { listener(event) } catch { /* one listener cannot block the others */ }
        }
      }
    } finally {
      this.polling = undefined
      if (!this.disposed && this.listeners.size > 0) this.polling = this.poll()
    }
  }

  private async call(input: unknown, signal: AbortSignal): Promise<unknown> {
    if (this.disposed || this.endpoint === undefined || this.token === undefined) {
      throw new TockTeamDesktopGrantError('owner-lost')
    }
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: combined,
    })
    if (!response.ok) throw new TockTeamDesktopGrantError('owner-lost')
    return await response.json()
  }
}
