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
  provider.dispose()
  await channel.stop()
})
