import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerChannel } from '../src/desktop-picker-channel.ts'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'
import { DesktopPickerProvider } from '../src/desktop-picker-provider.ts'
import type { NativeOperationIdentity } from '../src/host-contract.ts'

const identity: NativeOperationIdentity = {
  operationId: 'channel-operation',
  requestId: 'channel-request',
  sessionId: 'channel-session',
  vaultGeneration: 0,
  vaultId: null,
  windowId: 'channel-window',
}

function providerFor(owner: DesktopPickerOwner): { channel: DesktopPickerChannel; provider: DesktopPickerProvider } {
  const channel = new DesktopPickerChannel(owner)
  return { channel, provider: new DesktopPickerProvider({ endpoint: '', token: '' }) }
}

test('picker channel authenticates, forwards opaque sessions, and rejects replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-channel-'))
  await writeFile(join(root, 'note.md'), 'channel note')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: root }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const provider = new DesktopPickerProvider(environment)
  const unauthorized = await fetch(environment.endpoint, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(unauthorized.status, 401)

  const picked = await provider.pick({ identity, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const replay = await provider.pick({ identity, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  assert.deepEqual(replay, { operationId: identity.operationId, status: 'denied' })
  const begun = await provider.beginSource({
    authorization: picked.authorization,
    identity,
    limits: {
      maxDepth: 128,
      maxEntries: 100_000,
      maxEntryBytes: 1024 * 1024,
      maxRelativePathBytes: 4096,
      maxTotalBytes: 1024 * 1024,
    },
    purpose: 'markdown-folder',
  }, new AbortController().signal)
  const listed = await provider.listSource({ limit: 256, session: begun.session }, new AbortController().signal)
  assert.equal(listed.entries.some(entry => entry.kind === 'file'), true)
  await channel.stop()
  await assert.rejects(
    provider.listSource({ limit: 1, session: begun.session }, new AbortController().signal),
  )
})

test('picker provider cancellation fails closed before native dialog publication', async () => {
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: true }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const { channel } = providerFor(owner)
  const environment = await channel.start()
  const provider = new DesktopPickerProvider(environment)
  const controller = new AbortController()
  controller.abort()
  const result = await provider.pick({ identity, kind: 'source', purpose: 'markdown-folder' }, controller.signal)
  assert.deepEqual(result, { operationId: identity.operationId, status: 'cancelled' })
  await channel.stop()
})
