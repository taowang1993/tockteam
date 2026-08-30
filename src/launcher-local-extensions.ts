import { randomUUID } from 'node:crypto'
import Color from 'color'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { create, all } from 'mathjs'
import { v4 as uuidv4, v6 as uuidv6, v7 as uuidv7, validate as uuidValidate } from 'uuid'
import type { LauncherActionRecord, LauncherInternalAction, LauncherInternalResultItem } from './launcher-actions.ts'
import {
  LAUNCHER_LOCAL_EXTENSION_DEFAULTS,
  LAUNCHER_LOCAL_EXTENSION_IDS,
  LAUNCHER_PASSWORD_SYMBOLS,
  type LauncherLocalExtensionId,
} from './launcher-local-extension-config.ts'
import { isLauncherRendererSettingValue } from './launcher-settings-contract.ts'
import { LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS } from './launcher-local-extension-assets.ts'

export { LAUNCHER_LOCAL_EXTENSION_DEFAULTS, LAUNCHER_LOCAL_EXTENSION_IDS } from './launcher-local-extension-config.ts'

export const LAUNCHER_LOCAL_ACTION_HANDLERS = Object.freeze({
  copy: 'copy-local-extension-result',
  open: 'open-local-extension',
})

const MAX_OUTPUT_LENGTH = 16_384

type InstantResult = Readonly<{ after: readonly LauncherInternalResultItem[]; before: readonly LauncherInternalResultItem[] }>
type SearchOverride = (searchTerm: string) => InstantResult

type LocalExtensionOptions = Readonly<{
  copyText: (text: string, signal: AbortSignal) => Promise<void> | void
  enabledExtensionIds: () => readonly string[]
  getSetting: <T>(key: string, fallback: T) => T
  onProviderError?: (extensionId: LauncherLocalExtensionId, error: unknown) => void
  searchOverrides?: Partial<Record<LauncherLocalExtensionId, SearchOverride>>
}>

const emptyInstantResult = (): InstantResult => Object.freeze({ after: Object.freeze([]), before: Object.freeze([]) })
const localExtension = (value: string): value is LauncherLocalExtensionId => (LAUNCHER_LOCAL_EXTENSION_IDS as readonly string[]).includes(value)

export function resolveLauncherEnabledExtensionIds(value: unknown, fallback: readonly string[]): readonly string[] {
  return isLauncherRendererSettingValue('extensions.enabledExtensionIds', value)
    ? Object.freeze([...(value as string[])])
    : Object.freeze([...fallback])
}

function boundedOutput(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_OUTPUT_LENGTH
}

function copyAction(text: string): LauncherInternalAction {
  if (!boundedOutput(text)) throw new Error('Invalid local extension output')
  return Object.freeze({ argument: text, description: 'Copy result to clipboard', handlerKey: LAUNCHER_LOCAL_ACTION_HANDLERS.copy, hideWindowAfterInvocation: false, requiresConfirmation: false })
}

function openAction(id: LauncherLocalExtensionId, name: string): LauncherInternalAction {
  return Object.freeze({ argument: id, description: `Open ${name}`, handlerKey: LAUNCHER_LOCAL_ACTION_HANDLERS.open, hideWindowAfterInvocation: false, requiresConfirmation: false })
}

function resultItem(input: Readonly<{
  description: string
  details?: string
  id: string
  name: string
  output?: string
  sourceExtension: LauncherLocalExtensionId
}>): LauncherInternalResultItem {
  const output = input.output ?? input.name
  if (!boundedOutput(output)) throw new Error('Invalid local extension output')
  return Object.freeze({
    defaultAction: copyAction(output),
    description: input.description,
    ...(input.details === undefined ? {} : { details: input.details.slice(0, 8192) }),
    id: input.id,
    imageKey: LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS[input.sourceExtension],
    name: input.name.slice(0, 512),
    sourceExtension: input.sourceExtension,
  })
}

function setting<T>(options: LocalExtensionOptions, extensionId: LauncherLocalExtensionId, key: string, fallback: T): T {
  const fullKey = `extension[${extensionId}].${key}`
  const value = options.getSetting<unknown>(fullKey, fallback)
  return isLauncherRendererSettingValue(fullKey, value) ? value as T : fallback
}

