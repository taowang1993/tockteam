import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Database, Globe2, KeyRound, Keyboard, Palette, RefreshCw, RotateCcw, ShieldCheck, Trash2, Upload, Download, MonitorCog } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@tockteam/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@tockteam/ui/alert-dialog'
import { Badge } from '@tockteam/ui/badge'
import { Button } from '@tockteam/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tockteam/ui/card'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { LAUNCHER_COMPOSITION } from './launcher-contract.ts'
import { LauncherSettingsDraftBoundary } from './launcher-settings-draft-boundary.tsx'
import { useLauncherDirtyState } from './launcher-settings-dirty.ts'
import { LauncherTrustedExtensionSettings } from './launcher-trusted-extension-settings.tsx'
import { TRUSTED_RAYCAST_EXTENSION_IDS } from './trusted-raycast-descriptors.ts'
import { LauncherExtensionSettings } from './launcher-extension-settings.tsx'
import { isLauncherExtensionId, launcherExtensionPages, type LauncherExtensionId } from './launcher-extension-settings.ts'
import { LauncherLocalSettings } from './launcher-local-settings.tsx'
import { LauncherDiscoverySettings } from './launcher-discovery-settings.tsx'
import { LauncherFileSearchSettings, type LauncherSimpleFileSearchDraft } from './launcher-file-search-settings.tsx'
import { LauncherNetworkSettings } from './launcher-network-settings.tsx'
import { LauncherTerminalSettings } from './launcher-terminal-settings.tsx'
import { LauncherWorkflowSettings } from './launcher-workflow-settings.tsx'
import { LauncherSurfaceSettingsSection } from './launcher-surface-settings.tsx'
import { LauncherSettingField as Field } from './launcher-setting-field.tsx'
import { launcherCountText, launcherFixedText } from './launcher-i18n.ts'
import { launcherWorkflowSnapshotToken } from './launcher-workflow-contract.ts'
import type { DesktopBridge } from './contracts.ts'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { readPersistedLauncherState } from './launcher-settings-model.ts'
import { useLauncherDraft } from './launcher-settings-drafts.ts'
import { LAUNCHER_SETTING_CATALOG_COUNT } from './launcher-setting-catalog.ts'
import { createLauncherSettingsWriteQueue } from './launcher-settings-write-queue.ts'
import { localeTag } from '../plugins/shared/i18n.ts'
import { useTranslate } from '../plugins/shared/use-i18n.ts'
import type { LocaleMessages, LocaleService } from '../plugins/shared/i18n.ts'

const MESSAGES = {
  en: {
    about: 'A focused launcher over the TockTeam workbench with bounded local, discovery, file, and network providers.',
    sectionAbout: 'About and Contract',
    sectionAppearance: 'Appearance and Input',
    sectionBrowser: 'Browser and Shortcuts',
    sectionDesktop: 'Desktop Lifecycle',
    sectionDiscovery: 'Discovery Providers',
    sectionExtensions: 'Extensions',
    sectionFile: 'File Search',
    sectionKeyboard: 'Keyboard and Mouse',
    sectionLocal: 'Local Transformation Extensions',
    sectionNetwork: 'Network Extensions',
    sectionSearch: 'Search and History',
    sectionSecurity: 'Security',
    sectionStorage: 'Storage and Privacy',
    sectionTerminal: 'Terminal Launcher',
    sectionUpdates: 'Updates',
    sectionWorkflow: 'Workflows',
    badge: 'Ueli-Compatible Contract',
    description: 'A focused launcher over the TockTeam workbench with bounded local, discovery, file, and network providers.',
    ready: 'TockLauncher settings are ready.',
    saving: 'Saving…',
    saved: 'Saved.',
    title: 'TockLauncher',
    unavailable: 'TockLauncher settings are available only in the TockTeam desktop app.',
  },
  zh: {
    about: '基于 TockTeam 工作台的专注启动器，提供受限的本地、发现、文件和网络提供方。',
    sectionAbout: '关于与合约',
    sectionAppearance: '外观与输入',
    sectionBrowser: '浏览器与快捷键',
    sectionDesktop: '桌面生命周期',
    sectionDiscovery: '发现提供方',
    sectionExtensions: '扩展',
    sectionFile: '文件搜索',
    sectionKeyboard: '键盘与鼠标',
    sectionLocal: '本地转换扩展',
    sectionNetwork: '网络扩展',
    sectionSearch: '搜索与历史',
    sectionSecurity: '安全',
    sectionStorage: '存储与隐私',
    sectionTerminal: '终端启动器',
    sectionUpdates: '更新',
    sectionWorkflow: '工作流',
    badge: '兼容 Ueli 合约',
    description: '基于 TockTeam 工作台的专注启动器，提供受限的本地、发现、文件和网络提供方。',
    ready: 'TockLauncher 设置已就绪。',
    saving: '正在保存…',
    saved: '已保存。',
    title: 'TockLauncher',
    unavailable: 'TockLauncher 设置仅在 TockTeam 桌面应用中可用。',
  },
} satisfies LocaleMessages<'about' | 'badge' | 'description' | 'ready' | 'saving' | 'saved' | 'sectionAbout' | 'sectionAppearance' | 'sectionBrowser' | 'sectionDesktop' | 'sectionDiscovery' | 'sectionExtensions' | 'sectionFile' | 'sectionKeyboard' | 'sectionLocal' | 'sectionNetwork' | 'sectionSearch' | 'sectionSecurity' | 'sectionStorage' | 'sectionTerminal' | 'sectionUpdates' | 'sectionWorkflow' | 'title' | 'unavailable'>

