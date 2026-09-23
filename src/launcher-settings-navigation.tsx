import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Blocks, Braces, ChevronRight, Languages, Puzzle, Settings2, Smile, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { launcherFixedText } from './launcher-i18n.ts'
import { findLauncherExtensionPages, isLauncherExtensionId, launcherExtensionPages, launcherExtensionSupported, launcherSettingsPlatform, type LauncherExtensionId } from './launcher-extension-settings.ts'
import { TRUSTED_RAYCAST_EXTENSION_IDS, type TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'
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

/** All nested settings menus share motion, reduced-motion, and collapsed accessibility. */
export function LauncherSettingsMenu({ id, label, icon: Icon, expanded, onToggle, children }: Readonly<{
  id: string; label: string; icon: LucideIcon; expanded: boolean; onToggle: () => void; children: ReactNode
}>): ReactNode {
  return <>
    <Button unstyled className="launcher-settings-nav-row group" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
      <Icon aria-hidden="true" /><span>{label}</span><ChevronRight aria-hidden="true" className="transition-transform duration-200 ease-out group-aria-expanded:rotate-90 motion-reduce:transition-none" />
    </Button>
    <div id={id} aria-hidden={!expanded} ref={node => { if (node) node.inert = !expanded }} className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity,visibility] duration-200 ease-out aria-hidden:grid-rows-[0fr] aria-hidden:invisible aria-hidden:opacity-0 motion-reduce:transition-none">
      <div className="min-h-0 overflow-hidden pl-3">{children}</div>
    </div>
  </>
}

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
  const [builtinsOpen, setBuiltinsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [builtinQuery, setBuiltinQuery] = useState('')
  const [installed, setInstalled] = useState<readonly TrustedRaycastExtensionId[]>([])
  const [installationStatus, setInstallationStatus] = useState('Loading Extensions…')
  const settings = window.dshDesktop?.launcher.settings
  const platform = launcherSettingsPlatform()
  const id = useId()
  useEffect(() => {
    let disposed = false; let revision = 0
    const refresh = async (): Promise<void> => {
      const current = ++revision
      const results = await Promise.allSettled(TRUSTED_RAYCAST_EXTENSION_IDS.filter(extensionId => launcherExtensionSupported(extensionId, platform)).map(async extensionId => {
        if (!settings) throw Error('Settings unavailable')
        const snapshot = await settings.getExtension(extensionId)
        return snapshot.state.installed ? extensionId : undefined
      }))
      if (disposed || current !== revision) return
      setInstalled(results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []))
      setInstallationStatus(results.some(result => result.status === 'rejected') ? 'Extension settings are unavailable.' : '')
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { disposed = true; window.removeEventListener('focus', refresh) }
  }, [settings, platform, extensionsOpen])
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
      if (isLauncherExtensionId(value)) {
        if (launcherExtensionPages.find(page => page.id === value)?.editor === 'compatibility') { setExtensionsOpen(true); setQuery('') }
        else { setBuiltinsOpen(true); setBuiltinQuery('') }
      }
    }
    window.addEventListener('tockteam-launcher-settings-destination', select)
    return () => window.removeEventListener('tockteam-launcher-settings-destination', select)
  }, [navigation])
  const choose = (page: 'general' | LauncherExtensionId): void => {
    if (!active) trigger.current?.click()
    navigation.select(page)
  }
  const availability = { platform, installedExtensionIds: installed }
  const groups = [
    { key: 'extensions', label: 'Extensions', search: 'Search Extensions', icon: Blocks, open: extensionsOpen, toggle: () => setExtensionsOpen(!extensionsOpen), query, setQuery,
      pages: findLauncherExtensionPages(query, fixed, availability).filter(page => page.editor === 'compatibility'),
      empty: installationStatus || (query.trim() ? 'No matching extensions.' : 'No installed extensions.') },
    { key: 'builtins', label: 'Built-In Tools', search: 'Search Built-In Tools', icon: Wrench, open: builtinsOpen, toggle: () => setBuiltinsOpen(!builtinsOpen), query: builtinQuery, setQuery: setBuiltinQuery,
      pages: findLauncherExtensionPages(builtinQuery, fixed, availability).filter(page => page.editor !== 'compatibility'), empty: 'No matching tools.' },
  ]
  return <><span ref={anchor} hidden />{host && createPortal(<>
    <LauncherSettingsMenu id={`${id}-pages`} label="TockLauncher" icon={Zap} expanded={expanded} onToggle={() => { setExpanded(!active || !expanded); if (!active) choose('general') }}>
      <Button unstyled className="launcher-settings-nav-row" aria-current={active && selected === 'general' ? 'page' : undefined} onClick={() => choose('general')}><Settings2 aria-hidden="true" /><span>{fixed('General')}</span></Button>
      {groups.map(group => <LauncherSettingsMenu key={group.key} id={`${id}-${group.key}`} label={fixed(group.label)} icon={group.icon} expanded={group.open} onToggle={group.toggle}>
        <div className="flex min-w-0 flex-col gap-1">
          <Input className="my-1 h-8 min-w-0 focus-visible:ring-0!" type="search" aria-label={fixed(group.search)} placeholder={fixed(group.search)} value={group.query} maxLength={256} onChange={event => group.setQuery(event.target.value)} />
          {group.pages.map(page => {
            const Icon = page.id === 'google-translate' ? Languages : page.id === 'can-i-use' ? Braces : page.id === 'kaomoji-search' ? Smile : Puzzle
            return <Button unstyled key={page.id} className="launcher-settings-nav-row" data-extension-id={page.id} title={fixed(page.label)} aria-current={active && selected === page.id ? 'page' : undefined} onClick={() => choose(page.id)}><Icon aria-hidden="true" /><span>{fixed(page.label)}</span></Button>
          })}
          {(group.pages.length === 0 || (group.key === 'extensions' && installationStatus)) && <p role="status" className="px-2 text-xs text-muted-foreground">{fixed(group.empty)}</p>}
        </div>
      </LauncherSettingsMenu>)}
    </LauncherSettingsMenu>
  </>, host)}</>
}