function safeSeparator(value: string, fallback: string): string {
  return value.length === 1 && value !== '\\' ? value : fallback
}

const MAX_CALCULATOR_COLLECTION_ITEMS = 10_000
const CALCULATOR_COLLECTION_CALL = /\b(ones|zeros|identity|random|randomInt|range)\s*\(([^()]*)\)/giu
const CALCULATOR_UNBOUNDED_CALL = /\b(?:ones|zeros|identity|random|randomInt|range|reshape|resize|matrixFromFunction)\s*\(/giu
const CALCULATOR_DISALLOWED_CALL = /\b(?:bignumber|combinations|concat|eigs|factorial|fft|filter|forEach|ifft|kron|lusolve|map|matrixFromFunction|partitionSelect|permutations|reshape|resize|solveODE)\s*\(/iu

function numericArguments(value: string): number[] | undefined {
  const normalized = value.trim().replace(/^\[|\]$/gu, '')
  if (normalized.length === 0) return undefined
  const values = normalized.split(',').map(part => Number(part.trim()))
  return values.every(part => Number.isFinite(part) && part >= 0) ? values : undefined
}

export function isLauncherCalculatorExpressionBounded(expression: string): boolean {
  if (CALCULATOR_DISALLOWED_CALL.test(expression)) return false
  const calls = [...expression.matchAll(CALCULATOR_COLLECTION_CALL)]
  const callCount = [...expression.matchAll(CALCULATOR_UNBOUNDED_CALL)].length
  if (calls.length !== callCount) return false
  for (const call of calls) {
    const name = call[1]!
    const values = numericArguments(call[2]!)
    if (values === undefined) return false
    if (name === 'range') {
      const [start = 0, end, step = 1] = values
      if (end === undefined || step === 0 || Math.ceil(Math.abs(end - start) / Math.abs(step)) > MAX_CALCULATOR_COLLECTION_ITEMS) return false
    } else {
      const dimensions = name === 'identity' && values.length === 1 ? [values[0]!, values[0]!] : values
      if (dimensions.reduce((size, dimension) => size * dimension, 1) > MAX_CALCULATOR_COLLECTION_ITEMS) return false
    }
  }
  const rangeExpressions = [...expression.matchAll(/(-?\d+(?:\.\d+)?)\s*:\s*(?:(-?\d+(?:\.\d+)?)\s*:\s*)?(-?\d+(?:\.\d+)?)(?=\s*(?:[\],)]|$))/gu)]
  const colonCount = [...expression].filter(character => character === ':').length
  if (rangeExpressions.reduce((count, range) => count + (range[2] === undefined ? 1 : 2), 0) !== colonCount) return false
  for (const range of rangeExpressions) {
    const start = Number(range[1]); const step = range[2] === undefined ? 1 : Number(range[2]); const end = Number(range[3])
    if (step === 0 || Math.ceil(Math.abs(end - start) / Math.abs(step)) > MAX_CALCULATOR_COLLECTION_ITEMS) return false
  }
  const factorials = [...expression.matchAll(/(\d+(?:\.\d+)?)!/gu)]
  return factorials.length === [...expression].filter(character => character === '!').length
    && !factorials.some(match => Number(match[1]) > 10_000)
}

function calculate(expression: string, precision: number, decimalSeparator: string, argumentSeparator: string): string | undefined {
  if (expression.length === 0 || expression === 'version' || expression === 'i' || !isLauncherCalculatorExpressionBounded(expression)) return undefined
  const decimal = safeSeparator(decimalSeparator, '.')
  const argument = safeSeparator(argumentSeparator, ',')
  const normalized = expression.split(decimal).join('.').split(argument).join(',')
  try {
    const math = create(all as Parameters<typeof create>[0])
    const value = math.evaluate(normalized)
    if (value === undefined || typeof value === 'function' || `${value}` === expression) return undefined
    const kind = math.typeOf(value)
    if (kind === 'Unit' && (value as { value?: unknown }).value === null) return undefined
    if (kind === 'Function' || kind === 'string' || kind === 'boolean' || kind === 'undefined') return undefined
    const calculation = String(value)
    const match = calculation.match(/^([\d,.]+)(\s*)(.*)$/u)
    const rounded = match
      ? `${math.round(math.bignumber(match[1]), precision)}${match[2]}${match[3]}`
      : calculation
    return rounded.replace(/[.,]/gu, match => match === '.' ? decimalSeparator : argumentSeparator)
  } catch { return undefined }
}

