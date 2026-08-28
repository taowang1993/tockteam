import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  LAUNCHER_TERMINALS,
  type LauncherTerminalId,
  type LauncherTerminalPlatform,
} from './launcher-terminal-config.ts'

export type LauncherWorkflowFileAction = Readonly<{
  args: Readonly<{ filePath: string }>
  handlerId: 'OpenFile'
  id: string
  name: string
}>

export type LauncherWorkflowUrlAction = Readonly<{
  args: Readonly<{ url: string }>
  handlerId: 'OpenUrl'
  id: string
  name: string
}>

export type LauncherWorkflowTerminalAction = Readonly<{
  args: Readonly<{ command: string; terminalId: LauncherTerminalId }>
  handlerId: 'OpenTerminal'
  id: string
  name: string
}>

export type LauncherWorkflowCommandAction = Readonly<{
  args: Readonly<{ command: string }>
  handlerId: 'ExecuteCommand'
  id: string
  name: string
}>

export type LauncherWorkflowAction =
  | LauncherWorkflowFileAction
  | LauncherWorkflowUrlAction
  | LauncherWorkflowTerminalAction
  | LauncherWorkflowCommandAction

export type LauncherWorkflow = Readonly<{
  actions: readonly LauncherWorkflowAction[]
  id: string
  name: string
  requiresConfirmation?: boolean
}>

export type LauncherWorkflowToken = Readonly<{
  kind: 'workflow'
  version: 1
  workflowId: string
  workflowSha256: string
}>

const WORKFLOW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u
const PLATFORM_IDS = new Set<LauncherTerminalPlatform>(['Linux', 'macOS', 'Windows'])

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function boundedText(value: unknown, maxLength: number, nonBlank = true): value is string {
  return typeof value === 'string'
    && value.length <= maxLength
    && (!nonBlank || value.trim().length > 0)
    && !/[\0\r\n]/u.test(value)
}

function absoluteFilePath(value: unknown, platform: LauncherTerminalPlatform): value is string {
  if (!boundedText(value, 4_096)) return false
  return platform === 'Windows'
    ? /^[A-Za-z]:[\\/]/u.test(value)
    : path.posix.isAbsolute(value)
}

function parseAction(value: unknown, platform: LauncherTerminalPlatform): LauncherWorkflowAction {
  if (!isRecord(value)
    || !hasExactKeys(value, ['args', 'handlerId', 'id', 'name'])
    || !boundedText(value.id, 128)
    || !boundedText(value.name, 128)
    || !isRecord(value.args)) {
    throw new Error('Invalid TockLauncher Workflow action')
  }
  const args = value.args
  if (value.handlerId === 'OpenFile') {
    if (!hasExactKeys(args, ['filePath']) || !absoluteFilePath(args.filePath, platform)) {
      throw new Error('Invalid TockLauncher Workflow file action')
    }
    return Object.freeze({ args: Object.freeze({ filePath: args.filePath }), handlerId: 'OpenFile', id: value.id, name: value.name })
  }
  if (value.handlerId === 'OpenUrl') {
    if (!hasExactKeys(args, ['url']) || !boundedText(args.url, 4_096)) throw new Error('Invalid TockLauncher Workflow URL action')
    try {
      const parsed = new URL(args.url)
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.hostname.length === 0 || parsed.username || parsed.password) throw new Error()
    } catch {
      throw new Error('Invalid TockLauncher Workflow URL action')
    }
    return Object.freeze({ args: Object.freeze({ url: args.url }), handlerId: 'OpenUrl', id: value.id, name: value.name })
  }
  if (value.handlerId === 'OpenTerminal') {
    if (!hasExactKeys(args, ['command', 'terminalId'])
      || !boundedText(args.command, 512)
      || !boundedText(args.terminalId, 128)
      || !PLATFORM_IDS.has(platform)
      || !LAUNCHER_TERMINALS[platform].some(item => item.id === args.terminalId)) {
      throw new Error('Invalid TockLauncher Workflow terminal action')
    }
    return Object.freeze({
      args: Object.freeze({ command: args.command, terminalId: args.terminalId as LauncherTerminalId }),
      handlerId: 'OpenTerminal',
      id: value.id,
      name: value.name,
    })
  }
  if (value.handlerId === 'ExecuteCommand') {
    if (!hasExactKeys(args, ['command']) || !boundedText(args.command, 2_048)) throw new Error('Invalid TockLauncher Workflow command action')
    return Object.freeze({ args: Object.freeze({ command: args.command }), handlerId: 'ExecuteCommand', id: value.id, name: value.name })
  }
  throw new Error('Invalid TockLauncher Workflow action handler')
}

