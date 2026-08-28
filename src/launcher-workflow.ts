import { createHash } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { LauncherActionRecord, LauncherInternalAction, LauncherInternalResultItem } from './launcher-actions.ts'
import {
  LAUNCHER_WORKFLOW_ID_PATTERN,
  LAUNCHER_WORKFLOW_SETTING_KEY,
  parseLauncherWorkflows,
  type LauncherWorkflow,
  type LauncherWorkflowAction,
  type LauncherWorkflowToken,
} from './launcher-workflow-contract.ts'
import {
  LAUNCHER_TERMINALS,
  launcherTerminalDefaults,
  type LauncherTerminalId,
  type LauncherTerminalPlatform,
} from './launcher-terminal-config.ts'
import { runBoundedWorkflowCommand, type LauncherWorkflowCommandResult } from './launcher-workflow-process.ts'

export { parseLauncherWorkflows, type LauncherWorkflow } from './launcher-workflow-contract.ts'

export type LauncherWorkflowPathIdentity = Readonly<{ dev: string; ino: string }>
export type LauncherWorkflowPathTarget = Readonly<{
  canonicalPath: string
  identity: LauncherWorkflowPathIdentity
  kind: 'directory' | 'file'
}>

export type LauncherWorkflowAudit = Readonly<{
  actionCount: number
  commandCount: number
  durationMs: number
  outcome: 'cancelled' | 'completed' | 'denied' | 'failed'
  stderrBytes: number
  stdoutBytes: number
  workflowId: string
  workflowSha256: string
}>

export type LauncherWorkflowConfirmation =
  | Readonly<{ actionName: string; actionType: 'OpenFile'; filePath: string; workflowName: string }>
  | Readonly<{ actionName: string; actionType: 'OpenUrl'; url: string; workflowName: string }>
  | Readonly<{
      actionName: string
      actionType: 'OpenTerminal'
      command: string
      terminalId: LauncherTerminalId
      workflowName: string
      workingDirectory: string
    }>
  | Readonly<{
      actionName: string
      actionType: 'ExecuteCommand'
      command: string
      workflowName: string
      workingDirectory: string
    }>

export type LauncherWorkflowEffects = Readonly<{
  auditWorkflow: (record: LauncherWorkflowAudit) => Promise<void> | void
  confirmAction: (request: LauncherWorkflowConfirmation) => Promise<boolean> | boolean
  /** Optional signal-aware variants keep the public compatibility call shape exact. */
  confirmActionWithSignal?: (request: LauncherWorkflowConfirmation, signal: AbortSignal) => Promise<boolean> | boolean
  executeCommand?: (request: Readonly<{
    command: string
    signal: AbortSignal
    workingDirectory: string
  }>) => Promise<LauncherWorkflowCommandResult>
  openFile: (filePath: string) => Promise<void> | void
  openFileWithSignal?: (filePath: string, signal: AbortSignal) => Promise<void> | void
  openTerminal: (request: Readonly<{
    command: string
    terminalId: LauncherTerminalId
    workingDirectory: string
  }>) => Promise<void> | void
  openTerminalWithSignal?: (request: Readonly<{
    command: string
    terminalId: LauncherTerminalId
    workingDirectory: string
  }>, signal: AbortSignal) => Promise<void> | void
  openUrl: (url: string) => Promise<void> | void
  openUrlWithSignal?: (url: string, signal: AbortSignal) => Promise<void> | void
}>

type WorkflowPathCapture = (target: string, platform: LauncherTerminalPlatform, signal: AbortSignal) => Promise<LauncherWorkflowPathTarget | undefined>
type WorkflowPathRevalidation = (target: string, expected: LauncherWorkflowPathTarget, signal: AbortSignal) => Promise<boolean>

type WorkflowOptions = Readonly<{
  captureHomeIdentity?: (target: string, signal: AbortSignal) => Promise<LauncherWorkflowPathIdentity | undefined>
  capturePath?: WorkflowPathCapture
  effects: LauncherWorkflowEffects
  enabledExtensionIds: () => readonly string[]
  getSetting: <T>(key: string, fallback: T) => T
  homeIdentity?: LauncherWorkflowPathIdentity
  homePath: string
  now?: () => number
  onProviderError?: (error: Error) => void
  platform: LauncherTerminalPlatform
  revalidatePath?: WorkflowPathRevalidation
  validateHome?: (target: string, expected: LauncherWorkflowPathIdentity, signal: AbortSignal) => Promise<boolean>
  validateTerminal?: (terminalId: LauncherTerminalId, signal: AbortSignal) => Promise<boolean>
}>

