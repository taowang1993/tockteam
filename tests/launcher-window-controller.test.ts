import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Rectangle } from 'electron'
import {
  LauncherOverlayController,
  resolveLauncherBounds,
  resolveLauncherShortcut,
} from '../src/launcher-window-controller.ts'

type Listener = (...args: any[]) => void

class FakeWebContents {
  readonly id = 77
  private readonly listeners = new Map<string, Listener[]>()
  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }
  emit(event: string, ...args: any[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args)
  }
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
}

function setup(
  platform: NodeJS.Platform = 'linux',
  configure?: (window: FakeWindow) => void,
) {
  const windows: FakeWindow[] = []
  const callbacks: (() => void)[] = []
  const unregistered: string[] = []
  let registerResult = true
  const workArea = { x: 100, y: 50, width: 1440, height: 900 }
  const controller = new LauncherOverlayController({
    createWindow: () => {
      const window = new FakeWindow()
      configure?.(window)
      windows.push(window)
      return window
    },
    getDisplayWorkArea: () => workArea,
    globalShortcut: {
      register: (_accelerator, callback) => {
        if (!registerResult) return false
        callbacks.push(callback)
        return true
      },
      unregister: accelerator => { unregistered.push(accelerator) },
    },
    loadWindow: window => window.loadURL('file:///launcher.html'),
    platform,
    registerWindow: () => () => {},
  })
  return {
    callbacks,
    controller,
    setRegisterResult: (value: boolean) => { registerResult = value },
    unregistered,
    windows,
  }
}

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

test('launcher lazily creates and reuses one focused, rebound window', async () => {
  const setupResult = setup()
  assert.equal(setupResult.controller.registerShortcut().status, 'registered')
  await Promise.all([setupResult.controller.show(), setupResult.controller.show()])
  assert.equal(setupResult.windows.length, 1)
  assert.equal(setupResult.windows[0]?.loadCount, 1)
  assert.deepEqual(setupResult.windows[0]?.bounds, { height: 475, width: 750, x: 445, y: 158 })
  assert.equal(setupResult.windows[0]?.showCount, 2)
  assert.equal(setupResult.windows[0]?.focusCount, 2)
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

test('blur and Escape keyDown/rawKeyDown dismiss but keyUp and unrelated keys do not', async () => {
  const { controller, windows } = setup()
  await controller.show()
  const window = windows[0]!
  window.webContents.emit('before-input-event', { preventDefault: () => {} }, { type: 'keyUp', key: 'Escape' })
  assert.equal(window.visible, true)
  window.webContents.emit('before-input-event', { preventDefault: () => {}, }, { type: 'keyDown', key: 'Enter' })
  assert.equal(window.visible, true)
  let prevented = 0
  window.webContents.emit('before-input-event', { preventDefault: () => { prevented += 1 } }, { type: 'rawKeyDown', key: 'Escape' })
  assert.equal(prevented, 1)
  assert.equal(window.visible, false)
  await controller.show()
  window.emit('blur')
  assert.equal(window.visible, false)
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

test('shortcut conflicts preserve fallback and disposal unregisters only owned shortcut', () => {
  const conflict = setup()
  conflict.setRegisterResult(false)
  const state = conflict.controller.registerShortcut()
  assert.equal(state.status, 'unavailable')
  assert.match(state.message ?? '', /TockLauncher button in the TockTeam titlebar/u)
  assert.deepEqual(conflict.unregistered, [])

  const owned = setup('darwin')
  assert.equal(owned.controller.registerShortcut().accelerator, 'Option+Space')
  owned.controller.dispose()
  owned.controller.dispose()
  assert.deepEqual(owned.unregistered, ['Option+Space'])
  owned.callbacks[0]?.()
  assert.equal(owned.windows.length, 0)
})
