import type { LauncherActionRecord, LauncherInternalAction, LauncherInternalResultItem } from './launcher-actions.ts'
import {
  LAUNCHER_OS_EXTENSION_IDS,
  MACOS_SYSTEM_SETTINGS,
  SYSTEM_COMMAND_CATALOG,
  UELI_COMMAND_CATALOG,
  WINDOWS_SYSTEM_SETTINGS,
  osExtensionSupported,
  systemCommandId,
  type LauncherOsExtensionId,
  type LauncherOsPlatform,
  type LauncherSystemCommand,
  type LauncherUeliCommand,
} from './launcher-os-catalog.ts'
import { launcherControlPanelCanonicalName, type LauncherControlPanelEntry } from './launcher-os-process.ts'

export type { LauncherOsExtensionId, LauncherOsPlatform, LauncherSystemCommand, LauncherUeliCommand } from './launcher-os-catalog.ts'
export type { LauncherControlPanelEntry } from './launcher-os-process.ts'

export type LauncherPrivilegedPrompt = Readonly<{
  detail: string
  operation: 'invoke-system-command' | 'open-control-panel-item' | 'quit'
  title: string
}>

export type LauncherOsEffects = Readonly<{
  confirmPrivilegedAction: (prompt: LauncherPrivilegedPrompt) => Promise<boolean>
  invokeSystemCommand: (command: LauncherSystemCommand) => Promise<void> | void
  invokeUeliCommand: (command: LauncherUeliCommand) => Promise<void> | void
  openControlPanelItem: (canonicalName: string) => Promise<void> | void
  openSystemSetting: (target: string) => Promise<void> | void
  toggleAppearance: () => Promise<void> | void
}>

export type LauncherOsOptions = Readonly<{
  effects: LauncherOsEffects
  enabledExtensionIds: () => readonly string[]
  getAppearanceMode?: () => boolean | undefined
  getSetting: <T>(key: string, fallback: T) => T
  isAppearanceOverridden?: () => boolean
  onProviderError?: (extensionId: 'WindowsControlPanel' | 'AppearanceSwitcher' | 'SystemCommands' | 'SystemSettings' | 'UeliCommand', error: Error) => void
  platform: LauncherOsPlatform
  scanControlPanelItems: (signal?: AbortSignal) => Promise<readonly LauncherControlPanelEntry[]>
}>

type ActionArgument =
  | Readonly<{ kind: 'toggle-appearance'; version: 1 }>
  | Readonly<{ command: LauncherSystemCommand; kind: 'system-command'; version: 1 }>
  | Readonly<{ kind: 'system-setting'; target: string; version: 1 }>
  | Readonly<{ command: LauncherUeliCommand; kind: 'ueli-command'; version: 1 }>
  | Readonly<{ canonicalName: string; kind: 'control-panel'; version: 1 }>

type KnownAction = Readonly<{
  argument: ActionArgument
  catalogGeneration: number
  displayName?: string
  extensionId: LauncherOsExtensionId
}>

const HANDLERS = Object.freeze({
  appearance: 'toggle-system-appearance',
  controlPanel: 'open-control-panel-item',
  systemCommand: 'invoke-system-command',
  systemSetting: 'open-system-setting',
  ueliCommand: 'invoke-ueli-command',
})
const MAX_ACTION_TEXT = 256
const MAX_SCAN_ITEMS = 200
const SUPPORTED_PLATFORMS = new Set<LauncherOsPlatform>(['Linux', 'macOS', 'Windows'])

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function bounded(value: unknown, maxLength = MAX_ACTION_TEXT): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/u.test(value)
}

function action(argument: ActionArgument, description: string, handlerKey: string, requiresConfirmation = false): LauncherInternalAction {
  return Object.freeze({
    argument: JSON.stringify(argument),
    description,
    handlerKey,
    hideWindowAfterInvocation: true,
    requiresConfirmation,
  })
}

