export interface DshLucideIconMapping {
  readonly exportName: string
  readonly lucideName: string
}

export function generateDshLucideIconSource(): string
export function acquireDshLucideIconLock(dshSource: string): () => void
export function adaptDshLucideIcons(dshSource: string): () => void
export const dshLucideIconMappings: readonly DshLucideIconMapping[]
export const dshLucideSourcePaths: readonly string[]
