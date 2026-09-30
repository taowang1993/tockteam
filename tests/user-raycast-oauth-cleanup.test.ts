import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { admitTrustedRaycastArtifact } from '../src/trusted-raycast-artifact-admission.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'

type Api = typeof import('../src/trusted-raycast-compat-api.ts')
const failure = /Linear OAuth token revocation could not be confirmed/

test('first-party OAuth cleanup stays honest under mocked provider failures', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-oauth-cleanup-'))
  const oldFetch = globalThis.fetch, oldId = process.env.TOCKTEAM_USER_RAYCAST_ID
  t.after(() => {
    globalThis.fetch = oldFetch
    if (oldId === undefined) delete process.env.TOCKTEAM_USER_RAYCAST_ID
    else process.env.TOCKTEAM_USER_RAYCAST_ID = oldId
    rmSync(root, { recursive: true, force: true })
  })
  // Only the reviewed React runtime is extracted; no extension or account is executed.
  const descriptor = trustedRaycastDescriptors['google-translate']
  const bytes = admitTrustedRaycastArtifact(descriptor, resolve('plugins/trusted-raycast/vendor/google-translate.tar'))
  execFileSync('/usr/bin/tar', ['xf', '-', '-C', root, `${descriptor.artifactRoot}/runtime/node_modules/react`], { input: bytes, timeout: 5000 })
  symlinkSync(join(root, descriptor.artifactRoot, 'runtime/node_modules'), join(root, 'node_modules'))
  await buildUserRaycast(root)
  process.env.TOCKTEAM_USER_RAYCAST_ID = 'linear'
  for (const scenario of ['success', 'http', 'transport', 'sync-transport', 'timeout', 'repeated-failure', 'concurrent-failure', 'all-clients'] as const) {
    await t.test(scenario, async () => {
      globalThis.fetch = async () => { throw new Error('Network prohibited by test') }
      // Each module instance owns only this scenario's fake clients.
      const { OAuth, revokeUserRaycastOAuthTokens } = await import(`${pathToFileURL(join(root, 'api.mjs')).href}?${scenario}`) as Api
      const create = () => new OAuth.PKCEClient({ providerId: 'linear', redirectMethod: OAuth.RedirectMethod.Web })
      const client = create()
      if (scenario === 'success') {
        const requests: RequestInit[] = [], access = 'fake-access+/=', refresh = 'fake-refresh&='
        globalThis.fetch = async (input, init) => {
          assert.equal(String(input), 'https://api.linear.app/oauth/revoke')
          requests.push(init!)
          return new Response(null, { status: 200 })
        }
        await client.setTokens({ access_token: access, refresh_token: refresh })
        await client.removeTokens(); await client.removeTokens(); await revokeUserRaycastOAuthTokens()
        assert.equal(await client.getTokens(), null)
        assert.deepEqual(requests.map(init => {
          assert.equal(init.method, 'POST')
          assert.equal(new Headers(init.headers).get('content-type'), 'application/x-www-form-urlencoded')
          assert.ok(init.signal instanceof AbortSignal)
          return String(init.body)
        }).sort(), [access, refresh].map(token => String(new URLSearchParams({ token }))).sort())
        assert.equal(requests.length, 2, 'successful repeated cleanup does not send more credentials')
        await client.setTokens({ access_token: 'fake-new-token', refresh_token: 'fake-new-token' })
        await client.removeTokens()
        assert.equal(requests.length, 3, 'a new token set receives its own cleanup')
      } else if (scenario === 'http' || scenario === 'transport' || scenario === 'sync-transport') {
        const secret = 'fake-sensitive-token'
        globalThis.fetch = scenario === 'sync-transport'
          ? () => { throw new Error(`provider error includes ${secret}`) }
          : async () => {
            if (scenario === 'transport') throw new Error(`provider error includes ${secret}`)
            return new Response(secret, { status: 503 })
          }
        await client.setTokens({ access_token: secret })
        await assert.rejects(client.removeTokens(), error => {
          assert.doesNotMatch(String(error), /fake-sensitive-token/)
          return failure.test(String(error))
        })
        assert.equal(await client.getTokens(), null)
      } else if (scenario === 'timeout') {
        let aborted = false
        globalThis.fetch = async (_input, init) => {
          const signal = init?.signal
          assert.ok(signal instanceof AbortSignal)
          return new Promise<Response>((_resolve, reject) => {
            const watchdog = setTimeout(() => reject(new Error('Offline timeout watchdog')), 2500)
            const onAbort = () => { aborted = true; clearTimeout(watchdog); reject(signal.reason) }
            signal.addEventListener('abort', onAbort, { once: true })
            if (signal.aborted) onAbort()
          })
        }
        await client.setTokens({ access_token: 'fake-timeout-token' })
        await assert.rejects(client.removeTokens(), failure)
        assert.equal(aborted, true)
        assert.equal(await client.getTokens(), null)
      } else if (scenario === 'repeated-failure') {
        let requests = 0
        globalThis.fetch = async () => { requests++; return new Response(null, { status: 503 }) }
        await client.setTokens({ access_token: 'fake-failed-token' })
        await assert.rejects(client.removeTokens(), failure)
        await assert.rejects(client.removeTokens(), failure)
        await assert.rejects(revokeUserRaycastOAuthTokens(), failure)
        await assert.rejects(client.setTokens({ access_token: 'fake-replacement-token' }), failure)
        assert.equal(await client.getTokens(), null)
        assert.equal(requests, 1, 'keep the failed outcome, not credentials for an automatic retry')
      } else if (scenario === 'concurrent-failure') {
        globalThis.fetch = async () => { await new Promise(resolve => setTimeout(resolve, 10)); return new Response(null, { status: 503 }) }
        await client.setTokens({ access_token: 'fake-concurrent-token' })
        const results = await Promise.allSettled([client.removeTokens(), client.removeTokens()])
        assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected'])
        assert.equal(await client.getTokens(), null)
      } else {
        const later = create(), seen: string[] = []
        globalThis.fetch = async (_input, init) => {
          const token = new URLSearchParams(String(init?.body)).get('token')!
          seen.push(token)
          return new Response(null, { status: token === 'fake-first-token' ? 503 : 200 })
        }
        await client.setTokens({ access_token: 'fake-first-token' })
        await later.setTokens({ access_token: 'fake-later-token' })
        await assert.rejects(revokeUserRaycastOAuthTokens(), failure)
        assert.deepEqual(seen.sort(), ['fake-first-token', 'fake-later-token'])
        assert.equal(await client.getTokens(), null); assert.equal(await later.getTokens(), null)
      }
    })
  }
})
