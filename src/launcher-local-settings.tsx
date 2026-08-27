import type { ComponentProps, FocusEvent, ReactNode } from 'react'
import { Input } from '@tockteam/ui/input'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { LAUNCHER_LOCAL_EXTENSION_DEFAULTS } from './launcher-local-extension-config.ts'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import type { PersistedLauncherState } from './launcher-settings-model.ts'

type LocalSettingsProps = Readonly<{
  busy: boolean
  save: (key: string, value: unknown) => Promise<boolean>
  snapshot: LauncherSettingsSnapshot
  state: PersistedLauncherState
}>

function localValue(snapshot: LauncherSettingsSnapshot, id: string, key: string, fallback: unknown): unknown {
  const value = snapshot.values[`extension[${id}].${key}`]
  return value === undefined ? fallback : value
}
function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>): ReactNode {
  return <label className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"><span className="text-sm text-foreground">{label}</span><span className="flex min-w-0 shrink-0 items-center gap-2">{children}</span></label>
}
function text(props: ComponentProps<typeof Input>): ReactNode { return <Input {...props} /> }

export function LauncherLocalSettings({ busy, save, snapshot }: LocalSettingsProps): ReactNode {
  const d = LAUNCHER_LOCAL_EXTENSION_DEFAULTS
  const value = (id: string, key: string, fallback: unknown) => localValue(snapshot, id, key, fallback)
  const formatList = value('UuidGenerator', 'searchResultFormats', d.UuidGenerator.searchResultFormats) as readonly unknown[]
  const saveFormats = (event: FocusEvent<HTMLTextAreaElement>) => {
    try {
      const parsed: unknown = JSON.parse(event.currentTarget.value)
      if (!Array.isArray(parsed) || parsed.length > 16 || parsed.some(item => typeof item !== 'object' || item === null || Array.isArray(item) || Object.keys(item).length !== 4 || !['braces', 'hyphens', 'quotes', 'uppercase'].every(key => Object.hasOwn(item, key) && typeof (item as Record<string, unknown>)[key] === 'boolean'))) throw new Error('invalid')
      event.currentTarget.removeAttribute('aria-invalid')
      void save('extension[UuidGenerator].searchResultFormats', parsed)
    } catch { event.currentTarget.setAttribute('aria-invalid', 'true') }
  }
  return <section className="space-y-3" data-testid="tocklauncher-local-settings">
    <div><h2 className="text-base font-semibold text-foreground">Local transformation extensions</h2><p className="mt-1 text-xs text-muted-foreground">These bounded controls configure the seven local search providers.</p></div>
    <details open><summary className="cursor-pointer text-sm font-medium">Base64 Conversion</summary><div className="pl-3">
      <Field label="Encode/decode prefix">{text({ 'aria-label': 'Base64 encode/decode prefix', maxLength: 64, disabled: busy, defaultValue: value('Base64Conversion', 'encodeDecodePrefix', d.Base64Conversion.encodeDecodePrefix) as string, onBlur: event => { void save('extension[Base64Conversion].encodeDecodePrefix', event.target.value) } })}</Field>
      <Field label="Encode prefix">{text({ 'aria-label': 'Base64 encode prefix', maxLength: 64, disabled: busy, defaultValue: value('Base64Conversion', 'encodePrefix', d.Base64Conversion.encodePrefix) as string, onBlur: event => { void save('extension[Base64Conversion].encodePrefix', event.target.value) } })}</Field>
      <Field label="Decode prefix">{text({ 'aria-label': 'Base64 decode prefix', maxLength: 64, disabled: busy, defaultValue: value('Base64Conversion', 'decodePrefix', d.Base64Conversion.decodePrefix) as string, onBlur: event => { void save('extension[Base64Conversion].decodePrefix', event.target.value) } })}</Field>
    </div></details>
    <details><summary className="cursor-pointer text-sm font-medium">Calculator</summary><div className="pl-3">
      <Field label="Precision">{text({ 'aria-label': 'Calculator precision', type: 'number', min: 0, max: 64, disabled: busy, defaultValue: value('Calculator', 'precision', d.Calculator.precision) as number, onBlur: event => { const n = Math.min(64, Math.max(0, Number(event.target.value) || 0)); void save('extension[Calculator].precision', n) } })}</Field>
      <Field label="Decimal separator">{text({ 'aria-label': 'Calculator decimal separator', maxLength: 1, disabled: busy, defaultValue: value('Calculator', 'decimalSeparator', d.Calculator.decimalSeparator) as string, onBlur: event => { void save('extension[Calculator].decimalSeparator', event.target.value) } })}</Field>
      <Field label="Argument separator">{text({ 'aria-label': 'Calculator argument separator', maxLength: 1, disabled: busy, defaultValue: value('Calculator', 'argumentSeparator', d.Calculator.argumentSeparator) as string, onBlur: event => { void save('extension[Calculator].argumentSeparator', event.target.value) } })}</Field>
    </div></details>
    <details><summary className="cursor-pointer text-sm font-medium">Color Converter</summary><div className="grid grid-cols-3 gap-2 pl-3">{(['HEX', 'HSL', 'RGB'] as const).map(format => <Field key={format} label={format}>{<Switch aria-label={`Color format ${format}`} disabled={busy} checked={(value('ColorConverter', 'formats', d.ColorConverter.formats) as readonly string[]).includes(format)} onCheckedChange={checked => { const formats = (['HEX', 'HSL', 'RGB'] as const).filter(candidate => candidate === format ? checked : (value('ColorConverter', 'formats', d.ColorConverter.formats) as readonly string[]).includes(candidate)); void save('extension[ColorConverter].formats', formats) }} />}</Field>)}</div></details>
    <details><summary className="cursor-pointer text-sm font-medium">Password Generator</summary><div className="pl-3">
      <Field label="Command">{text({ 'aria-label': 'Password generator command', maxLength: 64, disabled: busy, defaultValue: value('PasswordGenerator', 'command', d.PasswordGenerator.command) as string, onBlur: event => { void save('extension[PasswordGenerator].command', event.target.value) } })}</Field>
      <Field label="Quantity">{text({ 'aria-label': 'Password quantity', type: 'number', min: 1, max: 50, disabled: busy, defaultValue: value('PasswordGenerator', 'quantity', d.PasswordGenerator.quantity) as number, onBlur: event => { void save('extension[PasswordGenerator].quantity', Math.min(50, Math.max(1, Number(event.target.value) || d.PasswordGenerator.quantity))) } })}</Field>
      <Field label="Password length">{text({ 'aria-label': 'Password length', type: 'number', min: 1, max: 128, disabled: busy, defaultValue: value('PasswordGenerator', 'passwordLength', d.PasswordGenerator.passwordLength) as number, onBlur: event => { void save('extension[PasswordGenerator].passwordLength', Math.min(128, Math.max(1, Number(event.target.value) || d.PasswordGenerator.passwordLength))) } })}</Field>
      <Field label="Password symbols">{text({ 'aria-label': 'Password symbols', maxLength: 256, disabled: busy, defaultValue: value('PasswordGenerator', 'symbols', d.PasswordGenerator.symbols) as string, onBlur: event => { void save('extension[PasswordGenerator].symbols', event.target.value) } })}</Field>
      {(['includeUppercaseCharacters', 'includeLowercaseCharacters', 'includeNumbers', 'includeSymbols', 'beginWithALetter', 'noSimilarCharacters', 'noDuplicateCharacters', 'noSequentialCharacters'] as const).map(key => <Field key={key} label={key}><Switch aria-label={`Password ${key}`} disabled={busy} checked={value('PasswordGenerator', key, d.PasswordGenerator[key]) as boolean} onCheckedChange={checked => { void save(`extension[PasswordGenerator].${key}`, checked) }} /></Field>)}
    </div></details>
    <details><summary className="cursor-pointer text-sm font-medium">Quick Formatter</summary><div className="pl-3"><Field label="Command">{text({ 'aria-label': 'Quick formatter command', maxLength: 64, disabled: busy, defaultValue: value('QuickFormatter', 'command', d.QuickFormatter.command) as string, onBlur: event => { void save('extension[QuickFormatter].command', event.target.value) } })}</Field>{(['enableStackTrace', 'enableJson', 'enableXml', 'enableDeepFormatting'] as const).map(key => <Field key={key} label={key}><Switch aria-label={`Quick formatter ${key}`} disabled={busy} checked={value('QuickFormatter', key, d.QuickFormatter[key]) as boolean} onCheckedChange={checked => { void save(`extension[QuickFormatter].${key}`, checked) }} /></Field>)}</div></details>
    <details><summary className="cursor-pointer text-sm font-medium">Rowland Text Editor</summary><div className="pl-3"><Field label="Row separator">{text({ 'aria-label': 'Rowland row separator', maxLength: 32, disabled: busy, defaultValue: value('RowlandTextEditor', 'rowSeparator', d.RowlandTextEditor.rowSeparator) as string, onBlur: event => { void save('extension[RowlandTextEditor].rowSeparator', event.target.value) } })}</Field><Field label="Column separator">{text({ 'aria-label': 'Rowland column separator', maxLength: 32, disabled: busy, defaultValue: value('RowlandTextEditor', 'columnSeparator', d.RowlandTextEditor.columnSeparator) as string, onBlur: event => { void save('extension[RowlandTextEditor].columnSeparator', event.target.value) } })}</Field></div></details>
    <details><summary className="cursor-pointer text-sm font-medium">UUID / GUID Generator</summary><div className="pl-3"><Field label="UUID version"><NativeSelect aria-label="UUID version" size="sm" disabled={busy} defaultValue={value('UuidGenerator', 'uuidVersion', d.UuidGenerator.uuidVersion) as string} onChange={event => { void save('extension[UuidGenerator].uuidVersion', event.target.value) }}><NativeSelectOption value="v4">v4</NativeSelectOption><NativeSelectOption value="v6">v6</NativeSelectOption><NativeSelectOption value="v7">v7</NativeSelectOption></NativeSelect></Field><Field label="Number of UUIDs">{text({ 'aria-label': 'Number of UUIDs', type: 'number', min: 1, max: 100, disabled: busy, defaultValue: value('UuidGenerator', 'numberOfUuids', d.UuidGenerator.numberOfUuids) as number, onBlur: event => { void save('extension[UuidGenerator].numberOfUuids', Math.min(100, Math.max(1, Number(event.target.value) || d.UuidGenerator.numberOfUuids))) } })}</Field><Field label="Strict validation"><Switch aria-label="UUID strict validation" disabled={busy} checked={value('UuidGenerator', 'validateStrictly', d.UuidGenerator.validateStrictly) as boolean} onCheckedChange={checked => { void save('extension[UuidGenerator].validateStrictly', checked) }} /></Field>{(['uppercase', 'hyphens', 'braces', 'quotes'] as const).map(key => <Field key={key} label={`UUID ${key}`}><Switch aria-label={`UUID ${key}`} disabled={busy} checked={value('UuidGenerator', key, d.UuidGenerator.generatorFormat[key]) as boolean} onCheckedChange={checked => { void save(`extension[UuidGenerator].${key}`, checked) }} /></Field>)}<Field label="UUID search result formats"><textarea aria-label="UUID search result formats" maxLength={4096} rows={3} disabled={busy} defaultValue={JSON.stringify(formatList, null, 2)} onBlur={saveFormats} /></Field></div></details>
  </section>
}
