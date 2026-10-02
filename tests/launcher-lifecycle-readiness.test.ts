import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LauncherLifecycleController, LauncherToggleIntentQueue } from '../src/launcher-lifecycle.ts'

test('overlapping readiness signals preserve a failed startup toggle for a later retry', async () => {
  const queue = new LauncherToggleIntentQueue()
  queue.capture(['app', '--toggle'])
  let toggles = 0
  let entered!: () => void
  const entering = new Promise<void>(resolve => { entered = resolve })
  let rejectToggle!: (reason: Error) => void
  const pendingToggle = new Promise<void>((_resolve, reject) => { rejectToggle = reject })
  const lifecycle = new LauncherLifecycleController({
    getSetting: (_key, fallback) => fallback,
    openWorkbenchSettings: () => {},
    overlay: {
      applyWindowPreferences: () => {},
      setShortcutEnabled: () => {},
      show: async () => {},
      toggle: async () => {
        toggles += 1
        if (toggles === 1) { entered(); await pendingToggle }
      },
    },
    queue,
    requestSecureQuit: () => {},
    rescan: async () => {},
    setDockVisible: () => {},
    setTrayVisible: () => {},
    updateSetting: async () => {},
  })
  try {
    const first = lifecycle.markReady()
    await entering
    const outcomes = Promise.allSettled([first, lifecycle.markReady()])
    rejectToggle(new Error('overlay temporarily unavailable'))
    const settled = await outcomes
    assert.equal(queue.hasPending(), true)
    await lifecycle.markReady()
    assert.equal(toggles, 2, 'a later readiness signal must retry the retained startup intent')
    assert.equal(queue.hasPending(), false)
    assert.deepEqual(settled.map(result => result.status), ['rejected', 'rejected'])
  } finally { lifecycle.dispose() }
})

test('overlapping cold readiness signals wait for setup and show the launcher once', async () => {
  const calls: string[] = []
  let finishSetup!: () => void
  const setup = new Promise<void>(resolve => { finishSetup = resolve })
  const lifecycle = new LauncherLifecycleController({
    getSetting: (key, fallback) => key === 'window.showOnStartup' ? true : fallback,
    openWorkbenchSettings: () => {},
    overlay: {
      applyWindowPreferences: () => { calls.push('preferences') },
      setShortcutEnabled: () => { calls.push('shortcut') },
      show: async () => { calls.push('show') },
      toggle: async () => { calls.push('toggle') },
    },
    queue: new LauncherToggleIntentQueue(),
    requestSecureQuit: () => {},
    rescan: async () => {},
    setDockVisible: async () => { calls.push('dock'); await setup },
    setTrayVisible: () => { calls.push('tray') },
    updateSetting: async () => {},
  })
  try {
    const pending = Promise.all([lifecycle.markReady(), lifecycle.markReady()])
    await Promise.resolve()
    assert.deepEqual(calls, ['dock'], 'startup display must wait for native setup')
    finishSetup()
    await pending
    assert.deepEqual(calls, ['dock', 'tray', 'shortcut', 'preferences', 'show'])
    await lifecycle.markReady()
    assert.equal(calls.filter(call => call === 'show').length, 1)
  } finally { finishSetup(); lifecycle.dispose() }
})

test('overlapping readiness signals share a display failure and allow a fresh startup attempt', async () => {
  let entered!: () => void
  const entering = new Promise<void>(resolve => { entered = resolve })
  let failShow!: (reason: Error) => void
  const firstShow = new Promise<void>((_resolve, reject) => { failShow = reject })
  let shows = 0
  const lifecycle = new LauncherLifecycleController({
    getSetting: (key, fallback) => key === 'window.showOnStartup' ? true : fallback,
    openWorkbenchSettings: () => {},
    overlay: {
      applyWindowPreferences: () => {},
      setShortcutEnabled: () => {},
      show: async () => {
        shows += 1
        if (shows === 1) { entered(); await firstShow }
      },
      toggle: async () => {},
    },
    queue: new LauncherToggleIntentQueue(),
    requestSecureQuit: () => {},
    rescan: async () => {},
    setDockVisible: () => {},
    setTrayVisible: () => {},
    updateSetting: async () => {},
  })
  try {
    const first = lifecycle.markReady()
    await entering
    const outcomes = Promise.allSettled([first, lifecycle.markReady()])
    failShow(new Error('renderer temporarily unavailable'))
    assert.deepEqual((await outcomes).map(result => result.status), ['rejected', 'rejected'])
    assert.equal(shows, 1)
    await lifecycle.markReady()
    assert.equal(shows, 2)
  } finally { lifecycle.dispose() }
})
