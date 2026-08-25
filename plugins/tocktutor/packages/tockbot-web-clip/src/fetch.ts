import { Resolver } from 'node:dns/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { Readable } from 'node:stream'

export type WebFetchErrorCode =
  | 'aborted'
  | 'address'
  | 'body'
  | 'content-type'
  | 'encoding'
  | 'headers'
  | 'network'
  | 'redirect'
  | 'status'
  | 'text'
  | 'timeout'
  | 'url'

export class WebFetchError extends Error {
  readonly code: WebFetchErrorCode

  constructor(code: WebFetchErrorCode, message: string) {
    super(message)
    this.name = 'WebFetchError'
    this.code = code
  }
}

export interface PublicFetchLimits {
  connectTimeoutMs: number
  maxAddresses: number
  maxRedirects: number
  maxResponseBytes: number
  maxResponseHeadersBytes: number
  maxTextChars: number
  maxUrlBytes: number
  timeoutMs: number
}

export const defaultPublicFetchLimits: Readonly<PublicFetchLimits> = {
  connectTimeoutMs: 5_000,
  maxAddresses: 16,
  maxRedirects: 5,
  maxResponseBytes: 1_000_000,
  maxResponseHeadersBytes: 32_768,
  maxTextChars: 1_000_000,
  maxUrlBytes: 4096,
  timeoutMs: 15_000,
}

export const maximumPublicFetchLimits: Readonly<PublicFetchLimits> = {
  connectTimeoutMs: 30_000,
  maxAddresses: 64,
  maxRedirects: 10,
  maxResponseBytes: 10_000_000,
  maxResponseHeadersBytes: 65_536,
  maxTextChars: 2_000_000,
  maxUrlBytes: 4096,
  timeoutMs: 60_000,
}

export interface PublicAddress {
  address: string
}

export interface PublicFetchRequest {
  address: string
  connectTimeoutMs: number
  headers: Readonly<Record<string, string>>
  maxResponseHeadersBytes: number
  signal: AbortSignal
  url: string
}

export interface PublicTextResult {
  contentType: 'application/xhtml+xml' | 'text/html' | 'text/plain'
  text: string
  url: string
}

export interface FetchPublicTextOptions {
  limits?: Partial<PublicFetchLimits>
  lookup?: (hostname: string, signal: AbortSignal) => Promise<PublicAddress[]>
  request?: (request: PublicFetchRequest) => Promise<Response>
  signal?: AbortSignal
}

const utf8 = new TextEncoder()
const acceptedContentTypes = new Set<PublicTextResult['contentType']>([
  'application/xhtml+xml',
  'text/html',
  'text/plain',
])
const redirectStatuses = new Set([301, 302, 303, 307, 308])
const ipv4Blocks = new BlockList()
const mappedIpv4Blocks = new BlockList()
const ipv6Blocks = new BlockList()
const ipv4Ranges: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]
const ipv6Ranges: ReadonlyArray<readonly [string, number]> = [
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:1::1', 128],
  ['2001:1::2', 128],
  ['2001:2::', 48],
  ['2001:3::', 32],
  ['2001:4:112::', 48],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['2620:4f:8000::', 48],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
]

for (const [address, prefix] of ipv4Ranges) {
  ipv4Blocks.addSubnet(address, prefix, 'ipv4')
  mappedIpv4Blocks.addSubnet(`::ffff:${address}`, 96 + prefix, 'ipv6')
}
for (const [address, prefix] of ipv6Ranges) ipv6Blocks.addSubnet(address, prefix, 'ipv6')

function fail(code: WebFetchErrorCode, message: string): never {
  throw new WebFetchError(code, message)
}

function bareHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function isLocalHostname(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/u, '')
  return name === 'localhost'
    || name.endsWith('.localhost')
    || name.endsWith('.local')
    || name === 'home.arpa'
    || name.endsWith('.home.arpa')
}