function password(settings: Readonly<{
  beginWithALetter: boolean; includeLowercaseCharacters: boolean; includeNumbers: boolean; includeSymbols: boolean; includeUppercaseCharacters: boolean
  noDuplicateCharacters: boolean; noSequentialCharacters: boolean; noSimilarCharacters: boolean; passwordLength: number; symbols: string
}>): string {
  const letters = `${settings.includeUppercaseCharacters ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : ''}${settings.includeLowercaseCharacters ? 'abcdefghijklmnopqrstuvwxyz' : ''}`
  const allChars = `${letters}${settings.includeNumbers ? '0123456789' : ''}${settings.includeSymbols ? settings.symbols : ''}`
  const filter = settings.noSimilarCharacters ? /[01ilo|]/giu : /$^/u
  const complete = [...allChars.replace(filter, '')]
  const letterChars = [...letters.replace(filter, '')]
  if (complete.length === 0 || (settings.beginWithALetter && letterChars.length === 0)) throw new Error('Password settings require an available character set')
  if (settings.noDuplicateCharacters && new Set(complete).size < settings.passwordLength) throw new Error('Password length exceeds the unique character set')
  if (settings.noSequentialCharacters && complete.length === 1 && settings.passwordLength > 1) throw new Error('Password settings cannot avoid sequential characters')
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let available = complete
    let lettersAvailable = letterChars
    const output: string[] = []
    let previous = ''
    let failed = false
    for (let index = 0; index < settings.passwordLength; index += 1) {
      const source = index === 0 && settings.beginWithALetter ? lettersAvailable : available
      const previousCodePoint = previous.codePointAt(0)
      const candidates = source.filter(character => !settings.noSequentialCharacters || previousCodePoint === undefined || Math.abs(previousCodePoint - character.codePointAt(0)!) !== 1)
      if (candidates.length === 0) { failed = true; break }
      const random = new Uint32Array(1)
      globalThis.crypto.getRandomValues(random)
      const character = candidates[random[0]! % candidates.length]!
      output.push(character)
      previous = character
      if (settings.noDuplicateCharacters) {
        available = available.filter(candidate => candidate !== character)
        lettersAvailable = lettersAvailable.filter(candidate => candidate !== character)
      }
    }
    if (!failed && output.length === settings.passwordLength) return output.join('')
  }
  throw new Error('Password generator did not produce the configured length')
}

function xmlFormatter(): { parser: XMLParser; builder: XMLBuilder } {
  return {
    parser: new XMLParser({ ignoreAttributes: false, processEntities: true, preserveOrder: false }),
    builder: new XMLBuilder({ format: true, indentBy: '  ', ignoreAttributes: false, processEntities: true }),
  }
}

function unescapeXml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))).replace(/&amp;/g, '&')
}

function formatStack(text: string): string {
  const normalized = text.replace(/\\t/g, '  ').replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '  ').replace(/\s{2,}/g, '\n')
  const lines = normalized.split('\n')
  const output: string[] = []
  let blank = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { if (!blank) output.push(''); blank = true; continue }
    blank = false
    output.push(/^(at\s+|File\s+)/iu.test(trimmed) ? `  ${trimmed}` : trimmed)
  }
  return output.join('\n')
}

function deepJson(value: unknown): unknown {
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return typeof parsed === 'object' && parsed !== null ? deepJson(parsed) : value } catch { return value }
  }
  if (Array.isArray(value)) return value.map(deepJson)
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepJson(item)]))
  return value
}

function formatJson(text: string, deep: boolean): string {
  try { return JSON.stringify(deep ? deepJson(JSON.parse(text)) : JSON.parse(text), null, 2) } catch { return text }
}

function formatXml(text: string, deep: boolean): string {
  try {
    const { parser, builder } = xmlFormatter()
    const source = deep && /&(?:lt|gt|amp);/u.test(text) ? unescapeXml(text) : text
    return builder.build(deep ? deepXml(parser.parse(source), parser, true) : parser.parse(source)).trimEnd()
  } catch { return text }
}

