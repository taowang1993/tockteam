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
  const delivery = createLauncherWorkbenchRouteDelivery<object>((window: object, route: { destination: 'tockcoder' | 'tocktutor' }) => {
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

test('route delivery also supports the typed channel/payload seam', () => {
  const window = {}
  const sent: Array<{ channel: string; payload: unknown }> = []
  const delivery = createLauncherWorkbenchRouteDelivery<object>((target: object, channel: string, payload: { destination: 'tockcoder' | 'tocktutor' }) => {
    assert.equal(target, window)
    sent.push({ channel, payload })
  })
  delivery.deliver(window, LAUNCHER_WORKBENCH_ROUTE_CHANNEL, { destination: 'tocktutor' })
  assert.deepEqual(sent, [])
  delivery.markReady(window)
  assert.deepEqual(sent, [{ channel: LAUNCHER_WORKBENCH_ROUTE_CHANNEL, payload: { destination: 'tocktutor' } }])
})

test('route delivery retains an unsent route when renderer delivery fails', () => {
  const window = {}
  let failures = 1
  const sent: string[] = []
  const delivery = createLauncherWorkbenchRouteDelivery<object>((_window: object, route: { destination: 'tockcoder' | 'tocktutor' }) => {
    if (failures > 0) {
      failures -= 1
      throw new Error('renderer gone')
    }
    sent.push(route.destination)
  })
  delivery.deliver(window, { destination: 'tocktutor' })
  assert.throws(() => delivery.markReady(window), /renderer gone/u)
  assert.equal(delivery.isReady(window), false)
  // The sender has failed once; the second markReady retries the same intent.
  delivery.markReady(window)
  assert.deepEqual(sent, ['tocktutor'])
})

test('route delivery requeues a failed immediate send and marks the window unready', () => {
  const window = {}
  let fail = true
  const sent: string[] = []
  const delivery = createLauncherWorkbenchRouteDelivery<object>((_window: object, route: { destination: 'tockcoder' | 'tocktutor' }) => {
    if (fail) {
      fail = false
      throw new Error('renderer gone')
    }
    sent.push(route.destination)
  })
  delivery.markReady(window)
  assert.throws(() => delivery.deliver(window, { destination: 'tocktutor' }), /renderer gone/u)
  assert.equal(delivery.isReady(window), false)
  delivery.markReady(window)
  assert.deepEqual(sent, ['tocktutor'])
})

test('command delivery retains only unsent FIFO commands when delivery fails', () => {
  const window = {}
  let calls = 0
  const sent: string[] = []
  const delivery = createLauncherWorkbenchCommandDelivery<object, string>((_window, value) => {
    calls += 1
    if (calls === 2) throw new Error('renderer gone')
    sent.push(value)
  }, 4)
  delivery.deliver(window, 'first')
  delivery.deliver(window, 'second')
  delivery.deliver(window, 'third')
  assert.throws(() => delivery.markReady(window), /renderer gone/u)
  assert.equal(delivery.isReady(window), false)
  delivery.markReady(window)
  assert.deepEqual(sent, ['first', 'second', 'third'])
})

test('failed workbench intents transfer to a replacement readiness handshake', () => {
  const first = {}
  const replacement = {}
  const routes: string[] = []
  let routeFailure = true
  const routeDelivery = createLauncherWorkbenchRouteDelivery<object>((_window, route) => {
    if (routeFailure) {
      routeFailure = false
      throw new Error('first renderer gone')
    }
    routes.push(route.destination)
  })
  routeDelivery.deliver(first, { destination: 'tocktutor' })
  assert.throws(() => routeDelivery.markReady(first), /first renderer gone/u)
  const pendingRoute = routeDelivery.takePending(first)
  assert.deepEqual(pendingRoute, { destination: 'tocktutor' })
  routeDelivery.deliver(replacement, pendingRoute!)
  routeDelivery.markReady(replacement)
  assert.deepEqual(routes, ['tocktutor'])

  const commands: string[] = []
  let commandFailure = true
  const commandDelivery = createLauncherWorkbenchCommandDelivery<object, string>((_window, command) => {
    if (commandFailure) {
      commandFailure = false
      throw new Error('first renderer gone')
    }
    commands.push(command)
  })
  commandDelivery.deliver(first, 'queued-command')
  assert.throws(() => commandDelivery.markReady(first), /first renderer gone/u)
  const pendingCommands = commandDelivery.takePending(first)
  for (const command of pendingCommands) commandDelivery.deliver(replacement, command)
  commandDelivery.markReady(replacement)
  assert.deepEqual(commands, ['queued-command'])
})

test('command delivery preserves bounded FIFO order and rebinds recreated windows', () => {
  const first = {}
  const second = {}
  const sent: Array<{ window: object; value: string }> = []
  const delivery = createLauncherWorkbenchCommandDelivery<object, string>((window: object, value: string) => {
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

test('route dispatch recreates a missing workbench and focuses it', () => {
  const calls: string[] = []
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: () => { calls.push('restore') },
    show: () => { calls.push('show') },
    focus: () => { calls.push('focus') },
  }
  let created = 0
  dispatchLauncherRouteToWorkbench({
    createWorkbench: () => { created += 1; return window },
    destination: 'tockcoder',
    send: (_window: typeof window, route: { destination: 'tockcoder' | 'tocktutor' }) => { calls.push(`route:${route.destination}`) },
    workbenchWindow: null,
  })
  assert.equal(created, 1)
  assert.deepEqual(calls, ['show', 'focus', 'route:tockcoder'])
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
    send: (_window: typeof window, route: { destination: 'tockcoder' | 'tocktutor' }) => { calls.push(`route:${route.destination}`) },
    workbenchWindow: window,
  })
  assert.equal(target, window)
  assert.equal(created, 0)
  assert.deepEqual(calls, ['restore', 'focus', 'route:tocktutor'])
})