type KnownWorkflow = Readonly<{
  generation: number
  homeIdentity?: LauncherWorkflowPathIdentity
  pathTargets: ReadonlyMap<string, LauncherWorkflowPathTarget>
  urlTargets: ReadonlyMap<string, string>
  workflow: LauncherWorkflow
  workflowSha256: string
}>

type ActiveWorkflow = Readonly<{
  completed: Promise<void>
  controller: AbortController
  finish: () => void
  token: string
}>

const HANDLER = 'invoke-workflow'
const MAX_HOME_LENGTH = 4_096
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\0\r\n]/u.test(value)
}

function canonicalLauncherWorkflow(workflow: LauncherWorkflow): unknown {
  return {
    id: workflow.id,
    name: workflow.name,
    actions: workflow.actions.map(action => ({ args: { ...action.args }, handlerId: action.handlerId, id: action.id, name: action.name })),
    ...(workflow.requiresConfirmation === undefined ? {} : { requiresConfirmation: workflow.requiresConfirmation }),
  }
}

export function launcherWorkflowDigest(workflow: LauncherWorkflow): string {
  return createHash('sha256').update(JSON.stringify(canonicalLauncherWorkflow(workflow)), 'utf8').digest('hex')
}

export function serializeLauncherWorkflowToken(workflow: LauncherWorkflow): string {
  return JSON.stringify({ kind: 'workflow', version: 1, workflowId: workflow.id, workflowSha256: launcherWorkflowDigest(workflow) })
}

export function parseLauncherWorkflowToken(value: unknown): LauncherWorkflowToken {
  if (!boundedText(value, 512)) throw new Error('Invalid TockLauncher Workflow action token')
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('Invalid TockLauncher Workflow action token') }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['kind', 'version', 'workflowId', 'workflowSha256'])
    || parsed.kind !== 'workflow' || parsed.version !== 1 || !boundedText(parsed.workflowId, 128)
    || !LAUNCHER_WORKFLOW_ID_PATTERN.test(parsed.workflowId) || typeof parsed.workflowSha256 !== 'string'
    || !DIGEST_PATTERN.test(parsed.workflowSha256)) throw new Error('Invalid TockLauncher Workflow action token')
  return Object.freeze({ kind: 'workflow', version: 1, workflowId: parsed.workflowId, workflowSha256: parsed.workflowSha256 })
}
const MAX_TOKEN_LENGTH = 512
const MAX_AUDIT_DURATION = 86_400_000
const MAX_COMMAND_BYTES = 1_048_576

function isAbsolutePath(platform: LauncherTerminalPlatform, value: string): boolean {
  return platform === 'Windows' ? path.win32.isAbsolute(value) : path.posix.isAbsolute(value)
}

function identityPart(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value >= 0n ? value.toString(10) : undefined
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined
  if (typeof value === 'string' && /^[0-9]+$/u.test(value)) return value.replace(/^0+(?=\d)/u, '')
  return undefined
}

function identityOf(value: { dev: unknown; ino: unknown }): LauncherWorkflowPathIdentity | undefined {
  const dev = identityPart(value.dev)
  const ino = identityPart(value.ino)
  return dev === undefined || ino === undefined ? undefined : Object.freeze({ dev, ino })
}

