import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { LauncherActionRecord, LauncherInternalAction, LauncherInternalResultItem } from './launcher-actions.ts'
import {
  LAUNCHER_DEEPL_QUERY_PREFIX,
  LAUNCHER_NETWORK_EXTENSION_DEFAULTS,
  LAUNCHER_NETWORK_TOOL_INPUT_LENGTH,
  LAUNCHER_NETWORK_EXTENSION_IDS,
  LAUNCHER_WEB_SEARCH_QUERY_PREFIX,
  type LauncherNetworkCustomSearchEngine,
  type LauncherNetworkExtensionId,
} from './launcher-network-extension-config.ts'
import { isLauncherRendererSettingValue } from './launcher-settings-contract.ts'

export {
  LAUNCHER_DEEPL_QUERY_PREFIX,
  LAUNCHER_NETWORK_EXTENSION_DEFAULTS,
  LAUNCHER_NETWORK_EXTENSION_IDS,
  LAUNCHER_WEB_SEARCH_QUERY_PREFIX,
} from './launcher-network-extension-config.ts'

export type LauncherNetworkFetch = (url: string, init?: RequestInit) => Promise<Response>
export type LauncherNetworkResolveAddresses = (hostname: string) => Promise<readonly string[]>

type InstantResult = Readonly<{
  after: readonly LauncherInternalResultItem[]
  before: readonly LauncherInternalResultItem[]
  lastError?: string
}>

export type LauncherNetworkOptions = Readonly<{
  copyText: (text: string) => Promise<void> | void
  enabledExtensionIds: () => readonly string[]
  fetch: LauncherNetworkFetch
  getSetting: <T>(key: string, fallback: T) => T
  onProviderError?: (extensionId: LauncherNetworkExtensionId, error: Error) => void
  openExternal: (url: string) => Promise<void> | void
  requestTimeoutMs?: number
  resolveAddresses?: LauncherNetworkResolveAddresses
}>

type NetworkAction = Readonly<{
  extensionId: LauncherNetworkExtensionId
  kind: 'copy' | 'url'
  generation: number
  value: string
  query?: string
  customEngineId?: string
  engine?: 'DuckDuckGo' | 'Google'
  locale?: string
  settingsDigest: string
}>

type CurrencyRates = Readonly<Record<string, number>>

