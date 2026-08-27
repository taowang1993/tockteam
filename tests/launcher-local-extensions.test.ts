import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_LOCAL_EXTENSION_DEFAULTS, LAUNCHER_LOCAL_EXTENSION_IDS } from '../src/launcher-local-extension-config.ts'
import {
  LAUNCHER_LOCAL_ACTION_HANDLERS,
  createLauncherLocalExtensions,
  isLauncherCalculatorExpressionBounded,
  resolveLauncherEnabledExtensionIds,
} from '../src/launcher-local-extensions.ts'
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

test('calculator and color conversion retain pinned golden vectors', async () => {
  const calculatorCases: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>, string]> = [
    ['1.2 * (2 + 4.5)', { 'extension[Calculator].precision': 2 }, '7.8'],
    ['1m in cm', {}, '100 cm'],
    ['(1000m in km)/3', { 'extension[Calculator].precision': 2 }, '0.33 km'],
    ['1/3', { 'extension[Calculator].precision': 3 }, '0.333'],
    ['sqrt(-4)', {}, '2i'],
    ['2.5!', {}, '3.32335097'],
    ['1,3 * (2 + 4,5)', { 'extension[Calculator].argumentSeparator': ';', 'extension[Calculator].decimalSeparator': ',', 'extension[Calculator].precision': 2 }, '8,45'],
  ]
  for (const [query, values, expected] of calculatorCases) {
    const result = await search(query, { ...options, getSetting: <T>(key: string, fallback: T) => (values[key] ?? fallback) as T })
    assert.equal(result.after.find(item => item.sourceExtension === 'Calculator')?.name, expected, query)
  }
  const white = (await search('#fff')).after.filter(item => item.sourceExtension === 'ColorConverter')
  assert.deepEqual(white.map(item => item.name), ['#FFFFFF', 'hsl(0, 0%, 100%)', 'rgb(255, 255, 255)'])
  assert.equal(white.every(item => item.details === 'white'), true)
  const rgbOnly = await search('#fff', { ...options, getSetting: <T>(key: string, fallback: T) => (key === 'extension[ColorConverter].formats' ? ['RGB'] : fallback) as T })
  assert.deepEqual(rgbOnly.after.filter(item => item.sourceExtension === 'ColorConverter').map(item => item.description), ['RGB Color'])
  assert.deepEqual((await search('#ffg')).after.filter(item => item.sourceExtension === 'ColorConverter'), [])
})

test('password and formatter flags preserve bounded source behavior', async () => {
  const passwordValues: Record<string, unknown> = {
    'extension[PasswordGenerator].beginWithALetter': true,
    'extension[PasswordGenerator].includeLowercaseCharacters': true,
    'extension[PasswordGenerator].includeNumbers': true,
    'extension[PasswordGenerator].includeSymbols': false,
    'extension[PasswordGenerator].includeUppercaseCharacters': false,
    'extension[PasswordGenerator].noDuplicateCharacters': true,
    'extension[PasswordGenerator].passwordLength': 20,
    'extension[PasswordGenerator].quantity': 1,
  }
  const generated = (await search('pw', { ...options, getSetting: <T>(key: string, fallback: T) => (passwordValues[key] ?? fallback) as T })).before.find(item => item.sourceExtension === 'PasswordGenerator')?.name ?? ''
  assert.match(generated[0] ?? '', /[a-z]/u)
  assert.equal(new Set([...generated]).size, 20)

  const invalidJson = await search('qfj {bad')
  assert.equal(invalidJson.before.find(item => item.sourceExtension === 'QuickFormatter')?.name, '{bad')
  const flagsOff = { 'extension[QuickFormatter].enableJson': false, 'extension[QuickFormatter].enableStackTrace': false, 'extension[QuickFormatter].enableXml': false }
  const explicit = await search('qfj {"answer":42}', { ...options, getSetting: <T>(key: string, fallback: T) => (flagsOff[key as keyof typeof flagsOff] ?? fallback) as T })
  assert.equal(explicit.before.some(item => item.sourceExtension === 'QuickFormatter'), false)
  const automatic = await search('qf {"answer":42}', { ...options, getSetting: <T>(key: string, fallback: T) => (flagsOff[key as keyof typeof flagsOff] ?? fallback) as T })
  assert.equal(automatic.before.find(item => item.sourceExtension === 'QuickFormatter')?.name, '{\n  "answer": 42\n}')
})

