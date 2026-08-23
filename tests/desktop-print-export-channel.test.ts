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
  provider.dispose()
  await channel.stop()
})
