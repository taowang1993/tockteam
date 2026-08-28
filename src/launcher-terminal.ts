import { createHash } from 'node:crypto'
import type { LauncherActionRecord, LauncherInternalAction, LauncherInternalResultItem } from './launcher-actions.ts'
import {
  LAUNCHER_TERMINALS,
  isLauncherTerminalPrefix,
  launcherTerminalDefaults,
  type LauncherTerminalDefinition,
  type LauncherTerminalId,
  type LauncherTerminalPlatform,
} from './launcher-terminal-config.ts'

export {
  LAUNCHER_TERMINALS,
  type LauncherTerminalDefinition,
  type LauncherTerminalId,
  type LauncherTerminalPlatform,
} from './launcher-terminal-config.ts'

export type LauncherTerminalLaunchRequest = Readonly<{
  command: string
  terminalId: LauncherTerminalId
  workingDirectory: string
}>

export type LauncherTerminalConfirmation = LauncherTerminalLaunchRequest & Readonly<{
  terminalName: string
}>

export type LauncherTerminalAuditRecord = Readonly<{
  commandLength: number
  commandSha256: string
  outcome: 'denied' | 'failed' | 'launched'
  terminalId: LauncherTerminalId
  workingDirectory: string
}>

export type LauncherTerminalEffects = Readonly<{
  auditLaunch: (record: LauncherTerminalAuditRecord) => Promise<void> | void
  confirmLaunch: (request: LauncherTerminalConfirmation, signal: AbortSignal) => Promise<boolean>
  launchTerminal: (request: LauncherTerminalLaunchRequest, signal: AbortSignal) => Promise<void> | void
}>

type LauncherTerminalOptions = Readonly<{
  effects: LauncherTerminalEffects
  enabledExtensionIds: () => readonly string[]
  getHomePath?: () => string
  getSetting: <T>(key: string, fallback: T) => T
  homePath: string
  onProviderError?: (error: Error) => void
  platform: LauncherTerminalPlatform
  validateWorkingDirectory?: (path: string, signal: AbortSignal) => Promise<boolean>
}>

type TerminalActionArgument = LauncherTerminalLaunchRequest & Readonly<{
  kind: 'terminal-command'
  version: 1
}>

type KnownAction = Readonly<{
  argument: TerminalActionArgument
  generation: number
  settingsDigest: string
}>

export type LauncherCommandSurfaceDisposition =
  | 'blocked-generic-utility'
  | 'packaged-asset-fallback'
  | 'terminal-policy'
  | 'typed-custom-browser-adapter'
  | 'typed-discovery-adapter'
  | 'typed-file-search-adapter'
  | 'typed-os-adapter'
  | 'workflow-policy'

export type LauncherCommandSurfaceInventoryRow = Readonly<{
  disposition: LauncherCommandSurfaceDisposition
  owner: string
  source: string
}>

const commandSurface = (
  source: string,
  disposition: LauncherCommandSurfaceDisposition,
  owner: string,
): LauncherCommandSurfaceInventoryRow => Object.freeze({ disposition, owner, source })

