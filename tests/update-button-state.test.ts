import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type {
  DesktopAppUpdateActionResult,
  DesktopAppUpdateState,
} from '../src/desktop-app-update.ts'
import type { DesktopAppUpdateBridge } from '../src/contracts.ts'
import {
  desktopUpdateIndicatorState,
  observeDesktopAppUpdate,
  runDesktopUpdateAction,
} from '../plugins/sidebar/src/client/update-indicator.ts'

function state(
  status: DesktopAppUpdateState['status'],
  overrides: Partial<DesktopAppUpdateState> = {},
): DesktopAppUpdateState {
  return {
    channel: 'stable',
    enabled: true,
    status,
    currentVersion: '1.0.0',
    availableVersion: status === 'available' || status === 'downloading' || status === 'downloaded' ? '1.1.0' : null,
    downloadedVersion: status === 'downloaded' ? '1.1.0' : null,
    downloadPercent: status === 'downloading' ? 42 : null,
    message: null,
    errorContext: null,
    checkedAt: null,
    canRetry: true,
    ...overrides,
  }
}

function result(next: DesktopAppUpdateState): DesktopAppUpdateActionResult {
  return { accepted: true, completed: true, state: next }
}

test('title-bar indicator stays inside the Desktop shell and existing bridge', () => {
  const source = readFileSync(new URL('../plugins/sidebar/src/client/plugin.tsx', import.meta.url), 'utf8')
  assert.match(source, /function DesktopUpdateIndicator\(/u)
  assert.match(source, /window\.dshDesktop\?\.appUpdate/u)
  assert.match(source, /observeDesktopAppUpdate\(appUpdate, setState\)/u)
  assert.match(source, /runDesktopUpdateAction\(appUpdate, action\)/u)
  assert.match(source, /<DesktopUpdateIndicator t=\{t\} \/>/u)
  assert.match(source, /props\.showDesktopChrome && createPortal\(/u)
  assert.doesNotMatch(source, /appUpdate\.check\(/u)
})

test('maps only actionable updater states to visible title-bar actions', () => {
  assert.equal(desktopUpdateIndicatorState(null), null)
  assert.equal(desktopUpdateIndicatorState(state('disabled')), null)
  assert.equal(desktopUpdateIndicatorState(state('disabled', { enabled: false })), null)
  for (const status of ['idle', 'checking', 'error'] as const) {
    assert.equal(desktopUpdateIndicatorState(state(status)), null)
  }
  assert.deepEqual(desktopUpdateIndicatorState(state('available')), {
    status: 'available',
    action: 'download',
    disabled: false,
    progress: null,
  })
  assert.deepEqual(desktopUpdateIndicatorState(state('downloading')), {
    status: 'downloading',
    action: null,
    disabled: true,
    progress: 42,
  })
  assert.deepEqual(desktopUpdateIndicatorState(state('downloaded')), {
    status: 'downloaded',
    action: 'install',
    disabled: false,
    progress: null,
  })
})

test('follows changes without letting a stale initial state overwrite them', async () => {
  let resolveInitial!: (next: DesktopAppUpdateState) => void
  const initial = new Promise<DesktopAppUpdateState>(resolve => { resolveInitial = resolve })
  let listener: ((next: DesktopAppUpdateState) => void) | undefined
  let removed = 0
  const bridge = {
    getState: async () => await initial,
    check: async () => result(state('idle')),
    download: async () => result(state('downloading')),
    install: async () => result(state('downloaded')),
    onStateChange: (next: (value: DesktopAppUpdateState) => void) => {
      listener = next
      return () => { removed += 1 }
    },
  } satisfies DesktopAppUpdateBridge
  const seen: DesktopAppUpdateState['status'][] = []
  const dispose = observeDesktopAppUpdate(bridge, next => { seen.push(next.status) })

  listener?.(state('downloaded'))
  resolveInitial(state('available'))
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.deepEqual(seen, ['downloaded'])

  dispose()
  listener?.(state('error'))
  assert.equal(removed, 1)
  assert.deepEqual(seen, ['downloaded'])
})

test('dispatches the mapped action and suppresses bounded action failures', async () => {
  const calls: string[] = []
  const bridge = {
    getState: async () => state('available'),
    check: async () => result(state('idle')),
    download: async () => { calls.push('download'); return result(state('downloading')) },
    install: async () => { calls.push('install'); throw new Error('native detail must not escape') },
    onStateChange: () => () => {},
  } satisfies DesktopAppUpdateBridge

  await runDesktopUpdateAction(bridge, desktopUpdateIndicatorState(state('available'))?.action ?? null)
  await runDesktopUpdateAction(bridge, desktopUpdateIndicatorState(state('downloaded'))?.action ?? null)
  await runDesktopUpdateAction(bridge, desktopUpdateIndicatorState(state('downloading'))?.action ?? null)
  assert.deepEqual(calls, ['download', 'install'])
})
