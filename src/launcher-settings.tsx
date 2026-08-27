import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Database, KeyRound, RefreshCw, RotateCcw, ShieldCheck, Trash2, Upload, Download, MonitorCog } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@tockteam/ui/alert'
import { Badge } from '@tockteam/ui/badge'
import { Button } from '@tockteam/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tockteam/ui/card'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { LAUNCHER_COMPOSITION } from './launcher-contract.ts'
import type { DesktopBridge } from './contracts.ts'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { readPersistedLauncherState } from './launcher-settings-model.ts'
import { LAUNCHER_SETTING_CATALOG_COUNT } from './launcher-setting-catalog.ts'
import type { LocaleMessages, LocaleService } from '../plugins/shared/i18n.ts'

const MESSAGES = {
  en: {
    title: 'TockLauncher',
    unavailable: 'TockLauncher settings are available in TockTeam Desktop only.',
  },
  zh: {
    title: 'TockLauncher',
    unavailable: 'TockLauncher 设置仅在 TockTeam Desktop 中可用。',
  },
} satisfies LocaleMessages<'title' | 'unavailable'>

interface SettingsSectionProps {
  close: () => void
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
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description ? <div className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</div> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  )
}

function SectionCard({ icon, title, description, children, testId }: Readonly<{ icon: ReactNode; title: string; description: string; children: ReactNode; testId?: string }>): ReactNode {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function statusLabel(snapshot: LauncherSettingsSnapshot): string {
  if (snapshot.settingsSource === 'external') return snapshot.externalGrantStatus === 'revoked' ? 'External source revoked' : 'External source active'
  return snapshot.recoveredSettings ? 'Managed source recovered from backup' : 'Managed source active'
}

function LauncherSettingsPage({ close: _close }: SettingsSectionProps): ReactNode {
  const bridge = window.dshDesktop
  const settings = bridge?.launcher.settings
  const [snapshot, setSnapshot] = useState<LauncherSettingsSnapshot | null>(null)
  const [status, setStatus] = useState('Loading TockLauncher settings…')
  const [busy, setBusy] = useState(false)
  const [resetPending, setResetPending] = useState(false)
  const [secret, setSecret] = useState('')
  const [launchOnStart, setLaunchOnStart] = useState<boolean | null>(null)
  const [updater, setUpdater] = useState<UpdaterState | null>(null)
  const writeTail = useRef<Promise<void>>(Promise.resolve())

  const reload = useCallback(async (): Promise<LauncherSettingsSnapshot | null> => {
    if (!settings) return null
    const next = await settings.getSnapshot()
    setSnapshot(next)
    return next
  }, [settings])

  useEffect(() => {
    if (!settings) return
    void reload().then(() => setStatus('TockLauncher settings are ready.')).catch(() => setStatus('TockLauncher settings are unavailable.'))
  }, [reload, settings])

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
  const enabled = useMemo(() => new Set(state?.enabledExtensionIds ?? []), [state?.enabledExtensionIds])

  const save = useCallback((key: string, value: unknown): Promise<boolean> => {
    if (!settings) return Promise.resolve(false)
    setStatus('Saving…')
    setSnapshot(previous => previous === null ? previous : Object.freeze({
      ...previous,
      values: Object.freeze({ ...previous.values, [key]: value }),
    }))
    const operation = writeTail.current.catch(() => undefined).then(async () => {
      await settings.updateSetting(key, value)
      await reload()
    })
    writeTail.current = operation.then(() => undefined, () => undefined)
    return operation.then(() => {
      setStatus('Saved.')
      return true
    }, () => {
      void reload().catch(() => {})
      setStatus('TockLauncher settings could not be saved.')
      return false
    })
  }, [reload, settings])

  const operation = useCallback(async (label: string, action: () => Promise<{ canceled?: boolean; ok: true }>, refresh = true): Promise<void> => {
    setBusy(true)
    setStatus(`${label}…`)
    try {
      const result = await action()
      if (result.canceled) setStatus(`${label} canceled.`)
      else {
        if (refresh) await reload()
        setStatus(`${label} complete.`)
      }
    } catch {
      setStatus(`${label} could not be completed.`)
    } finally { setBusy(false) }
  }, [reload])

  if (!bridge || !settings) return <p className="text-sm text-muted-foreground">TockLauncher settings are available in TockTeam Desktop only.</p>
  if (snapshot === null || state === null) return <p aria-live="polite" className="text-sm text-muted-foreground">{status}</p>

  const setExtension = (extensionId: string, checked: boolean): void => {
    const next = new Set(enabled)
    if (checked) next.add(extensionId); else next.delete(extensionId)
    void save('extensions.enabledExtensionIds', [...next])
  }

  const changeUpdater = async (action: () => Promise<unknown>, label: string): Promise<void> => {
    setBusy(true); setStatus(`${label}…`)
    try { await action(); setStatus(`${label} complete.`) } catch { setStatus(`${label} could not be completed.`) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5 px-1 py-4" data-testid="tocklauncher-settings">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">TockLauncher</h1>
          <p className="mt-1 text-sm text-muted-foreground">A focused launcher over the TockTeam Desktop workbench. Provider-specific controls arrive with their owning slices.</p>
        </div>
        <Badge variant="secondary">Ueli-compatible contract</Badge>
      </div>

      <SectionCard icon={<MonitorCog aria-hidden="true" className="size-4" />} title="Search and History" description="Tune the matching surface without exposing launcher internals.">
        <Field title="Search engine" description="The selected matcher is applied to the next search.">
          <NativeSelect aria-label="Search engine" size="sm" value={state.preferences.searchEngineId} disabled={busy} onChange={event => { void save('searchEngine.id', event.target.value) }}>
            <NativeSelectOption value="fuzzysort">fuzzysort</NativeSelectOption>
            <NativeSelectOption value="Fuse.js">Fuse.js</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field title={`Fuzziness (${state.preferences.fuzziness.toFixed(1)})`} description="Higher values broaden fuzzy matching.">
          <Input aria-label="Search fuzziness" className="w-36" type="range" min="0" max="1" step="0.1" disabled={busy} value={state.preferences.fuzziness} onChange={event => { void save('searchEngine.fuzziness', Number(event.target.value)) }} />
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
      </SectionCard>

      <SectionCard icon={<MonitorCog aria-hidden="true" className="size-4" />} title="Desktop Lifecycle" description="Window and shell behavior is applied by Electron main. Launch on Start remains in its existing TockTeam Preferences owner.">
        <Field title="Appearance source" description={`Compatibility mode is ${state.preferences.themeSource}; active mode and skin follow the DSH TockTeam Appearance owner.`}><Badge variant="outline">Follows TockTeam Appearance</Badge></Field>
        <Field title="Launch on Start" description="Uses the single TockTeam login-item owner; it is not duplicated in launcher settings.">
          <Switch aria-label="Launch on Start" checked={launchOnStart === true} disabled={busy || launchOnStart === null} onCheckedChange={checked => { setBusy(true); void bridge.launchOnStart.set(checked).then(value => { setLaunchOnStart(value); setStatus('Launch on Start saved.') }).catch(() => setStatus('Launch on Start could not be saved.')).finally(() => setBusy(false)) }} />
        </Field>
        <Field title="Show TockLauncher on startup" description="TockTeam defaults to opt-in startup visibility.">
          <Switch aria-label="Show TockLauncher on startup" checked={state.preferences.showOnStartup} disabled={busy} onCheckedChange={checked => { void save('window.showOnStartup', checked) }} />
        </Field>
        <Field title="Keep TockLauncher always on top"><Switch aria-label="Keep TockLauncher always on top" checked={state.preferences.alwaysOnTop} disabled={busy} onCheckedChange={checked => { void save('window.alwaysOnTop', checked) }} /></Field>
        <Field title="Show on all workspaces"><Switch aria-label="Show on all workspaces" checked={state.preferences.visibleOnAllWorkspaces} disabled={busy} onCheckedChange={checked => { void save('window.visibleOnAllWorkspaces', checked) }} /></Field>
        <Field title="Show tray icon"><Switch aria-label="Show tray icon" checked={state.preferences.showTrayIcon} disabled={busy} onCheckedChange={checked => { void save('general.tray.showIcon', checked) }} /></Field>
        <Field title="Show Dock icon"><Switch aria-label="Show Dock icon" checked={state.preferences.showDockIcon} disabled={busy} onCheckedChange={checked => { void save('appearance.showAppIconInDock', checked) }} /></Field>
      </SectionCard>

      <SectionCard icon={<ShieldCheck aria-hidden="true" className="size-4" />} title="Extensions" description="Enablement is serialized through main before the next scan. Provider controls remain with their owning slices." testId="tocklauncher-extension-toggles">
        <div className="grid min-w-0 grid-cols-1 gap-x-6 sm:grid-cols-2">
          {LAUNCHER_COMPOSITION.extensionIds.map(extensionId => (
            <Field key={extensionId} title={extensionId}>
              <Switch aria-label={`Enable ${extensionId}`} checked={enabled.has(extensionId)} disabled={busy} onCheckedChange={checked => setExtension(extensionId, checked)} />
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={<Database aria-hidden="true" className="size-4" />} title="Storage and Privacy" description="Managed files and external grants are owned by Electron main; no filesystem path crosses this page.">
        <Field title="Settings source" description={statusLabel(snapshot)}><Badge variant={snapshot.settingsSource === 'external' ? 'default' : 'secondary'}>{snapshot.settingsSource === 'external' ? 'External' : 'Managed'}</Badge></Field>
        <Field title="External write capability" description="Unsupported platforms stay readable and revocable but reject writes before touching the file."><Badge variant={snapshot.externalWriteAvailable === false ? 'outline' : 'secondary'}>{snapshot.externalWriteAvailable === false ? 'Read-only' : 'Available'}</Badge></Field>
        <Field title="Recovery" description="Each settings, index, and log artifact has an independent managed backup."><Badge variant={snapshot.recoveredSettings ? 'default' : 'secondary'}>{snapshot.recoveredSettings ? 'Recovered' : 'Healthy'}</Badge></Field>
        <Field title="Secure storage" description="Sensitive values are encrypted in Electron main and are never hydrated into this renderer."><Badge variant={snapshot.secureStorageAvailable === false ? 'outline' : 'secondary'}>{snapshot.secureStorageAvailable === false ? 'Unavailable' : 'Available'}</Badge></Field>
        <Field title="Settings files">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('Import', settings.importSettings) }}><Upload aria-hidden="true" />Import</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('Export', settings.exportSettings, false) }}><Download aria-hidden="true" />Export</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('External selection', settings.selectExternalSettings) }}>Choose external file</Button>
            <Button size="sm" variant="outline" disabled={busy || snapshot.settingsSource !== 'external'} onClick={() => { void operation('External revocation', settings.revokeExternalSettings) }}>Revoke external file</Button>
          </div>
        </Field>
        <Field title="Custom browser" description="The native browser grant is status-only in the renderer; Linux uses the system browser.">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void operation('Custom browser selection', settings.selectCustomBrowser) }}>Choose custom browser</Button>
            <Button size="sm" variant="outline" disabled={busy || snapshot.customBrowserStatus !== 'active'} onClick={() => { void operation('Custom browser revocation', settings.revokeCustomBrowser) }}>Revoke custom browser</Button>
          </div>
        </Field>
        <Field title="Reset TockLauncher settings" description="Clears overrides, favorites, exclusions, history, and the custom-browser grant, then securely relaunches Desktop.">
          {resetPending ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setResetPending(false)}>Cancel</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { setResetPending(false); void operation('Reset', settings.resetSettings) }}><Trash2 aria-hidden="true" />Confirm reset</Button></div> : <Button size="sm" variant="outline" disabled={busy} onClick={() => setResetPending(true)}><RotateCcw aria-hidden="true" />Reset</Button>}
        </Field>
      </SectionCard>

      <SectionCard icon={<KeyRound aria-hidden="true" className="size-4" />} title="Security" description="Secrets are write-only. A missing or unavailable key is never represented by ciphertext or an error payload.">
        <Field title="DeepL API key" description="Enter a new key to encrypt it with the operating system secure-storage backend.">
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Label htmlFor="tocklauncher-deepl-key" className="sr-only">DeepL API key</Label>
            <Input id="tocklauncher-deepl-key" aria-label="DeepL API key" autoComplete="new-password" className="w-56" maxLength={8192} type="password" value={secret} disabled={busy || snapshot.secureStorageAvailable === false} onChange={event => setSecret(event.target.value)} />
            <Button size="sm" variant="outline" disabled={busy || secret.length === 0 || snapshot.secureStorageAvailable === false} onClick={() => { const value = secret; void save('extension[DeeplTranslator].apiKey', value).then(saved => { if (saved) setSecret('') }) }}>Save key</Button>
          </div>
        </Field>
        <Alert><ShieldCheck aria-hidden="true" /><AlertTitle>Protected secret</AlertTitle><AlertDescription>{snapshot.missingSensitiveKeys.includes('extension[DeeplTranslator].apiKey') ? 'No usable DeepL key is stored.' : 'A usable DeepL key is stored with secure storage.'}</AlertDescription></Alert>
      </SectionCard>

      <SectionCard icon={<RefreshCw aria-hidden="true" className="size-4" />} title="Updates" description="Automatic updates remain owned by the existing Electron updater state machine.">
        {updater ? <>
          <Field title="Update status" description={updater.message ?? `Current version ${updater.currentVersion}`}><Badge variant={updater.status === 'error' ? 'destructive' : 'secondary'}>{updater.status}</Badge></Field>
          <Field title="Update actions"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || !updater.canRetry} onClick={() => { void changeUpdater(() => bridge.appUpdate.check(), 'Check') }}><RefreshCw aria-hidden="true" />Check</Button><Button size="sm" variant="outline" disabled={busy || updater.status !== 'available'} onClick={() => { void changeUpdater(() => bridge.appUpdate.download(), 'Download') }}>Download</Button><Button size="sm" variant="outline" disabled={busy || updater.status !== 'downloaded'} onClick={() => { void changeUpdater(() => bridge.appUpdate.install(), 'Install') }}>Install</Button></div></Field>
        </> : <p className="text-sm text-muted-foreground">Updater state is unavailable.</p>}
      </SectionCard>

      <SectionCard icon={<Check aria-hidden="true" className="size-4" />} title="About and Contract" description="Compatibility inventory is explicit even while provider slices are staged.">
        <Field title="Catalog coverage" description="The settings catalog is generated from the pinned Ueli parity manifest."><Badge variant="secondary">{LAUNCHER_SETTING_CATALOG_COUNT} rows · 102 runtime keys</Badge></Field>
        <Field title="Appearance ownership" description="The compatibility appearance.themeSource value is retained, but the active mode and skin follow the DSH TockTeam Appearance owner."><Badge variant="outline">Follows TockTeam Appearance</Badge></Field>
        <Field title="Browser grant" description="Custom-browser identity is status-only here; selection and revocation are native operations."><Badge variant="secondary">{snapshot.customBrowserStatus ?? 'none'}</Badge></Field>
        <Field title="Diagnostics" description="Bounded launcher diagnostics are retained without secret or path material."><span className="max-w-full truncate text-xs text-muted-foreground">{snapshot.logs.at(-1) ?? 'No launcher diagnostics.'}</span></Field>
      </SectionCard>

      <p aria-live="polite" className="px-1 text-sm text-muted-foreground">{status}</p>
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
    }, LauncherSettingsPage)) as (() => void) | undefined
    return () => {
      removeSlot?.()
      removeLocale?.()
    }
  }, 'tockteam-launcher: settings section')
}

export { LauncherSettingsPage }
