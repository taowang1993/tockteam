import React from 'react'

const element = (type: string, props: Record<string, unknown> | null, children: React.ReactNode[] = []) => React.createElement(type, props, ...children)
const component = (type: string) => (props: Record<string, unknown>) => element(type, props, React.Children.toArray(props.children as React.ReactNode))

// Search belongs to the view that rendered the List; navigation must not leak the previous handler.
let searchHandler: ((value: string) => void) | undefined
let searchable = false
const list = (props: Record<string, unknown>) => {
  if (typeof props.onSearchTextChange === 'function') {
    searchHandler = props.onSearchTextChange as (value: string) => void
    searchable = true
    ;(globalThis as { __trustedRaycastSearch?: ((value: string) => void) | undefined }).__trustedRaycastSearch = props.onSearchTextChange as (value: string) => void
  }
  return element('raycast-list', props, [...(props.searchBarAccessory ? [props.searchBarAccessory as React.ReactNode] : []), props.actions as React.ReactNode, ...React.Children.toArray(props.children as React.ReactNode)])
}
export function viewSearchable(): boolean { return searchable }
export const List = Object.assign(list, {
  Item: Object.assign((props: Record<string, unknown>) => element('raycast-list-item', { title: props.title, subtitle: String(props.subtitle ?? ''), selected: props.selected === true, accessories: JSON.stringify(props.accessories ?? []) }, [props.detail as React.ReactNode, props.actions as React.ReactNode]), { Detail: component('raycast-detail') }),
  EmptyView: component('raycast-empty'),
  Dropdown: Object.assign((props: Record<string, unknown>) => element('raycast-dropdown', { value: String(props.value ?? ''), fieldEventId: `dropdown-${++handleSequence}`, ...(typeof props.onChange === 'function' ? { onChange: props.onChange as (value: string) => void } : {}) }, React.Children.toArray(props.children as React.ReactNode)), { Item: component('raycast-dropdown-item') }),
})
type NativeEffectRequest = { kind: 'copy' | 'openGoogleTranslate' | 'paste'; text?: string; url?: string }
type Compatibility = { native: (request: NativeEffectRequest) => Promise<void>; selection: () => Promise<string>; toast: (toast: { title: string; message: string; style: 'failure' | 'success' | 'animated' }) => void }
let compatibility: Compatibility
export let queryEpoch = 0
export let queryText = ''
export function advanceQuery(value: string): void { queryText = value; queryEpoch++ }
export function configureCompatibility(value: Compatibility): void { compatibility = value }

// Nested views live in a child-owned stack; the host renderer swaps the mounted root.
const navigationStack: unknown[] = []
let navigationRenderer: ((view: unknown) => void) | undefined
const renderNavigationTop = (): void => {
  searchHandler = undefined
  searchable = false
  ;(globalThis as { __trustedRaycastSearch?: ((value: string) => void) | undefined }).__trustedRaycastSearch = undefined
  navigationRenderer?.(navigationStack.length > 0 ? navigationStack[navigationStack.length - 1] : undefined)
}
export function registerNavigationRenderer(render: (view: unknown) => void): void { navigationRenderer = render }
export function popView(): void { if (navigationStack.length > 0) { navigationStack.pop(); renderNavigationTop() } }
export function navigationDepth(): number { return navigationStack.length }
export function useNavigation(): { push: (view: unknown) => void; pop: () => void } {
  return { push: (view: unknown) => { navigationStack.push(view); renderNavigationTop() }, pop: () => { popView() } }
}

// The Form owns submitted values: uncontrolled fields collect via fieldChanged events, then SubmitForm reads the latest render state.
const FormContext = React.createContext<string | null>(null)
let formSequence = 0
let handleSequence = 0
const formValues = new Map<string, Map<string, string>>()
const form = (props: Record<string, unknown>) => {
  const id = React.useRef(`form-${++formSequence}`).current
  if (!formValues.has(id)) formValues.set(id, new Map())
  return React.createElement(FormContext.Provider, { value: id }, element('raycast-form', {}, [props.actions as React.ReactNode, ...React.Children.toArray(props.children as React.ReactNode)]))
}
const formDropdown = (props: Record<string, unknown>) => {
  const formId = React.useContext(FormContext)
  const fieldId = React.useRef(`field-${++handleSequence}`).current
  let value = typeof props.value === 'string' ? props.value : ''
  if (formId !== null) {
    const collected = formValues.get(formId)!
    if (!collected.has(String(props.id))) {
      // Raycast defaults an uncontrolled dropdown to its first item; the submitted values must match.
      const first = React.Children.toArray(props.children as React.ReactNode).find((item: unknown) => typeof item === 'object' && item !== null && (item as { props?: Record<string, unknown> }).props?.value !== '' && (item as { props?: Record<string, unknown> }).props?.value !== undefined)
      collected.set(String(props.id), value !== '' ? value : String((first as { props: Record<string, unknown> }).props.value))
    }
    value = collected.get(String(props.id))!
  }
  return element('raycast-form-dropdown', { title: String(props.title ?? ''), value, fieldEventId: fieldId, onChange: (next: string) => { if (formId !== null) formValues.get(formId)!.set(String(props.id), next); if (typeof props.onChange === 'function') props.onChange(next) } }, React.Children.toArray(props.children as React.ReactNode))
}
export const Form = Object.assign(form, { TextField: component('raycast-text-field'), Dropdown: Object.assign(formDropdown, { Item: component('raycast-form-dropdown-item') }) })

