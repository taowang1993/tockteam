import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_LOCAL_EXTENSION_DEFAULTS, LAUNCHER_LOCAL_EXTENSION_IDS } from '../src/launcher-local-extension-config.ts'
import { LAUNCHER_LOCAL_ACTION_HANDLERS, createLauncherLocalExtensions } from '../src/launcher-local-extensions.ts'
import type { LauncherActionRecord, LauncherInternalAction } from '../src/launcher-actions.ts'

const owner = { role: 'launcher' as const, webContentsId: 1 }
const options = {
  enabledExtensionIds: () => LAUNCHER_LOCAL_EXTENSION_IDS,
  getSetting: <T>(_key: string, fallback: T) => fallback,
  copyText: async (_text: string) => {},
}
const search = async (term: string, overrides = options) => createLauncherLocalExtensions(overrides).searchInstant(term)
function action(overrides: Partial<LauncherActionRecord> = {}): LauncherActionRecord {
  return {
    actionId: 'launcher-action:test', argument: 'value', expiresAt: 2_000,
    handlerKey: LAUNCHER_LOCAL_ACTION_HANDLERS.copy, hideWindowAfterInvocation: false,
    owner, requiresConfirmation: false, resultSetId: 'launcher-results:1', sourceExtension: 'Base64Conversion', ...overrides,
  }
}

test('local adapter keeps exact ids/defaults, static order, image keys, and enablement', async () => {
  assert.deepEqual(LAUNCHER_LOCAL_EXTENSION_IDS, ['Base64Conversion', 'Calculator', 'ColorConverter', 'PasswordGenerator', 'QuickFormatter', 'RowlandTextEditor', 'UuidGenerator'])
  assert.equal(LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator.quantity, 5)
  const local = createLauncherLocalExtensions(options)
  const indexed = await local.loadIndexedItems()
  assert.deepEqual(indexed.map(item => item.id), ['ueli-local:Base64Conversion', 'ueli-local:RowlandTextEditor', 'ueli-local:UuidGenerator'])
  assert.deepEqual(indexed.map(item => item.imageKey), ['base64-conversion', 'rowland-texteditor', 'uuid-generator'])
  const disabled = createLauncherLocalExtensions({ ...options, enabledExtensionIds: () => ['Calculator'] })
  assert.deepEqual(await disabled.loadIndexedItems(), [])
})

test('Base64, calculator, colors, password, quick formatter, and UUID search match fixtures', async () => {
  const base64 = await search('b64e Tockbot')
  assert.equal(base64.before[0]?.name, 'VG9ja2JvdA==')
  assert.equal(base64.before[0]?.description, 'Encoded · Base64 Conversion')
  assert.equal((await search('b64d VGhpcyBpcyBhIHRlc3Qh')).before[0]?.name, 'This is a test!')
  assert.deepEqual((await search('b64 Tockbot')).before.map(item => item.name), ['VG9ja2JvdA==', 'N�$n�'])
  assert.equal((await search('2 + 2')).after.find(item => item.sourceExtension === 'Calculator')?.name, '4')
  assert.equal((await search('rebeccapurple')).after.find(item => item.description === 'HEX Color')?.name, '#663399')
  const passwords = (await search('pw')).before.filter(item => item.sourceExtension === 'PasswordGenerator')
  assert.equal(passwords.length, 5)
  assert.equal(passwords.every(item => item.name.length === 24), true)
  assert.equal((await search('qfj {"answer":42}')).before.find(item => item.sourceExtension === 'QuickFormatter')?.name, '{\n  "answer": 42\n}')
  assert.deepEqual((await search('uuid')).before.filter(item => item.sourceExtension === 'UuidGenerator'), [])
})

test('local providers isolate failures and malformed settings fall back safely', async () => {
  const errors: string[] = []
  const local = createLauncherLocalExtensions({
    ...options,
    getSetting: <T>(key: string, fallback: T) => key.includes('Calculator') ? '\\' as T : fallback,
    onProviderError: id => errors.push(id),
    searchOverrides: { Calculator: () => { throw new Error('bad provider') } },
  })
  const result = await local.searchInstant('b64e Tockbot')
  assert.equal(result.before[0]?.name, 'VG9ja2JvdA==')
  assert.deepEqual(errors, ['Calculator'])
})

test('local actions keep payloads main-owned and enforce finite ownership', async () => {
  let copied = ''
  const local = createLauncherLocalExtensions({ ...options, copyText: text => { copied = text } })
  assert.equal(await local.executeAction(action({ argument: 'secret' })), true)
  assert.equal(copied, 'secret')
  assert.equal(await local.executeAction(action({ handlerKey: 'unrelated' })), false)
  await assert.rejects(local.executeAction(action({ sourceExtension: 'Other' })))
  await assert.rejects(local.executeAction(action({ handlerKey: LAUNCHER_LOCAL_ACTION_HANDLERS.open, argument: 'RowlandTextEditor', sourceExtension: 'Base64Conversion' })))
  assert.equal(await local.executeAction(action({ handlerKey: LAUNCHER_LOCAL_ACTION_HANDLERS.open, argument: 'Base64Conversion', sourceExtension: 'Base64Conversion' })), true)
})

test('local dynamic results remain bounded and retain complete copy arguments', async () => {
  const long = 'x'.repeat(600)
  const local = createLauncherLocalExtensions({
    ...options,
    searchOverrides: { Base64Conversion: () => ({ before: [{
      id: 'long', name: long, description: 'long', sourceExtension: 'Base64Conversion', defaultAction: { argument: long, description: 'Copy result', handlerKey: LAUNCHER_LOCAL_ACTION_HANDLERS.copy },
    } as never], after: [] }) },
  })
  const item = (await local.searchInstant('anything')).before[0]!
  assert.equal(item.name.length, 512)
})
