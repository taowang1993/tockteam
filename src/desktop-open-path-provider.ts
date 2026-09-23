import { TockTeamDesktopOpenPath } from 'tockbot-note-runtime'
import {
  cancelledDesktopOpenPath,
  MAX_DESKTOP_OPEN_PATH_RESULT_BYTES,
  validateDesktopOpenPathInput,
  validateDesktopOpenPathResult,
  type DesktopOpenPathInput,
  type DesktopOpenPathResult,
  type TockTeamDesktopOpenPathService,
} from './desktop-open-path.ts'
import { desktopLoopbackEndpoint } from './desktop-loopback.ts'

export interface DesktopOpenPathProviderEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
}

export interface DesktopOpenPathProviderTransport extends TockTeamDesktopOpenPathService {
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

/** Host-side transport that forwards only the locked default-app dispatch operation. */
export function createDesktopOpenPathProvider(
  environment: DesktopOpenPathProviderEnvironment = {
    endpoint: process.env.DSH_DESKTOP_OPEN_PATH_ENDPOINT,
    token: process.env.DSH_DESKTOP_OPEN_PATH_TOKEN,
  },
  fetcher: typeof fetch = fetch,
): DesktopOpenPathProviderTransport {
  const endpoint = desktopLoopbackEndpoint(environment)
  const token = environment.token
  const lifetime = new AbortController()
  let disposed = false
  return {
    async open(rawInput: DesktopOpenPathInput, signal: AbortSignal): Promise<DesktopOpenPathResult> {
      const input = validateDesktopOpenPathInput(rawInput)
      if (input === undefined) {
        const operationId = typeof rawInput?.operationId === 'string'
          ? rawInput.operationId.slice(0, 256)
          : ''
        return { operationId, status: 'denied' }
      }
      if (signal.aborted) return cancelledDesktopOpenPath(input.operationId)
      if (disposed || endpoint === undefined || token === undefined) {
        throw new Error('TockTeam open-path owner is unavailable')
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
        if (!response.ok) throw new Error(`Desktop open-path owner rejected request (${String(response.status)})`)
        const text = await response.text()
        if (new TextEncoder().encode(text).byteLength > MAX_DESKTOP_OPEN_PATH_RESULT_BYTES) {
          throw new Error('Desktop open-path owner response is too large')
        }
        const result = validateDesktopOpenPathResult(JSON.parse(text))
        if (result === undefined || result.operationId !== input.operationId) {
          throw new Error('Desktop open-path owner response is invalid')
        }
        return result
      } catch (error) {
        if (isAbort(error) || signal.aborted) return cancelledDesktopOpenPath(input.operationId)
        throw new Error(`TockTeam open-path owner failed: ${errorText(error)}`, { cause: error })
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      lifetime.abort()
    },
  }
}

/** Runtime service adapter; the composed profile supplies this exact base. */
export class DesktopOpenPathProvider extends TockTeamDesktopOpenPath {
  private readonly transport: DesktopOpenPathProviderTransport

  constructor(ctx: unknown, environment?: DesktopOpenPathProviderEnvironment, fetcher?: typeof fetch) {
    super(ctx as never)
    this.transport = createDesktopOpenPathProvider(environment, fetcher)
  }

  async open(input: DesktopOpenPathInput, signal: AbortSignal): Promise<DesktopOpenPathResult> {
    return await this.transport.open(input, signal)
  }

  close(): void {
    this.transport.dispose()
  }
}
