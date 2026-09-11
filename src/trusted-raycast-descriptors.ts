export const TRUSTED_RAYCAST_EXTENSION_IDS = Object.freeze(['google-translate', 'kaomoji-search', 'can-i-use'] as const)
export type TrustedRaycastExtensionId = (typeof TRUSTED_RAYCAST_EXTENSION_IDS)[number]
export type TrustedRaycastRuntimeExtensionId = TrustedRaycastExtensionId
export type TrustedRaycastCommand = 'translate' | 'index'

export type TrustedRaycastDescriptor = Readonly<{
  artifactRoot: string
  artifactSha256: string
  command: TrustedRaycastCommand
  extensionId: TrustedRaycastRuntimeExtensionId
  previousArtifactSha256s: readonly string[]
  react: '19.0.0'
  reconciler: '0.31.0'
  sourceEntry: string
  sourceRevision: string
  vendorFile: string
}>

export const trustedRaycastDescriptors: Readonly<Record<TrustedRaycastExtensionId, TrustedRaycastDescriptor>> = Object.freeze({
  'google-translate': Object.freeze({
    artifactRoot: 'tockteam-raycast-artifact',
    artifactSha256: '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac',
    command: 'translate',
    extensionId: 'google-translate',
    previousArtifactSha256s: Object.freeze([]),
    react: '19.0.0',
    reconciler: '0.31.0',
    sourceEntry: 'src/translate.tsx',
    sourceRevision: '1063bfaa34be81528c4e397c91b57c42ec370d79',
    vendorFile: 'google-translate.tar',
  }),
  'kaomoji-search': Object.freeze({
    artifactRoot: 'tockteam-raycast-kaomoji-artifact',
    artifactSha256: '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f',
    command: 'index',
    extensionId: 'kaomoji-search',
    previousArtifactSha256s: Object.freeze([]),
    react: '19.0.0',
    reconciler: '0.31.0',
    sourceEntry: 'src/index.tsx',
    sourceRevision: 'b7845053e3f39dadcf984217be5249fb51ab2ce8',
    vendorFile: 'kaomoji-search.tar',
  }),
  'can-i-use': Object.freeze({
    artifactRoot: 'tockteam-raycast-can-i-use-artifact',
    artifactSha256: '0e23b06703ad85e91f9c6793c5de689204e9fe3bdb0fed3106a1324406bf3858',
    command: 'index', extensionId: 'can-i-use', previousArtifactSha256s: Object.freeze([]),
    react: '19.0.0', reconciler: '0.31.0', sourceEntry: 'src/index.tsx',
    sourceRevision: '186d955eda64f9e956b25a3fdf5566b1d38f57f2', vendorFile: 'can-i-use.tar',
  }),
})

export function getTrustedRaycastRuntimeDescriptor(value: unknown): TrustedRaycastDescriptor | undefined {
  return getTrustedRaycastDescriptor(value)
}

export function getTrustedRaycastDescriptor(value: unknown): TrustedRaycastDescriptor | undefined {
  return typeof value === 'string' && (TRUSTED_RAYCAST_EXTENSION_IDS as readonly string[]).includes(value)
    ? trustedRaycastDescriptors[value as TrustedRaycastExtensionId]
    : undefined
}