function parseActionArgument(raw: string): ActionArgument {
  if (!bounded(raw, 16_384)) throw new Error('Invalid TockLauncher OS action argument')
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('Invalid TockLauncher OS action argument') }
  if (!isRecord(value) || value.version !== 1 || typeof value.kind !== 'string') throw new Error('Invalid TockLauncher OS action argument')
  const keys = Object.keys(value)
  if (value.kind === 'toggle-appearance' && keys.length === 2) return value as ActionArgument
  if (value.kind === 'system-command' && keys.length === 3 && typeof value.command === 'string') return value as ActionArgument
  if (value.kind === 'system-setting' && keys.length === 3 && bounded(value.target, 4_096)) return value as ActionArgument
  if (value.kind === 'ueli-command' && keys.length === 3 && typeof value.command === 'string') return value as ActionArgument
  if (value.kind === 'control-panel' && keys.length === 3 && bounded(value.canonicalName)) return value as ActionArgument
  throw new Error('Invalid TockLauncher OS action argument')
}

function actionDescription(name: string): string {
  return name.length <= 512 ? name : name.slice(0, 512)
}

function createItem(
  sourceExtension: LauncherOsExtensionId,
  id: string,
  name: string,
  description: string,
  imageKey: string,
  defaultAction: LauncherInternalAction,
  details?: string,
): LauncherInternalResultItem {
  return Object.freeze({
    defaultAction,
    description,
    ...(details === undefined ? null : { details }),
    id,
    imageKey,
    name,
    sourceExtension,
  })
}

function operationError(error: unknown): Error {
  return error instanceof Error ? error : new Error('TockLauncher OS provider failed')
}

function abortError(signal: AbortSignal | undefined, fallback: string): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error(fallback)
}

function sameGeneration(current: number, expected: number, closed: boolean, signal?: AbortSignal): boolean {
  return !closed && current === expected && signal?.aborted !== true
}

function supportedCatalog(platform: LauncherOsPlatform, id: LauncherOsExtensionId): boolean {
  return SUPPORTED_PLATFORMS.has(platform) && osExtensionSupported(id, platform)
}

