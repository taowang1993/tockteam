export function canonicalPathSync(candidatePath: string): string | undefined

export function canonicalPath(candidatePath: string): Promise<string | undefined>

export function pathContainedSync(rootPath: string, candidatePath: string): boolean

export function pathContained(rootPath: string, candidatePath: string): Promise<boolean>