function sameIdentity(left: LauncherWorkflowPathIdentity, right: LauncherWorkflowPathIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function validIdentity(value: unknown): value is LauncherWorkflowPathIdentity {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { dev?: unknown; ino?: unknown }
  return typeof candidate.dev === 'string' && /^[0-9]+$/u.test(candidate.dev)
    && typeof candidate.ino === 'string' && /^[0-9]+$/u.test(candidate.ino)
}

function validPathTarget(platform: LauncherTerminalPlatform, value: unknown): value is LauncherWorkflowPathTarget {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { canonicalPath?: unknown; identity?: unknown; kind?: unknown }
  return boundedPath(platform, candidate.canonicalPath)
    && (candidate.kind === 'file' || candidate.kind === 'directory')
    && validIdentity(candidate.identity)
}

function samePath(platform: LauncherTerminalPlatform, left: string, right: string): boolean {
  const api = platform === 'Windows' ? path.win32 : path.posix
  const normalize = api.normalize(left)
  const normalizedRight = api.normalize(right)
  return platform === 'Windows'
    ? normalize.toLocaleLowerCase('en-US') === normalizedRight.toLocaleLowerCase('en-US')
    : normalize === normalizedRight
}

function boundedPath(platform: LauncherTerminalPlatform, value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_HOME_LENGTH
    && !/[\0\r\n]/u.test(value)
    && isAbsolutePath(platform, value)
}

function pathParts(platform: LauncherTerminalPlatform, target: string): readonly string[] {
  const api = platform === 'Windows' ? path.win32 : path.posix
  const parsed = api.parse(target)
  const relative = api.relative(parsed.root, target)
  return [parsed.root, ...relative.split(api.sep).filter(Boolean)]
}

/** Capture a canonical regular file/directory and reject every symlink component. */
export async function captureLauncherWorkflowPath(
  target: string,
  platform: LauncherTerminalPlatform,
  signal: AbortSignal = new AbortController().signal,
): Promise<LauncherWorkflowPathTarget | undefined> {
  if (!boundedPath(platform, target) || signal.aborted) return undefined
  try {
    let current = pathParts(platform, target)[0]!
    for (const component of pathParts(platform, target).slice(1)) {
      if (signal.aborted) return undefined
      current = platform === 'Windows' ? path.win32.join(current, component) : path.posix.join(current, component)
      const selected = await lstat(current, { bigint: true })
      if (selected.isSymbolicLink()) return undefined
    }
    const selected = await lstat(target, { bigint: true })
    if (selected.isSymbolicLink()) return undefined
    const canonicalPath = await realpath(target)
    const canonical = await lstat(canonicalPath, { bigint: true })
    if (canonical.isSymbolicLink() || (!canonical.isFile() && !canonical.isDirectory())) return undefined
    const identity = identityOf(canonical)
    if (identity === undefined || signal.aborted) return undefined
    return Object.freeze({
      canonicalPath,
      identity,
      kind: canonical.isDirectory() ? 'directory' : 'file',
    })
  } catch { return undefined }
}

export async function revalidateLauncherWorkflowPath(
  target: string,
  expected: LauncherWorkflowPathTarget,
  platform: LauncherTerminalPlatform,
  signal: AbortSignal = new AbortController().signal,
): Promise<boolean> {
  const current = await captureLauncherWorkflowPath(target, platform, signal)
  return current !== undefined
    && samePath(platform, current.canonicalPath, expected.canonicalPath)
    && current.kind === expected.kind
    && sameIdentity(current.identity, expected.identity)
}

function normalizeWorkflowUrl(value: string): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 || /[\0\r\n]/u.test(value)) return undefined
  try {
    const parsed = new URL(value)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.hostname.length === 0 || parsed.username || parsed.password) return undefined
    return parsed.href
  } catch { return undefined }
}

function abortError(signal: AbortSignal, fallback: string): Error {
  return signal.reason instanceof Error ? signal.reason : new Error(fallback)
}

function throwIfAborted(signal: AbortSignal, fallback = 'TockLauncher Workflow was canceled'): void {
  if (signal.aborted) throw abortError(signal, fallback)
}

async function awaitAbortable<T>(operation: Promise<T> | T, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal)
  const pending = Promise.resolve().then(() => operation)
  void pending.catch(() => undefined)
  let onAbort!: () => void
  const canceled = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortError(signal, 'TockLauncher Workflow was canceled'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try { return await Promise.race([pending, canceled]) }
  finally { signal.removeEventListener('abort', onAbort) }
}

function boundedStatus(_error: unknown): Error {
  return new Error('TockLauncher Workflow is unavailable.')
}

function isCommandAction(action: LauncherWorkflowAction): action is Extract<LauncherWorkflowAction, { handlerId: 'OpenTerminal' | 'ExecuteCommand' }> {
  return action.handlerId === 'OpenTerminal' || action.handlerId === 'ExecuteCommand'
}

function terminalIsEnabled(options: WorkflowOptions, terminalId: LauncherTerminalId): boolean {
  const defaults = launcherTerminalDefaults(options.platform)
  const configured = options.getSetting<unknown>('extension[TerminalLauncher].terminalIds', defaults)
  const ids = Array.isArray(configured) && configured.every(value => typeof value === 'string')
    ? configured as readonly string[]
    : defaults
  return LAUNCHER_TERMINALS[options.platform].some(item => item.id === terminalId && ids.includes(item.id))
}