export const LAUNCHER_COMMAND_SURFACE_INVENTORY = Object.freeze([
  commandSurface('src/main/Core/AppleScriptUtility/AppleScriptUtility.ts', 'blocked-generic-utility', 'tockbot-0pd2o.3'),
  commandSurface('src/main/Core/AppleScriptUtility/Contract/AppleScriptUtility.ts', 'blocked-generic-utility', 'tockbot-0pd2o.3'),
  commandSurface('src/main/Core/CommandlineUtility/ActionHandler/CommandlineActionHandler.ts', 'blocked-generic-utility', 'tockbot-0pd2o.3'),
  commandSurface('src/main/Core/CommandlineUtility/Contract/CommandlineUtility.ts', 'blocked-generic-utility', 'tockbot-0pd2o.3'),
  commandSurface('src/main/Core/CommandlineUtility/NodeJsCommandlineUtility.ts', 'blocked-generic-utility', 'tockbot-0pd2o.3'),
  commandSurface('src/main/Core/ImageGenerator/Linux/LinuxAppIconExtractor.ts', 'packaged-asset-fallback', 'tockbot-0pd2o.9'),
  commandSurface('src/main/Core/ImageGenerator/macOS/MacOsApplicationIconExtractor.ts', 'packaged-asset-fallback', 'tockbot-0pd2o.9'),
  commandSurface('src/main/Core/PowershellUtility/ActionHandler/PowershellActionHandler.ts', 'blocked-generic-utility', 'tockbot-0pd2o.3'),
  commandSurface('src/main/Core/PowershellUtility/Contract/PowershellUtility.ts', 'blocked-generic-utility', 'tockbot-0pd2o.3'),
  commandSurface('src/main/Core/PowershellUtility/PowershellUtility.ts', 'blocked-generic-utility', 'tockbot-0pd2o.3'),
  commandSurface('src/main/Core/Shell/ActionHandler/CustomWebBrowser/MacOsCustomWebBrowserActionHandler.ts', 'typed-custom-browser-adapter', 'tockbot-0pd2o.24'),
  commandSurface('src/main/Core/Shell/ActionHandler/CustomWebBrowser/WindowsCustomWebBrowserActionHandler.ts', 'typed-custom-browser-adapter', 'tockbot-0pd2o.24'),
  commandSurface('src/main/Core/Terminal/Terminals/CommandPrompt.ts', 'terminal-policy', 'tockbot-0pd2o.20'),
  commandSurface('src/main/Core/Terminal/Terminals/Iterm.ts', 'terminal-policy', 'tockbot-0pd2o.20'),
  commandSurface('src/main/Core/Terminal/Terminals/MacOsTerminal.ts', 'terminal-policy', 'tockbot-0pd2o.20'),
  commandSurface('src/main/Core/Terminal/Terminals/Powershell.ts', 'terminal-policy', 'tockbot-0pd2o.20'),
  commandSurface('src/main/Core/Terminal/Terminals/PowershellCore.ts', 'terminal-policy', 'tockbot-0pd2o.20'),
  commandSurface('src/main/Core/Terminal/Terminals/Wsl.ts', 'terminal-policy', 'tockbot-0pd2o.20'),
  commandSurface('src/main/Extensions/AppearanceSwitcher/CustomActionHandler.ts', 'typed-os-adapter', 'tockbot-0pd2o.11'),
  commandSurface('src/main/Extensions/ApplicationSearch/Linux/LaunchDesktopFileActionHandler.ts', 'typed-discovery-adapter', 'tockbot-0pd2o.9'),
  commandSurface('src/main/Extensions/ApplicationSearch/Windows/OpenAsAdministrator.ts', 'typed-discovery-adapter', 'tockbot-0pd2o.25'),
  commandSurface('src/main/Extensions/ApplicationSearch/macOS/MacOsApplicationRepository.ts', 'typed-discovery-adapter', 'tockbot-0pd2o.9'),
  commandSurface('src/main/Extensions/FileSearch/Windows/EverythingFileSearcher.ts', 'typed-file-search-adapter', 'tockbot-0pd2o.19'),
  commandSurface('src/main/Extensions/FileSearch/macOS/MdfindFileSearcher.ts', 'typed-file-search-adapter', 'tockbot-0pd2o.19'),
  commandSurface('src/main/Extensions/JetBrainsToolbox/JetBrainsToolboxExtension.ts', 'typed-discovery-adapter', 'tockbot-0pd2o.9'),
  commandSurface('src/main/Extensions/SystemCommands/Linux/LinuxSystemCommandRepository.ts', 'typed-os-adapter', 'tockbot-0pd2o.11'),
  commandSurface('src/main/Extensions/SystemCommands/Windows/WindowsSystemCommandRepository.ts', 'typed-os-adapter', 'tockbot-0pd2o.11'),
  commandSurface('src/main/Extensions/SystemCommands/macOS/MacOsSystemCommandRepository.ts', 'typed-os-adapter', 'tockbot-0pd2o.11'),
  commandSurface('src/main/Extensions/SystemSettings/WindowsSystemSettingActionHandler.ts', 'typed-os-adapter', 'tockbot-0pd2o.11'),
  commandSurface('src/main/Extensions/VSCode/VSCodeExtension.ts', 'typed-discovery-adapter', 'tockbot-0pd2o.9'),
  commandSurface('src/main/Extensions/WindowsControlPanel/WindowsControlPanelActionHandler.ts', 'typed-os-adapter', 'tockbot-0pd2o.11'),
  commandSurface('src/main/Extensions/WindowsControlPanel/WindowsControlPanelItemRepository.ts', 'typed-os-adapter', 'tockbot-0pd2o.11'),
  commandSurface('src/main/Extensions/Workflow/WorkflowActionHandler/ExecuteCommandWorkflowActionHandler.ts', 'workflow-policy', 'tockbot-0pd2o.12'),
] as const)