function deepXml(value: unknown, parser: XMLParser, auto: boolean): unknown {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text.startsWith('<')) return auto ? formatStack(value) : value
    try { return deepXml(parser.parse(unescapeXml(value)), parser, auto) } catch { return value }
  }
  if (Array.isArray(value)) return value.map(item => deepXml(item, parser, auto))
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepXml(item, parser, auto)]))
  return value
}

function quickFormat(text: string, mode: 'auto' | 'json' | 'xml' | 'stack', deep: boolean): string {
  if (mode === 'json') return formatJson(text, deep)
  if (mode === 'xml') return formatXml(text, deep)
  if (mode === 'stack') return formatStack(text)
  const trimmed = text.trim()
  if (trimmed.startsWith('<')) { try { new XMLParser().parse(trimmed); return formatXml(trimmed, deep) } catch { return formatStack(trimmed) } }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) { try { JSON.parse(trimmed); return formatJson(trimmed, deep) } catch { return formatStack(trimmed) } }
  return formatStack(trimmed)
}

function uuidFormat(uuid: string, format: Readonly<{ braces: boolean; hyphens: boolean; quotes: boolean; uppercase: boolean }>, strict: boolean): string {
  if (strict ? !uuidValidate(uuid) : !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu.test(uuid)) throw new Error('Invalid UUID')
  let value = format.uppercase ? uuid.toUpperCase() : uuid
  if (!format.hyphens) value = value.replace(/-/g, '')
  if (format.braces) value = `{${value}}`
  if (format.quotes) value = `"${value}"`
  return value
}

