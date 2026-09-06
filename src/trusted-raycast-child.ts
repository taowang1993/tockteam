import React from 'react'
// @ts-expect-error The approved child artifact supplies this runtime-only singleton.
import Reconciler from 'react-reconciler'
// @ts-expect-error The tracer rewrites this source-preserving path inside its private extraction.
import Translate from '/tmp/trusted-raycast-source/src/translate'

type Node = { type: string; props: Record<string, unknown>; children: Array<Node | string> }
const rootNode: Node = { type: 'root', props: {}, children: [] }
const serialize = (node: Node | string): unknown => typeof node === 'string' ? node : ({ type: node.type, props: Object.fromEntries(Object.entries(node.props).filter(([key, value]) => key !== 'children' && typeof value !== 'function' && typeof value !== 'object')), children: node.children.map(serialize) })
const input = 'TockTeam compatibility tracer: hello world'
let succeeded = false
let deadline: ReturnType<typeof setTimeout> | undefined
const findItems = (node: Node): Node[] => [
  ...(node.type === 'raycast-list-item' ? [node] : []),
  ...node.children.filter((child): child is Node => typeof child !== 'string').flatMap(findItems),
]
const emit = () => {
  const projection = serialize(rootNode)
  process.stdout.write(`VIEW ${JSON.stringify(projection)}\n`)
  const translated = findItems(rootNode).map(item => item.props.title).find(title => typeof title === 'string' && title !== input && /[\u3400-\u9fff]/u.test(title))
  if (translated && !succeeded) {
    succeeded = true
    if (deadline) clearTimeout(deadline)
    process.stdout.write(`RESULT ${JSON.stringify({ input, translated, target: 'zh-CN' })}\n`)
  }
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
const container = renderer.createContainer(rootNode, 0, null, false, null, '', console.error, console.error, console.error)
renderer.updateContainer(React.createElement(Translate), container, null, () => {
  process.stdout.write('READY\n')
  setTimeout(() => {
    const search = (globalThis as any).__trustedRaycastSearch
    if (typeof search !== 'function') throw new Error('translate List did not expose search handler')
    if (process.env.TRUSTED_RAYCAST_FORCE_NO_RESULT !== '1') search(input)
  }, 25)
})
deadline = setTimeout(() => {
  if (!succeeded) { process.stderr.write('trusted Raycast tracer deadline: no validated translation result\\n'); process.exitCode = 1 }
}, Number(process.env.TRUSTED_RAYCAST_CHILD_DEADLINE_MS ?? 15000))
