const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength
const MAX_TEXT = 16 * 1024
const MAX_MESSAGE = 1024 * 1024
const MAX_DEPTH = 32
const MAX_NODES = 4096
const MAX_PREFERENCES = 64
const MAX_PREFERENCE_KEY = 128
const MAX_PREFERENCE_TOTAL = 128 * 1024

export const TRUSTED_RAYCAST_COMMAND = 'translate' as const
export const TRUSTED_RAYCAST_IPC_CHANNELS = Object.freeze({
  close: 'trusted-raycast:view-close',
  event: 'trusted-raycast:view-event',
  error: 'trusted-raycast:view-error',
  open: 'trusted-raycast:view-open',
  patch: 'trusted-raycast:view-patch',
})
export type TrustedRaycastPreference = boolean | string
export type TrustedRaycastViewOpen = Readonly<{
  sessionId: string
  generation: string
  command: typeof TRUSTED_RAYCAST_COMMAND
  preferences: Readonly<Record<string, TrustedRaycastPreference>>
}>
export type TrustedRaycastViewEvent = Readonly<{
  sessionId: string
  generation: string
  revision: number
  eventId: string
  kind: 'searchChanged' | 'action' | 'navigation' | 'fieldChanged' | 'submit'
  value?: string
}>

export type TrustedRaycastViewNode = Readonly<{
  type: string
  props: Readonly<Record<string, string | number | boolean | null>>
  children: readonly (TrustedRaycastViewNode | string)[]
}>

export type TrustedRaycastViewPatch = Readonly<{
  sessionId: string
  generation: string
  revision: number
  root: TrustedRaycastViewNode
  status: 'ready' | 'loading' | 'error'
}>

export type TrustedRaycastViewMessage = Readonly<{
  type: 'ready' | 'patch' | 'error' | 'toast' | 'outcome'
  sessionId: string
  generation: string
  revision: number
  root?: TrustedRaycastViewNode
  status?: 'ready' | 'loading' | 'error'
  message?: string
  title?: string
  querySequence?: number
  style?: 'failure' | 'success' | 'animated'
  eventId?: string
  succeeded?: boolean
}>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const exactKeys = (value: object, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  return JSON.stringify(actual) === JSON.stringify([...expected].sort())
}
const boundedString = (value: unknown, max = MAX_TEXT): value is string => typeof value === 'string' && byteLength(value) <= max

function jsonSafe(value: unknown, depth = 0, count = { value: 0 }): boolean {
  if (++count.value > MAX_NODES || depth > MAX_DEPTH) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return typeof value !== 'number' || Number.isFinite(value)
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(entry => jsonSafe(entry, depth + 1, count))
  if (!isRecord(value)) return false
  return Object.entries(value).every(([key, entry]) => boundedString(key, MAX_PREFERENCE_KEY) && jsonSafe(entry, depth + 1, count))
}

export function isTrustedRaycastViewOpen(value: unknown): value is TrustedRaycastViewOpen {
  if (!isRecord(value) || !exactKeys(value, ['sessionId', 'generation', 'command', 'preferences'])) return false
  if (!boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || value.command !== TRUSTED_RAYCAST_COMMAND || !isRecord(value.preferences)) return false
  const entries = Object.entries(value.preferences)
  if (entries.length > MAX_PREFERENCES || entries.some(([key, entry]) => key.length > MAX_PREFERENCE_KEY || (typeof entry !== 'string' && typeof entry !== 'boolean'))) return false
  return byteLength(JSON.stringify(value.preferences)) <= MAX_PREFERENCE_TOTAL
}

export function isTrustedRaycastViewEvent(value: unknown): value is TrustedRaycastViewEvent {
  if (!isRecord(value)) return false
  const keys = ['sessionId', 'generation', 'revision', 'eventId', 'kind', ...(Object.hasOwn(value, 'value') ? ['value'] : [])]
  if (!exactKeys(value, keys) || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !boundedString(value.eventId, 128)) return false
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !['searchChanged', 'action', 'navigation', 'fieldChanged', 'submit'].includes(value.kind as string)) return false
  if (!Object.hasOwn(value, 'value')) return value.kind === 'navigation' || value.kind === 'action'
  if (!boundedString(value.value)) return false
  const max = value.kind === 'searchChanged' ? MAX_TEXT : value.kind === 'submit' ? 4096 : 128
  return value.value.length <= max && (value.kind !== 'navigation' || value.value.startsWith('language:'))
}