function commandResultBytes(result: LauncherWorkflowCommandResult): Readonly<{ stderrBytes: number; stdoutBytes: number }> {
  const stderrBytes = Number.isSafeInteger(result.stderrBytes) && result.stderrBytes >= 0 ? result.stderrBytes : -1
  const stdoutBytes = Number.isSafeInteger(result.stdoutBytes) && result.stdoutBytes >= 0 ? result.stdoutBytes : -1
  if (stderrBytes < 0 || stdoutBytes < 0 || stderrBytes + stdoutBytes > MAX_COMMAND_BYTES) throw new Error('Workflow command result is invalid')
  return Object.freeze({ stderrBytes, stdoutBytes })
}

function actionForConfirmation(action: LauncherWorkflowAction, workflow: LauncherWorkflow, homePath: string): LauncherWorkflowConfirmation {
  const base = { actionName: action.name, workflowName: workflow.name } as const
  switch (action.handlerId) {
    case 'OpenFile': return { ...base, actionType: 'OpenFile', filePath: action.args.filePath }
    case 'OpenUrl': return { ...base, actionType: 'OpenUrl', url: normalizeWorkflowUrl(action.args.url)! }
    case 'OpenTerminal': return { ...base, actionType: 'OpenTerminal', command: action.args.command, terminalId: action.args.terminalId, workingDirectory: homePath }
    case 'ExecuteCommand': return { ...base, actionType: 'ExecuteCommand', command: action.args.command, workingDirectory: homePath }
  }
}

function fixedAction(argument: string, requiresConfirmation: boolean): LauncherInternalAction {
  return Object.freeze({
    argument,
    description: 'Invoke workflow',
    handlerKey: HANDLER,
    hideWindowAfterInvocation: true,
    requiresConfirmation,
  })
}

function isPlatform(value: unknown): value is LauncherTerminalPlatform {
  return value === 'Linux' || value === 'macOS' || value === 'Windows'
}

