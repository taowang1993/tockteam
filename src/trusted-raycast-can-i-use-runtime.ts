import { join } from 'node:path'
import { readTrustedRaycastFile } from './trusted-raycast-artifact-admission.ts'
import { decodeTrustedRaycastCanIUseData, TRUSTED_RAYCAST_CAN_I_USE_ASSET } from './trusted-raycast-can-i-use-assets.ts'
import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'
import { prepareTrustedRaycastCanIUsePreferences } from './trusted-raycast-can-i-use-preferences.ts'
import { prepareTrustedRaycastCanIUseRoot } from './trusted-raycast-can-i-use-command.ts'
import { TrustedRaycastCanIUseActionRegistry, type TrustedRaycastCanIUseActionHandle, type TrustedRaycastCanIUseRevisionTicket } from './trusted-raycast-can-i-use-actions.ts'
import { inspectTrustedRaycastProjection, type TrustedRaycastViewNode } from './trusted-raycast-contract.ts'

/** Main-owned asset loading; never exposed as a renderer-selected path operation. */
export function loadTrustedRaycastCanIUseData(directory: string) {
  try {
    const pin = TRUSTED_RAYCAST_CAN_I_USE_ASSET
    return decodeTrustedRaycastCanIUseData(readTrustedRaycastFile(join(directory, pin.file), pin.bytes))
  } catch { return failTrustedRaycastCanIUse('DATA_UNAVAILABLE') }
}

