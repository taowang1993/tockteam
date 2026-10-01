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
import { isUserRaycastOAuthCleanupCounts, isUserRaycastOAuthCleanupDiagnostic, isUserRaycastOAuthCleanupReasons, isUserRaycastViewMessage } from '../src/user-raycast-contract.ts'

test('cleanup details admit only bounded coarse codes and counts, never a renderer message', () => {
  const reasons = ['http-400', 'http-503', 'http-202', 'transport', 'timeout', 'unknown']
  const diagnostic = { type: 'oauth-cleanup', extensionId: 'linear', sessionId: 'fixture-session', reasons }
  assert.equal(isUserRaycastOAuthCleanupDiagnostic(diagnostic), true)
  const counted = { ...diagnostic, reasons: ['http-401'], counts: { attempted: 2, confirmed: 1, failed: 1 } }
  assert.equal(isUserRaycastOAuthCleanupDiagnostic(counted), true)
  assert.equal(isUserRaycastViewMessage({ ...counted, revision: 0 }), false)
  for (const counts of [{ attempted: 0, confirmed: 0, failed: 0 }, counted.counts, { attempted: 512, confirmed: 511, failed: 1 }]) assert.equal(isUserRaycastOAuthCleanupCounts(counts), true)
  for (const counts of [undefined, null, [], { attempted: 1, failed: 1 }, { ...counted.counts, token: 'fake-sensitive-token' },
    { attempted: '2', confirmed: 1, failed: 1 }, { attempted: 1, confirmed: -1, failed: 2 }, { attempted: 1.5, confirmed: 0.5, failed: 1 },
    { attempted: NaN, confirmed: 0, failed: NaN }, { attempted: Infinity, confirmed: Infinity, failed: 0 },
    { attempted: 513, confirmed: 512, failed: 1 }, { attempted: 2, confirmed: 2, failed: 1 }]) {
    assert.equal(isUserRaycastOAuthCleanupCounts(counts), false)
    assert.equal(isUserRaycastOAuthCleanupDiagnostic({ ...counted, counts }), false)
  }
  assert.equal(isUserRaycastOAuthCleanupDiagnostic({ ...counted, counts: { attempted: 1, confirmed: 1, failed: 0 } }), false)
  assert.equal(isUserRaycastOAuthCleanupDiagnostic({ ...counted, reasons: ['http-401', 'transport'] }), false)
  for (const invalid of [[], Array(1), ['http-200'], ['http-0'], ['http-600'], ['http-503\n'], ['fake-sensitive-token'], [{ token: 'fake-sensitive-token' }], Array(513).fill('timeout')]) {
    assert.equal(isUserRaycastOAuthCleanupReasons(invalid), false, 'unsafe or empty details must not be admitted')
  }
  for (const invalid of [{ ...counted, token: 'fake-sensitive-token' }, { ...counted, extensionId: 'other' }, { ...counted, sessionId: 'x'.repeat(129) }]) {
    assert.equal(isUserRaycastOAuthCleanupDiagnostic(invalid), false)
  }
})

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
  for (const scenario of ['success', 'http', 'unauthorized', 'unconfirmed-success', 'unknown-status', 'transport', 'sync-transport', 'timeout', 'mixed-revocation', 'mixed-unauthorized', 'all-unauthorized', 'repeated-failure', 'concurrent-failure', 'all-clients', 'invalid-shared-cause', 'lifetime-counts', 'bounded-counts'] as const) {
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
      } else if (scenario === 'http' || scenario === 'unauthorized' || scenario === 'unconfirmed-success' || scenario === 'unknown-status' || scenario === 'transport' || scenario === 'sync-transport') {
        const secret = 'fake-sensitive-token'
        let bodyReads = 0
        globalThis.fetch = scenario === 'sync-transport'
          ? () => { throw new Error(`provider error includes ${secret}`) }
          : async () => {
            if (scenario === 'transport') throw new Error(`provider error includes ${secret}`)
            if (scenario === 'unknown-status') return { status: secret } as unknown as Response
            const response = new Response(secret, { status: scenario === 'unauthorized' ? 401 : scenario === 'unconfirmed-success' ? 202 : 503 })
            response.text = response.json = async () => { bodyReads++; throw new Error('Provider body must not be read') }
            return response
          }
        await client.setTokens({ access_token: secret })
        const reasons = [scenario === 'http' ? 'http-503' : scenario === 'unauthorized' ? 'http-401' : scenario === 'unconfirmed-success' ? 'http-202' : scenario === 'unknown-status' ? 'unknown' : 'transport']
        const check = (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.doesNotMatch(JSON.stringify({ message: error.message, cause: error.cause }), /fake-sensitive-token/)
          assert.deepEqual(error.cause, reasons, 'safe failure details survive direct and shared cleanup')
          assert.ok('cleanupCounts' in error)
          assert.deepEqual(error.cleanupCounts, { attempted: 1, confirmed: 0, failed: 1 })
          assert.doesNotMatch(JSON.stringify(error), /fake-sensitive-token/)
          return failure.test(error.message)
        }
        await assert.rejects(client.removeTokens(), check)
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        assert.equal(bodyReads, 0)
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
        const check = { cause: ['timeout'], cleanupCounts: { attempted: 1, confirmed: 0, failed: 1 } }
        await assert.rejects(client.removeTokens(), check)
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        assert.equal(aborted, true)
        assert.equal(await client.getTokens(), null)
      } else if (scenario === 'mixed-revocation' || scenario === 'mixed-unauthorized' || scenario === 'all-unauthorized') {
        const tokens = ['fake-unconfirmed-refresh', 'fake-revoked-access'] as const, seen: string[] = []
        const status = scenario === 'mixed-revocation' ? 400 : 401
        globalThis.fetch = async (_input, init) => {
          const token = new URLSearchParams(String(init?.body)).get('token')!
          seen.push(token)
          return new Response(null, { status: scenario === 'all-unauthorized' || token === tokens[0] ? status : 200 })
        }
        await client.setTokens({ access_token: tokens[1], refresh_token: tokens[0] })
        const cleanupCounts = { attempted: 2, confirmed: scenario === 'all-unauthorized' ? 0 : 1, failed: scenario === 'all-unauthorized' ? 2 : 1 }
        await assert.rejects(client.removeTokens(), { cause: [`http-${status}`], cleanupCounts })
        await assert.rejects(revokeUserRaycastOAuthTokens(), { cause: [`http-${status}`], cleanupCounts })
        assert.equal(await client.getTokens(), null)
        assert.deepEqual(seen.sort(), [...tokens].sort(), 'a successful token response must not hide another unconfirmed response')
      } else if (scenario === 'repeated-failure') {
        let requests = 0
        globalThis.fetch = async () => { requests++; return new Response(null, { status: 503 }) }
        await client.setTokens({ access_token: 'fake-failed-token', refresh_token: 'fake-failed-token' })
        const check = { cause: ['http-503'], cleanupCounts: { attempted: 1, confirmed: 0, failed: 1 } }
        await assert.rejects(client.removeTokens(), check)
        await assert.rejects(client.removeTokens(), check)
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        await assert.rejects(client.setTokens({ access_token: 'fake-replacement-token' }), check)
        assert.equal(await client.getTokens(), null)
        assert.equal(requests, 1, 'keep the failed outcome, not credentials for an automatic retry')
      } else if (scenario === 'concurrent-failure') {
        let requests = 0
        globalThis.fetch = async () => { requests++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response(null, { status: 503 }) }
        await client.setTokens({ access_token: 'fake-concurrent-token' })
        const results = await Promise.allSettled([client.removeTokens(), client.removeTokens(), revokeUserRaycastOAuthTokens(), revokeUserRaycastOAuthTokens()])
        const cleanupCounts = { attempted: 1, confirmed: 0, failed: 1 }
        assert.deepEqual(results.map(result => result.status === 'rejected' ? result.reason.cleanupCounts : 'fulfilled'), Array(4).fill(cleanupCounts))
        assert.equal(requests, 1, 'concurrent direct and shared cleanup count and send each credential only once')
        assert.equal(await client.getTokens(), null)
      } else if (scenario === 'lifetime-counts') {
        let status = 200, requests = 0
        globalThis.fetch = async () => { requests++; return new Response(null, { status }) }
        await client.setTokens({ access_token: 'fake-earlier-token', refresh_token: 'fake-earlier-token' })
        await client.removeTokens(); await revokeUserRaycastOAuthTokens()
        status = 401
        await client.setTokens({ access_token: 'fake-later-token' })
        await assert.rejects(client.removeTokens(), { cleanupCounts: { attempted: 1, confirmed: 0, failed: 1 } })
        const check = { cause: ['http-401'], cleanupCounts: { attempted: 2, confirmed: 1, failed: 1 } }
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        assert.equal(requests, 2, 'include earlier confirmed requests without recounting cached outcomes')
      } else if (scenario === 'bounded-counts') {
        let status = 200, requests = 0
        globalThis.fetch = async () => { requests++; return new Response(null, { status }) }
        for (let index = 0; index < 512; index++) {
          await client.setTokens({ access_token: 'fake-bound-token' }); await client.removeTokens()
        }
        status = 401
        await client.setTokens({ access_token: 'fake-last-token' })
        const check = (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.deepEqual(error.cause, ['http-401'])
          assert.equal(Object.hasOwn(error, 'cleanupCounts'), false, 'over-bound totals are unavailable, never clamped or zeroed')
          return failure.test(error.message)
        }
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        assert.equal(requests, 513)
      } else if (scenario === 'invalid-shared-cause') {
        // An SDK consumer can override its public method; its error details are not trusted.
        const later = create()
        globalThis.fetch = async () => new Response(null, { status: 200 })
        for (const remove of [async () => { throw new Error('fake-sensitive-token', { cause: ['fake-sensitive-token'] }) }, () => { throw new Error('fake-sensitive-token') }]) {
          client.removeTokens = remove
          await later.setTokens({ access_token: 'fake-later-token' })
          await assert.rejects(revokeUserRaycastOAuthTokens(), (error: unknown) => {
            assert.ok(error instanceof Error)
            assert.deepEqual(error.cause, ['unknown'])
            assert.equal(Object.hasOwn(error, 'cleanupCounts'), false, 'an unknown SDK failure cannot invent complete totals')
            return failure.test(error.message)
          })
          assert.equal(await later.getTokens(), null, 'a synchronous failure must not skip later clients')
        }
      } else {
        const later = create(), third = create(), seen: string[] = []
        globalThis.fetch = async (_input, init) => {
          const token = new URLSearchParams(String(init?.body)).get('token')!
          seen.push(token)
          if (token === 'fake-third-token') throw new Error('fake-sensitive-token')
          return new Response(null, { status: token === 'fake-first-token' ? 503 : 200 })
        }
        await client.setTokens({ access_token: 'fake-first-token' })
        await later.setTokens({ access_token: 'fake-later-token' })
        await third.setTokens({ access_token: 'fake-third-token' })
        await assert.rejects(client.removeTokens(), { cleanupCounts: { attempted: 1, confirmed: 0, failed: 1 } })
        await later.removeTokens()
        const check = { cause: ['http-503', 'transport'], cleanupCounts: { attempted: 3, confirmed: 1, failed: 2 } }
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        await assert.rejects(revokeUserRaycastOAuthTokens(), check)
        assert.deepEqual(seen.sort(), ['fake-first-token', 'fake-later-token', 'fake-third-token'])
        assert.equal(await client.getTokens(), null); assert.equal(await later.getTokens(), null); assert.equal(await third.getTokens(), null)
      }
    })
  }
})
