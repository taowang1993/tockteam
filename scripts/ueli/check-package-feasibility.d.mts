export interface NoticeEntry {
  id: string
  source: string | string[]
  license: string
  sha256?: string
  disposition: string
}

export interface FeasibilityInputs {
  contract: any
  packageJson: any
  mainSource: string
  noticeLedger: { entries: NoticeEntry[] }
  noticeContents: Record<string, string>
}

export declare function inspectLauncherPackageFeasibility(inputs: FeasibilityInputs): {
  failures: string[]
  summary: Record<string, unknown>
}

export declare function loadLauncherPackageFeasibilityInputs(options?: { repoRoot?: string }): Promise<FeasibilityInputs>
