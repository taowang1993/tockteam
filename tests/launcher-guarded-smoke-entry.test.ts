import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { test } from 'node:test'

class GuardedWindow extends EventEmitter {
  readonly options: Record<string, unknown>
  readonly bounds: { width: number; height: number }
  readonly webContents = new EventEmitter()
  visible = true
  destroyed = false

  constructor(options: Record<string, unknown>) {
    super()
    this.options = options
    this.bounds = options.parent
      ? { width: options.width as number, height: options.height as number }
      : { width: 1366, height: 994 }
  }

  destroy(): void { this.destroyed = true }
  getBounds(): { width: number; height: number } { return this.bounds }
  hide(): void { this.visible = false }
  isDestroyed(): boolean { return this.destroyed }
  isVisible(): boolean { return this.visible }
}

type FakeElectron = { BrowserWindow: typeof GuardedWindow }
const { installBoundedLauncherSmoke } = createRequire(import.meta.url)('../scripts/launcher-guarded-smoke-entry.mjs') as {
  installBoundedLauncherSmoke: (electron: FakeElectron) => void
}

test('guarded Launcher smoke keeps its popup bounded and closes it on workbench click-away', () => {
  const electron: FakeElectron = { BrowserWindow: GuardedWindow }
  installBoundedLauncherSmoke(electron)
  const workbench = new electron.BrowserWindow({ title: 'TockTeam', width: 1280, height: 840 })
  assert.deepEqual(workbench.bounds, { width: 1366, height: 994 }, 'the guard still fills the side display for the main window')
  const launcher = new electron.BrowserWindow({ title: 'TockLauncher', width: 750, height: 475, alwaysOnTop: true })
  assert.deepEqual(launcher.bounds, { width: 750, height: 475 })
  assert.equal(launcher.options.parent, workbench)
  assert.equal(launcher.options.alwaysOnTop, false)
  workbench.webContents.emit('before-mouse-event', {}, { type: 'mouseMove' })
  assert.equal(launcher.isVisible(), true)
  workbench.webContents.emit('before-mouse-event', {}, { type: 'mouseDown' })
  assert.equal(launcher.isVisible(), false)
})

test('guarded Launcher smoke refuses to show a top-level popup without its owned workbench', () => {
  const electron: FakeElectron = { BrowserWindow: GuardedWindow }
  installBoundedLauncherSmoke(electron)
  assert.throws(() => new electron.BrowserWindow({ title: 'TockLauncher', width: 750, height: 475 }), /workbench parent/u)
})

test('guarded Launcher smoke destroys a popup if native bounds unexpectedly fill the display', () => {
  const created: GuardedWindow[] = []
  class IgnoringParentWindow extends GuardedWindow {
    constructor(options: Record<string, unknown>) { super(options); created.push(this) }
    override getBounds(): { width: number; height: number } { return { width: 1366, height: 994 } }
  }
  const electron = { BrowserWindow: IgnoringParentWindow }
  installBoundedLauncherSmoke(electron)
  new electron.BrowserWindow({ title: 'TockTeam', width: 1280, height: 840 })
  assert.throws(() => new electron.BrowserWindow({ title: 'TockLauncher', width: 750, height: 475 }), /native popup bounds/u)
  assert.equal(created[1]?.destroyed, true)
})