export const Icon = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>
export const Color = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>
export const Keyboard = { Shortcut: { Common: { Copy: { modifiers: ['cmd'], key: 'c' }, MoveUp: { modifiers: ['cmd', 'shift'], key: 'arrowup' }, MoveDown: { modifiers: ['cmd', 'shift'], key: 'arrowdown' }, New: { modifiers: ['cmd'], key: 'n' }, RemoveAll: { modifiers: ['cmd', 'shift'], key: 'backspace' } } } }
export const Toast = { Style: { Failure: 'failure', Success: 'success', Animated: 'animated' } }
export async function showToast(styleOrToast: 'failure' | 'success' | 'animated' | { title: string; message?: string; style?: 'failure' | 'success' | 'animated' }, title?: string, message?: string): Promise<void> {
  if (typeof styleOrToast === 'string') compatibility.toast({ title: title ?? '', message: message ?? '', style: styleOrToast })
  else compatibility.toast({ title: styleOrToast.title, message: styleOrToast.message ?? '', style: styleOrToast.style ?? 'success' })
}
const action = (props: Record<string, unknown>) => element('raycast-action', { ...props, shortcut: JSON.stringify(props.shortcut ?? null) })
export const Action = Object.assign(action, {
  Style: { Regular: 'regular', Destructive: 'destructive' },
  CopyToClipboard: (props: Record<string, unknown>) => element('raycast-action', { title: props.title ?? 'Copy to Clipboard', shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => Clipboard.copy(props.content as string) }),
  OpenInBrowser: (props: Record<string, unknown>) => element('raycast-action', { title: props.title ?? 'Open in Browser', shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => compatibility.native({ kind: 'openGoogleTranslate', url: props.url as string }) }),
  Paste: (props: Record<string, unknown>) => element('raycast-action', { title: props.title ?? 'Paste', shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => compatibility.native({ kind: 'paste', text: props.content as string }) }),
  Push: (props: Record<string, unknown>) => element('raycast-action', { title: props.title, shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => navigationStack.push(props.target) && renderNavigationTop() }),
  SubmitForm: (props: Record<string, unknown>) => {
    const formId = React.useContext(FormContext)
    return element('raycast-action', { title: props.title ?? 'Submit', shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => {
      const collected = formId !== null ? formValues.get(formId) : undefined
      const values: Record<string, unknown> = {}
      if (collected) for (const [key, value] of collected) values[key] = value
      if (typeof props.onSubmit === 'function') props.onSubmit(values)
    } })
  },
})
export const ActionPanel = Object.assign(component('raycast-action-panel'), { Section: component('raycast-action-section') })

const unsupported = (name: string): never => { throw new Error(`Raycast API ${name} is not admitted in the initial tracer`) }
export async function clearSearchBar(): Promise<void> { return unsupported('clearSearchBar') }
export async function showHUD(_message: string): Promise<void> { return unsupported('showHUD') }
export const Clipboard = { copy: async (text: string) => compatibility.native({ kind: 'copy', text }), paste: async (_value: string) => unsupported('Clipboard.paste') }
let preferences: Record<string, unknown> | undefined
export function getPreferenceValues<T>(): T {
  preferences ??= (() => { try { const parsed: unknown = JSON.parse(process.env.TRUSTED_RAYCAST_PREFERENCES ?? '{}'); return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} } })()
  return { langFrom: 'auto', lang1: 'zh-CN', lang2: 'en', autoInput: false, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '', ...preferences } as T
}
export async function getSelectedText(): Promise<string> {
  try { return await compatibility.selection() } catch (error) {
    // Honest visible status: the source falls back to manual input and only logs the error.
    compatibility.toast({ style: 'failure', title: 'Selected Text Unavailable', message: error instanceof Error ? error.message.slice(0, 256) : 'Selected text is unavailable' })
    throw error
  }
}
export async function closeMainWindow(): Promise<void> { return unsupported('closeMainWindow') }
export async function popToRoot(): Promise<void> { return unsupported('popToRoot') }
export async function showInFinder(): Promise<void> { return unsupported('showInFinder') }
export async function open(): Promise<void> { return unsupported('open') }
