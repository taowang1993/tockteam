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

export type TockTutorProtocolRequest = {
  action: ProtocolAction
  vault?: string
  file?: string
  name?: string
  content?: string
  query?: string
  clipboard?: true
  ifExists?: ExistingFilePolicy
  silent?: true
  paneType?: PaneType
  xSuccess?: string
  xError?: string
}

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
    && !/[\\/\u0000-\u001f\u007f]/u.test(value)
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
  if (!value || value.length > MAX_PROTOCOL_CALLBACK_LENGTH) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === PROTOCOL_SCHEME ? value : null
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
  if (entries.has('path')) return null

  const vault = entries.get('vault')
  if (vault !== undefined && !safeVaultRef(vault)) return null
  const hasPane = entries.has('paneType')
  const paneType = entries.get('paneType')
  if (hasPane && (action === 'search' || action === 'choose-vault' || (paneType !== 'tab' && paneType !== 'split' && paneType !== 'window'))) return null

  const allowed = new Set(['vault', 'paneType', 'x-error', 'x-success'])
  if (action === 'open') allowed.add('file')
  if (action === 'new') allowed.add('file').add('name').add('content').add('clipboard').add('prepend').add('append').add('overwrite').add('silent')
  if (action === 'daily') allowed.add('content').add('clipboard').add('prepend').add('append').add('overwrite').add('silent')
  if (action === 'unique') allowed.add('content').add('clipboard')
  if (action === 'search') allowed.add('query')
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
    if (file === undefined && vault === undefined) return null
    return file === undefined ? result : { ...result, file }
  }

  if (action === 'new') {
    const file = entries.get('file')
    const name = entries.get('name')
    const content = entries.get('content')
    if (file !== undefined && !safeRelativePath(file)) return null
    if (name !== undefined && !safeSingleName(name)) return null
    if (file === undefined && name === undefined) return null
    if (content !== undefined && !bounded(content)) return null
    return {
      ...result,
      ...(file === undefined ? {} : { file }),
      ...(name === undefined ? {} : { name }),
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