const MAX_RESPONSE_BYTES = 1_048_576
const MAX_SUGGESTIONS = 10
const MAX_TRANSLATIONS = 20
const MAX_TRANSLATION_TEXT = 10_000
const MAX_RATE_ENTRIES = 2_048
const MAX_URL_LENGTH = 4_096
const MAX_REQUEST_BODY_BYTES = 16 * 1_024
const MAX_CURRENCY_AMOUNT = 1e15
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const MAX_REQUEST_TIMEOUT_MS = 60_000
const CURRENCY_CODE = /^[a-z0-9.]{2,16}$/u
const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/u
const HANDLERS = Object.freeze({
  copy: 'copy-network-result',
  invoke: 'open-network-extension',
  open: 'open-network-url',
})
const SOURCE_LANGUAGES = new Set([
  'Auto', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO',
  'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH',
])
const TARGET_LANGUAGES = new Set([
  'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA',
  'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH',
])
const WEB_LOCALE_MAP = new Map<string, string>([
  ['de-CH', 'ch-de'],
  ['en-US', 'us-en'],
  ['ja-JP', 'jp-jp'],
  ['ko-KR', 'kr-kr'],
])
const SUPPORTED_WEB_LOCALES = new Set(['en-US', 'de-CH', 'fr-FR', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW'])

function emptyResult(lastError?: string): InstantResult {
  return Object.freeze({
    after: Object.freeze([]),
    before: Object.freeze([]),
    ...(lastError === undefined ? null : { lastError }),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function providerErrorMessage(extensionId: LauncherNetworkExtensionId, reason?: unknown): string {
  if (extensionId === 'DeeplTranslator' && reason instanceof Error && reason.message === 'DeepL API key is not configured') {
    return 'DeepL API key is not configured.'
  }
  if (extensionId === 'CurrencyConversion') return 'Currency Conversion is unavailable.'
  if (extensionId === 'CustomWebSearch') return 'Custom Web Search is unavailable.'
  if (extensionId === 'DeeplTranslator') return 'DeepL Translator is unavailable.'
  return 'Web Search is unavailable.'
}

function ipv4Parts(value: string): readonly [number, number, number, number] | undefined {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/u.test(part))) return undefined
  const numbers = parts.map(Number)
  if (numbers.some(part => !Number.isSafeInteger(part) || part < 0 || part > 255)) return undefined
  return numbers as [number, number, number, number]
}

function publicIpv4(parts: readonly [number, number, number, number]): boolean {
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && c === 0) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function ipv6Words(value: string): number[] | undefined {
  const address = value.toLocaleLowerCase('en-US').split('%', 1)[0] ?? ''
  if (address.length === 0 || value.includes('%')) return undefined
  const halves = address.split('::')
  if (halves.length > 2) return undefined
  const parse = (part: string): number[] | undefined => {
    if (part.length === 0) return []
    const pieces = part.split(':')
    const output: number[] = []
    for (const piece of pieces) {
      if (piece.includes('.')) {
        const ipv4 = ipv4Parts(piece)
        if (ipv4 === undefined) return undefined
        output.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3])
      } else {
        if (!/^[0-9a-f]{1,4}$/u.test(piece)) return undefined
        output.push(Number.parseInt(piece, 16))
      }
    }
    return output
  }
  const left = parse(halves[0] ?? '')
  const right = parse(halves.length === 2 ? halves[1] ?? '' : '')
  if (left === undefined || right === undefined) return undefined
  if (halves.length === 1) return left.length === 8 ? left : undefined
  const missing = 8 - left.length - right.length
  if (missing < 1) return undefined
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

/** Returns false for non-global addresses, including private, special, and mapped values. */
export function isPublicLauncherNetworkAddress(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.includes('%')) return false
  const kind = isIP(value)
  if (kind === 4) {
    const parts = ipv4Parts(value)
    return parts !== undefined && publicIpv4(parts)
  }
  if (kind !== 6) return false
  const words = ipv6Words(value)
  if (words === undefined) return false
  const mapped = words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff
  if (mapped) return publicIpv4([words[6]! >> 8, words[6]! & 255, words[7]! >> 8, words[7]! & 255])
  if (words.every(word => word === 0) || (words.slice(0, 7).every(word => word === 0) && words[7] === 1)) return false
  const first = words[0]!
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return false
  if (first === 0x2001 && (words[1] === 0x0db8 || words[1] === 0x0002)) return false
  return true
}

function isPublicLauncherHost(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase('en-US').replace(/\.$/u, '')
  if (host.length === 0 || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.includes(':') || host.includes('%')) return false
  const ipv4 = ipv4Parts(host)
  if (ipv4 !== undefined) return publicIpv4(ipv4)
  if (isIP(host) !== 0) return false
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(host)
}

/** Parse a URL allowed for a browser or fixed provider request. */
export function parseLauncherExternalUrl(value: string): URL {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH || /[\0\r\n]/u.test(value)) {
    throw new Error('Invalid external URL')
  }
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Invalid external URL') }
  if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0 || (url.port !== '' && url.port !== '443') || !isPublicLauncherHost(url.hostname)) {
    throw new Error('External URL is outside the HTTPS public-host policy')
  }
  return url
}

export function validateLauncherNetworkUrl(value: string): boolean {
  try { parseLauncherExternalUrl(value); return true } catch { return false }
}

async function defaultResolveAddresses(hostname: string): Promise<readonly string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true })
  return records.map(record => record.address)
}

async function assertPublicResolution(url: URL, resolveAddresses: LauncherNetworkResolveAddresses): Promise<void> {
  const addresses = await resolveAddresses(url.hostname)
  if (addresses.length === 0 || addresses.length > 32 || addresses.some(address => !isPublicLauncherNetworkAddress(address))) {
    throw new Error('Network host resolution is outside the public policy')
  }
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.status >= 300 && response.status < 400) throw new Error('Network redirects are not allowed')
  if (!response.ok) throw new Error('Network provider returned an unsuccessful response')
  const rawLength = response.headers.get('content-length')
  const declaredLength = rawLength === null ? undefined : Number(rawLength)
  if (declaredLength !== undefined && (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_RESPONSE_BYTES)) {
    throw new Error('Network response exceeded its byte limit')
  }
  const reader = response.body?.getReader()
  if (reader === undefined) throw new Error('Network provider returned no response body')
  const cancel = (): void => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Network request canceled')
      if (next.done) break
      const chunk = next.value
      if (chunk === undefined) continue
      bytes += chunk.byteLength
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('Network response exceeded its byte limit')
      }
      chunks.push(chunk)
    }
  } finally {
    signal.removeEventListener('abort', cancel)
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(body) } catch { throw new Error('Network provider returned invalid UTF-8') }
  try { return JSON.parse(text) as unknown } catch { throw new Error('Network provider returned invalid JSON') }
}

async function runTimed<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  const abort = (): void => controller.abort(parentSignal?.reason instanceof Error ? parentSignal.reason : new Error('Network request canceled'))
  if (parentSignal?.aborted) abort()
  else parentSignal?.addEventListener('abort', abort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        controller.signal.removeEventListener('abort', onAbort)
        callback()
      }
      const onAbort = (): void => finish(() => reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('Network request canceled')))
      if (controller.signal.aborted) { onAbort(); return }
      controller.signal.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => {
        controller.abort(new Error('Network request timed out'))
        finish(() => reject(new Error('Network request timed out')))
      }, timeoutMs)
      void Promise.resolve()
        .then(() => operation(controller.signal))
        .then(value => finish(() => resolve(value)), reason => finish(() => reject(reason)))
    })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    parentSignal?.removeEventListener('abort', abort)
  }
}

