// Private handling and startup budget, not an official Raycast name grammar or limit.
export function isUserRaycastCreatorName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.isWellFormed()
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value) && Buffer.byteLength(value, 'utf8') <= 1024
}

/** Only an absent own owner permits author fallback; never invoke declared accessors. */
export function userRaycastOwnerOrAuthorName(manifest: unknown): string | undefined {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return undefined
  const declared = Object.getOwnPropertyDescriptor(manifest, 'owner') ?? Object.getOwnPropertyDescriptor(manifest, 'author')
  return declared && Object.hasOwn(declared, 'value') && isUserRaycastCreatorName(declared.value) ? declared.value : undefined
}
