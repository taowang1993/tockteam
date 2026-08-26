import { isAbsolute, relative, resolve } from 'node:path'
import type {
  DesktopProtocolVault,
  DesktopProtocolVaultTarget,
  TockTutorBrowserProtocolRequest,
  TockTutorProtocolRequest,
} from './host-contract.ts'

export type { DesktopProtocolVault, DesktopProtocolVaultTarget, TockTutorBrowserProtocolRequest, TockTutorProtocolRequest } from './host-contract.ts'

export interface ResolvedTockTutorProtocolRequest {
  request: TockTutorBrowserProtocolRequest
}

export const MAX_PROTOCOL_URI_LENGTH = 16_384
export const MAX_PROTOCOL_VALUE_LENGTH = 4_096
export const MAX_PROTOCOL_CALLBACK_LENGTH = 4_096
export const MAX_NOTES_POP_OUT_PATH_LENGTH = 260
export const MAX_EXPORT_RESOURCE_URL_LENGTH = 4_096

const PROTOCOL_SCHEME = 'tocktutor:'
const PROTOCOL_ACTIONS = new Set(['open', 'new', 'daily', 'unique', 'search', 'choose-vault'])
const PROTOCOL_KEYS = new Set([
  'append',
  'clipboard',
  'content',
  'file',
  'name',
  'overwrite',
  'paneType',
  'path',
  'prepend',
  'query',
  'silent',
  'vault',
  'x-error',
  'x-success',
])
const EXPORT_DATA_ASSET_PATTERN = /^data:(?:(?:image|audio|video|font)\/|application\/pdf(?:[;,]|$))/iu

type ProtocolAction = 'open' | 'new' | 'daily' | 'unique' | 'search' | 'choose-vault'
type PaneType = 'tab' | 'split' | 'window'
type ExistingFilePolicy = 'prepend' | 'append' | 'overwrite'

export type NativeFailureStatus = 'cancelled' | 'denied' | 'stale' | 'unavailable' | 'invalid'

export type NativeFailure = {
  status: NativeFailureStatus
  message?: string
}

export type TrustedWindowState = {
  surfaceKind: 'desktop' | 'web' | 'tui'
  role: 'main' | 'auxiliary' | 'popout'
  origin: string
  trustedOrigin: string
  destroyed: boolean
  mainFrame: boolean
}

export type NativeRequestIdentity = {
  requestId: string
  windowId: string
  sessionId: string
  vaultId: string | null
  vaultGeneration: number
}

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function bounded(value: string | null | undefined): value is string {
  return value != null && value.length <= MAX_PROTOCOL_VALUE_LENGTH
}

function safeVaultRef(value: string | null | undefined): value is string {
  return Boolean(value)
    && bounded(value)
    && (isAbsolute(value) ? !/[\u0000-\u001f\u007f]/u.test(value) : !/[\\/\u0000-\u001f\u007f]/u.test(value))
}

function safeRelativePath(value: string | undefined): value is string {
  if (!value || value.length > MAX_PROTOCOL_VALUE_LENGTH || value.startsWith('/') || value.includes('\\') || value.includes('\u0000')) return false
  const segments = value.split('/')
  return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..' && !/[\u0000-\u001f\u007f]/u.test(segment))
}

function safeSingleName(value: string | undefined): value is string {
  return safeRelativePath(value) && !value.includes('/')
}

function callback(value: string | null): string | null | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_PROTOCOL_CALLBACK_LENGTH) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'https:') return trimmed
    return parsed.protocol === PROTOCOL_SCHEME
      && !parsed.searchParams.has('x-success')
      && !parsed.searchParams.has('x-error')
      ? trimmed
      : null
  } catch {
    return null
  }
}

function queryEntries(url: URL): Map<string, string> | null {
  const entries = new Map<string, string>()
  let invalid = false
  url.searchParams.forEach((value, key) => {
    if (!PROTOCOL_KEYS.has(key) || entries.has(key)) invalid = true
    else entries.set(key, value)
  })
  return invalid ? null : entries
}

