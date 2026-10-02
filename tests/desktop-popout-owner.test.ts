import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DesktopPopOutOwner } from '../src/desktop-popout-owner.ts'

const identity = {
  operationId: 'popout-operation',
  requestId: 'request',
  sessionId: 'session',
  vaultGeneration: 1,
  vaultId: 'vault',
  windowId: 'main-window',
}

function fixture() {
  const open = new Set<string>()
  let opens = 0
  const focused: string[] = []
  const closed: string[] = []
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: {
      close(windowId) { open.delete(windowId); closed.push(windowId) },
      focus(windowId) { focused.push(windowId); return open.has(windowId) },
      isOpen: windowId => open.has(windowId),
      async open(_path, _token, _onClosed) {
        const windowId = `popout-${++opens}`
        open.add(windowId)
        return windowId
      },
    },
  })
  return { closed, focused, owner }
}

test('Electron pop-out route matches Workbench pathname ownership and keeps token main-only', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  assert.equal(main.includes('new URL(`/tocktutor/${encodedPath}`, runtimeUrl)'), true)
  assert.doesNotMatch(main, /searchParams\.set\('note'/)
  assert.doesNotMatch(main, /searchParams\.set\('popout'/)
  assert.match(main, /popOutRouteTokens\.set\(windowId, routeToken\)/)
  assert.match(main, /popOutRouteTokens\.get\(windowId\) === routeToken/)
  assert.match(main, /title: relativePath,[\s\S]{0,200}preload: preloadPath/)
  assert.match(main, /popOutRouteTokens\.delete\(windowId\)/)
})

test('pop-out owner opens, focuses, and closes one bounded relative note route', async () => {
  const { closed, focused, owner } = fixture()
  const opened = await owner.open({ identity, relativePath: 'Notes/Plan.md' }, new AbortController().signal)
  assert.deepEqual(opened, { operationId: identity.operationId, status: 'opened', windowId: 'popout-1' })
  const focusedResult = await owner.open({ identity: { ...identity, operationId: 'focus' }, relativePath: 'Notes/Plan.md' }, new AbortController().signal)
  assert.equal(focusedResult.status, 'focused')
  assert.deepEqual(focused, ['popout-1'])
  assert.equal((await owner.close({ identity: { ...identity, operationId: 'close' }, windowId: 'popout-1' }, new AbortController().signal)).status, 'closed')
  assert.deepEqual(closed, ['popout-1'])
  owner.dispose()
})

test('overlapping opens for the same note share one pop-out window', async () => {
  const started = Promise.withResolvers<void>()
  const loading = Promise.withResolvers<void>()
  const windows = new Set<string>()
  const focused: string[] = []
  let opens = 0
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: {
      close: windowId => { windows.delete(windowId) },
      focus: windowId => { focused.push(windowId); return windows.has(windowId) },
      isOpen: windowId => windows.has(windowId),
      async open() {
        const windowId = `popout-${++opens}`
        if (opens === 1) {
          started.resolve()
          await loading.promise
        }
        windows.add(windowId)
        return windowId
      },
    },
  })
  try {
    const first = owner.open({ identity, relativePath: 'Notes/Plan.md' }, new AbortController().signal)
    await started.promise
    const second = owner.open({ identity: { ...identity, operationId: 'second' }, relativePath: 'Notes/Plan.md' }, new AbortController().signal)
    loading.resolve()
    const results = await Promise.all([first, second])
    assert.deepEqual(results, [
      { operationId: identity.operationId, status: 'opened', windowId: 'popout-1' },
      { operationId: 'second', status: 'focused', windowId: 'popout-1' },
    ])
    assert.equal(opens, 1)
    assert.deepEqual(focused, ['popout-1'])
    assert.deepEqual([...windows], ['popout-1'])
    await owner.close({ identity, windowId: 'popout-1' }, new AbortController().signal)
    assert.deepEqual([...windows], [])
  } finally {
    loading.resolve()
    owner.dispose()
  }
})