async function requestJson(
  options: LauncherNetworkOptions,
  urlValue: string,
  init: RequestInit | undefined,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
  expected: Readonly<{ origin: string; pathname: string }>,
): Promise<unknown> {
  return await runTimed(async signal => {
    const url = parseLauncherExternalUrl(urlValue)
    if (url.origin !== expected.origin || url.pathname !== expected.pathname) throw new Error('Network provider destination is not approved')
    await assertPublicResolution(url, options.resolveAddresses ?? defaultResolveAddresses)
    const body = typeof init?.body === 'string' ? init.body : undefined
    if (body !== undefined && new TextEncoder().encode(body).byteLength > MAX_REQUEST_BODY_BYTES) throw new Error('Network request body exceeded its byte limit')
    const response = await options.fetch(url.toString(), { ...init, redirect: 'manual', signal })
    return await readBoundedJson(response, signal)
  }, parentSignal, timeoutMs)
}

function setting<T>(options: LauncherNetworkOptions, extensionId: LauncherNetworkExtensionId, key: string, fallback: T): T {
  const fullKey = `extension[${extensionId}].${key}`
  const value = options.getSetting<unknown>(fullKey, fallback)
  return isLauncherRendererSettingValue(fullKey, value) ? value as T : fallback
}

function customEngines(options: LauncherNetworkOptions): readonly LauncherNetworkCustomSearchEngine[] {
  const fallback = [...LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CustomWebSearch.customSearchEngines]
  const raw = setting(options, 'CustomWebSearch', 'customSearchEngines', fallback)
  if (!Array.isArray(raw)) return fallback
  return raw.slice(0, 32).flatMap(value => {
    if (!isRecord(value) || Object.keys(value).length !== 5 || typeof value.id !== 'string' || typeof value.name !== 'string'
      || typeof value.prefix !== 'string' || typeof value.url !== 'string' || typeof value.encodeSearchTerm !== 'boolean') return []
    return [{ encodeSearchTerm: value.encodeSearchTerm, id: value.id, name: value.name, prefix: value.prefix, url: value.url }]
  })
}

function boundedNetworkText(value: string, maximum: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\0\r\n]/u.test(value)
}

function safeQuery(value: string): boolean {
  return boundedNetworkText(value, LAUNCHER_NETWORK_TOOL_INPUT_LENGTH)
}

function action(handlerKey: string, argument: string, description: string, hide = true): LauncherInternalAction {
  return Object.freeze({ argument, description, handlerKey, hideWindowAfterInvocation: hide, requiresConfirmation: false })
}

function actionKey(extensionId: LauncherNetworkExtensionId, kind: NetworkAction['kind'], value: string): string {
  return `${extensionId}\u0000${kind}\u0000${value}`
}

function stableDigest(value: unknown): string {
  try { return JSON.stringify(value) ?? '' } catch { return '' }
}

function secretFingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function webSearchUrl(engine: 'DuckDuckGo' | 'Google', term: string, locale: string): URL {
  if (engine === 'DuckDuckGo') {
    return parseLauncherExternalUrl(`https://duckduckgo.com/?q=${encodeURIComponent(term)}&kl=${WEB_LOCALE_MAP.get(locale) ?? 'us-en'}`)
  }
  return parseLauncherExternalUrl(`https://google.com/search?q=${encodeURIComponent(term)}&hl=${locale.toLocaleLowerCase('en-US')}`)
}

function webSuggestionUrl(engine: 'DuckDuckGo' | 'Google', term: string, locale: string): URL {
  if (engine === 'DuckDuckGo') return parseLauncherExternalUrl(`https://duckduckgo.com/ac/?q=${encodeURIComponent(term)}&kl=${WEB_LOCALE_MAP.get(locale) ?? 'us-en'}`)
  return parseLauncherExternalUrl(`https://www.google.com/complete/search?client=opera&q=${encodeURIComponent(term)}&hl=${locale.toLocaleLowerCase('en-US')}`)
}

function customSearchUrl(engine: LauncherNetworkCustomSearchEngine, searchTerm: string): URL {
  if (engine.url.indexOf('{{query}}') < 0 || engine.url.indexOf('{{query}}') !== engine.url.lastIndexOf('{{query}}')) throw new Error('Custom search URL must contain exactly one query placeholder')
  const sentinel = 'tockteam-query-placeholder'
  const template = parseLauncherExternalUrl(engine.url.replace('{{query}}', sentinel))
  if (template.hostname.includes(sentinel) || template.username || template.password || template.port) throw new Error('Custom search query cannot control the destination')
  const query = engine.encodeSearchTerm ? encodeURIComponent(searchTerm) : searchTerm
  const result = parseLauncherExternalUrl(engine.url.replace('{{query}}', query))
  if (result.origin !== template.origin) throw new Error('Custom search query changed the destination origin')
  return result
}

