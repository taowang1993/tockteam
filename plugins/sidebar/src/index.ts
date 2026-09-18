import type { IncomingMessage, ServerResponse } from 'node:http'
import { isTrustedBrowserRequest, webRuntimeTrustedHosts } from '../../shared/request-trust.ts'
import type { WorkspaceHostMutation } from './protocol.ts'
import { WORKSPACE_API_PATH } from './protocol.ts'
import { mutateWorkspace, normalizeWorkspacePath, readWorkspaceFacts } from './git-workspace.ts'
import {
  mountSidebarPreferences,
  type SidebarDesktopCapability,
} from './preferences-server.ts'
import {
  hasBrowserSurface,
  TOCKTEAM_SURFACE_SERVICE,
  type TockTeamSurface,
} from '../../shared/surface.ts'

interface HostSession {
  header: { cwd?: string }
}

interface HostContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
  webServer: {
    register(route: {
      kind: 'exact'
      path: string
      handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
    }): () => void
  }
  logger: {
    warn(message: string): void
  }
  sessions: { get(id: string): HostSession | undefined }
}

export const name = 'tockteam-sidebar'
export const inject = ['sessions', 'webServer']

export function authorizedSessionWorkspace(
  sessions: HostContext['sessions'],
  sessionId: string | null,
  cwd: string | undefined,
): string | undefined {
  if (sessionId === null || sessionId.length === 0 || sessionId.length > 256
    || /[\u0000-\u001f\u007f]/u.test(sessionId)) return undefined
  try {
    const requested = normalizeWorkspacePath(cwd)
    const authorized = sessions.get(sessionId)?.header.cwd
    return authorized !== undefined && normalizeWorkspacePath(authorized) === requested
      ? requested
      : undefined
  } catch {
    return undefined
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 32 * 1024) throw new Error('request body is too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function isMutation(value: unknown): value is WorkspaceHostMutation {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  if (input.action === 'push') return true
  return input.action === 'create-branch' && typeof input.branch === 'string'
}

export function apply(ctx: HostContext): void {
  // Three-surface adaptation: the sidebar host is pure Node (workspace facts,
  // Git, preferences), so desktop and web both mount it. The TUI shell has no
  // webServer and no browser, so this row never activates there.
  const surface = ctx.get(TOCKTEAM_SURFACE_SERVICE) as TockTeamSurface | undefined
  const legacy = ctx.get('desktop') as SidebarDesktopCapability | undefined
  if (!hasBrowserSurface(surface?.kind) && legacy === undefined) {
    ctx.logger.warn('tockteam-sidebar: no browser surface; sidebar host disabled')
    return
  }
  const dataRoot = surface?.dataRoot ?? legacy?.appDataPath ?? ''
  const trustedHosts = webRuntimeTrustedHosts(ctx)
  if (dataRoot !== '') {
    ctx.effect(
      () => mountSidebarPreferences(ctx, { appDataPath: dataRoot }),
      'tockteam-sidebar: sidebar preferences',
    )
  }
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: WORKSPACE_API_PATH,
    handler: async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://tockteam.internal')
        const cwd = url.searchParams.get('cwd') ?? undefined
        const sessionId = url.searchParams.get('sessionId')
        if (!isTrustedBrowserRequest(request, trustedHosts)) {
          sendJson(response, 403, { error: 'untrusted workspace request' })
          return
        }
        const workspace = authorizedSessionWorkspace(ctx.sessions, sessionId, cwd)
        if (workspace === undefined) {
          sendJson(response, 403, { error: 'workspace is not authorized for this session' })
          return
        }
        if (request.method === 'GET') {
          sendJson(response, 200, await readWorkspaceFacts(workspace))
          return
        }
        if (request.method === 'POST') {
          const mutation = await readJsonBody(request)
          if (!isMutation(mutation)) throw new Error('invalid workspace mutation')
          sendJson(response, 200, await mutateWorkspace(workspace, mutation))
          return
        }
        response.writeHead(405, { allow: 'GET, POST' })
        response.end()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.logger.warn(`[sidebar] ${message}`)
        sendJson(response, 400, { error: message })
      }
    },
  }), 'tockteam-sidebar: workspace Git API')
}
