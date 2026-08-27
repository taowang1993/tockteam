import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LAUNCHER_WORKBENCH_ROUTE_CHANNEL,
  parseLauncherWorkbenchRoute,
  resolveLauncherRoutePath,
} from '../src/launcher-navigation.ts'
import {
  createLauncherWorkbenchCommandDelivery,
  createLauncherWorkbenchRouteDelivery,
  dispatchLauncherRouteToWorkbench,
} from '../src/launcher-workbench-navigation.ts'

test('launcher routes are finite and strict', () => {
  assert.deepEqual(parseLauncherWorkbenchRoute({ destination: 'tockcoder' }), { destination: 'tockcoder' })
  assert.deepEqual(parseLauncherWorkbenchRoute({ destination: 'tocktutor' }), { destination: 'tocktutor' })
  assert.equal(resolveLauncherRoutePath('tockcoder'), '/tockcoder')
  assert.equal(resolveLauncherRoutePath('tocktutor'), '/tocktutor')
  assert.throws(() => parseLauncherWorkbenchRoute({ destination: 'settings' }), /destination/u)
  assert.throws(() => parseLauncherWorkbenchRoute({ destination: 'tockcoder', path: '/unsafe' }), /route/u)
  assert.throws(() => parseLauncherWorkbenchRoute(['tockcoder']), /route/u)
})

test('route delivery keeps one latest route until a window is ready', () => {
  const first = {}
  const sent: Array<{ window: object; route: unknown }> = []
  const delivery = createLauncherWorkbenchRouteDelivery<object>((window, route) => {
    sent.push({ window, route })
  })
  delivery.deliver(first, { destination: 'tockcoder' })
  delivery.deliver(first, { destination: 'tocktutor' })
  assert.deepEqual(sent, [])
  delivery.markReady(first)
  assert.deepEqual(sent, [{ window: first, route: { destination: 'tocktutor' } }])
  delivery.markReady(first)
  assert.equal(sent.length, 1)
  delivery.markUnready(first)
  delivery.deliver(first, { destination: 'tockcoder' })
  assert.equal(sent.length, 1)
})

test('command delivery preserves bounded FIFO order and rebinds recreated windows', () => {
  const first = {}
  const second = {}
  const sent: Array<{ window: object; value: string }> = []
  const delivery = createLauncherWorkbenchCommandDelivery<object, string>((window, value) => {
    sent.push({ window, value })
  }, 3)
  delivery.deliver(first, 'paths')
  delivery.deliver(first, 'settings')
  delivery.markReady(first)
  delivery.deliver(first, 'focus')
  delivery.markUnready(first)
  delivery.deliver(second, 'new-window-command')
  delivery.markReady(second)
  assert.deepEqual(sent, [
    { window: first, value: 'paths' },
    { window: first, value: 'settings' },
    { window: first, value: 'focus' },
    { window: second, value: 'new-window-command' },
  ])
  assert.equal(LAUNCHER_WORKBENCH_ROUTE_CHANNEL, 'launcher:workbench-route')
})

test('route dispatch restores and focuses the canonical workbench without reloading', () => {
  const calls: string[] = []
  const window = {
    destroyed: false,
    minimized: true,
    isDestroyed: () => false,
    isMinimized: () => window.minimized,
    restore: () => { calls.push('restore'); window.minimized = false },
    focus: () => { calls.push('focus') },
  }
  let created = 0
  const target = dispatchLauncherRouteToWorkbench({
    createWorkbench: () => { created += 1; return window },
    destination: 'tocktutor',
    send: (_window, route) => { calls.push(`route:${route.destination}`) },
    workbenchWindow: window,
  })
  assert.equal(target, window)
  assert.equal(created, 0)
  assert.deepEqual(calls, ['restore', 'focus', 'route:tocktutor'])
})