interface SettingsSectionProps {
  close: () => void
  locale: LocaleService
}

interface SettingsSlots {
  inject(name: string, register: () => unknown): unknown
  register(options: Readonly<{
    id: string
    label: () => string
    locale: string
    name: string
    order: number
  }>, component: (props: SettingsSectionProps) => ReactNode): unknown
}

type UpdaterState = ReturnType<DesktopBridge['appUpdate']['getState']> extends Promise<infer State> ? State : never

declare global {
  interface Window {
    dshDesktop?: DesktopBridge
  }
}

function settingValue(snapshot: LauncherSettingsSnapshot, key: string, fallback: boolean): boolean {
  return typeof snapshot.values[key] === 'boolean' ? snapshot.values[key] as boolean : fallback
}

function sectionId(title: string): string {
  let hash = 0
  for (const character of title) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return `tocklauncher-section-${hash.toString(36)}`
}

function SectionCard({ icon, title, description, children, testId }: Readonly<{ icon: ReactNode; title: string; description: string; children: ReactNode; testId?: string }>): ReactNode {
  const headingId = sectionId(title)
  return (
    <Card aria-labelledby={headingId} data-testid={testId} role="region">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">{icon}{title}</h2></CardTitle>
        <CardDescription>{launcherFixedText(description)}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const LAUNCHER_UPDATER_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  idle: 'Idle',
  checking: 'Checking',
  available: 'Available',
  downloading: 'Downloading',
  downloaded: 'Downloaded',
  error: 'Error',
})

const LAUNCHER_CUSTOM_BROWSER_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  none: 'None',
  active: 'Active',
  revoked: 'Revoked',
})

function statusLabel(snapshot: LauncherSettingsSnapshot): string {
  if (snapshot.externalGrantStatus === 'revoked') return 'External grant revoked; managed source active'
  if (snapshot.settingsSource === 'external') return 'External source active'
  return snapshot.recoveredSettings ? 'Managed source recovered from backup' : 'Managed source active'
}

function launcherUpdaterStatusLabel(status: string): string {
  return launcherFixedText(LAUNCHER_UPDATER_STATUS_LABELS[status] ?? status)
}

function launcherCustomBrowserStatusLabel(status: string): string {
  return launcherFixedText(LAUNCHER_CUSTOM_BROWSER_STATUS_LABELS[status] ?? status)
}

function LauncherSettingsPage(props: SettingsSectionProps): ReactNode {
  return <LauncherSettingsDraftBoundary close={props.close}><LauncherSettingsContents {...props} /></LauncherSettingsDraftBoundary>
}

