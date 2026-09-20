import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@tockteam/ui/alert'
import { Badge } from '@tockteam/ui/badge'
import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { useLauncherDirtyState } from './launcher-settings-dirty.ts'
import { LauncherSettingField as Field } from './launcher-setting-field.tsx'
import { launcherFixedText as fixed } from './launcher-i18n.ts'
import { TRANSLATE_SETTINGS_LANGUAGES, CAN_I_USE_SETTINGS_TARGETS } from './trusted-raycast-settings-catalog.ts'
import type { DesktopLauncherSettingsBridge } from './contracts.ts'
import type { TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'
import type { TrustedSettingsSnapshot, TrustedSettingsValues } from './trusted-raycast-settings-contract.ts'

type PreferenceField = Readonly<{ key: string; label: string; kind: 'toggle' | 'language' | 'select' | 'text'; choices?: readonly (readonly [string, string])[] }>
export const TRUSTED_EXTENSION_FIELDS: Readonly<Record<TrustedRaycastExtensionId, readonly PreferenceField[]>> = {
  'google-translate': [
    { key: 'langFrom', label: 'Source Language', kind: 'language' },
    { key: 'lang1', label: 'Primary Language', kind: 'language' },
    { key: 'lang2', label: 'Secondary Language', kind: 'language' },
    { key: 'autoInput', label: 'Use Selected Text', kind: 'toggle' },
    { key: 'defaultAction', label: 'Default Action', kind: 'select', choices: [['copy', 'Copy'], ['paste', 'Paste']] },
    { key: 'prioritizeCrossLanguage', label: 'Prioritize Cross-Language Results', kind: 'toggle' },
  ],
  'kaomoji-search': [
    { key: 'displayMode', label: 'Display Mode', kind: 'select', choices: [['list', 'List'], ['grid', 'Grid']] },
    { key: 'primaryAction', label: 'Primary Action', kind: 'select', choices: [['copy-to-clipboard', 'Copy to Clipboard'], ['paste-to-active-app', 'Paste to Active App']] },
  ],
  'can-i-use': [
    { key: 'defaultQuery', label: 'Browser Targets', kind: 'text' },
    { key: 'showReleaseDate', label: 'Show Release Date', kind: 'toggle' },
    { key: 'showPartialSupport', label: 'Show Partial Support', kind: 'toggle' },
    { key: 'briefMode', label: 'Brief Mode', kind: 'toggle' },
  ],
}

export function LauncherTrustedExtensionSettings({ id, active, settings }: Readonly<{ id: TrustedRaycastExtensionId; active: boolean; settings: DesktopLauncherSettingsBridge }>): ReactNode {
  const [snapshot, setSnapshot] = useState<TrustedSettingsSnapshot>()
  const [draft, setDraft] = useState<TrustedSettingsValues>({})
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  useLauncherDirtyState(busy || (snapshot !== undefined && JSON.stringify(draft) !== JSON.stringify(snapshot.values)))
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const accept = (next: TrustedSettingsSnapshot): void => { if (alive.current) { setSnapshot(next); setDraft(next.values) } }
  useEffect(() => {
    if (!active || snapshot || !settings.getExtension) return
    let disposed = false
    void settings.getExtension(id).then(next => { if (!disposed) accept(next) }).catch(() => { if (!disposed) setError(fixed('Extension settings are unavailable.')) })
    return () => { disposed = true }
  }, [active, id, settings, snapshot])
  const save = async (values: TrustedSettingsValues, clearProxy = false): Promise<void> => {
    if (!snapshot || saving.current) return
    saving.current = true; setBusy(true); setError(''); setStatus(fixed('Saving…'))
    const patch = { ...values }
    if (snapshot.proxyRedacted && !clearProxy && values.proxy === '') delete patch.proxy
    try {
      const result = await settings.updateExtension({ extensionId: id, revision: snapshot.revision, patch })
      if (!alive.current) return
      if (result.ok) { accept(result.snapshot); setStatus(fixed('Saved. Changes apply the next time you open this extension.')) }
      else {
        setStatus('')
        setError(fixed(result.reason === 'conflict' ? 'Settings changed elsewhere. Refresh, review your edits, and save again.'
          : result.reason === 'invalid' ? 'These settings are invalid. Check the fields and try again.' : 'Extension settings could not be saved.'))
      }
    } catch { if (alive.current) { setStatus(''); setError(fixed('Extension settings could not be saved.')) } }
    finally { saving.current = false; if (alive.current) setBusy(false) }
  }
  const update = (key: string, value: string | boolean, immediate: boolean): void => {
    const next = { ...draft, [key]: value }
    setDraft(next)
    if (immediate) void save(next)
  }
  if (!snapshot) return <div hidden={!active}><p role="status">{error || fixed('Loading Extension Settings…')}</p>{error && <Button size="sm" variant="outline" onClick={() => { void settings.getExtension(id).then(accept).catch(() => setError(fixed('Extension settings are unavailable.'))) }}>{fixed('Retry')}</Button>}</div>
  const state = snapshot.state
  const fields = TRUSTED_EXTENSION_FIELDS[id]
  const groups = id === 'google-translate'
    ? [{ title: 'Languages', fields: fields.filter(field => field.kind === 'language') }, { title: 'Behavior', fields: fields.filter(field => field.kind !== 'language') }]
    : [{ title: '', fields }]
  return <div hidden={!active} data-testid={`tocklauncher-preferences-${id}`}>
    <div className="flex flex-col gap-4">
      <Field title="Enabled" description="Opening settings does not install or start this extension.">
        <Switch aria-label={`${fixed('Enable')} ${id}`} disabled={busy || !state.active || !state.installed || !state.digestApproved || state.recovery !== ''} checked={state.enabled} onCheckedChange={checked => {
          setBusy(true); setError('')
          void settings.setExtensionEnabled(id, checked).then(next => { if (alive.current) setSnapshot(previous => previous ? { ...previous, state: next.state } : next) }).catch(() => setError(fixed('Extension enablement could not be changed.'))).finally(() => { if (alive.current) setBusy(false) })
        }} />
      </Field>
      <Badge variant="secondary" className="self-start">{fixed(state.recovery ? 'Recovery Required' : !state.active ? 'Unavailable' : !state.installed ? 'Not Installed' : state.enabled ? 'Enabled' : 'Disabled')}</Badge>
      {(!state.installed || !state.digestApproved || state.recovery !== '') && <Alert role="note"><ShieldCheck aria-hidden="true" /><AlertTitle>{fixed('Explicit Setup Required')}</AlertTitle><AlertDescription>{fixed('Use Extensions in TockLauncher to review, approve, or recover this extension. Preferences can be saved before setup.')}</AlertDescription></Alert>}
      <p className="text-sm text-muted-foreground">{fixed('Changes apply the next time you open this extension.')}</p>
      {id === 'google-translate' && <p className="text-sm text-muted-foreground">{fixed('Language defaults do not replace your saved language sets.')}</p>}
      {id === 'can-i-use' && <p className="text-sm text-muted-foreground">{fixed('Use exact browser versions, such as chrome 100, firefox 100. Automatic queries and workspace configuration are unavailable.')}</p>}
      {groups.map(group => <section key={group.title} aria-label={group.title ? fixed(group.title) : undefined}>
        {group.title && <h3 className="text-sm font-semibold">{fixed(group.title)}</h3>}
        {group.fields.map(field => <Field key={field.key} title={field.label}>
          {field.kind === 'toggle' ? <Switch aria-label={fixed(field.label)} disabled={busy} checked={draft[field.key] === true} onCheckedChange={value => update(field.key, value, true)} />
            : field.kind === 'text' ? <Input aria-label={fixed(field.label)} aria-invalid={Boolean(error)} maxLength={4096} className="w-full max-w-sm" disabled={busy} value={String(draft[field.key] ?? '')} onChange={event => update(field.key, event.target.value, false)} onBlur={() => { if (draft[field.key] !== snapshot.values[field.key]) void save(draft) }} />
            : <NativeSelect aria-label={fixed(field.label)} size="sm" disabled={busy} value={String(draft[field.key] ?? '')} onChange={event => update(field.key, event.target.value, true)}>
              {(field.kind === 'language' ? Object.entries(TRANSLATE_SETTINGS_LANGUAGES) : field.choices ?? []).map(([value, label]) => <NativeSelectOption key={value} value={value}>{fixed(label)}</NativeSelectOption>)}
            </NativeSelect>}
        </Field>)}
      </section>)}
      {id === 'google-translate' && <section aria-label={fixed('Network')}>
        <h3 className="text-sm font-semibold">{fixed('Network')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{fixed(snapshot.proxyRedacted ? 'A private proxy override is stored. Leave the field unchanged to keep it, or choose Use System Proxy to clear it.' : draft.proxy ? 'A manual proxy override is configured.' : 'Uses the system proxy automatically.')}</p>
        <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">{fixed('Advanced')}</summary>
          <Field title="Proxy Override" description="Use an HTTP or HTTPS URL without credentials. Leave empty to use the system proxy.">
            <Input aria-label={fixed('Proxy Override')} aria-invalid={Boolean(error)} type="url" maxLength={2048} autoComplete="off" disabled={busy} value={String(draft.proxy ?? '')} onChange={event => update('proxy', event.target.value, false)} onBlur={() => { if (draft.proxy !== snapshot.values.proxy) void save(draft) }} />
          </Field>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { const next = { ...draft, proxy: '' }; setDraft(next); void save(next, true) }}>{fixed('Use System Proxy')}</Button>
        </details>
      </section>}
      {id === 'can-i-use' && <details><summary className="cursor-pointer text-sm font-medium">{fixed('Supported Browser Targets')}</summary><p className="mt-2 max-h-40 overflow-auto text-xs text-muted-foreground">{CAN_I_USE_SETTINGS_TARGETS.join(', ')}</p></details>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => { void save(draft) }}>{fixed('Save Preferences')}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => {
          setBusy(true)
          void settings.getExtension(id).then(next => { if (alive.current) { setDraft(current => Object.fromEntries(Object.entries(next.values).map(([key, value]) => [key, current[key] === snapshot.values[key] ? value : current[key] ?? value]))); setSnapshot(next); setError(''); setStatus(fixed('Latest settings loaded. Review your edits before saving.')) } }).catch(() => setError(fixed('Extension settings are unavailable.'))).finally(() => { if (alive.current) setBusy(false) })
        }}>{fixed('Refresh Settings')}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
    </div>
  </div>
}
