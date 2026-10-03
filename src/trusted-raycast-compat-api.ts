import React from 'react'
import { afterSucceededEffect } from './trusted-raycast-effect-callback.ts'
import { authorizeUserRaycastPkce } from './user-raycast-oauth.ts'
import type { UserRaycastLocalStorageValue } from './user-raycast-storage.ts'
import { isUserRaycastFieldValue, isUserRaycastOAuthCleanupCounts, isUserRaycastOAuthCleanupReasons, type UserRaycastFieldKind, type UserRaycastFieldValue, type UserRaycastOAuthCleanupReason } from './user-raycast-contract.ts'

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
export const LaunchType = Object.freeze({ UserInitiated: 'userInitiated', Background: 'background' } as const)
type CommandEnvironment = Readonly<{ extensionName: string; entryPointName: string; entryPointMode: 'no-view' | 'view' | 'menu-bar'; launchType?: typeof LaunchType[keyof typeof LaunchType] }>
type NativeEffectRequest = { kind: 'copy' | 'openGoogleTranslate' | 'paste' | 'savePreferences'; preferences?: Readonly<Record<string, boolean | string>>; text?: string; url?: string }
type CompatibilityStorage = { removeItem: (key: string) => Promise<void>; clear: () => Promise<void> } & (
  { typed?: false; allItems?: () => Promise<Record<string, string>>; getItem: (key: string) => Promise<string | undefined>; setItem: (key: string, value: string) => Promise<void> }
  | { typed: true; allItems?: () => Promise<Record<string, UserRaycastLocalStorageValue>>; getItem: (key: string) => Promise<UserRaycastLocalStorageValue | undefined>; setItem: (key: string, value: UserRaycastLocalStorageValue) => Promise<void> }
)
type Compatibility = { environment?: CommandEnvironment; native: (request: NativeEffectRequest) => Promise<void>; authUrl?: (url: string) => void | Promise<void>; openPreferences?: () => void; selection: () => Promise<string>; toast: (toast: { title: string; message: string; style: 'failure' | 'success' | 'animated' }) => void; hud?: (message: string) => void; storage?: CompatibilityStorage; cache?: (namespace?: string) => { get: (key: string) => string | undefined; has?: (key: string) => boolean; readonly isEmpty?: boolean; set: (key: string, value: string) => void; remove: (key: string) => boolean; clear: (options?: { notifySubscribers: boolean }) => void; subscribe: (listener: (key: string | undefined, data: string | undefined) => void) => () => void } }
let compatibility: Compatibility
let commandEnvironment: CommandEnvironment | undefined
export let queryEpoch = 0
export let queryText = ''
export function advanceQuery(value: string): void { queryText = value; queryEpoch++ }
export function configureCompatibility(value: Compatibility): void {
  const next = value.environment === undefined ? undefined : { ...value.environment }
  if (next && (typeof next.extensionName !== 'string' || !next.extensionName || next.extensionName.length > 128
    || typeof next.entryPointName !== 'string' || !next.entryPointName || next.entryPointName.length > 128
    || !['view', 'no-view', 'menu-bar'].includes(next.entryPointMode)
    || next.launchType !== undefined && !Object.values(LaunchType).includes(next.launchType))) throw new Error('Invalid command environment')
  const snapshot = next ? Object.freeze(next) : undefined
  compatibility = value
  commandEnvironment = snapshot
}

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

