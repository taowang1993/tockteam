import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, ReactNode } from 'react'
import { Globe2, Laptop, Route, Search } from 'lucide-react'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { launcherFixedText } from './launcher-i18n.ts'
import { LauncherSyncedInput, LauncherSyncedNativeSelect, LauncherSyncedTextarea } from './launcher-settings-drafts.tsx'

const DISCOVERY_RENDERER_DEFAULTS = Object.freeze({
  ApplicationSearch: Object.freeze({
    includeWindowsStoreApps: true,
    linuxFolders: Object.freeze([] as readonly string[]),
    macOsFolders: Object.freeze(['/System/Applications', '/System/Library/CoreServices', '/Applications'] as readonly string[]),
    mdfindFilterOption: "kMDItemKind=='Application'",
    windowsFileExtensions: Object.freeze(['lnk'] as readonly string[]),
    windowsFolders: Object.freeze([] as readonly string[]),
  }),
  BrowserBookmarks: Object.freeze({ browsers: Object.freeze([] as readonly string[]), iconType: 'favicon' as const, searchResultStyle: 'nameOnly' as const }),
  VSCode: Object.freeze({ command: 'code %s', prefix: 'vscode', showPath: false }),
})

type DiscoverySettingsProps = Readonly<{
  busy: boolean
  save: (key: string, value: unknown) => Promise<boolean>
  snapshot: LauncherSettingsSnapshot
}>

const BROWSERS = Object.freeze(['Arc', 'Brave Browser', 'Firefox', 'Google Chrome', 'Microsoft Edge', 'Yandex Browser', 'Zen'])

