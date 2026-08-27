export interface VendorIntegrityOptions {
  repoRoot?: string
  vendorPath?: string
  revision?: string
}

export declare function resolveGitPath(repoRoot: string, gitPath: string): string

export declare function verifyVendorTree(options?: VendorIntegrityOptions): Promise<{
  trackedFileCount: number
}>

export declare function verifyVendorIntegrity(options?: VendorIntegrityOptions): Promise<{
  trackedFileCount: number
}>

export declare function checkBaseline(options?: {
  repoRoot?: string
  manifestPath?: string
  releaseObjectsPath?: string
}): Promise<unknown>
