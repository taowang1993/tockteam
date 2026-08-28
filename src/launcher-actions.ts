import { randomUUID } from 'node:crypto'
import { isLauncherImageUrl } from './launcher-image-url.ts'

export type LauncherRendererRole = 'launcher'

export type LauncherActionOwner = Readonly<{
  role: LauncherRendererRole
  webContentsId: number
}>

export type LauncherInternalAction = Readonly<{
  argument: string
  description: string
  handlerKey: string
  hideWindowAfterInvocation?: boolean
  keyboardShortcut?: string
  requiresConfirmation?: boolean
}>

export type LauncherInternalResultItem = Readonly<{
  additionalActions?: readonly LauncherInternalAction[]
  defaultAction: LauncherInternalAction
  description: string
  details?: string
  id: string
  imageKey?: string
  imageUrl?: string
  name: string
  sourceExtension: string
}>

export type LauncherPublicAction = Readonly<{
  actionId: string
  description: string
  hideWindowAfterInvocation?: boolean
  keyboardShortcut?: string
  requiresConfirmation?: boolean
}>

export type LauncherPublicResultItem = Readonly<{
  additionalActions?: readonly LauncherPublicAction[]
  defaultAction: LauncherPublicAction
  description: string
  details?: string
  id: string
  imageKey?: string
  imageUrl?: string
  name: string
  sourceExtension: string
}>

export type LauncherActionRecord = Readonly<{
  actionId: string
  argument: string
  expiresAt: number
  handlerKey: string
  hideWindowAfterInvocation: boolean
  owner: LauncherActionOwner
  requiresConfirmation: boolean
  resultSetId: string
  sourceExtension: string
}>

export type LauncherActionStoreOptions = Readonly<{
  cancel?: (record: LauncherActionRecord) => Promise<boolean>
  createId?: () => string
  execute: (record: LauncherActionRecord) => Promise<void>
  maxActions?: number
  now?: () => number
  ttlMs?: number
}>

export class LauncherActionExpiredError extends Error {
  constructor() {
    super('TockLauncher action has expired')
    this.name = 'LauncherActionExpiredError'
  }
}

export const LAUNCHER_MAX_RESULT_ITEMS = 200
const DEFAULT_ACTION_TTL_MS = 30_000
const MAX_ACTIONS_PER_ITEM = 16
const DEFAULT_MAX_ACTIONS = 2 * LAUNCHER_MAX_RESULT_ITEMS * (MAX_ACTIONS_PER_ITEM + 1)
const MAX_ARGUMENT_LENGTH = 16_384
const ACTION_ID_PATTERN = /^launcher-action:[0-9A-Za-z-]{1,96}$/u
const HANDLER_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u
const IMAGE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u

function ownerKey(owner: LauncherActionOwner): string {
  return `${owner.role}:${owner.webContentsId}`
}

function assertOwner(owner: LauncherActionOwner): void {
  if (owner.role !== 'launcher'
    || !Number.isSafeInteger(owner.webContentsId)
    || owner.webContentsId <= 0) {
    throw new Error('Invalid launcher action owner')
  }
}

function assertBoundedText(value: unknown, field: string, maxLength: number): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new Error(`Invalid launcher ${field}`)
  }
}

function sameOwner(left: LauncherActionOwner, right: LauncherActionOwner): boolean {
  return left.role === right.role && left.webContentsId === right.webContentsId
}

export class LauncherActionStore {
  private readonly actions = new Map<string, LauncherActionRecord>()
  private readonly activeActions = new Map<string, LauncherActionRecord>()
  private readonly cancelEffect: (record: LauncherActionRecord) => Promise<boolean>
  private readonly currentResultSets = new Map<string, string>()
  private readonly createId: () => string
  private readonly execute: (record: LauncherActionRecord) => Promise<void>
  private readonly maxActions: number
  private readonly now: () => number
  private readonly ttlMs: number
  private nextResultSet = 1