// Each mounted Form owns its values; no process-global registry outlives that form.
type StoredFormValue = readonly [UserRaycastFieldKind, UserRaycastFieldValue]
const FormContext = React.createContext<{ values: Map<string, UserRaycastFieldValue>; dates: Set<string>; stored: Map<string, UserRaycastFieldKind>; load(): Map<string, StoredFormValue>; save?: (value: string) => void } | null>(null)
const DropdownDefaultContext = React.createContext<((value: string) => void) | null>(null)
const copyFormValue = (value: UserRaycastFieldValue): UserRaycastFieldValue => Array.isArray(value) ? [...value] : value
const encodeFormDate = (value: unknown): string | null => {
  if (value === null) return null
  if (value instanceof Date) {
    try { return Date.prototype.toISOString.call(value) } catch { /* Invalid dates cannot enter the projection. */ }
  }
  throw new Error('Invalid date field value')
}
const decodeFormDate = (value: UserRaycastFieldValue): Date | null => {
  if (!isUserRaycastFieldValue('date', value)) throw new Error('Invalid date field value')
  return typeof value === 'string' ? new Date(value) : null
}
const formDateKey = (value: string, type: unknown): number => {
  const date = new Date(value)
  return type === 'date' ? date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate() : date.getTime()
}
const readStoredForm = (raw: string | undefined): Map<string, StoredFormValue> => {
  if (raw === undefined) return new Map()
  try {
    if (Buffer.byteLength(raw) > 4096) throw new Error()
    const entries: unknown = JSON.parse(raw)
    if (!Array.isArray(entries) || entries.length > 64 || !entries.every(entry => Array.isArray(entry) && entry.length === 3 && typeof entry[0] === 'string' && entry[0].length > 0 && entry[0].length <= 128 && isUserRaycastFieldValue(entry[1], entry[2])) || new Set(entries.map(entry => entry[0])).size !== entries.length) throw new Error()
    return new Map((entries as Array<[string, UserRaycastFieldKind, UserRaycastFieldValue]>).map(([id, kind, value]) => [id, [kind, value]]))
  } catch { throw new Error('Stored form values are invalid') }
}
let handleSequence = 0
const form = (props: Record<string, unknown>) => {
  // ponytail: useId scopes stable mounted form order; add persistent view identity for dynamic navigation.
  const formId = React.useId()
  const [state] = React.useState(() => {
    const cache = process.env.TOCKTEAM_USER_RAYCAST_ID === undefined ? undefined : compatibility.cache?.(`form:${process.env.TOCKTEAM_USER_RAYCAST_COMMAND}`)
    let previous: Map<string, StoredFormValue> | undefined
    return { values: new Map<string, UserRaycastFieldValue>(), dates: new Set<string>(), stored: new Map<string, UserRaycastFieldKind>(), load: () => previous ??= readStoredForm(cache?.get(formId)), ...(cache ? { save: (value: string) => { cache.set(formId, value); previous = readStoredForm(value) } } : {}) }
  })
  return React.createElement(FormContext.Provider, { value: state }, element('raycast-form', process.env.TOCKTEAM_USER_RAYCAST_ID === undefined ? {} : { formId }, [props.actions as React.ReactNode, ...React.Children.toArray(props.children as React.ReactNode)]))
}
const basicFormField = (fieldKind: UserRaycastFieldKind, fallback: UserRaycastFieldValue | ((props: Record<string, unknown>) => UserRaycastFieldValue)) => (props: Record<string, unknown>) => {
  const collected = React.useContext(FormContext)
  const initialRef = React.useRef<UserRaycastFieldValue | undefined>(undefined)
  if (initialRef.current === undefined) {
    const initial = props.defaultValue === undefined ? typeof fallback === 'function' ? fallback(props) : fallback : props.defaultValue
    if (!isUserRaycastFieldValue(fieldKind, initial)) throw new Error('Invalid form field ID or value')
    initialRef.current = copyFormValue(initial)
  }
  const initial = initialRef.current
  const defaultChosen = React.useRef(fieldKind !== 'dropdown' || props.defaultValue !== undefined)
  const restored = React.useRef(false)
  const [draft, setDraft] = React.useState(() => {
    const stored = props.storeValue === true && collected?.save ? collected.load().get(String(props.id)) : undefined
    restored.current = stored?.[0] === fieldKind
    return copyFormValue(restored.current ? stored![1] : initial)
  })
  const chooseFirstOption = React.useCallback((option: string) => {
    if (defaultChosen.current) return
    defaultChosen.current = true
    initialRef.current = option
    if (!restored.current) setDraft(option)
  }, [])
  const [focusRequest, setFocusRequest] = React.useState(0)
  const [resetRequest, setResetRequest] = React.useState(0)
  const [, refresh] = React.useState(0)
  const rawValue = props.value === undefined ? draft : props.value
  const id = props.id
  if (typeof id !== 'string' || id.length === 0 || id.length > 128 || !isUserRaycastFieldValue(fieldKind, rawValue)) throw new Error('Invalid form field ID or value')
  const value = copyFormValue(rawValue)
  const fieldEventId = React.useMemo(() => `field-${++handleSequence}`, [id])
  const change = async (next: UserRaycastFieldValue): Promise<void> => {
    if (!isUserRaycastFieldValue(fieldKind, next)) throw new Error('Invalid form field value')
    const snapshot = copyFormValue(next)
    setDraft(snapshot)
    try { if (typeof props.onChange === 'function') await props.onChange(copyFormValue(snapshot)) }
    finally { refresh(previous => previous + 1) }
  }
  React.useImperativeHandle(props.ref as React.Ref<{ focus(): void; reset(): void }>, () => ({
    focus: () => setFocusRequest(previous => previous + 1),
    reset: () => { if (fieldKind === 'date') setResetRequest(previous => previous + 1); void change(initialRef.current!) },
  }))
  React.useLayoutEffect(() => {
    if (!collected) return
    if (collected.values.has(id)) throw new Error('Form field IDs must be unique')
    collected.values.set(id, copyFormValue(value))
    if (fieldKind === 'date') collected.dates.add(id)
    if (props.storeValue === true) collected.stored.set(id, fieldKind)
    return () => { collected.values.delete(id); collected.dates.delete(id); collected.stored.delete(id) }
  }, [collected, id, value, props.storeValue])
  // The reviewed bundled projection remains unchanged; callbacks stay in the private child.
  const field = element('raycast-text-field', process.env.TOCKTEAM_USER_RAYCAST_ID === undefined ? props : {
    ...props, ref: undefined, fieldKind, value, fieldEventId, focusRequest, ...(fieldKind === 'date' ? { resetRequest } : {}),
    onChange: (next: UserRaycastFieldValue) => {
      if (fieldKind === 'date' && typeof next === 'string' && (typeof props.min === 'string' && formDateKey(next, props.dateType) < formDateKey(props.min, props.dateType)
        || typeof props.max === 'string' && formDateKey(next, props.dateType) > formDateKey(props.max, props.dateType))) throw new Error('The date is outside the allowed range.')
      return change(next)
    },
    ...(fieldKind === 'dropdown' ? {
      searchable: typeof props.onSearchTextChange === 'function',
      filtering: props.filtering === undefined ? typeof props.onSearchTextChange !== 'function' : props.filtering !== false,
      keepSectionOrder: typeof props.filtering === 'object' && props.filtering !== null && (props.filtering as { keepSectionOrder?: unknown }).keepSectionOrder === true,
    } : {}),
    onFocus: (next: UserRaycastFieldValue) => typeof props.onFocus === 'function' ? props.onFocus({ target: { id, value: copyFormValue(next) }, type: 'focus' }) : undefined,
    onBlur: (next: UserRaycastFieldValue) => typeof props.onBlur === 'function' ? props.onBlur({ target: { id, value: copyFormValue(next) }, type: 'blur' }) : undefined,
  }, React.Children.toArray(props.children as React.ReactNode))
  return fieldKind === 'dropdown' && process.env.TOCKTEAM_USER_RAYCAST_ID !== undefined ? React.createElement(DropdownDefaultContext.Provider, { value: chooseFirstOption }, field) : field
}
const formDropdown = (props: Record<string, unknown>) => {
  const collected = React.useContext(FormContext)?.values ?? null
  const fieldId = React.useRef(`field-${++handleSequence}`).current
  let value = typeof props.value === 'string' ? props.value : ''
  if (collected !== null) {
    if (!collected.has(String(props.id))) {
      // Raycast defaults an uncontrolled dropdown to its first item; the submitted values must match.
      const first = React.Children.toArray(props.children as React.ReactNode).find((item: unknown) => typeof item === 'object' && item !== null && (item as { props?: Record<string, unknown> }).props?.value !== '' && (item as { props?: Record<string, unknown> }).props?.value !== undefined)
      collected.set(String(props.id), value !== '' ? value : String((first as { props: Record<string, unknown> }).props.value))
    }
    value = String(collected.get(String(props.id))!)
  }
  return element('raycast-form-dropdown', { title: String(props.title ?? ''), value, fieldEventId: fieldId, onChange: (next: string) => { collected?.set(String(props.id), next); if (typeof props.onChange === 'function') props.onChange(next) } }, React.Children.toArray(props.children as React.ReactNode))
}
const dropdownItem = function DropdownItem(props: Record<string, unknown>) {
  const chooseFirstOption = React.useContext(DropdownDefaultContext)
  React.useLayoutEffect(() => {
    if (typeof props.value === 'string') chooseFirstOption?.(props.value)
  }, [chooseFirstOption, props.value])
  return element('raycast-form-dropdown-item', props, React.Children.toArray(props.children as React.ReactNode))
}
const dateField = basicFormField('date', null)
const datePicker = (props: Record<string, unknown>) => {
  const dateType = props.type ?? 'date_time'
  if (dateType !== 'date' && dateType !== 'date_time') throw new Error('Invalid date field type')
  const bounds = Object.fromEntries(['min', 'max'].flatMap(key => {
    if (props[key] === undefined) return []
    const value = encodeFormDate(props[key])
    if (value === null) throw new Error('Invalid date field limit')
    return [[key, value]]
  }))
  if (bounds.min && bounds.max && formDateKey(bounds.min, dateType) > formDateKey(bounds.max, dateType)) throw new Error('Invalid date field limits')
  return React.createElement(dateField, {
    ...props, ...bounds, dateType,
    defaultValue: props.defaultValue === undefined ? undefined : encodeFormDate(props.defaultValue),
    value: props.value === undefined ? undefined : encodeFormDate(props.value),
    onChange: (value: UserRaycastFieldValue) => typeof props.onChange === 'function' ? props.onChange(decodeFormDate(value)) : undefined,
    onFocus: (event: { target: { id: string; value: UserRaycastFieldValue }; type: string }) => typeof props.onFocus === 'function' ? props.onFocus({ ...event, target: { id: event.target.id, value: decodeFormDate(event.target.value) } }) : undefined,
    onBlur: (event: { target: { id: string; value: UserRaycastFieldValue }; type: string }) => typeof props.onBlur === 'function' ? props.onBlur({ ...event, target: { id: event.target.id, value: decodeFormDate(event.target.value) } }) : undefined,
  })
}
const formDescription = (props: Record<string, unknown>) => {
  if (!isUserRaycastFieldValue('text', props.text) || props.title !== undefined && !isUserRaycastFieldValue('text', props.title)) throw new Error('Invalid form description')
  return element('raycast-form-description', { text: props.text, ...(props.title === undefined ? {} : { title: props.title }) })
}
const formSeparator = () => element('raycast-form-separator', {})
export const Form = Object.assign(form, {
  Description: formDescription, Separator: formSeparator,
  DatePicker: Object.assign(datePicker, { Type: Object.freeze({ Date: 'date', DateTime: 'date_time' }), isFullDay: (_date?: Date | null): never => unsupported('Form.DatePicker.isFullDay') }),
  TextField: basicFormField('text', ''), PasswordField: basicFormField('password', ''),
  TextArea: basicFormField('textarea', ''), Checkbox: basicFormField('checkbox', false),
  Dropdown: Object.assign(process.env.TOCKTEAM_USER_RAYCAST_ID === undefined ? formDropdown : basicFormField('dropdown', ''), { Item: dropdownItem, Section: section }),
  TagPicker: Object.assign(basicFormField('tagpicker', []), { Item: dropdownItem }),
  DropdownItem: dropdownItem, DropdownSection: section, TagPickerItem: dropdownItem,
})
export const FormDatePicker = Form.DatePicker, FormSeparator = Form.Separator
export const FormDropdown = Form.Dropdown, FormDropdownItem = dropdownItem, FormDropdownSection = section
export const FormTagPicker = Form.TagPicker, FormTagPickerItem = dropdownItem

