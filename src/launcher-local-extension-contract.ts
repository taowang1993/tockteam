import { LAUNCHER_LOCAL_EXTENSION_IDS, type LauncherLocalExtensionId } from './launcher-local-extension-config.ts'

export type LauncherUuidFormat = Readonly<{ braces: boolean; hyphens: boolean; quotes: boolean; uppercase: boolean }>
export type LauncherLocalExtensionSettings = Readonly<{
  Base64Conversion: Readonly<{ decodePrefix: string; encodeDecodePrefix: string; encodePrefix: string }>
  Calculator: Readonly<{ argumentSeparator: string; decimalSeparator: string; precision: number }>
  ColorConverter: Readonly<{ formats: readonly ('HEX' | 'HSL' | 'RGB')[] }>
  PasswordGenerator: Readonly<{ beginWithALetter: boolean; command: string; includeLowercaseCharacters: boolean; includeNumbers: boolean; includeSymbols: boolean; includeUppercaseCharacters: boolean; noDuplicateCharacters: boolean; noSequentialCharacters: boolean; noSimilarCharacters: boolean; passwordLength: number; quantity: number; symbols: string }>
  QuickFormatter: Readonly<{ command: string; enableDeepFormatting: boolean; enableJson: boolean; enableStackTrace: boolean; enableXml: boolean }>
  RowlandTextEditor: Readonly<{ columnSeparator: string; rowSeparator: string }>
  UuidGenerator: Readonly<{ braces: boolean; generatorFormat: LauncherUuidFormat; hyphens: boolean; numberOfUuids: number; quotes: boolean; searchResultFormats: readonly LauncherUuidFormat[]; uppercase: boolean; uuidVersion: 'v4' | 'v6' | 'v7'; validateStrictly: boolean }>
}>

const ids = new Set(LAUNCHER_LOCAL_EXTENSION_IDS)
const colorFormats = new Set(['HEX', 'HSL', 'RGB'])
const uuidVersions = new Set(['v4', 'v6', 'v7'])
const uuidFormatKeys = ['braces', 'hyphens', 'quotes', 'uppercase'] as const

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every(key => actual.includes(key))
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\0\r\n]/u.test(value) }
function boundedText(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max && !/[\0\r\n]/u.test(value) }
function number(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max }
function bool(value: unknown): value is boolean { return typeof value === 'boolean' }
function parseFormat(value: unknown): LauncherUuidFormat {
  if (!record(value) || !exact(value, uuidFormatKeys) || uuidFormatKeys.some(key => !bool(value[key]))) throw new Error('Invalid local UUID format')
  return Object.freeze({ braces: value.braces as boolean, hyphens: value.hyphens as boolean, quotes: value.quotes as boolean, uppercase: value.uppercase as boolean })
}
function parseFormats(value: unknown): readonly LauncherUuidFormat[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error('Invalid local UUID format list')
  return Object.freeze(value.map(parseFormat))
}
function freeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child)
  return Object.freeze(value)
}

