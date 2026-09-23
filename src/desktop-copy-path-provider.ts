import { TockTeamDesktopCopyPath } from 'tockbot-note-runtime'
import {
  cancelledDesktopCopyPath,
  MAX_DESKTOP_COPY_PATH_RESULT_BYTES,
  validateDesktopCopyPathInput,
  validateDesktopCopyPathResult,
  type DesktopCopyPathInput,
  type DesktopCopyPathResult,
  type TockTeamDesktopCopyPathService,
} from './desktop-copy-path.ts'
import { desktopLoopbackEndpoint } from './desktop-loopback.ts'

export interface DesktopCopyPathProviderEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
}

export interface DesktopCopyPathProviderTransport extends TockTeamDesktopCopyPathService {
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

/** Host-side transport that forwards only the locked absolute-path clipboard operation. */
export function createDesktopCopyPathProvider(
  environment: DesktopCopyPathProviderEnvironment = {
    endpoint: process.env.DSH_DESKTOP_COPY_PATH_ENDPOINT,
    token: process.env.DSH_DESKTOP_COPY_PATH_TOKEN,
  },
  fetcher: typeof fetch = fetch,
): DesktopCopyPathProviderTransport {
  const endpoint = desktopLoopbackEndpoint(environment)
  const token = environment.token
  const lifetime = new AbortController()
  let disposed = false
  return {
    async copy(rawInput: DesktopCopyPathInput, signal: AbortSignal): Promise<DesktopCopyPathResult> {
      const input = validateDesktopCopyPathInput(rawInput)
      if (input === undefined) {
        const operationId = typeof rawInput?.operationId === 'string'
          ? rawInput.operationId.slice(0, 256)
          : ''
        return { operationId, status: 'denied' }
      }
      if (signal.aborted) return cancelledDesktopCopyPath(input.operationId)
      if (disposed || endpoint === undefined || token === undefined) {
        throw new Error('TockTeam copy-path owner is unavailable')
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
        if (!response.ok) throw new Error(`Desktop copy-path owner rejected request (${String(response.status)})`)
        const text = await response.text()
        if (new TextEncoder().encode(text).byteLength > MAX_DESKTOP_COPY_PATH_RESULT_BYTES) {
          throw new Error('Desktop copy-path owner response is too large')
        }
        const result = validateDesktopCopyPathResult(JSON.parse(text))
        if (result === undefined || result.operationId !== input.operationId) {
          throw new Error('Desktop copy-path owner response is invalid')
        }
        return result
      } catch (error) {
        if (isAbort(error) || signal.aborted) return cancelledDesktopCopyPath(input.operationId)
        throw new Error(`TockTeam copy-path owner failed: ${errorText(error)}`, { cause: error })
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
export class DesktopCopyPathProvider extends TockTeamDesktopCopyPath {
  private readonly transport: DesktopCopyPathProviderTransport

  constructor(ctx: unknown, environment?: DesktopCopyPathProviderEnvironment, fetcher?: typeof fetch) {
    super(ctx as never)
    this.transport = createDesktopCopyPathProvider(environment, fetcher)
  }

  async copy(input: DesktopCopyPathInput, signal: AbortSignal): Promise<DesktopCopyPathResult> {
    return await this.transport.copy(input, signal)
  }

  close(): void {
    this.transport.dispose()
  }
}
