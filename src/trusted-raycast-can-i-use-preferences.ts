import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'
import { isTrustedRaycastCanIUseEnvironment, normalizeTrustedRaycastCanIUseQuery, type TrustedRaycastCanIUseQueryOptions } from './trusted-raycast-can-i-use-query.ts'
import { prepareTrustedRaycastCanIUseWorkspace } from './trusted-raycast-can-i-use-workspace.ts'

export type TrustedRaycastCanIUsePreferences = Readonly<{
  showReleaseDate: boolean
  showPartialSupport: boolean
  briefMode: boolean
  defaultQuery: string
  path: string
  environment: string
}>

/** Setup-form values only: the unproved defaults selector must still fail command preparation. */
export const TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS: TrustedRaycastCanIUsePreferences = Object.freeze({
  showReleaseDate: true, showPartialSupport: false, briefMode: false,
  defaultQuery: 'defaults', path: '', environment: '',
})

function readPreferences(value: unknown): TrustedRaycastCanIUsePreferences {
  try {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error()
    const names = Object.keys(TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS)
    const keys = Reflect.ownKeys(value)
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) throw new Error()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const copy: Record<string, boolean | string> = {}
    for (const name of names) {
      const descriptor = descriptors[name]!
      const expectedType = typeof TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS[name as keyof TrustedRaycastCanIUsePreferences]
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable || typeof descriptor.value !== expectedType) throw new Error()
      copy[name] = descriptor.value
    }
    return Object.freeze(copy) as TrustedRaycastCanIUsePreferences
  } catch { return failTrustedRaycastCanIUse('CONFIG_INVALID') }
}

/** Validate before initializing the unchanged command's module-level query. Never probes files. */
export function prepareTrustedRaycastCanIUsePreferences(value: unknown, options: TrustedRaycastCanIUseQueryOptions) {
  const preferences = readPreferences(value)
  const workspace = prepareTrustedRaycastCanIUseWorkspace(preferences.path)
  const environment = preferences.environment || 'production'
  if (!isTrustedRaycastCanIUseEnvironment(environment)) return failTrustedRaycastCanIUse('CONFIG_INVALID')
  const targets = Object.freeze(normalizeTrustedRaycastCanIUseQuery(preferences.defaultQuery, options))
  return Object.freeze({
    preferences: Object.freeze({ ...preferences, path: workspace.path, environment, defaultQuery: targets.join(',') }),
    targets,
  })
}
