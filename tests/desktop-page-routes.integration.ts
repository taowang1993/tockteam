import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { mountDesktopPageRoutes } from '../src/desktop-page-routes.ts'

// Exercise the distribution's pinned HTTP/auth/static owners, not a fake cookie check.
const runtimeRequire = createRequire(new URL('../.stage/dsh-runtime/package.json', import.meta.url))
const { Context } = runtimeRequire('@deepseek-ai/cordis')
const { default: WebServer } = runtimeRequire('@deepseek-ai/dsh-host-webserver')
const { default: Credentials } = runtimeRequire('@deepseek-ai/dsh-credentials-local')
const Connection = runtimeRequire('@deepseek-ai/dsh-client-connection')
const FrontendStatic = runtimeRequire('@deepseek-ai/dsh-host-frontend-static')

test('Desktop page reloads retain authentication, index rendering, asset misses and lifecycle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-page-routes-'))
  const ctx = new Context()
  try {
    await ctx.plugin(Credentials, { path: join(root, 'credentials.yaml'), watch: false })
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    await ctx.plugin(Connection)
    const distIndex = join(runtimeRequire.resolve('@deepseek-ai/dsh-web-frontend/package.json'), '..', 'dist', 'index.html')
    await ctx.plugin(FrontendStatic, { distIndex })
    const routes = await ctx.plugin({ inject: ['webServer', 'connection'], apply: (scope: Parameters<typeof mountDesktopPageRoutes>[0]) => mountDesktopPageRoutes(scope, runtimeRequire) })
    ctx.webServer.tapIndex((html: string) => html.replace('<head>', '<head><meta name="reload-proof">'))
    const base = `http://127.0.0.1:${ctx.webServer.port}`
    const exchange = await fetch(ctx.connection.authenticatedUrl(base), { redirect: 'manual' })
    assert.equal(exchange.status, 303)
    const cookie = exchange.headers.get('set-cookie')!.split(';')[0]!
    const get = (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, headers: { cookie, ...init.headers }, redirect: 'manual' })
    for (const path of ['/tocktutor', '/tocktutor/Notes/Destination.md', '/tocktutor/Notes/%E6%97%A5%E8%AE%B0.md?mode=source', '/tockcoder', '/settings/appearance']) {
      assert.equal((await fetch(base + path)).status, 401, path)
      const response = await get(path)
      assert.equal(response.status, 200, path)
      assert.match(response.headers.get('content-type')!, /text\/html/)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = await response.text()
      assert.match(body, /<base href="\/">/)
      assert.match(body, /reload-proof/)
      const head = await get(path, { method: 'HEAD' })
      assert.equal(head.status, 200)
      assert.equal(await head.text(), '')
      assert.equal((await get(path, { method: 'POST' })).status, 405)
    }
    for (const path of ['/tocktutor-other', '/missing.js', '/not-a-page/deep']) assert.equal((await get(path)).status, 404)
    for (const path of ['/tocktutor/bad%00path', '/tocktutor/%ZZ', '/tocktutor/folder%2F..%2Fsecret', '/tocktutor/back%5Cslash', '/tocktutor/' + 'x'.repeat(4096)]) assert.equal((await get(path)).status, 400, path)
    assert.equal((await get('/tocktutor/Notes/Destination.md', { headers: { cookie: 'invalid=1' } })).status, 401)
    const launchQuery = new URL(ctx.connection.authenticatedUrl(base)).search
    assert.equal((await get('/tocktutor' + launchQuery)).status, 401, 'launch tokens are exchanged only at the root')
    await routes.dispose()
    assert.equal((await get('/tocktutor/Notes/Destination.md')).status, 404)
    assert.equal((await get('/')).status, 200, 'existing fallback owner is untouched')
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
