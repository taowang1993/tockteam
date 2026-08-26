import type { VaultReference } from './types.ts'

export const TOCKTUTOR_WEB_VIEWER_PANEL_SLOT = 'tockteam.tocktutor.workbench.web-viewer'

export interface TockTutorWebViewerOwnerProps {
  activePath: string | null
  addLinkBookmark(title: string, url: string): boolean
  externalUrl?: string | null | undefined
  vault: VaultReference | null
  webClipFolder: string
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'tockteam.tocktutor.workbench.web-viewer': {
      kind: 'single'
      scope: 'root'
      owner: TockTutorWebViewerOwnerProps
    }
  }
}
