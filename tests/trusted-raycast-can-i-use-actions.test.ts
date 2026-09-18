import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRUSTED_RAYCAST_CAN_I_USE_MAX_LIVE_HANDLES,
  TrustedRaycastCanIUseActionRegistry,
  type TrustedRaycastCanIUseActionHandle,
} from '../src/trusted-raycast-can-i-use-actions.ts'
import {
  TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES,
  TrustedRaycastCanIUseError,
} from '../src/trusted-raycast-can-i-use-errors.ts'

import {
  createTrustedRaycastCanIUseCatalog,
  materializeTrustedRaycastCanIUseFeatureTable,
  searchTrustedRaycastCanIUseCatalog,
} from '../src/trusted-raycast-can-i-use-catalog.ts'

type FeatureRow = { slug: string; title: string; sourceIndex: number }
type DetailRow = { browser: string; label: string; sourceIndex: number }

const context = {
  extensionId: 'can-i-use',
  command: 'index',
  sessionId: 'session-1',
  workspaceId: 'workspace-1',
  snapshotIdentity: 'snapshot-1',
  snapshotGeneration: 4,
} as const

function featureRows(count: number, prefix = 'feature'): FeatureRow[] {
  return Array.from({ length: count }, (_, sourceIndex) => ({
    slug: `${prefix}-${sourceIndex}`,
    title: `Feature ${sourceIndex}`,
    sourceIndex,
  }))
}

function detailRows(count: number): DetailRow[] {
  return Array.from({ length: count }, (_, sourceIndex) => ({
    browser: `agent${sourceIndex}`,
    label: `Agent ${sourceIndex}`,
    sourceIndex,
  }))
}

// Test-only fixture convenience. Production authentication must come from the Host session.
function trustedRaycastCanIUseAuthenticationFromHandle(handle: TrustedRaycastCanIUseActionHandle) {
  const { id: _id, ...authentication } = handle
  return authentication
}

function assertCode(code: string, action: () => unknown): void {
  assert.throws(action, error => error instanceof TrustedRaycastCanIUseError && String(error.code) === code)
}

function auxiliaryKinds(count: number): Array<'search' | 'error' | 'replacement' | 'close'> {
  return Array.from({ length: count }, (_, index) => (['search', 'error', 'replacement', 'close'] as const)[index % 4]!)
}

test('registers the bounded root projection only after the full 256-handle budget fits', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const rows = featureRows(64)
  const failed = registry.startSearch(context, rows)
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.LIMIT_EXCEEDED, () => registry.publishRoot(failed, rows, auxiliaryKinds(129)))
  assert.deepEqual(registry.stats(), { revision: 1, state: 'error', liveHandleCount: 0, peakLiveHandleCount: 0 })
  assertCode('SNAPSHOT_STALE', () => registry.publishRoot(failed, rows))

  const ticket = registry.startSearch(context, rows)
  const handles = registry.publishRoot(ticket, rows, auxiliaryKinds(128))
  assert.equal(handles.length, TRUSTED_RAYCAST_CAN_I_USE_MAX_LIVE_HANDLES)
  assert.deepEqual(registry.stats(), {
    revision: 2,
    state: 'root',
    liveHandleCount: 256,
    peakLiveHandleCount: 256,
  })
  assert.equal(handles.filter(handle => handle.kind === 'show-details').length, 64)
  assert.equal(handles.filter(handle => handle.kind === 'open-browser').length, 64)
  assert.equal(handles.filter(handle => handle.kind === 'search').length, 32)
  assert.equal(Object.isFrozen(handles), true)
  assert.equal(Object.isFrozen(handles[0]), true)
  assert.equal(new Set(handles.map(handle => handle.id)).size, 256)
  assertCode('SNAPSHOT_STALE', () => registry.publishRoot(ticket, rows, auxiliaryKinds(128)))
})

test('drops out-of-order search results without replacing the latest revision or allocating old handles', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const firstRows = featureRows(2, 'first')
  const secondRows = featureRows(64, 'second')
  const first = registry.startSearch(context, firstRows)
  const second = registry.startSearch({ ...context, snapshotIdentity: 'snapshot-2', snapshotGeneration: 5 }, secondRows)
  const latest = registry.publishRoot(second, secondRows)
  assert.equal(latest.length, 128)
  const latestIds = latest.map(handle => handle.id)
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.SNAPSHOT_STALE, () => registry.publishRoot(first, firstRows))
  assert.deepEqual(registry.liveActionHandles().map(handle => handle.id), latestIds)
  assert.equal(registry.stats().peakLiveHandleCount, 128)
  assert.equal(registry.liveActionHandles().every(handle => handle.snapshotIdentity === 'snapshot-2'), true)
})

