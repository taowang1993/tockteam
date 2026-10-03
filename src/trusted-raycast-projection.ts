export { createTranslateCollectionProjection } from './trusted-raycast-translate-collections.ts'

export type TrustedRaycastProjectionNode = {
  type: string
  props: Record<string, unknown>
  children: Array<TrustedRaycastProjectionNode | string>
}

/** React placement moves a mounted instance instead of adding another reference to it. */
export function appendTrustedRaycastChild(parent: TrustedRaycastProjectionNode, child: TrustedRaycastProjectionNode | string): void {
  const index = typeof child === 'string' ? -1 : parent.children.indexOf(child)
  if (index >= 0) parent.children.splice(index, 1)
  parent.children.push(child)
}

export function insertTrustedRaycastChild(parent: TrustedRaycastProjectionNode, child: TrustedRaycastProjectionNode | string, before: TrustedRaycastProjectionNode | string): void {
  if (typeof child !== 'string' && child === before) return
  const index = typeof child === 'string' ? -1 : parent.children.indexOf(child)
  if (index >= 0) parent.children.splice(index, 1)
  const anchor = parent.children.indexOf(before)
  if (anchor < 0) throw new Error('Compatibility placement anchor is unavailable')
  parent.children.splice(anchor, 0, child)
}

const itemType = (type: string): boolean => type === 'raycast-list-item' || type === 'raycast-grid-item'
const contains = (node: TrustedRaycastProjectionNode, predicate: (type: string) => boolean): boolean => predicate(node.type) || node.children.some(child => typeof child !== 'string' && contains(child, predicate))

/** Clone and bound the exact Kaomoji tree after reconciliation; never mutate source state. */
export function projectTrustedRaycastRoot(root: TrustedRaycastProjectionNode, extensionId: string): TrustedRaycastProjectionNode {
  if (extensionId !== 'kaomoji-search') return root
  let items = 0; let actions = 0
  const project = (node: TrustedRaycastProjectionNode, itemActions?: { value: number }): TrustedRaycastProjectionNode | undefined => {
    let currentItem = itemActions
    if (itemType(node.type)) {
      if (items >= 64) return undefined
      items++
      currentItem = { value: 0 }
    }
    if (node.type === 'raycast-action') {
      if (node.children.length !== 0 || actions >= 256 || (currentItem && currentItem.value >= 4)) return undefined
      actions++
      if (currentItem) currentItem.value++
    }
    const children: Array<TrustedRaycastProjectionNode | string> = []
    for (const child of node.children) {
      if (typeof child === 'string') children.push(child)
      else {
        const projected = project(child, currentItem)
        if (projected) children.push(projected)
      }
    }
    if (node.type === 'raycast-section' && contains(node, itemType) && !children.some(child => typeof child !== 'string' && contains(child, itemType))) return undefined
    if ((node.type === 'raycast-action-panel' || node.type === 'raycast-action-section') && contains(node, type => type === 'raycast-action') && !children.some(child => typeof child !== 'string' && contains(child, type => type === 'raycast-action'))) return undefined
    return { type: node.type, props: { ...node.props }, children }
  }
  return project(root) ?? { type: 'root', props: {}, children: [] }
}