export function parseLauncherLocalExtensionSettings(value: unknown): LauncherLocalExtensionSettings {
  if (!record(value) || !exact(value, LAUNCHER_LOCAL_EXTENSION_IDS)) throw new Error('Invalid local extension settings')
  const base64 = value.Base64Conversion
  if (!record(base64) || !exact(base64, ['decodePrefix', 'encodeDecodePrefix', 'encodePrefix']) || !text(base64.decodePrefix, 64) || !text(base64.encodeDecodePrefix, 64) || !text(base64.encodePrefix, 64)) throw new Error('Invalid Base64 settings')
  const calculator = value.Calculator
  if (!record(calculator) || !exact(calculator, ['argumentSeparator', 'decimalSeparator', 'precision']) || !text(calculator.argumentSeparator, 1) || !text(calculator.decimalSeparator, 1) || !number(calculator.precision, 0, 64)) throw new Error('Invalid calculator settings')
  const color = value.ColorConverter
  if (!record(color) || !exact(color, ['formats']) || !Array.isArray(color.formats) || color.formats.length > 3 || new Set(color.formats).size !== color.formats.length || color.formats.some(format => typeof format !== 'string' || !colorFormats.has(format))) throw new Error('Invalid color settings')
  const password = value.PasswordGenerator
  const passwordKeys = ['beginWithALetter', 'command', 'includeLowercaseCharacters', 'includeNumbers', 'includeSymbols', 'includeUppercaseCharacters', 'noDuplicateCharacters', 'noSequentialCharacters', 'noSimilarCharacters', 'passwordLength', 'quantity', 'symbols']
  if (!record(password) || !exact(password, passwordKeys) || !text(password.command, 64) || !boundedText(password.symbols, 256) || !number(password.quantity, 1, 50) || !number(password.passwordLength, 1, 128) || passwordKeys.filter(key => key !== 'command' && key !== 'passwordLength' && key !== 'quantity' && key !== 'symbols').some(key => !bool(password[key]))) throw new Error('Invalid password settings')
  const quick = value.QuickFormatter
  const quickKeys = ['command', 'enableDeepFormatting', 'enableJson', 'enableStackTrace', 'enableXml']
  if (!record(quick) || !exact(quick, quickKeys) || !text(quick.command, 64) || quickKeys.slice(1).some(key => !bool(quick[key]))) throw new Error('Invalid formatter settings')
  const rowland = value.RowlandTextEditor
  if (!record(rowland) || !exact(rowland, ['columnSeparator', 'rowSeparator']) || typeof rowland.columnSeparator !== 'string' || rowland.columnSeparator.length > 32 || /[\0\r\n]/u.test(rowland.columnSeparator) || typeof rowland.rowSeparator !== 'string' || rowland.rowSeparator.length > 32 || /[\0\r\n]/u.test(rowland.rowSeparator)) throw new Error('Invalid Rowland settings')
  const uuid = value.UuidGenerator
  const uuidKeys = ['braces', 'generatorFormat', 'hyphens', 'numberOfUuids', 'quotes', 'searchResultFormats', 'uppercase', 'uuidVersion', 'validateStrictly']
  if (!record(uuid) || !exact(uuid, uuidKeys) || !bool(uuid.braces) || !bool(uuid.hyphens) || !bool(uuid.quotes) || !bool(uuid.uppercase) || !bool(uuid.validateStrictly) || !number(uuid.numberOfUuids, 1, 100) || typeof uuid.uuidVersion !== 'string' || !uuidVersions.has(uuid.uuidVersion) || !record(uuid.generatorFormat)) throw new Error('Invalid UUID settings')
  const result = {
    Base64Conversion: Object.freeze({ decodePrefix: base64.decodePrefix as string, encodeDecodePrefix: base64.encodeDecodePrefix as string, encodePrefix: base64.encodePrefix as string }),
    Calculator: Object.freeze({ argumentSeparator: calculator.argumentSeparator as string, decimalSeparator: calculator.decimalSeparator as string, precision: calculator.precision as number }),
    ColorConverter: Object.freeze({ formats: Object.freeze([...(color.formats as string[])]) as readonly ('HEX' | 'HSL' | 'RGB')[] }),
    PasswordGenerator: Object.freeze({ beginWithALetter: password.beginWithALetter as boolean, command: password.command as string, includeLowercaseCharacters: password.includeLowercaseCharacters as boolean, includeNumbers: password.includeNumbers as boolean, includeSymbols: password.includeSymbols as boolean, includeUppercaseCharacters: password.includeUppercaseCharacters as boolean, noDuplicateCharacters: password.noDuplicateCharacters as boolean, noSequentialCharacters: password.noSequentialCharacters as boolean, noSimilarCharacters: password.noSimilarCharacters as boolean, passwordLength: password.passwordLength as number, quantity: password.quantity as number, symbols: password.symbols as string }),
    QuickFormatter: Object.freeze({ command: quick.command as string, enableDeepFormatting: quick.enableDeepFormatting as boolean, enableJson: quick.enableJson as boolean, enableStackTrace: quick.enableStackTrace as boolean, enableXml: quick.enableXml as boolean }),
    RowlandTextEditor: Object.freeze({ columnSeparator: rowland.columnSeparator as string, rowSeparator: rowland.rowSeparator as string }),
    UuidGenerator: Object.freeze({ braces: uuid.braces as boolean, generatorFormat: parseFormat(uuid.generatorFormat), hyphens: uuid.hyphens as boolean, numberOfUuids: uuid.numberOfUuids as number, quotes: uuid.quotes as boolean, searchResultFormats: parseFormats(uuid.searchResultFormats), uppercase: uuid.uppercase as boolean, uuidVersion: uuid.uuidVersion as 'v4' | 'v6' | 'v7', validateStrictly: uuid.validateStrictly as boolean }),
  }
  return freeze(result) as LauncherLocalExtensionSettings
}