function stored<T>(snapshot: LauncherSettingsSnapshot, key: string, fallback: T): T {
  return (snapshot.values[key] as T | undefined) ?? fallback
}

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>): ReactNode {
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"><span className="text-sm text-foreground">{launcherFixedText(label)}</span><span className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{children}</span></div>
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function saveArray(event: FocusEvent<HTMLTextAreaElement>, key: string, save: DiscoverySettingsProps['save']): void {
  try {
    const parsed: unknown = JSON.parse(event.currentTarget.value)
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error('invalid')
    event.currentTarget.removeAttribute('aria-invalid')
    void save(key, parsed)
  } catch { event.currentTarget.setAttribute('aria-invalid', 'true') }
}

export function LauncherDiscoverySettings({ busy, save, snapshot }: DiscoverySettingsProps): ReactNode {
  const defaults = DISCOVERY_RENDERER_DEFAULTS
  const application = defaults.ApplicationSearch
  const snapshotBrowserSelection = stored<readonly string[]>(snapshot, 'extension[BrowserBookmarks].browsers', defaults.BrowserBookmarks.browsers)
  const [browserSelection, setBrowserSelection] = useState<readonly string[]>(snapshotBrowserSelection)
  const browserSelectionRef = useRef<readonly string[]>(snapshotBrowserSelection)
  const pendingBrowserSelection = useRef<readonly string[] | undefined>(undefined)
  useEffect(() => {
    const pending = pendingBrowserSelection.current
    if (pending !== undefined && !sameStringArray(snapshotBrowserSelection, pending)) return
    if (pending !== undefined) pendingBrowserSelection.current = undefined
    browserSelectionRef.current = snapshotBrowserSelection
    setBrowserSelection(snapshotBrowserSelection)
  }, [snapshotBrowserSelection])
  const toggleBrowser = (browser: string, checked: boolean): void => {
    const next = BROWSERS.filter(candidate => candidate === browser ? checked : browserSelectionRef.current.includes(candidate))
    browserSelectionRef.current = next
    pendingBrowserSelection.current = next
    setBrowserSelection(next)
    void save('extension[BrowserBookmarks].browsers', next).then(success => {
      if (success || pendingBrowserSelection.current !== next) return
      pendingBrowserSelection.current = undefined
      const fallback = stored<readonly string[]>(snapshot, 'extension[BrowserBookmarks].browsers', defaults.BrowserBookmarks.browsers)
      browserSelectionRef.current = fallback
      setBrowserSelection(fallback)
    }).catch(() => {
      if (pendingBrowserSelection.current !== next) return
      pendingBrowserSelection.current = undefined
      browserSelectionRef.current = snapshotBrowserSelection
      setBrowserSelection(snapshotBrowserSelection)
    })
  }
  const fixed = launcherFixedText
  return <section className="space-y-3" data-testid="tocklauncher-discovery-settings">
    <div><h2 className="text-base font-semibold text-foreground">{fixed('Application, Bookmark, and IDE Discovery')}</h2><p className="mt-1 text-xs text-muted-foreground">{fixed('Discover bounded local applications and recent projects in Electron main. The renderer receives display data and opaque actions only.')}</p></div>
    <details open><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Search aria-hidden="true" className="size-4" />{fixed('Application Search')}</summary><div className="pl-3">
      <Field label="Include Windows Store Apps"><Switch aria-label={fixed('Include Windows Store Apps')} disabled={busy} checked={stored(snapshot, 'extension[ApplicationSearch].includeWindowsStoreApps', true)} onCheckedChange={checked => { void save('extension[ApplicationSearch].includeWindowsStoreApps', checked) }} /></Field>
      <Field label="macOS Application Folders"><LauncherSyncedTextarea aria-label={fixed('macOS Application Folders')} rows={3} maxLength={65536} disabled={busy} defaultValue={JSON.stringify(stored(snapshot, 'extension[ApplicationSearch].macOsFolders', application.macOsFolders), null, 2)} onBlur={event => saveArray(event, 'extension[ApplicationSearch].macOsFolders', save)} /></Field>
      <Field label="Linux Application Folders"><LauncherSyncedTextarea aria-label={fixed('Linux Application Folders')} rows={3} maxLength={65536} disabled={busy} defaultValue={JSON.stringify(stored(snapshot, 'extension[ApplicationSearch].linuxFolders', application.linuxFolders), null, 2)} onBlur={event => saveArray(event, 'extension[ApplicationSearch].linuxFolders', save)} /></Field>
      <Field label="Windows Application Folders"><LauncherSyncedTextarea aria-label={fixed('Windows Application Folders')} rows={3} maxLength={65536} disabled={busy} defaultValue={JSON.stringify(stored(snapshot, 'extension[ApplicationSearch].windowsFolders', application.windowsFolders), null, 2)} onBlur={event => saveArray(event, 'extension[ApplicationSearch].windowsFolders', save)} /></Field>
      <Field label="Windows File Extensions"><LauncherSyncedTextarea aria-label={fixed('Windows File Extensions')} rows={2} maxLength={4096} disabled={busy} defaultValue={JSON.stringify(stored(snapshot, 'extension[ApplicationSearch].windowsFileExtensions', application.windowsFileExtensions), null, 2)} onBlur={event => saveArray(event, 'extension[ApplicationSearch].windowsFileExtensions', save)} /></Field>
      <Field label="macOS Search Filter"><LauncherSyncedNativeSelect aria-label={fixed('macOS Search Filter')} size="sm" disabled={busy} defaultValue={stored(snapshot, 'extension[ApplicationSearch].mdfindFilterOption', application.mdfindFilterOption)} onChange={event => { void save('extension[ApplicationSearch].mdfindFilterOption', event.target.value) }}><NativeSelectOption value="kind:application">kind:application</NativeSelectOption><NativeSelectOption value="kMDItemKind=='Application'">{fixed('Application kind')}</NativeSelectOption><NativeSelectOption value="kMDItemContentType=='com.apple.application-bundle'">{fixed('Application bundle')}</NativeSelectOption></LauncherSyncedNativeSelect></Field>
    </div></details>
    <details><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Globe2 aria-hidden="true" className="size-4" />{fixed('Browser Bookmarks')}</summary><div className="pl-3">
      <Field label="Browsers"><div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">{BROWSERS.map(browser => <span key={browser} className="flex items-center gap-2 py-1"><Switch aria-label={`${fixed('Enable')} ${browser} ${fixed('bookmarks')}`} disabled={busy} checked={browserSelection.includes(browser)} onCheckedChange={checked => toggleBrowser(browser, checked)} /><span className="text-xs text-foreground">{browser}</span></span>)}</div></Field>
      <Field label="Search Result Style"><LauncherSyncedNativeSelect aria-label={fixed('Bookmark Search Result Style')} size="sm" disabled={busy} defaultValue={stored(snapshot, 'extension[BrowserBookmarks].searchResultStyle', 'nameOnly')} onChange={event => { void save('extension[BrowserBookmarks].searchResultStyle', event.target.value) }}><NativeSelectOption value="nameOnly">{fixed('Name Only')}</NativeSelectOption><NativeSelectOption value="urlOnly">{fixed('URL Only')}</NativeSelectOption><NativeSelectOption value="nameAndUrl">{fixed('Name and URL')}</NativeSelectOption></LauncherSyncedNativeSelect></Field>
      <Field label="Icon Type"><LauncherSyncedNativeSelect aria-label={fixed('Bookmark Icon Type')} size="sm" disabled={busy} defaultValue={stored(snapshot, 'extension[BrowserBookmarks].iconType', 'favicon')} onChange={event => { void save('extension[BrowserBookmarks].iconType', event.target.value) }}><NativeSelectOption value="favicon">{fixed('Packaged Favicon')}</NativeSelectOption><NativeSelectOption value="browserIcon">{fixed('Browser Icon')}</NativeSelectOption></LauncherSyncedNativeSelect></Field>
    </div></details>
    <details><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Laptop aria-hidden="true" className="size-4" />{fixed('JetBrains Toolbox')}</summary><div className="pl-3"><p className="py-2 text-xs leading-5 text-muted-foreground">{fixed('Recent JetBrains projects are read from the platform Toolbox state and bounded recentProjects.xml. No additional setting is required; project and executable targets are revalidated before launch.')}</p></div></details>
    <details><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Route aria-hidden="true" className="size-4" />{fixed('Visual Studio Code')}</summary><div className="pl-3">
      <Field label="Prefix"><LauncherSyncedInput aria-label={fixed('VS Code Prefix')} maxLength={64} disabled={busy} defaultValue={stored(snapshot, 'extension[VSCode].prefix', 'vscode')} onBlur={event => { void save('extension[VSCode].prefix', event.target.value) }} /></Field>
      <Field label="Command Template"><LauncherSyncedInput aria-label={fixed('VS Code Command Template')} maxLength={1024} disabled={busy} defaultValue={stored(snapshot, 'extension[VSCode].command', 'code %s')} onBlur={event => { void save('extension[VSCode].command', event.target.value) }} /></Field>
      <Field label="Show Path"><Switch aria-label={fixed('Show VS Code Path')} disabled={busy} checked={stored(snapshot, 'extension[VSCode].showPath', false)} onCheckedChange={checked => { void save('extension[VSCode].showPath', checked) }} /></Field>
    </div></details>
  </section>
}