for (const interruption of ['cancel', 'dispose', 'vault-change'] as const) {
  test(`waiting same-note pop-out honors ${interruption} without opening another window`, async () => {
    const started = Promise.withResolvers<void>()
    const loading = Promise.withResolvers<void>()
    const windows = new Set<string>()
    let current = true
    let opens = 0
    const owner = new DesktopPopOutOwner({
      isAvailable: () => true,
      isCurrent: () => current,
      native: {
        close: windowId => { windows.delete(windowId) },
        focus: windowId => windows.has(windowId),
        isOpen: windowId => windows.has(windowId),
        async open() {
          const windowId = `popout-${++opens}`
          started.resolve()
          await loading.promise
          windows.add(windowId)
          return windowId
        },
      },
    })
    try {
      const first = owner.open({ identity, relativePath: 'Plan.md' }, new AbortController().signal)
      await started.promise
      const controller = new AbortController()
      const second = owner.open({ identity: { ...identity, operationId: 'second' }, relativePath: 'Plan.md' }, controller.signal)
      let waitingResult: Awaited<typeof second> | undefined
      void second.then(result => { waitingResult = result })
      if (interruption === 'cancel') controller.abort()
      if (interruption === 'dispose') owner.dispose()
      if (interruption === 'vault-change') current = false
      if (interruption !== 'vault-change') {
        await new Promise<void>(resolve => { setImmediate(resolve) })
        assert.deepEqual(waitingResult, { operationId: 'second', status: 'cancelled' })
      }
      loading.resolve()
      const results = await Promise.all([first, second])
      assert.equal(results[1].status, interruption === 'vault-change' ? 'stale' : 'cancelled')
      assert.equal(results[0].status, interruption === 'cancel' ? 'opened' : interruption === 'dispose' ? 'cancelled' : 'stale')
      assert.equal(opens, 1)
      assert.deepEqual([...windows], interruption === 'cancel' ? ['popout-1'] : [])
    } finally {
      loading.resolve()
      owner.dispose()
    }
  })
}

test('failed pop-out loading releases waiting requests and other notes open independently', async () => {
  const started = Promise.withResolvers<void>()
  const loading = Promise.withResolvers<void>()
  const windows = new Set<string>()
  let attempts = 0
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: {
      close: windowId => { windows.delete(windowId) },
      focus: windowId => windows.has(windowId),
      isOpen: windowId => windows.has(windowId),
      async open(relativePath) {
        if (++attempts === 1) {
          started.resolve()
          await loading.promise
          throw new Error('window load failed')
        }
        windows.add(relativePath)
        return relativePath
      },
    },
  })
  try {
    const first = owner.open({ identity, relativePath: 'Plan.md' }, new AbortController().signal)
    await started.promise
    const second = owner.open({ identity: { ...identity, operationId: 'second' }, relativePath: 'Plan.md' }, new AbortController().signal)
    assert.equal((await owner.open({ identity: { ...identity, operationId: 'other' }, relativePath: 'Other.md' }, new AbortController().signal)).status, 'opened')
    loading.resolve()
    assert.equal((await first).status, 'unavailable')
    assert.deepEqual(await second, { operationId: 'second', status: 'opened', windowId: 'Plan.md' })
    assert.deepEqual([...windows].sort(), ['Other.md', 'Plan.md'])
  } finally {
    loading.resolve()
    owner.dispose()
  }
})

test('same-path pop-out never focuses a window from an older vault boundary', async () => {
  let active = { generation: 1, id: 'vault' }
  let opens = 0
  let focuses = 0
  const windows = new Set<string>()
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: candidate => candidate.vaultId === active.id && candidate.vaultGeneration === active.generation,
    native: {
      close: windowId => { windows.delete(windowId) },
      focus: windowId => { focuses += 1; return windows.has(windowId) },
      isOpen: windowId => windows.has(windowId),
      open: async () => { const windowId = `popout-${++opens}`; windows.add(windowId); return windowId },
    },
  })
  assert.equal((await owner.open({ identity, relativePath: 'same.md' }, new AbortController().signal)).status, 'opened')
  active = { generation: 2, id: 'vault-b' }
  assert.equal((await owner.open({ identity: { ...identity, operationId: 'new-vault', vaultGeneration: 2, vaultId: 'vault-b' }, relativePath: 'same.md' }, new AbortController().signal)).status, 'opened')
  assert.equal(opens, 2)
  assert.equal(focuses, 0)
  assert.deepEqual([...windows], ['popout-2'])
  owner.dispose()
})

test('pop-out owner rejects traversal, stale identity, and foreign window ids', async () => {
  let current = false
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: () => current,
    native: { close() {}, focus: () => false, isOpen: () => false, open: async () => 'never' },
  })
  assert.equal((await owner.open({ identity, relativePath: '../secret.md' }, new AbortController().signal)).status, 'denied')
  assert.equal((await owner.open({ identity, relativePath: 'Plan.md' }, new AbortController().signal)).status, 'stale')
  current = true
  assert.equal((await owner.close({ identity, windowId: 'foreign' }, new AbortController().signal)).status, 'denied')
  owner.dispose()
})

test('pop-out owner disposal closes every owned window', async () => {
  const { closed, owner } = fixture()
  await owner.open({ identity, relativePath: 'A.md' }, new AbortController().signal)
  await owner.open({ identity: { ...identity, operationId: 'b' }, relativePath: 'B.md' }, new AbortController().signal)
  owner.dispose()
  assert.deepEqual(closed.sort(), ['popout-1', 'popout-2'])
})