/** One Host-owned search/detail lifecycle. No renderer-supplied snapshot, workspace or feature table. */
export function createTrustedRaycastCanIUseRuntime(directory: string, sessionId: string, preferences: unknown, initialQuery: unknown = '') {
  const data = loadTrustedRaycastCanIUseData(directory)
  const context = Object.freeze({ extensionId: 'can-i-use', command: 'index', sessionId, workspaceId: 'no-workspace',
    snapshotIdentity: TRUSTED_RAYCAST_CAN_I_USE_ASSET.sha256, snapshotGeneration: 0 })
  const registry = new TrustedRaycastCanIUseActionRegistry()
  let prepared = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, initialQuery)
  let searchHandle: TrustedRaycastCanIUseActionHandle | undefined
  let popHandle: TrustedRaycastCanIUseActionHandle | undefined
  let detail: { ticket: TrustedRaycastCanIUseRevisionTicket; data: ReturnType<typeof data.sourceDetail> } | undefined
  const actions = new Map<string, { handle: TrustedRaycastCanIUseActionHandle; row: number; kind: 'show-details' | 'open-browser' }>()
  const revoke = () => { searchHandle = undefined; popHandle = undefined; actions.clear() }
  const descendants = (root: TrustedRaycastViewNode, type: string): TrustedRaycastViewNode[] => [
    ...(root.type === type ? [root] : []), ...root.children.flatMap(child => typeof child === 'string' ? [] : descendants(child, type)),
  ]
  return Object.freeze({
    context, preferences: prepared.preferences, initialMessage: prepared.message,
    get query(): string { return JSON.parse(prepared.message).query },
    validatePreferences(value: unknown) { return prepareTrustedRaycastCanIUsePreferences(value, { canonicalTargets: data.canonicalTargets }).preferences },
    publish(root: TrustedRaycastViewNode): TrustedRaycastViewNode {
      try {
        revoke()
        const metrics = inspectTrustedRaycastProjection(root)
        if (metrics.itemNodes > 64 || metrics.actionNodes > 128 || metrics.actionableHandles !== 0 || metrics.rootBytes > 128 * 1024) failTrustedRaycastCanIUse('RENDER_INVALID')
        const expected = detail ? { matchCount: detail.data.agents.length, totalCount: detail.data.agents.length } : JSON.parse(prepared.message) as { matchCount: number; totalCount: number }
        const count = detail ? detail.data.agents.length : prepared.rows.length
        if (!detail && root.props.searchText !== JSON.parse(prepared.message).query) failTrustedRaycastCanIUse('RENDER_INVALID')
        if (root.props.navigationDepth !== (detail ? 1 : 0) || root.props.visibleCount !== count || root.props.matchCount !== expected.matchCount || root.props.totalCount !== expected.totalCount) failTrustedRaycastCanIUse('RENDER_INVALID')
        const items = descendants(root, 'raycast-list-item')
        if (items.length !== count || items.some((item, index) => detail
          ? item.props.title !== detail.data.agents[index]!.label
          : item.props.title !== prepared.rows[index]!.title || item.props.featureName !== prepared.rows[index]!.slug)) failTrustedRaycastCanIUse('RENDER_INVALID')
        const rowActions = items.map(item => descendants(item, 'raycast-action'))
        const titles = detail ? ['Open in Browser'] : ['Show Details', 'Open in Browser']
        if (metrics.actionNodes !== count * titles.length || rowActions.some(row => row.length !== titles.length || row.some((action, index) => action.props.title !== titles[index] || action.props.unavailable !== true))) failTrustedRaycastCanIUse('RENDER_INVALID')
        const handles = detail
          ? registry.publishDetail(detail.ticket, detail.data.agents.map(({ browser, label, sourceIndex }) => ({ browser, label, sourceIndex })), ['pop'])
          : registry.publishRoot(prepared.ticket, prepared.rows, ['search'])
        searchHandle = handles.find(handle => handle.kind === 'search')
        popHandle = handles.find(handle => handle.kind === 'pop')
        const bindings = new Map<TrustedRaycastViewNode, string>()
        for (const handle of handles) if ((handle.kind === 'show-details' || handle.kind === 'open-browser') && handle.row !== null) {
          actions.set(handle.id, { handle, row: handle.row, kind: handle.kind })
          bindings.set(rowActions[handle.row]![detail || handle.kind === 'show-details' ? 0 : 1]!, handle.id)
        }
        const project = (node: TrustedRaycastViewNode): TrustedRaycastViewNode => ({ ...node,
          props: bindings.has(node) ? { ...node.props, unavailable: false, actionEventId: bindings.get(node)! } : node.props,
          children: node.children.map(child => typeof child === 'string' ? child : project(child)),
        })
        const projected = project(root)
        return { ...projected, props: { ...projected.props, ...(popHandle ? { navigationEventId: popHandle.id } : {}) } }
      } catch (error) {
        revoke()
        registry.startError(context)
        throw error
      }
    },
    activate(id: string) {
      const stored = actions.get(id)
      if (!stored) return failTrustedRaycastCanIUse('SNAPSHOT_STALE')
      const feature = detail ? detail.data.feature.slug : prepared.rows[stored.row]!.slug
      const authentication = { ...context, revision: (detail?.ticket ?? prepared.ticket).revision, depth: detail ? 1 as const : 0 as const, row: stored.row, feature, kind: stored.kind }
      registry.authorize(stored.handle, authentication)
      // The URL is reconstructed from the selected pinned row, never from source or renderer text.
      if (stored.kind === 'open-browser') return { kind: 'open-browser' as const, url: `https://caniuse.com/${feature}` }
      if (detail) return failTrustedRaycastCanIUse('ACTION_DENIED')
      const row = prepared.rows[stored.row]!
      revoke()
      try {
        const selected = data.sourceDetail({ slug: row.slug, sourceIndex: row.sourceIndex })
        const ticket = registry.startDetailFromRoot(stored.handle, authentication, selected.agents.map(({ browser, label, sourceIndex }) => ({ browser, label, sourceIndex })))
        detail = { ticket, data: selected }
        const message = JSON.stringify({ type: 'can-i-use-detail', revision: ticket.revision, context, feature: row.slug, agents: selected.agents })
        if (Buffer.byteLength(message) > 32768) failTrustedRaycastCanIUse('LIMIT_EXCEEDED')
        return { kind: 'detail' as const, message }
      } catch (error) { registry.startError(context); throw error }
    },
    pop(id: string): string {
      if (!detail || !popHandle || popHandle.id !== id) return failTrustedRaycastCanIUse('SNAPSHOT_STALE')
      registry.authorize(popHandle, { ...context, revision: detail.ticket.revision, depth: 1, row: null, feature: null, kind: 'pop' })
      revoke()
      detail = undefined
      prepared = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, JSON.parse(prepared.message).query)
      return prepared.message
    },
    search(query: unknown): string {
      if (!searchHandle) return failTrustedRaycastCanIUse('SNAPSHOT_STALE')
      registry.authorize(searchHandle, { ...context, revision: prepared.ticket.revision, depth: 0, row: null, feature: null, kind: 'search' })
      revoke()
      prepared = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, query)
      return prepared.message
    },
    close(): void { revoke(); registry.close(context) },
  })
}