function LauncherSettingsContents({ locale }: SettingsSectionProps): ReactNode {
  const translate = useTranslate(locale, locale.bind('tockteam.launcher'))
  const t = (key: keyof typeof MESSAGES.en): string => translate(key)
  document.documentElement.lang = localeTag(locale)
  const bridge = window.dshDesktop
  const settings = bridge?.launcher.settings
  const [showGlobal, setShowGlobal] = useState(false)
  const [selectedExtension, setSelectedExtension] = useState<LauncherExtensionId>()
  const selectedPage = launcherExtensionPages.find(page => page.id === selectedExtension)
  useEffect(() => {
    const selectDestination = (event: Event): void => {
      const id: unknown = (event as CustomEvent).detail
      setShowGlobal(false)
      setSelectedExtension(isLauncherExtensionId(id) ? id : undefined)
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-extension-heading]')?.focus())
    }
    window.addEventListener('tockteam-launcher-settings-destination', selectDestination)
    return () => window.removeEventListener('tockteam-launcher-settings-destination', selectDestination)
  }, [])
  const [snapshot, setSnapshot] = useState<LauncherSettingsSnapshot | null>(null)
  const [workflowSnapshotRevision, setWorkflowSnapshotRevision] = useState(0)
  const workflowSnapshotValue = useRef<string | undefined>(undefined)
  const [status, setStatus] = useState('Loading TockLauncher settings…')
  const [busy, setBusy] = useState(false)
  const activeSaves = useRef(0)
  const [resetPending, setResetPending] = useState(false)
  const resetTriggerRef = useRef<HTMLButtonElement>(null)
  const [secret, setSecret] = useState('')
  const [launchOnStart, setLaunchOnStart] = useState<boolean | null>(null)
  const [updater, setUpdater] = useState<UpdaterState | null>(null)
  const [simpleFileSearchDraft, setSimpleFileSearchDraft] = useState<readonly LauncherSimpleFileSearchDraft[] | null>(null)
  useLauncherDirtyState(secret.length > 0 || activeSaves.current > 0 || (simpleFileSearchDraft !== null && JSON.stringify(simpleFileSearchDraft) !== JSON.stringify(snapshot?.values['extension[SimpleFileSearch].folders'] ?? [])))
  const simpleFileSearchDraftRevision = useRef(0)
  const settingsOwnershipRef = useRef<string | undefined>(undefined)
  const updateSimpleFileSearchDraft = useCallback((folders: readonly LauncherSimpleFileSearchDraft[]): void => {
    simpleFileSearchDraftRevision.current += 1
    setSimpleFileSearchDraft(Object.freeze([...folders]))
  }, [])
  const clearSimpleFileSearchDraft = useCallback((): void => {
    simpleFileSearchDraftRevision.current += 1
    setSimpleFileSearchDraft(null)
  }, [])

  const reload = useCallback(async (): Promise<LauncherSettingsSnapshot | null> => {
    if (!settings) return null
    const next = await settings.getSnapshot()
    const ownership = `${next.settingsSource}:${next.externalGrantStatus}`
    if (settingsOwnershipRef.current !== undefined && settingsOwnershipRef.current !== ownership) clearSimpleFileSearchDraft()
    settingsOwnershipRef.current = ownership
    const serializedWorkflow = launcherWorkflowSnapshotToken(next)
    if (serializedWorkflow !== workflowSnapshotValue.current) {
      workflowSnapshotValue.current = serializedWorkflow
      setWorkflowSnapshotRevision(revision => revision + 1)
    }
    setSnapshot(next)
    return next
  }, [clearSimpleFileSearchDraft, settings])
  const writeQueue = useMemo(() => settings === undefined ? null : createLauncherSettingsWriteQueue({
    getOwnershipToken: () => settingsOwnershipRef.current,
    updateSetting: async (key, value) => { await settings.updateSetting(key, value) },
    reload: async () => { await reload() },
    clearPendingValue: () => { /* Drafts are acknowledged by persisted snapshots, never optimistic values. */ },
  }), [reload, settings])

  useEffect(() => {
    if (!settings) return
    void reload().then(() => setStatus(t('ready'))).catch(() => setStatus(t('unavailable')))
  }, [reload, settings])

  useLayoutEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const dialog = document.querySelector<HTMLElement>('[data-testid="tocklauncher-reset-dialog"][data-state="open"], [data-testid="tocklauncher-workflow-delete-dialog"][data-state="open"]')
      if (dialog === null) return
      event.preventDefault()
      event.stopImmediatePropagation()
      dialog.querySelector<HTMLButtonElement>('[data-testid="tocklauncher-reset-cancel"], [data-testid="tockteam-workflow-delete-cancel"]')?.click()
    }
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [])

  useEffect(() => {
    if (!bridge) return
    void bridge.launchOnStart.get().then(setLaunchOnStart).catch(() => setLaunchOnStart(null))
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    let disposed = false
    void bridge.appUpdate.getState().then(state => { if (!disposed) setUpdater(state) }).catch(() => {})
    const remove = bridge.appUpdate.onStateChange(state => { if (!disposed) setUpdater(state) })
    return () => { disposed = true; remove() }
  }, [bridge])

  const state = useMemo(() => snapshot ? readPersistedLauncherState(snapshot, LAUNCHER_COMPOSITION.extensionIds) : null, [snapshot])
  const [fuzzinessDraft, setFuzzinessDraft] = useLauncherDraft(state?.preferences.fuzziness ?? 0.5)
  const enabled = useMemo(() => new Set(state?.enabledExtensionIds ?? []), [state?.enabledExtensionIds])
  const rendererIsLinux = typeof navigator !== 'undefined' && !/Macintosh|Mac OS|Windows/iu.test(`${navigator.platform} ${navigator.userAgent}`)
  const rendererPlatform = rendererIsLinux ? 'Linux' as const : /Windows/iu.test(`${navigator.platform} ${navigator.userAgent}`) ? 'Windows' as const : 'macOS' as const

  const save = useCallback((key: string, value: unknown): Promise<boolean> => {
    if (!settings || writeQueue === null) return Promise.resolve(false)
    activeSaves.current += 1
    setBusy(true)
    setStatus(t('saving'))
    const isSimpleFileSearchFolders = key === 'extension[SimpleFileSearch].folders'
    const draftRevision = simpleFileSearchDraftRevision.current
    const operation = writeQueue.enqueue(key, value)
    return operation.then(saved => {
      if (!saved) {
        setStatus(launcherFixedText('TockLauncher settings could not be saved.'))
        return false
      }
      if (isSimpleFileSearchFolders && simpleFileSearchDraftRevision.current === draftRevision) {
        setSimpleFileSearchDraft(value as readonly LauncherSimpleFileSearchDraft[])
      }
      setStatus(t('saved'))
      return true
    }, () => {
      if (!isSimpleFileSearchFolders) void reload().catch(() => {})
      setStatus(launcherFixedText('TockLauncher settings could not be saved.'))
      return false
    }).finally(() => {
      activeSaves.current = Math.max(0, activeSaves.current - 1)
      if (activeSaves.current === 0) setBusy(false)
    })
  }, [reload, settings, writeQueue])

  const clearHistory = useCallback((): void => {
    void save('general.searchHistory.history', [])
  }, [save])

  const operation = useCallback(async (label: string, action: () => Promise<{ canceled?: boolean; ok: true }>, refresh = true, clearFileSearchDraft = false, focusTarget?: HTMLElement): Promise<void> => {
    const active = focusTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const restoreFocus = (): void => {
      if (active === null) return
      const current = active.dataset.testid === undefined
        ? active
        : [...document.querySelectorAll<HTMLElement>('[data-testid]')].find(candidate => candidate.dataset.testid === active.dataset.testid) ?? active
      const fallback = current instanceof HTMLButtonElement && current.disabled
        ? [...document.querySelectorAll<HTMLElement>('[data-testid]')].find(candidate => candidate.dataset.testid === 'tockteam-custom-browser-choose')
        : current
      if (fallback?.isConnected) fallback.focus()
    }
    setBusy(true)
    setStatus(`${launcherFixedText(label)}…`)
    try {
      await writeQueue?.waitForIdle()
      const result = await action()
      if (result.canceled) setStatus(`${launcherFixedText(label)} ${launcherFixedText('canceled.')}`)
      else {
        if (clearFileSearchDraft) clearSimpleFileSearchDraft()
        if (refresh) await reload()
        setStatus(`${launcherFixedText(label)} ${launcherFixedText('complete.')}`)
      }
    } catch {
      setStatus(`${launcherFixedText(label)} ${launcherFixedText('could not be completed.')}`)
    } finally {
      setBusy(false)
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(restoreFocus))
      else setTimeout(restoreFocus, 0)
    }
  }, [clearSimpleFileSearchDraft, reload, writeQueue])

  if (!bridge || !settings) return <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
  if (snapshot === null || state === null) return <p aria-live="polite" className="text-sm text-muted-foreground" role="status">{status}</p>

  const setExtension = (extensionId: string, checked: boolean): void => {
    const next = new Set(enabled)
    if (checked) next.add(extensionId); else next.delete(extensionId)
    void save('extensions.enabledExtensionIds', [...next])
  }

  const changeUpdater = async (action: () => Promise<unknown>, label: string): Promise<void> => {
    setBusy(true); setStatus(`${launcherFixedText(label)}…`)
    try { await action(); setStatus(`${launcherFixedText(label)} ${launcherFixedText('complete.')}`) } catch { setStatus(`${launcherFixedText(label)} ${launcherFixedText('could not be completed.')}`) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5 px-1 py-4" data-testid="tocklauncher-settings">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Badge variant="secondary">{t('badge')}</Badge>
      </div>

      <nav aria-label={launcherFixedText('TockLauncher Settings')} className="flex gap-2">
        <Button variant={showGlobal ? 'ghost' : 'secondary'} aria-pressed={!showGlobal} onClick={() => setShowGlobal(false)}>{t('sectionExtensions')}</Button>
        <Button variant={showGlobal ? 'secondary' : 'ghost'} aria-pressed={showGlobal} onClick={() => setShowGlobal(true)}>{launcherFixedText('General Settings')}</Button>
      </nav>
      <div hidden={showGlobal}>
        <LauncherExtensionSettings selected={selectedExtension} onSelect={setSelectedExtension} enabled={enabled} onEnable={setExtension} busy={busy} platform={rendererPlatform} />
      </div>
      {TRUSTED_RAYCAST_EXTENSION_IDS.map(id => <LauncherTrustedExtensionSettings key={id} id={id} active={!showGlobal && selectedExtension === id} settings={settings} />)}
      <div hidden={!showGlobal}><div className="flex flex-col gap-5">
      <SectionCard icon={<MonitorCog aria-hidden="true" className="size-4" />} title={t('sectionSearch')} description="Tune the matching surface without exposing launcher internals.">
        <Field title="Search Engine" description="The selected matcher is applied to the next search.">
          <NativeSelect aria-label={launcherFixedText('Search Engine')} size="sm" value={state.preferences.searchEngineId} disabled={busy} onChange={event => { void save('searchEngine.id', event.target.value) }}>
            <NativeSelectOption value="fuzzysort">fuzzysort</NativeSelectOption>
            <NativeSelectOption value="Fuse.js">Fuse.js</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field title={`${launcherFixedText('Fuzziness')} (${fuzzinessDraft.toFixed(1)})`} description="Higher values broaden fuzzy matching.">
          <Input aria-label={launcherFixedText('Search Fuzziness')} className="w-full max-w-xs min-w-0" type="range" min="0" max="1" step="0.1" disabled={busy} value={fuzzinessDraft} onChange={event => { setFuzzinessDraft(Number(event.target.value)) }} onBlur={() => { void save('searchEngine.fuzziness', fuzzinessDraft) }} />
        </Field>
        <Field title="Maximum Results" description="Keep result lists concise while retaining pinned items.">
          <Input aria-label={launcherFixedText('Maximum Results')} className="w-24" type="number" min="1" max="200" disabled={busy} value={state.preferences.maxSearchResultItems} onChange={event => { const value = Math.min(200, Math.max(1, Number(event.target.value) || 50)); void save('searchEngine.maxResultLength', value) }} />
        </Field>
        <Field title="Search History" description="History is stored in the Desktop-owned launcher repository.">
          <Switch aria-label={launcherFixedText('Enable Search History')} checked={state.preferences.historyEnabled} disabled={busy} onCheckedChange={checked => { void save('general.searchHistory.enabled', checked) }} />
        </Field>
        <Field title="History Limit" description={launcherCountText(localeTag(locale), 'savedSearches', state.history.length, `${state.history.length} saved searches currently visible to TockLauncher.`)}>
          <Input aria-label={launcherFixedText('History Limit')} className="w-24" type="number" min="1" max="100" disabled={busy} value={state.preferences.historyLimit} onChange={event => { const value = Math.min(100, Math.max(1, Number(event.target.value) || 10)); void save('general.searchHistory.limit', value) }} />
        </Field>
        <Field title="Saved Searches" description="Clear persisted history without changing provider settings.">
          <Button aria-label={launcherFixedText('Clear Search History')} size="sm" variant="outline" disabled={busy || state.history.length === 0} onClick={clearHistory}><Trash2 aria-hidden="true" />{launcherFixedText('Clear History')}</Button>
        </Field>
        <details className="min-w-0 rounded-md border border-border/60 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">{launcherFixedText('Recent Search Entries')}</summary>{state.history.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{launcherFixedText('No Recent Searches')}</p> : <ul className="mt-2 max-h-32 min-w-0 list-disc overflow-auto pl-5 text-xs text-muted-foreground">{state.history.map(query => <li key={query} className="min-w-0 break-words" title={query}>{query}</li>)}</ul>}</details>
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="search" snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Palette aria-hidden="true" className="size-4" />} title={t('sectionAppearance')} description="Search presentation follows the shared TockTeam appearance owner and remains keyboard accessible.">
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="appearance" snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<MonitorCog aria-hidden="true" className="size-4" />} title={t('sectionDesktop')} description="Window and shell behavior is applied by Electron main. Launch on Start remains in its existing TockTeam Preferences owner.">
        <Field title="Appearance Source" description={`${launcherFixedText('Compatibility mode is')} ${launcherFixedText(state.preferences.themeSource)}; ${launcherFixedText('active mode and skin follow the DSH TockTeam Appearance owner.')}`}><Badge variant="outline">{launcherFixedText('Follows TockTeam Appearance')}</Badge></Field>
        <Field title="Launch on Start" description="Uses the single TockTeam login-item owner; it is not duplicated in launcher settings.">
          <Switch aria-label={launcherFixedText('Launch on Start')} checked={launchOnStart === true} disabled={busy || launchOnStart === null} onCheckedChange={checked => { setBusy(true); void bridge.launchOnStart.set(checked).then(value => { setLaunchOnStart(value); setStatus(launcherFixedText('Launch on Start saved.')) }).catch(() => setStatus(launcherFixedText('Launch on Start could not be saved.'))).finally(() => setBusy(false)) }} />
        </Field>
        <Field title="Show TockLauncher on Startup" description="TockTeam defaults to opt-in startup visibility.">
          <Switch aria-label={launcherFixedText('Show TockLauncher on Startup')} checked={state.preferences.showOnStartup} disabled={busy} onCheckedChange={checked => { void save('window.showOnStartup', checked) }} />
        </Field>
        <Field title="Keep TockLauncher Always on Top"><Switch aria-label={launcherFixedText('Keep TockLauncher Always on Top')} checked={state.preferences.alwaysOnTop} disabled={busy} onCheckedChange={checked => { void save('window.alwaysOnTop', checked) }} /></Field>
        <Field title="Show on All Workspaces" description={rendererPlatform === 'Windows' ? 'Unavailable on Windows.' : 'Available on macOS and Linux.'}><Switch aria-label={launcherFixedText('Show on All Workspaces')} checked={state.preferences.visibleOnAllWorkspaces} disabled={busy || rendererPlatform === 'Windows'} onCheckedChange={checked => { void save('window.visibleOnAllWorkspaces', checked) }} /></Field>
        <Field title="Show Tray Icon"><Switch aria-label={launcherFixedText('Show Tray Icon')} checked={state.preferences.showTrayIcon} disabled={busy} onCheckedChange={checked => { void save('general.tray.showIcon', checked) }} /></Field>
        <Field title="Show Dock Icon" description={rendererPlatform === 'macOS' ? 'Available on macOS.' : `Unavailable on ${rendererPlatform}.`}><Switch aria-label={launcherFixedText('Show Dock Icon')} checked={state.preferences.showDockIcon} disabled={busy || rendererPlatform !== 'macOS'} onCheckedChange={checked => { void save('appearance.showAppIconInDock', checked) }} /></Field>
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="window" snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Keyboard aria-hidden="true" className="size-4" />} title={t('sectionKeyboard')} description="Choose selection behavior without exposing paths or other authority.">
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="keyboard" snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Globe2 aria-hidden="true" className="size-4" />} title={t('sectionBrowser')} description="Browser grants and global shortcut ownership remain in Electron main.">
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="browser" snapshot={snapshot} />
        <Field title="Language" description="The DSH locale service owns launcher language selection.">
          <NativeSelect aria-label={launcherFixedText('Language')} size="sm" disabled={busy} value={locale.getSnapshot().active} onChange={event => { if (event.target.value === 'en' || event.target.value === 'zh') locale.setLocale(event.target.value) }}>
            <NativeSelectOption value="en">{launcherFixedText('English')}</NativeSelectOption>
            <NativeSelectOption value="zh">简体中文</NativeSelectOption>
          </NativeSelect>
        </Field>
      </SectionCard>

      </div></div>

      <div hidden={showGlobal || selectedPage?.editor !== 'local'}>
        <LauncherLocalSettings extensionId={selectedExtension ?? ''} busy={busy} save={save} snapshot={snapshot} />
      </div>

      <div hidden={showGlobal || selectedPage?.editor !== 'discovery'}>
        <LauncherDiscoverySettings extensionId={selectedExtension ?? ''} busy={busy} save={save} snapshot={snapshot} />
      </div>

      <div hidden={showGlobal || selectedPage?.editor !== 'file'}>
        <LauncherFileSearchSettings extensionId={selectedExtension ?? ''} busy={busy} draftFolders={simpleFileSearchDraft} onDraftFoldersChange={updateSimpleFileSearchDraft} save={save} snapshot={snapshot} />
      </div>

      <div hidden={showGlobal || selectedPage?.editor !== 'terminal'}>
        <LauncherTerminalSettings busy={busy} save={save} snapshot={snapshot} />
      </div>

      <div hidden={showGlobal || selectedPage?.editor !== 'workflow'}>
        <LauncherWorkflowSettings key={workflowSnapshotRevision} busy={busy} save={save} snapshot={snapshot} />
      </div>

      <div hidden={showGlobal || selectedPage?.editor !== 'network'}>
        <LauncherNetworkSettings extensionId={selectedExtension ?? ''} busy={busy} save={save} snapshot={snapshot} />
      </div>

      <div hidden={!showGlobal}>
      <SectionCard icon={<Database aria-hidden="true" className="size-4" />} title={t('sectionStorage')} description="Managed files and external grants are owned by Electron main; no filesystem path crosses this page.">
        <Field title="Settings Source" description={launcherFixedText(statusLabel(snapshot))}><Badge variant={snapshot.settingsSource === 'external' ? 'default' : 'secondary'}>{launcherFixedText(snapshot.settingsSource === 'external' ? 'External' : 'Managed')}</Badge></Field>
        <Field title="External Write Capability" description="Unsupported platforms stay readable and revocable but reject writes before touching the file."><Badge variant={snapshot.externalWriteAvailable === false ? 'outline' : 'secondary'}>{launcherFixedText(snapshot.externalWriteAvailable === false ? 'Read-Only' : 'Available')}</Badge></Field>
        <Field title="Recovery" description={snapshot.recoveredArtifacts?.length ? `${launcherFixedText('Recovered Artifacts')}: ${snapshot.recoveredArtifacts.join(', ')}.` : launcherFixedText('Each settings, index, and log artifact has an independent managed backup.')}><Badge variant={snapshot.recoveredArtifacts?.length ? 'default' : 'secondary'}>{launcherFixedText(snapshot.recoveredArtifacts?.length ? 'Recovered' : 'Healthy')}</Badge></Field>
        <Field title="Secure Storage" description="Sensitive values are encrypted in Electron main and are never hydrated into this renderer."><Badge variant={snapshot.secureStorageAvailable === false ? 'outline' : 'secondary'}>{launcherFixedText(snapshot.secureStorageAvailable === false ? 'Unavailable' : 'Available')}</Badge></Field>
        <Field title="Settings Files">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('Import', settings.importSettings, true, true) }}><Upload aria-hidden="true" />{launcherFixedText('Import')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('Export', settings.exportSettings, false) }}><Download aria-hidden="true" />{launcherFixedText('Export')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('External selection', settings.selectExternalSettings, true, true) }}>{launcherFixedText('Choose External File')}</Button>
            <Button size="sm" variant="outline" disabled={busy || snapshot.externalGrantStatus === 'none'} onClick={() => { void operation('External revocation', settings.revokeExternalSettings, true, true) }}>{launcherFixedText('Revoke External File')}</Button>
          </div>
        </Field>
        <Field title="Custom Browser" description={rendererPlatform === 'macOS' ? 'The native browser grant is status-only in the renderer; the selected target never crosses this page.' : `${rendererPlatform} always uses the system browser; custom browser selection is unavailable.`}>
          <div className="flex flex-wrap justify-end gap-2">
            <Button aria-label={launcherFixedText('Choose Custom Browser')} data-testid="tockteam-custom-browser-choose" size="sm" variant="outline" disabled={busy || rendererPlatform !== 'macOS'} onClick={event => { const target = event.currentTarget; void operation('Custom browser selection', settings.selectCustomBrowser, true, false, target).finally(() => { setTimeout(() => target.focus(), 50) }) }}>{launcherFixedText('Choose Custom Browser')}</Button>
            <Button aria-label={launcherFixedText('Revoke Custom Browser')} data-testid="tockteam-custom-browser-revoke" size="sm" variant="outline" disabled={busy || rendererPlatform !== 'macOS' || snapshot.customBrowserStatus === 'none'} onClick={event => { const target = event.currentTarget; void operation('Custom browser revocation', settings.revokeCustomBrowser, true, false, target).finally(() => { setTimeout(() => target.focus(), 50) }) }}>{launcherFixedText('Revoke Custom Browser')}</Button>
          </div>
        </Field>
        <Field title="Reset TockLauncher Settings" description="Clears overrides, favorites, exclusions, history, and the custom-browser grant, then securely relaunches Desktop.">
          <AlertDialog open={resetPending} onOpenChange={setResetPending}>
            <AlertDialogTrigger asChild><Button data-testid="tocklauncher-reset-trigger" ref={resetTriggerRef} size="sm" variant="outline" disabled={busy}><RotateCcw aria-hidden="true" />{launcherFixedText('Reset')}</Button></AlertDialogTrigger>
            <AlertDialogContent data-testid="tocklauncher-reset-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>{launcherFixedText('Reset TockLauncher Settings?')}</AlertDialogTitle>
                <AlertDialogDescription>{launcherFixedText('This clears launcher overrides, favorites, exclusions, history, and the custom-browser grant.')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="tocklauncher-reset-cancel" size="sm" disabled={busy}>{launcherFixedText('Cancel')}</AlertDialogCancel>
                <AlertDialogAction size="sm" variant="destructive" disabled={busy} onClick={() => { void operation('Reset', settings.resetSettings, true, true, resetTriggerRef.current ?? undefined) }}><Trash2 aria-hidden="true" />{launcherFixedText('Confirm Reset')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Field>
      </SectionCard>

      </div>
      <div hidden={showGlobal || selectedExtension !== 'DeeplTranslator'}>
      <SectionCard icon={<KeyRound aria-hidden="true" className="size-4" />} title={launcherFixedText('DeepL API Key')} description="Secrets are write-only. A missing or unavailable key is never represented by ciphertext or an error payload.">
        <Field title="DeepL API Key" description="Enter a new key to encrypt it with the operating system secure-storage backend.">
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Label htmlFor="tocklauncher-deepl-key" className="sr-only">{launcherFixedText('DeepL API Key')}</Label>
            <Input id="tocklauncher-deepl-key" aria-label={launcherFixedText('DeepL API Key')} autoComplete="new-password" className="w-full max-w-sm min-w-0" maxLength={8192} type="password" value={secret} disabled={busy || snapshot.secureStorageAvailable === false} onChange={event => setSecret(event.target.value)} />
            <Button size="sm" variant="outline" disabled={busy || secret.length === 0 || snapshot.secureStorageAvailable === false} onClick={() => { const value = secret; void save('extension[DeeplTranslator].apiKey', value).then(saved => { if (saved) setSecret('') }) }}>{launcherFixedText('Save Key')}</Button>
          </div>
        </Field>
        <Alert role="status" aria-live="polite"><ShieldCheck aria-hidden="true" /><AlertTitle>{launcherFixedText('Protected Secret')}</AlertTitle><AlertDescription>{snapshot.missingSensitiveKeys.includes('extension[DeeplTranslator].apiKey') ? launcherFixedText('No usable DeepL key is stored.') : launcherFixedText('A usable DeepL key is stored with secure storage.')}</AlertDescription></Alert>
      </SectionCard>

      </div>
      <div hidden={!showGlobal}><div className="flex flex-col gap-5">
      <SectionCard icon={<RefreshCw aria-hidden="true" className="size-4" />} title={t('sectionUpdates')} description="Automatic updates remain owned by the existing Electron updater state machine.">
        {updater ? <>
          <Field title="Update Status" description={updater.message === null ? `${launcherFixedText('Current Version')} ${updater.currentVersion}` : launcherFixedText(updater.message)}><Badge variant={updater.status === 'error' ? 'destructive' : 'secondary'}>{launcherUpdaterStatusLabel(updater.status)}</Badge></Field>
          <Field title="Update Actions"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || !updater.canRetry} onClick={() => { void changeUpdater(() => bridge.appUpdate.check(), 'Check') }}><RefreshCw aria-hidden="true" />{launcherFixedText('Check')}</Button><Button size="sm" variant="outline" disabled={busy || updater.status !== 'available'} onClick={() => { void changeUpdater(() => bridge.appUpdate.download(), 'Download') }}>{launcherFixedText('Download')}</Button><Button size="sm" variant="outline" disabled={busy || updater.status !== 'downloaded'} onClick={() => { void changeUpdater(() => bridge.appUpdate.install(), 'Install') }}>{launcherFixedText('Install')}</Button></div></Field>
        </> : <p className="text-sm text-muted-foreground">{launcherFixedText('Updater state is unavailable.')}</p>}
      </SectionCard>

      <SectionCard icon={<Check aria-hidden="true" className="size-4" />} title={t('sectionAbout')} description="Compatibility inventory is explicit even while provider slices are staged.">
        <Field title="Catalog Coverage" description="The settings catalog is generated from the pinned Ueli parity manifest."><Badge variant="secondary">{launcherCountText(localeTag(locale), 'catalogRows', LAUNCHER_SETTING_CATALOG_COUNT, `${LAUNCHER_SETTING_CATALOG_COUNT} Rows · 102 Runtime Keys`)}</Badge></Field>
        <Field title="Appearance Ownership" description={launcherFixedText('The compatibility appearance.themeSource value is retained, but the active mode and skin follow the DSH TockTeam Appearance owner.')}><Badge variant="outline">{launcherFixedText('Follows TockTeam Appearance')}</Badge></Field>
        <Field title="Browser Grant" description="Custom-browser identity is status-only here; selection and revocation are native operations."><Badge variant="secondary">{launcherCustomBrowserStatusLabel(snapshot.customBrowserStatus ?? 'none')}</Badge></Field>
        <Field title="Diagnostics" description="Bounded launcher diagnostics are retained without secret or path material."><span className="max-w-full truncate text-xs text-muted-foreground">{snapshot.logs.at(-1) ?? launcherFixedText('No launcher diagnostics.')}</span></Field>
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="compatibility" snapshot={snapshot} />
      </SectionCard>

      </div></div>
      <p aria-live="polite" className="px-1 text-sm text-muted-foreground" role="status">{status}</p>
    </div>
  )
}

export const inject = ['locale', 'slots'] as const

export function apply(ctx: Readonly<{
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
}>): void {
  const locale = ctx.get('locale') as LocaleService
  const slots = ctx.get('slots') as SettingsSlots
  const translate = locale.bind('tockteam.launcher')
  ctx.effect(() => {
    const removeLocale = locale.register('tockteam.launcher', MESSAGES)
    const removeSlot = slots.inject('settings.section', () => slots.register({
      id: 'tocklauncher',
      label: () => translate('title'),
      locale: 'tockteam.launcher',
      name: 'settings.section',
      order: 60,
    }, props => <LauncherSettingsPage {...props} locale={locale} />)) as (() => void) | undefined
    return () => {
      removeSlot?.()
      removeLocale?.()
    }
  }, 'tockteam-launcher: settings section')
}

export { LauncherSettingsPage }
