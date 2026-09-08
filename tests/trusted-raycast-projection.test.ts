import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectTrustedRaycastProjection, isTrustedRaycastViewMessage, type TrustedRaycastViewNode } from '../src/trusted-raycast-contract.ts'
import { projectTrustedRaycastRoot, type TrustedRaycastProjectionNode } from '../src/trusted-raycast-projection.ts'

const actions = (prefix: string, count = 4): TrustedRaycastProjectionNode => ({
  type: 'raycast-action-panel', props: {}, children: Array.from({ length: count }, (_, index) => ({ type: 'raycast-action', props: { onAction: () => undefined, title: `${prefix}-${index}` }, children: [] })),
})
const item = (type: 'raycast-grid-item' | 'raycast-list-item', index: number, actionCount = 4): TrustedRaycastProjectionNode => ({
  type, props: type === 'raycast-list-item' ? { accessories: '[]', selected: false, subtitle: '', title: `item-${index}` } : { contentDark: 'dark', contentLight: 'light', title: `item-${index}` }, children: [actions(`item-${index}`, actionCount)],
})
const section = (type: 'raycast-grid-item' | 'raycast-list-item', title: string, start: number, count: number): TrustedRaycastProjectionNode => ({ type: 'raycast-section', props: { subtitle: String(count), title }, children: Array.from({ length: count }, (_, index) => item(type, start + index)) })
const tree = (type: 'raycast-grid-item' | 'raycast-list-item', counts: number[]): TrustedRaycastProjectionNode => ({ type: 'root', props: { navigationDepth: 0, preferenceSetup: false, queryCurrent: true, querySequence: 0, searchable: true, searchEventId: 'search' }, children: [{ type: type === 'raycast-list-item' ? 'raycast-list' : 'raycast-grid', props: { isLoading: false, searchBarPlaceholder: 'Search by name...', throttle: true }, children: counts.map((count, index) => section(type, `section-${index}`, counts.slice(0, index).reduce((sum, value) => sum + value, 0), count)) }] })
const nodes = (root: TrustedRaycastProjectionNode): TrustedRaycastProjectionNode[] => [root, ...root.children.flatMap(child => typeof child === 'string' ? [] : nodes(child))]

function serialize(root: TrustedRaycastProjectionNode): TrustedRaycastViewNode {
  let handle = 0
  const visit = (node: TrustedRaycastProjectionNode): TrustedRaycastViewNode => ({
    type: node.type,
    props: Object.fromEntries(Object.entries(node.props).flatMap(([key, value]) => key === 'onAction' ? [] : [[key, value]]).concat(node.type === 'raycast-action' && typeof node.props.onAction === 'function' ? [['actionEventId', `action-${handle++}`]] : [])) as TrustedRaycastViewNode['props'],
    children: node.children.map(child => typeof child === 'string' ? child : visit(child)),
  })
  return visit(root)
}

for (const type of ['raycast-list-item', 'raycast-grid-item'] as const) {
  test(`post-reconciliation ${type} projection is deterministic at transient and worst-state bounds`, () => {
    const original = tree(type, [17, 16, 44]) // Favorite + Recent + grouped transient: 77 items / 308 actions.
    const projected = projectTrustedRaycastRoot(original, 'kaomoji-search')
    const projectedAgain = projectTrustedRaycastRoot(projected, 'kaomoji-search')
    const projectedNodes = nodes(projected)
    assert.equal(projectedNodes.filter(node => node.type === type).length, 64)
    assert.equal(projectedNodes.filter(node => node.type === 'raycast-action').length, 256)
    assert.deepEqual(projectedNodes.filter(node => node.type === 'raycast-section').map(node => [node.props.title, node.children.length]), [['section-0', 17], ['section-1', 16], ['section-2', 31]])
    assert.deepEqual(projectedAgain, projected, 'projection is idempotent')
    assert.equal(nodes(original).filter(node => node.type === type).length, 77, 'projection mutated the reconciler tree')
    const wireRoot = serialize(projected)
    assert.equal(isTrustedRaycastViewMessage({ type: 'patch', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 1, root: wireRoot, status: 'ready' }), type === 'raycast-list-item', 'List is contract-valid; Grid content validation is independently strict')
    const metrics = inspectTrustedRaycastProjection(wireRoot)
    assert.deepEqual({ actions: metrics.actionableHandles, items: metrics.itemNodes }, { actions: 256, items: 64 })
  })
}

test('projection removes overflow-only sections, extra item actions, and their handles', () => {
  const root = tree('raycast-list-item', [64, 13])
  ;(root.children[0] as TrustedRaycastProjectionNode).children[0] = section('raycast-list-item', 'section-0', 0, 64)
  ;((root.children[0] as TrustedRaycastProjectionNode).children[0] as TrustedRaycastProjectionNode).children[0] = item('raycast-list-item', 0, 5)
  const projected = projectTrustedRaycastRoot(root, 'kaomoji-search')
  const projectedNodes = nodes(projected)
  assert.equal(projectedNodes.filter(node => node.type === 'raycast-section').length, 1)
  assert.equal(projectedNodes.filter(node => node.type === 'raycast-action').length, 256)
  assert.equal(projectedNodes.some(node => node.props.title === 'item-0-4'), false, 'pruned action cannot receive an event handle')
})

test('loading, empty, and managed form roots survive without collection synthesis', () => {
  for (const child of [
    { type: 'raycast-list', props: { isLoading: true }, children: [] },
    { type: 'raycast-list', props: { isLoading: false }, children: [{ type: 'raycast-empty', props: { title: 'No Results' }, children: [] }] },
    { type: 'raycast-form', props: {}, children: [{ type: 'raycast-action', props: { onAction: () => undefined, title: 'Save Preferences' }, children: [] }] },
  ] as TrustedRaycastProjectionNode[]) {
    const root: TrustedRaycastProjectionNode = { type: 'root', props: {}, children: [child] }
    assert.deepEqual(projectTrustedRaycastRoot(root, 'kaomoji-search'), root)
  }
  const google = tree('raycast-list-item', [77])
  assert.equal(projectTrustedRaycastRoot(google, 'google-translate'), google, 'Translate projection remains unchanged')
})
