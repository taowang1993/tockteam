import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export interface DesktopPageContext {
  effect(effect: () => (() => void), label?: string): void
  connection: { authorizeIndex(request: IncomingMessage, response: ServerResponse): boolean }
  webServer: {
    register(route: { kind: 'prefix'; path: string; handler(request: IncomingMessage, response: ServerResponse): Promise<void> }): () => void
    renderIndex(html: string): string
  }
}

/** Add only Desktop-owned page entries; DSH keeps authentication and the asset fallback. */
export function mountDesktopPageRoutes(ctx: DesktopPageContext, require = createRequire(import.meta.url)): void {
  // Resolve from this installed Host package, never a request path or user data directory.
  const distIndex = join(dirname(require.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist', 'index.html')
  const { serveStatic } = require('@deepseek-ai/dsh-host-frontend-static') as {
    serveStatic(path: string, response: ServerResponse, root: string, index: string,
      authorize: () => boolean, render: () => Promise<string>): Promise<void>
  }
  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' })
      response.end()
      return
    }
    try {
      const raw = request.url ?? ''
      const path = decodeURIComponent(new URL(raw, 'http://tockteam.invalid').pathname)
      if (!raw.startsWith('/') || raw.startsWith('//') || raw.length > 4096
        || /[\u0000-\u001f\u007f\\]/u.test(path)
        || path.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid page path')
    } catch {
      response.writeHead(400)
      response.end()
      return
    }
    await serveStatic('/', response, dirname(distIndex), distIndex, () => {
      // Keep the original URL: launch-token exchange remains root-only.
      if (!ctx.connection.authorizeIndex(request, response)) return false
      response.setHeader('cache-control', 'no-store')
      return true
    }, async () => ctx.webServer.renderIndex(await readFile(distIndex, 'utf8'))
      .replace(/<head(?:\s[^>]*)?>/i, open => `${open}<base href="/">`))
  }
  for (const path of ['/tocktutor', '/tockcoder', '/settings']) {
    // Pinned DSH prefix matching includes the exact path and requires a slash boundary.
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path, handler }), 'desktop: page entry')
  }
}