function currencyResult(
  options: LauncherNetworkOptions,
  searchTerm: string,
  rates: ReadonlyMap<string, CurrencyRates>,
  nextActions: Map<string, NetworkAction>,
  generation: number,
  digest: string,
): LauncherInternalResultItem[] {
  const parts = searchTerm.trim().split(/\s+/u)
  if (parts.length !== 2 && parts.length !== 4) return []
  const amount = Number(parts[0])
  const base = parts[1]?.toLocaleLowerCase('en-US') ?? ''
  const connector = parts[2]?.toLocaleLowerCase('en-US')
  const configuredTarget = setting(options, 'CurrencyConversion', 'defaultTargetCurrency', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CurrencyConversion.defaultTargetCurrency)
  const target = (parts.length === 4 ? parts[3] : configuredTarget)?.toLocaleLowerCase('en-US') ?? ''
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_CURRENCY_AMOUNT || !CURRENCY_CODE.test(base) || !CURRENCY_CODE.test(target)
    || (parts.length === 4 && connector !== 'in' && connector !== 'to')) return []
  const rate = rates.get(base)?.[target]
  const converted = typeof rate === 'number' && Number.isFinite(rate) ? amount * rate : NaN
  if (!Number.isFinite(converted)) return []
  const value = converted.toFixed(2)
  const current = Object.freeze({ extensionId: 'CurrencyConversion' as const, generation, kind: 'copy' as const, settingsDigest: digest, value })
  nextActions.set(actionKey('CurrencyConversion', 'copy', value), current)
  return [Object.freeze({
    defaultAction: action(HANDLERS.copy, value, 'Copy currency conversion', false),
    description: 'Currency Conversion',
    id: 'currency-conversion:instant-result',
    imageKey: 'currency-conversion',
    name: `${value} ${target.toUpperCase()}`,
    sourceExtension: 'CurrencyConversion',
  })]
}

function mapCustomResult(
  engine: LauncherNetworkCustomSearchEngine,
  query: string,
  url: URL,
  nextActions: Map<string, NetworkAction>,
  generation: number,
  digest: string,
): LauncherInternalResultItem {
  const value = url.toString()
  nextActions.set(actionKey('CustomWebSearch', 'url', value), Object.freeze({ customEngineId: engine.id, extensionId: 'CustomWebSearch', generation, kind: 'url', query, settingsDigest: digest, value }))
  return Object.freeze({
    defaultAction: action(HANDLERS.open, value, `Search ${engine.name}`),
    description: `Search in ${engine.name}`,
    id: `${engine.id}:instantResult`,
    imageKey: 'custom-web-search',
    name: engine.name,
    sourceExtension: 'CustomWebSearch',
  })
}

function mapWebResult(
  extensionId: 'WebSearch',
  name: string,
  resultDescription: string,
  actionDescription: string,
  url: URL,
  query: string,
  engine: 'DuckDuckGo' | 'Google',
  locale: string,
  nextActions: Map<string, NetworkAction>,
  generation: number,
  digest: string,
  id: string,
): LauncherInternalResultItem {
  const value = url.toString()
  nextActions.set(actionKey(extensionId, 'url', value), Object.freeze({ engine, extensionId, generation, kind: 'url', locale, query, settingsDigest: digest, value }))
  return Object.freeze({
    defaultAction: action(HANDLERS.open, value, actionDescription.slice(0, 512)),
    description: resultDescription,
    id,
    imageKey: engine === 'DuckDuckGo' ? 'web-search-duckduckgo' : 'web-search-google',
    name,
    sourceExtension: 'WebSearch',
  })
}

function currentWebSettings(options: LauncherNetworkOptions): Readonly<{ engine: 'DuckDuckGo' | 'Google'; locale: string }> {
  const engineValue = setting<'DuckDuckGo' | 'Google'>(options, 'WebSearch', 'searchEngine', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.WebSearch.searchEngine)
  const localeValue = setting<string>(options, 'WebSearch', 'locale', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.WebSearch.locale)
  const engine: 'DuckDuckGo' | 'Google' = engineValue === 'DuckDuckGo' ? 'DuckDuckGo' : 'Google'
  const locale = typeof localeValue === 'string' && LOCALE.test(localeValue) && SUPPORTED_WEB_LOCALES.has(localeValue) ? localeValue : 'en-US'
  return Object.freeze({ engine, locale })
}

