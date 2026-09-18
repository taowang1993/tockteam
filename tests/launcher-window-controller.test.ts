import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TrustedRaycastOrigin } from '../src/trusted-raycast-native.ts'
import type { Rectangle } from 'electron'
import { LAUNCHER_WINDOW_IPC_CHANNELS } from '../src/launcher-window-contract.ts'
import { createLauncherOsExtensions, type LauncherOsEffects } from '../src/launcher-os-extensions.ts'
import type { LauncherActionRecord, LauncherInternalResultItem } from '../src/launcher-actions.ts'
import {
  LauncherOverlayController,
  resolveLauncherBounds,
  resolveLauncherDisplayWorkArea,
  resolveLauncherShortcut,
} from '../src/launcher-window-controller.ts'

type Listener = (...args: any[]) => void

class FakeWebContents {
  readonly id = 77
  readonly sent: string[] = []
  private readonly listeners = new Map<string, Listener[]>()
  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }
  emit(event: string, ...args: any[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args)
  }
  send(channel: string): void { this.sent.push(channel) }
}

class FakeWindow {
  readonly webContents = new FakeWebContents()
  bounds: Rectangle | undefined
  destroyed = false
  focused = false
  visible = false
  destroyedCount = 0
  focusCount = 0
  hideCount = 0
  loadCount = 0
  showCount = 0
  showInactiveCount = 0
  alwaysOnTop = false
  allWorkspaces = false
  private readonly listeners = new Map<string, Listener[]>()
  load: () => Promise<void> = async () => {}
  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }
  once(event: string, listener: Listener): void {
    const wrapped = (...args: any[]): void => {
      this.remove(event, wrapped)
      listener(...args)
    }
    this.on(event, wrapped)
  }
  remove(event: string, listener: Listener): void {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter(current => current !== listener))
  }
  emit(event: string, ...args: any[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args)
  }
  destroy(): void {
    this.destroyedCount += 1
    this.destroyed = true
    this.visible = false
    this.webContents.emit('destroyed')
    this.emit('closed')
  }
  focus(): void { this.focusCount += 1; this.focused = true }
  hide(): void { this.hideCount += 1; this.visible = false; this.focused = false }
  isDestroyed(): boolean { return this.destroyed }
  isFocused(): boolean { return this.focused }
  isVisible(): boolean { return this.visible }
  loadURL(_url: string): Promise<void> { this.loadCount += 1; return this.load() }
  setAlwaysOnTop(value: boolean): void { this.alwaysOnTop = value }
  setBounds(value: Rectangle): void { this.bounds = value }
  setVisibleOnAllWorkspaces(value: boolean): void { this.allWorkspaces = value }
  show(): void { this.showCount += 1; this.visible = true }
  showInactive(): void { this.showInactiveCount += 1; this.visible = true }
}

function actionRecord(item: LauncherInternalResultItem): LauncherActionRecord {
  return Object.freeze({
    actionId: 'launcher-action:test',
    argument: item.defaultAction.argument,
    expiresAt: Date.now() + 30_000,
    handlerKey: item.defaultAction.handlerKey,
    hideWindowAfterInvocation: item.defaultAction.hideWindowAfterInvocation === true,
    owner: { role: 'launcher' as const, webContentsId: 77 },
    requiresConfirmation: item.defaultAction.requiresConfirmation === true,
    resultSetId: 'launcher-results:1',
    sourceExtension: item.sourceExtension,
  })
}

function setup(
  platform: NodeJS.Platform = 'linux',
  configure?: (window: FakeWindow) => void,
  onWindowCleared?: (window: { webContents: { id: number } }) => void,
  showInactive = false,
  beforeShow?: () => Promise<void>,
) {
  const windows: FakeWindow[] = []
  const callbacks: (() => void)[] = []
  const unregistered: string[] = []
  let registerResult = true
  let focusAppCount = 0
  const workArea = { x: 100, y: 50, width: 1440, height: 900 }
  const controller = new LauncherOverlayController({
    createWindow: () => {
      const window = new FakeWindow()
      configure?.(window)
      windows.push(window)
      return window
    },
    getDisplayWorkArea: () => workArea,
    focusApp: () => { focusAppCount += 1 },
    globalShortcut: {
      register: (_accelerator, callback) => {
        if (!registerResult) return false
        callbacks.push(callback)
        return true
      },
      unregister: accelerator => { unregistered.push(accelerator) },
    },
    loadWindow: window => window.loadURL('file:///launcher.html'),
    ...(onWindowCleared === undefined ? {} : { onWindowCleared }),
    ...(beforeShow === undefined ? {} : { beforeShow }),
    platform,
    showInactive,
    registerWindow: () => () => {},
  })
  return {
    callbacks,
    controller,
    focusAppCount: () => focusAppCount,
    setRegisterResult: (value: boolean) => { registerResult = value },
    unregistered,
    windows,
  }
}

