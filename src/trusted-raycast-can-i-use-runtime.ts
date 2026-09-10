import { join } from 'node:path'
import { readTrustedRaycastFile } from './trusted-raycast-artifact-admission.ts'
import { decodeTrustedRaycastCanIUseData, TRUSTED_RAYCAST_CAN_I_USE_ASSET } from './trusted-raycast-can-i-use-assets.ts'
import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'
import { prepareTrustedRaycastCanIUseRoot } from './trusted-raycast-can-i-use-command.ts'
import { TrustedRaycastCanIUseActionRegistry, type TrustedRaycastCanIUseActionHandle } from './trusted-raycast-can-i-use-actions.ts'
import { inspectTrustedRaycastProjection, type TrustedRaycastViewNode } from './trusted-raycast-contract.ts'

/** Main-owned asset loading; never exposed as a renderer-selected path operation. */
export function loadTrustedRaycastCanIUseData(directory: string) {
  try {
    const pin = TRUSTED_RAYCAST_CAN_I_USE_ASSET
    return decodeTrustedRaycastCanIUseData(readTrustedRaycastFile(join(directory, pin.file), pin.bytes))
  } catch { return failTrustedRaycastCanIUse('DATA_UNAVAILABLE') }
}

/** One Host-owned search lifecycle. No renderer-supplied snapshot, workspace or feature table. */
export function createTrustedRaycastCanIUseRuntime(directory: string, sessionId: string, preferences: unknown) {
  const data = loadTrustedRaycastCanIUseData(directory)
  const context = Object.freeze({ extensionId: 'can-i-use', command: 'index', sessionId, workspaceId: 'no-workspace',
    snapshotIdentity: TRUSTED_RAYCAST_CAN_I_USE_ASSET.sha256, snapshotGeneration: 0 })
  const registry = new TrustedRaycastCanIUseActionRegistry()
  let prepared = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, '')
  let searchHandle: TrustedRaycastCanIUseActionHandle | undefined
  return Object.freeze({
    context, preferences: prepared.preferences, initialMessage: prepared.message,
    publish(root: TrustedRaycastViewNode): void {
      try {
        const metrics = inspectTrustedRaycastProjection(root)
        if (metrics.itemNodes > 64 || metrics.actionNodes > 128 || metrics.actionableHandles !== 0 || metrics.rootBytes > 128 * 1024) failTrustedRaycastCanIUse('RENDER_INVALID')
        const expected = JSON.parse(prepared.message) as { matchCount: number; totalCount: number }
        if (root.props.visibleCount !== prepared.rows.length || root.props.matchCount !== expected.matchCount || root.props.totalCount !== expected.totalCount) failTrustedRaycastCanIUse('RENDER_INVALID')
        const items: TrustedRaycastViewNode[] = []
        const visit = (node: TrustedRaycastViewNode): void => {
          if (node.type === 'raycast-list-item') items.push(node)
          for (const child of node.children) if (typeof child !== 'string') visit(child)
        }
        visit(root)
        if (items.length !== prepared.rows.length || items.some((item, index) => item.props.title !== prepared.rows[index]!.title || item.props.featureName !== prepared.rows[index]!.slug)) failTrustedRaycastCanIUse('RENDER_INVALID')
        searchHandle = registry.publishRoot(prepared.ticket, prepared.rows, ['search']).find(handle => handle.kind === 'search')!
      } catch (error) {
        searchHandle = undefined
        registry.startError(context)
        throw error
      }
    },
    search(query: unknown): string {
      if (!searchHandle) return failTrustedRaycastCanIUse('SNAPSHOT_STALE')
      registry.authorize(searchHandle, { ...context, revision: prepared.ticket.revision, depth: 0, row: null, feature: null, kind: 'search' })
      searchHandle = undefined
      prepared = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, query)
      return prepared.message
    },
    close(): void { searchHandle = undefined; registry.close(context) },
  })
}
