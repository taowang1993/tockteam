import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isTrustedBrowserRequest } from '../plugins/shared/request-trust.ts'

const request = (headers: Record<string, string>) => ({ headers })

test('privileged plugin routes reject DNS rebinding and cross-site requests', () => {
  assert.equal(isTrustedBrowserRequest(request({
    host: '127.0.0.1:3080',
    origin: 'http://127.0.0.1:3080',
  })), true)
  assert.equal(isTrustedBrowserRequest(request({
    host: 'attacker.example:3080',
    origin: 'http://attacker.example:3080',
  })), false)
  assert.equal(isTrustedBrowserRequest(request({
    host: 'harness.example:3080',
    origin: 'http://harness.example:3080',
  }), ['harness.example:3080']), true)
  assert.equal(isTrustedBrowserRequest(request({
    host: 'harness.example:3080',
    origin: 'http://harness.example:3080',
    'sec-fetch-site': 'cross-site',
  }), ['harness.example:3080']), false)
  assert.equal(isTrustedBrowserRequest(request({
    host: '127.0.0.1:3080',
    origin: 'null',
  })), false)
})
