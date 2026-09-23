import { isTrustedRaycastPreferences, isKaomojiPreferences, isTrustedRaycastTrustState, type TrustedRaycastTrustState } from './trusted-raycast-contract.ts'
import { getTrustedRaycastDescriptor, type TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'
import { readTrustedRaycastCanIUsePreferences } from './trusted-raycast-can-i-use-preferences.ts'
import { TRANSLATE_SETTINGS_LANGUAGES } from './trusted-raycast-settings-catalog.ts'

export const TRUSTED_SETTINGS_CHANNELS = Object.freeze({ get: 'launcher:extension-settings-get', update: 'launcher:extension-settings-update', enable: 'launcher:extension-settings-enable' })
export type TrustedSettingsValues = Readonly<Record<string, string | boolean>>
export type TrustedSettingsSnapshot = Readonly<{ extensionId: TrustedRaycastExtensionId; revision: string; values: TrustedSettingsValues; state: TrustedRaycastTrustState; proxyRedacted: boolean }>
export type TrustedSettingsUpdate = Readonly<{ extensionId: TrustedRaycastExtensionId; revision: string; patch: TrustedSettingsValues }>
export type TrustedSettingsResult = Readonly<{ ok: true; snapshot: TrustedSettingsSnapshot } | { ok: false; reason: 'conflict' | 'invalid' | 'unavailable' }>
const keys = {
  'google-translate': ['langFrom', 'lang1', 'lang2', 'autoInput', 'defaultAction', 'prioritizeCrossLanguage', 'proxy'],
  'kaomoji-search': ['displayMode', 'primaryAction'],
  'can-i-use': ['showReleaseDate', 'showPartialSupport', 'briefMode', 'defaultQuery', 'path', 'environment'],
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).every(key => typeof key === 'string' && Object.getOwnPropertyDescriptor(value, key)?.get === undefined)
}
function exact(value: Record<string, unknown>, names: readonly string[]): boolean { return Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)) }
export function parseTrustedSettingsId(value: unknown): TrustedRaycastExtensionId {
  const descriptor = getTrustedRaycastDescriptor(value)
  if (!descriptor) throw new Error('Invalid extension settings identity')
  return descriptor.extensionId
}
export function isSafeSettingsProxy(value: unknown): value is string {
  if (value === '') return true
  if (typeof value !== 'string' || value.length > 2048 || /[\s\0]/u.test(value)) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname !== '' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
  } catch { return false }
}
export function parseTrustedSettingsUpdate(value: unknown): TrustedSettingsUpdate {
  if (!record(value) || !exact(value, ['extensionId', 'revision', 'patch'])) throw new Error('Invalid extension settings update')
  const extensionId = parseTrustedSettingsId(value.extensionId)
  if (typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/u.test(value.revision) || !record(value.patch)) throw new Error('Invalid extension settings update')
  const entries = Object.entries(value.patch)
  if (entries.length === 0 || entries.some(([key, entry]) => !keys[extensionId].includes(key) || (typeof entry !== 'boolean' && (typeof entry !== 'string' || entry.length > 4096)))) throw new Error('Invalid extension settings fields')
  if (extensionId === 'google-translate') for (const [key, entry] of entries) {
    if (key === 'proxy' && !isSafeSettingsProxy(entry)) throw new Error('Use an HTTP or HTTPS proxy without credentials')
    if (['langFrom', 'lang1', 'lang2'].includes(key) && (typeof entry !== 'string' || !Object.hasOwn(TRANSLATE_SETTINGS_LANGUAGES, entry))) throw new Error('Invalid translation language')
  }
  return Object.freeze({ extensionId, revision: value.revision, patch: Object.freeze({ ...value.patch }) as TrustedSettingsValues })
}
export function validTrustedSettingsValues(id: TrustedRaycastExtensionId, values: unknown): values is TrustedSettingsValues {
  if (id === 'google-translate') return isTrustedRaycastPreferences(values)
  if (id === 'kaomoji-search') return isKaomojiPreferences(values)
  try { readTrustedRaycastCanIUsePreferences(values); return true } catch { return false }
}
export function parseTrustedSettingsSnapshot(value: unknown): TrustedSettingsSnapshot {
  if (!record(value) || !exact(value, ['extensionId', 'revision', 'values', 'state', 'proxyRedacted'])) throw new Error('Invalid extension settings snapshot')
  const id = parseTrustedSettingsId(value.extensionId)
  if (typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/u.test(value.revision) || typeof value.proxyRedacted !== 'boolean' || !validTrustedSettingsValues(id, value.values) || !isTrustedRaycastTrustState(value.state)) throw new Error('Invalid extension settings snapshot')
  if (id === 'google-translate' && !isSafeSettingsProxy(value.values.proxy)) throw new Error('Unsafe proxy projection')
  if (id === 'can-i-use' && (value.values.path !== '' || JSON.stringify(value.values).length > 8192)) throw new Error('Unsafe configuration projection')
  return value as TrustedSettingsSnapshot
}
export function parseTrustedSettingsResult(value: unknown): TrustedSettingsResult {
  if (!record(value)) throw new Error('Invalid extension settings result')
  if (value.ok === true && exact(value, ['ok', 'snapshot'])) return { ok: true, snapshot: parseTrustedSettingsSnapshot(value.snapshot) }
  if (value.ok === false && exact(value, ['ok', 'reason']) && ['conflict', 'invalid', 'unavailable'].includes(value.reason as string)) return value as TrustedSettingsResult
  throw new Error('Invalid extension settings result')
}
