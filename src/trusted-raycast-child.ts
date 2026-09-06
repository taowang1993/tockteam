import React from 'react'
// @ts-expect-error Build-time first-party alias, shared with unchanged source.
import { configureCompatibility, advanceQuery, queryText } from '@raycast/api'
// @ts-expect-error Build-time first-party contract alias.
import { isTrustedRaycastNativeOutcome, isTrustedRaycastViewEvent } from '@tockteam/trusted-raycast-child-contract'
// @ts-expect-error The approved child artifact supplies this runtime-only singleton.
import Reconciler from 'react-reconciler'
// @ts-expect-error The runtime replaces this source-preserving path during extraction.
import Translate from '/tmp/trusted-raycast-source/src/translate'

type Node = { type: string; props: Record<string, unknown>; children: Array<Node | string> }
const rootNode: Node = { type: 'root', props: {}, children: [] }
let handles = new Map<string, () => unknown>()
const serialize = (node: Node | string): unknown => {
  if (typeof node === 'string') return node
  const props = Object.fromEntries(Object.entries(node.props).filter(([key, value]) => key !== 'children' && typeof value !== 'function' && (typeof value !== 'object' || value === null)))
  if (node.type === 'raycast-action' && !props.unavailable && typeof node.props.onAction === 'function') {
    const id = `action-${handles.size}`
    handles.set(id, node.props.onAction as () => unknown)
    props.actionEventId = id
  }
  return { type: node.type, props, children: node.children.map(serialize) }
}
const sessionId = process.env.TRUSTED_RAYCAST_SESSION_ID!
const generation = process.env.TRUSTED_RAYCAST_GENERATION!
let revision = -1
let querySequence = 0
let ready = false
let searchHandler: ((value: string) => void) | undefined
const emit = () => {
  handles = new Map()
  rootNode.props.querySequence = querySequence
  const root = serialize(rootNode)
  process.stdout.write(`${JSON.stringify({ type: ready ? 'patch' : 'ready', sessionId, generation, revision: ++revision, root, ...(ready ? { status: 'ready' } : {}) })}\n`)
  ready = true
}
let activeAction: { eventId: string; revision: number } | undefined
let nativeSequence = 0
const nativePending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
configureCompatibility({
  native: (request: { kind: 'copy'; text: string } | { kind: 'openGoogleTranslate'; url: string }) => new Promise<void>((resolve, reject) => {
    if (!activeAction) { reject(new Error('Native effect requires a current source action')); return }
    const requestId = `native-${++nativeSequence}`
    const timer = setTimeout(() => { nativePending.delete(requestId); reject(new Error('Native action timed out')) }, 10000)
    nativePending.set(requestId, { resolve, reject, timer })
    process.stdout.write(`${JSON.stringify({ type: 'native', sessionId, generation, ...activeAction, requestId, ...request })}\n`)
  }),
  toast: (toast: { title: string; message: string; style: string }) => {
    process.stdout.write(`${JSON.stringify({ type: 'toast', sessionId, generation, revision, querySequence, ...toast })}\n`)
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
  process.stdout.write(`${JSON.stringify({ type: 'error', sessionId, generation, revision: ++revision, message: String(error).slice(0, 128) })}\n`)
}
const container = renderer.createContainer(rootNode, 0, null, false, null, '', reportError, reportError, reportError)
renderer.updateContainer(React.createElement(Translate), container, null, () => {
  searchHandler = (globalThis as { __trustedRaycastSearch?: (value: string) => void }).__trustedRaycastSearch
  if (typeof searchHandler !== 'function') throw new Error('translate List did not expose search handler')
})
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
      const waiting = nativePending.get(message.requestId)
      if (!waiting) continue
      clearTimeout(waiting.timer); nativePending.delete(message.requestId)
      if (message.succeeded) waiting.resolve(); else waiting.reject(new Error(message.message))
      continue
    }
    if (!isTrustedRaycastViewEvent(message) || message.sessionId !== sessionId || message.generation !== generation) throw new Error('Unsupported Translate event')
    if (message.kind === 'searchChanged') {
      querySequence++
      if (message.value === queryText) emit()
      else { advanceQuery(message.value); searchHandler?.(message.value) }
      continue
    }
    if (message.kind !== 'action') throw new Error('Unsupported Translate event')
    const callback = message.revision === revision ? handles.get(message.value) : undefined
    const outcome = (succeeded: boolean, text: string) => process.stdout.write(`${JSON.stringify({ type: 'outcome', sessionId, generation, revision, eventId: message.eventId, succeeded, message: text })}\n`)
    if (!callback || activeAction) { outcome(false, 'Translate action is stale or busy'); continue }
    activeAction = { eventId: message.eventId, revision: message.revision }
    Promise.resolve().then(callback).then(() => outcome(true, ''), error => outcome(false, String(error).slice(0, 512))).finally(() => { activeAction = undefined })
  }
})
process.stdin.on('end', () => process.exit(0))
