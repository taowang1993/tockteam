export interface TockTutorBuildManifest {
  version: 1
  files: Array<{ path: string; sha256: string }>
}

export function createTockTutorBuildManifest(): TockTutorBuildManifest
export function verifyTockTutorBuildManifest(): void
