import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Accessibility, Keyboard, Palette, SlidersHorizontal, Timer, WandSparkles } from 'lucide-react'
import { Badge } from '@tockteam/ui/badge'
import { Input } from '@tockteam/ui/input'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { LAUNCHER_SETTINGS_CATALOG } from './launcher-setting-catalog.ts'
import { launcherSettingDisposition } from './launcher-settings-model.ts'
import { isLauncherRendererSettingValue, type LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import type { LauncherSurfacePlatform } from './launcher-contract.ts'
import { launcherFixedText } from './launcher-i18n.ts'

export type LauncherSurfaceSection = 'appearance' | 'browser' | 'compatibility' | 'keyboard' | 'search' | 'window'

export type LauncherSurfaceSettingsProps = Readonly<{
  busy: boolean
  platform: LauncherSurfacePlatform
  save: (key: string, value: unknown) => Promise<boolean>
  section?: LauncherSurfaceSection
  snapshot: LauncherSettingsSnapshot
}>

function stored<T>(snapshot: LauncherSettingsSnapshot, key: string, fallback: T): T {
  return Object.hasOwn(snapshot.values, key) ? snapshot.values[key] as T : fallback
}

function labelFor(key: string): string {
  const leaf = key.slice(key.lastIndexOf('.') + 1).replaceAll(/([a-z])([A-Z])/gu, '$1 $2').replaceAll(/[-_]/gu, ' ')
  return leaf.length === 0 ? key : `${leaf[0]!.toLocaleUpperCase('en-US')}${leaf.slice(1)}`
}

function Field({ label, description, children }: Readonly<{ label: string; description?: string; children: ReactNode }>): ReactNode {
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0"><div className="min-w-0 flex-1"><div className="text-sm font-medium text-foreground">{launcherFixedText(label)}</div>{description ? <div className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</div> : null}</div><div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{children}</div></div>
}

function SettingValue({ keyName, value, busy, save }: Readonly<{ keyName: string; value: unknown; busy: boolean; save: LauncherSurfaceSettingsProps['save'] }>): ReactNode {
  const [draft, setDraft] = useState<string | number>(() => typeof value === 'string' || typeof value === 'number' ? value : '')
  useEffect(() => {
    if (typeof value === 'string' || typeof value === 'number') setDraft(value)
  }, [keyName, value])
  if (keyName === 'appearance.searchBarAppearance') return <NativeSelect aria-label={labelFor(keyName)} disabled={busy} value={typeof value === 'string' ? value : 'auto'} onChange={event => { void save(keyName, event.target.value) }}><NativeSelectOption value="auto">Auto</NativeSelectOption><NativeSelectOption value="outline">Outline</NativeSelectOption><NativeSelectOption value="underline">Underline</NativeSelectOption><NativeSelectOption value="filled-darker">Filled darker</NativeSelectOption><NativeSelectOption value="filled-lighter">Filled lighter</NativeSelectOption></NativeSelect>
  if (keyName === 'appearance.searchBarSize') return <NativeSelect aria-label={labelFor(keyName)} disabled={busy} value={typeof value === 'string' ? value : 'large'} onChange={event => { void save(keyName, event.target.value) }}><NativeSelectOption value="small">Small</NativeSelectOption><NativeSelectOption value="medium">Medium</NativeSelectOption><NativeSelectOption value="large">Large</NativeSelectOption></NativeSelect>
  if (keyName === 'appearance.searchResultListLayout') return <NativeSelect aria-label={labelFor(keyName)} disabled={busy} value={typeof value === 'string' ? value : 'compact'} onChange={event => { void save(keyName, event.target.value) }}><NativeSelectOption value="compact">Compact</NativeSelectOption><NativeSelectOption value="detailed">Detailed</NativeSelectOption></NativeSelect>
  if (keyName === 'keyboardAndMouse.singleClickBehavior' || keyName === 'keyboardAndMouse.doubleClickBehavior') return <NativeSelect aria-label={labelFor(keyName)} disabled={busy} value={typeof value === 'string' ? value : 'selectSearchResultItem'} onChange={event => { void save(keyName, event.target.value) }}><NativeSelectOption value="selectSearchResultItem">Select</NativeSelectOption><NativeSelectOption value="invokeSearchResultItem">Invoke</NativeSelectOption></NativeSelect>
  if (keyName === 'window.scrollBehavior') return <NativeSelect aria-label={labelFor(keyName)} disabled={busy} value={typeof value === 'string' ? value : 'smooth'} onChange={event => { void save(keyName, event.target.value) }}><NativeSelectOption value="auto">Auto</NativeSelectOption><NativeSelectOption value="smooth">Smooth</NativeSelectOption><NativeSelectOption value="instant">Instant</NativeSelectOption></NativeSelect>
  if (keyName === 'window.hideWindowOn') {
    const options = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    return <div className="flex flex-wrap gap-2">{(['blur', 'afterInvocation', 'escapePressed'] as const).map(reason => <label key={reason} className="flex items-center gap-2 text-xs"><input aria-label={`${labelFor(keyName)} ${reason}`} checked={options.includes(reason)} disabled={busy} type="checkbox" onChange={event => { const next = event.target.checked ? [...options, reason] : options.filter(item => item !== reason); if (isLauncherRendererSettingValue(keyName, next)) void save(keyName, next) }} />{reason}</label>)}</div>
  }
  if (keyName === 'general.hotkey.enabled' || keyName === 'general.preserveUserInput' || keyName === 'appearance.showSearchIcon' || keyName === 'general.browser.useDefaultWebBrowser') return <Switch aria-label={labelFor(keyName)} checked={value === true} disabled={busy} onCheckedChange={checked => { void save(keyName, checked) }} />
  if (keyName === 'searchEngine.automaticRescan') return <Badge variant="outline">Manual rescan only</Badge>
  if (typeof value === 'boolean') return <Switch aria-label={labelFor(keyName)} checked={value} disabled={busy} onCheckedChange={checked => { void save(keyName, checked) }} />
  if (typeof value === 'number') return <Input aria-label={labelFor(keyName)} className="w-28" disabled={busy} type="number" value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { const next = Number(draft); if (isLauncherRendererSettingValue(keyName, next)) void save(keyName, next) }} />
  if (typeof value === 'string') return <Input aria-label={labelFor(keyName)} className="max-w-full min-w-0" maxLength={512} disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { if (isLauncherRendererSettingValue(keyName, draft)) void save(keyName, draft) }} />
  return <Badge variant="outline">Configured</Badge>
}

