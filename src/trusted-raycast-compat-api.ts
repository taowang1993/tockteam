import React from 'react'

const element = (type: string, props: Record<string, unknown> | null, children: React.ReactNode[] = []) => React.createElement(type, props, ...children)
const component = (type: string) => (props: Record<string, unknown>) => element(type, props, React.Children.toArray(props.children as React.ReactNode))

const list = (props: Record<string, unknown>) => {
  if (typeof props.onSearchTextChange === 'function') (globalThis as any).__trustedRaycastSearch = props.onSearchTextChange
  return element('raycast-list', props, React.Children.toArray(props.children as React.ReactNode))
}
export const List = Object.assign(list, {
  Item: Object.assign(component('raycast-list-item'), { Detail: component('raycast-detail') }),
  EmptyView: component('raycast-empty'),
  Dropdown: Object.assign(component('raycast-dropdown'), { Item: component('raycast-dropdown-item') }),
})
export const Action = component('raycast-action')
export const ActionPanel = Object.assign(component('raycast-action-panel'), { Section: component('raycast-action-section') })
export const Form = Object.assign(component('raycast-form'), { TextField: component('raycast-text-field'), Dropdown: Object.assign(component('raycast-form-dropdown'), { Item: component('raycast-form-dropdown-item') }) })
export const Icon = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>
export const Color = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>
export const Keyboard = { Shortcut: { Common: new Proxy({}, { get: (_target, key) => ({ key: String(key) }) }) } }
export const Toast = { Style: { Failure: 'failure', Success: 'success', Animated: 'animated' } }
export async function showToast(toast: unknown): Promise<void> { process.stderr.write(`TOAST ${JSON.stringify(toast)}\n`) }
export function useNavigation(): { push: (view: unknown) => never; pop: () => never } { return { push: () => { throw new Error('Raycast navigation is not admitted in the initial tracer') }, pop: () => { throw new Error('Raycast navigation is not admitted in the initial tracer') } } }
const unsupported = (name: string): never => { throw new Error(`Raycast API ${name} is not admitted in the initial tracer`) }
export async function clearSearchBar(): Promise<void> { return unsupported('clearSearchBar') }
export async function showHUD(_message: string): Promise<void> { return unsupported('showHUD') }
export const Clipboard = { copy: async (_value: string) => unsupported('Clipboard.copy'), paste: async (_value: string) => unsupported('Clipboard.paste') }
export function getPreferenceValues<T>(): T { return { langFrom: 'auto', lang1: 'zh-CN', lang2: 'en', autoInput: false, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' } as T }
export async function getSelectedText(): Promise<string> { return unsupported('getSelectedText') }
export async function closeMainWindow(): Promise<void> { return unsupported('closeMainWindow') }
export async function popToRoot(): Promise<void> { return unsupported('popToRoot') }
export async function showInFinder(): Promise<void> { return unsupported('showInFinder') }
export async function open(): Promise<void> { return unsupported('open') }
