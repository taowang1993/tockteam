import React from 'react'
// @ts-expect-error The approved child artifact supplies this runtime-only singleton.
import Reconciler from 'react-reconciler'
// @ts-expect-error The runtime replaces this source-preserving path during extraction.
import Translate from '/tmp/trusted-raycast-source/src/translate'

type Node = { type: string; props: Record<string, unknown>; children: Array<Node | string> }
const rootNode: Node = { type: 'root', props: {}, children: [] }
const serialize = (node: Node | string): unknown => typeof node === 'string' ? node : ({ type: node.type, props: Object.fromEntries(Object.entries(node.props).filter(([key, value]) => key !== 'children' && typeof value !== 'function' && (typeof value !== 'object' || value === null))), children: node.children.map(serialize) })
const sessionId = process.env.TRUSTED_RAYCAST_SESSION_ID!
const generation = process.env.TRUSTED_RAYCAST_GENERATION!
let revision = -1
let ready = false
let searchHandler: ((value: string) => void) | undefined
const emit = () => {
  const root = serialize(rootNode)
  process.stdout.write(`${JSON.stringify({ type: ready ? 'patch' : 'ready', sessionId, generation, revision: ++revision, root, ...(ready ? { status: 'ready' } : {}) })}\n`)
  ready = true
}
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
    if (message.kind !== 'searchChanged' || typeof message.value !== 'string' || Buffer.byteLength(message.value) > 16384) throw new Error('Unsupported Translate event')
    searchHandler?.(message.value)
  }
})
process.stdin.on('end', () => process.exit(0))
