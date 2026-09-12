import { TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE } from './trusted-raycast-can-i-use-catalog.ts'
import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'

export const TRUSTED_RAYCAST_CAN_I_USE_MAX_ROOT_ROWS = 64
export const TRUSTED_RAYCAST_CAN_I_USE_MAX_DETAIL_ROWS = 64
export const TRUSTED_RAYCAST_CAN_I_USE_MAX_LIVE_HANDLES = 256

const MAX_IDENTIFIER_BYTES = 1_024
const FEATURE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/
const CONTROL_PATTERN = /\p{Cc}/u
let nextRegistryIdentity = 0

export type TrustedRaycastCanIUseRevisionKind = 'search' | 'root' | 'detail' | 'error' | 'replacement' | 'close'
export type TrustedRaycastCanIUseActionKind = 'show-details' | 'open-browser' | 'search' | 'pop' | 'error' | 'replacement' | 'close'
export type TrustedRaycastCanIUseAuxiliaryActionKind = Extract<TrustedRaycastCanIUseActionKind, 'search' | 'pop' | 'error' | 'replacement' | 'close'>

export type TrustedRaycastCanIUseRevisionContext = Readonly<{
  extensionId: string
  command: string
  sessionId: string
  workspaceId: string
  snapshotIdentity: string
  snapshotGeneration: number
}>

export type TrustedRaycastCanIUseRevisionTicket = Readonly<{
  revision: number
  kind: TrustedRaycastCanIUseRevisionKind
  extensionId: string
  command: string
  sessionId: string
  workspaceId: string
  snapshotIdentity: string
  snapshotGeneration: number
  depth: 0 | 1
  feature: string | null
}>

export type TrustedRaycastCanIUseActionHandle = Readonly<{
  id: string
  extensionId: string
  command: string
  sessionId: string
  workspaceId: string
  snapshotIdentity: string
  snapshotGeneration: number
  revision: number
  depth: 0 | 1
  row: number | null
  feature: string | null
  kind: TrustedRaycastCanIUseActionKind
}>

/** Supplied by the authenticated Host context, never reconstructed from an incoming handle. */
export type TrustedRaycastCanIUseActionAuthentication = Omit<TrustedRaycastCanIUseActionHandle, 'id'>

export type TrustedRaycastCanIUseFeatureRow = Readonly<{
  slug: string
  title: string
  sourceIndex: number
}>

export type TrustedRaycastCanIUseDetailRow = Readonly<{
  browser: string
  label: string
  sourceIndex: number
}>

export type TrustedRaycastCanIUseRegistryStats = Readonly<{
  revision: number
  state: TrustedRaycastCanIUseRevisionKind | 'idle'
  liveHandleCount: number
  peakLiveHandleCount: number
}>

export type TrustedRaycastCanIUseAuthorizedAction = Readonly<{
  kind: TrustedRaycastCanIUseActionKind
  row: number | null
  feature: string | null
  revision: number
  depth: 0 | 1
}>

type StoredAction = TrustedRaycastCanIUseActionHandle
type StoredContext = TrustedRaycastCanIUseRevisionContext
type StoredFeatureRow = TrustedRaycastCanIUseFeatureRow
type StoredDetailRow = TrustedRaycastCanIUseDetailRow

function fail(code: 'SNAPSHOT_STALE' | 'RENDER_INVALID' | 'ACTION_DENIED' | 'LIMIT_EXCEEDED'): never {
  return failTrustedRaycastCanIUse(code)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return true
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !hasUnpairedSurrogate(value)
    && !CONTROL_PATTERN.test(value)
    && byteLength(value) <= MAX_IDENTIFIER_BYTES
}

function readDataObject(value: unknown, names: readonly string[]): Record<string, PropertyDescriptor> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('RENDER_INVALID')
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) fail('RENDER_INVALID')
    const keys = Reflect.ownKeys(value)
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) {
      fail('RENDER_INVALID')
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    for (const name of names) {
      const descriptor = descriptors[name]
      if (!descriptor || descriptor.get || descriptor.set) fail('RENDER_INVALID')
    }
    return descriptors
  } catch {
    fail('RENDER_INVALID')
  }
}