export function createLauncherNetworkExtensions(options: LauncherNetworkOptions): Readonly<{
  close: () => Promise<void>
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  getLastError: () => string | undefined
  invalidate: () => void
  loadIndexedItems: (signal: AbortSignal) => Promise<readonly LauncherInternalResultItem[]>
  searchInstant: (searchTerm: string) => Promise<InstantResult>
}> {
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_REQUEST_TIMEOUT_MS) throw new Error('Invalid launcher network timeout')
  const enabled = (): ReadonlySet<string> => new Set(options.enabledExtensionIds())
  const rates = new Map<string, CurrencyRates>()
  const providerErrors = new Map<LauncherNetworkExtensionId, string>()
  const activeWork = new Set<Promise<unknown>>()
  const activeControllers = new Set<AbortController>()
  let activeInteractive: Readonly<{ controller: AbortController; generation: number }> | undefined
  let queryGeneration = 0
  let loadGeneration = 0
  let closed = false

  const getLastError = (): string | undefined => {
    for (const extensionId of LAUNCHER_NETWORK_EXTENSION_IDS) {
      const message = providerErrors.get(extensionId)
      if (message !== undefined) return message
    }
    return undefined
  }
  const report = (extensionId: LauncherNetworkExtensionId, reason?: unknown): void => {
    const message = providerErrorMessage(extensionId, reason)
    providerErrors.set(extensionId, message)
    options.onProviderError?.(extensionId, new Error(message))
  }
  const clearError = (extensionId: LauncherNetworkExtensionId): void => { providerErrors.delete(extensionId) }
  const track = <T>(work: Promise<T>): Promise<T> => {
    let tracked!: Promise<T>
    tracked = work.then(value => { activeWork.delete(tracked); return value }, reason => { activeWork.delete(tracked); throw reason })
    activeWork.add(tracked)
    return tracked
  }
  const clearInteractiveActions = (): void => {
    activeInteractive?.controller.abort(new Error('Network request was superseded'))
    activeInteractive = undefined
    currentActions = new Map()
  }
  const abortActiveControllers = (reason: Error): void => {
    for (const controller of activeControllers) controller.abort(reason)
  }
  const invalidate = (): void => {
    ++queryGeneration
    ++loadGeneration
    clearInteractiveActions()
    abortActiveControllers(new Error('Network provider was invalidated'))
    rates.clear()
    providerErrors.clear()
  }
  const settingsDigest = (extensionId: LauncherNetworkExtensionId): string => {
    if (extensionId === 'CustomWebSearch') return stableDigest(customEngines(options))
    if (extensionId === 'WebSearch') return stableDigest(currentWebSettings(options))
    if (extensionId === 'CurrencyConversion') return stableDigest({
      currencies: setting(options, 'CurrencyConversion', 'currencies', [...LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CurrencyConversion.currencies]),
      defaultTargetCurrency: setting(options, 'CurrencyConversion', 'defaultTargetCurrency', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CurrencyConversion.defaultTargetCurrency),
    })
    const apiKey = options.getSetting<string>('extension[DeeplTranslator].apiKey', '')
    return stableDigest({
      key: typeof apiKey === 'string' ? secretFingerprint(apiKey) : '',
      source: setting(options, 'DeeplTranslator', 'defaultSourceLanguage', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.DeeplTranslator.defaultSourceLanguage),
      target: setting(options, 'DeeplTranslator', 'defaultTargetLanguage', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.DeeplTranslator.defaultTargetLanguage),
    })
  }

  const loadCurrency = async (signal: AbortSignal, generation: number): Promise<void> => {
    const configured = setting(options, 'CurrencyConversion', 'currencies', [...LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CurrencyConversion.currencies])
    const currencies = [...new Set(configured)].filter(value => typeof value === 'string' && CURRENCY_CODE.test(value)).slice(0, 32)
    const staged = new Map<string, CurrencyRates>()
    let hadFailure = false
    const settled = await Promise.allSettled(currencies.map(async currency => {
      const data = await track(requestJson(
        options,
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${currency}.json`,
        undefined,
        signal,
        timeoutMs,
        { origin: 'https://cdn.jsdelivr.net', pathname: `/npm/@fawazahmed0/currency-api@latest/v1/currencies/${currency}.json` },
      ))
      if (!isRecord(data) || !isRecord(data[currency])) throw new Error('invalid currency rate map')
      const entries = Object.entries(data[currency]).slice(0, MAX_RATE_ENTRIES)
      const values: Record<string, number> = {}
      for (const [key, value] of entries) {
        if (!CURRENCY_CODE.test(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('invalid currency rate')
        values[key] = value
      }
      staged.set(currency, Object.freeze(values))
    }))
    if (signal.aborted || generation !== loadGeneration || closed) throw signal.reason instanceof Error ? signal.reason : new Error('Currency refresh canceled')
    for (const result of settled) if (result.status === 'rejected') {
      if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Currency refresh canceled')
      hadFailure = true
      report('CurrencyConversion', result.reason)
    }
    rates.clear()
    for (const [currency, value] of staged) rates.set(currency, value)
    if (!hadFailure) clearError('CurrencyConversion')
  }

  const loadIndexedItems = async (signal: AbortSignal): Promise<readonly LauncherInternalResultItem[]> => {
    if (closed) throw new Error('TockLauncher network provider is closed')
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Network load canceled')
    const generation = ++loadGeneration
    queryGeneration += 1
    clearInteractiveActions()
    abortActiveControllers(new Error('Network provider scan superseded'))
    rates.clear()
    if (enabled().has('CurrencyConversion')) await loadCurrency(signal, generation)
    if (closed || signal.aborted || generation !== loadGeneration) throw signal.reason instanceof Error ? signal.reason : new Error('Network load was superseded')
    const ids = enabled()
    const items: LauncherInternalResultItem[] = []
    if (ids.has('DeeplTranslator')) items.push(Object.freeze({
      defaultAction: action(HANDLERS.invoke, 'DeeplTranslator', 'Open DeepL Translator', false),
      description: 'Translate with DeepL', id: 'ueli-network:DeeplTranslator', imageKey: 'deepl-translator', name: 'DeepL Translator', sourceExtension: 'DeeplTranslator',
    }))
    if (ids.has('WebSearch')) {
      const web = currentWebSettings(options)
      items.push(Object.freeze({
        defaultAction: action(HANDLERS.invoke, 'WebSearch', `Search ${web.engine}`, false),
        description: 'Web Search', id: 'ueli-network:WebSearch', imageKey: web.engine === 'DuckDuckGo' ? 'web-search-duckduckgo' : 'web-search-google', name: web.engine, sourceExtension: 'WebSearch',
      }))
    }
    return Object.freeze(items)
  }

  const translate = async (term: string, signal: AbortSignal): Promise<LauncherInternalResultItem[]> => {
    const apiKey = options.getSetting<string>('extension[DeeplTranslator].apiKey', '')
    if (typeof apiKey !== 'string' || apiKey.length === 0 || apiKey.length > 8_192 || /[\0\r\n]/u.test(apiKey)) throw new Error('DeepL API key is not configured')
    if (!safeQuery(term)) throw new Error('DeepL text exceeds its input limit')
    const source = setting(options, 'DeeplTranslator', 'defaultSourceLanguage', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.DeeplTranslator.defaultSourceLanguage)
    const target = setting(options, 'DeeplTranslator', 'defaultTargetLanguage', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.DeeplTranslator.defaultTargetLanguage)
    if (!SOURCE_LANGUAGES.has(source) || !TARGET_LANGUAGES.has(target)) throw new Error('Invalid DeepL language setting')
    const body = JSON.stringify({ text: [term], target_lang: target, ...(source === 'Auto' ? null : { source_lang: source }) })
    const data = await track(requestJson(options, 'https://api-free.deepl.com/v2/translate', {
      body, headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' }, method: 'POST',
    }, signal, timeoutMs, { origin: 'https://api-free.deepl.com', pathname: '/v2/translate' }))
    if (!isRecord(data) || !Array.isArray(data.translations)) throw new Error('invalid DeepL response')
    const digest = settingsDigest('DeeplTranslator')
    const results: LauncherInternalResultItem[] = []
    const entries = data.translations.slice(0, MAX_TRANSLATIONS)
    for (const [index, entry] of entries.entries()) {
      if (!isRecord(entry) || typeof entry.text !== 'string' || entry.text.length === 0 || entry.text.length > MAX_TRANSLATION_TEXT || /[\0\r\n]/u.test(entry.text)) continue
      const item = Object.freeze({
        defaultAction: action(HANDLERS.copy, entry.text, 'Copy translation', false),
        description: 'DeepL Translation', id: `deepl-translation:${index}`, imageKey: 'deepl-translator', name: entry.text.slice(0, 512), sourceExtension: 'DeeplTranslator',
      })
      results.push(item)
    }
    return results
  }

  const webSuggestions = async (
    term: string,
    signal: AbortSignal,
    nextActions: Map<string, NetworkAction>,
    generation: number,
  ): Promise<LauncherInternalResultItem[]> => {
    if (!safeQuery(term)) throw new Error('Web search request exceeds its input limit')
    const web = currentWebSettings(options)
    const digest = settingsDigest('WebSearch')
    const search = mapWebResult('WebSearch', `Search "${term}"`, web.engine, `Search ${web.engine}`, webSearchUrl(web.engine, term, web.locale), term, web.engine, web.locale, nextActions, generation, digest, `search-${web.engine}`)
    const suggestionUrl = webSuggestionUrl(web.engine, term, web.locale)
    const data = await track(requestJson(options, suggestionUrl.toString(), undefined, signal, timeoutMs, {
      origin: suggestionUrl.origin, pathname: suggestionUrl.pathname,
    }))
    const suggestions: string[] = web.engine === 'Google'
      ? (Array.isArray(data) && Array.isArray(data[1]) ? data[1].filter((value): value is string => typeof value === 'string') : [])
      : (Array.isArray(data) ? data.flatMap(value => isRecord(value) && typeof value.phrase === 'string' ? [value.phrase] : []) : [])
    const results = [search]
    for (const [index, suggestion] of suggestions.slice(0, MAX_SUGGESTIONS).entries()) {
      if (suggestion.length === 0 || suggestion.length > 512 || /[\0\r\n]/u.test(suggestion)) continue
      results.push(mapWebResult('WebSearch', suggestion, 'Suggestion', `Search ${suggestion}`, webSearchUrl(web.engine, suggestion, web.locale), suggestion, web.engine, web.locale, nextActions, generation, digest, `web-suggestion:${index}`))
    }
    return results
  }

  const searchInstant = async (searchTerm: string): Promise<InstantResult> => {
    if (closed) return emptyResult()
    const generation = ++queryGeneration
    clearInteractiveActions()
    const controller = new AbortController()
    activeInteractive = Object.freeze({ controller, generation })
    activeControllers.add(controller)
    const nextActions = new Map<string, NetworkAction>()
    const before: LauncherInternalResultItem[] = []
    const after: LauncherInternalResultItem[] = []
    const ids = enabled()
    try {
      if (typeof searchTerm !== 'string' || /[\0\r\n]/u.test(searchTerm)) return emptyResult(getLastError())
      if (searchTerm.startsWith(LAUNCHER_DEEPL_QUERY_PREFIX) || searchTerm.startsWith(LAUNCHER_WEB_SEARCH_QUERY_PREFIX)) {
        const prefix = searchTerm.startsWith(LAUNCHER_DEEPL_QUERY_PREFIX) ? LAUNCHER_DEEPL_QUERY_PREFIX : LAUNCHER_WEB_SEARCH_QUERY_PREFIX
        if (searchTerm.length > prefix.length + LAUNCHER_NETWORK_TOOL_INPUT_LENGTH) return emptyResult(getLastError())
      } else if (searchTerm.length > 512) return emptyResult(getLastError())
      const currencyDigest = settingsDigest('CurrencyConversion')
      if (ids.has('CurrencyConversion')) before.push(...currencyResult(options, searchTerm, rates, nextActions, generation, currencyDigest))
      if (ids.has('CustomWebSearch')) {
        const digest = settingsDigest('CustomWebSearch')
        for (const engine of customEngines(options)) {
          if (!searchTerm.startsWith(engine.prefix)) continue
          const query = searchTerm.slice(engine.prefix.length).trim()
          if (!boundedNetworkText(query, 512)) continue
          try { after.push(mapCustomResult(engine, query, customSearchUrl(engine, query), nextActions, generation, digest)) }
          catch (reason) { report('CustomWebSearch', reason) }
        }
      }
      const isDeepL = searchTerm.startsWith(LAUNCHER_DEEPL_QUERY_PREFIX)
      const isWeb = searchTerm.startsWith(LAUNCHER_WEB_SEARCH_QUERY_PREFIX)
      if (ids.has('WebSearch') && !isDeepL && !isWeb && setting(options, 'WebSearch', 'showInstantSearchResult', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.WebSearch.showInstantSearchResult) && searchTerm.trim()) {
        const web = currentWebSettings(options)
        try {
          const digest = settingsDigest('WebSearch')
          const term = searchTerm.trim()
          after.push(mapWebResult('WebSearch', `Search "${term}"`, web.engine, `Search ${web.engine}`, webSearchUrl(web.engine, term, web.locale), term, web.engine, web.locale, nextActions, generation, digest, `search-${web.engine}`))
        } catch (reason) { report('WebSearch', reason) }
      }
      if (isDeepL || isWeb) {
        const extensionId = isDeepL ? 'DeeplTranslator' as const : 'WebSearch' as const
        const term = searchTerm.slice((isDeepL ? LAUNCHER_DEEPL_QUERY_PREFIX : LAUNCHER_WEB_SEARCH_QUERY_PREFIX).length).trim()
        if (!ids.has(extensionId) || !safeQuery(term)) return emptyResult(getLastError())
        const results = extensionId === 'DeeplTranslator'
          ? await translate(term, controller.signal)
          : await webSuggestions(term, controller.signal, nextActions, generation)
        if (closed || activeInteractive?.controller !== controller || activeInteractive.generation !== generation || generation !== queryGeneration || controller.signal.aborted) return emptyResult()
        if (extensionId === 'DeeplTranslator') {
          const digest = settingsDigest('DeeplTranslator')
          for (const item of results) {
            const value = item.defaultAction.argument
            nextActions.set(actionKey(extensionId, 'copy', value), Object.freeze({ extensionId, generation, kind: 'copy', settingsDigest: digest, value }))
          }
          before.push(...results)
          clearError('DeeplTranslator')
        } else {
          after.push(...results)
          clearError('WebSearch')
        }
      }
      if (closed || activeInteractive?.controller !== controller || activeInteractive.generation !== generation || generation !== queryGeneration || controller.signal.aborted) return emptyResult()
      // Replace private action state only after the complete current query is accepted.
      currentActions = nextActions
      const lastError = getLastError()
      return Object.freeze({ before: Object.freeze(before), after: Object.freeze(after), ...(lastError === undefined ? null : { lastError }) })
    } catch (reason) {
      if (closed || activeInteractive?.controller !== controller || activeInteractive.generation !== generation || generation !== queryGeneration || controller.signal.aborted) return emptyResult()
      const extensionId = searchTerm.startsWith(LAUNCHER_DEEPL_QUERY_PREFIX) ? 'DeeplTranslator' : 'WebSearch'
      report(extensionId, reason)
      return emptyResult(getLastError())
    } finally {
      activeControllers.delete(controller)
      if (activeInteractive?.controller === controller) activeInteractive = undefined
    }
  }

  let currentActions = new Map<string, NetworkAction>()

  const executeAction = async (record: LauncherActionRecord): Promise<boolean> => {
    if (closed) throw new Error('TockLauncher network provider is closed')
    if (!LAUNCHER_NETWORK_EXTENSION_IDS.includes(record.sourceExtension as LauncherNetworkExtensionId)) return false
    const extensionId = record.sourceExtension as LauncherNetworkExtensionId
    if (!enabled().has(extensionId)) throw new Error('Network extension is disabled')
    if (record.handlerKey === HANDLERS.invoke) {
      if ((extensionId !== 'DeeplTranslator' && extensionId !== 'WebSearch') || record.argument !== extensionId) throw new Error('Invalid network extension invocation')
      return true
    }
    if (record.handlerKey !== HANDLERS.copy && record.handlerKey !== HANDLERS.open) throw new Error('Invalid network extension action')
    const kind = record.handlerKey === HANDLERS.copy ? 'copy' : 'url'
    const mapKey = actionKey(extensionId, kind, record.argument)
    const entry = currentActions.get(mapKey)
    if (entry === undefined || entry.extensionId !== extensionId || entry.generation !== queryGeneration) throw new Error('Network action is not from the current main-owned result set')
    if (record.handlerKey === HANDLERS.copy) {
      if (entry.kind !== 'copy' || entry.value !== record.argument || settingsDigest(extensionId) !== entry.settingsDigest) throw new Error('Network copy action is stale')
      if (currentActions.get(mapKey) !== entry || entry.generation !== queryGeneration) throw new Error('Network copy action is stale')
      await options.copyText(entry.value)
      return true
    }
    if (entry.kind !== 'url' || entry.value !== record.argument || entry.query === undefined) throw new Error('Network URL action is invalid')
    const controller = new AbortController()
    activeControllers.add(controller)
    const current = (): boolean => currentActions.get(mapKey) === entry && entry.generation === queryGeneration && !closed && !controller.signal.aborted
    try {
      let url: URL
      if (extensionId === 'CustomWebSearch') {
        const engine = customEngines(options).find(value => value.id === entry.customEngineId)
        if (engine === undefined || settingsDigest('CustomWebSearch') !== entry.settingsDigest) throw new Error('Custom web search action is stale')
        url = customSearchUrl(engine, entry.query)
      } else {
        const web = currentWebSettings(options)
        if (entry.engine !== web.engine || entry.locale !== web.locale || settingsDigest('WebSearch') !== entry.settingsDigest) throw new Error('Web search action is stale')
        url = webSearchUrl(web.engine, entry.query, web.locale)
      }
      if (url.toString() !== entry.value || !current()) throw new Error('Network URL action is stale')
      await runTimed(async signal => {
        await assertPublicResolution(url, options.resolveAddresses ?? defaultResolveAddresses)
        if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Network navigation canceled')
      }, controller.signal, timeoutMs)
      if (!current()) throw new Error('Network URL action is stale')
      await options.openExternal(url.toString())
      return true
    } finally {
      activeControllers.delete(controller)
    }
  }

  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    ++queryGeneration; ++loadGeneration
    clearInteractiveActions()
    abortActiveControllers(new Error('TockLauncher network provider is closed'))
    currentActions = new Map()
    // Network transports receive abort signals; uncooperative test/native promises are
    // abandoned after a small bounded drain and cannot publish because closed is fenced.
    const timer = new Promise<void>(resolve => setTimeout(resolve, 100))
    await Promise.race([Promise.allSettled([...activeWork]).then(() => undefined), timer])
  }

  return Object.freeze({ close, executeAction, getLastError, invalidate, loadIndexedItems, searchInstant })
}
