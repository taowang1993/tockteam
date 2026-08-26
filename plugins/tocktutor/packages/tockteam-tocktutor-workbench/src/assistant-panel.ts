import type { VaultReference } from './types.ts'

/** Exact nested UI seat owned by the TockTutor Workbench route. */
export const TOCKTUTOR_ASSISTANT_PANEL_SLOT = 'tockteam.tocktutor.workbench.assistant'

/** Bounded route context shared with the optional Assistant panel. */
export interface TockTutorAssistantPanelOwnerProps {
  activePath: string | null
  selectedText?: string
  vault: VaultReference | null
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'tockteam.tocktutor.workbench.assistant': {
      kind: 'single'
      scope: 'root'
      owner: TockTutorAssistantPanelOwnerProps
    }
  }
}
