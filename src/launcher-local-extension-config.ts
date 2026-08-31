export const LAUNCHER_LOCAL_EXTENSION_IDS = Object.freeze([
  'Base64Conversion',
  'Calculator',
  'ColorConverter',
  'PasswordGenerator',
  'QuickFormatter',
  'RowlandTextEditor',
  'UuidGenerator',
] as const)

export type LauncherLocalExtensionId = (typeof LAUNCHER_LOCAL_EXTENSION_IDS)[number]

export const LAUNCHER_PASSWORD_SYMBOLS = "!?\'\":;.,+-*/_()[]{}#$%&<>=@^`|~"

/** Compatibility defaults; absent UUID format booleans intentionally stay absent. */
export const LAUNCHER_LOCAL_EXTENSION_DEFAULTS = Object.freeze({
  Base64Conversion: Object.freeze({ decodePrefix: 'b64d', encodeDecodePrefix: 'b64', encodePrefix: 'b64e' }),
  Calculator: Object.freeze({ argumentSeparator: ',', decimalSeparator: '.', precision: 8 }),
  ColorConverter: Object.freeze({ formats: Object.freeze(['HEX', 'HSL', 'RGB'] as const) }),
  PasswordGenerator: Object.freeze({
    beginWithALetter: false,
    command: 'pw',
    includeLowercaseCharacters: true,
    includeNumbers: true,
    includeSymbols: true,
    includeUppercaseCharacters: true,
    noDuplicateCharacters: false,
    noSequentialCharacters: false,
    noSimilarCharacters: false,
    passwordLength: 24,
    quantity: 5,
    symbols: LAUNCHER_PASSWORD_SYMBOLS,
  }),
  QuickFormatter: Object.freeze({ command: 'qf', enableDeepFormatting: true, enableJson: true, enableStackTrace: true, enableXml: true }),
  RowlandTextEditor: Object.freeze({ columnSeparator: '\\t', rowSeparator: '\\n' }),
  UuidGenerator: Object.freeze({
    generatorFormat: Object.freeze({ braces: false, hyphens: true, quotes: false, uppercase: false }),
    numberOfUuids: 10,
    searchResultFormats: Object.freeze([] as readonly unknown[]),
    uuidVersion: 'v4',
    validateStrictly: true,
  }),
})
