import {
  cancelledReveal,
  MAX_DESKTOP_REVEAL_RESULT_BYTES,
  validateDesktopRevealInput,
  validateDesktopRevealResult,
  type DesktopRevealInput,
  type DesktopRevealResult,
  type TockTeamDesktopRevealService,
} from './desktop-reveal.ts'

export interface DesktopRevealProviderEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
}

export interface DesktopRevealProvider extends TockTeamDesktopRevealService {
  dispose(): void
}

const MAX_ERROR_TEXT = 512

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, MAX_ERROR_TEXT) : String(error).slice(0, MAX_ERROR_TEXT)
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError'
}

function endpointOf(environment: DesktopRevealProviderEnvironment): URL | undefined {
  if (environment.endpoint === undefined || environment.token === undefined) return undefined
  try {
    const endpoint = new URL(environment.endpoint)
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1') return undefined
    return endpoint
  } catch {
    return undefined
  }
}

/** Host-side service that forwards only the locked reveal operation to Electron. */
export function createDesktopRevealProvider(
  environment: DesktopRevealProviderEnvironment = {
    endpoint: process.env.DSH_DESKTOP_REVEAL_ENDPOINT,
    token: process.env.DSH_DESKTOP_REVEAL_TOKEN,
  },
  fetcher: typeof fetch = fetch,
): DesktopRevealProvider {
  const endpoint = endpointOf(environment)
  const token = environment.token
  const lifetime = new AbortController()
  let disposed = false
  return {
    async reveal(rawInput: DesktopRevealInput, signal: AbortSignal): Promise<DesktopRevealResult> {
      const input = validateDesktopRevealInput(rawInput)
      if (input === undefined) {
        const operationId = typeof rawInput?.operationId === 'string'
          ? rawInput.operationId.slice(0, 256)
          : ''
        return { operationId, status: 'denied' }
      }
      if (signal.aborted) return cancelledReveal(input.operationId)
      if (disposed || endpoint === undefined || token === undefined) {
        throw new Error('TockTeam Desktop reveal owner is unavailable')
      }
      const combined = AbortSignal.any([signal, lifetime.signal])
      combined.throwIfAborted()
      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(input),
          signal: combined,
        })
        if (!response.ok) throw new Error(`Desktop reveal owner rejected request (${String(response.status)})`)
        const text = await response.text()
        if (new TextEncoder().encode(text).byteLength > MAX_DESKTOP_REVEAL_RESULT_BYTES) {
          throw new Error('Desktop reveal owner response is too large')
        }
        const result = validateDesktopRevealResult(JSON.parse(text))
        if (result === undefined || result.operationId !== input.operationId) {
          throw new Error('Desktop reveal owner response is invalid')
        }
        return result
      } catch (error) {
        if (isAbort(error) || signal.aborted) return cancelledReveal(input.operationId)
        throw new Error(`TockTeam Desktop reveal owner failed: ${errorText(error)}`, { cause: error })
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      lifetime.abort()
    },
  }
}
