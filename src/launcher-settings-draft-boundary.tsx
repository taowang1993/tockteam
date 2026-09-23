import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@tockteam/ui/alert-dialog'
import { createLauncherDraftTracker, LauncherDraftContext } from './launcher-settings-dirty.ts'
import { launcherFixedText as fixed } from './launcher-i18n.ts'

/** Preserve mounted drafts across page navigation; intercept dismissal before the owning dialog. */
export function LauncherSettingsDraftBoundary({ children, close }: Readonly<{ children: ReactNode; close: () => void }>): ReactNode {
  const tracker = useMemo(createLauncherDraftTracker, [])
  const root = useRef<HTMLDivElement>(null)
  const action = useRef<(() => void) | undefined>(undefined)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => { if (tracker.hasChanges()) { event.preventDefault(); event.returnValue = '' } }
    const intercept = (event: Event): void => {
      if (!tracker.hasChanges()) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-testid="tocklauncher-discard-dialog"]')) return
      if (action.current) { event.preventDefault(); event.stopImmediatePropagation(); return }
      const dialog = target?.closest('[role="dialog"], [role="alertdialog"]')
      if (dialog && dialog !== root.current?.closest('[role="dialog"]') && !root.current?.contains(dialog)) return
      const escape = event instanceof KeyboardEvent && event.key === 'Escape'
      if (event instanceof KeyboardEvent && !escape) return
      if (!escape && (root.current?.contains(target) || target?.closest('[data-tocklauncher-navigation], [data-tocklauncher-settings-trigger]'))) return
      event.preventDefault(); event.stopImmediatePropagation()
      const trigger = !escape ? target?.closest<HTMLElement>('button, a') : undefined
      action.current = trigger ? () => trigger.click() : close
      setPending(true)
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('pointerdown', intercept, true)
    document.addEventListener('click', intercept, true)
    window.addEventListener('keydown', intercept, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('pointerdown', intercept, true)
      document.removeEventListener('click', intercept, true)
      window.removeEventListener('keydown', intercept, true)
    }
  }, [close, tracker])
  return <LauncherDraftContext.Provider value={tracker}>
    <div ref={root}>{children}</div>
    <AlertDialog open={pending} onOpenChange={open => { setPending(open); if (!open) action.current = undefined }}>
      <AlertDialogContent data-testid="tocklauncher-discard-dialog">
        <AlertDialogHeader><AlertDialogTitle>{fixed('Discard Unsaved Changes?')}</AlertDialogTitle><AlertDialogDescription>{fixed('Some edits have not been saved. Stay to correct them, or discard them and leave settings.')}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{fixed('Keep Editing')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { const leave = action.current; tracker.clear(); action.current = undefined; setPending(false); queueMicrotask(() => leave?.()) }}>{fixed('Discard and Leave')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </LauncherDraftContext.Provider>
}
