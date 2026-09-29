import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
// @ts-expect-error React 19/reconciler are supplied by the verified private runtime.
import Reconciler from 'react-reconciler'
// @ts-expect-error Built beside this child and loaded as a single instance by command imports.
import * as api from './api.mjs'
import { createTrustedRaycastLineReader, TRUSTED_RAYCAST_INPUT_FRAME_BYTES } from './trusted-raycast-contract.ts'

type Node = { type: string; props: Record<string, unknown>; children: Array<Node | string> }
const root: Node = { type: 'root', props: {}, children: [] }
const extensionId = process.env.TOCKTEAM_USER_RAYCAST_ID!
const sessionId = process.env.TOCKTEAM_USER_RAYCAST_SESSION!
const command = process.env.TOCKTEAM_USER_RAYCAST_COMMAND!
let revision = -1
let ready = false
let handles = new Map<string, () => unknown>()
let activeAction = false
console.log = (...values: unknown[]) => console.error(...values)
const send = (value: object): void => { process.stdout.write(`${JSON.stringify(value)}\n`) }
const serialize = (value: Node | string): unknown => {
  if (typeof value === 'string') return value
  const props: Record<string, string | number | boolean | null> = {}
  for (const [key, entry] of Object.entries(value.props)) {
    if (key !== 'children' && (entry === null || typeof entry === 'string' || typeof entry === 'boolean' || typeof entry === 'number' && Number.isFinite(entry))) props[key] = entry
  }
  if (value.type === 'raycast-action' && typeof value.props.onAction === 'function') {
    const id = `action-${handles.size}`
    handles.set(id, value.props.onAction as () => unknown)
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
api.configureCompatibility({
  native: async () => { throw new Error('This Raycast native effect is unsupported for user extensions') },
  selection: async () => { throw new Error('Selected text is unsupported for user extensions') },
  toast: (toast: object) => send({ type: 'toast', extensionId, sessionId, revision, ...toast }),
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
const Command = imported.default
if (typeof Command !== 'function') throw new Error('Selected command has no renderable default export')
let searchHandler: ((value: string) => void) | undefined
const mount = (view?: unknown): void => renderer.updateContainer(view ?? React.createElement(Command), container, null, () => {
  searchHandler = (globalThis as { __trustedRaycastSearch?: (value: string) => void }).__trustedRaycastSearch
})
api.registerNavigationRenderer(mount)
mount()
process.stdin.setEncoding('utf8')
const readLines = createTrustedRaycastLineReader(TRUSTED_RAYCAST_INPUT_FRAME_BYTES)
process.stdin.on('data', (chunk: string) => {
  for (const line of readLines(chunk)) {
    const event = JSON.parse(line) as { type?: string; revision?: number; eventId?: string; kind?: string; value?: string }
    if (event.type !== 'event' || event.revision !== revision) throw new Error('Stale user extension event')
    if (event.kind === 'searchChanged') {
      if (typeof event.value !== 'string' || event.value.length > 16384) throw new Error('Invalid search input')
      if (event.value !== api.queryText) { api.advanceQuery(event.value); searchHandler?.(event.value) }
      continue
    }
    const action = event.kind === 'action' && typeof event.eventId === 'string' ? handles.get(event.eventId) : undefined
    if (!action || activeAction) throw new Error('Stale or busy user extension action')
    activeAction = true
    const actionRevision = revision
    Promise.resolve().then(action).then(() => send({ type: 'outcome', extensionId, sessionId, revision: actionRevision, eventId: event.eventId, succeeded: true, message: '' }), error => send({ type: 'outcome', extensionId, sessionId, revision: actionRevision, eventId: event.eventId, succeeded: false, message: String(error).slice(0, 512) })).finally(() => { activeAction = false })
  }
})
process.stdin.on('end', () => process.exit(0))