test('UUID search preserves exact generation, strictness, and formatting', async () => {
  const canonical = '21771a07-7dce-40b3-850e-386c1a0f5a2d'
  const format = { braces: true, hyphens: false, quotes: true, uppercase: true }
  const values = { 'extension[UuidGenerator].searchResultFormats': [format] }
  const formatted = await search(canonical, { ...options, getSetting: <T>(key: string, fallback: T) => (values[key as keyof typeof values] ?? fallback) as T })
  assert.equal(formatted.before.find(item => item.sourceExtension === 'UuidGenerator')?.name, '"{21771A077DCE40B3850E386C1A0F5A2D}"')
  const generated = await search('guid', { ...options, getSetting: <T>(key: string, fallback: T) => (values[key as keyof typeof values] ?? fallback) as T })
  assert.match(generated.before.find(item => item.sourceExtension === 'UuidGenerator')?.name ?? '', /^"\{[0-9A-F]{32}\}"$/u)
  assert.deepEqual((await search('uuid ', { ...options, getSetting: <T>(key: string, fallback: T) => (values[key as keyof typeof values] ?? fallback) as T })).before.filter(item => item.sourceExtension === 'UuidGenerator'), [])
  const structurallyLoose = '21771a07-7dce-10b3-050e-386c1a0f5a2d'
  const looseValues = { ...values, 'extension[UuidGenerator].validateStrictly': false }
  assert.equal((await search(structurallyLoose, { ...options, getSetting: <T>(key: string, fallback: T) => (looseValues[key as keyof typeof looseValues] ?? fallback) as T })).before.some(item => item.sourceExtension === 'UuidGenerator'), true)
})

test('calculator rejects resource-amplifying constructors before evaluation', () => {
  assert.equal(isLauncherCalculatorExpressionBounded('ones(10, 10)'), true)
  assert.equal(isLauncherCalculatorExpressionBounded('[1:10]'), true)
  assert.equal(isLauncherCalculatorExpressionBounded('ones(1000000)'), false)
  assert.equal(isLauncherCalculatorExpressionBounded('ones(10^9)'), false)
  assert.equal(isLauncherCalculatorExpressionBounded('kron(ones(100, 100), ones(100, 100))'), false)
  assert.equal(isLauncherCalculatorExpressionBounded('factorial(100000000)'), false)
  assert.equal(isLauncherCalculatorExpressionBounded('factorial(bignumber(100000000))'), false)
  assert.equal(isLauncherCalculatorExpressionBounded('[1:1000000]'), false)
  assert.equal(isLauncherCalculatorExpressionBounded('[1:10^9]'), false)
})

test('Unicode password symbols count code points instead of UTF-16 units', async () => {
  const result = await search('pw', {
    ...options,
    getSetting: <T>(key: string, fallback: T) => {
      const values: Record<string, unknown> = {
        'extension[PasswordGenerator].includeLowercaseCharacters': false,
        'extension[PasswordGenerator].includeNumbers': false,
        'extension[PasswordGenerator].includeSymbols': true,
        'extension[PasswordGenerator].includeUppercaseCharacters': false,
        'extension[PasswordGenerator].passwordLength': 3,
        'extension[PasswordGenerator].quantity': 1,
        'extension[PasswordGenerator].symbols': '🚀',
      }
      return (values[key] ?? fallback) as T
    },
  })
  const generated = result.before.find(item => item.sourceExtension === 'PasswordGenerator')?.name
  assert.equal(generated, '🚀🚀🚀')
  assert.equal([...(generated ?? '')].length, 3)
})

test('similar-character removal applies to the complete configured alphabet', async () => {
  const result = await search('pw', {
    ...options,
    getSetting: <T>(key: string, fallback: T) => {
      const values: Record<string, unknown> = {
        'extension[PasswordGenerator].includeLowercaseCharacters': false,
        'extension[PasswordGenerator].includeNumbers': false,
        'extension[PasswordGenerator].includeSymbols': true,
        'extension[PasswordGenerator].includeUppercaseCharacters': false,
        'extension[PasswordGenerator].noSimilarCharacters': true,
        'extension[PasswordGenerator].passwordLength': 1,
        'extension[PasswordGenerator].quantity': 1,
        'extension[PasswordGenerator].symbols': 'io',
      }
      return (values[key] ?? fallback) as T
    },
  })
  assert.equal(result.before.some(item => item.sourceExtension === 'PasswordGenerator'), false)
})

test('malformed enablement arrays fall back atomically', () => {
  const fallback = ['Base64Conversion', 'Calculator']
  assert.deepEqual(resolveLauncherEnabledExtensionIds(['Base64Conversion', 42], fallback), fallback)
  assert.deepEqual(resolveLauncherEnabledExtensionIds(['QuickFormatter'], fallback), ['QuickFormatter'])
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