export function normalizePublicHttpUrl(value: string, maxBytes = defaultPublicFetchLimits.maxUrlBytes): string {
  if (!value || /[\u0000-\u001f\u007f]/u.test(value) || utf8.encode(value).byteLength > maxBytes) {
    return fail('url', 'The URL is malformed or too long.')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return fail('url', 'The URL is malformed or too long.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('url', 'Only HTTP and HTTPS URLs are allowed.')
  if (url.username || url.password) return fail('url', 'URLs cannot include credentials.')
  if (!url.hostname || isLocalHostname(url.hostname)) return fail('url', 'The URL must name a public host.')
  url.hash = ''
  const normalized = url.toString()
  if (utf8.encode(normalized).byteLength > maxBytes) return fail('url', 'The URL is malformed or too long.')
  return normalized
}

export function isPublicAddress(rawAddress: string): boolean {
  const address = bareHostname(rawAddress)
  const family = isIP(address)
  if (family === 4) return !ipv4Blocks.check(address, 'ipv4')
  if (family === 6) {
    return !ipv6Blocks.check(address, 'ipv6') && !mappedIpv4Blocks.check(address, 'ipv6')
  }
  return false
}

export function createPinnedLookup(rawAddress: string): LookupFunction {
  const address = bareHostname(rawAddress)
  const family = isIP(address)
  if (family !== 4 && family !== 6) return fail('address', 'A validated IP address is required.')

  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }])
    else callback(null, address, family)
  }
}

async function defaultLookup(hostname: string, signal: AbortSignal): Promise<PublicAddress[]> {
  const address = bareHostname(hostname)
  if (isIP(address)) return [{ address }]

  const resolver = new Resolver()
  const cancel = () => resolver.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const results = await Promise.allSettled([
      resolver.resolve4(address),
      resolver.resolve6(address),
    ])
    return results.flatMap(result => result.status === 'fulfilled'
      ? result.value.map(value => ({ address: value }))
      : [])
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

function incomingHeaders(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const item of value) result.append(name, item)
    else if (value !== undefined) result.set(name, value)
  }
  return result
}

async function defaultRequest(input: PublicFetchRequest): Promise<Response> {
  const url = new URL(input.url)
  const request = url.protocol === 'https:' ? https.request : http.request
  return await new Promise<Response>((resolve, reject) => {
    const outgoing = request(url, {
      agent: false,
      headers: input.headers,
      lookup: createPinnedLookup(input.address),
      maxHeaderSize: input.maxResponseHeadersBytes,
      method: 'GET',
      signal: input.signal,
    }, incoming => {
      const status = incoming.statusCode ?? 502
      const body = status === 204 || status === 304
        ? null
        : Readable.toWeb(incoming) as ReadableStream<Uint8Array>
      resolve(new Response(body, {
        headers: incomingHeaders(incoming.headers),
        status,
        ...(incoming.statusMessage === undefined ? {} : { statusText: incoming.statusMessage }),
      }))
    })
    outgoing.once('socket', socket => {
      if (!socket.connecting) return
      const timer = setTimeout(() => {
        outgoing.destroy(new WebFetchError('timeout', 'The connection timed out.'))
      }, input.connectTimeoutMs)
      const clear = () => { clearTimeout(timer) }
      socket.once('connect', clear)
      socket.once('close', clear)
    })
    outgoing.once('error', reject)
    outgoing.end()
  })
}

function checkedLimits(overrides: Partial<PublicFetchLimits> | undefined): PublicFetchLimits {
  const limits = { ...defaultPublicFetchLimits, ...overrides }
  for (const key of Object.keys(maximumPublicFetchLimits) as Array<keyof PublicFetchLimits>) {
    const value = limits[key]
    const minimum = key === 'maxRedirects' ? 0 : 1
    if (!Number.isSafeInteger(value) || value < minimum || value > maximumPublicFetchLimits[key]) {
      return fail('network', 'Fetch limits are invalid.')
    }
  }
  return limits
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason
  let abort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    return await Promise.race([promise, aborted])
  } finally {
    if (abort) signal.removeEventListener('abort', abort)
  }
}

async function resolvePublicAddress(
  url: URL,
  lookup: NonNullable<FetchPublicTextOptions['lookup']>,
  limits: PublicFetchLimits,
  signal: AbortSignal,
): Promise<string> {
  const hostname = bareHostname(url.hostname)
  let addresses: PublicAddress[]
  try {
    addresses = isIP(hostname) ? [{ address: hostname }] : await abortable(lookup(hostname, signal), signal)
  } catch (error) {
    if (signal.aborted) throw error
    return fail('address', 'The public host could not be resolved.')
  }
  if (addresses.length === 0 || addresses.length > limits.maxAddresses || addresses.some(result => !isPublicAddress(result.address))) {
    return fail('address', 'Only public HTTP(S) addresses are allowed.')
  }
  return addresses[0]?.address ?? fail('address', 'Only public HTTP(S) addresses are allowed.')
}

