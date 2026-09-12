import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import type { Cookie, Cookies } from 'electron'
import { pruneRuntimeBrowserCookies } from '../src/runtime-browser-cookies.ts'

function runtimeCookie(port: number): Cookie {
  return {
    name: `dsh-auth-${createHash('sha256').update(`127.0.0.1:${port}`).digest('base64url')}`,
    value: 'not-a-real-credential', domain: '127.0.0.1', path: '/', hostOnly: true,
    httpOnly: true, secure: false, session: false, sameSite: 'strict',
  }
}

function cookieJar(initial: Cookie[]) {
  const remaining = [...initial]
  const cookies: Pick<Cookies, 'get' | 'remove'> = {
    async get(filter) { assert.deepEqual(filter, { domain: '127.0.0.1' }); return [...remaining] },
    async remove(url, name) {
      assert.equal(url, 'http://127.0.0.1/')
      const index = remaining.findIndex(cookie => cookie.name === name)
      assert.notEqual(index, -1)
      remaining.splice(index, 1)
    },
  }
  return { cookies, remaining }
}

test('retires accumulated runtime cookies but preserves active main and preview authentication', async () => {
  const main = runtimeCookie(42000)
  const preview = runtimeCookie(42001)
  const stale = Array.from({ length: 61 }, (_,i) => runtimeCookie(43000+i))
  const jar = cookieJar([...stale, main, preview])
  assert.equal(await pruneRuntimeBrowserCookies(jar.cookies, [new URL('http://127.0.0.1:42000/?token=unused'), new URL('http://127.0.0.1:42001/')]), 61)
  assert.deepEqual(jar.remaining, [main, preview])
})

test('does not remove unrelated, foreign-domain, or differently scoped cookies', async () => {
  const base = runtimeCookie(43000)
  const protectedCookies: Cookie[] = [
    { ...base, name: 'user-preference' },
    { ...base, name: 'dsh-auth-not-a-generated-name' },
    { ...base, domain: 'example.com' },
    { ...base, domain: '.127.0.0.1' },
    { ...base, hostOnly: false },
    { ...base, path: '/other' },
    { ...base, httpOnly: false },
    { ...base, secure: true },
    { ...base, sameSite: 'lax' },
  ]
  const jar = cookieJar(protectedCookies)
  assert.equal(await pruneRuntimeBrowserCookies(jar.cookies, []), 0)
  assert.deepEqual(jar.remaining, protectedCookies)
})

test('uses the pinned server’s canonical Host authority even for an explicit default port', async () => {
  const cookie = { ...runtimeCookie(80), name: `dsh-auth-${createHash('sha256').update('127.0.0.1').digest('base64url')}` }
  const jar = cookieJar([cookie])
  assert.equal(await pruneRuntimeBrowserCookies(jar.cookies, [new URL('https://127.0.0.1:80/')]), 0)
  assert.deepEqual(jar.remaining, [cookie])
})

test('a fresh workbench session needs no cleanup', async () => {
  assert.equal(await pruneRuntimeBrowserCookies(cookieJar([]).cookies, []), 0)
})

test('cookie storage failures reject rather than silently continuing with broken startup', async () => {
  const failure = new Error('cookie store unavailable')
  await assert.rejects(pruneRuntimeBrowserCookies({ get: async () => { throw failure }, remove: async () => {} }, []), failure)
  await assert.rejects(pruneRuntimeBrowserCookies({ get: async () => [runtimeCookie(43000)], remove: async () => { throw failure } }, []), failure)
})
