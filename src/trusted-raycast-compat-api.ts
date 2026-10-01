import React from 'react'
import { afterSucceededEffect } from './trusted-raycast-effect-callback.ts'
import { authorizeUserRaycastPkce } from './user-raycast-oauth.ts'
import { isUserRaycastOAuthCleanupReasons, type UserRaycastOAuthCleanupReason } from './user-raycast-contract.ts'

const element = (type: string, props: Record<string, unknown> | null, children: React.ReactNode[] = []) => React.createElement(type, props, ...children)
const component = (type: string) => (props: Record<string, unknown>) => element(type, props, React.Children.toArray(props.children as React.ReactNode))

// Search belongs to the view that rendered the List; navigation must not leak the previous handler.
let searchHandler: ((value: string) => void) | undefined
let searchable = false
let renderedCollectionItems = 0
// Every admitted Kaomoji item owns four finite actions; 64 items keep the whole
// projection within the independent 256-action protocol ceiling. Translate keeps
// its existing cap because its reviewed command has a different projection shape.
// ponytail: keep the 64-item ceiling until lazy/virtualized action registration makes larger browsing bounded.
const MAX_COLLECTION_ITEMS = process.env.TRUSTED_RAYCAST_EXTENSION_ID === 'kaomoji-search' ? 64 : 256
const searchableCollection = (type: 'raycast-grid' | 'raycast-list') => (props: Record<string, unknown>) => {
  renderedCollectionItems = 0
  if (typeof props.onSearchTextChange === 'function') {
    searchHandler = props.onSearchTextChange as (value: string) => void
    searchable = true
    ;(globalThis as { __trustedRaycastSearch?: ((value: string) => void) | undefined }).__trustedRaycastSearch = props.onSearchTextChange as (value: string) => void
  }
  return element(type, props, [...(props.searchBarAccessory ? [props.searchBarAccessory as React.ReactNode] : []), props.actions as React.ReactNode, ...React.Children.toArray(props.children as React.ReactNode)])
}
const section = component('raycast-section')
const list = searchableCollection('raycast-list')
export function viewSearchable(): boolean { return searchable }
export const List = Object.assign(list, {
  Item: Object.assign((props: Record<string, unknown>) => renderedCollectionItems++ < MAX_COLLECTION_ITEMS ? element('raycast-list-item', { title: props.title, subtitle: String(props.subtitle ?? ''), selected: props.selected === true, accessories: JSON.stringify(props.accessories ?? []), ...(process.env.TRUSTED_RAYCAST_EXTENSION_ID === 'google-translate' ? { keywords: props.keywords } : {}), ...(process.env.TRUSTED_RAYCAST_EXTENSION_ID === 'can-i-use' && Array.isArray(props.keywords) ? { featureName: props.keywords[0] } : {}) }, [props.detail as React.ReactNode, props.actions as React.ReactNode]) : null, { Detail: component('raycast-detail') }),
  Section: section,
  EmptyView: component('raycast-empty'),
  Dropdown: Object.assign((props: Record<string, unknown>) => element('raycast-dropdown', { value: String(props.value ?? ''), fieldEventId: `dropdown-${++handleSequence}`, ...(typeof props.onChange === 'function' ? { onChange: props.onChange as (value: string) => void } : {}) }, React.Children.toArray(props.children as React.ReactNode)), { Item: component('raycast-dropdown-item') }),
})
export const MenuBarExtra = Object.assign(component('raycast-menu-bar'), {
  Section: component('raycast-menu-section'),
  Item: component('raycast-menu-item'),
})
export const Grid = Object.assign(searchableCollection('raycast-grid'), {
  Item: (props: Record<string, unknown>) => {
    if (renderedCollectionItems++ >= MAX_COLLECTION_ITEMS) return null
    const source = typeof props.content === 'object' && props.content !== null && typeof (props.content as { source?: unknown }).source === 'object' && (props.content as { source: object }).source !== null ? (props.content as { source: Record<string, unknown> }).source : {}
    return element('raycast-grid-item', { contentDark: source.dark, contentLight: source.light, title: props.title }, [props.actions as React.ReactNode])
  },
  Section: section,
  EmptyView: component('raycast-empty'),
})
type NativeEffectRequest = { kind: 'copy' | 'openGoogleTranslate' | 'paste' | 'savePreferences'; preferences?: Readonly<Record<string, boolean | string>>; text?: string; url?: string }
type Compatibility = { native: (request: NativeEffectRequest) => Promise<void>; authUrl?: (url: string) => void | Promise<void>; openPreferences?: () => void; selection: () => Promise<string>; toast: (toast: { title: string; message: string; style: 'failure' | 'success' | 'animated' }) => void; hud?: (message: string) => void; storage?: { getItem: (key: string) => Promise<string | undefined>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void>; clear: () => Promise<void> }; cache?: (namespace?: string) => { get: (key: string) => string | undefined; set: (key: string, value: string) => void; remove: (key: string) => void; clear: () => void; subscribe: (listener: () => void) => () => void } }
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

