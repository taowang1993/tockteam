import { createHmac, randomBytes } from 'node:crypto'
import { KAOMOJI_PREFERENCE_DEFAULTS, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, type TrustedRaycastTrustState } from './trusted-raycast-contract.ts'
import { TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, prepareTrustedRaycastCanIUsePreferences } from './trusted-raycast-can-i-use-preferences.ts'
import { CAN_I_USE_SETTINGS_DEFAULT_TARGETS, CAN_I_USE_SETTINGS_TARGETS } from './trusted-raycast-settings-catalog.ts'
import { isSafeSettingsProxy, parseTrustedSettingsId, parseTrustedSettingsSnapshot, parseTrustedSettingsUpdate, validTrustedSettingsValues, type TrustedSettingsResult, type TrustedSettingsSnapshot, type TrustedSettingsValues } from './trusted-raycast-settings-contract.ts'
import type { TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'

/** Main-owned preferences. No source imports, runtime startup, workspace probes or installation. */
export function createTrustedRaycastSettings(options: Readonly<{
  read: (id: TrustedRaycastExtensionId) => TrustedSettingsValues
  write: (id: TrustedRaycastExtensionId, values: TrustedSettingsValues) => Promise<void>
  trust: (id: TrustedRaycastExtensionId) => TrustedRaycastTrustState
  setEnabled: (id: TrustedRaycastExtensionId, enabled: boolean) => Promise<void>
}>) {
  const secret = randomBytes(32)
  let tail: Promise<unknown> = Promise.resolve()
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation, operation)
    tail = next.catch(() => undefined)
    return next
  }
  const normalize = (id: TrustedRaycastExtensionId, raw: TrustedSettingsValues): TrustedSettingsValues => {
    if (Object.keys(raw).length) return raw
    if (id === 'google-translate') return TRUSTED_RAYCAST_PREFERENCE_DEFAULTS
    if (id === 'kaomoji-search') return KAOMOJI_PREFERENCE_DEFAULTS
    return { ...TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, defaultQuery: CAN_I_USE_SETTINGS_DEFAULT_TARGETS.join(','), environment: 'production' }
  }
  const read = (id: TrustedRaycastExtensionId) => normalize(id, options.read(id))
  // Opaque keyed revision: even low-entropy secret-bearing URLs cannot be guessed from it.
  const revision = (id: TrustedRaycastExtensionId, values: TrustedSettingsValues) => createHmac('sha256', secret).update(JSON.stringify([id, Object.entries(values).sort(([a], [b]) => a.localeCompare(b))])).digest('hex')
  const get = (raw: unknown): TrustedSettingsSnapshot => {
    const id = parseTrustedSettingsId(raw)
    const values = read(id)
    const proxyRedacted = id === 'google-translate' && !isSafeSettingsProxy(values.proxy)
    return parseTrustedSettingsSnapshot({ extensionId: id, revision: revision(id, values), values: { ...values, ...(proxyRedacted ? { proxy: '' } : {}), ...(id === 'can-i-use' ? { path: '' } : {}) }, state: options.trust(id), proxyRedacted })
  }
  const prepare = (id: TrustedRaycastExtensionId, values: TrustedSettingsValues): TrustedSettingsValues => {
    if (!validTrustedSettingsValues(id, values)) throw new Error('Invalid preferences')
    return id === 'can-i-use' ? prepareTrustedRaycastCanIUsePreferences(values, { canonicalTargets: CAN_I_USE_SETTINGS_TARGETS }).preferences : values
  }
  return Object.freeze({
    get,
    update(raw: unknown): Promise<TrustedSettingsResult> {
      return serialize(async () => {
        let request
        try { request = parseTrustedSettingsUpdate(raw) } catch { return { ok: false, reason: 'invalid' } }
        const current = read(request.extensionId)
        if (request.revision !== revision(request.extensionId, current)) return { ok: false, reason: 'conflict' }
        let next
        try { next = prepare(request.extensionId, { ...current, ...request.patch }) }
        catch { return { ok: false, reason: 'invalid' } }
        try { await options.write(request.extensionId, next); return { ok: true, snapshot: get(request.extensionId) } }
        catch { return { ok: false, reason: 'unavailable' } }
      })
    },
    saveFromCommand(id: TrustedRaycastExtensionId, values: TrustedSettingsValues, previous: TrustedSettingsValues): Promise<void> {
      return serialize(async () => {
        if (revision(id, read(id)) !== revision(id, normalize(id, previous))) throw new Error('Preferences changed in Settings. Reopen the extension before saving.')
        await options.write(id, prepare(id, values))
      })
    },
    async setEnabled(raw: unknown, enabled: boolean): Promise<TrustedSettingsSnapshot> {
      const id = parseTrustedSettingsId(raw)
      const state = options.trust(id)
      if (typeof enabled !== 'boolean' || !state.active || !state.installed || (enabled && (!state.digestApproved || state.recovery !== ''))) throw new Error('Extension must be explicitly set up before enabling')
      await options.setEnabled(id, enabled)
      return get(id)
    },
  })
}
export type TrustedRaycastSettings = ReturnType<typeof createTrustedRaycastSettings>
