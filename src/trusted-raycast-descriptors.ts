export const TRUSTED_RAYCAST_EXTENSION_IDS = Object.freeze(['google-translate', 'kaomoji-search'] as const)
export type TrustedRaycastExtensionId = (typeof TRUSTED_RAYCAST_EXTENSION_IDS)[number]
export type TrustedRaycastCommand = 'translate' | 'index'

export type TrustedRaycastDescriptor = Readonly<{
  artifactRoot: string
  artifactSha256: string
  command: TrustedRaycastCommand
  extensionId: TrustedRaycastExtensionId
  sourceEntry: string
  vendorFile: string
}>

export const trustedRaycastDescriptors: Readonly<Record<TrustedRaycastExtensionId, TrustedRaycastDescriptor>> = Object.freeze({
  'google-translate': Object.freeze({
    artifactRoot: 'tockteam-raycast-artifact',
    artifactSha256: '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac',
    command: 'translate',
    extensionId: 'google-translate',
    sourceEntry: 'src/translate.tsx',
    vendorFile: 'google-translate.tar',
  }),
  'kaomoji-search': Object.freeze({
    artifactRoot: 'tockteam-raycast-kaomoji-artifact',
    artifactSha256: '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f',
    command: 'index',
    extensionId: 'kaomoji-search',
    sourceEntry: 'src/index.tsx',
    vendorFile: 'kaomoji-search.tar',
  }),
})

export function getTrustedRaycastDescriptor(value: unknown): TrustedRaycastDescriptor | undefined {
  return typeof value === 'string' && (TRUSTED_RAYCAST_EXTENSION_IDS as readonly string[]).includes(value)
    ? trustedRaycastDescriptors[value as TrustedRaycastExtensionId]
    : undefined
}