type LinearAuthRequest = { endpoint: string; clientId: string; codeVerifier: string; redirectURI: string }
const linearPkceClients = new Set<LinearPkceClient>()
export async function revokeUserRaycastOAuthTokens(): Promise<void> {
  const results = await Promise.allSettled([...linearPkceClients].map(client => client.removeTokens()))
  const reasons = results.flatMap<UserRaycastOAuthCleanupReason>(result => result.status === 'fulfilled' ? []
    : result.reason instanceof Error && isUserRaycastOAuthCleanupReasons(result.reason.cause) ? result.reason.cause : ['unknown'])
  if (reasons.length) throw new Error('Linear OAuth token revocation could not be confirmed', { cause: [...new Set(reasons)].sort() })
}
type LinearTokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string }
class LinearPkceClient {
  readonly providerName = 'Linear'
  description = 'Connect your Linear account'
  private tokens: { accessToken: string; refreshToken?: string; idToken?: string; isExpired: () => boolean } | null = null
  private pending: AbortController | undefined
  private cleanup: Promise<void> | undefined
  constructor(options: { providerId?: string; redirectMethod?: string }) {
    if (process.env.TOCKTEAM_USER_RAYCAST_ID !== 'linear' || options.providerId !== 'linear' || options.redirectMethod !== 'web') unsupported('OAuth.PKCEClient')
    linearPkceClients.add(this)
  }
  async authorizationRequest(options: { endpoint: string; clientId: string; scope: string; extraParameters?: { actor?: string } }): Promise<LinearAuthRequest> {
    if (options.endpoint !== 'https://linear.app/oauth/authorize' || options.scope !== 'read' || options.extraParameters?.actor !== 'user') throw new Error('Only direct read-only Linear OAuth is supported')
    return { endpoint: options.endpoint, clientId: options.clientId, codeVerifier: '', redirectURI: '' }
  }
  async authorize(request: LinearAuthRequest): Promise<{ authorizationCode: string }> {
    const onAuthorizeUrl = compatibility.authUrl
    if (!onAuthorizeUrl) throw new Error('Raycast API OAuth.PKCEClient.authorize is unavailable')
    if (this.pending) throw new Error('Linear sign-in is already pending')
    this.pending = new AbortController()
    try {
      // The pinned Linear utility reads these fields only after authorize() resolves.
      const result = await authorizeUserRaycastPkce({ clientId: request.clientId, endpoint: request.endpoint, signal: this.pending.signal, onAuthorizeUrl })
      request.codeVerifier = result.codeVerifier
      request.redirectURI = result.redirectURI
      return { authorizationCode: result.code }
    } finally { this.pending = undefined }
  }
  async getTokens() { return this.tokens }
  async setTokens(raw: LinearTokenResponse): Promise<void> {
    if (!raw || typeof raw.access_token !== 'string' || !raw.access_token || raw.access_token.length > 8192 || raw.refresh_token !== undefined && (typeof raw.refresh_token !== 'string' || raw.refresh_token.length > 8192)) throw new Error('Invalid Linear OAuth tokens')
    if (this.cleanup) await this.cleanup
    this.cleanup = undefined
    const expiresAt = typeof raw.expires_in === 'number' && Number.isFinite(raw.expires_in) ? Date.now() + raw.expires_in * 1000 : Infinity
    this.tokens = { accessToken: raw.access_token, ...(raw.refresh_token ? { refreshToken: raw.refresh_token } : {}), ...(raw.id_token ? { idToken: raw.id_token } : {}), isExpired: () => Date.now() >= expiresAt }
  }
  async removeTokens(): Promise<void> {
    this.pending?.abort()
    // Keep only the cleanup outcome: repeated/concurrent callers must not turn a failed revoke into success.
    if (this.cleanup) return this.cleanup
    const tokens = this.tokens
    this.tokens = null
    if (!tokens) return
    const values = [...new Set([tokens.refreshToken, tokens.accessToken].filter((value): value is string => !!value))]
    this.cleanup = Promise.all(values.map(async (token): Promise<UserRaycastOAuthCleanupReason | undefined> => {
      const signal = AbortSignal.timeout(1500)
      try {
        const { status } = await fetch('https://api.linear.app/oauth/revoke', {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal,
        })
        // Linear documents only HTTP 200 as confirmation; never read a failure body.
        if (status === 200) return
        return Number.isInteger(status) && status >= 100 && status <= 599 ? `http-${status}` : 'unknown'
      } catch { return signal.aborted ? 'timeout' : 'transport' }
    })).then(results => {
      const reasons = results.filter((reason): reason is UserRaycastOAuthCleanupReason => reason !== undefined)
      if (reasons.length) throw new Error('Linear OAuth token revocation could not be confirmed', { cause: [...new Set(reasons)].sort() })
    })
    return this.cleanup
  }
}
export const OAuth = { RedirectMethod: { Web: 'web' }, PKCEClient: LinearPkceClient }

