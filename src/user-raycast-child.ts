import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
// @ts-expect-error React 19/reconciler are supplied by the verified private runtime.
import Reconciler from 'react-reconciler'
// @ts-expect-error Built beside this child and loaded as a single instance by command imports.
import * as api from './api.mjs'
import { createTrustedRaycastLineReader, TRUSTED_RAYCAST_INPUT_FRAME_BYTES } from './trusted-raycast-contract.ts'
import { createUserRaycastStorage } from './user-raycast-storage.ts'
import { isUserRaycastOAuthCleanupCounts, isUserRaycastOAuthCleanupReasons } from './user-raycast-contract.ts'

type Node = { type: string; props: Record<string, unknown>; children: Array<Node | string> }
const root: Node = { type: 'root', props: {}, children: [] }
const extensionId = process.env.TOCKTEAM_USER_RAYCAST_ID!
const sessionId = process.env.TOCKTEAM_USER_RAYCAST_SESSION!
const command = process.env.TOCKTEAM_USER_RAYCAST_COMMAND!
const mode = process.env.TOCKTEAM_USER_RAYCAST_MODE
let revision = -1
let ready = false
let handles = new Map<string, () => unknown>()
let activeAction: { eventId: string; revision: number } | undefined
let nativeSequence = 0
const nativePending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
console.log = (...values: unknown[]) => console.error(...values)
const send = (value: object): void => { process.stdout.write(`${JSON.stringify(value)}\n`) }
const serialize = (value: Node | string): unknown => {
  if (typeof value === 'string') return value
  const props: Record<string, string | number | boolean | null> = {}
  for (const [key, entry] of Object.entries(value.props)) {
    if (key !== 'children' && (entry === null || typeof entry === 'string' || typeof entry === 'boolean' || typeof entry === 'number' && Number.isFinite(entry))) props[key] = entry
  }
  if ((value.type === 'raycast-action' || value.type === 'raycast-menu-item') && typeof value.props.onAction === 'function') {
    const id = `action-${handles.size}`
    const action = value.props.onAction as (event?: { type: 'left-click' }) => unknown
    handles.set(id, value.type === 'raycast-menu-item' ? () => action({ type: 'left-click' }) : () => action())
    props.actionEventId = id
  }
  return { type: value.type, props, children: value.children.map(serialize) }
}
const emit = (): void => {
  handles = new Map()
  root.props.searchable = api.viewSearchable()
  const projection = serialize(root)
  send({ type: ready ? 'patch' : 'ready', extensionId, sessionId, revision: ++revision, root: projection })
  ready = true
}
const reportError = (error: unknown): void => send({ type: 'error', extensionId, sessionId, revision: ++revision, message: String(error).slice(0, 512) })
const storage = createUserRaycastStorage(process.env.TOCKTEAM_USER_RAYCAST_STATE!)
api.configureCompatibility({
  authUrl: (url: string) => send({ type: 'auth-url', extensionId, sessionId, revision: Math.max(0, revision), url }),
  native: (request: { kind: string; text?: string }) => new Promise<void>((resolve, reject) => {
    if (request.kind !== 'copy') { reject(new Error(`Raycast native effect ${request.kind} is unsupported for user extensions`)); return }
    if (!activeAction || typeof request.text !== 'string' || Buffer.byteLength(request.text) > 131072) { reject(new Error('Copy requires a current approved action and bounded text')); return }
    const requestId = `native-${++nativeSequence}`
    const timer = setTimeout(() => { nativePending.delete(requestId); reject(new Error('Copy timed out')) }, 10000)
    nativePending.set(requestId, { resolve, reject, timer })
    send({ type: 'native', extensionId, sessionId, revision: activeAction.revision, eventId: activeAction.eventId, requestId, kind: 'copy', text: request.text })
  }),
  selection: async () => { throw new Error('Selected text is unsupported for user extensions') },
  toast: (toast: object) => send({ type: 'toast', extensionId, sessionId, revision, ...toast }),
  cache: storage.cache,
  storage,
  hud: (message: string) => send({ type: 'toast', extensionId, sessionId, revision, title: message.slice(0, 512), message: '', style: 'success' }),
})
if (extensionId === 'linear') process.once('SIGTERM', () => {
  void api.revokeUserRaycastOAuthTokens().then(() => process.exit(0), (error: unknown) => {
    const reasons = error instanceof Error && isUserRaycastOAuthCleanupReasons(error.cause) ? [...error.cause] : ['unknown']
    const counts = error instanceof Error && isUserRaycastOAuthCleanupReasons(error.cause) && 'cleanupCounts' in error && isUserRaycastOAuthCleanupCounts(error.cleanupCounts)
      && error.cleanupCounts.failed >= reasons.length ? { ...error.cleanupCounts } : undefined
    // Flush only allowlisted codes and counts on the private diagnostic pipe before exiting.
    process.stderr.write(`${JSON.stringify({ type: 'oauth-cleanup', extensionId, sessionId, reasons, ...(counts ? { counts } : {}) })}\n`, () => process.exit(1))
  })
})
const hostConfig: any = {
  supportsMutation: true, supportsPersistence: false, supportsHydration: false, isPrimaryRenderer: false, now: Date.now,
  getRootHostContainer: () => root, getRootHostContext: () => root, getChildHostContext: (parent: unknown) => parent,
  prepareForCommit: () => null, resetAfterCommit: emit,
  createInstance: (type: string, props: Record<string, unknown>) => ({ type, props, children: [] }),
  createTextInstance: (text: string) => text,
  appendInitialChild: (parent: Node, child: Node | string) => parent.children.push(child),
  appendChild: (parent: Node, child: Node | string) => parent.children.push(child),
  appendChildToContainer: (parent: Node, child: Node | string) => parent.children.push(child),
  insertBefore: (parent: Node, child: Node | string, before: Node | string) => parent.children.splice(parent.children.indexOf(before), 0, child),
  insertInContainerBefore: (parent: Node, child: Node | string, before: Node | string) => parent.children.splice(parent.children.indexOf(before), 0, child),
  removeChild: (parent: Node, child: Node | string) => { const index = parent.children.indexOf(child); if (index >= 0) parent.children.splice(index, 1) },
  removeChildFromContainer: (parent: Node, child: Node | string) => { const index = parent.children.indexOf(child); if (index >= 0) parent.children.splice(index, 1) },
  clearContainer: (parent: Node) => { parent.children.length = 0 }, finalizeInitialChildren: () => false,
  prepareUpdate: () => true, commitUpdate: (instance: Node, _type: string, _old: unknown, props: Record<string, unknown>) => { instance.props = props }, commitTextUpdate: () => {},
  shouldSetTextContent: () => false, getPublicInstance: (node: Node) => node, getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: () => {}, afterActiveInstanceBlur: () => {}, prepareScopeUpdate: () => {}, getInstanceFromScope: () => null,
  detachDeletedInstance: () => {}, resolveUpdatePriority: () => 1, getCurrentUpdatePriority: () => 1, setCurrentUpdatePriority: () => {},
  getCurrentEventPriority: () => 1, maySuspendCommit: () => false, preloadInstance: () => true, startSuspendingCommit: () => {},
  suspendInstance: () => {}, waitForCommitToBeReady: () => null, commitMount: () => {},
}
const renderer = Reconciler(hostConfig)
const container = renderer.createContainer(root, 0, null, false, null, '', reportError, reportError, reportError)
const apiUrl = pathToFileURL(join(process.cwd(), 'api.mjs')).href
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@raycast/api') return { url: apiUrl, shortCircuit: true }
  return nextResolve(specifier, context)
} })
// Every imported byte is from an approved digest snapshot. No build or source probe runs before approval.
const imported = await import(pathToFileURL(join(process.cwd(), 'source', `${command}.js`)).href)
const Command = typeof imported.default === 'function' ? imported.default : imported.default?.default
if (typeof Command !== 'function') throw new Error('Selected command has no callable default export')
if (mode !== 'view' && mode !== 'no-view' && mode !== 'menu-bar') throw new Error('Unsupported command mode')
let searchHandler: ((value: string) => void) | undefined
if (mode === 'view' || mode === 'menu-bar') {
  const mount = (view?: unknown): void => renderer.updateContainer(view ?? React.createElement(Command), container, null, () => {
    searchHandler = (globalThis as { __trustedRaycastSearch?: (value: string) => void }).__trustedRaycastSearch
  })
  if (mode === 'view') api.registerNavigationRenderer(mount)
  mount()
} else {
  activeAction = { eventId: 'run', revision: 0 }
  emit()
  Promise.resolve().then(() => Command({ arguments: {} })).then(() => send({ type: 'outcome', extensionId, sessionId, revision: 0, eventId: 'run', succeeded: true, message: '' }), error => send({ type: 'outcome', extensionId, sessionId, revision: 0, eventId: 'run', succeeded: false, message: String(error).slice(0, 512) })).finally(() => { activeAction = undefined })
}
process.stdin.setEncoding('utf8')
const readLines = createTrustedRaycastLineReader(TRUSTED_RAYCAST_INPUT_FRAME_BYTES)
process.stdin.on('data', (chunk: string) => {
  for (const line of readLines(chunk)) {
    const event = JSON.parse(line) as { type?: string; revision?: number; eventId?: string; kind?: string; value?: string; requestId?: string; succeeded?: boolean; message?: string }
    if (event.type === 'native-result') {
      const waiting = typeof event.requestId === 'string' ? nativePending.get(event.requestId) : undefined
      if (!waiting || event.revision !== activeAction?.revision || event.eventId !== activeAction?.eventId || typeof event.succeeded !== 'boolean') throw new Error('Stale native outcome')
      clearTimeout(waiting.timer); nativePending.delete(event.requestId!)
      if (event.succeeded) waiting.resolve(); else waiting.reject(new Error(event.message ?? 'Copy failed'))
      continue
    }
    if (event.type !== 'event' || event.revision !== revision) throw new Error('Stale user extension event')
    if (event.kind === 'searchChanged') {
      if (typeof event.value !== 'string' || event.value.length > 16384) throw new Error('Invalid search input')
      if (event.value !== api.queryText) { api.advanceQuery(event.value); searchHandler?.(event.value) }
      continue
    }
    const action = event.kind === 'action' && typeof event.eventId === 'string' ? handles.get(event.eventId) : undefined
    if (!action || activeAction) throw new Error('Stale or busy user extension action')
    activeAction = { eventId: event.eventId!, revision }
    const actionRevision = revision
    Promise.resolve().then(action).then(() => send({ type: 'outcome', extensionId, sessionId, revision: actionRevision, eventId: event.eventId, succeeded: true, message: '' }), error => send({ type: 'outcome', extensionId, sessionId, revision: actionRevision, eventId: event.eventId, succeeded: false, message: String(error).slice(0, 512) })).finally(() => { activeAction = undefined })
  }
})
process.stdin.on('end', () => process.exit(0))
