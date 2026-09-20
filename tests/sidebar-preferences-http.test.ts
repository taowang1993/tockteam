import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { mountSidebarPreferences } from '../plugins/sidebar/src/preferences-server.ts'
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  SIDEBAR_PREFERENCES_API_PATH,
} from '../plugins/sidebar/src/sidebar-preferences.ts'

test('sidebar preferences protect reads and writes with the same browser trust boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-sidebar-http-'))
  const server = createServer()
  const unmount = mountSidebarPreferences({
    get: name => name === 'webRuntime' ? { trustedHosts: ['team.example:3080'] } : undefined,
    logger: { warn: () => {} },
    webServer: {
      register: route => {
        server.on('request', route.handler)
        return () => { server.off('request', route.handler) }
      },
    },
  }, { appDataPath: directory })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address !== null && typeof address === 'object')
    const send = async (method: string, headers: Record<string, string>, body?: unknown) => {
      return await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const outgoing = request({
          hostname: '127.0.0.1', port: address.port,
          path: SIDEBAR_PREFERENCES_API_PATH, method,
          headers: { 'content-type': 'application/json', ...headers },
          agent: false,
        }, response => {
          const chunks: Buffer[] = []
          response.on('data', chunk => { chunks.push(Buffer.from(chunk)) })
          response.on('error', reject)
          response.on('end', () => {
            try {
              resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) })
            } catch (error) { reject(error) }
          })
        })
        outgoing.on('error', reject)
        outgoing.setTimeout(5_000, () => { outgoing.destroy(new Error('request timed out')) })
        outgoing.end(body === undefined ? undefined : JSON.stringify(body))
      })
    }
    const trusted = { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }
    const saved = {
      ...DEFAULT_SIDEBAR_PREFERENCES,
      sessions: {
        session: {
          activeId: 'private-file', lastUsed: 1,
          tabs: [{ id: 'private-file', type: 'file', title: 'private', resource: '/private/project/design.txt' }],
        },
      },
    }
    assert.equal((await send('PUT', trusted, saved)).status, 200)
    for (const headers of [
      { host: 'attacker.example:3080', origin: 'http://attacker.example:3080' },
      { host: trusted.host, origin: 'http://attacker.example:3080' },
      { ...trusted, 'sec-fetch-site': 'cross-site' },
      { host: trusted.host, origin: 'null' },
    ]) {
      for (const method of ['GET', 'PUT']) {
        const response = await send(method, headers, method === 'PUT' ? DEFAULT_SIDEBAR_PREFERENCES : undefined)
        assert.equal(response.status, 403, `${method} ${JSON.stringify(headers)}`)
        assert.deepEqual(response.body, { error: 'untrusted sidebar origin' })
      }
    }
    for (const headers of [trusted, { host: trusted.host }, {
      host: 'team.example:3080', origin: 'https://team.example:3080',
    }]) {
      const response = await send('GET', headers)
      assert.equal(response.status, 200)
      assert.deepEqual(response.body, saved)
    }
  } finally {
    unmount()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close(error => { if (error) reject(error); else resolve() })
    })
    assert.equal(server.listening, false)
    await rm(directory, { recursive: true, force: true })
  }
})