export function parseLauncherWorkflows(value: unknown, platform: LauncherTerminalPlatform): readonly LauncherWorkflow[] {
  if (!PLATFORM_IDS.has(platform) || !Array.isArray(value) || value.length > 64) throw new Error('Invalid TockLauncher Workflow settings')
  const workflowIds = new Set<string>()
  const parsed = value.map(candidate => {
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, candidate.requiresConfirmation === undefined
        ? ['actions', 'id', 'name']
        : ['actions', 'id', 'name', 'requiresConfirmation'])
      || !boundedText(candidate.id, 128)
      || !WORKFLOW_ID_PATTERN.test(candidate.id)
      || workflowIds.has(candidate.id)
      || !boundedText(candidate.name, 128)
      || (candidate.requiresConfirmation !== undefined && typeof candidate.requiresConfirmation !== 'boolean')
      || !Array.isArray(candidate.actions)
      || candidate.actions.length === 0
      || candidate.actions.length > 16) {
      throw new Error('Invalid TockLauncher Workflow definition')
    }
    workflowIds.add(candidate.id)
    const actionIds = new Set<string>()
    const actions = candidate.actions.map(candidateAction => {
      const parsedAction = parseAction(candidateAction, platform)
      if (actionIds.has(parsedAction.id)) throw new Error('Invalid duplicate TockLauncher Workflow action ID')
      actionIds.add(parsedAction.id)
      return parsedAction
    })
    return Object.freeze({
      actions: Object.freeze(actions),
      id: candidate.id,
      name: candidate.name,
      ...(candidate.requiresConfirmation === undefined ? {} : { requiresConfirmation: candidate.requiresConfirmation }),
    })
  })
  return Object.freeze(parsed)
}

/** Canonical digest input keeps compatibility data's original text while fixing key order. */
export function canonicalLauncherWorkflow(workflow: LauncherWorkflow): unknown {
  return {
    id: workflow.id,
    name: workflow.name,
    actions: workflow.actions.map(action => ({
      args: { ...action.args },
      handlerId: action.handlerId,
      id: action.id,
      name: action.name,
    })),
    ...(workflow.requiresConfirmation === undefined ? {} : { requiresConfirmation: workflow.requiresConfirmation }),
  }
}

export function launcherWorkflowDigest(workflow: LauncherWorkflow): string {
  return createHash('sha256').update(JSON.stringify(canonicalLauncherWorkflow(workflow), undefined, 0), 'utf8').digest('hex')
}

export function serializeLauncherWorkflowToken(workflow: LauncherWorkflow): string {
  return JSON.stringify({
    kind: 'workflow',
    version: 1,
    workflowId: workflow.id,
    workflowSha256: launcherWorkflowDigest(workflow),
  })
}

export function parseLauncherWorkflowToken(value: unknown): LauncherWorkflowToken {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || /[\0\r\n]/u.test(value)) {
    throw new Error('Invalid TockLauncher Workflow action token')
  }
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('Invalid TockLauncher Workflow action token') }
  if (!isRecord(parsed)
    || !hasExactKeys(parsed, ['kind', 'version', 'workflowId', 'workflowSha256'])
    || parsed.kind !== 'workflow'
    || parsed.version !== 1
    || !boundedText(parsed.workflowId, 128)
    || !WORKFLOW_ID_PATTERN.test(parsed.workflowId)
    || typeof parsed.workflowSha256 !== 'string'
    || !DIGEST_PATTERN.test(parsed.workflowSha256)) {
    throw new Error('Invalid TockLauncher Workflow action token')
  }
  return Object.freeze({
    kind: 'workflow',
    version: 1,
    workflowId: parsed.workflowId,
    workflowSha256: parsed.workflowSha256,
  })
}

export function isLauncherWorkflows(value: unknown, platform: LauncherTerminalPlatform): value is readonly LauncherWorkflow[] {
  try {
    parseLauncherWorkflows(value, platform)
    return true
  } catch {
    return false
  }
}

export const LAUNCHER_WORKFLOW_SETTING_KEY = 'extension[Workflow].workflows' as const
export const LAUNCHER_WORKFLOW_ID_PATTERN = WORKFLOW_ID_PATTERN
