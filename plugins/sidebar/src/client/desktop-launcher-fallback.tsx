import { Button } from '@tockteam/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tockteam/ui/tooltip'
import { Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { DesktopLauncherState } from '../../../../src/contracts.ts'
import type { Translate } from '../../../shared/i18n.ts'
import type { WorkspaceMessage } from './i18n.ts'

export function DesktopLauncherFallback({
  t,
}: {
  t: Translate<WorkspaceMessage>
}): ReactNode {
  const candidate = window.dshDesktop?.launcher
  const bridge = candidate !== undefined
    && typeof candidate.getState === 'function'
    && typeof candidate.show === 'function'
    ? candidate
    : undefined
  const [state, setState] = useState<DesktopLauncherState | undefined>()

  useEffect(() => {
    let active = true
    if (bridge !== undefined) {
      void bridge.getState().then(next => {
        if (active) setState(next)
      }).catch(() => {
        // The button remains usable when the workbench is still starting.
      })
    }
    return () => { active = false }
  }, [bridge])

  if (bridge === undefined) return null
  const unavailable = state?.shortcut.status === 'unavailable'
  const accelerator = state?.shortcut.accelerator
  const buttonLabel = accelerator === undefined
    ? t('launcher.button')
    : t('launcher.open', { accelerator })
  const statusLabel = unavailable && accelerator !== undefined
    ? `${t('launcher.shortcut-unavailable')} · ${accelerator}`
    : null
  const accessibleLabel = statusLabel === null
    ? buttonLabel
    : `${buttonLabel} — ${statusLabel}`
  return (
    <div className="tockteam-launcher-fallback flex min-w-0 items-center gap-1 [-webkit-app-region:no-drag] [html[data-tockteam-tocktutor-active='true']_&]:hidden">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button unstyled
            type="button"
            className="!flex !h-9 !w-auto !max-w-[132px] !gap-1.5 !rounded-lg !px-2 !text-[var(--dsw-alias-label-secondary,#57606a)] hover:!bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] hover:!text-[var(--dsw-alias-label-primary,#1f2328)] [body:has([data-sidebar-collapsed])_&]:!w-9 [body:has([data-sidebar-collapsed])_&]:!px-0"
            aria-label={accessibleLabel}
            onClick={() => {
              void bridge.show().then(next => { setState(next) }).catch(() => {})
            }}
          >
            <Search aria-hidden="true" />
            <span className="truncate [body:has([data-sidebar-collapsed])_&]:hidden">{t('launcher.button')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{accessibleLabel}</TooltipContent>
      </Tooltip>
      {statusLabel !== null && (
        <span className="truncate text-[10px] font-medium text-[var(--dsw-alias-state-warn-primary,#9a6700)] [body:has([data-sidebar-collapsed])_&]:hidden" role="status" aria-live="polite">
          {statusLabel}
        </span>
      )}
    </div>
  )
}
