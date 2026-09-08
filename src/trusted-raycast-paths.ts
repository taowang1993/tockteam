import { join } from 'node:path'
import { getTrustedRaycastDescriptor, type TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'

export type TrustedRaycastDataPaths = Readonly<{
  installRoot: string
  preferencesFile: string
  stateFile: string
  trustFile: string
}>

/** Fixed main-owned namespaces; Google keeps its compatibility paths. */
export function trustedRaycastDataPaths(userData: string, extensionId: TrustedRaycastExtensionId): TrustedRaycastDataPaths {
  if (getTrustedRaycastDescriptor(extensionId) === undefined) throw new Error('Invalid trusted extension identity')
  const launcher = join(userData, 'launcher')
  if (extensionId === 'google-translate') return Object.freeze({
    installRoot: join(launcher, 'trusted-raycast-install'),
    preferencesFile: join(launcher, 'trusted-raycast-preferences.json'),
    stateFile: join(launcher, 'trusted-raycast-state.json'),
    trustFile: join(launcher, 'trusted-raycast-trust.json'),
  })
  return Object.freeze({
    installRoot: join(launcher, 'trusted-raycast-install', 'kaomoji-search'),
    preferencesFile: join(launcher, 'trusted-raycast-preferences-kaomoji-search.json'),
    stateFile: join(launcher, 'trusted-raycast-state-kaomoji-search.json'),
    trustFile: join(launcher, 'trusted-raycast-trust-kaomoji-search.json'),
  })
}
