import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { captureTrustedRaycastPriorApp, pasteTrustedRaycastText, type TrustedRaycastNativeDeps } from '../src/trusted-raycast-native.ts'

function fixture() {
  const events = new EventEmitter()
  const inserted: string[] = []
  let shown = 0
  const url = 'http://localhost/tocktutor'
  const workbench = {
    isDestroyed: () => false,
    isFocused: () => true,
    show: () => { shown++ },
    webContents: {
      isDestroyed: () => false,
      getURL: () => url,
      insertText: async (text: string) => { inserted.push(text) },
      on: events.on.bind(events),
    },
  }
  const forbidden = (): never => { throw new Error('Native and clipboard effects are forbidden in this fixture') }
  const native: TrustedRaycastNativeDeps = {
    execFile: forbidden,
    ownAppNames: ['TockTeam Desktop'],
    readClipboard: forbidden,
    readClipboardBuffer: forbidden,
    readClipboardFormats: forbidden,
    writeClipboard: forbidden,
    writeClipboardBuffer: forbidden,
  }
  return { events, inserted, native, shown: () => shown, url, workbench }
}

test('workbench Paste refuses a captured document after a same-address reload', async () => {
  const f = fixture()
  const target = await captureTrustedRaycastPriorApp(f.native, f.workbench)
  assert.ok(target)
  f.events.emit('did-start-navigation', {}, f.url, false, true)
  assert.equal(f.workbench.webContents.getURL(), f.url, 'a reload retains the address')
  await assert.rejects(pasteTrustedRaycastText('private text', target, f.native), /target.*unavailable/i)
  assert.deepEqual(f.inserted, [], 'the replacement document must receive no text')
  assert.equal(f.shown(), 0)
})

test('workbench Paste refuses a crashed renderer and accepts a freshly captured replacement', async () => {
  const f = fixture()
  const target = await captureTrustedRaycastPriorApp(f.native, f.workbench)
  assert.ok(target)
  f.events.emit('render-process-gone', {}, { reason: 'crashed' })
  await assert.rejects(pasteTrustedRaycastText('old text', target, f.native), /target.*unavailable/i)
  const replacement = await captureTrustedRaycastPriorApp(f.native, f.workbench)
  await pasteTrustedRaycastText('new text', replacement, f.native)
  assert.deepEqual(f.inserted, ['new text'])
  assert.equal(f.shown(), 1)
  await assert.rejects(pasteTrustedRaycastText('old text', target, f.native), /target.*unavailable/i)
})

test('workbench Paste retains its captured document across subframe and same-document navigation', async () => {
  const f = fixture()
  const target = await captureTrustedRaycastPriorApp(f.native, f.workbench)
  f.events.emit('did-start-navigation', {}, f.url, false, false)
  f.events.emit('did-start-navigation', {}, f.url, true, true)
  const result = await pasteTrustedRaycastText('current text', target, f.native)
  assert.deepEqual(f.inserted, ['current text'])
  assert.equal(result.restoration, 'unchanged')
})

test('repeated workbench Paste captures share one bounded document observer', async () => {
  const f = fixture()
  const targets = await Promise.all(Array.from({ length: 20 }, () => captureTrustedRaycastPriorApp(f.native, f.workbench)))
  assert.equal(f.events.listenerCount('did-start-navigation'), 1)
  assert.equal(f.events.listenerCount('render-process-gone'), 1)
  f.events.emit('did-start-navigation', {}, f.url, false, true)
  for (const target of targets) await assert.rejects(pasteTrustedRaycastText('retired text', target, f.native), /target.*unavailable/i)
  const current = await captureTrustedRaycastPriorApp(f.native, f.workbench)
  await pasteTrustedRaycastText('replacement text', current, f.native)
  assert.deepEqual(f.inserted, ['replacement text'])
  assert.equal(f.events.listenerCount('did-start-navigation'), 1)
  assert.equal(f.events.listenerCount('render-process-gone'), 1)
})

test('pending workbench Paste cannot show a replacement document after insertion finishes', async () => {
  const f = fixture()
  let complete!: () => void
  f.workbench.webContents.insertText = async () => await new Promise<void>(resolve => { complete = resolve })
  const target = await captureTrustedRaycastPriorApp(f.native, f.workbench)
  const pending = pasteTrustedRaycastText('pending text', target, f.native)
  f.events.emit('did-start-navigation', {}, f.url, false, true)
  complete()
  await assert.rejects(pending, /target.*unavailable/i)
  assert.equal(f.shown(), 0, 'completion must not focus the replacement page')
})
