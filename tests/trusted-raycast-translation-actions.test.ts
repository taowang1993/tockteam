import test from 'node:test'
import assert from 'node:assert/strict'
import * as contract from '../src/trusted-raycast-contract.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { PassThrough } from 'node:stream'

test('native translation requests admit only bounded Copy and the exact Google Translate URL', () => {
  const valid = contract.isTrustedRaycastNativeRequest
  assert.equal(typeof valid, 'function')
  const base = { type: 'native', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 2, eventId: 'a', requestId: 'n' }
  assert.equal(valid({ ...base, kind: 'copy', text: 'hello' }), true)
  assert.equal(valid({ ...base, kind: 'copy', text: 'x'.repeat(131073) }), false)
  assert.equal(valid({ ...base, kind: 'copy', text: 'hello', command: 'sh' }), false)
  const url = 'https://translate.google.com/?sl=auto&tl=zh-CN&text=hello&op=translate'
  assert.equal(valid({ ...base, kind: 'openGoogleTranslate', url }), true)
  for (const bad of [url.replace('https:', 'http:'), url.replace('google.com', 'google.com.evil'), url + '&extra=1', url + '#fragment', url.replace('/?', '/other?'), url.replace('https://', 'https://user@')]) {
    assert.equal(valid({ ...base, kind: 'openGoogleTranslate', url: bad }), false, bad)
  }
  assert.equal(valid({ ...base, kind: 'paste', text: 'hello' }), true)
  assert.equal(valid({ extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', requestId: 'n', type: 'native', kind: 'selectedText' }), true)
  assert.equal(valid({ ...base, kind: 'selectedText' }), false)
  assert.equal(valid({ extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', requestId: 'n', type: 'native', kind: 'selectedText', text: 'leak' }), false)
})

test('native denial is correlated, replay and query replacement cannot perform effects', async () => {
  const writes: string[] = []; const effects: string[] = []
  let finish!: () => void
  const manager = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage() {}, copyText: async text => { effects.push(text); await new Promise<void>(resolve => { finish = resolve }) }, openGoogleTranslate: async url => { effects.push(url); throw new Error('Browser denied') } })
  const stdin = new PassThrough(); stdin.on('data', chunk => writes.push(String(chunk)))
  const owner = { webContentsId: 1 }
  const session = { child: { stdin }, owner, input: { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate', preferences: {} }, revision: 2, querySequence: 0, eventId: 'search', actions: new Map([['action', 'source-action']]), fields: new Map(), action: undefined as { eventId: string; revision: number; nativeUsed: boolean } | undefined }
  Reflect.set(manager, 'session', session)
  const action = { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: 'action', kind: 'action' as const }
  assert.throws(() => manager.send({ webContentsId: 9 }, action), /stale/)
  manager.send(owner, action)
  const request = { type: 'native', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 2, eventId: 'action', requestId: 'n', kind: 'copy', text: 'controlled' }
  const native = Reflect.get(manager, 'native').bind(manager)
  const pending = native(session, request)
  await native(session, { ...request, requestId: 'replay' })
  assert.deepEqual(effects, ['controlled'])
  assert.equal(JSON.parse(writes.at(-1)!).succeeded, false)
  manager.send(owner, { ...action, kind: 'searchChanged', eventId: 'search', value: 'new query' })
  assert.throws(() => manager.send(owner, action), /stale/)
  await native(session, { ...request, requestId: 'late' })
  assert.equal(JSON.parse(writes.at(-1)!).succeeded, false)
  finish(); await pending
  assert.equal(contract.isTrustedRaycastNativeOutcome(JSON.parse(writes.at(-1)!)), true)
  assert.equal(JSON.parse(writes.at(-1)!).requestId, 'n')
  session.action = { eventId: 'browser', revision: 2, nativeUsed: false }
  await native(session, { ...request, eventId: 'browser', requestId: 'browser-result', kind: 'openGoogleTranslate', url: 'https://translate.google.com/?sl=auto&tl=en&text=test&op=translate' })
  assert.deepEqual(JSON.parse(writes.at(-1)!), { type: 'nativeOutcome', extensionId: 'google-translate', requestId: 'browser-result', succeeded: false, message: 'Browser denied' })
  assert.equal(effects.at(-1), 'https://translate.google.com/?sl=auto&tl=en&text=test&op=translate')
  stdin.destroy()
})
