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

/** Capability activation must be live; Translate additionally requires exact approved current bytes. */
type CatalogTrust = Readonly<{ digest: string; digestApproved: boolean; enabled: boolean; installed: boolean }>
export function trustedRaycastCatalog(active: boolean, trust: CatalogTrust, kaomojiTrust?: CatalogTrust, canIUseTrust?: CatalogTrust): readonly LauncherInternalResultItem[] {
  if (!active) return []
  const trustItem: LauncherInternalResultItem = {
    id: TRUSTED_RAYCAST_TRUST_RESULT_ID, name: 'Trusted Extensions', sourceExtension: 'Trusted Raycast', imageKey: 'ueli-command',
    description: 'Install and manage reviewed trusted extensions',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_TRUST_HANDLER, argument: 'manage', description: 'Manage Trusted Extensions', hideWindowAfterInvocation: false, requiresConfirmation: false },
  }
  const commands: LauncherInternalResultItem[] = []
  if (trust.installed && trust.enabled && trust.digestApproved && trust.digest !== '') commands.push({
    id: TRUSTED_RAYCAST_RESULT_ID, name: 'Translate', sourceExtension: 'Trusted Raycast', imageKey: TRUSTED_RAYCAST_TRANSLATE_IMAGE_KEY,
    description: 'Google Translate · reviewed trusted extension',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_TRANSLATE_HANDLER, argument: 'translate', description: 'Open Translate', hideWindowAfterInvocation: false, requiresConfirmation: false },
  })
  if (kaomojiTrust?.installed && kaomojiTrust.enabled && kaomojiTrust.digestApproved && kaomojiTrust.digest !== '') commands.push({
    id: TRUSTED_RAYCAST_KAOMOJI_RESULT_ID, name: 'Search Kaomoji', sourceExtension: 'Trusted Raycast', imageKey: TRUSTED_RAYCAST_KAOMOJI_IMAGE_KEY,
    description: 'Kaomoji Search · reviewed trusted extension',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_KAOMOJI_HANDLER, argument: 'index', description: 'Open Kaomoji Search', hideWindowAfterInvocation: false, requiresConfirmation: false },
  })
  if (canIUseTrust?.installed && canIUseTrust.enabled && canIUseTrust.digestApproved && canIUseTrust.digest !== '') commands.push({
    id: TRUSTED_RAYCAST_CAN_I_USE_RESULT_ID, name: 'Can I Use', sourceExtension: 'Trusted Raycast', imageKey: TRUSTED_RAYCAST_CAN_I_USE_IMAGE_KEY,
    description: 'Web feature support · reviewed trusted extension',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_CAN_I_USE_HANDLER, argument: 'index', description: 'Open Can I Use', hideWindowAfterInvocation: false, requiresConfirmation: false },
  })
  return [...commands, trustItem]
}

/** Bounded development proof browser admits only the exact Google Translate origin; unparsable destinations are always denied. */
export function isTrustedTranslateProofUrl(raw: string): boolean {
  try { return new URL(raw).origin === 'https://translate.google.com' } catch { return false }
}