export function createLauncherOsExtensions(options: LauncherOsOptions): Readonly<{
  close: () => Promise<void>
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  getLastError: () => string | undefined
  invalidate: () => void
  loadIndexedItems: (signal?: AbortSignal) => Promise<readonly LauncherInternalResultItem[]>
}> {
  if (!SUPPORTED_PLATFORMS.has(options.platform)) throw new Error('Unsupported TockLauncher platform')
  const enabled = (): ReadonlySet<string> => new Set(options.enabledExtensionIds())
  const providerErrors = new Map<LauncherOsExtensionId, string>()
  const activeControllers = new Set<AbortController>()
  const activeWork = new Set<Promise<unknown>>()
  let currentActions = new Map<string, KnownAction>()
  let currentControlPanel = new Map<string, string>()
  let generation = 0
  let closed = false

  const getLastError = (): string | undefined => {
    for (const id of LAUNCHER_OS_EXTENSION_IDS) {
      const value = providerErrors.get(id)
      if (value !== undefined) return value
    }
    return undefined
  }
  const report = (id: LauncherOsExtensionId, reason: unknown): void => {
    const message = id === 'WindowsControlPanel' ? 'Windows Control Panel is unavailable.' : `${id} is unavailable.`
    providerErrors.set(id, message)
    options.onProviderError?.(id, new Error(message))
    void reason
  }
  const clearError = (id: LauncherOsExtensionId): void => { providerErrors.delete(id) }
  const clearState = (): void => {
    currentActions = new Map()
    currentControlPanel = new Map()
  }
  const abortAll = (reason: Error): void => {
    for (const controller of activeControllers) controller.abort(reason)
  }
  const track = <T>(promise: Promise<T>): Promise<T> => {
    let tracked!: Promise<T>
    tracked = promise.then(value => { activeWork.delete(tracked); return value }, reason => { activeWork.delete(tracked); throw reason })
    activeWork.add(tracked)
    return tracked
  }
  const invalidate = (): void => {
    generation += 1
    clearState()
    providerErrors.clear()
    abortAll(new Error('TockLauncher OS provider was invalidated'))
  }

  const staticItems = (ids: ReadonlySet<string>, nextActions: Map<string, KnownAction>, nextGeneration: number): LauncherInternalResultItem[] => {
    const items: LauncherInternalResultItem[] = []
    const add = (item: LauncherInternalResultItem, argument: ActionArgument, extensionId: LauncherOsExtensionId, displayName?: string): void => {
      const encoded = item.defaultAction.argument
      nextActions.set(encoded, Object.freeze({ argument, catalogGeneration: nextGeneration, ...(displayName === undefined ? null : { displayName }), extensionId }))
      items.push(item)
    }
    if (ids.has('AppearanceSwitcher') && supportedCatalog(options.platform, 'AppearanceSwitcher')) {
      const argument = Object.freeze({ kind: 'toggle-appearance', version: 1 } as const)
      add(createItem('AppearanceSwitcher', 'AppearanceSwitcher:toggle', 'Toggle System Appearance', 'System', 'appearance-switcher', action(argument, 'Toggle System Appearance', HANDLERS.appearance)), argument, 'AppearanceSwitcher')
    }
    if (ids.has('SystemCommands')) {
      for (const row of SYSTEM_COMMAND_CATALOG[options.platform]) {
        const argument = Object.freeze({ command: row.command, kind: 'system-command', version: 1 } as const)
        add(createItem('SystemCommands', systemCommandId(row.name), row.name, 'System Command', row.imageKey, action(argument, row.name, HANDLERS.systemCommand, true), row.details), argument, 'SystemCommands', row.name)
      }
    }
    if (ids.has('SystemSettings') && supportedCatalog(options.platform, 'SystemSettings')) {
      const settings = options.platform === 'macOS' ? MACOS_SYSTEM_SETTINGS : WINDOWS_SYSTEM_SETTINGS
      for (const row of settings) {
        const argument = Object.freeze({ kind: 'system-setting', target: row.target, version: 1 } as const)
        const id = options.platform === 'macOS' ? `MacOsSystemSetting:${row.name}` : `WindowsSystemSetting:${row.name}[${row.target}]`
        add(createItem('SystemSettings', id, row.name, 'System Setting', options.platform === 'macOS' ? 'system-settings-macos' : 'system-settings-windows', action(argument, 'Open System Setting', HANDLERS.systemSetting), row.target), argument, 'SystemSettings', row.name)
      }
    }
    if (ids.has('UeliCommand')) {
      const hotkeyEnabled = options.getSetting('general.hotkey.enabled', true) === true
      const commands = UELI_COMMAND_CATALOG.map(row => row.id === 'ueliCommand:toggleHotkey'
        ? Object.freeze({ ...row, command: (hotkeyEnabled ? 'disableHotkey' : 'enableHotkey') as LauncherUeliCommand, description: hotkeyEnabled ? 'Disable hotkey' : 'Enable hotkey', name: hotkeyEnabled ? 'Disable hotkey' : 'Enable hotkey' })
        : row)
      for (const row of commands) {
        const argument = Object.freeze({ command: row.command, kind: 'ueli-command', version: 1 } as const)
        add(createItem('UeliCommand', row.id, row.name, 'TockLauncher Command', 'ueli-command', action(argument, row.description, HANDLERS.ueliCommand, row.protected === true)), argument, 'UeliCommand', row.name)
      }
    }
    return items
  }

  const loadIndexedItems = async (signal?: AbortSignal): Promise<readonly LauncherInternalResultItem[]> => {
    if (closed) throw new Error('TockLauncher OS provider is closed')
    if (signal?.aborted) throw abortError(signal, 'TockLauncher OS load canceled')
    const nextGeneration = ++generation
    clearState()
    abortAll(new Error('TockLauncher OS scan superseded'))
    const controller = new AbortController()
    activeControllers.add(controller)
    const relay = (): void => { controller.abort(abortError(signal, 'TockLauncher OS load canceled')) }
    if (signal?.aborted) relay()
    else signal?.addEventListener('abort', relay, { once: true })
    const nextActions = new Map<string, KnownAction>()
    const nextControlPanel = new Map<string, string>()
    try {
      if (controller.signal.aborted || closed || nextGeneration !== generation) throw abortError(controller.signal, 'TockLauncher OS load canceled')
      const ids = enabled()
      const items = staticItems(ids, nextActions, nextGeneration)
      if (ids.has('WindowsControlPanel') && options.platform === 'Windows') {
        try {
          const scanned = await options.scanControlPanelItems(controller.signal)
          if (!sameGeneration(generation, nextGeneration, closed, controller.signal)) throw abortError(controller.signal, 'TockLauncher OS load superseded')
          for (const entry of scanned.slice(0, MAX_SCAN_ITEMS)) {
            if (!launcherControlPanelCanonicalName(entry.canonicalName) || !bounded(entry.name) || nextControlPanel.has(entry.canonicalName)) continue
            nextControlPanel.set(entry.canonicalName, entry.name)
            const argument = Object.freeze({ canonicalName: entry.canonicalName, kind: 'control-panel', version: 1 } as const)
            const item = createItem('WindowsControlPanel', entry.canonicalName, entry.name, 'Control Panel Item', 'control-panel', action(argument, `Open ${entry.name}`, HANDLERS.controlPanel, true))
            nextActions.set(item.defaultAction.argument, Object.freeze({ argument, catalogGeneration: nextGeneration, displayName: entry.name, extensionId: 'WindowsControlPanel' }))
            items.push(item)
          }
          clearError('WindowsControlPanel')
        } catch (reason) {
          if (controller.signal.aborted || signal?.aborted || closed || nextGeneration !== generation) throw operationError(reason)
          report('WindowsControlPanel', reason)
        }
      }
      if (!sameGeneration(generation, nextGeneration, closed, controller.signal)) throw abortError(controller.signal, 'TockLauncher OS load superseded')
      currentActions = nextActions
      currentControlPanel = nextControlPanel
      return Object.freeze(items)
    } finally {
      signal?.removeEventListener('abort', relay)
      activeControllers.delete(controller)
    }
  }

  const actionIsCurrent = (raw: string, known: KnownAction): boolean => currentActions.get(raw) === known && known.catalogGeneration === generation && !closed

  const executeAction = async (record: LauncherActionRecord): Promise<boolean> => {
    if (!LAUNCHER_OS_EXTENSION_IDS.includes(record.sourceExtension as LauncherOsExtensionId)) return false
    if (closed) throw new Error('TockLauncher OS provider is closed')
    const extensionId = record.sourceExtension as LauncherOsExtensionId
    if (!enabled().has(extensionId) || !supportedCatalog(options.platform, extensionId)) throw new Error('TockLauncher OS extension is disabled or unsupported')
    const known = currentActions.get(record.argument)
    if (known === undefined || known.extensionId !== extensionId || !actionIsCurrent(record.argument, known)) throw new Error('TockLauncher OS action is not current')
    const value = parseActionArgument(record.argument)
    if (JSON.stringify(value) !== record.argument) throw new Error('Invalid TockLauncher OS action argument')
    const controller = new AbortController()
    activeControllers.add(controller)
    try {
      if (record.handlerKey === HANDLERS.appearance) {
        if (extensionId !== 'AppearanceSwitcher' || value.kind !== 'toggle-appearance') throw new Error('Invalid appearance action')
        if (options.isAppearanceOverridden?.() === true || (options.getAppearanceMode !== undefined && options.getAppearanceMode() === undefined)) throw new Error('System appearance is unavailable')
        if (!actionIsCurrent(record.argument, known)) throw new Error('Appearance action is stale')
        await options.effects.toggleAppearance()
        return true
      }
      if (record.handlerKey === HANDLERS.systemSetting) {
        if (extensionId !== 'SystemSettings' || value.kind !== 'system-setting') throw new Error('Invalid system setting action')
        const catalog = options.platform === 'macOS' ? MACOS_SYSTEM_SETTINGS : WINDOWS_SYSTEM_SETTINGS
        const current = catalog.find(row => row.target === value.target)
        if (current === undefined || known.displayName !== current.name || !actionIsCurrent(record.argument, known)) throw new Error('System setting action is stale')
        await options.effects.openSystemSetting(current.target)
        return true
      }
      if (record.handlerKey === HANDLERS.systemCommand) {
        if (extensionId !== 'SystemCommands' || value.kind !== 'system-command') throw new Error('Invalid system command action')
        const command = SYSTEM_COMMAND_CATALOG[options.platform].find(row => row.command === value.command)
        if (command === undefined || known.displayName !== command.name || !actionIsCurrent(record.argument, known)) throw new Error('System command action is stale')
        if (await options.effects.confirmPrivilegedAction({ detail: 'This operation can interrupt work or permanently remove trashed files.', operation: 'invoke-system-command', title: `${command.name}?` })) {
          if (!actionIsCurrent(record.argument, known)) throw new Error('System command action is stale')
          await options.effects.invokeSystemCommand(command.command)
        }
        return true
      }
      if (record.handlerKey === HANDLERS.controlPanel) {
        if (extensionId !== 'WindowsControlPanel' || value.kind !== 'control-panel' || options.platform !== 'Windows') throw new Error('Invalid Control Panel action')
        const name = currentControlPanel.get(value.canonicalName)
        if (name === undefined || known.displayName !== name || !actionIsCurrent(record.argument, known)) throw new Error('Control Panel action is stale')
        if (await options.effects.confirmPrivilegedAction({ detail: 'Windows may request administrator approval for this Control Panel item.', operation: 'open-control-panel-item', title: `Open ${name}?` })) {
          if (!actionIsCurrent(record.argument, known) || currentControlPanel.get(value.canonicalName) !== name) throw new Error('Control Panel action is stale')
          await options.effects.openControlPanelItem(value.canonicalName)
        }
        return true
      }
      if (record.handlerKey === HANDLERS.ueliCommand) {
        if (extensionId !== 'UeliCommand' || value.kind !== 'ueli-command' || !UELI_COMMAND_CATALOG.some(row => row.command === value.command) && value.command !== 'enableHotkey' && value.command !== 'disableHotkey') throw new Error('Invalid TockLauncher command action')
        const hotkeyEnabled = options.getSetting('general.hotkey.enabled', true) === true
        if ((value.command === 'disableHotkey' && !hotkeyEnabled) || (value.command === 'enableHotkey' && hotkeyEnabled)) throw new Error('Hotkey command is stale')
        if (value.command === 'quit') {
          if (await options.effects.confirmPrivilegedAction({ detail: 'TockTeam will close after active local state is secured.', operation: 'quit', title: 'Quit TockTeam?' })) {
            if (!actionIsCurrent(record.argument, known)) throw new Error('Quit action is stale')
            await options.effects.invokeUeliCommand(value.command)
          }
          return true
        }
        if (!actionIsCurrent(record.argument, known)) throw new Error('TockLauncher command action is stale')
        await options.effects.invokeUeliCommand(value.command)
        return true
      }
      return false
    } finally {
      activeControllers.delete(controller)
    }
  }

  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    generation += 1
    clearState()
    providerErrors.clear()
    abortAll(new Error('TockLauncher OS provider is closed'))
    const pending = Promise.allSettled([...activeWork]).then(() => undefined)
    await Promise.race([pending, new Promise<void>(resolve => setTimeout(resolve, 100))])
  }

  return Object.freeze({ close, executeAction, getLastError, invalidate, loadIndexedItems: (signal?: AbortSignal) => track(loadIndexedItems(signal)) })
}
