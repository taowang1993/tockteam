import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { isAllowedRuntimeNavigation } from '../src/desktop-navigation.ts'

test('runtime navigation allows only its splash file or active loopback origin', () => {
  const splash = resolve('/application/splash.html')
  const splashUrl = pathToFileURL(splash)
  splashUrl.searchParams.set('state', 'error')

  assert.equal(isAllowedRuntimeNavigation(splashUrl.href, undefined, splash), true)
  assert.equal(isAllowedRuntimeNavigation(pathToFileURL(resolve('/private/secret')).href, undefined, splash), false)
  assert.equal(isAllowedRuntimeNavigation('http://127.0.0.1:4321/session', 'http://127.0.0.1:4321', splash), true)
  assert.equal(isAllowedRuntimeNavigation('http://127.0.0.1:9999/session', 'http://127.0.0.1:4321', splash), false)
  assert.equal(isAllowedRuntimeNavigation('not a url', 'http://127.0.0.1:4321', splash), false)
})