function readArrayValues(value: unknown, maxLength: number): unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxLength) {
      fail('RENDER_INVALID')
    }
    const keys = Reflect.ownKeys(value)
    if (keys.length !== value.length + 1 || !keys.includes('length')
      || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)))) {
      fail('RENDER_INVALID')
    }
    const values: unknown[] = []
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor || descriptor.get || descriptor.set) fail('RENDER_INVALID')
      values.push(descriptor.value)
    }
    return values
  } catch {
    fail('RENDER_INVALID')
  }
}

function readContext(value: unknown): StoredContext {
  const descriptors = readDataObject(value, [
    'extensionId',
    'command',
    'sessionId',
    'workspaceId',
    'snapshotIdentity',
    'snapshotGeneration',
  ])
  const extensionId = descriptors.extensionId!.value
  const command = descriptors.command!.value
  const sessionId = descriptors.sessionId!.value
  const workspaceId = descriptors.workspaceId!.value
  const snapshotIdentity = descriptors.snapshotIdentity!.value
  const snapshotGeneration = descriptors.snapshotGeneration!.value
  if (extensionId !== 'can-i-use'
    || command !== 'index'
    || !validIdentifier(sessionId)
    || !validIdentifier(workspaceId)
    || !validIdentifier(snapshotIdentity)
    || !Number.isSafeInteger(snapshotGeneration)
    || snapshotGeneration < 0) {
    fail('ACTION_DENIED')
  }
  return Object.freeze({ extensionId, command, sessionId, workspaceId, snapshotIdentity, snapshotGeneration })
}

function readFeatureRow(value: unknown): StoredFeatureRow {
  const descriptors = readDataObject(value, ['slug', 'title', 'sourceIndex'])
  const slug = descriptors.slug!.value
  const title = descriptors.title!.value
  const sourceIndex = descriptors.sourceIndex!.value
  if (typeof slug !== 'string' || !FEATURE_SLUG_PATTERN.test(slug)
    || typeof title !== 'string' || title.length === 0 || hasUnpairedSurrogate(title)
    || CONTROL_PATTERN.test(title) || byteLength(title) > MAX_IDENTIFIER_BYTES
    || !Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE) {
    fail('RENDER_INVALID')
  }
  return Object.freeze({ slug, title, sourceIndex })
}

function readFeatureRows(value: unknown): readonly StoredFeatureRow[] {
  const values = readArrayValues(value, TRUSTED_RAYCAST_CAN_I_USE_MAX_ROOT_ROWS)
  const rows: StoredFeatureRow[] = []
  const slugs = new Set<string>()
  let previousSourceIndex = -1
  for (const rowValue of values) {
    const row = readFeatureRow(rowValue)
    if (row.sourceIndex <= previousSourceIndex || slugs.has(row.slug)) fail('RENDER_INVALID')
    previousSourceIndex = row.sourceIndex
    slugs.add(row.slug)
    rows.push(row)
  }
  return Object.freeze(rows)
}

function readDetailRow(value: unknown): StoredDetailRow {
  const descriptors = readDataObject(value, ['browser', 'label', 'sourceIndex'])
  const browser = descriptors.browser!.value
  const label = descriptors.label!.value
  const sourceIndex = descriptors.sourceIndex!.value
  if (typeof browser !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(browser)
    || browser === 'op_mini'
    || !validIdentifier(label)
    || !Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= TRUSTED_RAYCAST_CAN_I_USE_CATALOG_SIZE) {
    fail('RENDER_INVALID')
  }
  return Object.freeze({ browser, label, sourceIndex })
}

function readDetailRows(value: unknown): readonly StoredDetailRow[] {
  const values = readArrayValues(value, TRUSTED_RAYCAST_CAN_I_USE_MAX_DETAIL_ROWS)
  const rows: StoredDetailRow[] = []
  const browsers = new Set<string>()
  let previousSourceIndex = -1
  for (const rowValue of values) {
    const row = readDetailRow(rowValue)
    if (row.sourceIndex <= previousSourceIndex || browsers.has(row.browser)) fail('RENDER_INVALID')
    previousSourceIndex = row.sourceIndex
    browsers.add(row.browser)
    rows.push(row)
  }
  return Object.freeze(rows)
}