test('main-frame navigation revokes document ownership without discarding the reusable window', async () => {
  const revoked: number[] = []
  const result = setup('linux', undefined, window => { revoked.push(window.webContents.id) })
  try {
    await result.controller.show()
    const window = result.windows[0]!
    window.webContents.emit('did-start-navigation', {}, 'file:///launcher.html', false, false)
    window.webContents.emit('did-start-navigation', {}, 'file:///launcher.html#same', true, true)
    assert.deepEqual(revoked, [])
    window.webContents.emit('did-start-navigation', {}, 'file:///launcher.html', false, true)
    assert.deepEqual(revoked, [window.webContents.id])
    await result.controller.show()
    assert.equal(result.windows.length, 1)
    assert.equal(window.destroyed, false)
  } finally { result.controller.dispose() }
})

test('every opening captures its current originating app before focus changes', async () => {
  const origin = new TrustedRaycastOrigin()
  let frontmost = 'B'
  let captures = 0
  const result = setup('darwin', window => {
    window.focus = () => { FakeWindow.prototype.focus.call(window); frontmost = 'TockTeam' }
  }, undefined, false, async () => {
    captures++
    await origin.capture(async () => ({ name: frontmost, capturedAt: Date.now() }))
  })
  try {
    await result.controller.show()
    assert.equal(origin.current?.name, 'B')
    await result.controller.show()
    assert.equal(captures, 1, 'showing an already-focused window preserves the current opening')
    result.controller.hide(); origin.clear()
    frontmost = 'C'
    await result.controller.toggle()
    assert.equal(origin.current?.name, 'C', 'switching applications while hidden changes the next native target')
    assert.equal(frontmost, 'TockTeam')
  } finally { result.controller.dispose() }
})

test('hiding during a pending before-show capture cannot reopen the launcher', async () => {
  const gate = Promise.withResolvers<void>()
  let entered = false
  const result = setup('darwin', undefined, undefined, false, async () => { entered = true; await gate.promise })
  const showing = result.controller.show()
  try {
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(entered, true)
    result.controller.hide()
    gate.resolve(); await showing
    assert.equal(result.controller.getState().visible, false)
    assert.equal(result.focusAppCount(), 0)
  } finally { gate.resolve(); await showing; result.controller.dispose() }
})

test('launcher shortcut and geometry use the platform contract', () => {
  assert.equal(resolveLauncherShortcut('darwin'), 'Option+Space')
  assert.equal(resolveLauncherShortcut('linux'), 'Alt+Space')
  assert.equal(resolveLauncherShortcut('win32'), 'Alt+Space')
  assert.deepEqual(resolveLauncherBounds({ x: 100, y: 50, width: 1440, height: 900 }), {
    height: 475,
    width: 750,
    x: 445,
    y: 158,
  })
  assert.deepEqual(resolveLauncherBounds({ x: -20, y: -10, width: 40, height: 20 }), {
    height: 1,
    width: 8,
    x: -4,
    y: 6,
  })
})

test('smoke placement prefers a connected non-primary display with a safe cursor-display fallback', () => {
  const primary = { x: 0, y: 0, width: 1440, height: 900 }
  const extended = { x: 1440, y: 0, width: 1920, height: 1080 }
  const displays = [{ id: 1, workArea: primary }, { id: 2, workArea: extended }]
  assert.deepEqual(resolveLauncherDisplayWorkArea(displays, 1, primary, true), extended)
  assert.deepEqual(resolveLauncherDisplayWorkArea(displays.slice(0, 1), 1, primary, true), primary)
  assert.throws(() => resolveLauncherDisplayWorkArea(displays.slice(0, 1), 1, primary, true, true), /requires a connected extended display/)
  assert.deepEqual(resolveLauncherDisplayWorkArea(displays, 1, primary, false), primary)
})

test('macOS activates the app before showing the launcher', async () => {
  const mac = setup('darwin')
  await mac.controller.show()
  assert.equal(mac.focusAppCount(), 1)
  const linux = setup('linux')
  await linux.controller.show()
  assert.equal(linux.focusAppCount(), 0)
})

