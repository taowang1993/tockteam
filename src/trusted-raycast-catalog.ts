import type { LauncherInternalResultItem } from './launcher-actions.ts'
export const TRUSTED_RAYCAST_TRANSLATE_HANDLER = 'trusted-raycast-translate'
export const TRUSTED_RAYCAST_TRUST_HANDLER = 'trusted-raycast-trust'
export const TRUSTED_RAYCAST_RESULT_ID = 'trusted-raycast:google-translate:translate'
export const TRUSTED_RAYCAST_TRUST_RESULT_ID = 'trusted-raycast:trust'
export const TRUSTED_RAYCAST_TRANSLATE_IMAGE_KEY = 'trusted-raycast-google-translate'

export function trustedRaycastAssetUrl(imageKey: string | undefined): string | undefined {
  return imageKey === TRUSTED_RAYCAST_TRANSLATE_IMAGE_KEY ? './trusted-raycast/google-translate.png' : undefined
}

/** Capability activation must be live; Translate additionally requires exact approved current bytes. */
export function trustedRaycastCatalog(active: boolean, trust: Readonly<{ digest: string; digestApproved: boolean; enabled: boolean; installed: boolean }>): readonly LauncherInternalResultItem[] {
  if (!active) return []
  const trustItem: LauncherInternalResultItem = {
    id: TRUSTED_RAYCAST_TRUST_RESULT_ID, name: 'Trusted Extensions', sourceExtension: 'Trusted Raycast', imageKey: 'ueli-command',
    description: 'Install and manage reviewed trusted extensions',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_TRUST_HANDLER, argument: 'manage', description: 'Manage Trusted Extensions', hideWindowAfterInvocation: false, requiresConfirmation: false },
  }
  if (!trust.installed || !trust.enabled || !trust.digestApproved || trust.digest === '') return [trustItem]
  return [{
    id: TRUSTED_RAYCAST_RESULT_ID, name: 'Translate', sourceExtension: 'Trusted Raycast', imageKey: TRUSTED_RAYCAST_TRANSLATE_IMAGE_KEY,
    description: 'Google Translate · reviewed trusted extension',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_TRANSLATE_HANDLER, argument: 'translate', description: 'Open Translate', hideWindowAfterInvocation: false, requiresConfirmation: false },
  }, trustItem]
}

/** Bounded development proof browser admits only the exact Google Translate origin; unparsable destinations are always denied. */
export function isTrustedTranslateProofUrl(raw: string): boolean {
  try { return new URL(raw).origin === 'https://translate.google.com' } catch { return false }
}