function readAuxiliaryKinds(value: unknown): readonly TrustedRaycastCanIUseAuxiliaryActionKind[] {
  const values = readArrayValues(value, TRUSTED_RAYCAST_CAN_I_USE_MAX_LIVE_HANDLES)
  const kinds: TrustedRaycastCanIUseAuxiliaryActionKind[] = []
  for (const kind of values) {
    if (kind !== 'search' && kind !== 'pop' && kind !== 'error' && kind !== 'replacement' && kind !== 'close') {
      fail('RENDER_INVALID')
    }
    kinds.push(kind)
  }
  return Object.freeze(kinds)
}

function sameFeatureRows(left: readonly StoredFeatureRow[], right: readonly StoredFeatureRow[]): boolean {
  return left.length === right.length && left.every((row, index) => {
    const candidate = right[index]
    return candidate !== undefined
      && row.slug === candidate.slug
      && row.title === candidate.title
      && row.sourceIndex === candidate.sourceIndex
  })
}

function sameDetailRows(left: readonly StoredDetailRow[], right: readonly StoredDetailRow[]): boolean {
  return left.length === right.length && left.every((row, index) => {
    const candidate = right[index]
    return candidate !== undefined
      && row.browser === candidate.browser
      && row.label === candidate.label
      && row.sourceIndex === candidate.sourceIndex
  })
}

function readHandle(value: unknown): TrustedRaycastCanIUseActionHandle {
  const descriptors = readDataObject(value, [
    'id',
    'extensionId',
    'command',
    'sessionId',
    'workspaceId',
    'snapshotIdentity',
    'snapshotGeneration',
    'revision',
    'depth',
    'row',
    'feature',
    'kind',
  ])
  const id = descriptors.id!.value
  const revision = descriptors.revision!.value
  const depth = descriptors.depth!.value
  const row = descriptors.row!.value
  const feature = descriptors.feature!.value
  const kind = descriptors.kind!.value
  if (!validIdentifier(id)
    || !Number.isSafeInteger(revision) || revision < 0
    || (depth !== 0 && depth !== 1)
    || (row !== null && (!Number.isSafeInteger(row) || row < 0 || row >= TRUSTED_RAYCAST_CAN_I_USE_MAX_DETAIL_ROWS))
    || (feature !== null && (typeof feature !== 'string' || !FEATURE_SLUG_PATTERN.test(feature)))
    || (kind !== 'show-details' && kind !== 'open-browser' && kind !== 'search' && kind !== 'pop' && kind !== 'error' && kind !== 'replacement' && kind !== 'close')) {
    fail('ACTION_DENIED')
  }
  const context = readContext({
    extensionId: descriptors.extensionId!.value,
    command: descriptors.command!.value,
    sessionId: descriptors.sessionId!.value,
    workspaceId: descriptors.workspaceId!.value,
    snapshotIdentity: descriptors.snapshotIdentity!.value,
    snapshotGeneration: descriptors.snapshotGeneration!.value,
  })
  return Object.freeze({ id, ...context, revision, depth, row, feature, kind })
}

function readAuthentication(value: unknown): TrustedRaycastCanIUseActionAuthentication {
  const descriptors = readDataObject(value, [
    'extensionId',
    'command',
    'sessionId',
    'workspaceId',
    'snapshotIdentity',
    'snapshotGeneration',
    'revision',
    'depth',
    'row',
    'feature',
    'kind',
  ])
  const handle = readHandle({
    id: 'authentication',
    extensionId: descriptors.extensionId!.value,
    command: descriptors.command!.value,
    sessionId: descriptors.sessionId!.value,
    workspaceId: descriptors.workspaceId!.value,
    snapshotIdentity: descriptors.snapshotIdentity!.value,
    snapshotGeneration: descriptors.snapshotGeneration!.value,
    revision: descriptors.revision!.value,
    depth: descriptors.depth!.value,
    row: descriptors.row!.value,
    feature: descriptors.feature!.value,
    kind: descriptors.kind!.value,
  })
  const { id: _id, ...authentication } = handle
  return Object.freeze(authentication)
}