test('bounded visual proof can show without activating or focusing the app', async () => {
  const result = setup('darwin', undefined, undefined, true)
  await result.controller.show()
  assert.equal(result.focusAppCount(), 0)
  assert.equal(result.windows[0]?.showCount, 0)
  assert.equal(result.windows[0]?.focusCount, 0)
  assert.equal(result.windows[0]?.showInactiveCount, 1)
})

test('bounded visual proof fails closed without inactive window support', async () => {
  const result = setup('darwin', window => { window.showInactive = undefined as never }, undefined, true)
  await assert.rejects(() => result.controller.show(), /requires showInactive support/u)
  assert.equal(result.focusAppCount(), 0)
  assert.equal(result.windows[0]?.showCount, 0)
  assert.equal(result.windows[0]?.focusCount, 0)
})

test('launcher lazily creates and reuses one focused, rebound window', async () => {
  const setupResult = setup()
  assert.equal(setupResult.controller.registerShortcut().status, 'registered')
  await Promise.all([setupResult.controller.show(), setupResult.controller.show()])
  assert.equal(setupResult.windows.length, 1)
  assert.equal(setupResult.windows[0]?.loadCount, 1)
  assert.deepEqual(setupResult.windows[0]?.bounds, { height: 475, width: 750, x: 445, y: 158 })
  assert.equal(setupResult.windows[0]?.showCount, 2)
  assert.equal(setupResult.windows[0]?.focusCount, 2)
  assert.deepEqual(setupResult.windows[0]?.webContents.sent, [
    LAUNCHER_WINDOW_IPC_CHANNELS.focusSearch,
    LAUNCHER_WINDOW_IPC_CHANNELS.focusSearch,
  ])
  await setupResult.controller.show()
  assert.equal(setupResult.windows[0]?.loadCount, 1)

  setupResult.controller.hide()
  assert.equal(setupResult.windows[0]?.visible, false)
  setupResult.callbacks[0]?.()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(setupResult.windows[0]?.visible, true)
  setupResult.callbacks[0]?.()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(setupResult.windows[0]?.visible, false)
})

test('concurrent shows wait for the shared load and reject together when it fails', async () => {
  let failLoad: ((error: Error) => void) | undefined
  const result = setup('linux', window => {
    window.load = () => new Promise<void>((_resolve, reject) => { failLoad = reject })
  })
  const first = result.controller.show()
  const second = result.controller.show()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(result.windows[0]?.showCount, 0)
  failLoad?.(new Error('deferred load failed'))
  const settled = await Promise.allSettled([first, second])
  assert.deepEqual(settled.map(entry => entry.status), ['rejected', 'rejected'])
  assert.equal(result.windows[0]?.destroyed, true)
})

test('concurrent toggles preserve both intents while the launcher loads', async () => {
  let release: (() => void) | undefined
  const result = setup('linux', window => {
    window.load = () => new Promise<void>(resolve => { release = resolve })
  })
  const first = result.controller.toggle()
  const second = result.controller.toggle()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(result.windows[0]?.showCount, 0)
  release?.()
  await Promise.all([first, second])
  assert.equal(result.windows[0]?.showCount, 1)
  assert.equal(result.windows[0]?.hideCount, 1)
  assert.equal(result.windows[0]?.visible, false)
})

test('renderer owns Escape while the controller still hides on blur', async () => {
  const { controller, windows } = setup()
  await controller.show()
  const window = windows[0]!
  window.webContents.emit('before-input-event', { preventDefault: () => {} }, { type: 'keyUp', key: 'Escape' })
  assert.equal(window.visible, true)
  window.webContents.emit('before-input-event', { preventDefault: () => {}, }, { type: 'keyDown', key: 'Enter' })
  assert.equal(window.visible, true)
  let prevented = 0
  window.webContents.emit('before-input-event', { preventDefault: () => { prevented += 1 } }, { type: 'rawKeyDown', key: 'Escape' })
  assert.equal(prevented, 0)
  assert.equal(window.visible, true)
  await controller.show()
  window.emit('blur')
  assert.equal(window.visible, false)
})

