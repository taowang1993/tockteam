import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopPopOutChannel } from '../src/desktop-popout-channel.ts'
import { DesktopPopOutOwner } from '../src/desktop-popout-owner.ts'
import { DesktopPopOutProvider } from '../src/desktop-popout-provider.ts'

const identity = {
  operationId: 'popout-channel',
  requestId: 'request',
  sessionId: 'session',
  vaultGeneration: 1,
  vaultId: 'vault',
  windowId: 'main',
}

test('pop-out channel authenticates and provider forwards only current vault routes', async () => {
  const windows = new Set<string>()
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: {
      close: id => { windows.delete(id) },
      focus: id => windows.has(id),
      isOpen: id => windows.has(id),
      open: async () => { windows.add('popout'); return 'popout' },
    },
  })
  const channel = new DesktopPopOutChannel(owner)
  const environment = await channel.start()
  const unauthorized = await fetch(environment.endpoint, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
    body: JSON.stringify({ method: 'open', request: { identity, relativePath: 'Plan.md' } }),
  })
  assert.equal(unauthorized.status, 401)
  const provider = new DesktopPopOutProvider(environment, fetch, () => ({ active: true, generation: 1, id: 'vault' }))
  assert.equal((await provider.open({ identity, relativePath: 'Plan.md' }, new AbortController().signal)).status, 'opened')
  assert.equal((await provider.closeAll({ identity: { ...identity, operationId: 'close' } }, new AbortController().signal)).status, 'closed')
  await provider.dispose()
  await channel.stop()
})

test('pop-out provider unload drains a gated open reply and closes the owned window', async () => {
  const openWindows = new Set<string>()
  const closed: string[] = []
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: {
      close(windowId) { closed.push(windowId); openWindows.delete(windowId) },
      focus: () => true,
      isOpen: windowId => openWindows.has(windowId),
      async open() { openWindows.add('popout-1'); return 'popout-1' },
    },
  })
  let opened!: () => void
  const nativeOpened = new Promise<void>(resolve => { opened = resolve })
  let releaseReply!: () => void
  const replyBlocked = new Promise<void>(resolve => { releaseReply = resolve })
  const originalOpen = owner.open.bind(owner)
  owner.open = (async (request, signal) => {
    const result = await originalOpen(request, signal)
    opened()
    await replyBlocked
    return result
  }) as typeof owner.open
  const channel = new DesktopPopOutChannel(owner)
  const provider = new DesktopPopOutProvider(await channel.start(), fetch, () => ({ active: true, generation: 1, id: 'vault' }))
  const opening = provider.open({ identity, relativePath: 'notes/secret.md' }, new AbortController().signal)
  await nativeOpened
  let disposeSettled = false
  const disposing = provider.dispose().then(() => { disposeSettled = true })
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.equal(disposeSettled, false)
  releaseReply()
  assert.equal((await opening).status, 'opened')
  await disposing
  assert.deepEqual([...openWindows], [])
  assert.deepEqual(closed, ['popout-1'])
  assert.equal((await provider.open({ identity: { ...identity, operationId: 'after' }, relativePath: 'after.md' }, new AbortController().signal)).status, 'unavailable')
  await channel.stop()
  assert.deepEqual(closed, ['popout-1'])
})