export const environment = Object.freeze({ isDevelopment: false })
export const Icon = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>
export const Color = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>
export const Keyboard = { Shortcut: { Common: { Copy: { modifiers: ['cmd'], key: 'c' }, MoveUp: { modifiers: ['cmd', 'shift'], key: 'arrowup' }, MoveDown: { modifiers: ['cmd', 'shift'], key: 'arrowdown' }, New: { modifiers: ['cmd'], key: 'n' }, Pin: { modifiers: ['cmd', 'shift'], key: 'p' }, RemoveAll: { modifiers: ['cmd', 'shift'], key: 'backspace' } } } }
export const Toast = { Style: { Failure: 'failure', Success: 'success', Animated: 'animated' } }
export async function showToast(styleOrToast: 'failure' | 'success' | 'animated' | { title: string; message?: string; style?: 'failure' | 'success' | 'animated' }, title?: string, message?: string): Promise<void> {
  if (typeof styleOrToast === 'string') compatibility.toast({ title: title ?? '', message: message ?? '', style: styleOrToast })
  else compatibility.toast({ title: styleOrToast.title, message: styleOrToast.message ?? '', style: styleOrToast.style ?? 'success' })
}
const action = (props: Record<string, unknown>) => element('raycast-action', { ...props, shortcut: JSON.stringify(props.shortcut ?? null) })
export const Action = Object.assign(action, {
  Style: { Regular: 'regular', Destructive: 'destructive' },
  CopyToClipboard: (props: Record<string, unknown>) => element('raycast-action', { icon: props.icon, title: props.title ?? 'Copy to Clipboard', shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => afterSucceededEffect(() => Clipboard.copy(props.content as string), props.onCopy, props.content) }),
  OpenInBrowser: (props: Record<string, unknown>) => element('raycast-action', { title: props.title ?? 'Open in Browser', shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => compatibility.native({ kind: 'openGoogleTranslate', url: props.url as string }) }),
  Paste: (props: Record<string, unknown>) => element('raycast-action', { icon: props.icon, title: props.title ?? 'Paste', shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => afterSucceededEffect(() => compatibility.native({ kind: 'paste', text: props.content as string }), props.onPaste, props.content) }),
  Push: (props: Record<string, unknown>) => element('raycast-action', { title: props.title, shortcut: JSON.stringify(props.shortcut ?? null), ...(process.env.TRUSTED_RAYCAST_EXTENSION_ID === 'can-i-use' ? { canIUsePush: true } : {}), onAction: () => navigationStack.push(props.target) && renderNavigationTop() }),
  SubmitForm: (props: Record<string, unknown>) => {
    const formId = React.useContext(FormContext)
    return element('raycast-action', { title: props.title ?? 'Submit', shortcut: JSON.stringify(props.shortcut ?? null), onAction: () => {
      const collected = formId !== null ? formValues.get(formId) : undefined
      const values: Record<string, unknown> = {}
      if (collected) for (const [key, value] of collected) values[key] = value
      if (typeof props.onSubmit === 'function') return props.onSubmit(values)
    } })
  },
})
export const ActionPanel = Object.assign(component('raycast-action-panel'), { Section: component('raycast-action-section') })