const STATUS_ONLY = new Set([
  'appearance.themeName',
  'appearance.themeSource',
  'general.hotkey',
  'general.language',
  'imageGenerator.faviconApiProvider',
  'keyboardAndMouse.dragAndDropEnabled',
  'window.acrylicOpacity',
  'window.backgroundMaterial',
  'window.vibrancy',
  'searchEngine.automaticRescan',
  'searchEngine.rescanIntervalInSeconds',
  'general.browser.customWebBrowser.executableFilePath',
  'general.browser.customWebBrowserName',
  'general.browser.customWebBrowser.commandlineArguments',
])

const RENDERED_KEYS = new Set<string>()

function effectiveValue(snapshot: LauncherSettingsSnapshot, key: string): unknown {
  const value = snapshot.values[key]
  if (value !== undefined) return value
  if (key === 'appearance.searchBarAppearance') return 'auto'
  if (key === 'appearance.searchBarPlaceholderText') return 'Search TockTeam'
  if (key === 'appearance.searchBarSize') return 'large'
  if (key === 'appearance.searchResultListLayout') return 'compact'
  if (key === 'appearance.showSearchIcon') return true
  if (key === 'general.browser.useDefaultWebBrowser') return true
  if (key === 'general.hotkey.enabled') return true
  if (key === 'general.preserveUserInput') return true
  if (key === 'keyboardAndMouse.doubleClickBehavior') return 'invokeSearchResultItem'
  if (key === 'keyboardAndMouse.singleClickBehavior') return 'selectSearchResultItem'
  if (key === 'searchEngine.automaticRescan') return true
  if (key === 'window.hideWindowOn') return ['blur', 'afterInvocation']
  if (key === 'window.scrollBehavior') return 'smooth'
  return undefined
}

