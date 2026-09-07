import type { LauncherInternalResultItem } from './launcher-actions.ts'
export const TRUSTED_RAYCAST_TRANSLATE_HANDLER = 'trusted-raycast-translate'
export const TRUSTED_RAYCAST_TRUST_HANDLER = 'trusted-raycast-trust'
export const TRUSTED_RAYCAST_RESULT_ID = 'trusted-raycast:google-translate:translate'
export const TRUSTED_RAYCAST_TRUST_RESULT_ID = 'trusted-raycast:trust'

/** Capability activation must be live; the Translate command also needs an installed and enabled candidate. */
export function trustedRaycastCatalog(active: boolean, trust: Readonly<{ enabled: boolean; installed: boolean }>): readonly LauncherInternalResultItem[] {
  if (!active) return []
  const trustItem: LauncherInternalResultItem = {
    id: TRUSTED_RAYCAST_TRUST_RESULT_ID, name: 'Trusted Extensions', sourceExtension: 'Trusted Raycast',
    description: 'Install and manage reviewed trusted extensions',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_TRUST_HANDLER, argument: 'manage', description: 'Manage Trusted Extensions', hideWindowAfterInvocation: false, requiresConfirmation: false },
  }
  if (!trust.installed || !trust.enabled) return [trustItem]
  return [{
    id: TRUSTED_RAYCAST_RESULT_ID, name: 'Translate', sourceExtension: 'Trusted Raycast',
    description: 'Google Translate · reviewed trusted extension',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_TRANSLATE_HANDLER, argument: 'translate', description: 'Open Translate', hideWindowAfterInvocation: false, requiresConfirmation: false },
  }, trustItem]
}

/** Bounded development proof browser admits only the exact Google Translate origin; unparsable destinations are always denied. */
export function isTrustedTranslateProofUrl(raw: string): boolean {
  try { return new URL(raw).origin === 'https://translate.google.com' } catch { return false }
}
