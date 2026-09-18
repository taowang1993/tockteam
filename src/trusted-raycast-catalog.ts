import type { TrustedRaycastRuntimeExtensionId } from './trusted-raycast-descriptors.ts'
import type { LauncherInternalResultItem } from './launcher-actions.ts'
export const TRUSTED_RAYCAST_TRANSLATE_HANDLER = 'trusted-raycast-translate'
export const TRUSTED_RAYCAST_KAOMOJI_HANDLER = 'trusted-raycast-kaomoji'
export const TRUSTED_RAYCAST_CAN_I_USE_HANDLER = 'trusted-raycast-can-i-use'
export const TRUSTED_RAYCAST_CAN_I_USE_RESULT_ID = 'trusted-raycast:can-i-use:index'
export const TRUSTED_RAYCAST_CAN_I_USE_IMAGE_KEY = 'trusted-raycast-can-i-use'
export const TRUSTED_RAYCAST_TRUST_HANDLER = 'trusted-raycast-trust'
export const TRUSTED_RAYCAST_RESULT_ID = 'trusted-raycast:google-translate:translate'
export const TRUSTED_RAYCAST_KAOMOJI_RESULT_ID = 'trusted-raycast:kaomoji-search:index'
export const TRUSTED_RAYCAST_TRUST_RESULT_ID = 'trusted-raycast:trust'
export const TRUSTED_RAYCAST_TRANSLATE_IMAGE_KEY = 'trusted-raycast-google-translate'
export const TRUSTED_RAYCAST_KAOMOJI_IMAGE_KEY = 'trusted-raycast-kaomoji-search'

export function trustedRaycastAssetUrl(imageKey: string | undefined): string | undefined {
  return imageKey === TRUSTED_RAYCAST_TRANSLATE_IMAGE_KEY ? './trusted-raycast/google-translate.png'
    : imageKey === TRUSTED_RAYCAST_KAOMOJI_IMAGE_KEY ? './trusted-raycast-kaomoji/kaomoji-search.png'
    : imageKey === TRUSTED_RAYCAST_CAN_I_USE_IMAGE_KEY ? './trusted-raycast-can-i-use/can-i-use.png' : undefined
}

export const trustedRaycastCommands = Object.freeze([
  { extensionId: 'google-translate', id: TRUSTED_RAYCAST_RESULT_ID, name: 'Translate', extensionName: 'Google Translate', imageKey: TRUSTED_RAYCAST_TRANSLATE_IMAGE_KEY, handler: TRUSTED_RAYCAST_TRANSLATE_HANDLER, command: 'translate' },
  { extensionId: 'kaomoji-search', id: TRUSTED_RAYCAST_KAOMOJI_RESULT_ID, name: 'Search Kaomoji', extensionName: 'Kaomoji Search', imageKey: TRUSTED_RAYCAST_KAOMOJI_IMAGE_KEY, handler: TRUSTED_RAYCAST_KAOMOJI_HANDLER, command: 'index' },
  { extensionId: 'can-i-use', id: TRUSTED_RAYCAST_CAN_I_USE_RESULT_ID, name: 'Can I Use', extensionName: 'Can I Use', imageKey: TRUSTED_RAYCAST_CAN_I_USE_IMAGE_KEY, handler: TRUSTED_RAYCAST_CAN_I_USE_HANDLER, command: 'index' },
] as const)
export const trustedRaycastSetupId = (id: TrustedRaycastRuntimeExtensionId): string => `trusted-raycast:setup:${id}`

/** Discovery never admits runtime bytes: unavailable commands dispatch only reviewed setup. */
type CatalogTrust = Readonly<{ digest: string; digestApproved: boolean; enabled: boolean; installed: boolean; candidateAvailable?: boolean; recovery?: string }>
export type TrustedRaycastCatalogAvailability = Readonly<Record<TrustedRaycastRuntimeExtensionId, boolean>>
const TRUSTED_RAYCAST_DEFAULT_AVAILABILITY: TrustedRaycastCatalogAvailability = Object.freeze({ 'google-translate': true, 'kaomoji-search': true, 'can-i-use': true })
export function trustedRaycastCatalog(active: boolean, trust: CatalogTrust, kaomojiTrust?: CatalogTrust, canIUseTrust?: CatalogTrust, availability: TrustedRaycastCatalogAvailability = TRUSTED_RAYCAST_DEFAULT_AVAILABILITY): readonly LauncherInternalResultItem[] {
  if (!active) return []
  const states = [trust, kaomojiTrust, canIUseTrust]
  const commands: LauncherInternalResultItem[] = []
  for (const [index, command] of trustedRaycastCommands.entries()) {
    const state = states[index]
    if (!state || (!state.installed && !state.candidateAvailable && !state.recovery)) continue
    const runnable = availability[command.extensionId] && state.installed && state.enabled && state.digestApproved && state.digest !== '' && !state.recovery
    commands.push({
      id: runnable ? command.id : trustedRaycastSetupId(command.extensionId), name: command.name, sourceExtension: command.extensionName, imageKey: command.imageKey,
      description: command.extensionName,
      defaultAction: { handlerKey: runnable ? command.handler : TRUSTED_RAYCAST_TRUST_HANDLER, argument: runnable ? command.command : command.extensionId, description: runnable ? `Open ${command.name}` : `Set Up ${command.name}`, hideWindowAfterInvocation: false, requiresConfirmation: false },
    })
  }
  return [...commands, {
    id: TRUSTED_RAYCAST_TRUST_RESULT_ID, name: 'Extensions', sourceExtension: 'Extensions', imageKey: 'ueli-command',
    description: 'Manage reviewed extensions',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_TRUST_HANDLER, argument: 'manage', description: 'Manage Extensions', hideWindowAfterInvocation: false, requiresConfirmation: false },
  }]
}

/** Bounded development proof browser admits only the exact Google Translate origin; unparsable destinations are always denied. */
export function isTrustedTranslateProofUrl(raw: string): boolean {
  try { return new URL(raw).origin === 'https://translate.google.com' } catch { return false }
}