test('validates root membership and action authentication against the current snapshot', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const rows = featureRows(1)
  const failed = registry.startRoot(context, rows)
  assertCode('RENDER_INVALID', () => registry.publishRoot(failed, [{ ...rows[0]!, title: 'tampered' }]))
  assert.equal(registry.stats().liveHandleCount, 0)
  assertCode('SNAPSHOT_STALE', () => registry.publishRoot(failed, rows))
  const ticket = registry.startRoot(context, rows)
  const handles = registry.publishRoot(ticket, rows)
  const details = handles.find(handle => handle.kind === 'show-details')!
  const authentication = trustedRaycastCanIUseAuthenticationFromHandle(details)
  assert.deepEqual(registry.authorize(details, authentication), {
    kind: 'show-details',
    row: 0,
    feature: 'feature-0',
    revision: 2,
    depth: 0,
  })
  assertCode('ACTION_DENIED', () => registry.authorize(
    details,
    { ...authentication, snapshotIdentity: 'snapshot-foreign' },
  ))
  assertCode('ACTION_DENIED', () => registry.authorize(
    { ...details, feature: 'foreign-feature' },
    authentication,
  ))
  assertCode('ACTION_DENIED', () => registry.authorize(
    details,
    { ...authentication, kind: 'open-browser' },
  ))
  const foreignRegistry = new TrustedRaycastCanIUseActionRegistry()
  const foreignTicket = foreignRegistry.startRoot(context, rows)
  const foreignHandle = foreignRegistry.publishRoot(foreignTicket, rows)[0]!
  assertCode('ACTION_DENIED', () => registry.authorize(
    foreignHandle,
    trustedRaycastCanIUseAuthenticationFromHandle(foreignHandle),
  ))
  assertCode('SNAPSHOT_STALE', () => registry.publishRoot({ ...ticket }, rows))
})

test('releases root handles before one-level detail allocation and binds detail rows to that feature', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const rootRows = featureRows(64)
  const rootTicket = registry.startRoot(context, rootRows)
  const rootHandles = registry.publishRoot(rootTicket, rootRows)
  const showDetails = rootHandles.find(handle => handle.kind === 'show-details' && handle.row === 10)!
  const detailRowsValue = detailRows(64)
  const detailTicket = registry.startDetailFromRoot(
    showDetails,
    trustedRaycastCanIUseAuthenticationFromHandle(showDetails),
    detailRowsValue,
  )
  assert.equal(registry.stats().liveHandleCount, 0)
  assert.equal(detailTicket.depth, 1)
  assert.equal(detailTicket.feature, 'feature-10')
  const detailHandles = registry.publishDetail(detailTicket, detailRowsValue, auxiliaryKinds(192))
  assert.equal(detailHandles.length, 256)
  assert.equal(detailHandles.filter(handle => handle.kind === 'open-browser').length, 64)
  assert.equal(detailHandles.filter(handle => handle.kind === 'close').length, 48)
  assert.equal(detailHandles.every(handle => handle.depth === 1 && handle.feature === 'feature-10'), false)
  assert.equal(detailHandles.filter(handle => handle.kind === 'open-browser').every(handle => handle.depth === 1 && handle.feature === 'feature-10'), true)
  assert.equal(registry.stats().peakLiveHandleCount, 256)
  assertCode('ACTION_DENIED', () => registry.authorize(
    showDetails,
    trustedRaycastCanIUseAuthenticationFromHandle(showDetails),
  ))
})