export const LAUNCHER_TERMINAL_ACTION_HANDLER = 'launch-terminal-command'
const MAX_COMMAND_LENGTH = 512
const MAX_HOME_LENGTH = 4_096
const HANDLER = LAUNCHER_TERMINAL_ACTION_HANDLER

function emptyResult(): Readonly<{ after: readonly LauncherInternalResultItem[]; before: readonly LauncherInternalResultItem[] }> {
  return Object.freeze({ after: Object.freeze([]), before: Object.freeze([]) })
}

function isAbsoluteHome(platform: LauncherTerminalPlatform, value: string): boolean {
  return platform === 'Windows'
    ? /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\')
    : value.startsWith('/')
}

function commandIsValid(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_COMMAND_LENGTH && !/[\0\r\n]/u.test(value)
}

function homeIsValid(platform: LauncherTerminalPlatform, value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_HOME_LENGTH && !/[\0\r\n]/u.test(value) && isAbsoluteHome(platform, value)
}

function settingsState(options: LauncherTerminalOptions): Readonly<{ ids: readonly LauncherTerminalId[]; prefix: string; digest: string }> {
  const prefixValue = options.getSetting('extension[TerminalLauncher].prefix', '>')
  const prefix = isLauncherTerminalPrefix(prefixValue) ? prefixValue : '>'
  const defaults = launcherTerminalDefaults(options.platform)
  const configured = options.getSetting('extension[TerminalLauncher].terminalIds', defaults)
  const configuredIds = Array.isArray(configured)
    ? configured.filter((id): id is LauncherTerminalId => typeof id === 'string' && LAUNCHER_TERMINALS[options.platform].some(item => item.id === id))
    : defaults
  const ids = LAUNCHER_TERMINALS[options.platform]
    .filter(item => configuredIds.includes(item.id))
    .map(item => item.id)
  return Object.freeze({ digest: JSON.stringify({ ids, prefix }), ids: Object.freeze(ids), prefix })
}

function serializeAction(value: TerminalActionArgument): string {
  return JSON.stringify(value)
}

function parseAction(raw: string): TerminalActionArgument {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 16_384 || /[\0\r\n]/u.test(raw)) throw new Error('Invalid TockLauncher Terminal action argument')
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('Invalid TockLauncher Terminal action argument') }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid TockLauncher Terminal action argument')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 5 || !keys.every(key => ['command', 'kind', 'terminalId', 'version', 'workingDirectory'].includes(key))
    || record.kind !== 'terminal-command' || record.version !== 1
    || typeof record.terminalId !== 'string' || !commandIsValid(record.command)
    || !homeIsValid('macOS', record.workingDirectory) && !homeIsValid('Windows', record.workingDirectory)) {
    throw new Error('Invalid TockLauncher Terminal action argument')
  }
  return Object.freeze({
    command: record.command,
    kind: 'terminal-command',
    terminalId: record.terminalId as LauncherTerminalId,
    version: 1,
    workingDirectory: record.workingDirectory,
  })
}