type LinearAuthRequest = { endpoint: string; clientId: string; codeVerifier: string; redirectURI: string }
const linearPkceClients = new Set<LinearPkceClient>()
// Count settled first-party requests across this child's lifetime, never repeated cleanup callers.
const oauthCleanupCounts = { attempted: 0, confirmed: 0, failed: 0 }
export async function revokeUserRaycastOAuthTokens(): Promise<void> {
  const results = await Promise.allSettled([...linearPkceClients].map(async client => client.removeTokens()))
  const reasons = results.flatMap<UserRaycastOAuthCleanupReason>(result => result.status === 'fulfilled' ? []
    : result.reason instanceof Error && isUserRaycastOAuthCleanupReasons(result.reason.cause) ? result.reason.cause : ['unknown'])
  if (reasons.length) {
    const complete = results.every(result => result.status === 'fulfilled' || result.reason instanceof Error && isUserRaycastOAuthCleanupReasons(result.reason.cause)
      && 'cleanupCounts' in result.reason && isUserRaycastOAuthCleanupCounts(result.reason.cleanupCounts) && result.reason.cleanupCounts.failed >= result.reason.cause.length)
    // Omit incomplete or over-bound totals rather than clamp them or imply zero failures.
    const counts = complete && isUserRaycastOAuthCleanupCounts(oauthCleanupCounts) && oauthCleanupCounts.failed > 0 ? { ...oauthCleanupCounts } : undefined
    throw Object.assign(new Error('Linear OAuth token revocation could not be confirmed', { cause: [...new Set(reasons)].sort() }), counts ? { cleanupCounts: counts } : {})
  }
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
      const cleanupCounts = { attempted: results.length, confirmed: results.length - reasons.length, failed: reasons.length }
      for (const key of ['attempted', 'confirmed', 'failed'] as const) oauthCleanupCounts[key] += cleanupCounts[key]
      if (reasons.length) throw Object.assign(new Error('Linear OAuth token revocation could not be confirmed', { cause: [...new Set(reasons)].sort() }), { cleanupCounts })
    })
    return this.cleanup
  }
}
export const OAuth = { RedirectMethod: { Web: 'web' }, PKCEClient: LinearPkceClient }

