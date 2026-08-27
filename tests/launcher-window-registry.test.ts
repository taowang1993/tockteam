import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LauncherWindowRegistry } from '../src/launcher-window-registry.ts'

class FakeWindow {
  destroyed = false
  readonly webContents = { id: 1, getURL: () => 'file:///launcher.html', mainFrame: {}, session: {} }
  private listener: (() => void) | undefined
  isDestroyed(): boolean { return this.destroyed }
  once(_event: 'closed', listener: () => void): void { this.listener = listener }
  close(): void { this.destroyed = true; this.listener?.() }
}

test('launcher registry keeps singleton identity and stale close cannot clear replacement', () => {
  const registry = new LauncherWindowRegistry()
  const first = new FakeWindow()
  const firstDispose = registry.register('launcher', first)
  assert.equal(registry.resolveWindow(first.webContents), first)
  assert.throws(() => registry.register('launcher', new FakeWindow()), /already registered/u)
  firstDispose()

  const replacement = new FakeWindow()
  registry.register('launcher', replacement)
  first.close()
  assert.equal(registry.resolveWindow(replacement.webContents), replacement)
  assert.equal(registry.roleOf(replacement), 'launcher')
  replacement.close()
  assert.equal(registry.size, 0)
})
