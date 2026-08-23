import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopPrintExportChannel } from '../src/desktop-print-export-channel.ts'
import { DesktopPrintExportOwner } from '../src/desktop-print-export-owner.ts'
import { DesktopPrintExportProvider } from '../src/desktop-print-export-provider.ts'

const identity = { operationId: 'print-channel', requestId: 'request', sessionId: 'session', vaultGeneration: 1, vaultId: 'vault', windowId: 'window' }

test('print/export channel authenticates and provider forwards current print only', async () => {
  const owner = new DesktopPrintExportOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: { print: async () => true, renderPdf: async () => new Uint8Array() },
    picker: {} as never,
  })
  const channel = new DesktopPrintExportChannel(owner)
  const environment = await channel.start()
  const unauthorized = await fetch(environment.endpoint, { method: 'POST', headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' }, body: '{}' })
  assert.equal(unauthorized.status, 401)
  const provider = new DesktopPrintExportProvider(environment, fetch, () => ({ active: true, generation: 1, id: 'vault' }))
  assert.equal((await provider.render({ format: 'print', html: '<p>Print</p>', identity, title: 'Print' }, new AbortController().signal)).status, 'printed')
  await provider.dispose()
  await channel.stop()
})

test('print provider unload drains the committed result and retries are exactly once', async () => {
  let effects = 0
  let committed!: () => void
  const nativeCommitted = new Promise<void>(resolve => { committed = resolve })
  let releaseReply!: () => void
  const replyBlocked = new Promise<void>(resolve => { releaseReply = resolve })
  const owner = new DesktopPrintExportOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: { print: async () => { effects += 1; return true }, renderPdf: async () => new Uint8Array() },
    picker: {} as never,
  })
  const originalRender = owner.render.bind(owner)
  owner.render = (async (request, signal) => {
    const result = await originalRender(request, signal)
    committed()
    await replyBlocked
    return result
  }) as typeof owner.render
  const channel = new DesktopPrintExportChannel(owner)
  const provider = new DesktopPrintExportProvider(await channel.start(), fetch, () => ({ active: true, generation: 1, id: 'vault' }))
  const request = { format: 'print' as const, html: '<p>Print once</p>', identity: { ...identity, operationId: 'print-once' }, title: 'Print' }
  const rendering = provider.render(request, new AbortController().signal)
  await nativeCommitted
  let disposeSettled = false
  const disposing = provider.dispose().then(() => { disposeSettled = true })
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.equal(disposeSettled, false)
  releaseReply()
  assert.equal((await rendering).status, 'printed')
  await disposing
  assert.equal((await originalRender(request, new AbortController().signal)).status, 'printed')
  assert.equal(effects, 1)
  await channel.stop()
})