const VIEW_TYPES = new Set(['root', 'raycast-list', 'raycast-list-item', 'raycast-detail', 'raycast-empty', 'raycast-dropdown', 'raycast-dropdown-item', 'raycast-action', 'raycast-action-panel', 'raycast-action-section', 'raycast-form', 'raycast-text-field', 'raycast-form-dropdown', 'raycast-form-dropdown-item'])
function isViewNode(value: unknown, depth = 0, count = { value: 0, text: 0, actions: 0 }): value is TrustedRaycastViewNode {
  if (!isRecord(value) || !exactKeys(value, ['type', 'props', 'children']) || !boundedString(value.type, 128) || !VIEW_TYPES.has(value.type) || !isRecord(value.props) || !Array.isArray(value.children)) return false
  if (++count.value > MAX_NODES || depth > MAX_DEPTH || value.children.length > 1024) return false
  if (Object.keys(value.props).length > 64 || Object.entries(value.props).some(([key, entry]) => !boundedString(key, 128) || (entry !== null && typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean'))) return false
  for (const entry of Object.values(value.props)) {
    if (typeof entry === 'string') count.text += byteLength(entry)
    if (typeof entry === 'number' && !Number.isFinite(entry)) return false
  }
  if (value.type.startsWith('raycast-action') && ++count.actions > 256) return false
  return value.children.every(child => {
    if (typeof child === 'string') { count.text += byteLength(child); return boundedString(child, MAX_TEXT) }
    return isViewNode(child, depth + 1, count)
  }) && count.text <= 256 * 1024
}

export function isTrustedRaycastViewPatch(value: unknown): value is TrustedRaycastViewPatch {
  if (!isRecord(value) || !exactKeys(value, ['sessionId', 'generation', 'revision', 'root', 'status']) || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || (value.status !== 'ready' && value.status !== 'loading' && value.status !== 'error') || !isViewNode(value.root)) return false
  return isBoundedTrustedRaycastMessage(value)
}

export function isTrustedRaycastViewMessage(value: unknown): value is TrustedRaycastViewMessage {
  if (!isRecord(value) || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !isBoundedTrustedRaycastMessage(value)) return false
  if (value.type === 'toast') return exactKeys(value, ['type', 'sessionId', 'generation', 'revision', 'querySequence', 'title', 'message', 'style']) && Number.isSafeInteger(value.querySequence) && (value.querySequence as number) >= 0 && boundedString(value.title, 512) && boundedString(value.message, 4096) && ['failure', 'success', 'animated'].includes(value.style as string)
  if (value.type === 'outcome') return exactKeys(value, ['type', 'sessionId', 'generation', 'revision', 'eventId', 'succeeded', 'message']) && boundedString(value.eventId, 128) && typeof value.succeeded === 'boolean' && boundedString(value.message, 512)
  if (value.type === 'ready') return exactKeys(value, ['type', 'sessionId', 'generation', 'revision', 'root']) && isViewNode(value.root)
  if (value.type === 'patch') return exactKeys(value, ['type', 'sessionId', 'generation', 'revision', 'root', 'status']) && isViewNode(value.root) && (value.status === 'ready' || value.status === 'loading' || value.status === 'error')
  return value.type === 'error' && exactKeys(value, ['type', 'sessionId', 'generation', 'revision', 'message']) && boundedString(value.message, 512)
}

/** Main's child-channel admission: identity/revision belong to this invocation, not the child. */
export function parseTrustedRaycastChildMessage(line: string, session: TrustedRaycastViewOpen, previousRevision: number): TrustedRaycastViewMessage {
  if (byteLength(line) > MAX_MESSAGE) throw new Error('Translate output exceeded its bound')
  const message: unknown = JSON.parse(line)
  if (!isTrustedRaycastViewMessage(message) || message.sessionId !== session.sessionId || message.generation !== session.generation || ((message.type === 'toast' || message.type === 'outcome') ? message.revision !== previousRevision : message.revision <= previousRevision) || (previousRevision === -1 ? message.type !== 'ready' : message.type === 'ready')) throw new Error('Invalid Translate runtime message')
  return message
}

export type TrustedRaycastNativeRequest = Readonly<{
  type: 'native'; sessionId: string; generation: string; revision: number; eventId: string; requestId: string
} & ({ kind: 'copy'; text: string } | { kind: 'openGoogleTranslate'; url: string })>

export type TrustedRaycastNativeOutcome = Readonly<{ type: 'nativeOutcome'; requestId: string; succeeded: boolean; message: string }>

export function isTrustedRaycastNativeRequest(value: unknown): value is TrustedRaycastNativeRequest {
  if (!isRecord(value) || value.type !== 'native' || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !boundedString(value.eventId, 128) || !boundedString(value.requestId, 128) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return false
  const keys = ['type', 'sessionId', 'generation', 'revision', 'eventId', 'requestId', 'kind']
  if (value.kind === 'copy') return exactKeys(value, [...keys, 'text']) && boundedString(value.text, 128 * 1024)
  if (value.kind !== 'openGoogleTranslate' || !exactKeys(value, [...keys, 'url']) || !boundedString(value.url, 128 * 1024)) return false
  try {
    const url = new URL(value.url)
    return url.origin === 'https://translate.google.com' && !url.username && !url.password && !url.hash && url.pathname === '/'
      && JSON.stringify([...url.searchParams.keys()].sort()) === JSON.stringify(['op', 'sl', 'text', 'tl'])
      && url.searchParams.get('op') === 'translate'
      && /^[A-Za-z]{2,4}(?:-[A-Za-z]{2,4})?$/.test(url.searchParams.get('sl') ?? '')
      && /^[A-Za-z]{2,4}(?:-[A-Za-z]{2,4})?$/.test(url.searchParams.get('tl') ?? '')
      && boundedString(url.searchParams.get('text'))
  } catch { return false }
}

export function isTrustedRaycastNativeOutcome(value: unknown): value is TrustedRaycastNativeOutcome {
  return isRecord(value) && exactKeys(value, ['type', 'requestId', 'succeeded', 'message']) && value.type === 'nativeOutcome' && boundedString(value.requestId, 128) && typeof value.succeeded === 'boolean' && boundedString(value.message, 512)
}

export function isBoundedTrustedRaycastMessage(value: unknown): boolean {
  try { return jsonSafe(value) && byteLength(JSON.stringify(value)) <= MAX_MESSAGE } catch { return false }
}
