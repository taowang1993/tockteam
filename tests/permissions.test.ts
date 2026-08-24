import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { allowsRuntimeClipboardWrite, allowsRuntimeMicrophone, allowsTrustedMainIpc, originOf } from '../src/permissions.ts'

const runtimeOrigin = 'http://127.0.0.1:43210'

function request(overrides: Partial<Parameters<typeof allowsRuntimeClipboardWrite>[0]> = {}) {
  return {
    isMainFrame: true,
    permission: 'clipboard-sanitized-write',
    requestingOrigin: runtimeOrigin,
    runtimeOrigin,
    webContentsIsMainWindow: true,
    ...overrides,
  }
}

test('every info and privileged IPC handler invokes the trusted-main guard', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  for (const channel of ['choose-workspace', 'get-info', 'get-runtime-snapshot', 'tocktutor-authorize', 'tocktutor-dispatch-next', 'tocktutor-dispatch-cancel', 'tocktutor-dispatch-complete', 'plugin-marketplace-snapshot', 'plugin-marketplace-dispatch', 'web-clip-authorize-document', 'open-external']) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('desktop:${channel}'[\\s\\S]{0,180}assertTrustedMainIpc\\(event\\)`))
  }
})

test('privileged IPC accepts only the live runtime main frame', () => {
  const trusted = {
    isMainFrame: true,
    mainWindowId: 1,
    runtimeOrigin: 'http://127.0.0.1:3000',
    senderDestroyed: false,
    senderId: 1,
    senderOrigin: 'http://127.0.0.1:3000',
  }
  assert.equal(allowsTrustedMainIpc(trusted), true)
  assert.equal(allowsTrustedMainIpc({ ...trusted, isMainFrame: false }), false)
  assert.equal(allowsTrustedMainIpc({ ...trusted, senderId: 2 }), false)
  assert.equal(allowsTrustedMainIpc({ ...trusted, senderOrigin: 'file://' }), false)
  assert.equal(allowsTrustedMainIpc({ ...trusted, senderDestroyed: true }), false)
  assert.equal(allowsTrustedMainIpc({ ...trusted, runtimeOrigin: undefined }), false)
})

test('allows only audio-only microphone requests from the live DSH main frame', () => {
  const request = {
    isMainFrame: true,
    mediaTypes: ['audio'],
    requestingOrigin: 'http://127.0.0.1:3000',
    runtimeOrigin: 'http://127.0.0.1:3000',
    webContentsIsMainWindow: true,
  }
  assert.equal(allowsRuntimeMicrophone(request), true)
  assert.equal(allowsRuntimeMicrophone({ ...request, mediaTypes: ['audio', 'video'] }), false)
  assert.equal(allowsRuntimeMicrophone({ ...request, mediaTypes: ['video'] }), false)
  assert.equal(allowsRuntimeMicrophone({ ...request, webContentsIsMainWindow: false }), false)
})

test('allows clipboard writes from the live DSH main frame', () => {
  assert.equal(allowsRuntimeClipboardWrite(request({
    requestingUrl: `${runtimeOrigin}/conversation`,
  })), true)
  assert.equal(allowsRuntimeClipboardWrite(request({
    requestingOrigin: `${runtimeOrigin}/`,
  })), true)
})

test('normalizes valid origins and fails closed for invalid URLs', () => {
  assert.equal(originOf(`${runtimeOrigin}/conversation`), runtimeOrigin)
  assert.equal(originOf('not a url'), undefined)
  assert.equal(originOf(undefined), undefined)
})

test('rejects clipboard reads and every non-DSH permission', () => {
  assert.equal(allowsRuntimeClipboardWrite(request({ permission: 'clipboard-read' })), false)
  assert.equal(allowsRuntimeClipboardWrite(request({ permission: 'notifications' })), false)
})

test('rejects clipboard writes from untrusted frames and windows', () => {
  assert.equal(allowsRuntimeClipboardWrite(request({ isMainFrame: false })), false)
  assert.equal(allowsRuntimeClipboardWrite(request({ webContentsIsMainWindow: false })), false)
  assert.equal(allowsRuntimeClipboardWrite(request({ requestingOrigin: 'https://example.com' })), false)
  assert.equal(allowsRuntimeClipboardWrite(request({ requestingUrl: 'https://example.com/steal' })), false)
  assert.equal(allowsRuntimeClipboardWrite(request({ requestingUrl: 'not a url' })), false)
})
