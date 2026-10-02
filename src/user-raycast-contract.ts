import type { UserRaycastCandidate } from './user-raycast-install.ts'
import type { UserRaycastMessage } from './user-raycast-manager.ts'
import type { UserRaycastSourceCandidate } from './user-raycast-registry.ts'

export const USER_RAYCAST_IPC = Object.freeze({
  state: 'user-raycast:state', choose: 'user-raycast:choose', approve: 'user-raycast:approve',
  sourcePrepare: 'user-raycast:source-prepare', sourceBuild: 'user-raycast:source-build',
  mutate: 'user-raycast:mutate', open: 'user-raycast:open', event: 'user-raycast:event',
  close: 'user-raycast:close', view: 'user-raycast:view',
})
export type UserRaycastStatus = Readonly<{ candidate?: UserRaycastCandidate; sourceCandidate?: UserRaycastSourceCandidate; digest: string; enabled: boolean; hasPrevious: boolean; installed: boolean; mode?: 'no-view' | 'menu-bar' }>
export type UserRaycastMutation = 'enable' | 'disable' | 'remove' | 'recover'
export type UserRaycastFieldKind = 'text' | 'password' | 'textarea' | 'checkbox' | 'dropdown' | 'tagpicker'
export type UserRaycastFieldValue = string | boolean | readonly string[]
export type UserRaycastFieldEvent = Readonly<{ sessionId: string; revision: number; eventId: string; requestId: string; kind: 'fieldChanged' | 'fieldFocused' | 'fieldBlurred' | 'fieldSearchChanged'; value: UserRaycastFieldValue }>
export type UserRaycastEvent = Readonly<{ sessionId?: string; revision: number; eventId: string; kind: 'action' | 'searchChanged'; value?: string }> | UserRaycastFieldEvent
export function isUserRaycastFieldValue(kind: unknown, value: unknown): value is UserRaycastFieldValue {
  if (kind === 'tagpicker') return Array.isArray(value) && value.length <= 64 && Object.keys(value).length === value.length && !Object.hasOwn(value, 'toJSON')
    && Array.from(value).every(entry => typeof entry === 'string' && entry.length <= 16384) && new Set(value).size === value.length
    && new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16384
  return kind === 'checkbox' ? typeof value === 'boolean' : ['text', 'password', 'textarea', 'dropdown'].includes(kind as string) && typeof value === 'string' && value.length <= 16384
}
export type UserRaycastOAuthCleanupReason = 'transport' | 'timeout' | 'unknown' | `http-${number}`
export type UserRaycastOAuthCleanupCounts = Readonly<{ attempted: number; confirmed: number; failed: number }>
export type UserRaycastOAuthCleanupDiagnostic = Readonly<{ type: 'oauth-cleanup'; extensionId: 'linear'; sessionId: string; reasons: readonly UserRaycastOAuthCleanupReason[]; counts?: UserRaycastOAuthCleanupCounts }>
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const identity = (value: unknown): boolean => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)
const commandIdentity = (value: unknown): boolean => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
const exact = (value: object, expected: string[]): boolean => JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected.sort())
// Host-only shutdown details: no provider messages, bodies, URLs or credential identifiers.
export function isUserRaycastOAuthCleanupReasons(value: unknown): value is readonly UserRaycastOAuthCleanupReason[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 512 && Array.from(value).every(reason => typeof reason === 'string'
    && (reason === 'transport' || reason === 'timeout' || reason === 'unknown' || reason.length === 8 && /^http-[1-5]\d{2}$/.test(reason) && reason !== 'http-200'))
}
export function isUserRaycastOAuthCleanupCounts(value: unknown): value is UserRaycastOAuthCleanupCounts {
  if (!record(value) || !exact(value, ['attempted', 'confirmed', 'failed'])) return false
  const { attempted, confirmed, failed } = value
  return typeof attempted === 'number' && typeof confirmed === 'number' && typeof failed === 'number'
    && [attempted, confirmed, failed].every(count => Number.isSafeInteger(count) && count >= 0 && count <= 512) && attempted === confirmed + failed
}
export function isUserRaycastOAuthCleanupDiagnostic(value: unknown): value is UserRaycastOAuthCleanupDiagnostic {
  return record(value) && exact(value, ['type', 'extensionId', 'sessionId', 'reasons', ...(Object.hasOwn(value, 'counts') ? ['counts'] : [])]) && value.type === 'oauth-cleanup' && value.extensionId === 'linear'
    && typeof value.sessionId === 'string' && value.sessionId.length <= 128 && isUserRaycastOAuthCleanupReasons(value.reasons)
    && (!Object.hasOwn(value, 'counts') || isUserRaycastOAuthCleanupCounts(value.counts) && value.counts.failed >= value.reasons.length)
}
export function isUserRaycastCandidate(value: unknown): value is UserRaycastCandidate {
  return record(value) && exact(value, ['command', 'digest', 'extensionId', 'title', ...(['mode', 'version', 'license', 'source'] as const).filter(key => Object.hasOwn(value, key))])
    && commandIdentity(value.command) && identity(value.extensionId) && digest(value.digest) && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 128
    && (value.mode === undefined || value.mode === 'no-view' || value.mode === 'menu-bar')
    && (value.version === undefined || typeof value.version === 'string' && value.version.length <= 64)
    && (value.license === undefined || typeof value.license === 'string' && value.license.length <= 128)
    && (value.source === undefined || typeof value.source === 'string' && value.source.length <= 512 && value.source.startsWith('https://'))
}
export function isUserRaycastSourceSelection(value: unknown): value is Readonly<{ extensionId: string; command: string }> {
  return record(value) && exact(value, ['extensionId', 'command']) && identity(value.extensionId) && commandIdentity(value.command)
}
export function isUserRaycastSourceCandidate(value: unknown): value is UserRaycastSourceCandidate {
  return record(value) && exact(value, ['command', 'digest', 'extensionId', 'title', 'license', 'revision', 'tree', 'files', 'bytes', 'source', 'mode', ...(Object.hasOwn(value, 'version') ? ['version'] : [])])
    && isUserRaycastSourceSelection({ extensionId: value.extensionId, command: value.command }) && digest(value.digest)
    && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 128 && value.license === 'MIT'
    && typeof value.revision === 'string' && /^[a-f0-9]{40}$/.test(value.revision) && typeof value.tree === 'string' && /^[a-f0-9]{40}$/.test(value.tree)
    && Number.isSafeInteger(value.files) && (value.files as number) > 0 && (value.files as number) <= 128
    && Number.isSafeInteger(value.bytes) && (value.bytes as number) > 0 && (value.bytes as number) <= 16 * 1024 * 1024
    && (value.mode === 'view' || value.mode === 'no-view' || value.mode === 'menu-bar')
    && value.source === `https://github.com/raycast/extensions/tree/${value.revision}/extensions/${value.extensionId}`
    && (value.version === undefined || typeof value.version === 'string' && value.version.length <= 64)
}
export function isUserRaycastStatus(value: unknown): value is UserRaycastStatus {
  return record(value) && exact(value, ['digest', 'enabled', 'hasPrevious', 'installed', ...(Object.hasOwn(value, 'candidate') ? ['candidate'] : []), ...(Object.hasOwn(value, 'sourceCandidate') ? ['sourceCandidate'] : []), ...(Object.hasOwn(value, 'mode') ? ['mode'] : [])])
    && (value.digest === '' || digest(value.digest)) && typeof value.enabled === 'boolean' && typeof value.hasPrevious === 'boolean' && typeof value.installed === 'boolean'
    && (value.mode === undefined || value.mode === 'no-view' || value.mode === 'menu-bar')
    && (!Object.hasOwn(value, 'candidate') || isUserRaycastCandidate(value.candidate))
    && (!Object.hasOwn(value, 'sourceCandidate') || isUserRaycastSourceCandidate(value.sourceCandidate))
}
export function isUserRaycastApproval(value: unknown): value is Readonly<{ digest: string }> {
  return record(value) && exact(value, ['digest']) && digest(value.digest)
}
export function isUserRaycastMutation(value: unknown): value is UserRaycastMutation {
  return value === 'enable' || value === 'disable' || value === 'remove' || value === 'recover'
}
export function isUserRaycastAuthUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    const params = url.searchParams
    return url.protocol === 'https:' && url.host === 'linear.app' && url.pathname === '/oauth/authorize' && !url.hash && !url.username && !url.password
      && [...params.keys()].sort().join(',') === 'actor,client_id,code_challenge,code_challenge_method,redirect_uri,response_type,scope,state'
      && params.get('redirect_uri') === 'http://127.0.0.1:38437/linear/callback' && params.get('response_type') === 'code'
      && params.get('scope') === 'read' && params.get('actor') === 'user' && params.get('code_challenge_method') === 'S256'
      && /^[A-Za-z0-9_-]{43}$/.test(params.get('state') ?? '') && /^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') ?? '')
      && /^[A-Za-z0-9_-]{1,128}$/.test(params.get('client_id') ?? '')
  } catch { return false }
}
export function isUserRaycastViewMessage(value: unknown): value is UserRaycastMessage {
  if (!record(value) || !identity(value.extensionId) || typeof value.sessionId !== 'string' || value.sessionId.length > 128 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return false
  if (value.type === 'auth-url') return value.extensionId === 'linear' && isUserRaycastAuthUrl(value.url)
  if (value.type === 'ready' || value.type === 'patch') return record(value.root) && value.root.type === 'root' && Array.isArray(value.root.children)
  if (value.type === 'outcome') return typeof value.eventId === 'string' && value.eventId.length <= 128 && typeof value.succeeded === 'boolean' && typeof value.message === 'string' && value.message.length <= 512
  if (value.type === 'toast') return typeof value.title === 'string' && value.title.length <= 512 && typeof value.message === 'string' && value.message.length <= 4096 && ['failure', 'success', 'animated'].includes(value.style as string)
  return value.type === 'error' && typeof value.message === 'string' && value.message.length <= 512
}
export function isUserRaycastEvent(value: unknown): value is UserRaycastEvent {
  if (!record(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || typeof value.eventId !== 'string' || !value.eventId || value.eventId.length > 128) return false
  const session = typeof value.sessionId === 'string' && value.sessionId.length > 0 && value.sessionId.length <= 128
  if (value.kind === 'fieldChanged' || value.kind === 'fieldFocused' || value.kind === 'fieldBlurred' || value.kind === 'fieldSearchChanged') return session
    && exact(value, ['sessionId', 'revision', 'eventId', 'requestId', 'kind', 'value']) && typeof value.requestId === 'string' && value.requestId.length > 0 && value.requestId.length <= 128
    && (value.kind === 'fieldSearchChanged' ? isUserRaycastFieldValue('text', value.value) : isUserRaycastFieldValue('checkbox', value.value) || isUserRaycastFieldValue('text', value.value) || isUserRaycastFieldValue('tagpicker', value.value))
  if (!exact(value, ['revision', 'eventId', 'kind', ...(Object.hasOwn(value, 'sessionId') ? ['sessionId'] : []), ...(Object.hasOwn(value, 'value') ? ['value'] : [])]) || Object.hasOwn(value, 'sessionId') && !session) return false
  return value.kind === 'action' && !Object.hasOwn(value, 'value') || value.kind === 'searchChanged' && typeof value.value === 'string' && value.value.length <= 16384
}
