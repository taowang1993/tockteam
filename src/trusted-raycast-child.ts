import React from 'react'
// @ts-expect-error Build-time first-party alias, shared with unchanged source.
import { Action, ActionPanel, Form, configureCompatibility, advanceQuery, getPreferenceValues, savePreferenceValues, queryText, registerNavigationRenderer, popView, viewSearchable, navigationDepth } from '@raycast/api'
// @ts-expect-error Build-time first-party contract alias.
import { isTrustedRaycastNativeOutcome, isTrustedRaycastViewEvent } from '@tockteam/trusted-raycast-child-contract'
// @ts-expect-error The approved child artifact supplies this runtime-only singleton.
import Reconciler from 'react-reconciler'
// @ts-expect-error The runtime replaces this source-preserving path during extraction.
import Command from '/tmp/trusted-raycast-source/src/translate'
// @ts-expect-error The admitted artifact supplies the unchanged extension manifest.
import extensionManifest from '/tmp/trusted-raycast-source/package.json'

type Node = { type: string; props: Record<string, unknown>; children: Array<Node | string> }
// stdout is the authenticated JSON protocol; preserve source diagnostics on stderr.
console.log = (...values: unknown[]) => console.error(...values)
const rootNode: Node = { type: 'root', props: {}, children: [] }
let handles = new Map<string, () => unknown>()
let fieldHandles = new Map<string, (value: string) => void>()
const serialize = (node: Node | string): unknown => {
  if (typeof node === 'string') return node
  const props = Object.fromEntries(Object.entries(node.props).filter(([key, value]) => key !== 'children' && typeof value !== 'function' && (typeof value !== 'object' || value === null)))
  if (node.type === 'raycast-action' && !props.unavailable && typeof node.props.onAction === 'function') {
    const id = `action-${handles.size}`
    handles.set(id, node.props.onAction as () => unknown)
    props.actionEventId = id
  }
  if ((node.type === 'raycast-form-dropdown' || node.type === 'raycast-dropdown') && typeof node.props.onChange === 'function' && typeof node.props.fieldEventId === 'string') {
    fieldHandles.set(node.props.fieldEventId, node.props.onChange as (value: string) => void)
  }
  return { type: node.type, props, children: node.children.map(serialize) }
}
const extensionId = process.env.TRUSTED_RAYCAST_EXTENSION_ID
if (extensionId !== 'google-translate' && extensionId !== 'kaomoji-search') throw new Error('Invalid trusted extension identity')
const sessionId = process.env.TRUSTED_RAYCAST_SESSION_ID!
const generation = process.env.TRUSTED_RAYCAST_GENERATION!
let revision = -1
let querySequence = 0
let ready = false
let searchHandler: ((value: string) => void) | undefined
const emit = () => {
  handles = new Map()
  fieldHandles = new Map()
  rootNode.props.querySequence = querySequence
  rootNode.props.preferenceSetup = showingPreferenceSetup
  rootNode.props.searchable = viewSearchable()
  rootNode.props.navigationDepth = navigationDepth()
  const root = serialize(rootNode)
  process.stdout.write(`${JSON.stringify({ type: ready ? 'patch' : 'ready', extensionId, sessionId, generation, revision: ++revision, root, ...(ready ? { status: 'ready' } : {}) })}\n`)
  ready = true
}
let activeAction: { eventId: string; revision: number } | undefined
let nativeSequence = 0
const nativePending = new Map<string, { resolve: (result?: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
const requestNative = (request: object, resolve: (result?: string) => void, reject: (error: Error) => void): void => {
  const requestId = `native-${++nativeSequence}`
  const timer = setTimeout(() => { nativePending.delete(requestId); reject(new Error('Native action timed out')) }, 10000)
  nativePending.set(requestId, { resolve, reject, timer })
  process.stdout.write(`${JSON.stringify({ type: 'native', extensionId, sessionId, generation, requestId, ...request })}\n`)
}
configureCompatibility({
  openPreferences: () => { showingPreferenceSetup = true; preferencesRoot = React.createElement(PreferencesSetup); mount(preferencesRoot) },
  native: (request: { kind: 'copy' | 'paste'; text?: string } | { kind: 'openGoogleTranslate'; url?: string } | { kind: 'savePreferences'; preferences?: Readonly<Record<string, boolean | string>> }) => new Promise<void>((resolve, reject) => {
    if (!activeAction) { reject(new Error('Native effect requires a current source action')); return }
    requestNative({ revision: activeAction.revision, eventId: activeAction.eventId, ...request }, () => resolve(), reject)
  }),
  selection: () => new Promise<string>((resolve, reject) => {
    requestNative({ kind: 'selectedText' }, result => { if (typeof result === 'string') resolve(result); else reject(new Error('Selected text was not returned')) }, reject)
  }),
  toast: (toast: { title: string; message: string; style: string }) => {
    process.stdout.write(`${JSON.stringify({ type: 'toast', extensionId, sessionId, generation, revision, querySequence, ...toast })}\n`)
  },
})
const hostConfig: any = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: false,
  now: Date.now,
  getRootHostContainer: () => rootNode,
  getRootHostContext: () => rootNode,
  getChildHostContext: (parent: unknown) => parent,
  prepareForCommit: () => null,
  resetAfterCommit: emit,
  createInstance: (type: string, props: Record<string, unknown>) => ({ type, props, children: [] }),
  createTextInstance: (text: string) => text,
  appendInitialChild: (parent: Node, child: Node | string) => parent.children.push(child),
  appendChild: (parent: Node, child: Node | string) => parent.children.push(child),
  appendChildToContainer: (parent: Node, child: Node | string) => parent.children.push(child),
  insertBefore: (parent: Node, child: Node | string, before: Node | string) => parent.children.splice(parent.children.indexOf(before), 0, child),
  insertInContainerBefore: (parent: Node, child: Node | string, before: Node | string) => parent.children.splice(parent.children.indexOf(before), 0, child),
  removeChild: (parent: Node, child: Node | string) => { const index = parent.children.indexOf(child); if (index >= 0) parent.children.splice(index, 1) },
  removeChildFromContainer: (parent: Node, child: Node | string) => { const index = parent.children.indexOf(child); if (index >= 0) parent.children.splice(index, 1) },
  clearContainer: (parent: Node) => { parent.children.length = 0 },
  finalizeInitialChildren: () => false,
  prepareUpdate: () => true,
  commitUpdate: (instance: Node, _type: string, _old: unknown, props: Record<string, unknown>) => { instance.props = props },
  commitTextUpdate: (_instance: unknown, _old: string, _next: string) => {},
  shouldSetTextContent: () => false,
  getPublicInstance: (instance: Node) => instance,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,
  detachDeletedInstance: () => {},
  resolveUpdatePriority: () => 1,
  getCurrentUpdatePriority: () => 1,
  setCurrentUpdatePriority: () => {},
  getCurrentEventPriority: () => 1,
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
  commitMount: () => {},
}
const renderer = Reconciler(hostConfig)
const reportError = (error: unknown): void => {
  process.stdout.write(`${JSON.stringify({ type: 'error', extensionId, sessionId, generation, revision: ++revision, message: String(error).slice(0, 128) })}\n`)
}
const container = renderer.createContainer(rootNode, 0, null, false, null, '', reportError, reportError, reportError)
const commandRoot = React.createElement(Command)
type ManifestPreference = { name?: unknown; title?: unknown; type?: unknown; data?: unknown }
const preferenceNames = extensionId === 'kaomoji-search' ? ['displayMode', 'primaryAction'] : ['langFrom', 'lang1', 'lang2']
const managedPreferences = (extensionManifest as { preferences?: ManifestPreference[] }).preferences?.filter(preference => preference.type === 'dropdown' && preferenceNames.includes(String(preference.name))) ?? []
let showingPreferenceSetup = extensionId === 'google-translate' && process.env.TRUSTED_RAYCAST_PREFERENCES_CONFIGURED === '0'
let preferencesRoot: React.ReactElement
const PreferencesSetup = (): React.ReactElement => {
  const defaults = getPreferenceValues<Record<string, boolean | string>>()
  const submit = async (values: Record<string, unknown>): Promise<void> => {
    const next = extensionId === 'kaomoji-search'
      ? { displayMode: String(values.displayMode ?? defaults.displayMode), primaryAction: String(values.primaryAction ?? defaults.primaryAction) }
      : { ...defaults, langFrom: String(values.langFrom ?? defaults.langFrom), lang1: String(values.lang1 ?? defaults.lang1), lang2: String(values.lang2 ?? defaults.lang2) }
    await savePreferenceValues(next)
    showingPreferenceSetup = false
    mount(undefined)
  }
  return React.createElement(Form, {
    actions: React.createElement(ActionPanel, null, React.createElement(Action.SubmitForm, { title: extensionId === 'google-translate' && process.env.TRUSTED_RAYCAST_PREFERENCES_CONFIGURED === '0' ? 'Continue' : 'Save Preferences', onSubmit: submit })),
  }, ...managedPreferences.map(preference => React.createElement(Form.Dropdown, { id: String(preference.name), key: String(preference.name), title: String(preference.title), value: String(defaults[String(preference.name)] ?? '') }, ...((Array.isArray(preference.data) ? preference.data : []) as Array<{ title?: unknown; value?: unknown }>).map(option => React.createElement(Form.Dropdown.Item, { key: String(option.value), title: String(option.title), value: String(option.value) })))))
}
preferencesRoot = React.createElement(PreferencesSetup)
const mount = (view: unknown): void => {
  renderer.updateContainer(view === undefined ? commandRoot : view, container, null, () => {
    searchHandler = (globalThis as { __trustedRaycastSearch?: (value: string) => void }).__trustedRaycastSearch
    if (view === undefined && typeof searchHandler !== 'function') throw new Error('trusted extension did not expose a search handler')
  })
}
registerNavigationRenderer(mount)
mount(showingPreferenceSetup ? preferencesRoot : undefined)
process.stdin.setEncoding('utf8')
let pending = ''
process.stdin.on('data', chunk => {
  pending += chunk
  if (Buffer.byteLength(pending) > 32768) throw new Error('Translate input exceeded its bound')
  let end: number
  while ((end = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, end); pending = pending.slice(end + 1)
    const message = JSON.parse(line)
    if (isTrustedRaycastNativeOutcome(message)) {
      if (message.extensionId !== extensionId) throw new Error('Unsupported native outcome identity')
      const waiting = nativePending.get(message.requestId)
      if (!waiting) continue
      clearTimeout(waiting.timer); nativePending.delete(message.requestId)
      if (message.succeeded) waiting.resolve(message.result); else waiting.reject(new Error(message.message))
      continue
    }
    if (!isTrustedRaycastViewEvent(message) || message.extensionId !== extensionId || message.sessionId !== sessionId || message.generation !== generation) throw new Error('Unsupported Translate event')
    if (message.kind === 'searchChanged') {
      querySequence++
      if (message.value === queryText) emit()
      else { advanceQuery(message.value); searchHandler?.(message.value) }
      continue
    }
    if (message.kind === 'navigation') {
      if (message.value !== 'language:pop') throw new Error('Unsupported Translate navigation')
      popView()
      continue
    }
    if (message.kind === 'fieldChanged') {
      const callback = message.revision === revision ? fieldHandles.get(message.eventId) : undefined
      if (typeof callback === 'function') callback(message.value!)
      continue
    }
    if (message.kind !== 'action') throw new Error('Unsupported Translate event')
    const callback = message.revision === revision ? handles.get(message.value) : undefined
    const outcome = (succeeded: boolean, text: string) => process.stdout.write(`${JSON.stringify({ type: 'outcome', extensionId, sessionId, generation, revision, eventId: message.eventId, succeeded, message: text })}\n`)
    if (!callback || activeAction) { outcome(false, 'Translate action is stale or busy'); continue }
    activeAction = { eventId: message.eventId, revision: message.revision }
    Promise.resolve().then(callback).then(() => outcome(true, ''), error => outcome(false, String(error).slice(0, 512))).finally(() => { activeAction = undefined })
  }
})
process.stdin.on('end', () => process.exit(0))
