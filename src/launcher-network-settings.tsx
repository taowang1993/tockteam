import { useState, type ReactNode } from 'react'
import { Globe2, KeyRound, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@tockteam/ui/alert'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { LAUNCHER_NETWORK_EXTENSION_DEFAULTS } from './launcher-network-extension-config.ts'
import { isLauncherRendererSettingValue, type LauncherSettingsSnapshot } from './launcher-settings-contract.ts'

const SOURCE_LANGUAGES = ['Auto', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH'] as const
const TARGET_LANGUAGES = ['BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH'] as const
const LOCALES = ['en-US', 'de-CH', 'fr-FR', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW'] as const

type NetworkSettingsProps = Readonly<{
  busy: boolean
  save: (key: string, value: unknown) => Promise<boolean>
  snapshot: LauncherSettingsSnapshot
}>

function value<T>(snapshot: LauncherSettingsSnapshot, key: string, fallback: T): T {
  const stored = snapshot.values[key]
  return isLauncherRendererSettingValue(key, stored) ? stored as T : fallback
}

function Field({ label, description, children }: Readonly<{ label: string; description?: string; children: ReactNode }>): ReactNode {
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0"><div className="min-w-0 flex-1"><div className="text-sm font-medium text-foreground">{label}</div>{description ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div> : null}</div><div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{children}</div></div>
}

function ValidationError({ id, message }: Readonly<{ id: string; message: string | undefined }>): ReactNode {
  return message === undefined ? null : <p id={id} role="alert" className="max-w-80 text-right text-xs text-destructive">{message}</p>
}

export function LauncherNetworkSettings({ busy, save, snapshot }: NetworkSettingsProps): ReactNode {
  const currencies = value<readonly string[]>(snapshot, 'extension[CurrencyConversion].currencies', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CurrencyConversion.currencies)
  const target = value<string>(snapshot, 'extension[CurrencyConversion].defaultTargetCurrency', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CurrencyConversion.defaultTargetCurrency)
  const [currencyDraft, setCurrencyDraft] = useState(() => currencies.join(', '))
  const [currencyError, setCurrencyError] = useState<string>()
  const [targetDraft, setTargetDraft] = useState(() => target)
  const [targetError, setTargetError] = useState<string>()
  const [customJson, setCustomJson] = useState(() => JSON.stringify(value(snapshot, 'extension[CustomWebSearch].customSearchEngines', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CustomWebSearch.customSearchEngines), null, 2))
  const [customError, setCustomError] = useState<string>()
  const source = value(snapshot, 'extension[DeeplTranslator].defaultSourceLanguage', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.DeeplTranslator.defaultSourceLanguage)
  const language = value(snapshot, 'extension[DeeplTranslator].defaultTargetLanguage', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.DeeplTranslator.defaultTargetLanguage)
  const engine = value<'Google' | 'DuckDuckGo'>(snapshot, 'extension[WebSearch].searchEngine', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.WebSearch.searchEngine)
  const locale = value(snapshot, 'extension[WebSearch].locale', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.WebSearch.locale)
  const instant = value(snapshot, 'extension[WebSearch].showInstantSearchResult', LAUNCHER_NETWORK_EXTENSION_DEFAULTS.WebSearch.showInstantSearchResult)
  const updateCurrencies = (raw: string): void => {
    const next = raw.split(/[\s,]+/u).map(item => item.toLocaleLowerCase('en-US')).filter(Boolean)
    if (!isLauncherRendererSettingValue('extension[CurrencyConversion].currencies', next)) {
      setCurrencyError('Currency codes must be 2–16 lowercase letters, digits, or dots.')
      return
    }
    setCurrencyError(undefined)
    void save('extension[CurrencyConversion].currencies', next).then(saved => {
      if (!saved) setCurrencyError('Currency codes could not be saved.')
    }, () => setCurrencyError('Currency codes could not be saved.'))
  }
  const updateTarget = (raw: string): void => {
    if (!isLauncherRendererSettingValue('extension[CurrencyConversion].defaultTargetCurrency', raw)) {
      setTargetError('Default target currency must be a lowercase currency code.')
      return
    }
    setTargetError(undefined)
    void save('extension[CurrencyConversion].defaultTargetCurrency', raw).then(saved => {
      if (!saved) setTargetError('Default target currency could not be saved.')
    }, () => setTargetError('Default target currency could not be saved.'))
  }
  return <section className="space-y-3" data-testid="tockteam-network-settings">
    <div><h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><Globe2 aria-hidden="true" className="size-4" />Network Extensions</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Network requests and browser effects are owned by Electron main. Renderer controls submit only validated settings and bounded typed text.</p></div>
    <Alert role="note"><ShieldCheck aria-hidden="true" /><AlertTitle>Privacy and destination policy</AlertTitle><AlertDescription>Currency rates use cdn.jsdelivr.net. DeepL uses api-free.deepl.com. Web Search uses Google or DuckDuckGo. Custom templates must be HTTPS public-host URLs; redirects and private network destinations are rejected.</AlertDescription></Alert>
    <Field label="Currencies" description="Lowercase currency codes used during the next rate refresh."><div className="flex flex-col items-end gap-1"><Input aria-label="Currency codes" aria-describedby={currencyError === undefined ? undefined : 'tockteam-currency-error'} aria-invalid={currencyError !== undefined} className="w-64" maxLength={512} disabled={busy} value={currencyDraft} onChange={event => setCurrencyDraft(event.target.value)} onBlur={event => updateCurrencies(event.target.value)} /><ValidationError id="tockteam-currency-error" message={currencyError} /></div></Field>
    <Field label="Default target currency"><div className="flex flex-col items-end gap-1"><Input aria-label="Default target currency" aria-describedby={targetError === undefined ? undefined : 'tockteam-target-currency-error'} aria-invalid={targetError !== undefined} className="w-24" maxLength={16} disabled={busy} value={targetDraft} onChange={event => setTargetDraft(event.target.value)} onBlur={event => updateTarget(event.target.value)} /><ValidationError id="tockteam-target-currency-error" message={targetError} /></div></Field>
    <Field label="Custom search engines" description="JSON records are validated as a whole; only one query placeholder and HTTPS public-host templates are accepted."><div className="flex flex-col items-end gap-1"><textarea aria-label="Custom web search engines JSON" aria-describedby={customError === undefined ? undefined : 'tockteam-custom-search-error'} aria-invalid={customError !== undefined} className={`min-h-28 w-96 rounded-md border bg-background p-2 text-xs ${customError === undefined ? '' : 'border-destructive'}`} maxLength={32_768} spellCheck={false} disabled={busy} value={customJson} onChange={event => setCustomJson(event.target.value)} onBlur={() => { try { const parsed: unknown = JSON.parse(customJson); if (!isLauncherRendererSettingValue('extension[CustomWebSearch].customSearchEngines', parsed)) throw new Error(); setCustomError(undefined); void save('extension[CustomWebSearch].customSearchEngines', parsed).then(saved => { if (!saved) setCustomError('Custom search engines could not be saved.') }, () => setCustomError('Custom search engines could not be saved.')) } catch { setCustomError('Custom search engines could not be saved because the JSON or URL policy is invalid.') } }} /><ValidationError id="tockteam-custom-search-error" message={customError} /></div></Field>
    <Field label="DeepL source language" description="Auto lets DeepL detect the source language."><NativeSelect aria-label="DeepL source language" size="sm" disabled={busy} defaultValue={source} onChange={event => { if (isLauncherRendererSettingValue('extension[DeeplTranslator].defaultSourceLanguage', event.target.value)) void save('extension[DeeplTranslator].defaultSourceLanguage', event.target.value) }}>{SOURCE_LANGUAGES.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></Field>
    <Field label="DeepL target language"><NativeSelect aria-label="DeepL target language" size="sm" disabled={busy} defaultValue={language} onChange={event => { if (isLauncherRendererSettingValue('extension[DeeplTranslator].defaultTargetLanguage', event.target.value)) void save('extension[DeeplTranslator].defaultTargetLanguage', event.target.value) }}>{TARGET_LANGUAGES.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></Field>
    <Field label="Web Search provider"><NativeSelect aria-label="Web Search provider" size="sm" disabled={busy} defaultValue={engine} onChange={event => { if (event.target.value === 'Google' || event.target.value === 'DuckDuckGo') void save('extension[WebSearch].searchEngine', event.target.value) }}><NativeSelectOption value="Google">Google</NativeSelectOption><NativeSelectOption value="DuckDuckGo">DuckDuckGo</NativeSelectOption></NativeSelect></Field>
    <Field label="Web Search locale"><NativeSelect aria-label="Web Search locale" size="sm" disabled={busy} defaultValue={locale} onChange={event => { if (LOCALES.includes(event.target.value as typeof LOCALES[number])) void save('extension[WebSearch].locale', event.target.value) }}>{LOCALES.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></Field>
    <Field label="Show instant Web Search result" description="When enabled, ordinary launcher terms create one main-owned URL action without fetching suggestions."><Switch aria-label="Show instant Web Search result" disabled={busy} defaultChecked={instant} onCheckedChange={checked => { void save('extension[WebSearch].showInstantSearchResult', checked) }} /></Field>
    <Field label="DeepL API key" description="The write-only key field remains in the Security section and is encrypted in Electron main."><KeyRound aria-hidden="true" className="size-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">{snapshot.missingSensitiveKeys.includes('extension[DeeplTranslator].apiKey') ? 'Not configured' : 'Stored securely'}</span></Field>
    <Label className="sr-only">Network settings complete</Label>
  </section>
}