test('invalidates search, error, replacement, detail, and close revisions', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const rows = featureRows(1)
  const search = registry.startSearch(context, rows)
  registry.publishRoot(search, rows)
  const rootHandle = registry.liveActionHandles()[0]!
  const rootAuth = trustedRaycastCanIUseAuthenticationFromHandle(rootHandle)

  const detail = registry.startDetailFromRoot(rootHandle, rootAuth, detailRows(1))
  registry.publishDetail(detail, detailRows(1))
  const detailHandle = registry.liveActionHandles()[0]!
  const detailAuth = trustedRaycastCanIUseAuthenticationFromHandle(detailHandle)
  assertCode('ACTION_DENIED', () => registry.authorize(rootHandle, rootAuth))

  const error = registry.startError(context)
  assert.equal(error.kind, 'error')
  assert.equal(registry.stats().liveHandleCount, 0)
  assertCode('ACTION_DENIED', () => registry.authorize(detailHandle, detailAuth))

  const replacement = registry.startReplacement({ ...context, snapshotGeneration: 5 })
  assert.equal(replacement.kind, 'replacement')
  assert.equal(registry.stats().liveHandleCount, 0)

  const latestSearch = registry.startSearch({ ...context, snapshotGeneration: 6 }, rows)
  assert.equal(latestSearch.kind, 'search')
  assert.equal(registry.stats().liveHandleCount, 0)

  const close = registry.close({ ...context, snapshotGeneration: 7 })
  assert.equal(close.kind, 'close')
  assert.equal(registry.stats().state, 'close')
  assert.equal(registry.stats().liveHandleCount, 0)
  assertCode('ACTION_DENIED', () => registry.startRoot(context, rows))
})

test('Host selection limits row enumeration before registration and identical-query revisions cannot revive handles', () => {
  const catalog = createTrustedRaycastCanIUseCatalog(featureRows(581))
  const registry = new TrustedRaycastCanIUseActionRegistry()
  let previous: TrustedRaycastCanIUseActionHandle | undefined
  for (const query of ['', 'Feature 580', '']) {
    const result = searchTrustedRaycastCanIUseCatalog(catalog, query)
    const table = materializeTrustedRaycastCanIUseFeatureTable(catalog, result)
    let materialized = 0
    const rows = Object.entries(table).map(([_slug, feature]) => {
      materialized++
      return feature
    })
    assert.equal(materialized, query ? 1 : 64)
    const ticket = registry.startRoot(context, rows)
    assert.equal(registry.stats().liveHandleCount, 0)
    const handles = registry.publishRoot(ticket, rows)
    assert.equal(handles.length, materialized * 2)
    if (previous) {
      assertCode('ACTION_DENIED', () => registry.authorize(previous!, trustedRaycastCanIUseAuthenticationFromHandle(previous!)))
    }
    previous = handles[0]
    assert.equal(registry.stats().peakLiveHandleCount, 128)
  }
})

test('rejects any extension or command outside the exact candidate identity', () => {
  for (const identity of [
    { extensionId: 'google-translate', command: 'index' },
    { extensionId: 'can-i-use', command: 'can-i-use' },
  ]) {
    const registry = new TrustedRaycastCanIUseActionRegistry()
    assertCode('ACTION_DENIED', () => registry.startRoot({ ...context, ...identity }, featureRows(1)))
    assert.equal(registry.stats().liveHandleCount, 0)
  }
})

test('a failed transition retires old handles and render tickets instead of keeping stale authority', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const rows = featureRows(1)
  const ticket = registry.startRoot(context, rows)
  const handle = registry.publishRoot(ticket, rows)[0]!
  assertCode('RENDER_INVALID', () => registry.startSearch(context, featureRows(65)))
  assert.equal(registry.stats().liveHandleCount, 0)
  assertCode('ACTION_DENIED', () => registry.authorize(handle, trustedRaycastCanIUseAuthenticationFromHandle(handle)))
  assertCode('SNAPSHOT_STALE', () => registry.publishRoot(ticket, rows))
})

test('rejects invalid detail rows before any handle allocation', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const rows = featureRows(1)
  const rootTicket = registry.startRoot(context, rows)
  const rootHandles = registry.publishRoot(rootTicket, rows)
  const showDetails = rootHandles.find(handle => handle.kind === 'show-details')!
  const detailTicket = registry.startDetailFromRoot(showDetails, trustedRaycastCanIUseAuthenticationFromHandle(showDetails), detailRows(1))
  assertCode('RENDER_INVALID', () => registry.publishDetail(detailTicket, [
    { browser: 'op_mini', label: 'Opera Mini', sourceIndex: 0 },
  ]))
  assert.equal(registry.stats().liveHandleCount, 0)
  assert.equal(registry.stats().peakLiveHandleCount, 2)
})
