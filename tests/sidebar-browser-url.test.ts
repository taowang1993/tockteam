import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  initialBrowserUrl,
  normalizeBrowserUrl,
} from '../plugins/sidebar/src/client/browser-url.ts'

const t = (key: string): string => key

test('browser tabs accept only HTTP URLs, including restored resources', () => {
  assert.equal(normalizeBrowserUrl('example.com', t as never), 'https://example.com/')
  assert.throws(() => normalizeBrowserUrl('file:///etc/hosts', t as never), /browser\.http-only/u)
  assert.deepEqual(initialBrowserUrl('data:text/html,unsafe', t as never), {
    error: 'browser.http-only',
    url: 'about:blank',
  })
  assert.deepEqual(initialBrowserUrl(undefined, t as never), { url: 'about:blank' })
})