function shorthand(raw: string): TockTutorProtocolRequest | null | undefined {
  const match = /^tocktutor:\/\/([^/?#]*)(\/[^?#]*)?$/iu.exec(raw)
  if (!match) return undefined
  const authority = match[1] ?? ''
  const rawPath = match[2]
  if (authority === '' && rawPath !== undefined) {
    const path = decoded(rawPath)
    return path !== null && isAbsolute(path) && bounded(path) && !/[\\\u0000-\u001f\u007f]/u.test(path)
      ? { action: 'open', path }
      : null
  }
  if (authority.toLowerCase() !== 'vault' || !rawPath) return null
  const segments = rawPath.slice(1).split('/')
  const vault = decoded(segments.shift() ?? '')
  if (!safeVaultRef(vault)) return null
  if (segments.length === 0) return { action: 'open', vault }
  const file = decoded(segments.join('/'))
  if (!file || !safeRelativePath(file)) return null
  return { action: 'open', vault, file }
}

function parseAction(action: string, url: URL): TockTutorProtocolRequest | null {
  if (!PROTOCOL_ACTIONS.has(action)) return null
  const entries = queryEntries(url)
  if (!entries) return null

  const vault = entries.get('vault')
  if (vault !== undefined && !safeVaultRef(vault)) return null
  const path = entries.get('path')
  if (path !== undefined && (!isAbsolute(path) || !bounded(path) || /[\\\u0000-\u001f\u007f]/u.test(path))) return null
  const hasPane = entries.has('paneType')
  const paneType = entries.get('paneType')
  if (hasPane && (action === 'search' || action === 'choose-vault' || (paneType !== 'tab' && paneType !== 'split' && paneType !== 'window'))) return null

  const allowed = new Set(['vault', 'paneType', 'x-error', 'x-success'])
  if (action === 'open') allowed.add('file')
  if (action === 'new') allowed.add('file').add('name').add('content').add('clipboard').add('prepend').add('append').add('overwrite').add('silent')
  if (action === 'daily') allowed.add('content').add('clipboard').add('prepend').add('append').add('overwrite').add('silent')
  if (action === 'unique') allowed.add('content').add('clipboard')
  if (action === 'search') allowed.add('query')
  if (action === 'open' || action === 'new') allowed.add('path')
  if ([...entries.keys()].some(key => !allowed.has(key))) return null

  if (action === 'choose-vault') return entries.size === 0 ? { action } : null

  const xSuccess = callback(url.searchParams.get('x-success'))
  const xError = callback(url.searchParams.get('x-error'))
  const supportsCallbacks = action === 'open' || action === 'new' || action === 'daily' || action === 'unique'
  if (xSuccess === null || xError === null) return null
  if (!supportsCallbacks && (entries.has('x-success') || entries.has('x-error'))) return null

  const result: TockTutorProtocolRequest = {
    action: action as ProtocolAction,
    ...(vault === undefined ? {} : { vault }),
    ...(xSuccess === undefined ? {} : { xSuccess }),
    ...(xError === undefined ? {} : { xError }),
    ...(paneType === undefined ? {} : { paneType: paneType as PaneType }),
  }

  if (action === 'search') {
    const query = entries.get('query')
    if (query !== undefined && !bounded(query)) return null
    return query === undefined ? result : { ...result, query }
  }

  if (action === 'open') {
    const file = entries.get('file')
    if (file !== undefined && !safeRelativePath(file)) return null
    if (file === undefined && vault === undefined && path === undefined) return null
    return {
      ...result,
      ...(file === undefined ? {} : { file }),
      ...(path === undefined ? {} : { path }),
    }
  }

  if (action === 'new') {
    const file = entries.get('file')
    const name = entries.get('name')
    const content = entries.get('content')
    if (file !== undefined && !safeRelativePath(file)) return null
    if (name !== undefined && !safeSingleName(name)) return null
    if (file === undefined && name === undefined && path === undefined) return null
    if (content !== undefined && !bounded(content)) return null
    return {
      ...result,
      ...(file === undefined ? {} : { file }),
      ...(name === undefined ? {} : { name }),
      ...(path === undefined ? {} : { path }),
      ...(content === undefined ? {} : { content }),
      ...parseCreationOptions(entries, true),
    }
  }

  if (action === 'unique' && (entries.has('prepend') || entries.has('append') || entries.has('overwrite') || entries.has('silent'))) return null
  const content = entries.get('content')
  if (content !== undefined && !bounded(content)) return null
  return {
    ...result,
    ...(content === undefined ? {} : { content }),
    ...parseCreationOptions(entries, action === 'daily'),
  }
}

function parseCreationOptions(entries: Map<string, string>, allowPolicy: boolean): Pick<TockTutorProtocolRequest, 'clipboard' | 'ifExists' | 'silent'> {
  const clipboard = entries.has('clipboard') ? true : undefined
  const silent = entries.has('silent') ? true : undefined
  if (!allowPolicy && (entries.has('prepend') || entries.has('append') || entries.has('overwrite') || entries.has('silent'))) {
    return { ...(clipboard === undefined ? {} : { clipboard }) }
  }
  const ifExists = entries.has('prepend')
    ? 'prepend'
    : entries.has('append')
      ? 'append'
      : entries.has('overwrite')
        ? 'overwrite'
        : undefined
  return {
    ...(clipboard === undefined ? {} : { clipboard }),
    ...(ifExists === undefined ? {} : { ifExists }),
    ...(silent === undefined ? {} : { silent }),
  }
}

export function isTockTutorProtocol(value: string): boolean {
  return value.slice(0, PROTOCOL_SCHEME.length).toLowerCase() === PROTOCOL_SCHEME
}

export function parseTockTutorProtocol(raw: string): TockTutorProtocolRequest | null {
  if (raw.length > MAX_PROTOCOL_URI_LENGTH || /%(?![0-9a-f]{2})/iu.test(raw)) return null
  const shorthandResult = shorthand(raw)
  if (shorthandResult !== undefined) return shorthandResult

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== PROTOCOL_SCHEME || url.username || url.password || url.port || url.hash) return null
  return parseAction(url.hostname.toLowerCase(), url)
}

function validProtocolVault(value: DesktopProtocolVault): boolean {
  return typeof value?.id === 'string'
    && /^vault:[0-9a-f]{64}$/u.test(value.id)
    && Number.isSafeInteger(value.generation)
    && value.generation >= 0
    && typeof value.name === 'string'
    && value.name.length > 0
    && bounded(value.name)
    && typeof value.path === 'string'
    && isAbsolute(value.path)
    && bounded(value.path)
    && !/[\u0000-\u001f\u007f]/u.test(value.path)
}

function protocolVaults(
  known: readonly DesktopProtocolVault[],
  current: DesktopProtocolVault | null | undefined,
): DesktopProtocolVault[] {
  const result: DesktopProtocolVault[] = []
  const seen = new Set<string>()
  for (const candidate of [current, ...known]) {
    if (candidate === null || candidate === undefined || !validProtocolVault(candidate)) continue
    const path = resolve(candidate.path)
    const key = `${candidate.id}:${String(candidate.generation)}:${path}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ ...candidate, path })
  }
  return result
}

function relativeProtocolPath(vaultPath: string, targetPath: string): string | null {
  const candidate = relative(vaultPath, targetPath)
  if (!candidate || isAbsolute(candidate) || candidate.split(/[\\/]/u).some(segment => segment === '..' || segment === '.')) return null
  const normalized = candidate.split('\\').join('/')
  return safeRelativePath(normalized) ? normalized : null
}

function requestedVault(
  request: TockTutorProtocolRequest,
  known: readonly DesktopProtocolVault[],
): { vault: DesktopProtocolVault; file?: string } | null {
  const selector = request.vault
  const absolutePath = request.path
  if (absolutePath !== undefined) {
    if (!isAbsolute(absolutePath)) return null
    const targetPath = resolve(absolutePath)
    const matches = known
      .map(vault => ({ vault, file: relativeProtocolPath(vault.path, targetPath) }))
      .filter((entry): entry is { vault: DesktopProtocolVault; file: string } => entry.file !== null)
      .toSorted((left, right) => right.vault.path.length - left.vault.path.length)
    const match = matches[0]
    return match === undefined ? null : match
  }
  if (selector === undefined) return null
  const matches = isAbsolute(selector)
    ? known.filter(vault => resolve(vault.path) === resolve(selector))
    : known.filter(vault => vault.name.toLocaleLowerCase() === selector.toLocaleLowerCase())
  return matches.length === 1 ? { vault: matches[0]! } : null
}

/** Resolve a Host-only protocol request into an opaque browser request. */
export function resolveTockTutorProtocolRequest(
  request: TockTutorProtocolRequest | null,
  knownVaults: readonly DesktopProtocolVault[],
  currentVault: DesktopProtocolVault | null | undefined,
  clipboardText?: string | null,
): ResolvedTockTutorProtocolRequest | null {
  if (request === null || request.action === 'choose-vault') return request === null ? null : { request }
  const known = protocolVaults(knownVaults, currentVault)
  const selected = requestedVault(request, known)
  const vault = selected?.vault ?? (request.vault === undefined && request.path === undefined ? currentVault : undefined)
  if (vault === undefined || vault === null || !validProtocolVault(vault)) return null
  const explicitTarget = request.vault !== undefined || request.path !== undefined
  const file = selected?.file ?? request.file
  if (request.action === 'new' && file === undefined) return null
  if (request.clipboard === true
    && request.action !== 'new' && request.action !== 'daily' && request.action !== 'unique') return null
  const content = request.clipboard === true
    ? typeof clipboardText === 'string' && bounded(clipboardText) ? clipboardText : null
    : request.content
  if (content === null) return null
  const browserRequest: TockTutorBrowserProtocolRequest = {
    action: request.action,
    ...(explicitTarget ? { vaultId: vault.id } : {}),
    ...(file === undefined ? {} : { file }),
    ...(request.name === undefined ? {} : { name: request.name }),
    ...(content === undefined ? {} : { content }),
    ...(request.query === undefined ? {} : { query: request.query }),
    ...(request.ifExists === undefined ? {} : { ifExists: request.ifExists }),
    ...(request.silent === undefined ? {} : { silent: request.silent }),
    ...(request.paneType === undefined ? {} : { paneType: request.paneType }),
    ...(request.xSuccess === undefined ? {} : { xSuccess: request.xSuccess }),
    ...(request.xError === undefined ? {} : { xError: request.xError }),
  }
  return { request: browserRequest }
}

export function isEligibleTrustedMainWindow(window: TrustedWindowState): boolean {
  return window.surfaceKind === 'desktop'
    && window.role === 'main'
    && window.mainFrame
    && !window.destroyed
    && window.origin.length > 0
    && window.origin === window.trustedOrigin
}

export function isCurrentNativeIdentity(expected: NativeRequestIdentity, current: NativeRequestIdentity): boolean {
  return expected.requestId === current.requestId
    && expected.windowId === current.windowId
    && expected.sessionId === current.sessionId
    && expected.vaultId === current.vaultId
    && expected.vaultGeneration === current.vaultGeneration
}

export function isValidNotesPopOutRelativePath(relativePath: string): boolean {
  return relativePath.length > 0
    && relativePath.length <= MAX_NOTES_POP_OUT_PATH_LENGTH
    && safeRelativePath(relativePath)
    && /\.[a-z0-9]+$/iu.test(relativePath)
}

export function createLatestRequestGate() {
  let revision = 0
  return {
    next(): number {
      revision += 1
      return revision
    },
    isCurrent(candidate: number): boolean {
      return candidate === revision
    },
    invalidate(): void {
      revision += 1
    },
  }
}

export function createSingleFlightGate() {
  let active = false
  return {
    begin(): boolean {
      if (active) return false
      active = true
      return true
    },
    finish(): void {
      active = false
    },
    isActive(): boolean {
      return active
    },
  }
}

export function isAllowedExportResourceUrl(
  url: string,
  documentUrl: string,
  maxLength = MAX_EXPORT_RESOURCE_URL_LENGTH,
): boolean {
  if (url.length > maxLength || documentUrl.length > maxLength || !/^data:text\/html(?:[;,])/iu.test(documentUrl)) return false
  return url === documentUrl || EXPORT_DATA_ASSET_PATTERN.test(url)
}