const unsupported = (name: string): never => { throw new Error(`Raycast API ${name} is not admitted by this capability`) }
export async function clearSearchBar(): Promise<void> { return unsupported('clearSearchBar') }
export async function showHUD(message: string): Promise<void> { if (!compatibility.hud) return unsupported('showHUD'); compatibility.hud(message) }
export class Cache {
  private readonly store: ReturnType<NonNullable<Compatibility['cache']>>
  constructor(options: { namespace?: string } = {}) {
    const createCache = compatibility.cache ?? unsupported('Cache')
    this.store = createCache(options.namespace)
  }
  get = (key: string): string | undefined => this.store.get(key)
  set = (key: string, value: string): void => this.store.set(key, value)
  remove = (key: string): void => this.store.remove(key)
  clear = (): void => this.store.clear()
  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener)
}
export const LocalStorage = {
  getItem: async (key: string): Promise<string | undefined> => compatibility.storage ? compatibility.storage.getItem(key) : unsupported('LocalStorage.getItem'),
  setItem: async (key: string, value: string): Promise<void> => compatibility.storage ? compatibility.storage.setItem(key, value) : unsupported('LocalStorage.setItem'),
  removeItem: async (key: string): Promise<void> => compatibility.storage ? compatibility.storage.removeItem(key) : unsupported('LocalStorage.removeItem'),
  clear: async (): Promise<void> => compatibility.storage ? compatibility.storage.clear() : unsupported('LocalStorage.clear'),
}
export const Clipboard = { copy: async (text: string) => compatibility.native({ kind: 'copy', text }), paste: async (_value: string) => unsupported('Clipboard.paste') }
export function openExtensionPreferences(): void { compatibility.openPreferences?.() }
let preferences: Record<string, unknown> | undefined
export function getPreferenceValues<T>(): T {
  preferences ??= (() => { try { const parsed: unknown = JSON.parse(process.env.TRUSTED_RAYCAST_PREFERENCES ?? '{}'); return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} } })()
  const defaults = process.env.TRUSTED_RAYCAST_EXTENSION_ID === 'kaomoji-search'
    ? { displayMode: 'list', primaryAction: 'paste-to-active-app' }
    : { langFrom: 'auto', lang1: 'en', lang2: 'en', autoInput: true, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' }
  return { ...defaults, ...preferences } as T
}
export async function savePreferenceValues(next: Readonly<Record<string, boolean | string>>): Promise<void> {
  await compatibility.native({ kind: 'savePreferences', preferences: next })
  preferences = { ...next }
}
export async function getSelectedText(): Promise<string> {
  // The source handles optional auto-input failures and keeps manual input available.
  return compatibility.selection()
}
export async function closeMainWindow(): Promise<void> { return unsupported('closeMainWindow') }
export async function popToRoot(): Promise<void> { return unsupported('popToRoot') }
export async function showInFinder(): Promise<void> { return unsupported('showInFinder') }
export async function open(): Promise<void> { return unsupported('open') }
