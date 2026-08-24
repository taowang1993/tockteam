import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import {
  TOCKTUTOR_REVIEW_PANEL_SLOT,
  type TockTutorReviewPanelOwnerProps,
} from '@tockteam/tocktutor-workbench/client'
import importExportRemote from '@tockteam/tocktutor-import-export/remote'
import {
  ImportExportReviewPanel,
  type ReviewPanelRemote,
} from './review-panel.tsx'

export const name = '@tockteam/tocktutor-import-export'
export const inject = ['remote', 'slots']

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(importExportRemote)
  let disposePanel: (() => void) | undefined
  try {
    disposePanel = ctx.slots.inject(
      TOCKTUTOR_REVIEW_PANEL_SLOT,
      () => ctx.slots.register({
        id: 'tocktutor-import-export',
        name: TOCKTUTOR_REVIEW_PANEL_SLOT,
        order: 10,
        registrant: name,
      }, (props: TockTutorReviewPanelOwnerProps) => createElement(ImportExportReviewPanel, {
        ...props,
        remote: ctx.remote as unknown as ReviewPanelRemote,
      })),
    )
  } catch (error) {
    await disposeRemote()
    throw error
  }
  return async () => {
    disposePanel?.()
    await disposeRemote()
  }
}

export * from './review-panel.tsx'
export * from './types.ts'