  constructor(options: LauncherActionStoreOptions) {
    this.createId = options.createId ?? randomUUID
    this.cancelEffect = options.cancel ?? (async () => false)
    this.execute = options.execute
    this.maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? DEFAULT_ACTION_TTL_MS
    if (!Number.isSafeInteger(this.maxActions) || this.maxActions < 1) {
      throw new Error('TockLauncher action capacity must be a positive integer')
    }
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 1) {
      throw new Error('TockLauncher action TTL must be a positive integer')
    }
  }

  publish(input: Readonly<{
    items: readonly LauncherInternalResultItem[]
    owner: LauncherActionOwner
  }>): Readonly<{ items: readonly LauncherPublicResultItem[]; resultSetId: string }> {
    assertOwner(input.owner)
    if (!Array.isArray(input.items) || input.items.length > LAUNCHER_MAX_RESULT_ITEMS) {
      throw new Error('TockLauncher result set exceeds its item limit')
    }
    this.pruneExpiredActions()
    const resultSetId = `launcher-results:${this.nextResultSet}`
    const stagedActions = new Map<string, LauncherActionRecord>()
    const items = input.items.map(item => this.publishItem(item, input.owner, resultSetId, stagedActions))
    const key = ownerKey(input.owner)
    const previousResultSet = this.currentResultSets.get(key)
    const previousActionCount = previousResultSet === undefined
      ? 0
      : [...this.actions.values()].filter(record => record.resultSetId === previousResultSet).length
    if (this.actions.size - previousActionCount + stagedActions.size > this.maxActions) {
      throw new Error('TockLauncher action capacity exceeded')
    }
    if (previousResultSet !== undefined) this.deleteResultSet(previousResultSet)
    this.nextResultSet += 1
    this.currentResultSets.set(key, resultSetId)
    for (const [actionId, record] of stagedActions) this.actions.set(actionId, record)
    return Object.freeze({ items: Object.freeze(items), resultSetId })
  }

  async invoke(input: Readonly<{
    actionId: string
    owner: LauncherActionOwner
  }>): Promise<Readonly<{ ok: true }>> {
    assertOwner(input.owner)
    if (typeof input.actionId !== 'string' || !ACTION_ID_PATTERN.test(input.actionId)) {
      throw new Error('Malformed launcher action ID')
    }
    const record = this.actions.get(input.actionId)
    if (record === undefined) throw new Error('TockLauncher action is unknown or already consumed')
    if (!sameOwner(record.owner, input.owner)) throw new Error('TockLauncher action belongs to another window')
    if (record.expiresAt <= this.now()) {
      this.actions.delete(input.actionId)
      throw new LauncherActionExpiredError()
    }
    if (this.currentResultSets.get(ownerKey(input.owner)) !== record.resultSetId) {
      this.actions.delete(input.actionId)
      throw new Error('TockLauncher action belongs to a replaced result set')
    }

    // Consume before execution so re-entrant calls and failed effects cannot replay.
    this.actions.delete(input.actionId)
    this.activeActions.set(input.actionId, record)
    try {
      await this.execute(record)
    } finally {
      this.activeActions.delete(input.actionId)
    }
    return Object.freeze({ ok: true as const })
  }

  async cancel(input: Readonly<{
    actionId: string
    owner: LauncherActionOwner
    resultSetId: string
  }>): Promise<Readonly<{ ok: true }>> {
    assertOwner(input.owner)
    if (typeof input.actionId !== 'string' || !ACTION_ID_PATTERN.test(input.actionId)) {
      throw new Error('Malformed launcher action ID')
    }
    if (typeof input.resultSetId !== 'string' || !/^launcher-results:[1-9][0-9]*$/u.test(input.resultSetId)) {
      throw new Error('Malformed launcher result set ID')
    }
    const record = this.activeActions.get(input.actionId)
    if (record === undefined) throw new Error('TockLauncher action is not active')
    if (!sameOwner(record.owner, input.owner)) throw new Error('TockLauncher action belongs to another window')
    if (record.resultSetId !== input.resultSetId || this.currentResultSets.get(ownerKey(input.owner)) !== record.resultSetId) {
      throw new Error('TockLauncher action belongs to a replaced result set')
    }
    if (!await this.cancelEffect(record)) throw new Error('TockLauncher action is not cancellable')
    this.activeActions.delete(input.actionId)
    return Object.freeze({ ok: true as const })
  }

  clear(): void {
    this.actions.clear()
    this.activeActions.clear()
    this.currentResultSets.clear()
  }

  clearOwner(owner: LauncherActionOwner): void {
    assertOwner(owner)
    const key = ownerKey(owner)
    const resultSetId = this.currentResultSets.get(key)
    if (resultSetId !== undefined) this.deleteResultSet(resultSetId)
    this.currentResultSets.delete(key)
    for (const [actionId, record] of this.activeActions) {
      if (sameOwner(record.owner, owner)) this.activeActions.delete(actionId)
    }
  }

  private pruneExpiredActions(): void {
    const now = this.now()
    for (const [actionId, record] of this.actions) {
      if (record.expiresAt <= now) this.actions.delete(actionId)
    }
  }

  private publishItem(
    item: LauncherInternalResultItem,
    owner: LauncherActionOwner,
    resultSetId: string,
    stagedActions: Map<string, LauncherActionRecord>,
  ): LauncherPublicResultItem {
    assertBoundedText(item.id, 'result ID', 512)
    assertBoundedText(item.name, 'result name', 512)
    assertBoundedText(item.description, 'result description', 2_048)
    assertBoundedText(item.sourceExtension, 'source extension', 128)
    if (item.details !== undefined && (typeof item.details !== 'string' || item.details.length > 8_192)) {
      throw new Error('Invalid launcher result details')
    }
    if (item.imageKey !== undefined
      && (typeof item.imageKey !== 'string' || !IMAGE_KEY_PATTERN.test(item.imageKey))) {
      throw new Error('Invalid launcher result image key')
    }
    if (item.imageUrl !== undefined && !isLauncherImageUrl(item.imageUrl)) {
      throw new Error('Invalid launcher result image URL')
    }
    if (item.additionalActions !== undefined
      && (!Array.isArray(item.additionalActions) || item.additionalActions.length > MAX_ACTIONS_PER_ITEM)) {
      throw new Error('TockLauncher result exceeds its action limit')
    }
    const defaultAction = this.publishAction(item.defaultAction, item.sourceExtension, owner, resultSetId, stagedActions)
    const additionalActions = item.additionalActions?.map(action => this.publishAction(
      action,
      item.sourceExtension,
      owner,
      resultSetId,
      stagedActions,
    ))
    return Object.freeze({
      ...(additionalActions === undefined ? null : { additionalActions: Object.freeze(additionalActions) }),
      defaultAction,
      description: item.description,
      ...(item.details === undefined ? null : { details: item.details }),
      id: item.id,
      ...(item.imageKey === undefined ? null : { imageKey: item.imageKey }),
      ...(item.imageUrl === undefined ? null : { imageUrl: item.imageUrl }),
      name: item.name,
      sourceExtension: item.sourceExtension,
    })
  }

  private publishAction(
    action: LauncherInternalAction,
    sourceExtension: string,
    owner: LauncherActionOwner,
    resultSetId: string,
    stagedActions: Map<string, LauncherActionRecord>,
  ): LauncherPublicAction {
    assertBoundedText(action.description, 'action description', 512)
    if (typeof action.handlerKey !== 'string' || !HANDLER_KEY_PATTERN.test(action.handlerKey)) {
      throw new Error('Invalid launcher action handler key')
    }
    if (typeof action.argument !== 'string' || action.argument.length > MAX_ARGUMENT_LENGTH) {
      throw new Error('Invalid launcher action argument')
    }
    if (action.hideWindowAfterInvocation !== undefined && typeof action.hideWindowAfterInvocation !== 'boolean') {
      throw new Error('Invalid launcher action window policy')
    }
    if (action.keyboardShortcut !== undefined
      && (typeof action.keyboardShortcut !== 'string'
        || action.keyboardShortcut.length === 0
        || action.keyboardShortcut.length > 128)) {
      throw new Error('Invalid launcher action keyboard shortcut')
    }
    if (action.requiresConfirmation !== undefined && typeof action.requiresConfirmation !== 'boolean') {
      throw new Error('Invalid launcher action confirmation policy')
    }

    const actionId = `launcher-action:${this.createId()}`
    if (!ACTION_ID_PATTERN.test(actionId) || this.actions.has(actionId) || stagedActions.has(actionId)) {
      throw new Error('TockLauncher action ID generator returned an invalid or duplicate ID')
    }
    const record = Object.freeze({
      actionId,
      argument: action.argument,
      expiresAt: this.now() + this.ttlMs,
      handlerKey: action.handlerKey,
      hideWindowAfterInvocation: action.hideWindowAfterInvocation === true,
      owner: Object.freeze({ ...owner }),
      requiresConfirmation: action.requiresConfirmation === true,
      resultSetId,
      sourceExtension,
    })
    stagedActions.set(actionId, record)
    return Object.freeze({
      actionId,
      description: action.description,
      ...(action.hideWindowAfterInvocation === undefined ? null : { hideWindowAfterInvocation: action.hideWindowAfterInvocation }),
      ...(action.keyboardShortcut === undefined ? null : { keyboardShortcut: action.keyboardShortcut }),
      ...(action.requiresConfirmation === undefined ? null : { requiresConfirmation: action.requiresConfirmation }),
    })
  }

  private deleteResultSet(resultSetId: string): void {
    for (const [actionId, record] of this.actions) {
      if (record.resultSetId === resultSetId) this.actions.delete(actionId)
    }
  }
}
