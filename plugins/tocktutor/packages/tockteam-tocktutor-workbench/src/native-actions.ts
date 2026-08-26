import type { VaultReference } from './types.ts'

/** Ordered UI seat for optional Desktop-native actions owned by the Workbench route. */
export const TOCKTUTOR_NATIVE_ACTIONS_SLOT = 'tockteam.tocktutor.workbench.native-actions'

export type TockTutorProtocolRequest = {
  action: 'open' | 'new' | 'daily' | 'unique' | 'search' | 'choose-vault'
  vault?: string
  file?: string
  name?: string
  content?: string
  query?: string
  clipboard?: true
  ifExists?: 'prepend' | 'append' | 'overwrite'
  silent?: true
  paneType?: 'tab' | 'split' | 'window'
  xSuccess?: string
  xError?: string
}

export type TockTutorNativeActionsDispatchEvent = {
  action: 'new' | 'daily' | 'capture' | 'search'
  kind: 'quick-action'
  operationId: string
} | {
  kind: 'protocol'
  operationId: string
  request: TockTutorProtocolRequest
}

export type TockTutorNativeActionsDispatchResult = 'handled' | 'failed' | 'stale'

/** Bounded route identity shared with Desktop-native action contributions. */
export interface TockTutorNativeActionsOwnerProps {
  activePath: string | null
  handleDispatch(event: TockTutorNativeActionsDispatchEvent): Promise<TockTutorNativeActionsDispatchResult>
  saveCurrent?(): Promise<boolean>
  storeAudio?(fileName: string, dataBase64: string): Promise<boolean>
  vault: VaultReference | null
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'tockteam.tocktutor.workbench.native-actions': {
      kind: 'list'
      scope: 'root'
      owner: TockTutorNativeActionsOwnerProps
    }
  }
}