function responseHeaderBytes(headers: Headers): number {
  let bytes = 2
  for (const [name, value] of headers) bytes += utf8.encode(`${name}: ${value}\r\n`).byteLength
  return bytes
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

function contentType(response: Response): PublicTextResult['contentType'] {
  const value = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (!value || !acceptedContentTypes.has(value as PublicTextResult['contentType'])) {
    return fail('content-type', 'The response must contain HTML or plain text.')
  }
  return value as PublicTextResult['contentType']
}

async function readText(response: Response, limits: PublicFetchLimits, signal: AbortSignal): Promise<string> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > limits.maxResponseBytes) {
      await discard(response)
      return fail('body', 'The response body is too large.')
    }
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal)
      if (done) break
      if (value === undefined) continue
      bytes += value.byteLength
      if (bytes > limits.maxResponseBytes) return fail('body', 'The response body is too large.')
      text += decoder.decode(value, { stream: true })
      if (text.length > limits.maxTextChars) return fail('text', 'The decoded response text is too large.')
    }
    text += decoder.decode()
    if (text.length > limits.maxTextChars) return fail('text', 'The decoded response text is too large.')
    return text
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  }
}

function mappedFailure(error: unknown, timedOut: boolean, callerAborted: boolean): WebFetchError {
  if (error instanceof WebFetchError) return error
  if (callerAborted) return new WebFetchError('aborted', 'The request was cancelled.')
  if (timedOut) return new WebFetchError('timeout', 'The request timed out.')
  return new WebFetchError('network', 'The public request failed.')
}

export async function fetchPublicText(value: string, options: FetchPublicTextOptions = {}): Promise<PublicTextResult> {
  const limits = checkedLimits(options.limits)
  let currentUrl = normalizePublicHttpUrl(value, limits.maxUrlBytes)
  const controller = new AbortController()
  let timedOut = false
  let callerAborted = options.signal?.aborted ?? false
  const abortFromCaller = () => {
    callerAborted = true
    controller.abort(options.signal?.reason)
  }
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  if (callerAborted) controller.abort(options.signal?.reason)
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, limits.timeoutMs)

  try {
    for (let redirects = 0; ; redirects += 1) {
      if (controller.signal.aborted) throw controller.signal.reason
      const url = new URL(currentUrl)
      const address = await resolvePublicAddress(url, options.lookup ?? defaultLookup, limits, controller.signal)
      if (controller.signal.aborted) throw controller.signal.reason
      const responsePromise = (options.request ?? defaultRequest)({
        address,
        connectTimeoutMs: limits.connectTimeoutMs,
        headers: {
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
          'accept-encoding': 'identity',
        },
        maxResponseHeadersBytes: limits.maxResponseHeadersBytes,
        signal: controller.signal,
        url: currentUrl,
      })
      void responsePromise.then(async response => {
        if (controller.signal.aborted) await discard(response)
      }, () => undefined)
      const response = await abortable(responsePromise, controller.signal)

      if (responseHeaderBytes(response.headers) > limits.maxResponseHeadersBytes) {
        await discard(response)
        return fail('headers', 'The response headers are too large.')
      }
      if (redirectStatuses.has(response.status)) {
        const location = response.headers.get('location')
        await discard(response)
        if (!location || redirects >= limits.maxRedirects) return fail('redirect', 'The redirect chain is invalid or too long.')
        currentUrl = normalizePublicHttpUrl(new URL(location, currentUrl).toString(), limits.maxUrlBytes)
        continue
      }
      if (!response.ok) {
        await discard(response)
        return fail('status', 'The public server returned an unsuccessful status.')
      }
      const encoding = response.headers.get('content-encoding')?.trim().toLowerCase()
      if (encoding && encoding !== 'identity') {
        await discard(response)
        return fail('encoding', 'Compressed response bodies are not accepted.')
      }
      let type: PublicTextResult['contentType']
      try {
        type = contentType(response)
      } catch (error) {
        await discard(response)
        throw error
      }
      const text = await readText(response, limits, controller.signal)
      return { contentType: type, text, url: currentUrl }
    }
  } catch (error) {
    throw mappedFailure(error, timedOut, callerAborted)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