export const environment = Object.freeze({
  isDevelopment: false,
  get extensionName(): string { return commandEnvironment?.extensionName ?? unsupported('environment.extensionName') },
  get entryPointName(): string { return commandEnvironment?.entryPointName ?? unsupported('environment.entryPointName') },
  get entryPointType(): 'command' { return commandEnvironment ? 'command' : unsupported('environment.entryPointType') },
  get entryPointMode(): CommandEnvironment['entryPointMode'] { return commandEnvironment?.entryPointMode ?? unsupported('environment.entryPointMode') },
  get launchType(): NonNullable<CommandEnvironment['launchType']> { return commandEnvironment?.launchType ?? unsupported('environment.launchType') },
  get commandName(): string { return environment.entryPointName },
  get commandMode(): CommandEnvironment['entryPointMode'] { return environment.entryPointMode },
})
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
    const collected = React.useContext(FormContext)
    return element('raycast-action', { title: props.title ?? 'Submit', ...(process.env.TOCKTEAM_USER_RAYCAST_ID === undefined ? {} : { submitForm: true }), shortcut: JSON.stringify(props.shortcut ?? null), onAction: async () => {
      const values = Object.fromEntries(Array.from(collected?.values ?? [], ([id, value]) => [id, collected?.dates.has(id) ? decodeFormDate(value) : copyFormValue(value)]))
      const stored = collected?.save && collected.stored.size ? new Map(collected.load()) : undefined
      if (stored) for (const [id, kind] of collected!.stored) stored.set(id, [kind, copyFormValue(collected!.values.get(id)!)])
      const snapshot = stored ? JSON.stringify(Array.from(stored, ([id, [kind, value]]) => [id, kind, value])) : undefined
      // ponytail: reuse the atomic 4 KiB cache entry; raise storage limits only for a measured command.
      if (snapshot !== undefined) {
        if (Buffer.byteLength(snapshot) > 4096) throw new Error('Stored form values exceed the 4 KiB limit')
        readStoredForm(snapshot)
      }
      if (typeof props.onSubmit === 'function' && await props.onSubmit(values) === false) throw new Error('Form submission was not accepted')
      if (snapshot !== undefined) collected!.save!(snapshot)
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
  has = (key: string): boolean => this.store.has ? this.store.has(key) : unsupported('Cache.has')
  get isEmpty(): boolean { const value = this.store.isEmpty; return typeof value === 'boolean' ? value : unsupported('Cache.isEmpty') }
  set = (key: string, value: string): void => this.store.set(key, value)
  remove = (key: string): boolean => this.store.remove(key)
  clear = (options?: { notifySubscribers: boolean }): void => this.store.clear(options)
  subscribe = (listener: (key: string | undefined, data: string | undefined) => void): (() => void) => this.store.subscribe(listener)
}
export const LocalStorage = {
  allItems: async <T extends Record<string, UserRaycastLocalStorageValue> = Record<string, UserRaycastLocalStorageValue>>(): Promise<T> => compatibility.storage?.allItems ? await compatibility.storage.allItems() as T : unsupported('LocalStorage.allItems'),
  getItem: async <T extends UserRaycastLocalStorageValue = UserRaycastLocalStorageValue>(key: string): Promise<T | undefined> => compatibility.storage ? await compatibility.storage.getItem(key) as T | undefined : unsupported('LocalStorage.getItem'),
  setItem: async (key: string, value: UserRaycastLocalStorageValue): Promise<void> => {
    const store = compatibility.storage ?? unsupported('LocalStorage.setItem')
    if (store.typed === true) return store.setItem(key, value)
    if (typeof value !== 'string') return unsupported('LocalStorage.setItem typed values')
    return store.setItem(key, value)
  },
  removeItem: async (key: string): Promise<void> => compatibility.storage ? compatibility.storage.removeItem(key) : unsupported('LocalStorage.removeItem'),
  clear: async (): Promise<void> => compatibility.storage ? compatibility.storage.clear() : unsupported('LocalStorage.clear'),
}
export const allLocalStorageItems = LocalStorage.allItems, getLocalStorageItem = LocalStorage.getItem, setLocalStorageItem = LocalStorage.setItem
export const removeLocalStorageItem = LocalStorage.removeItem, clearLocalStorage = LocalStorage.clear
export const Clipboard = { copy: async (text: string) => compatibility.native({ kind: 'copy', text }), paste: async (_value: string) => unsupported('Clipboard.paste') }
export function openExtensionPreferences(): void { compatibility.openPreferences?.() }
let preferences: Record<string, unknown> | undefined
export function getPreferenceValues<T>(): T {
  preferences ??= (() => { try { const parsed: unknown = JSON.parse(process.env.TRUSTED_RAYCAST_PREFERENCES ?? '{}'); return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} } })()
  if (process.env.TOCKTEAM_USER_RAYCAST_ID !== undefined) return { ...preferences } as T
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
