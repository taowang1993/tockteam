import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apply,
  inject,
  name,
} from '../dist/client-api.js'

const slotName = 'tockteam.tocktutor.workbench.native-actions'

test('still cancels dispatch and disposes Remote when slot disposal fails', async () => {
  const cleanup: string[] = []
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      dshDesktop: {
        tockTutor: {
          authorize: async () => ({ authorization: 'authorization' }),
          async cancelDispatch() { cleanup.push('dispatch') },
          completeDispatch: async () => 'handled' as const,
          nextDispatch: async () => null,
        },
      },
    },
  })
  try {
    const context = {
      get: () => ({ kind: 'desktop' }),
      inject(_deps: string[], callback: (ctx: unknown) => () => void) {
        const disposeChild = callback(context)
        return Object.assign(Promise.resolve(), {
          async dispose() { disposeChild() },
        })
      },
      remote: {
        tocktutorDesktop: Object.freeze({}),
        async $mount() { return async () => { cleanup.push('remote') } },
      },
      slots: {
        inject(_slot: string, register: () => () => void) {
          const registration = register()
          return () => { cleanup.push('slot'); registration() }
        },
        register() {
          return () => { cleanup.push('registration'); throw new Error('slot failed') }
        },
      },
    }
    const dispose = await apply(context as never)
    await assert.rejects(dispose(), /slot failed/u)
    assert.deepEqual(cleanup, ['slot', 'registration', 'dispatch', 'remote'])
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
  }
})

test('still disposes the Remote when dispatch cancellation fails', async () => {
  const cleanup: string[] = []
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      dshDesktop: {
        tockTutor: {
          authorize: async () => ({ authorization: 'authorization' }),
          async cancelDispatch() { cleanup.push('dispatch'); throw new Error('cancel failed') },
          completeDispatch: async () => 'handled' as const,
          nextDispatch: async () => null,
        },
      },
    },
  })
  try {
    const context = {
      get: () => ({ kind: 'desktop' }),
      inject(_deps: string[], callback: (ctx: unknown) => () => void) {
        const disposeChild = callback(context)
        return Object.assign(Promise.resolve(), {
          async dispose() { disposeChild() },
        })
      },
      remote: {
        async $mount() { return async () => { cleanup.push('remote') } },
      },
      slots: {
        inject(_slot: string, register: () => () => void) {
          const registration = register()
          return () => { cleanup.push('slot'); registration() }
        },
        register() { return () => { cleanup.push('registration') } },
      },
    }
    const dispose = await apply(context as never)
    await assert.rejects(dispose(), /cancel failed/u)
    assert.deepEqual(cleanup, ['slot', 'registration', 'dispatch', 'remote'])
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
  }
})

test('mounts one lifecycle-owned Remote and Native Actions slot contribution', async () => {
  const calls: Array<{ method: string; value?: unknown }> = []
  const bridge = {
    authorize: async () => ({ authorization: 'authorization' }),
    async cancelDispatch() { calls.push({ method: 'cancelDispatch' }) },
    completeDispatch: async () => 'handled' as const,
    nextDispatch: async () => null,
  }
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dshDesktop: { tockTutor: bridge } },
  })
  try {
    const nativeRemote = Object.freeze({ activateVault: async () => ({ ok: true }) })
    const context = {
      get: () => ({ kind: 'desktop' }),
      inject(deps: string[], callback: (ctx: unknown) => () => void) {
        calls.push({ method: 'injectRemote', value: deps })
        const disposeChild = callback(context)
        return Object.assign(Promise.resolve(), {
          async dispose() { disposeChild() },
        })
      },
      remote: {
        tocktutorDesktop: nativeRemote,
        async $mount(value: unknown) {
          calls.push({ method: 'mountRemote', value })
          return async () => { calls.push({ method: 'disposeRemote' }) }
        },
      },
      slots: {
        inject(slot: string, register: () => () => void) {
          calls.push({ method: 'injectSlot', value: slot })
          const disposeRegistration = register()
          return () => {
            calls.push({ method: 'disposeSlot' })
            disposeRegistration()
          }
        },
        register(options: unknown, component: unknown) {
          calls.push({ method: 'registerSlot', value: { component, options } })
          return () => { calls.push({ method: 'disposeRegistration' }) }
        },
      },
    }

    assert.equal(name, 'tockbot-note-desktop')
    assert.deepEqual(inject, ['tockTeamSurface', 'remote', 'slots'])
    const dispose = await apply(context as never)
    const registration = calls.find(call => call.method === 'registerSlot')!.value as {
      component: { name: string }
      options: { id: string; inject: () => unknown; name: string; registrant: string }
    }
    assert.deepEqual(calls.find(call => call.method === 'injectRemote')?.value, [
      'remote',
      'remote.tocktutorDesktop',
      'slots',
    ])
    assert.equal(registration.component.name, 'TockTutorNativeActions')
    assert.equal(registration.options.id, name)
    assert.equal(registration.options.name, slotName)
    assert.equal(registration.options.registrant, name)
    assert.equal(typeof registration.options.inject, 'function')
    assert.deepEqual(registration.options.inject(), {
      bridge,
      remote: { tocktutorDesktop: nativeRemote },
    })

    await dispose()
    assert.deepEqual(calls.slice(-4).map(call => call.method), [
      'disposeSlot',
      'disposeRegistration',
      'cancelDispatch',
      'disposeRemote',
    ])
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
  }
})
