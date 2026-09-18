import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseLauncherLocalExtensionSettings } from '../src/launcher-local-extension-contract.ts'

const valid = {
  Base64Conversion: { decodePrefix: 'b64d', encodeDecodePrefix: 'b64', encodePrefix: 'b64e' },
  Calculator: { argumentSeparator: ',', decimalSeparator: '.', precision: 8 },
  ColorConverter: { formats: ['HEX', 'HSL', 'RGB'] },
  PasswordGenerator: { beginWithALetter: false, command: 'pw', includeLowercaseCharacters: true, includeNumbers: true, includeSymbols: true, includeUppercaseCharacters: true, noDuplicateCharacters: false, noSequentialCharacters: false, noSimilarCharacters: false, passwordLength: 24, quantity: 5, symbols: "!?'\":;.,+-*/_()[]{}#$%&<>=@^`|~" },
  QuickFormatter: { command: 'qf', enableDeepFormatting: true, enableJson: true, enableStackTrace: true, enableXml: true },
  RowlandTextEditor: { columnSeparator: '\\t', rowSeparator: '\\n' },
  UuidGenerator: { braces: false, generatorFormat: { braces: false, hyphens: true, quotes: false, uppercase: false }, hyphens: true, numberOfUuids: 10, quotes: false, searchResultFormats: [], uppercase: false, uuidVersion: 'v4', validateStrictly: true },
}

test('local settings projection is exact, frozen, bounded, and rejects hidden authority', () => {
  const parsed = parseLauncherLocalExtensionSettings(valid)
  assert.deepEqual(parsed, valid)
  assert.equal(Object.isFrozen(parsed), true)
  assert.equal(Object.isFrozen(parsed.UuidGenerator), true)
  assert.equal(Object.isFrozen(parsed.UuidGenerator.generatorFormat), true)
  assert.throws(() => parseLauncherLocalExtensionSettings({ ...valid, secret: 'x' } as never))
  assert.throws(() => parseLauncherLocalExtensionSettings({ ...valid, UuidGenerator: { ...valid.UuidGenerator, path: '/tmp' } } as never))
  assert.throws(() => parseLauncherLocalExtensionSettings({ ...valid, Calculator: { ...valid.Calculator, precision: 65 } } as never))
  assert.equal(parseLauncherLocalExtensionSettings({
    ...valid,
    PasswordGenerator: { ...valid.PasswordGenerator, includeSymbols: false, symbols: '' },
  }).PasswordGenerator.symbols, '')
})
