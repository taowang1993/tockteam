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
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button unstyled
            type="button"
            aria-label={accessibleLabel}
            onClick={() => {
              void bridge.show().then(next => { setState(next) }).catch(() => {})
            }}
          ><Search aria-hidden="true" /></Button>
        </TooltipTrigger>
        <TooltipContent side="right">{accessibleLabel}</TooltipContent>
      </Tooltip>
      {statusLabel !== null && <span className="sr-only" role="status" aria-live="polite">{statusLabel}</span>}
    </>
  )
}
