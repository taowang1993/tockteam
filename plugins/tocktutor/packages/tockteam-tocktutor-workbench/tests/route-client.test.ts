import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { TockTutorRoute } from '../dist/route.js'

function injectedFiber(
  context: unknown,
  callback: (context: unknown) => unknown,
): PromiseLike<void> & { dispose(): Promise<void> } {
  let dispose: unknown
  const settled = Promise.resolve().then(() => { dispose = callback(context) })
  return Object.assign(settled.then(() => undefined), {
    async dispose() {
      await settled.catch(() => undefined)
      if (typeof dispose === 'function') await dispose()
    },
  })
}

test('client contribution mounts Remote and the exact lifecycle-owned route seat', async () => {
  const client = await import('../dist/client-api.js')
  const mounted: TypertRemoteContribution[] = []
  const injected: string[] = []
  const registered: Array<{ options: { name: string }; component: unknown }> = []
  const disposed: string[] = []
  let declaration: (() => () => void) | undefined
  const context = {
    inject(deps: string[], callback: (child: unknown) => unknown) {
      assert.deepEqual(deps, ['remote', 'remote.tocktutorWorkbench', 'slots'])
      return injectedFiber(context, callback)
    },
    remote: {
      $on() { return () => {} },
      async $mount(contribution: TypertRemoteContribution) {
        mounted.push(contribution)
        return async () => { disposed.push('remote') }
      },
      tocktutorWorkbench: {},
    },
    slots: {
      inject(name: string, callback: () => () => void) {
        injected.push(name)
        declaration = callback
        return () => { disposed.push('inject') }
      },
      register(options: { name: string }, component: unknown) {
        registered.push({ options, component })
        return () => { disposed.push('route') }
      },
    },
  }

  const dispose = await client.apply(context as never)
  assert.equal(mounted.length, 1)
  assert.deepEqual(injected, ['tockteam.tocktutor.route'])
  assert.ok(declaration)
  const disposeRoute = declaration()
  assert.equal(registered.length, 1)
  assert.equal(registered[0]?.options.name, 'tockteam.tocktutor.route')
  assert.equal(registered[0]?.component, TockTutorRoute)
  const options = registered[0]?.options as {
    children?: Record<string, { kind: string; scope: string }>
    inject?: () => { remote: unknown }
    registrant?: string
  }
  assert.deepEqual(options.children, {
    'tockteam.tocktutor.workbench.assistant': { kind: 'single', scope: 'root' },
    'tockteam.tocktutor.workbench.native-actions': { kind: 'list', scope: 'root' },
    'tockteam.tocktutor.workbench.review': { kind: 'list', scope: 'root' },
  })
  assert.equal(options.registrant, '@tockteam/tocktutor-workbench')
  const routeRemote = options.inject?.().remote as {
    $mount?: unknown
    $on?: unknown
    tocktutorWorkbench?: unknown
  }
  assert.notEqual(routeRemote, context.remote)
  assert.equal(routeRemote.tocktutorWorkbench, context.remote.tocktutorWorkbench)
  assert.equal(typeof routeRemote.$on, 'function')
  assert.equal(routeRemote.$mount, undefined)
  disposeRoute()
  await dispose()
  assert.deepEqual(disposed, ['route', 'inject', 'remote'])
})

test('keeps the route inside a literal Remote namespace child across loss and reload', async () => {
  const client = await import('../dist/client-api.js')
  const ctx = new Context()
  const namespace = { marker: 'tocktutor-workbench' }
  const cleanup: string[] = []
  const registrations: Array<{
    active: boolean
    options: { inject(): { remote: { tocktutorWorkbench: unknown } } }
  }> = []
  let removeNamespace: (() => void) | undefined
  const provideNamespace = (): void => {
    removeNamespace = ctx.reflect.provide('remote.tocktutorWorkbench', namespace)
  }
  ctx.reflect.provide('remote', {
    get tocktutorWorkbench() { return ctx.get('remote.tocktutorWorkbench') },
    $on() { return () => {} },
    async $mount() {
      provideNamespace()
      return async () => {
        removeNamespace?.()
        cleanup.push('remote')
      }
    },
  })
  ctx.reflect.provide('slots', {
    inject(_name: string, declaration: () => () => void) {
      const dispose = declaration()
      return () => {
        dispose()
        cleanup.push('inject')
      }
    },
    register(options: { inject(): { remote: { tocktutorWorkbench: unknown } } }) {
      const registration = { active: true, options }
      registrations.push(registration)
      return () => {
        registration.active = false
        cleanup.push('route')
      }
    },
  })

  const fiber = ctx.plugin(client as never, undefined as never)
  await fiber
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0]?.active, true)
  assert.equal(registrations[0]?.options.inject().remote.tocktutorWorkbench, namespace)

  removeNamespace?.()
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
  assert.equal(registrations[0]?.active, false)

  provideNamespace()
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
  assert.equal(registrations.length, 2)
  assert.equal(registrations[1]?.active, true)
  assert.equal(registrations[1]?.options.inject().remote.tocktutorWorkbench, namespace)

  await fiber.dispose()
  assert.equal(registrations[1]?.active, false)
  assert.deepEqual(cleanup.slice(-3), ['route', 'inject', 'remote'])
  await ctx.fiber.dispose()
})

test('Web and TUI lifecycles without the Desktop route declaration mount no workbench slots', async () => {
  const client = await import('../dist/client-api.js')
  let registered = 0
  let remoteDisposed = 0
  let injectDisposed = 0
  const context = {
    inject(_deps: string[], callback: (child: unknown) => unknown) {
      return injectedFiber(context, callback)
    },
    remote: {
      $on() { return () => {} },
      async $mount() { return async () => { remoteDisposed += 1 } },
      tocktutorWorkbench: {},
    },
    slots: {
      inject() { return () => { injectDisposed += 1 } },
      register() {
        registered += 1
        return () => {}
      },
    },
  }
  const dispose = await client.apply(context as never)
  assert.equal(registered, 0)
  await dispose()
  assert.deepEqual({ injectDisposed, remoteDisposed }, { injectDisposed: 1, remoteDisposed: 1 })
})

test('route registration failure withdraws the already-mounted Remote contribution', async () => {
  const client = await import('../dist/client-api.js')
  const failure = new Error('route seat unavailable')
  let remoteDisposed = 0
  const context = {
    inject(_deps: string[], callback: (child: unknown) => unknown) {
      return injectedFiber(context, callback)
    },
    remote: {
      $on() { return () => {} },
      async $mount() { return async () => { remoteDisposed += 1 } },
      tocktutorWorkbench: {},
    },
    slots: {
      inject() { throw failure },
    },
  }
  await assert.rejects(client.apply(context as never), error => error === failure)
  assert.equal(remoteDisposed, 1)
})