function sameAction(left: KnownAction, right: KnownAction): boolean {
  return left === right
}

export function createLauncherTerminal(options: LauncherTerminalOptions): Readonly<{
  close: () => Promise<void>
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  invalidate: (reason?: string, preserveSignal?: AbortSignal) => void
  loadIndexedItems: (signal?: AbortSignal, preserveSignal?: AbortSignal) => Promise<readonly LauncherInternalResultItem[]>
  searchInstant: (searchTerm: string) => Promise<Readonly<{ after: readonly LauncherInternalResultItem[]; before: readonly LauncherInternalResultItem[] }>>
  waitForIdle: () => Promise<void>
}> {
  if (options.platform !== 'Linux' && options.platform !== 'macOS' && options.platform !== 'Windows') throw new Error('Unsupported TockLauncher platform')
  if (!homeIsValid(options.platform, options.homePath)) throw new Error('Invalid TockLauncher Terminal working directory')
  const workingDirectory = options.homePath
  const activeControllers = new Set<AbortController>()
  const activeWork = new Set<Promise<unknown>>()
  let currentActions = new Map<string, KnownAction>()
  let generation = 0
  let closed = false

  const track = <T>(operation: () => Promise<T>): Promise<T> => {
    let tracked!: Promise<T>
    tracked = Promise.resolve().then(operation).then(value => { activeWork.delete(tracked); return value }, reason => { activeWork.delete(tracked); throw reason })
    activeWork.add(tracked)
    return tracked
  }
  const abortAll = (reason: Error): void => {
    for (const controller of activeControllers) controller.abort(reason)
  }
  const invalidate = (reason = 'TockLauncher Terminal Launcher was invalidated', _preserveSignal?: AbortSignal): void => {
    ++generation
    currentActions = new Map()
    abortAll(new Error(reason))
  }
  const isCurrent = (raw: string, known: KnownAction, expectedGeneration: number, digest: string): boolean => (
    !closed
    && options.enabledExtensionIds().includes('TerminalLauncher')
    && generation === expectedGeneration
    && currentActions.get(raw) === known
    && known.generation === expectedGeneration
    && known.settingsDigest === digest
  )
  const searchInstant = async (searchTerm: string) => track(async () => {
    if (closed) return emptyResult()
    ++generation
    currentActions = new Map()
    if (options.platform === 'Linux' || !options.enabledExtensionIds().includes('TerminalLauncher') || typeof searchTerm !== 'string') return emptyResult()
    const settings = settingsState(options)
    if (!searchTerm.startsWith(settings.prefix)) return emptyResult()
    const command = searchTerm.slice(settings.prefix.length).trim()
    if (!commandIsValid(command)) return emptyResult()
    const nextActions = new Map<string, KnownAction>()
    const items = LAUNCHER_TERMINALS[options.platform]
      .filter((terminal: LauncherTerminalDefinition) => settings.ids.includes(terminal.id))
      .map((terminal): LauncherInternalResultItem => {
        const value: TerminalActionArgument = Object.freeze({ command, kind: 'terminal-command', terminalId: terminal.id, version: 1, workingDirectory })
        const argument = serializeAction(value)
        nextActions.set(argument, Object.freeze({ argument: value, generation, settingsDigest: settings.digest }))
        const action: LauncherInternalAction = Object.freeze({
          argument,
          description: `Launch command in ${terminal.name}`,
          handlerKey: HANDLER,
          hideWindowAfterInvocation: true,
          requiresConfirmation: true,
        })
        return Object.freeze({
          defaultAction: action,
          description: `Launch in ${terminal.name}`,
          details: `Terminal: ${terminal.name}\nWorking directory: ${workingDirectory}\nApproval: Always required`,
          id: `[TerminalLauncher][instantSearchResultItem][${terminal.id}]`,
          imageKey: terminal.assetKey,
          name: command,
          sourceExtension: 'TerminalLauncher',
        })
      })
    if (!closed) currentActions = nextActions
    return Object.freeze({ after: Object.freeze(items), before: Object.freeze([]) })
  })
  const loadIndexedItems = async (signal?: AbortSignal, _preserveSignal?: AbortSignal): Promise<readonly LauncherInternalResultItem[]> => {
    if (closed) throw new Error('TockLauncher Terminal Launcher is closed')
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('TockLauncher Terminal Launcher load canceled')
    return Object.freeze([])
  }
  const executeAction = (record: LauncherActionRecord): Promise<boolean> => track(async () => {
    if (record.handlerKey !== HANDLER) return false
    if (record.sourceExtension !== 'TerminalLauncher' || record.requiresConfirmation !== true) throw new Error('Invalid TockLauncher Terminal action policy')
    if (closed) throw new Error('TockLauncher Terminal Launcher is closed')
    const known = currentActions.get(record.argument)
    if (known === undefined) throw new Error('Action is not from the current main-owned terminal catalog')
    const request = parseAction(record.argument)
    if (JSON.stringify(request) !== record.argument || !sameAction(currentActions.get(record.argument)!, known)) throw new Error('Invalid TockLauncher Terminal action argument')
    const settings = settingsState(options)
    const terminal = LAUNCHER_TERMINALS[options.platform].find(item => item.id === request.terminalId)
    if (terminal === undefined || !settings.ids.includes(request.terminalId) || request.workingDirectory !== workingDirectory || !isCurrent(record.argument, known, known.generation, settings.digest)) throw new Error('TockLauncher Terminal action is stale')
    const controller = new AbortController()
    activeControllers.add(controller)
    const validateHome = async (): Promise<boolean> => {
      if (controller.signal.aborted) return false
      const currentHome = options.getHomePath?.() ?? workingDirectory
      if (currentHome !== workingDirectory) return false
      return options.validateWorkingDirectory === undefined || await options.validateWorkingDirectory(workingDirectory, controller.signal)
    }
    const auditBase = Object.freeze({ commandLength: request.command.length, commandSha256: createHash('sha256').update(request.command, 'utf8').digest('hex'), terminalId: request.terminalId, workingDirectory })
    try {
      if (!await validateHome()) throw new Error('TockLauncher Terminal working directory is stale')
      const approved = await options.effects.confirmLaunch({ command: request.command, terminalId: terminal.id, terminalName: terminal.name, workingDirectory }, controller.signal)
      if (!await validateHome() || !isCurrent(record.argument, known, known.generation, settingsState(options).digest) || controller.signal.aborted) throw new Error('TockLauncher Terminal action was canceled')
      if (!approved) {
        await options.effects.auditLaunch(Object.freeze({ ...auditBase, outcome: 'denied' }))
        return true
      }
      if (!await validateHome() || !isCurrent(record.argument, known, known.generation, settingsState(options).digest)) throw new Error('TockLauncher Terminal action was canceled')
      try {
        const launchRequest: LauncherTerminalLaunchRequest = Object.freeze({ command: request.command, terminalId: request.terminalId, workingDirectory })
        await options.effects.launchTerminal(launchRequest, controller.signal)
      } catch (reason) {
        await options.effects.auditLaunch(Object.freeze({ ...auditBase, outcome: 'failed' }))
        throw reason
      }
      if (controller.signal.aborted || !isCurrent(record.argument, known, known.generation, settingsState(options).digest)) throw new Error('TockLauncher Terminal action was canceled')
      await options.effects.auditLaunch(Object.freeze({ ...auditBase, outcome: 'launched' }))
      return true
    } finally { activeControllers.delete(controller) }
  })
  const waitForIdle = async (): Promise<void> => { while (activeWork.size > 0) await Promise.allSettled([...activeWork]) }
  const close = async (): Promise<void> => {
    if (closed) { await waitForIdle(); return }
    closed = true
    invalidate('TockLauncher Terminal Launcher is closed')
    await waitForIdle()
  }
  return Object.freeze({ close, executeAction, invalidate, loadIndexedItems, searchInstant, waitForIdle })
}