test('window clear aborts an OS confirmation before renderer ownership is revoked', async () => {
  let release!: (value: boolean) => void
  let confirmationSignal: AbortSignal | undefined
  const effects: LauncherOsEffects = {
    confirmPrivilegedAction: async (_prompt, signal) => {
      confirmationSignal = signal
      return await new Promise<boolean>(resolve => { release = resolve })
    },
    invokeSystemCommand: async () => { throw new Error('must not run') },
    invokeUeliCommand: async () => undefined,
    openControlPanelItem: async () => undefined,
    openSystemSetting: async () => undefined,
    toggleAppearance: async () => undefined,
  }
  const provider = createLauncherOsExtensions({
    effects,
    enabledExtensionIds: () => ['SystemCommands'],
    getSetting: <T>(_key: string, fallback: T) => fallback,
    linuxTrashCapability: { atomic: true, empty: async () => undefined },
    platform: 'Linux',
    scanControlPanelItems: async () => [],
  })
  const result = setup('linux', undefined, () => { provider.invalidate() })
  await result.controller.show()
  const item = (await provider.loadIndexedItems()).find(candidate => candidate.name === 'Empty Trash')!
  const pending = provider.executeAction(actionRecord(item))
  await new Promise(resolve => setImmediate(resolve))
  result.windows[0]!.webContents.emit('render-process-gone')
  assert.equal(confirmationSignal?.aborted, true)
  release(true)
  await assert.rejects(pending, /stale|canceled/i)
  await provider.waitForIdle()
  await provider.close()
})

test('renderer cleanup notifies the action owner exactly once', async () => {
  const cleared: number[] = []
  const result = setup('linux', undefined, window => { cleared.push(window.webContents.id) })
  await result.controller.show()
  result.windows[0]!.webContents.emit('render-process-gone')
  assert.deepEqual(cleared, [result.windows[0]!.webContents.id])
  result.windows[0]!.emit('closed')
  assert.deepEqual(cleared, [result.windows[0]!.webContents.id])
})

test('failed load or renderer death destroys ownership and allows retry', async () => {
  const failure = setup('linux', window => {
    window.load = async () => { throw new Error('load failed') }
  })
  await assert.rejects(() => failure.controller.show(), /load failed/u)
  assert.equal(failure.windows[0]?.destroyed, true)

  const retry = setup()
  await retry.controller.show()
  const first = retry.windows[0]!
  first.webContents.emit('render-process-gone')
  assert.equal(first.destroyed, true)
  await retry.controller.show()
  assert.equal(retry.windows.length, 2)
})

test('renderer failure and disposal reject an in-flight load and destroy only launcher ownership', async () => {
  let release: (() => void) | undefined
  const result = setup('linux', window => {
    window.load = () => new Promise<void>(resolve => { release = resolve })
  })
  const pending = result.controller.show()
  const window = result.windows[0]!
  window.webContents.emit('render-process-gone')
  await assert.rejects(pending, /destroyed while loading/u)
  assert.equal(window.destroyed, true)
  release?.()

  let releaseOnDispose: (() => void) | undefined
  const disposed = setup('linux', window => {
    window.load = () => new Promise<void>(resolve => { releaseOnDispose = resolve })
  })
  const pendingDispose = disposed.controller.show()
  const disposedWindow = disposed.windows[0]!
  disposed.controller.dispose()
  await assert.rejects(pendingDispose, /disposed|destroyed while loading/u)
  assert.equal(disposedWindow.destroyed, true)
  releaseOnDispose?.()
})

test('window preferences apply live and shortcut enablement stays owner-scoped', async () => {
  const result = setup()
  result.controller.registerShortcut()
  result.controller.applyWindowPreferences({ alwaysOnTop: false, visibleOnAllWorkspaces: false })
  await result.controller.show()
  const window = result.windows[0]!
  assert.equal(window.alwaysOnTop, false)
  assert.equal(window.allWorkspaces, false)
  result.controller.setShortcutEnabled(false)
  assert.equal(result.controller.getState().shortcut.status, 'unavailable')
  assert.deepEqual(result.unregistered, ['Alt+Space'])
  result.controller.setShortcutEnabled(true)
  assert.equal(result.controller.getState().shortcut.status, 'registered')
  assert.equal(result.callbacks.length, 2)
  result.controller.hideAfterInvocation(999)
  assert.equal(window.visible, true)
  result.controller.hideAfterInvocation(window.webContents.id)
  assert.equal(window.visible, false)
})

test('shortcut conflicts preserve fallback and disposal unregisters only owned shortcut', () => {
  const conflict = setup()
  conflict.setRegisterResult(false)
  const state = conflict.controller.registerShortcut()
  assert.equal(state.status, 'unavailable')
  assert.match(state.message ?? '', /TockLauncher button in the TockTeam navigation bar/u)
  assert.deepEqual(conflict.unregistered, [])

  const owned = setup('darwin')
  assert.equal(owned.controller.registerShortcut().accelerator, 'Option+Space')
  owned.controller.dispose()
  owned.controller.dispose()
  assert.deepEqual(owned.unregistered, ['Option+Space'])
  owned.callbacks[0]?.()
  assert.equal(owned.windows.length, 0)
})
