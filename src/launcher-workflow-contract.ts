import {
  LAUNCHER_TERMINALS,
  type LauncherTerminalId,
  type LauncherTerminalPlatform,
} from './launcher-terminal-config.ts'

export type LauncherWorkflowAction = Readonly<{
  args: Readonly<Record<string, string>>
  handlerId: 'OpenFile' | 'OpenUrl' | 'OpenTerminal' | 'ExecuteCommand'
  id: string
  name: string
}>

export type LauncherWorkflow = Readonly<{
  actions: readonly LauncherWorkflowAction[]
  id: string
  name: string
  requiresConfirmation?: boolean
}>

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength && !/[\0\r\n]/u.test(value)
}

function action(value: unknown, platform: LauncherTerminalPlatform): LauncherWorkflowAction {
  if (!isRecord(value)
    || !hasExactKeys(value, ['args', 'handlerId', 'id', 'name'])
    || !boundedText(value.id, 128) || !ID_PATTERN.test(value.id)
    || !boundedText(value.name, 128)
    || !isRecord(value.args)) throw new Error('Invalid TockLauncher Workflow action')
  const args = value.args
  if (value.handlerId === 'OpenFile') {
    const filePath = args.filePath
    const absolute = typeof filePath === 'string' && (platform === 'Windows'
      ? /^[A-Za-z]:[\\/]/u.test(filePath)
      : filePath.startsWith('/'))
    if (!hasExactKeys(args, ['filePath']) || !absolute || !boundedText(filePath, 4_096)) {
      throw new Error('Invalid TockLauncher Workflow file action')
    }
    return Object.freeze({ args: Object.freeze({ filePath }), handlerId: 'OpenFile', id: value.id, name: value.name })
  }
  if (value.handlerId === 'OpenUrl') {
    const url = args.url
    if (!hasExactKeys(args, ['url']) || !boundedText(url, 4_096)) throw new Error('Invalid TockLauncher Workflow URL action')
    try {
      const parsed = new URL(url)
      if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) throw new Error()
    } catch {
      throw new Error('Invalid TockLauncher Workflow URL action')
    }
    return Object.freeze({ args: Object.freeze({ url }), handlerId: 'OpenUrl', id: value.id, name: value.name })
  }
  if (value.handlerId === 'OpenTerminal') {
    const command = args.command
    const terminalId = args.terminalId
    if (!hasExactKeys(args, ['command', 'terminalId'])
      || !boundedText(command, 512)
      || !boundedText(terminalId, 128)
      || !LAUNCHER_TERMINALS[platform].some(item => item.id === terminalId)) {
      throw new Error('Invalid TockLauncher Workflow terminal action')
    }
    return Object.freeze({
      args: Object.freeze({ command, terminalId }),
      handlerId: 'OpenTerminal',
      id: value.id,
      name: value.name,
    })
  }
  if (value.handlerId === 'ExecuteCommand') {
    const command = args.command
    if (!hasExactKeys(args, ['command']) || !boundedText(command, 2_048)) throw new Error('Invalid TockLauncher Workflow command action')
    return Object.freeze({ args: Object.freeze({ command }), handlerId: 'ExecuteCommand', id: value.id, name: value.name })
  }
  throw new Error('Invalid TockLauncher Workflow action handler')
}

export function parseLauncherWorkflows(value: unknown, platform: LauncherTerminalPlatform): readonly LauncherWorkflow[] {
  if (!Array.isArray(value) || value.length > 64) throw new Error('Invalid TockLauncher Workflow settings')
  const ids = new Set<string>()
  const parsed = value.map(candidate => {
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, candidate.requiresConfirmation === undefined
        ? ['actions', 'id', 'name']
        : ['actions', 'id', 'name', 'requiresConfirmation'])
      || !boundedText(candidate.id, 128) || !ID_PATTERN.test(candidate.id) || ids.has(candidate.id)
      || !boundedText(candidate.name, 128)
      || (candidate.requiresConfirmation !== undefined && typeof candidate.requiresConfirmation !== 'boolean')
      || !Array.isArray(candidate.actions) || candidate.actions.length === 0 || candidate.actions.length > 16) {
      throw new Error('Invalid TockLauncher Workflow definition')
    }
    ids.add(candidate.id)
    const actionIds = new Set<string>()
    const actions = candidate.actions.map(candidateAction => {
      const parsedAction = action(candidateAction, platform)
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

export function isLauncherWorkflows(value: unknown, platform: LauncherTerminalPlatform): value is readonly LauncherWorkflow[] {
  try { parseLauncherWorkflows(value, platform); return true } catch { return false }
}
