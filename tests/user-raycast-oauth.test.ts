import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { authorizeUserRaycastPkce } from '../src/user-raycast-oauth.ts'

test('a local Linear callback only accepts the matching PKCE authorization', async () => {
  let callback = ''
  let challenge = ''
  const result = await authorizeUserRaycastPkce({
    clientId: 'public-test-client', endpoint: 'https://linear.app/oauth/authorize', port: 0,
    onAuthorizeUrl: async address => {
      const url = new URL(address)
      assert.equal(url.origin, 'https://linear.app')
      assert.equal(url.searchParams.get('client_id'), 'public-test-client')
      assert.equal(url.searchParams.get('scope'), 'read')
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
      assert.equal(url.searchParams.get('actor'), 'user')
      callback = url.searchParams.get('redirect_uri')!
      challenge = url.searchParams.get('code_challenge')!
      const forged = new URL(callback)
      forged.searchParams.set('code', 'forged-code')
      forged.searchParams.set('state', 'wrong-state')
      assert.equal((await fetch(forged)).status, 400)
      const accepted = new URL(callback)
      accepted.searchParams.set('code', 'test-code')
      accepted.searchParams.set('state', url.searchParams.get('state')!)
      assert.equal((await fetch(accepted)).status, 200)
    },
  })
  assert.equal(challenge, createHash('sha256').update(result.codeVerifier).digest('base64url'))
  assert.equal(result.code, 'test-code')
  assert.equal(result.redirectURI, callback)
  assert.match(result.codeVerifier, /^[A-Za-z0-9_-]{43}$/)
})

test('a fake Linear provider redirects a read-only PKCE login to the owned callback', async () => {
  const provider = createServer((request, response) => {
    const address = new URL(request.url!, 'http://127.0.0.1')
    assert.equal(address.pathname, '/oauth/authorize')
    assert.equal(address.searchParams.get('response_type'), 'code')
    assert.equal(address.searchParams.get('code_challenge_method'), 'S256')
    const callback = new URL(address.searchParams.get('redirect_uri')!)
    callback.searchParams.set('code', 'fake-provider-code')
    callback.searchParams.set('state', address.searchParams.get('state')!)
    response.writeHead(302, { location: callback.href }).end()
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  try {
    const port = (provider.address() as { port: number }).port
    const result = await authorizeUserRaycastPkce({
      clientId: 'public-test-client', endpoint: `http://127.0.0.1:${port}/oauth/authorize`, port: 0,
      onAuthorizeUrl: async address => { assert.equal((await fetch(address)).status, 200) },
    })
    assert.equal(result.code, 'fake-provider-code')
  } finally { await new Promise<void>(resolve => provider.close(() => resolve())) }
})

test('a denied or stalled sign-in cannot leave its callback listener running', async () => {
  let callback = ''
  await assert.rejects(authorizeUserRaycastPkce({
    clientId: 'public-test-client', endpoint: 'https://linear.app/oauth/authorize', port: 0,
    onAuthorizeUrl: async address => {
      const authorization = new URL(address)
      callback = authorization.searchParams.get('redirect_uri')!
      const denied = new URL(callback)
      denied.searchParams.set('error', 'access_denied')
      denied.searchParams.set('state', authorization.searchParams.get('state')!)
      assert.equal((await fetch(denied)).status, 200)
    },
  }), /canceled/i)
  await assert.rejects(authorizeUserRaycastPkce({
    clientId: 'public-test-client', endpoint: 'https://linear.app/oauth/authorize', port: 0, timeoutMs: 20,
    onAuthorizeUrl: address => { callback = new URL(address).searchParams.get('redirect_uri')!; return new Promise<void>(() => {}) },
  }), /timed out/i)
  assert.equal(await fetch(callback).then(response => response.status).catch(() => 'closed'), 'closed')
})

test('canceled sign-in rejects and releases the callback listener', async () => {
  const abort = new AbortController()
  let callback: string | undefined
  await assert.rejects(authorizeUserRaycastPkce({
    clientId: 'public-test-client', endpoint: 'https://linear.app/oauth/authorize', port: 0, signal: abort.signal,
    onAuthorizeUrl: address => { callback = new URL(address).searchParams.get('redirect_uri')!; abort.abort() },
  }), /canceled/i)
  assert.ok(callback)
  assert.equal(await fetch(callback!).then(response => response.status).catch(() => 'closed'), 'closed')
})
