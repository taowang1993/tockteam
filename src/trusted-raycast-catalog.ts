import type { LauncherInternalResultItem } from './launcher-actions.ts'
export const TRUSTED_RAYCAST_TRANSLATE_HANDLER = 'trusted-raycast-translate'
export const TRUSTED_RAYCAST_RESULT_ID = 'trusted-raycast:google-translate:translate'
export function trustedRaycastCatalog(active: boolean, admitted: boolean): readonly LauncherInternalResultItem[] {
  return active && admitted ? [{
    id: TRUSTED_RAYCAST_RESULT_ID, name: 'Translate', sourceExtension: 'Trusted Raycast',
    description: 'Google Translate · reviewed trusted extension',
    defaultAction: { handlerKey: TRUSTED_RAYCAST_TRANSLATE_HANDLER, argument: 'translate', description: 'Open Translate', hideWindowAfterInvocation: false, requiresConfirmation: false },
  }] : []
}

/** Bounded development proof browser admits only the exact Google Translate origin; unparsable destinations are always denied. */
export function isTrustedTranslateProofUrl(raw: string): boolean {
  try { return new URL(raw).origin === 'https://translate.google.com' } catch { return false }
}