function sameAction(left: TrustedRaycastCanIUseActionHandle, right: TrustedRaycastCanIUseActionHandle): boolean {
  return left.id === right.id
    && left.extensionId === right.extensionId
    && left.command === right.command
    && left.sessionId === right.sessionId
    && left.workspaceId === right.workspaceId
    && left.snapshotIdentity === right.snapshotIdentity
    && left.snapshotGeneration === right.snapshotGeneration
    && left.revision === right.revision
    && left.depth === right.depth
    && left.row === right.row
    && left.feature === right.feature
    && left.kind === right.kind
}

function sameAuthentication(action: StoredAction, authentication: TrustedRaycastCanIUseActionAuthentication): boolean {
  return action.extensionId === authentication.extensionId
    && action.command === authentication.command
    && action.sessionId === authentication.sessionId
    && action.workspaceId === authentication.workspaceId
    && action.snapshotIdentity === authentication.snapshotIdentity
    && action.snapshotGeneration === authentication.snapshotGeneration
    && action.revision === authentication.revision
    && action.depth === authentication.depth
    && action.row === authentication.row
    && action.feature === authentication.feature
    && action.kind === authentication.kind
}

export { readContext as validateTrustedRaycastCanIUseContext, readDetailRows as validateTrustedRaycastCanIUseDetailRows }

export class TrustedRaycastCanIUseActionRegistry {
  readonly #registryIdentity: number
  #revision = 0
  #state: TrustedRaycastCanIUseRevisionKind | 'idle' = 'idle'
  #closed = false
  #peakLiveHandleCount = 0
  readonly #live = new Map<string, StoredAction>()
  #currentTicket: TrustedRaycastCanIUseRevisionTicket | undefined
  #publishedTicket: TrustedRaycastCanIUseRevisionTicket | undefined
  #rootRows: readonly StoredFeatureRow[] = Object.freeze([])
  #detailRows: readonly StoredDetailRow[] = Object.freeze([])
  #detailFeature: string | null = null

  constructor() {
    if (nextRegistryIdentity >= Number.MAX_SAFE_INTEGER) fail('LIMIT_EXCEEDED')
    this.#registryIdentity = ++nextRegistryIdentity
  }

  private retire(): void {
    this.#live.clear()
    this.#currentTicket = undefined
    this.#publishedTicket = undefined
    this.#rootRows = Object.freeze([])
    this.#detailRows = Object.freeze([])
    this.#detailFeature = null
    this.#state = 'error'
  }

