import type { UserRaycastCandidate } from './user-raycast-install.ts'
import type { UserRaycastMessage } from './user-raycast-manager.ts'

export const USER_RAYCAST_IPC = Object.freeze({
  state: 'user-raycast:state', choose: 'user-raycast:choose', approve: 'user-raycast:approve',
  mutate: 'user-raycast:mutate', open: 'user-raycast:open', event: 'user-raycast:event',
  close: 'user-raycast:close', view: 'user-raycast:view',
})
export type UserRaycastStatus = Readonly<{ candidate?: UserRaycastCandidate; digest: string; enabled: boolean; hasPrevious: boolean; installed: boolean; mode?: 'no-view' }>
export type UserRaycastMutation = 'enable' | 'disable' | 'remove' | 'recover'
export type UserRaycastEvent = Readonly<{ revision: number; eventId: string; kind: 'action' | 'searchChanged'; value?: string }>
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const identity = (value: unknown): boolean => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)
const commandIdentity = (value: unknown): boolean => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
const exact = (value: object, expected: string[]): boolean => JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected.sort())
export function isUserRaycastCandidate(value: unknown): value is UserRaycastCandidate {
  return record(value) && exact(value, ['command', 'digest', 'extensionId', 'title', ...(['mode', 'version', 'license', 'source'] as const).filter(key => Object.hasOwn(value, key))])
    && commandIdentity(value.command) && identity(value.extensionId) && digest(value.digest) && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 128
    && (value.mode === undefined || value.mode === 'no-view')
    && (value.version === undefined || typeof value.version === 'string' && value.version.length <= 64)
    && (value.license === undefined || typeof value.license === 'string' && value.license.length <= 128)
    && (value.source === undefined || typeof value.source === 'string' && value.source.length <= 512 && value.source.startsWith('https://'))
}
export function isUserRaycastStatus(value: unknown): value is UserRaycastStatus {
  return record(value) && exact(value, ['digest', 'enabled', 'hasPrevious', 'installed', ...(Object.hasOwn(value, 'candidate') ? ['candidate'] : []), ...(Object.hasOwn(value, 'mode') ? ['mode'] : [])])
    && (value.digest === '' || digest(value.digest)) && typeof value.enabled === 'boolean' && typeof value.hasPrevious === 'boolean' && typeof value.installed === 'boolean'
    && (value.mode === undefined || value.mode === 'no-view')
    && (!Object.hasOwn(value, 'candidate') || isUserRaycastCandidate(value.candidate))
}
export function isUserRaycastApproval(value: unknown): value is Readonly<{ digest: string }> {
  return record(value) && exact(value, ['digest']) && digest(value.digest)
}
export function isUserRaycastMutation(value: unknown): value is UserRaycastMutation {
  return value === 'enable' || value === 'disable' || value === 'remove' || value === 'recover'
}
export function isUserRaycastViewMessage(value: unknown): value is UserRaycastMessage {
  if (!record(value) || !identity(value.extensionId) || typeof value.sessionId !== 'string' || value.sessionId.length > 128 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return false
  if (value.type === 'ready' || value.type === 'patch') return record(value.root) && value.root.type === 'root' && Array.isArray(value.root.children)
  if (value.type === 'outcome') return typeof value.eventId === 'string' && value.eventId.length <= 128 && typeof value.succeeded === 'boolean' && typeof value.message === 'string' && value.message.length <= 512
  if (value.type === 'toast') return typeof value.title === 'string' && value.title.length <= 512 && typeof value.message === 'string' && value.message.length <= 4096 && ['failure', 'success', 'animated'].includes(value.style as string)
  return value.type === 'error' && typeof value.message === 'string' && value.message.length <= 512
}
export function isUserRaycastEvent(value: unknown): value is UserRaycastEvent {
  if (!record(value) || !exact(value, ['revision', 'eventId', 'kind', ...(Object.hasOwn(value, 'value') ? ['value'] : [])]) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || typeof value.eventId !== 'string' || value.eventId.length > 128) return false
  return value.kind === 'action' && !Object.hasOwn(value, 'value') || value.kind === 'searchChanged' && typeof value.value === 'string' && value.value.length <= 16384
}
