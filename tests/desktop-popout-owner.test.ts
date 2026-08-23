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
