import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Database, Globe2, KeyRound, Keyboard, Palette, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, Upload, Download, MonitorCog } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@tockteam/ui/alert'
import { Badge } from '@tockteam/ui/badge'
import { Button } from '@tockteam/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tockteam/ui/card'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { LAUNCHER_COMPOSITION } from './launcher-contract.ts'
import { LauncherLocalSettings } from './launcher-local-settings.tsx'
import { LauncherDiscoverySettings } from './launcher-discovery-settings.tsx'
import { LauncherFileSearchSettings, type LauncherSimpleFileSearchDraft } from './launcher-file-search-settings.tsx'
import { LauncherNetworkSettings } from './launcher-network-settings.tsx'
import { LauncherTerminalSettings } from './launcher-terminal-settings.tsx'
import { LauncherWorkflowSettings } from './launcher-workflow-settings.tsx'
import { LauncherSurfaceSettingsSection } from './launcher-surface-settings.tsx'
import { launcherFixedText } from './launcher-i18n.ts'
import { launcherWorkflowSnapshotToken } from './launcher-workflow-contract.ts'
import type { DesktopBridge } from './contracts.ts'
import { LAUNCHER_SENSITIVE_SETTING_KEYS, type LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { mergeLauncherDirtyValues, readPersistedLauncherState } from './launcher-settings-model.ts'
import { useLauncherDraft } from './launcher-settings-drafts.ts'
import { LAUNCHER_SETTING_CATALOG_COUNT } from './launcher-setting-catalog.ts'
import { launcherSettingRequiresProviderRescan } from './launcher-setting-keys.ts'
import { localeTag } from '../plugins/shared/i18n.ts'
import { useTranslate } from '../plugins/shared/use-i18n.ts'
import type { LocaleMessages, LocaleService } from '../plugins/shared/i18n.ts'

const MESSAGES = {
  en: {
    about: 'A focused launcher over the TockTeam Desktop workbench with bounded local, discovery, file, and network providers.',
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
    badge: 'Ueli-compatible contract',
    description: 'A focused launcher over the TockTeam Desktop workbench with bounded local, discovery, file, and network providers.',
    ready: 'TockLauncher settings are ready.',
    saving: 'Saving…',
    saved: 'Saved.',
    title: 'TockLauncher',
    unavailable: 'TockLauncher settings are available in TockTeam Desktop only.',
  },
  zh: {
    about: '基于 TockTeam Desktop 工作台的专注启动器，提供受限的本地、发现、文件和网络提供方。',
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
    description: '基于 TockTeam Desktop 工作台的专注启动器，提供受限的本地、发现、文件和网络提供方。',
    ready: 'TockLauncher 设置已就绪。',
    saving: '正在保存…',
    saved: '已保存。',
    title: 'TockLauncher',
    unavailable: 'TockLauncher 设置仅在 TockTeam Desktop 中可用。',
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

function Field({ title, description, children }: Readonly<{ title: string; description?: string; children?: ReactNode }>): ReactNode {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{launcherFixedText(title)}</div>
        {description ? <div className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{launcherFixedText(description)}</div> : null}
      </div>
      {children ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
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

function statusLabel(snapshot: LauncherSettingsSnapshot): string {
  if (snapshot.externalGrantStatus === 'revoked') return 'External grant revoked; managed source active'
  if (snapshot.settingsSource === 'external') return 'External source active'
  return snapshot.recoveredSettings ? 'Managed source recovered from backup' : 'Managed source active'
}

function LauncherSettingsPage({ close: _close, locale }: SettingsSectionProps): ReactNode {
  const translate = useTranslate(locale, locale.bind('tockteam.launcher'))
  const t = (key: keyof typeof MESSAGES.en): string => translate(key)
  document.documentElement.lang = localeTag(locale)
  const bridge = window.dshDesktop
  const settings = bridge?.launcher.settings
  const [snapshot, setSnapshot] = useState<LauncherSettingsSnapshot | null>(null)
  const pendingValues = useRef(new Map<string, unknown>())
  const [workflowSnapshotRevision, setWorkflowSnapshotRevision] = useState(0)
  const workflowSnapshotValue = useRef<string | undefined>(undefined)
  const [status, setStatus] = useState('Loading TockLauncher settings…')
  const [busy, setBusy] = useState(false)
  const activeSaves = useRef(0)
  const [resetPending, setResetPending] = useState(false)
  const resetDialogRef = useRef<HTMLDialogElement>(null)
  const resetTriggerRef = useRef<HTMLButtonElement>(null)
  const [secret, setSecret] = useState('')
  const [launchOnStart, setLaunchOnStart] = useState<boolean | null>(null)
  const [updater, setUpdater] = useState<UpdaterState | null>(null)
  const [simpleFileSearchDraft, setSimpleFileSearchDraft] = useState<readonly LauncherSimpleFileSearchDraft[] | null>(null)
  const simpleFileSearchDraftRevision = useRef(0)
  const writeTail = useRef<Promise<void> | undefined>(undefined)
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
    const serializedWorkflow = launcherWorkflowSnapshotToken(next)
    if (serializedWorkflow !== workflowSnapshotValue.current) {
      workflowSnapshotValue.current = serializedWorkflow
      setWorkflowSnapshotRevision(revision => revision + 1)
    }
    const dirtyValues = pendingValues.current
    setSnapshot(mergeLauncherDirtyValues(next, dirtyValues))
    return next
  }, [settings])

  useEffect(() => {
    if (!settings) return
    void reload().then(() => setStatus(t('ready'))).catch(() => setStatus(t('unavailable')))
  }, [reload, settings])

  useEffect(() => {
    if (!resetPending) {
      resetDialogRef.current?.close()
      return
    }
    const dialog = resetDialogRef.current
    if (dialog !== null && !dialog.open) {
      try { dialog.showModal() } catch { dialog.setAttribute('open', '') }
    }
    requestAnimationFrame(() => dialog?.querySelector<HTMLButtonElement>('[data-testid="tocklauncher-reset-cancel"]')?.focus())
  }, [resetPending])

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
    if (!settings) return Promise.resolve(false)
    const requiresProviderRescan = launcherSettingRequiresProviderRescan(key)
    if (requiresProviderRescan) {
      activeSaves.current += 1
      setBusy(true)
    }
    setStatus(t('saving'))
    const isSimpleFileSearchFolders = key === 'extension[SimpleFileSearch].folders'
    const draftRevision = simpleFileSearchDraftRevision.current
    const trackPendingValue = !LAUNCHER_SENSITIVE_SETTING_KEYS.includes(key as never)
    if (trackPendingValue) pendingValues.current.set(key, value)
    if (trackPendingValue && !isSimpleFileSearchFolders) {
      setSnapshot(previous => previous === null ? previous : Object.freeze({
        ...previous,
        values: Object.freeze({ ...previous.values, [key]: value }),
      }))
    }
    const operation = (writeTail.current ?? Promise.resolve()).catch(() => undefined).then(async () => {
      await settings.updateSetting(key, value)
      await reload()
    })
    writeTail.current = operation.then(() => undefined, () => undefined)
    return operation.then(() => {
      if (pendingValues.current.get(key) === value) pendingValues.current.delete(key)
      if (isSimpleFileSearchFolders && simpleFileSearchDraftRevision.current === draftRevision) {
        setSimpleFileSearchDraft(value as readonly LauncherSimpleFileSearchDraft[])
      }
      setStatus(t('saved'))
      return true
    }, () => {
      if (pendingValues.current.get(key) === value) pendingValues.current.delete(key)
      if (!isSimpleFileSearchFolders) void reload().catch(() => {})
      setStatus(launcherFixedText('TockLauncher settings could not be saved.'))
      return false
    }).finally(() => {
      if (requiresProviderRescan) {
        activeSaves.current = Math.max(0, activeSaves.current - 1)
        if (activeSaves.current === 0) setBusy(false)
      }
    })
  }, [reload, settings])

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
      await writeTail.current?.catch(() => undefined)
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
  }, [clearSimpleFileSearchDraft, reload])

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

      <SectionCard icon={<MonitorCog aria-hidden="true" className="size-4" />} title={t('sectionSearch')} description="Tune the matching surface without exposing launcher internals.">
        <Field title="Search engine" description="The selected matcher is applied to the next search.">
          <NativeSelect aria-label="Search engine" size="sm" value={state.preferences.searchEngineId} disabled={busy} onChange={event => { void save('searchEngine.id', event.target.value) }}>
            <NativeSelectOption value="fuzzysort">fuzzysort</NativeSelectOption>
            <NativeSelectOption value="Fuse.js">Fuse.js</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field title={`${launcherFixedText('Fuzziness')} (${fuzzinessDraft.toFixed(1)})`} description="Higher values broaden fuzzy matching.">
          <Input aria-label="Search fuzziness" className="w-full max-w-xs min-w-0" type="range" min="0" max="1" step="0.1" disabled={busy} value={fuzzinessDraft} onChange={event => { setFuzzinessDraft(Number(event.target.value)) }} onBlur={() => { void save('searchEngine.fuzziness', fuzzinessDraft) }} />
        </Field>
        <Field title="Maximum results" description="Keep result lists concise while retaining pinned items.">
          <Input aria-label="Maximum results" className="w-24" type="number" min="1" max="200" disabled={busy} value={state.preferences.maxSearchResultItems} onChange={event => { const value = Math.min(200, Math.max(1, Number(event.target.value) || 50)); void save('searchEngine.maxResultLength', value) }} />
        </Field>
        <Field title="Search history" description="History is stored in the Desktop-owned launcher repository.">
          <Switch aria-label="Enable search history" checked={state.preferences.historyEnabled} disabled={busy} onCheckedChange={checked => { void save('general.searchHistory.enabled', checked) }} />
        </Field>
        <Field title="History limit" description={`${state.history.length} saved searches currently visible to TockLauncher.`}>
          <Input aria-label="History limit" className="w-24" type="number" min="1" max="100" disabled={busy} value={state.preferences.historyLimit} onChange={event => { const value = Math.min(100, Math.max(1, Number(event.target.value) || 10)); void save('general.searchHistory.limit', value) }} />
        </Field>
        <Field title="Saved searches" description="Clear persisted history without changing provider settings.">
          <Button aria-label={launcherFixedText('Clear search history')} size="sm" variant="outline" disabled={busy || state.history.length === 0} onClick={clearHistory}><Trash2 aria-hidden="true" />{launcherFixedText('Clear History')}</Button>
        </Field>
        <details className="min-w-0 rounded-md border border-border/60 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">{launcherFixedText('Recent search entries')}</summary>{state.history.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{launcherFixedText('No Recent Searches')}</p> : <ul className="mt-2 max-h-32 min-w-0 list-disc overflow-auto pl-5 text-xs text-muted-foreground">{state.history.map(query => <li key={query} className="min-w-0 break-words" title={query}>{query}</li>)}</ul>}</details>
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="search" snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Palette aria-hidden="true" className="size-4" />} title={t('sectionAppearance')} description="Search presentation follows the shared TockTeam appearance owner and remains keyboard accessible.">
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="appearance" snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<MonitorCog aria-hidden="true" className="size-4" />} title={t('sectionDesktop')} description="Window and shell behavior is applied by Electron main. Launch on Start remains in its existing TockTeam Preferences owner.">
        <Field title="Appearance source" description={`Compatibility mode is ${state.preferences.themeSource}; active mode and skin follow the DSH TockTeam Appearance owner.`}><Badge variant="outline">{launcherFixedText('Follows TockTeam Appearance')}</Badge></Field>
        <Field title="Launch on Start" description="Uses the single TockTeam login-item owner; it is not duplicated in launcher settings.">
          <Switch aria-label={launcherFixedText('Launch on Start')} checked={launchOnStart === true} disabled={busy || launchOnStart === null} onCheckedChange={checked => { setBusy(true); void bridge.launchOnStart.set(checked).then(value => { setLaunchOnStart(value); setStatus(launcherFixedText('Launch on Start saved.')) }).catch(() => setStatus(launcherFixedText('Launch on Start could not be saved.'))).finally(() => setBusy(false)) }} />
        </Field>
        <Field title="Show TockLauncher on startup" description="TockTeam defaults to opt-in startup visibility.">
          <Switch aria-label="Show TockLauncher on startup" checked={state.preferences.showOnStartup} disabled={busy} onCheckedChange={checked => { void save('window.showOnStartup', checked) }} />
        </Field>
        <Field title="Keep TockLauncher always on top"><Switch aria-label="Keep TockLauncher always on top" checked={state.preferences.alwaysOnTop} disabled={busy} onCheckedChange={checked => { void save('window.alwaysOnTop', checked) }} /></Field>
        <Field title="Show on all workspaces"><Switch aria-label="Show on all workspaces" checked={state.preferences.visibleOnAllWorkspaces} disabled={busy} onCheckedChange={checked => { void save('window.visibleOnAllWorkspaces', checked) }} /></Field>
        <Field title="Show tray icon"><Switch aria-label="Show tray icon" checked={state.preferences.showTrayIcon} disabled={busy} onCheckedChange={checked => { void save('general.tray.showIcon', checked) }} /></Field>
        <Field title="Show Dock icon"><Switch aria-label="Show Dock icon" checked={state.preferences.showDockIcon} disabled={busy} onCheckedChange={checked => { void save('appearance.showAppIconInDock', checked) }} /></Field>
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="window" snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Keyboard aria-hidden="true" className="size-4" />} title={t('sectionKeyboard')} description="Choose selection behavior without exposing paths or other authority.">
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="keyboard" snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Globe2 aria-hidden="true" className="size-4" />} title={t('sectionBrowser')} description="Browser grants and global shortcut ownership remain in Electron main.">
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="browser" snapshot={snapshot} />
        <Field title="Language" description="The DSH locale service owns launcher language selection.">
          <NativeSelect aria-label={launcherFixedText('Language')} size="sm" disabled={busy} value={locale.getSnapshot().active} onChange={event => { if (event.target.value === 'en' || event.target.value === 'zh') locale.setLocale(event.target.value) }}>
            <NativeSelectOption value="en">English</NativeSelectOption>
            <NativeSelectOption value="zh">简体中文</NativeSelectOption>
          </NativeSelect>
        </Field>
      </SectionCard>

      <SectionCard icon={<ShieldCheck aria-hidden="true" className="size-4" />} title={t('sectionExtensions')} description="Enablement is serialized through main before the next scan. Provider controls remain with their owning slices." testId="tocklauncher-extension-toggles">
        <div className="grid min-w-0 grid-cols-1 gap-x-6 sm:grid-cols-2">
          {LAUNCHER_COMPOSITION.extensionIds.map(extensionId => (
            <Field key={extensionId} title={extensionId}>
              <Switch aria-label={`${launcherFixedText('Enable')} ${extensionId}`} checked={enabled.has(extensionId)} disabled={busy} onCheckedChange={checked => setExtension(extensionId, checked)} />
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={<MonitorCog aria-hidden="true" className="size-4" />} title={t('sectionLocal')} description="Configure the seven local transformation providers without exposing renderer authority.">
        <LauncherLocalSettings busy={busy} save={save} snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Search aria-hidden="true" className="size-4" />} title={t('sectionDiscovery')} description="Configure bounded applications, bookmarks, JetBrains projects, and VS Code recents.">
        <LauncherDiscoverySettings busy={busy} save={save} snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Search aria-hidden="true" className="size-4" />} title={t('sectionFile')} description="Configure bounded indexed and home-contained file search providers.">
        <LauncherFileSearchSettings busy={busy} draftFolders={simpleFileSearchDraft} onDraftFoldersChange={updateSimpleFileSearchDraft} save={save} snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<MonitorCog aria-hidden="true" className="size-4" />} title={t('sectionTerminal')} description="Configure the finite native terminal catalog. Commands always require main-process approval.">
        <LauncherTerminalSettings busy={busy} save={save} snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<ShieldCheck aria-hidden="true" className="size-4" />} title={t('sectionWorkflow')} description="Compose a bounded ordered sequence of exact native actions. Commands always use a fixed shell policy and trusted Desktop home.">
        <LauncherWorkflowSettings key={workflowSnapshotRevision} busy={busy} save={save} snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Globe2 aria-hidden="true" className="size-4" />} title={t('sectionNetwork')} description="Configure fixed, bounded network providers without exposing renderer network authority.">
        <LauncherNetworkSettings busy={busy} save={save} snapshot={snapshot} />
      </SectionCard>

      <SectionCard icon={<Database aria-hidden="true" className="size-4" />} title={t('sectionStorage')} description="Managed files and external grants are owned by Electron main; no filesystem path crosses this page.">
        <Field title="Settings source" description={launcherFixedText(statusLabel(snapshot))}><Badge variant={snapshot.settingsSource === 'external' ? 'default' : 'secondary'}>{launcherFixedText(snapshot.settingsSource === 'external' ? 'External' : 'Managed')}</Badge></Field>
        <Field title="External write capability" description="Unsupported platforms stay readable and revocable but reject writes before touching the file."><Badge variant={snapshot.externalWriteAvailable === false ? 'outline' : 'secondary'}>{launcherFixedText(snapshot.externalWriteAvailable === false ? 'Read-only' : 'Available')}</Badge></Field>
        <Field title="Recovery" description={snapshot.recoveredArtifacts?.length ? `Recovered: ${snapshot.recoveredArtifacts.join(', ')}.` : 'Each settings, index, and log artifact has an independent managed backup.'}><Badge variant={snapshot.recoveredArtifacts?.length ? 'default' : 'secondary'}>{launcherFixedText(snapshot.recoveredArtifacts?.length ? 'Recovered' : 'Healthy')}</Badge></Field>
        <Field title="Secure storage" description="Sensitive values are encrypted in Electron main and are never hydrated into this renderer."><Badge variant={snapshot.secureStorageAvailable === false ? 'outline' : 'secondary'}>{launcherFixedText(snapshot.secureStorageAvailable === false ? 'Unavailable' : 'Available')}</Badge></Field>
        <Field title="Settings files">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('Import', settings.importSettings, true, true) }}><Upload aria-hidden="true" />{launcherFixedText('Import')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('Export', settings.exportSettings, false) }}><Download aria-hidden="true" />{launcherFixedText('Export')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('External selection', settings.selectExternalSettings, true, true) }}>{launcherFixedText('Choose external file')}</Button>
            <Button size="sm" variant="outline" disabled={busy || snapshot.externalGrantStatus === 'none'} onClick={() => { void operation('External revocation', settings.revokeExternalSettings) }}>{launcherFixedText('Revoke external file')}</Button>
          </div>
        </Field>
        <Field title="Custom browser" description={rendererIsLinux ? 'Linux always uses the system browser; custom browser selection is unavailable.' : 'The native browser grant is status-only in the renderer; the selected target never crosses this page.'}>
          <div className="flex flex-wrap justify-end gap-2">
            <Button aria-label={launcherFixedText('Choose custom browser')} data-testid="tockteam-custom-browser-choose" size="sm" variant="outline" disabled={busy || rendererIsLinux} onClick={event => { const target = event.currentTarget; void operation('Custom browser selection', settings.selectCustomBrowser, true, false, target).finally(() => { setTimeout(() => target.focus(), 50) }) }}>{launcherFixedText('Choose custom browser')}</Button>
            <Button aria-label={launcherFixedText('Revoke custom browser')} data-testid="tockteam-custom-browser-revoke" size="sm" variant="outline" disabled={busy || rendererIsLinux || snapshot.customBrowserStatus === 'none'} onClick={event => { const target = event.currentTarget; void operation('Custom browser revocation', settings.revokeCustomBrowser, true, false, target).finally(() => { setTimeout(() => target.focus(), 50) }) }}>{launcherFixedText('Revoke custom browser')}</Button>
          </div>
        </Field>
        <Field title="Reset TockLauncher settings" description="Clears overrides, favorites, exclusions, history, and the custom-browser grant, then securely relaunches Desktop.">
          <Button ref={resetTriggerRef} size="sm" variant="outline" disabled={busy} onClick={() => setResetPending(true)}><RotateCcw aria-hidden="true" />{launcherFixedText('Reset')}</Button>
          <dialog ref={resetDialogRef} aria-describedby="tocklauncher-reset-description" aria-labelledby="tocklauncher-reset-title" aria-modal="true" className="rounded-lg border border-border bg-background p-4 text-foreground shadow-xl" data-testid="tocklauncher-reset-dialog" onCancel={event => { event.preventDefault(); setResetPending(false); requestAnimationFrame(() => resetTriggerRef.current?.focus()) }} onKeyDown={event => { if (event.key !== 'Escape') return; event.preventDefault(); setResetPending(false); requestAnimationFrame(() => resetTriggerRef.current?.focus()) }}>
            <h3 id="tocklauncher-reset-title" className="text-base font-semibold">{launcherFixedText('Reset TockLauncher settings?')}</h3>
            <p id="tocklauncher-reset-description" className="mt-2 max-w-md text-sm text-muted-foreground">{launcherFixedText('This clears launcher overrides, favorites, exclusions, history, and the custom-browser grant.')}</p>
            <div className="mt-4 flex justify-end gap-2"><Button data-testid="tocklauncher-reset-cancel" type="button" variant="outline" disabled={busy} onClick={() => { setResetPending(false); requestAnimationFrame(() => resetTriggerRef.current?.focus()) }}>{launcherFixedText('Cancel')}</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => { setResetPending(false); void operation('Reset', settings.resetSettings, true, true, resetTriggerRef.current ?? undefined) }}><Trash2 aria-hidden="true" />{launcherFixedText('Confirm reset')}</Button></div>
          </dialog>
        </Field>
      </SectionCard>

      <SectionCard icon={<KeyRound aria-hidden="true" className="size-4" />} title={t('sectionSecurity')} description="Secrets are write-only. A missing or unavailable key is never represented by ciphertext or an error payload.">
        <Field title="DeepL API key" description="Enter a new key to encrypt it with the operating system secure-storage backend.">
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Label htmlFor="tocklauncher-deepl-key" className="sr-only">{launcherFixedText('DeepL API key')}</Label>
            <Input id="tocklauncher-deepl-key" aria-label={launcherFixedText('DeepL API key')} autoComplete="new-password" className="w-full max-w-sm min-w-0" maxLength={8192} type="password" value={secret} disabled={busy || snapshot.secureStorageAvailable === false} onChange={event => setSecret(event.target.value)} />
            <Button size="sm" variant="outline" disabled={busy || secret.length === 0 || snapshot.secureStorageAvailable === false} onClick={() => { const value = secret; void save('extension[DeeplTranslator].apiKey', value).then(saved => { if (saved) setSecret('') }) }}>Save key</Button>
          </div>
        </Field>
        <Alert role="status" aria-live="polite"><ShieldCheck aria-hidden="true" /><AlertTitle>{launcherFixedText('Protected secret')}</AlertTitle><AlertDescription>{snapshot.missingSensitiveKeys.includes('extension[DeeplTranslator].apiKey') ? launcherFixedText('No usable DeepL key is stored.') : launcherFixedText('A usable DeepL key is stored with secure storage.')}</AlertDescription></Alert>
      </SectionCard>

      <SectionCard icon={<RefreshCw aria-hidden="true" className="size-4" />} title={t('sectionUpdates')} description="Automatic updates remain owned by the existing Electron updater state machine.">
        {updater ? <>
          <Field title="Update status" description={updater.message ?? `Current version ${updater.currentVersion}`}><Badge variant={updater.status === 'error' ? 'destructive' : 'secondary'}>{updater.status}</Badge></Field>
          <Field title="Update actions"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || !updater.canRetry} onClick={() => { void changeUpdater(() => bridge.appUpdate.check(), 'Check') }}><RefreshCw aria-hidden="true" />{launcherFixedText('Check')}</Button><Button size="sm" variant="outline" disabled={busy || updater.status !== 'available'} onClick={() => { void changeUpdater(() => bridge.appUpdate.download(), 'Download') }}>{launcherFixedText('Download')}</Button><Button size="sm" variant="outline" disabled={busy || updater.status !== 'downloaded'} onClick={() => { void changeUpdater(() => bridge.appUpdate.install(), 'Install') }}>{launcherFixedText('Install')}</Button></div></Field>
        </> : <p className="text-sm text-muted-foreground">{launcherFixedText('Updater state is unavailable.')}</p>}
      </SectionCard>

      <SectionCard icon={<Check aria-hidden="true" className="size-4" />} title={t('sectionAbout')} description="Compatibility inventory is explicit even while provider slices are staged.">
        <Field title="Catalog coverage" description="The settings catalog is generated from the pinned Ueli parity manifest."><Badge variant="secondary">{LAUNCHER_SETTING_CATALOG_COUNT} rows · 102 runtime keys</Badge></Field>
        <Field title="Appearance ownership" description="The compatibility appearance.themeSource value is retained, but the active mode and skin follow the DSH TockTeam Appearance owner."><Badge variant="outline">Follows TockTeam Appearance</Badge></Field>
        <Field title="Browser grant" description="Custom-browser identity is status-only here; selection and revocation are native operations."><Badge variant="secondary">{launcherFixedText(snapshot.customBrowserStatus ?? 'none')}</Badge></Field>
        <Field title="Diagnostics" description="Bounded launcher diagnostics are retained without secret or path material."><span className="max-w-full truncate text-xs text-muted-foreground">{snapshot.logs.at(-1) ?? launcherFixedText('No launcher diagnostics.')}</span></Field>
        <LauncherSurfaceSettingsSection busy={busy} platform={rendererPlatform} save={save} section="compatibility" snapshot={snapshot} />
      </SectionCard>

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