export function LauncherSurfaceSettingsSection({ busy, platform, save, section, snapshot }: LauncherSurfaceSettingsProps): ReactNode {
  const sections = useMemo(() => ({
    appearance: LAUNCHER_SETTINGS_CATALOG.filter(row => row.key.startsWith('appearance.') && !STATUS_ONLY.has(row.key)),
    browser: LAUNCHER_SETTINGS_CATALOG.filter(row => (row.key.startsWith('general.browser.') || row.key === 'general.hotkey.enabled' || row.key === 'general.preserveUserInput' || row.key === 'general.language') && !RENDERED_KEYS.has(row.key) && !STATUS_ONLY.has(row.key)),
    keyboard: LAUNCHER_SETTINGS_CATALOG.filter(row => row.key.startsWith('keyboardAndMouse.') && !RENDERED_KEYS.has(row.key) && !STATUS_ONLY.has(row.key)),
    search: LAUNCHER_SETTINGS_CATALOG.filter(row => row.key.startsWith('searchEngine.') && !['searchEngine.fuzziness', 'searchEngine.id', 'searchEngine.maxResultLength'].includes(row.key)),
    window: LAUNCHER_SETTINGS_CATALOG.filter(row => row.key.startsWith('window.') && !RENDERED_KEYS.has(row.key) && !STATUS_ONLY.has(row.key)),
  }), [])
  const renderRows = (rows: typeof sections.appearance): ReactNode => rows.map(row => {
    const disposition = launcherSettingDisposition(row.key, platform)
    const value = effectiveValue(snapshot, row.key)
    if (disposition === 'platform-disabled') return <Field key={row.key} label={labelFor(row.key)} description={`Retained for compatibility; unused on ${platform}.`}><Badge variant="outline">Unavailable on {platform}</Badge></Field>
    if (disposition === 'status-only' || STATUS_ONLY.has(row.key)) return <Field key={row.key} label={labelFor(row.key)} description="Owned by TockTeam Desktop or the DSH appearance/locale service."><Badge variant="outline">Managed by TockTeam</Badge></Field>
    return <Field key={row.key} label={labelFor(row.key)}><SettingValue keyName={row.key} value={value} busy={busy} save={save} /></Field>
  })
  const sectionContent: Readonly<Record<LauncherSurfaceSection, ReactNode>> = {
    appearance: <section aria-labelledby="tocklauncher-appearance-heading"><h2 id="tocklauncher-appearance-heading" className="flex items-center gap-2 text-base font-semibold text-foreground"><Palette aria-hidden="true" className="size-4" />Appearance and Input</h2><p className="mt-1 text-xs text-muted-foreground">Search presentation follows the shared TockTeam theme tokens. Theme and locale remain owned by DSH.</p>{renderRows(sections.appearance)}</section>,
    browser: <section aria-labelledby="tocklauncher-browser-heading"><h2 id="tocklauncher-browser-heading" className="flex items-center gap-2 text-base font-semibold text-foreground"><SlidersHorizontal aria-hidden="true" className="size-4" />Browser and Shortcuts</h2><p className="mt-1 text-xs text-muted-foreground">Browser grants and global shortcuts are main-owned. Selection and revocation use native operations.</p>{renderRows(sections.browser)}<Field label="Custom browser grant" description="Use the native Choose/Revoke controls in Storage and Privacy; executable paths and arguments are never editable here."><Badge variant="outline">Status-only</Badge></Field></section>,
    compatibility: <section aria-labelledby="tocklauncher-compatibility-heading"><h2 id="tocklauncher-compatibility-heading" className="flex items-center gap-2 text-base font-semibold text-foreground"><Accessibility aria-hidden="true" className="size-4" />Compatibility ownership</h2><p className="mt-1 text-xs text-muted-foreground">All accepted settings are classified as effective, platform-disabled, status-only, or internal. The complete catalog remains available to the owning provider sections.</p><div className="grid gap-2 sm:grid-cols-2">{LAUNCHER_SETTINGS_CATALOG.filter(row => STATUS_ONLY.has(row.key) || launcherSettingDisposition(row.key, platform) === 'platform-disabled' || launcherSettingDisposition(row.key, platform) === 'internal').map(row => <div key={row.key} className="flex min-w-0 items-center justify-between gap-2 rounded border border-border/60 px-2 py-2 text-xs"><span className="min-w-0 truncate" title={row.key}>{labelFor(row.key)}</span><Badge variant="outline">{launcherSettingDisposition(row.key, platform)}</Badge></div>)}</div></section>,
    keyboard: <section aria-labelledby="tocklauncher-keyboard-heading"><h2 id="tocklauncher-keyboard-heading" className="flex items-center gap-2 text-base font-semibold text-foreground"><Keyboard aria-hidden="true" className="size-4" />Keyboard and Mouse</h2><p className="mt-1 text-xs text-muted-foreground">Choose selection behavior. Drag payloads remain disabled because they cannot carry authority.</p>{renderRows(sections.keyboard)}<Field label="Drag and drop" description="Disabled: launcher payloads never contain paths, URLs, commands, or executable records."><Badge variant="outline">Disabled for security</Badge></Field></section>,
    search: <section aria-labelledby="tocklauncher-search-heading"><h2 id="tocklauncher-search-heading" className="flex items-center gap-2 text-base font-semibold text-foreground"><WandSparkles aria-hidden="true" className="size-4" />Search engine</h2><p className="mt-1 text-xs text-muted-foreground">Automatic background rescans are intentionally represented as a bounded manual-rescan status.</p>{renderRows(sections.search)}</section>,
    window: <section aria-labelledby="tocklauncher-window-heading"><h2 id="tocklauncher-window-heading" className="flex items-center gap-2 text-base font-semibold text-foreground"><Timer aria-hidden="true" className="size-4" />Window behavior</h2><p className="mt-1 text-xs text-muted-foreground">Unsupported native materials remain visible as bounded compatibility status.</p>{renderRows(sections.window)}</section>,
  }
  if (section !== undefined) return sectionContent[section]
  return <div className="space-y-4" data-testid="tocklauncher-surface-settings">{Object.values(sectionContent)}</div>
}