function uuidReformat(uuid: string, format: Readonly<{ braces: boolean; hyphens: boolean; quotes: boolean; uppercase: boolean }>): string {
  let value = uuid.replace(/["{}-]/g, '')
  value = format.uppercase ? value.toUpperCase() : value.toLowerCase()
  if (format.hyphens) value = `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
  if (format.braces) value = `{${value}}`
  if (format.quotes) value = `"${value}"`
  return value
}

export function createLauncherLocalExtensions(options: LocalExtensionOptions): Readonly<{
  close: () => Promise<void>
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  getProviderErrors: () => ReadonlyMap<LauncherLocalExtensionId, string>
  invalidate: (reason?: string, preserveSignal?: AbortSignal) => void
  loadIndexedItems: () => Promise<readonly LauncherInternalResultItem[]>
  searchInstant: (searchTerm: string) => Promise<InstantResult>
  waitForIdle: () => Promise<void>
}> {
  const get = <T>(id: LauncherLocalExtensionId, key: string, fallback: T): T => setting(options, id, key, fallback)
  let closed = false
  let generation = 0
  const copyArguments = new Map<string, Readonly<{ generation: number; text: string }>>()
  const providerErrors = new Map<LauncherLocalExtensionId, string>()
  const reportProviderError = (extensionId: LauncherLocalExtensionId, reason: unknown): void => {
    providerErrors.set(extensionId, `${extensionId} is unavailable.`)
    options.onProviderError?.(extensionId, reason)
  }
  const clearProviderError = (extensionId: LauncherLocalExtensionId): void => { providerErrors.delete(extensionId) }
  const getProviderErrors = (): ReadonlyMap<LauncherLocalExtensionId, string> => new Map(providerErrors)
  const activeControllers = new Set<AbortController>()
  const activeWork = new Set<Promise<unknown>>()
  const track = <T>(work: () => Promise<T>): Promise<T> => {
    let tracked!: Promise<T>
    tracked = Promise.resolve().then(work).then(value => { activeWork.delete(tracked); return value }, reason => { activeWork.delete(tracked); throw reason })
    activeWork.add(tracked)
    return tracked
  }
  const abortAll = (reason: Error, preserveSignal?: AbortSignal): void => {
    for (const controller of activeControllers) {
      if (controller.signal !== preserveSignal) controller.abort(reason)
    }
  }
  const invalidate = (reason = 'TockLauncher local provider was invalidated', preserveSignal?: AbortSignal): void => {
    ++generation
    copyArguments.clear()
    providerErrors.clear()
    abortAll(new Error(reason), preserveSignal)
  }
  const waitForIdle = async (): Promise<void> => {
    const timer = new Promise<void>(resolve => setTimeout(resolve, 100))
    await Promise.race([Promise.allSettled([...activeWork]).then(() => undefined), timer])
  }
  const enabled = () => new Set(options.enabledExtensionIds().filter(localExtension))
  const searchers: Record<LauncherLocalExtensionId, SearchOverride> = {
    Base64Conversion: searchTerm => {
      const defaults = LAUNCHER_LOCAL_EXTENSION_DEFAULTS.Base64Conversion; const encode = get('Base64Conversion', 'encodePrefix', defaults.encodePrefix); const decode = get('Base64Conversion', 'decodePrefix', defaults.decodePrefix); const both = get('Base64Conversion', 'encodeDecodePrefix', defaults.encodeDecodePrefix); const lower = searchTerm.toLocaleLowerCase('en-US'); const encodeLower = encode.toLocaleLowerCase('en-US'); const decodeLower = decode.toLocaleLowerCase('en-US'); const bothLower = both.toLocaleLowerCase('en-US'); const values: Array<{ action: string; value: string }> = []
      if (lower.startsWith(`${encodeLower} `) && searchTerm.length > encode.length + 1) values.push({ action: 'Encoded', value: Buffer.from(searchTerm.slice(encode.length).trim(), 'utf8').toString('base64') })
      else if (lower.startsWith(`${decodeLower} `) && searchTerm.length > decode.length + 1) values.push({ action: 'Decoded', value: Buffer.from(searchTerm.slice(decode.length).trim(), 'base64').toString('utf8') })
      else if (lower.startsWith(`${bothLower} `) && searchTerm.length > both.length + 1) { const payload = searchTerm.slice(both.length).trim(); values.push({ action: 'Encoded', value: Buffer.from(payload, 'utf8').toString('base64') }, { action: 'Decoded', value: Buffer.from(payload, 'base64').toString('utf8') }) }
      return Object.freeze({ after: Object.freeze([]), before: Object.freeze(values.filter(item => boundedOutput(item.value)).map((item, index) => resultItem({ description: `${item.action} · Base64 Conversion`, id: `base64Conversion:instantResult-${index}`, name: item.value, sourceExtension: 'Base64Conversion' }))) })
    },
    Calculator: term => { const d = LAUNCHER_LOCAL_EXTENSION_DEFAULTS.Calculator; const value = calculate(term, get('Calculator', 'precision', d.precision), get('Calculator', 'decimalSeparator', d.decimalSeparator), get('Calculator', 'argumentSeparator', d.argumentSeparator)); return value === undefined || !boundedOutput(value) ? emptyInstantResult() : Object.freeze({ before: Object.freeze([]), after: Object.freeze([resultItem({ description: 'Calculation Result', id: 'calculator:instantResult', name: value, sourceExtension: 'Calculator' })]) }) },
    ColorConverter: term => { const formats = get('ColorConverter', 'formats', [...LAUNCHER_LOCAL_EXTENSION_DEFAULTS.ColorConverter.formats]); try { const color = Color(term); const values = [{ format: 'HEX', value: color.hex() }, { format: 'HSL', value: color.hsl().string() }, { format: 'RGB', value: color.rgb().string() }].filter(item => formats.includes(item.format as never)); return Object.freeze({ before: Object.freeze([]), after: Object.freeze(values.map(item => resultItem({ description: `${item.format} Color`, details: color.keyword(), id: `color-${item.value}-${item.format}`, name: item.value, sourceExtension: 'ColorConverter' }))) }) } catch { return emptyInstantResult() } },
    PasswordGenerator: term => { const d = LAUNCHER_LOCAL_EXTENSION_DEFAULTS.PasswordGenerator; const command = get('PasswordGenerator', 'command', d.command); if (term.toLocaleLowerCase('en-US') !== command.toLocaleLowerCase('en-US')) return emptyInstantResult(); const settings = { beginWithALetter: get('PasswordGenerator', 'beginWithALetter', d.beginWithALetter), includeLowercaseCharacters: get('PasswordGenerator', 'includeLowercaseCharacters', d.includeLowercaseCharacters), includeNumbers: get('PasswordGenerator', 'includeNumbers', d.includeNumbers), includeSymbols: get('PasswordGenerator', 'includeSymbols', d.includeSymbols), includeUppercaseCharacters: get('PasswordGenerator', 'includeUppercaseCharacters', d.includeUppercaseCharacters), noDuplicateCharacters: get('PasswordGenerator', 'noDuplicateCharacters', d.noDuplicateCharacters), noSequentialCharacters: get('PasswordGenerator', 'noSequentialCharacters', d.noSequentialCharacters), noSimilarCharacters: get('PasswordGenerator', 'noSimilarCharacters', d.noSimilarCharacters), passwordLength: get('PasswordGenerator', 'passwordLength', d.passwordLength), symbols: get('PasswordGenerator', 'symbols', d.symbols) }; const quantity = get('PasswordGenerator', 'quantity', d.quantity); return Object.freeze({ after: Object.freeze([]), before: Object.freeze(Array.from({ length: quantity }, (_, index) => { const value = password(settings); return resultItem({ description: 'Generated password', id: `passwordGenerator:instantResult-${index}`, name: value, sourceExtension: 'PasswordGenerator' }) })) }) },
    QuickFormatter: term => { const d = LAUNCHER_LOCAL_EXTENSION_DEFAULTS.QuickFormatter; const command = get('QuickFormatter', 'command', d.command); const lower = term.toLocaleLowerCase('en-US'); const commandLower = command.toLocaleLowerCase('en-US'); const deep = get('QuickFormatter', 'enableDeepFormatting', d.enableDeepFormatting); let value: string | undefined; if (get('QuickFormatter', 'enableStackTrace', d.enableStackTrace) && lower.startsWith(`${commandLower}st `) && term.length > command.length + 3) value = quickFormat(term.slice(command.length + 3).trim(), 'stack', deep); else if (get('QuickFormatter', 'enableJson', d.enableJson) && lower.startsWith(`${commandLower}j `) && term.length > command.length + 2) value = quickFormat(term.slice(command.length + 2).trim(), 'json', deep); else if (get('QuickFormatter', 'enableXml', d.enableXml) && lower.startsWith(`${commandLower}x `) && term.length > command.length + 2) value = quickFormat(term.slice(command.length + 2).trim(), 'xml', deep); else if (lower.startsWith(`${commandLower} `) && term.length > command.length + 1) value = quickFormat(term.slice(command.length + 1).trim(), 'auto', deep); return value === undefined || !boundedOutput(value) ? emptyInstantResult() : Object.freeze({ before: Object.freeze([resultItem({ description: 'Formatted text', id: 'quickFormatter:instantResult', name: value, sourceExtension: 'QuickFormatter' })]), after: Object.freeze([]) }) },
    RowlandTextEditor: () => emptyInstantResult(),
    UuidGenerator: term => { const d = LAUNCHER_LOCAL_EXTENSION_DEFAULTS.UuidGenerator; const formats = get('UuidGenerator', 'searchResultFormats', [...d.searchResultFormats]) as ReadonlyArray<Readonly<{ braces: boolean; hyphens: boolean; quotes: boolean; uppercase: boolean }>>; const strict = get('UuidGenerator', 'validateStrictly', d.validateStrictly); let candidate = term; const lower = candidate.toLocaleLowerCase('en-US'); if (lower.startsWith('uuid') || lower.startsWith('guid')) candidate = candidate.slice(4); candidate = candidate.trim(); const possible = uuidReformat(candidate, d.generatorFormat); let values: string[] = []; try { if (strict ? uuidValidate(possible) : /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu.test(possible)) values = formats.map(format => uuidFormat(possible, format, strict)); else if (lower === 'uuid' || lower === 'guid') { const version = get<string>('UuidGenerator', 'uuidVersion', d.uuidVersion); const generated = version === 'v6' ? uuidv6() : version === 'v7' ? uuidv7() : uuidv4(); values = formats.map(format => uuidReformat(generated, format)) } } catch { values = [] } return Object.freeze({ before: Object.freeze(values.filter(boundedOutput).map((value, index) => resultItem({ description: 'UUID / GUID', id: `uuidGenerator:instantResult-${index}`, name: value, sourceExtension: 'UuidGenerator' }))), after: Object.freeze([]) }) },
  }

    const loadIndexedItems = async (): Promise<readonly LauncherInternalResultItem[]> => {
    if (closed) throw new Error('TockLauncher local provider is closed')
    const catalog: ReadonlyArray<Readonly<{ description: string; extensionId: LauncherLocalExtensionId; name: string }>> = [
      { description: 'Encode or decode Base64', extensionId: 'Base64Conversion', name: 'Base64 Conversion' },
      { description: 'Format rows of text', extensionId: 'RowlandTextEditor', name: 'Rowland Text Editor' },
      { description: 'Open UUIDs / GUIDs Generator', extensionId: 'UuidGenerator', name: 'UUID / GUID Generator' },
    ]
    return Object.freeze(catalog.filter(item => enabled().has(item.extensionId)).map(item => Object.freeze({
      defaultAction: openAction(item.extensionId, item.name),
      description: item.description,
      id: `ueli-local:${item.extensionId}`,
      imageKey: LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS[item.extensionId],
      name: item.name,
      sourceExtension: item.extensionId,
    })))
  }

  const privateCopyArgument = (text: string, publicationGeneration: number): string => {
    let argument = `local-copy:${randomUUID()}`
    while (copyArguments.has(argument)) argument = `local-copy:${randomUUID()}`
    copyArguments.set(argument, Object.freeze({ generation: publicationGeneration, text }))
    return argument
  }
  const presentAction = (action: LauncherInternalAction, publicationGeneration: number): LauncherInternalAction => action.handlerKey !== LAUNCHER_LOCAL_ACTION_HANDLERS.copy
    ? action
    : Object.freeze({ ...action, argument: privateCopyArgument(action.argument, publicationGeneration) })
  const present = (item: LauncherInternalResultItem, publicationGeneration: number): LauncherInternalResultItem => Object.freeze({
    ...item,
    ...(item.additionalActions === undefined ? {} : { additionalActions: item.additionalActions.map(action => presentAction(action, publicationGeneration)) }),
    defaultAction: presentAction(item.defaultAction, publicationGeneration),
    name: item.name.slice(0, 512),
  })
  const searchInstant = async (term: string): Promise<InstantResult> => {
    if (closed) return emptyInstantResult()
    copyArguments.clear()
    const publicationGeneration = generation
    const before: LauncherInternalResultItem[] = []
    const after: LauncherInternalResultItem[] = []
    const active = enabled()
    for (const id of LAUNCHER_LOCAL_EXTENSION_IDS) {
      if (!active.has(id) || closed) continue
      try {
        const result = (options.searchOverrides?.[id] ?? searchers[id])(term)
        before.push(...result.before.map(item => present(item, publicationGeneration))); after.push(...result.after.map(item => present(item, publicationGeneration)))
        clearProviderError(id)
      } catch (error) { reportProviderError(id, error) }
    }
    return Object.freeze({ before: Object.freeze(before), after: Object.freeze(after) })
  }
  const executeAction = async (record: LauncherActionRecord): Promise<boolean> => {
    if (closed) throw new Error('TockLauncher local provider is closed')
    if (record.handlerKey === LAUNCHER_LOCAL_ACTION_HANDLERS.copy) {
      if (!localExtension(record.sourceExtension)) throw new Error('Invalid local extension action')
      const published = copyArguments.get(record.argument)
      if (published === undefined || published.generation !== generation) throw new Error('TockLauncher local action is stale')
      const controller = new AbortController()
      activeControllers.add(controller)
      try {
        await track(async () => {
          if (closed || controller.signal.aborted || generation !== published.generation || copyArguments.get(record.argument) !== published) throw new Error('TockLauncher local action was canceled')
          await options.copyText(published.text, controller.signal)
        })
        if (closed || controller.signal.aborted || generation !== published.generation || copyArguments.get(record.argument) !== published) throw new Error('TockLauncher local action was canceled')
        return true
      } finally { activeControllers.delete(controller) }
    }
    if (record.handlerKey === LAUNCHER_LOCAL_ACTION_HANDLERS.open) {
      if (!localExtension(record.argument) || record.argument !== record.sourceExtension) throw new Error('Invalid local extension action')
      return true
    }
    return false
  }
  const close = async (): Promise<void> => {
    if (closed) { await waitForIdle(); return }
    closed = true
    invalidate('TockLauncher local provider is closed')
    await waitForIdle()
  }
  return Object.freeze({ close, executeAction, getProviderErrors, invalidate, loadIndexedItems, searchInstant, waitForIdle })
}

export { LAUNCHER_LOCAL_EXTENSION_IDS as LAUNCHER_LOCAL_IDS, LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS as LOCAL_IMAGE_KEYS }
