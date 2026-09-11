import { getTrustedRaycastDescriptor, getTrustedRaycastRuntimeDescriptor, type TrustedRaycastCommand, type TrustedRaycastExtensionId, type TrustedRaycastRuntimeExtensionId } from './trusted-raycast-descriptors.ts'

const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength
const MAX_TEXT = 16 * 1024
const MAX_MESSAGE = 1024 * 1024
const MAX_DEPTH = 32
// Measured against the reviewed 250-language catalog: the nested AddLanguageForm projection
// (3 x 251 dropdown entries plus form chrome) serializes to ~4.1k JSON nodes at the 4k ceiling.
const MAX_NODES = 8192
const MAX_PREFERENCES = 64
const MAX_PREFERENCE_KEY = 128
const MAX_PREFERENCE_TOTAL = 128 * 1024

const LANGUAGE_CODE = /^[a-zA-Z]{2,5}(?:-[a-zA-Z0-9]{2,5})?$/
const TRUSTED_RAYCAST_PREFERENCE_KEYS = ['langFrom', 'lang1', 'lang2', 'autoInput', 'defaultAction', 'prioritizeCrossLanguage', 'proxy'] as const
export const TRUSTED_RAYCAST_PREFERENCE_DEFAULTS = Object.freeze({ langFrom: 'auto', lang1: 'en', lang2: 'en', autoInput: true, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' })

export function isTrustedRaycastPreferences(value: unknown): value is Readonly<Record<(typeof TRUSTED_RAYCAST_PREFERENCE_KEYS)[number], TrustedRaycastPreference>> {
  if (!isRecord(value) || !exactKeys(value, TRUSTED_RAYCAST_PREFERENCE_KEYS)) return false
  const entries = value as Record<string, unknown>
  if (typeof entries.autoInput !== 'boolean' || typeof entries.prioritizeCrossLanguage !== 'boolean') return false
  if ((entries.defaultAction !== 'copy' && entries.defaultAction !== 'paste') || typeof entries.proxy !== 'string' || byteLength(entries.proxy) > 2048) return false
  for (const key of ['langFrom', 'lang1', 'lang2'] as const) {
    const code = entries[key]
    if (typeof code !== 'string' || byteLength(code) > 16 || (code !== 'auto' && !LANGUAGE_CODE.test(code))) return false
  }
  return true
}

export const TRUSTED_RAYCAST_COMMAND = 'translate' as const
export const TRUSTED_RAYCAST_IPC_CHANNELS = Object.freeze({
  close: 'trusted-raycast:view-close',
  event: 'trusted-raycast:view-event',
  error: 'trusted-raycast:view-error',
  open: 'trusted-raycast:view-open',
  patch: 'trusted-raycast:view-patch',
})
export const TRUSTED_RAYCAST_TRUST_IPC_CHANNELS = Object.freeze({
  action: 'trusted-raycast:trust-action',
  state: 'trusted-raycast:trust-state',
})
export type TrustedRaycastTrustAction = 'disable' | 'enable' | 'prepare' | 'apply' | 'recover' | 'remove'
export type TrustedRaycastTrustRecovery = '' | 'invalid-install' | 'interrupted-rotation'
/** Renderer-facing trust projection: installed and enabled are separate user-owned states. */
export type TrustedRaycastTrustState = Readonly<{
  active: boolean
  candidateAvailable: boolean
  candidateDigest: string
  digest: string
  digestApproved: boolean
  enabled: boolean
  hasPrevious: boolean
  installed: boolean
  previewed: boolean
  recovery: TrustedRaycastTrustRecovery
  staged: boolean
}>
export type TrustedRaycastTrustRequest = Readonly<{ action: TrustedRaycastTrustAction; extensionId: TrustedRaycastExtensionId }>
export type TrustedRaycastTrustStateEnvelope = Readonly<{ extensionId: TrustedRaycastExtensionId; state: TrustedRaycastTrustState }>
export type TrustedRaycastTrustResult = Readonly<
  | { error: string; extensionId: TrustedRaycastExtensionId; ok: false; state: TrustedRaycastTrustState }
  | { extensionId: TrustedRaycastExtensionId; ok: true; state: TrustedRaycastTrustState }
>

export function isTrustedRaycastTrustAction(value: unknown): value is TrustedRaycastTrustAction {
  return value === 'disable' || value === 'enable' || value === 'prepare' || value === 'apply' || value === 'recover' || value === 'remove'
}

export function isTrustedRaycastTrustRequest(value: unknown): value is TrustedRaycastTrustRequest {
  return isRecord(value) && exactKeys(value, ['action', 'extensionId']) && getTrustedRaycastDescriptor(value.extensionId) !== undefined && isTrustedRaycastTrustAction(value.action)
}

export function isTrustedRaycastTrustState(value: unknown): value is TrustedRaycastTrustState {
  if (!isRecord(value) || !exactKeys(value, ['active', 'candidateAvailable', 'candidateDigest', 'digest', 'digestApproved', 'enabled', 'hasPrevious', 'installed', 'previewed', 'recovery', 'staged'])) return false
  return typeof value.active === 'boolean'
    && typeof value.candidateAvailable === 'boolean'
    && typeof value.candidateDigest === 'string' && value.candidateDigest.length <= 64
    && typeof value.digest === 'string' && value.digest.length <= 64
    && typeof value.digestApproved === 'boolean'
    && typeof value.enabled === 'boolean'
    && typeof value.hasPrevious === 'boolean'
    && typeof value.installed === 'boolean'
    && typeof value.previewed === 'boolean'
    && (value.recovery === '' || value.recovery === 'invalid-install' || value.recovery === 'interrupted-rotation')
    && typeof value.staged === 'boolean'
}

export function isTrustedRaycastTrustStateEnvelope(value: unknown): value is TrustedRaycastTrustStateEnvelope {
  return isRecord(value) && exactKeys(value, ['extensionId', 'state']) && getTrustedRaycastDescriptor(value.extensionId) !== undefined && isTrustedRaycastTrustState(value.state)
}

export function isTrustedRaycastTrustResult(value: unknown): value is TrustedRaycastTrustResult {
  if (!isRecord(value) || getTrustedRaycastDescriptor(value.extensionId) === undefined || !isTrustedRaycastTrustState(value.state)) return false
  if (value.ok === true) return exactKeys(value, ['extensionId', 'ok', 'state'])
  return value.ok === false && exactKeys(value, ['error', 'extensionId', 'ok', 'state']) && boundedString(value.error, 512)
}
export type TrustedRaycastPreference = boolean | string
export type KaomojiDisplayMode = 'list' | 'grid'
export type KaomojiPrimaryAction = 'copy-to-clipboard' | 'paste-to-active-app'
export type KaomojiPreferences = Readonly<{ displayMode: KaomojiDisplayMode; primaryAction: KaomojiPrimaryAction }>
export const KAOMOJI_PREFERENCE_DEFAULTS: KaomojiPreferences = Object.freeze({ displayMode: 'list', primaryAction: 'paste-to-active-app' })
export function isKaomojiPreferences(value: unknown): value is KaomojiPreferences {
  return isRecord(value)
    && exactKeys(value, ['displayMode', 'primaryAction'])
    && (value.displayMode === 'list' || value.displayMode === 'grid')
    && (value.primaryAction === 'copy-to-clipboard' || value.primaryAction === 'paste-to-active-app')
}
export type TrustedRaycastViewOpen = Readonly<{
  extensionId: TrustedRaycastRuntimeExtensionId
  sessionId: string
  generation: string
  command: TrustedRaycastCommand
  preferences: Readonly<Record<string, TrustedRaycastPreference>>
}>
export type TrustedRaycastViewEvent = Readonly<{
  extensionId: TrustedRaycastRuntimeExtensionId
  sessionId: string
  generation: string
  revision: number
  eventId: string
  kind: 'searchChanged' | 'action' | 'navigation' | 'fieldChanged' | 'submit' | 'themeChanged'
  value?: string
}>

export type TrustedRaycastViewNode = Readonly<{
  type: string
  props: Readonly<Record<string, string | number | boolean | null>>
  children: readonly (TrustedRaycastViewNode | string)[]
}>
export type TrustedRaycastProjectionInspection = Readonly<{
  actionableHandles: number
  actionNodes: number
  aggregateTextBytes: number
  decodedSvgBytes: number
  depth: number
  itemNodes: number
  maxChildren: number
  nodeCount: number
  rootBytes: number
  sectionNodes: number
  uniqueActionHandles: number
}>

/** Payload-free counters for diagnostics and finite-bound evidence. */
export function inspectTrustedRaycastProjection(root: unknown): TrustedRaycastProjectionInspection {
  let actionableHandles = 0; let actionNodes = 0; let aggregateTextBytes = 0; let decodedSvgBytes = 0; let depth = 0; let itemNodes = 0; let maxChildren = 0; let nodeCount = 0; let sectionNodes = 0
  const handles = new Set<string>()
  const stack: Array<{ depth: number; value: unknown }> = [{ depth: 0, value: root }]
  while (stack.length > 0 && nodeCount <= MAX_NODES) {
    const current = stack.pop()!; depth = Math.max(depth, current.depth)
    if (typeof current.value === 'string') { aggregateTextBytes += byteLength(current.value); continue }
    if (!isRecord(current.value)) continue
    nodeCount++
    const type = current.value.type
    if (type === 'raycast-action') actionNodes++
    if (type === 'raycast-section') sectionNodes++
    if (type === 'raycast-list-item' || type === 'raycast-grid-item') itemNodes++
    const props = isRecord(current.value.props) ? current.value.props : {}
    for (const [key, entry] of Object.entries(props)) {
      if (typeof entry !== 'string') continue
      aggregateTextBytes += byteLength(entry)
      if (key === 'actionEventId') { actionableHandles++; handles.add(entry) }
      if ((key === 'contentDark' || key === 'contentLight') && entry.startsWith('data:image/svg+xml;base64,') && entry.length <= 6144) {
        try { decodedSvgBytes += atob(entry.slice(entry.indexOf(',') + 1)).length } catch { /* the validator reports malformed data */ }
      }
    }
    const children = Array.isArray(current.value.children) ? current.value.children : []
    maxChildren = Math.max(maxChildren, children.length)
    if (current.depth <= MAX_DEPTH) for (const child of children) stack.push({ depth: current.depth + 1, value: child })
  }
  let rootBytes = MAX_MESSAGE + 1
  try { rootBytes = byteLength(JSON.stringify(root)) } catch { /* non-JSON input remains over-bound */ }
  return Object.freeze({ actionableHandles, actionNodes, aggregateTextBytes, decodedSvgBytes, depth, itemNodes, maxChildren, nodeCount, rootBytes, sectionNodes, uniqueActionHandles: handles.size })
}

export type TrustedRaycastViewPatch = Readonly<{
  extensionId: TrustedRaycastRuntimeExtensionId
  sessionId: string
  generation: string
  revision: number
  root: TrustedRaycastViewNode
  status: 'ready' | 'loading' | 'error'
}>

export type TrustedRaycastViewMessage = Readonly<{
  type: 'ready' | 'patch' | 'error' | 'toast' | 'outcome'
  extensionId: TrustedRaycastRuntimeExtensionId
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
  if (!isRecord(value) || !exactKeys(value, ['extensionId', 'sessionId', 'generation', 'command', 'preferences'])) return false
  const descriptor = getTrustedRaycastRuntimeDescriptor(value.extensionId)
  if (descriptor === undefined || value.command !== descriptor.command || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !isRecord(value.preferences)) return false
  const entries = Object.entries(value.preferences)
  if (entries.length > MAX_PREFERENCES || entries.some(([key, entry]) => key.length > MAX_PREFERENCE_KEY || (typeof entry !== 'string' && typeof entry !== 'boolean'))) return false
  if (descriptor.extensionId === 'kaomoji-search' && entries.length > 0 && !isKaomojiPreferences(value.preferences)) return false
  return byteLength(JSON.stringify(value.preferences)) <= MAX_PREFERENCE_TOTAL
}

export function isTrustedRaycastViewEvent(value: unknown): value is TrustedRaycastViewEvent {
  if (!isRecord(value)) return false
  const keys = ['extensionId', 'sessionId', 'generation', 'revision', 'eventId', 'kind', ...(Object.hasOwn(value, 'value') ? ['value'] : [])]
  if (!exactKeys(value, keys) || getTrustedRaycastRuntimeDescriptor(value.extensionId) === undefined || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !boundedString(value.eventId, 128)) return false
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !['searchChanged', 'action', 'navigation', 'fieldChanged', 'submit', 'themeChanged'].includes(value.kind as string)) return false
  if (value.kind === 'themeChanged') return value.extensionId === 'can-i-use' && !Object.hasOwn(value, 'value')
  if (!Object.hasOwn(value, 'value')) return value.kind === 'navigation' || value.kind === 'action'
  if (!boundedString(value.value)) return false
  const max = value.kind === 'searchChanged' ? MAX_TEXT : value.kind === 'submit' || (value.extensionId === 'can-i-use' && value.kind === 'fieldChanged') ? 4096 : 128
  return value.value.length <= max && (value.kind !== 'navigation' || (value.extensionId === 'can-i-use' ? value.value === 'can-i-use:pop' : value.value.startsWith('language:')))
}

const VIEW_TYPES = new Set(['root', 'raycast-list', 'raycast-list-item', 'raycast-detail', 'raycast-empty', 'raycast-dropdown', 'raycast-dropdown-item', 'raycast-action', 'raycast-action-panel', 'raycast-action-section', 'raycast-form', 'raycast-text-field', 'raycast-form-dropdown', 'raycast-form-dropdown-item'])
const KAOMOJI_VIEW_TYPES = new Set(['root', 'raycast-list', 'raycast-list-item', 'raycast-grid', 'raycast-grid-item', 'raycast-section', 'raycast-empty', 'raycast-action', 'raycast-action-panel', 'raycast-action-section', 'raycast-form', 'raycast-form-dropdown', 'raycast-form-dropdown-item'])
const KAOMOJI_ICONS = new Set(['Clipboard', 'Gear', 'Star', 'StarDisabled'])
const KAOMOJI_PROPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  root: ['navigationDepth', 'preferenceSetup', 'queryCurrent', 'querySequence', 'searchable', 'searchEventId'],
  'raycast-list': ['isLoading', 'navigationDepth', 'preferenceSetup', 'queryCurrent', 'querySequence', 'searchable', 'searchBarPlaceholder', 'searchEventId', 'throttle'],
  'raycast-grid': ['isLoading', 'navigationDepth', 'preferenceSetup', 'queryCurrent', 'querySequence', 'searchable', 'searchBarPlaceholder', 'searchEventId', 'throttle'],
  'raycast-section': ['subtitle', 'title'],
  'raycast-list-item': ['accessories', 'selected', 'subtitle', 'title'],
  'raycast-grid-item': ['contentDark', 'contentLight', 'title'],
  'raycast-empty': ['description', 'icon', 'title'],
  'raycast-action': ['actionEventId', 'icon', 'shortcut', 'style', 'title', 'unavailable'],
  'raycast-action-panel': [],
  'raycast-action-section': ['title'],
  'raycast-form': [],
  'raycast-form-dropdown': ['fieldEventId', 'title', 'value'],
  'raycast-form-dropdown-item': ['title', 'value'],
})
export function isTrustedRaycastKaomojiSvg(value: unknown, fill: '#000' | '#fff'): boolean {
  if (typeof value !== 'string' || !value.startsWith('data:image/svg+xml;base64,') || value.length > 6144) return false
  const encoded = value.slice('data:image/svg+xml;base64,'.length)
  if (encoded.length === 0 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false
  try {
    const decoded = atob(encoded)
    if (decoded.length > 4096) return false
    const escapedFill = fill.replace('#', '\\#')
    return new RegExp(`^<svg xmlns="http://www\\.w3\\.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" >\\n  <text dominant-baseline="middle" x="45" y="45" text-anchor="middle" fill="${escapedFill}" font-size="8px" text-length="90" length-adjust="spacing">\\n    (?:&#\\d{1,5};)+\\n  </text>\\n</svg>$`).test(decoded)
  } catch { return false }
}
function isViewNode(value: unknown, extensionId: TrustedRaycastRuntimeExtensionId, depth = 0, count = { value: 0, text: 0, actions: 0 }): value is TrustedRaycastViewNode {
  const viewTypes = extensionId === 'kaomoji-search' ? KAOMOJI_VIEW_TYPES : VIEW_TYPES
  if (!isRecord(value) || !exactKeys(value, ['type', 'props', 'children']) || !boundedString(value.type, 128) || !viewTypes.has(value.type) || !isRecord(value.props) || !Array.isArray(value.children)) return false
  if (++count.value > MAX_NODES || depth > MAX_DEPTH || value.children.length > 1024) return false
  if (Object.keys(value.props).length > 64 || Object.entries(value.props).some(([key, entry]) => !boundedString(key, 128) || (entry !== null && typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean'))) return false
  if (extensionId === 'kaomoji-search') {
    const allowed = KAOMOJI_PROPS[value.type]
    if (allowed === undefined || Object.keys(value.props).some(key => !allowed.includes(key))) return false
    if (value.type === 'raycast-grid-item' && (!isTrustedRaycastKaomojiSvg(value.props.contentDark, '#fff') || !isTrustedRaycastKaomojiSvg(value.props.contentLight, '#000'))) return false
    if (value.type === 'raycast-action' && value.props.icon !== undefined && (typeof value.props.icon !== 'string' || !KAOMOJI_ICONS.has(value.props.icon))) return false
  }
  for (const entry of Object.values(value.props)) {
    if (typeof entry === 'string') count.text += byteLength(entry)
    if (typeof entry === 'number' && !Number.isFinite(entry)) return false
  }
  if (extensionId === 'kaomoji-search' && value.type === 'raycast-action' && value.children.length !== 0) return false
  if (value.type === 'raycast-action' && typeof value.props.actionEventId === 'string' && ++count.actions > 256) return false
  return value.children.every(child => {
    if (typeof child === 'string') { count.text += byteLength(child); return boundedString(child, MAX_TEXT) }
    return isViewNode(child, extensionId, depth + 1, count)
  }) && count.text <= 256 * 1024
}

export function isTrustedRaycastViewPatch(value: unknown): value is TrustedRaycastViewPatch {
  if (!isRecord(value) || !exactKeys(value, ['extensionId', 'sessionId', 'generation', 'revision', 'root', 'status']) || getTrustedRaycastRuntimeDescriptor(value.extensionId) === undefined || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || (value.status !== 'ready' && value.status !== 'loading' && value.status !== 'error') || !isViewNode(value.root, value.extensionId as TrustedRaycastExtensionId)) return false
  return isBoundedTrustedRaycastMessage(value)
}

export function isTrustedRaycastViewMessage(value: unknown): value is TrustedRaycastViewMessage {
  if (!isRecord(value) || getTrustedRaycastRuntimeDescriptor(value.extensionId) === undefined || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !isBoundedTrustedRaycastMessage(value)) return false
  const identity = ['extensionId', 'sessionId', 'generation', 'revision']
  if (value.type === 'toast') return exactKeys(value, ['type', ...identity, 'querySequence', 'title', 'message', 'style']) && Number.isSafeInteger(value.querySequence) && (value.querySequence as number) >= 0 && boundedString(value.title, 512) && boundedString(value.message, 4096) && ['failure', 'success', 'animated'].includes(value.style as string)
  if (value.type === 'outcome') return exactKeys(value, ['type', ...identity, 'eventId', 'succeeded', 'message']) && boundedString(value.eventId, 128) && typeof value.succeeded === 'boolean' && boundedString(value.message, 512)
  if (value.type === 'ready') return exactKeys(value, ['type', ...identity, 'root']) && isViewNode(value.root, value.extensionId as TrustedRaycastExtensionId)
  if (value.type === 'patch') return exactKeys(value, ['type', ...identity, 'root', 'status']) && isViewNode(value.root, value.extensionId as TrustedRaycastExtensionId) && (value.status === 'ready' || value.status === 'loading' || value.status === 'error')
  return value.type === 'error' && exactKeys(value, ['type', ...identity, 'message']) && boundedString(value.message, 512)
}

/** Main's child-channel admission: identity/revision belong to this invocation, not the child. */
export function parseTrustedRaycastChildMessage(line: string, session: TrustedRaycastViewOpen, previousRevision: number): TrustedRaycastViewMessage {
  if (byteLength(line) > MAX_MESSAGE) throw new Error('Translate output exceeded its bound')
  const message: unknown = JSON.parse(line)
  if (!isTrustedRaycastViewMessage(message)) {
    if (isRecord(message) && message.extensionId === 'kaomoji-search' && (message.type === 'ready' || message.type === 'patch') && Object.hasOwn(message, 'root')) {
      const metrics = inspectTrustedRaycastProjection(message.root)
      const reason = metrics.rootBytes > MAX_MESSAGE ? ['root-bytes', metrics.rootBytes, MAX_MESSAGE]
        : metrics.nodeCount > MAX_NODES ? ['nodes', metrics.nodeCount, MAX_NODES]
          : metrics.depth > MAX_DEPTH ? ['depth', metrics.depth, MAX_DEPTH]
            : metrics.maxChildren > 1024 ? ['children', metrics.maxChildren, 1024]
              : metrics.actionableHandles > 256 ? ['action-handles', metrics.actionableHandles, 256]
                : metrics.aggregateTextBytes > 256 * 1024 ? ['text-bytes', metrics.aggregateTextBytes, 256 * 1024]
                  : ['shape', 1, 0]
      throw new Error(`Trusted extension projection exceeded finite view bounds (${reason[0]} ${reason[1]}/${reason[2]})`)
    }
    throw new Error('Invalid trusted extension runtime message')
  }
  if (message.extensionId !== session.extensionId || message.sessionId !== session.sessionId || message.generation !== session.generation || ((message.type === 'toast' || message.type === 'outcome') ? message.revision !== previousRevision : message.revision <= previousRevision) || (previousRevision === -1 ? message.type !== 'ready' : message.type === 'ready')) throw new Error('Invalid trusted extension runtime message')
  return message
}

export type TrustedRaycastNativeRequest = Readonly<
  { type: 'native'; extensionId: TrustedRaycastExtensionId; sessionId: string; generation: string; requestId: string } & ({ kind: 'selectedText' } | ({ revision: number; eventId: string } & ({ kind: 'copy'; text: string } | { kind: 'paste'; text: string } | { kind: 'openGoogleTranslate'; url: string } | { kind: 'savePreferences'; preferences: Readonly<Record<string, TrustedRaycastPreference>> })))
>

export type TrustedRaycastNativeOutcome = Readonly<{ type: 'nativeOutcome'; extensionId: TrustedRaycastExtensionId; requestId: string; succeeded: boolean; message: string; result?: string }>

export function isTrustedRaycastNativeRequest(value: unknown): value is TrustedRaycastNativeRequest {
  if (!isRecord(value) || value.type !== 'native' || getTrustedRaycastDescriptor(value.extensionId) === undefined || !boundedString(value.sessionId, 128) || !boundedString(value.generation, 128) || !boundedString(value.requestId, 128)) return false
  const base = ['type', 'extensionId', 'sessionId', 'generation', 'requestId', 'kind']
  if (value.kind === 'selectedText') return value.extensionId === 'google-translate' && exactKeys(value, base)
  const scoped = ['revision', 'eventId']
  const scopedValue = (keys: readonly string[]): boolean => exactKeys(value, keys) && boundedString(value.eventId, 128) && Number.isSafeInteger(value.revision) && (value.revision as number) >= 0
  if (value.kind === 'copy' || value.kind === 'paste') return scopedValue([...base, ...scoped, 'text']) && boundedString(value.text, 128 * 1024)
  if (value.kind === 'savePreferences') return scopedValue([...base, ...scoped, 'preferences']) && (value.extensionId === 'google-translate' ? isTrustedRaycastPreferences(value.preferences) : value.extensionId === 'kaomoji-search' && isKaomojiPreferences(value.preferences))
  if (value.kind !== 'openGoogleTranslate' || value.extensionId !== 'google-translate' || !scopedValue([...base, ...scoped, 'url']) || !boundedString(value.url, 128 * 1024)) return false
  try {
    const url = new URL(value.url)
    return url.origin === 'https://translate.google.com' && !url.username && !url.password && !url.hash && url.pathname === '/'
      && JSON.stringify([...url.searchParams.keys()].sort()) === JSON.stringify(['op', 'sl', 'text', 'tl'])
      && url.searchParams.get('op') === 'translate'
      && LANGUAGE_CODE.test(url.searchParams.get('sl') ?? '')
      && LANGUAGE_CODE.test(url.searchParams.get('tl') ?? '')
      && boundedString(url.searchParams.get('text'))
  } catch { return false }
}

export function isTrustedRaycastNativeOutcome(value: unknown): value is TrustedRaycastNativeOutcome {
  if (!isRecord(value) || value.type !== 'nativeOutcome' || getTrustedRaycastDescriptor(value.extensionId) === undefined || !boundedString(value.requestId, 128) || typeof value.succeeded !== 'boolean' || !boundedString(value.message, 512)) return false
  const keys = ['type', 'extensionId', 'requestId', 'succeeded', 'message', ...(Object.hasOwn(value, 'result') ? ['result'] : [])]
  return exactKeys(value, keys) && (value.result === undefined || boundedString(value.result, MAX_TEXT))
}

export function isBoundedTrustedRaycastMessage(value: unknown): boolean {
  try { return jsonSafe(value) && byteLength(JSON.stringify(value)) <= MAX_MESSAGE } catch { return false }
}