export function createLauncherWorkflow(options: WorkflowOptions): Readonly<{
  cancelAction: (record: LauncherActionRecord) => Promise<boolean>
  close: () => Promise<void>
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  getLastError: () => string | undefined
  invalidate: (reason?: string, preserveSignal?: AbortSignal) => void
  loadIndexedItems: (signal?: AbortSignal, preserveSignal?: AbortSignal) => Promise<readonly LauncherInternalResultItem[]>
  waitForIdle: () => Promise<void>
}> {
  if (!isPlatform(options.platform) || !boundedPath(options.platform, options.homePath)) throw new Error('Invalid TockLauncher Workflow home path')
  const now = options.now ?? Date.now
  const capturePath = options.capturePath ?? ((target, platform, signal) => captureLauncherWorkflowPath(target, platform, signal))
  const revalidatePath = options.revalidatePath ?? ((target, expected, signal) => revalidateLauncherWorkflowPath(target, expected, options.platform, signal))
  const active = new Map<string, ActiveWorkflow>()
  const activeControllers = new Set<AbortController>()
  const activeWork = new Set<Promise<unknown>>()
  let currentActions = new Map<string, KnownWorkflow>()
  let generation = 0
  let closed = false
  let lastError: string | undefined

  const track = <T>(operation: Promise<T>): Promise<T> => {
    let tracked!: Promise<T>
    tracked = operation.then(value => { activeWork.delete(tracked); return value }, reason => { activeWork.delete(tracked); throw reason })
    activeWork.add(tracked)
    return tracked
  }
  const waitForIdle = async (): Promise<void> => {
    while (activeWork.size > 0) await Promise.allSettled([...activeWork])
  }
  const abortAll = (reason: Error, preserveSignal?: AbortSignal): void => {
    for (const controller of activeControllers) if (controller.signal !== preserveSignal) controller.abort(reason)
  }
  const invalidate = (reason = 'TockLauncher Workflow provider was invalidated', preserveSignal?: AbortSignal): void => {
    generation += 1
    currentActions = new Map()
    lastError = undefined
    abortAll(new Error(reason), preserveSignal)
  }
  const report = (reason: unknown): void => {
    const error = boundedStatus(reason)
    lastError = 'Workflow is unavailable.'
    options.onProviderError?.(error)
  }
  const getLastError = (): string | undefined => lastError

  const stageWorkflow = async (workflow: LauncherWorkflow, loadGeneration: number, signal: AbortSignal): Promise<KnownWorkflow | undefined> => {
    const pathTargets = new Map<string, LauncherWorkflowPathTarget>()
    const urlTargets = new Map<string, string>()
    let homeIdentity = options.homeIdentity
    if (homeIdentity !== undefined && !validIdentity(homeIdentity)) return undefined
    if (workflow.actions.some(isCommandAction) && homeIdentity === undefined && options.captureHomeIdentity !== undefined) {
      homeIdentity = await options.captureHomeIdentity(options.homePath, signal)
    }
    if (workflow.actions.some(isCommandAction) && (homeIdentity === undefined || !validIdentity(homeIdentity))) return undefined
    for (const action of workflow.actions) {
      throwIfAborted(signal, 'TockLauncher Workflow load canceled')
      if (action.handlerId === 'OpenFile') {
        const target = await capturePath(action.args.filePath, options.platform, signal)
        if (target === undefined || !validPathTarget(options.platform, target)) return undefined
        pathTargets.set(action.id, target)
      } else if (action.handlerId === 'OpenUrl') {
        const normalized = normalizeWorkflowUrl(action.args.url)
        if (normalized === undefined) return undefined
        urlTargets.set(action.id, normalized)
      } else if (action.handlerId === 'OpenTerminal') {
        if (!terminalIsEnabled(options, action.args.terminalId)) return undefined
      }
    }
    return Object.freeze({
      generation: loadGeneration,
      ...(homeIdentity === undefined ? {} : { homeIdentity }),
      pathTargets,
      urlTargets,
      workflow,
      workflowSha256: launcherWorkflowDigest(workflow),
    })
  }

  const loadIndexedItems = (signal?: AbortSignal, preserveSignal?: AbortSignal): Promise<readonly LauncherInternalResultItem[]> => track((async () => {
    if (closed) throw new Error('TockLauncher Workflow provider is closed')
    if (signal?.aborted) throw abortError(signal, 'TockLauncher Workflow load canceled')
    const loadGeneration = ++generation
    currentActions = new Map()
    abortAll(new Error('TockLauncher Workflow load superseded'), preserveSignal)
    lastError = undefined
    if (!options.enabledExtensionIds().includes('Workflow')) return Object.freeze([])
    const controller = new AbortController()
    const relay = (): void => controller.abort(abortError(signal!, 'TockLauncher Workflow load canceled'))
    activeControllers.add(controller)
    if (signal?.aborted) relay()
    else signal?.addEventListener('abort', relay, { once: true })
    const staged = new Map<string, KnownWorkflow>()
    const items: LauncherInternalResultItem[] = []
    try {
      let workflows: readonly LauncherWorkflow[]
      try { workflows = parseLauncherWorkflows(options.getSetting<unknown>(LAUNCHER_WORKFLOW_SETTING_KEY, []), options.platform) }
      catch (error) {
        report(error)
        return Object.freeze([])
      }
      for (const workflow of workflows) {
        throwIfAborted(controller.signal, 'TockLauncher Workflow load canceled')
        if (closed || loadGeneration !== generation) throw new Error('TockLauncher Workflow load superseded')
        try {
          const known = await stageWorkflow(workflow, loadGeneration, controller.signal)
          if (known === undefined) {
            report(new Error('Workflow target is unavailable'))
            continue
          }
          const token = serializeLauncherWorkflowToken(workflow)
          const requiresConfirmation = workflow.requiresConfirmation === true || workflow.actions.some(isCommandAction)
          staged.set(token, known)
          items.push(Object.freeze({
            defaultAction: fixedAction(token, requiresConfirmation),
            description: 'Workflow',
            details: workflow.actions.map(action => action.name).join(', '),
            id: workflow.id,
            imageKey: 'workflow',
            name: workflow.name,
            sourceExtension: 'Workflow',
          }))
        } catch (error) {
          if (controller.signal.aborted) throw error
          report(error)
        }
      }
      if (closed || controller.signal.aborted || loadGeneration !== generation) throw abortError(controller.signal, 'TockLauncher Workflow load superseded')
      currentActions = staged
      return Object.freeze(items)
    } finally {
      signal?.removeEventListener('abort', relay)
      activeControllers.delete(controller)
    }
  })())

  const currentWorkflow = (token: LauncherWorkflowToken, known: KnownWorkflow): LauncherWorkflow | undefined => {
    if (closed || generation !== known.generation || currentActions.get(JSON.stringify(token)) !== known || !options.enabledExtensionIds().includes('Workflow')) return undefined
    try {
      const parsed = parseLauncherWorkflows(options.getSetting<unknown>(LAUNCHER_WORKFLOW_SETTING_KEY, []), options.platform)
      const workflow = parsed.find(candidate => candidate.id === token.workflowId)
      return workflow !== undefined && launcherWorkflowDigest(workflow) === token.workflowSha256 ? workflow : undefined
    } catch { return undefined }
  }

  const executeAction = (record: LauncherActionRecord): Promise<boolean> => track((async () => {
    if (record.handlerKey !== HANDLER) return false
    if (record.sourceExtension !== 'Workflow') throw new Error('Invalid TockLauncher Workflow action policy')
    if (closed) throw new Error('TockLauncher Workflow provider is closed')
    if (typeof record.argument !== 'string' || record.argument.length > MAX_TOKEN_LENGTH) throw new Error('Invalid TockLauncher Workflow action token')
    const token = parseLauncherWorkflowToken(record.argument)
    const known = currentActions.get(record.argument)
    if (known === undefined || known.workflowSha256 !== token.workflowSha256 || known.workflow.id !== token.workflowId) throw new Error('Action is not from the current main-owned workflow catalog')
    const workflow = currentWorkflow(token, known)
    if (workflow === undefined) throw new Error('TockLauncher Workflow action is stale')
    const controller = new AbortController()
    activeControllers.add(controller)
    let finish!: () => void
    const completed = new Promise<void>(resolve => { finish = resolve })
    active.set(record.actionId, Object.freeze({ completed, controller, finish, token: record.argument }))
    const startedAt = now()
    let stdoutBytes = 0
    let stderrBytes = 0
    let auditDone = false
    const audit = async (outcome: LauncherWorkflowAudit['outcome']): Promise<void> => {
      if (auditDone) return
      auditDone = true
      // Once the outcome is being recorded, cancellation no longer owns this action.
      active.delete(record.actionId)
      try {
        await options.effects.auditWorkflow(Object.freeze({
          actionCount: workflow.actions.length,
          commandCount: workflow.actions.filter(isCommandAction).length,
          durationMs: Math.min(MAX_AUDIT_DURATION, Math.max(0, now() - startedAt)),
          outcome,
          stderrBytes,
          stdoutBytes,
          workflowId: workflow.id,
          workflowSha256: token.workflowSha256,
        }))
      } catch { /* audit failure never exposes or changes action authority */ }
    }
    const ensureCurrent = (): void => {
      throwIfAborted(controller.signal)
      if (closed || !options.enabledExtensionIds().includes('Workflow') || currentActions.get(record.argument) !== known || generation !== known.generation) throw new Error('TockLauncher Workflow action is stale')
      const current = currentWorkflow(token, known)
      if (current === undefined) throw new Error('TockLauncher Workflow action is stale')
    }
    const validateHome = async (): Promise<void> => {
      if (known.homeIdentity === undefined || !boundedPath(options.platform, options.homePath)) throw new Error('TockLauncher Workflow home is unavailable')
      if (options.captureHomeIdentity !== undefined) {
        const current = await options.captureHomeIdentity(options.homePath, controller.signal)
        if (current === undefined || !sameIdentity(current, known.homeIdentity)) throw new Error('TockLauncher Workflow home changed')
      }
      if (options.validateHome !== undefined && !await options.validateHome(options.homePath, known.homeIdentity, controller.signal)) throw new Error('TockLauncher Workflow home changed')
    }
    const validateAction = async (action: LauncherWorkflowAction): Promise<void> => {
      ensureCurrent()
      if (action.handlerId === 'OpenFile') {
        const expected = known.pathTargets.get(action.id)
        if (expected === undefined || !await revalidatePath(action.args.filePath, expected, controller.signal)) throw new Error('TockLauncher Workflow file target changed')
      } else if (action.handlerId === 'OpenUrl') {
        const normalized = normalizeWorkflowUrl(action.args.url)
        if (normalized === undefined || known.urlTargets.get(action.id) !== normalized) throw new Error('TockLauncher Workflow URL target changed')
      } else if (action.handlerId === 'OpenTerminal') {
        if (!LAUNCHER_TERMINALS[options.platform].some(item => item.id === action.args.terminalId) || !terminalIsEnabled(options, action.args.terminalId)) throw new Error('TockLauncher Workflow terminal is unavailable')
        await validateHome()
        if (options.validateTerminal !== undefined && !await options.validateTerminal(action.args.terminalId, controller.signal)) throw new Error('TockLauncher Workflow terminal is unavailable')
      } else {
        await validateHome()
      }
      ensureCurrent()
    }
    const confirm = async (action: LauncherWorkflowAction): Promise<boolean> => {
      const request = actionForConfirmation(action, workflow, options.homePath)
      if (options.effects.confirmActionWithSignal !== undefined) return await awaitAbortable(options.effects.confirmActionWithSignal(request, controller.signal), controller.signal)
      return await awaitAbortable(options.effects.confirmAction(request), controller.signal)
    }
    const effect = async (action: LauncherWorkflowAction): Promise<void> => {
      ensureCurrent()
      if (action.handlerId === 'OpenFile') {
        const target = known.pathTargets.get(action.id)
        if (target === undefined) throw new Error('TockLauncher Workflow file target is unavailable')
        if (options.effects.openFileWithSignal !== undefined) await awaitAbortable(options.effects.openFileWithSignal(target.canonicalPath, controller.signal), controller.signal)
        else await awaitAbortable(options.effects.openFile(target.canonicalPath), controller.signal)
      } else if (action.handlerId === 'OpenUrl') {
        const url = normalizeWorkflowUrl(action.args.url)
        if (url === undefined) throw new Error('TockLauncher Workflow URL target is unavailable')
        if (options.effects.openUrlWithSignal !== undefined) await awaitAbortable(options.effects.openUrlWithSignal(url, controller.signal), controller.signal)
        else await awaitAbortable(options.effects.openUrl(url), controller.signal)
      } else if (action.handlerId === 'OpenTerminal') {
        const request = Object.freeze({ command: action.args.command, terminalId: action.args.terminalId, workingDirectory: options.homePath })
        if (options.effects.openTerminalWithSignal !== undefined) await awaitAbortable(options.effects.openTerminalWithSignal(request, controller.signal), controller.signal)
        else await awaitAbortable(options.effects.openTerminal(request), controller.signal)
      } else {
        const executeCommand = options.effects.executeCommand ?? (async request => await runBoundedWorkflowCommand({ command: request.command, platform: options.platform, signal: request.signal, workingDirectory: request.workingDirectory }))
        const result = commandResultBytes(await executeCommand({ command: action.args.command, signal: controller.signal, workingDirectory: options.homePath }))
        stdoutBytes += result.stdoutBytes
        stderrBytes += result.stderrBytes
      }
      ensureCurrent()
    }
    try {
      // Approvals are deliberately a separate phase: a denied/invalid later action leaves no earlier effect.
      for (const action of workflow.actions) {
        await validateAction(action)
        if (!await confirm(action)) {
          await audit('denied')
          return true
        }
        await validateAction(action)
      }
      for (const action of workflow.actions) {
        await validateAction(action)
        await effect(action)
      }
      await audit('completed')
      return true
    } catch (error) {
      if (controller.signal.aborted) {
        await audit('cancelled')
        throw new Error('TockLauncher Workflow was canceled', { cause: error })
      }
      await audit('failed')
      throw error
    } finally {
      if (currentActions.get(record.argument) === known) currentActions.delete(record.argument)
      active.delete(record.actionId)
      activeControllers.delete(controller)
      finish()
    }
  })())

  const cancelAction = async (record: LauncherActionRecord): Promise<boolean> => {
    if (record.handlerKey !== HANDLER || record.sourceExtension !== 'Workflow') return false
    const execution = active.get(record.actionId)
    if (execution === undefined) return false
    execution.controller.abort(new Error('TockLauncher Workflow was canceled'))
    await execution.completed
    return true
  }

  const close = async (): Promise<void> => {
    if (closed) { await waitForIdle(); return }
    closed = true
    generation += 1
    currentActions = new Map()
    abortAll(new Error('TockLauncher Workflow provider is closed'))
    await waitForIdle()
  }

  return Object.freeze({ cancelAction, close, executeAction, getLastError, invalidate, loadIndexedItems, waitForIdle })
}
