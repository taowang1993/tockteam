import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Blocks, Braces, ChevronDown, ChevronRight, Languages, Puzzle, Settings2, Smile, Zap } from 'lucide-react'
import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { launcherFixedText } from './launcher-i18n.ts'
import { findLauncherExtensionPages, isLauncherExtensionId, type LauncherExtensionId } from './launcher-extension-settings.ts'
import { useTranslate } from '../plugins/shared/use-i18n.ts'
import { localeTag, type LocaleService } from '../plugins/shared/i18n.ts'

/** Viewing state only; all destinations share one mounted settings/draft owner. */
export function createLauncherSettingsNavigation() {
  let page: 'general' | LauncherExtensionId = 'general'
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => page,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    select: (next: typeof page) => { if (next !== page) { page = next; for (const listener of listeners) listener() } },
  }
}
export type LauncherSettingsNavigation = ReturnType<typeof createLauncherSettingsNavigation>

/** The pinned shell has flat section slots. Keep its section button as the activation
 * owner and project our disclosure beside it; never replace React-owned children. */
export function LauncherSettingsSidebar({ navigation, locale }: Readonly<{ navigation: LauncherSettingsNavigation; locale: LocaleService }>): ReactNode {
  useTranslate(locale, locale.bind('tockteam.launcher'))
  const fixed = (label: string): string => launcherFixedText(label, localeTag(locale))
  const selected = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot)
  const anchor = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [extensionsOpen, setExtensionsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const id = useId()
  useLayoutEffect(() => {
    const shell = anchor.current?.closest('[role="dialog"]')
    const button = [...shell?.querySelectorAll<HTMLButtonElement>('nav button') ?? []].find(button => button.textContent?.trim() === 'TockLauncher')
    if (!button) return
    const node = document.createElement('div')
    node.dataset.tocklauncherNavigation = 'true'
    button.before(node)
    button.dataset.tocklauncherSettingsTrigger = 'true'
    trigger.current = button
    const sync = (): void => { const current = button.hasAttribute('aria-current'); setActive(current); if (current) setExpanded(true) }
    const observer = new MutationObserver(sync)
    observer.observe(button, { attributes: true, attributeFilter: ['aria-current'] })
    sync(); setHost(node)
    return () => { observer.disconnect(); node.remove(); delete button.dataset.tocklauncherSettingsTrigger; trigger.current = null; navigation.select('general') }
  }, [navigation])
  useEffect(() => {
    const select = (event: Event): void => {
      const value: unknown = (event as CustomEvent).detail
      navigation.select(isLauncherExtensionId(value) ? value : 'general')
      setExpanded(true)
      if (isLauncherExtensionId(value)) setExtensionsOpen(true)
    }
    window.addEventListener('tockteam-launcher-settings-destination', select)
    return () => window.removeEventListener('tockteam-launcher-settings-destination', select)
  }, [navigation])
  const choose = (page: 'general' | LauncherExtensionId): void => {
    if (!active) trigger.current?.click()
    navigation.select(page)
  }
  const matches = findLauncherExtensionPages(query, fixed)
  const ordered = [...matches.filter(page => page.editor === 'compatibility'), ...matches.filter(page => page.editor !== 'compatibility')]
  return <><span ref={anchor} hidden />{host && createPortal(<>
    <Button unstyled className="launcher-settings-nav-row" aria-expanded={expanded} aria-controls={`${id}-pages`} onClick={() => { setExpanded(!active || !expanded); if (!active) choose('general') }}>
      <Zap aria-hidden="true" /><span>TockLauncher</span>{expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </Button>
    <div id={`${id}-pages`} hidden={!expanded}>
      <div className="pl-3">
        <Button unstyled className="launcher-settings-nav-row" aria-current={active && selected === 'general' ? 'page' : undefined} onClick={() => choose('general')}><Settings2 aria-hidden="true" /><span>{fixed('General')}</span></Button>
        <Button unstyled className="launcher-settings-nav-row" aria-expanded={extensionsOpen} aria-controls={`${id}-extensions`} onClick={() => setExtensionsOpen(!extensionsOpen)}><Blocks aria-hidden="true" /><span>{fixed('Extensions')}</span>{extensionsOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</Button>
        <div id={`${id}-extensions`} hidden={!extensionsOpen}>
          <div className="flex min-w-0 flex-col gap-1 pl-3">
            <Input className="my-1 h-8 min-w-0" type="search" aria-label={fixed('Search Extensions')} placeholder={fixed('Search Extensions')} value={query} maxLength={256} onChange={event => setQuery(event.target.value)} />
            {ordered.map(page => {
              const Icon = page.id === 'google-translate' ? Languages : page.id === 'can-i-use' ? Braces : page.id === 'kaomoji-search' ? Smile : Puzzle
              return <Button unstyled key={page.id} className="launcher-settings-nav-row" data-extension-id={page.id} title={fixed(page.label)} aria-current={active && selected === page.id ? 'page' : undefined} onClick={() => choose(page.id)}><Icon aria-hidden="true" /><span>{fixed(page.label)}</span></Button>
            })}
            {ordered.length === 0 && <p role="status" className="px-2 text-xs text-muted-foreground">{fixed('No matching extensions.')}</p>}
          </div>
        </div>
      </div>
    </div>
  </>, host)}</>
}
