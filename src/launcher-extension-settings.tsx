import type { ReactNode } from 'react'
import { Puzzle } from 'lucide-react'
import { Switch } from '@tockteam/ui/switch'
import { launcherFixedText as fixed } from './launcher-i18n.ts'
import { launcherExtensionPages, launcherExtensionSupported, type LauncherExtensionId } from './launcher-extension-settings.ts'

export function LauncherExtensionSettings({ selected, enabled, onEnable, busy, platform }: Readonly<{
  selected: LauncherExtensionId | undefined
  enabled: ReadonlySet<string>
  onEnable: (id: string, enabled: boolean) => void
  busy: boolean
  platform: 'Linux' | 'macOS' | 'Windows'
}>): ReactNode {
  const page = launcherExtensionPages.find(page => page.id === selected)
  if (!page) return null
  return <header className="flex min-w-0 flex-col gap-3" data-testid="tocklauncher-extension-detail" data-extension-id={page.id}>
    <p className="m-0 text-xs text-muted-foreground">TockLauncher / {fixed(page.editor === 'compatibility' ? 'Extensions' : 'Built-In Tools')}</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 tabIndex={-1} data-extension-heading className="m-0 flex min-w-0 items-center gap-2 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"><Puzzle aria-hidden="true" className="size-[18px]" />{fixed(page.label)}</h1>
      {page.editor !== 'compatibility' && <label className="flex items-center gap-2 text-sm"><Switch aria-label={`${fixed('Enable')} ${fixed(page.label)}`} checked={enabled.has(page.id)} disabled={busy || !launcherExtensionSupported(page.id, platform)} onCheckedChange={checked => onEnable(page.id, checked)} />{fixed('Enabled')}</label>}
    </div>
    {!launcherExtensionSupported(page.id, platform) && <p role="note" className="text-sm text-muted-foreground">{fixed('This extension is unavailable on this platform. Saved settings are preserved.')}</p>}
    {page.editor === 'none' && <p className="text-sm text-muted-foreground">{fixed('This extension has no additional settings.')}</p>}
  </header>
}