  private begin(
    kind: TrustedRaycastCanIUseRevisionKind,
    contextValue: unknown,
    rowsValue: unknown,
    feature: string | null,
  ): TrustedRaycastCanIUseRevisionTicket {
    if (this.#closed) fail('ACTION_DENIED')
    // A failed transition must not preserve authority from the previous view.
    this.retire()
    if (kind === 'close') this.#closed = true
    const context = readContext(contextValue)
    const rows = kind === 'detail' ? readDetailRows(rowsValue) : readFeatureRows(rowsValue)
    if (feature !== null && !FEATURE_SLUG_PATTERN.test(feature)) fail('RENDER_INVALID')
    if (this.#revision >= Number.MAX_SAFE_INTEGER) fail('LIMIT_EXCEEDED')

    this.#revision++
    this.#rootRows = kind === 'detail' ? Object.freeze([]) : rows as readonly StoredFeatureRow[]
    this.#detailRows = kind === 'detail' ? rows as readonly StoredDetailRow[] : Object.freeze([])
    this.#detailFeature = kind === 'detail' ? feature : null
    this.#state = kind
    this.#publishedTicket = undefined
    const ticket = Object.freeze({
      revision: this.#revision,
      kind,
      ...context,
      depth: kind === 'detail' ? 1 : 0,
      feature: kind === 'detail' ? feature : null,
    })
    this.#currentTicket = ticket
    return ticket
  }

  startSearch(context: TrustedRaycastCanIUseRevisionContext, selectedRows: readonly TrustedRaycastCanIUseFeatureRow[]): TrustedRaycastCanIUseRevisionTicket {
    return this.begin('search', context, selectedRows, null)
  }

  startRoot(context: TrustedRaycastCanIUseRevisionContext, selectedRows: readonly TrustedRaycastCanIUseFeatureRow[]): TrustedRaycastCanIUseRevisionTicket {
    return this.begin('root', context, selectedRows, null)
  }

  startError(context: TrustedRaycastCanIUseRevisionContext): TrustedRaycastCanIUseRevisionTicket {
    return this.begin('error', context, [], null)
  }

  startReplacement(context: TrustedRaycastCanIUseRevisionContext): TrustedRaycastCanIUseRevisionTicket {
    return this.begin('replacement', context, [], null)
  }

  close(context: TrustedRaycastCanIUseRevisionContext): TrustedRaycastCanIUseRevisionTicket {
    return this.begin('close', context, [], null)
  }

  startDetailFromRoot(
    handleValue: TrustedRaycastCanIUseActionHandle,
    authenticationValue: TrustedRaycastCanIUseActionAuthentication,
    detailRows: readonly TrustedRaycastCanIUseDetailRow[],
  ): TrustedRaycastCanIUseRevisionTicket {
    const action = this.authorizeInternal(handleValue, authenticationValue)
    if (action.kind !== 'show-details' || action.depth !== 0 || action.feature === null) fail('ACTION_DENIED')
    const stored = this.#live.get(readHandle(handleValue).id)
    if (!stored) fail('ACTION_DENIED')
    const context: StoredContext = {
      extensionId: stored.extensionId,
      command: stored.command,
      sessionId: stored.sessionId,
      workspaceId: stored.workspaceId,
      snapshotIdentity: stored.snapshotIdentity,
      snapshotGeneration: stored.snapshotGeneration,
    }
    return this.begin('detail', context, detailRows, action.feature)
  }

  private assertTicket(value: unknown, allowed: readonly TrustedRaycastCanIUseRevisionKind[]): TrustedRaycastCanIUseRevisionTicket {
    // Tickets are frozen Host-owned objects, not wire input. Check identity before reading anything.
    const ticket = this.#currentTicket
    if (!ticket || ticket !== value || this.#publishedTicket === ticket
      || ticket.revision !== this.#revision || !allowed.includes(ticket.kind)) {
      fail('SNAPSHOT_STALE')
    }
    return ticket
  }

  private validateRootRows(value: unknown): readonly StoredFeatureRow[] {
    const rows = readFeatureRows(value)
    if (!sameFeatureRows(rows, this.#rootRows)) fail('RENDER_INVALID')
    return this.#rootRows
  }

  private validateDetailRows(value: unknown): readonly StoredDetailRow[] {
    const rows = readDetailRows(value)
    if (!sameDetailRows(rows, this.#detailRows)) fail('RENDER_INVALID')
    return this.#detailRows
  }

  private addAction(
    ticket: TrustedRaycastCanIUseRevisionTicket,
    kind: TrustedRaycastCanIUseActionKind,
    row: number | null,
    feature: string | null,
    ordinal: number,
  ): void {
    const id = `can-i-use:${this.#registryIdentity}:${ticket.revision}:${ordinal}`
    const action: StoredAction = Object.freeze({
      id,
      extensionId: ticket.extensionId,
      command: ticket.command,
      sessionId: ticket.sessionId,
      workspaceId: ticket.workspaceId,
      snapshotIdentity: ticket.snapshotIdentity,
      snapshotGeneration: ticket.snapshotGeneration,
      revision: ticket.revision,
      depth: ticket.depth,
      row,
      feature,
      kind,
    })
    this.#live.set(id, action)
  }

  private updatePeak(): void {
    if (this.#live.size > this.#peakLiveHandleCount) this.#peakLiveHandleCount = this.#live.size
  }

  publishRoot(
    ticketValue: TrustedRaycastCanIUseRevisionTicket,
    rowsValue: readonly TrustedRaycastCanIUseFeatureRow[],
    auxiliaryKindsValue: readonly TrustedRaycastCanIUseAuxiliaryActionKind[] = [],
  ): readonly TrustedRaycastCanIUseActionHandle[] {
    const ticket = this.assertTicket(ticketValue, ['search', 'root'])
    try {
      const rows = this.validateRootRows(rowsValue)
      const auxiliaryKinds = readAuxiliaryKinds(auxiliaryKindsValue)
      if (auxiliaryKinds.includes('pop')) fail('RENDER_INVALID')
      const required = rows.length * 2 + auxiliaryKinds.length
      if (required > TRUSTED_RAYCAST_CAN_I_USE_MAX_LIVE_HANDLES) fail('LIMIT_EXCEEDED')

      let ordinal = 0
      rows.forEach((row, index) => {
        this.addAction(ticket, 'show-details', index, row.slug, ordinal++)
        this.addAction(ticket, 'open-browser', index, row.slug, ordinal++)
      })
      for (const kind of auxiliaryKinds) this.addAction(ticket, kind, null, null, ordinal++)
      this.updatePeak()
      this.#state = 'root'
      this.#publishedTicket = ticketValue
      return this.liveActionHandles()
    } catch (error) {
      this.retire()
      throw error
    }
  }

  publishDetail(
    ticketValue: TrustedRaycastCanIUseRevisionTicket,
    rowsValue: readonly TrustedRaycastCanIUseDetailRow[],
    auxiliaryKindsValue: readonly TrustedRaycastCanIUseAuxiliaryActionKind[] = [],
  ): readonly TrustedRaycastCanIUseActionHandle[] {
    const ticket = this.assertTicket(ticketValue, ['detail'])
    try {
      const rows = this.validateDetailRows(rowsValue)
      const auxiliaryKinds = readAuxiliaryKinds(auxiliaryKindsValue)
      const required = rows.length + auxiliaryKinds.length
      if (required > TRUSTED_RAYCAST_CAN_I_USE_MAX_LIVE_HANDLES) fail('LIMIT_EXCEEDED')

      rows.forEach((_row, index) => this.addAction(ticket, 'open-browser', index, this.#detailFeature, index))
      auxiliaryKinds.forEach((kind, index) => this.addAction(ticket, kind, null, null, rows.length + index))
      this.updatePeak()
      this.#state = 'detail'
      this.#publishedTicket = ticketValue
      return this.liveActionHandles()
    } catch (error) {
      this.retire()
      throw error
    }
  }

  private authorizeInternal(
    handleValue: unknown,
    authenticationValue: unknown,
  ): TrustedRaycastCanIUseAuthorizedAction {
    const handle = readHandle(handleValue)
    const stored = this.#live.get(handle.id)
    if (!stored || !sameAction(handle, stored)) fail('ACTION_DENIED')
    const authentication = readAuthentication(authenticationValue)
    if (!sameAuthentication(stored, authentication)) fail('ACTION_DENIED')
    return Object.freeze({
      kind: stored.kind,
      row: stored.row,
      feature: stored.feature,
      revision: stored.revision,
      depth: stored.depth,
    })
  }

  authorize(
    handle: TrustedRaycastCanIUseActionHandle,
    authentication: TrustedRaycastCanIUseActionAuthentication,
  ): TrustedRaycastCanIUseAuthorizedAction {
    return this.authorizeInternal(handle, authentication)
  }

  liveActionHandles(): readonly TrustedRaycastCanIUseActionHandle[] {
    return Object.freeze([...this.#live.values()].map(action => Object.freeze({ ...action })))
  }

  stats(): TrustedRaycastCanIUseRegistryStats {
    return Object.freeze({
      revision: this.#revision,
      state: this.#state,
      liveHandleCount: this.#live.size,
      peakLiveHandleCount: this.#peakLiveHandleCount,
    })
  }
}
