import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { VaultSearchMatch } from './types.ts'

export type WorkbenchAiSearchPolicy = 'off' | 'on-demand' | 'automatic'

export interface WorkbenchSearchIntelligenceRequest {
  query: string
  vaultGeneration: number
  mode: 'related'
  directory?: string
  modifiedFrom?: number
  modifiedTo?: number
  titleOnly?: boolean
}

export interface WorkbenchSearchIntelligenceResult {
  status: 'applied' | 'disabled' | 'provider-unavailable' | 'invalid-output' | 'error' | 'cancelled'
  matches: VaultSearchMatch[]
}

/** Optional Host capability; the Workbench remains fully local without it. */
export interface WorkbenchSearchIntelligenceRemote {
  currentSettings?(signal?: AbortSignal): Promise<RemoteResult<{
    provider: string
    model: string
    aiSearch?: WorkbenchAiSearchPolicy
  }>>
  searchIntelligence?(
    request: WorkbenchSearchIntelligenceRequest,
    signal?: AbortSignal,
  ): Promise<RemoteResult<WorkbenchSearchIntelligenceResult>>
}
