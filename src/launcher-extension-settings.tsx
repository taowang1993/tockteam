import { useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, Puzzle } from 'lucide-react'
import { Badge } from '@tockteam/ui/badge'
import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { Switch } from '@tockteam/ui/switch'
import { launcherFixedText as fixed } from './launcher-i18n.ts'
import { findLauncherExtensionPages, launcherExtensionPages, launcherExtensionSupported, type LauncherExtensionId } from './launcher-extension-settings.ts'

export function LauncherExtensionSettings({ selected, onSelect, enabled, onEnable, busy, platform }: Readonly<{
  selected: LauncherExtensionId | undefined
  onSelect: (id: LauncherExtensionId | undefined) => void
  enabled: ReadonlySet<string>
  onEnable: (id: string, enabled: boolean) => void
  busy: boolean
  platform: 'Linux' | 'macOS' | 'Windows'
}>): ReactNode {
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const lastSelection = useRef<LauncherExtensionId | undefined>(undefined)
  const page = launcherExtensionPages.find(page => page.id === selected)
  const select = (id: LauncherExtensionId | undefined): void => {
    lastSelection.current = selected ?? id
    onSelect(id)
    requestAnimationFrame(() => {
      const target = id === undefined
        ? root.current?.querySelector<HTMLButtonElement>(`[data-extension-id="${lastSelection.current}"]`)
        : root.current?.querySelector<HTMLHeadingElement>('[data-extension-heading]')
      target?.focus()
    })
  }
  const matches = findLauncherExtensionPages(query, fixed)
  return <div ref={root} data-testid="tocklauncher-extensions" className="min-w-0">
    <div hidden={selected !== undefined}>
      <h2 className="mb-3 text-base font-semibold">{fixed('Extensions')}</h2>
      <Input type="search" aria-label={fixed('Search Extensions')} placeholder={fixed('Search Extensions')} value={query} maxLength={256} onChange={event => setQuery(event.target.value)} />
      <ul className="mt-3 flex min-w-0 flex-col divide-y divide-border">
        {matches.map(item => {
          const supported = launcherExtensionSupported(item.id, platform)
          return <li key={item.id} className="min-w-0 py-1">
            <Button variant="ghost" className="h-auto w-full justify-start py-3" data-extension-id={item.id} onClick={() => select(item.id)}>
              <Puzzle aria-hidden="true" /><span className="min-w-0 flex-1 truncate text-left">{fixed(item.label)}</span>
              <Badge variant="secondary">{fixed(!supported ? 'Unavailable' : item.editor === 'compatibility' ? 'Reviewed Extension' : enabled.has(item.id) ? 'Enabled' : 'Disabled')}</Badge>
              <ChevronRight aria-hidden="true" />
            </Button>
          </li>
        })}
      </ul>
      {matches.length === 0 && <p role="status" className="py-6 text-sm text-muted-foreground">{fixed('No matching extensions.')}</p>}
    </div>
    {page && <header className="flex min-w-0 flex-col gap-3" data-testid="tocklauncher-extension-detail" data-extension-id={page.id}>
      <Button className="self-start" size="sm" variant="ghost" onClick={() => select(undefined)}><ArrowLeft aria-hidden="true" />{fixed('Back to Extensions')}</Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 tabIndex={-1} data-extension-heading className="flex min-w-0 items-center gap-2 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"><Puzzle aria-hidden="true" className="size-[18px]" />{fixed(page.label)}</h2>
        {page.editor !== 'compatibility' && <label className="flex items-center gap-2 text-sm"><Switch aria-label={`${fixed('Enable')} ${fixed(page.label)}`} checked={enabled.has(page.id)} disabled={busy || !launcherExtensionSupported(page.id, platform)} onCheckedChange={checked => onEnable(page.id, checked)} />{fixed('Enabled')}</label>}
      </div>
      {!launcherExtensionSupported(page.id, platform) && <p role="note" className="text-sm text-muted-foreground">{fixed('This extension is unavailable on this platform. Saved settings are preserved.')}</p>}
      {page.editor === 'none' && <p className="text-sm text-muted-foreground">{fixed('This extension has no additional settings.')}</p>}
    </header>}
  </div>
}
