import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopPrintExportOwner } from '../src/desktop-print-export-owner.ts'
import { buildMarkdownExportDocument } from '../plugins/tocktutor/packages/tockteam-tocktutor-workbench/dist/rich-markdown.js'
import type { TockTeamDesktopPickerService } from '../src/host-contract.ts'

const identity = {
  operationId: 'print-operation',
  requestId: 'request',
  sessionId: 'session',
  vaultGeneration: 1,
  vaultId: 'vault',
  windowId: 'window',
}

function picker() {
  const calls: string[] = []
  const value = {
    async lockDestinationPlan() { calls.push('lock'); return { authorization: 'plan' as never, expectedState: { status: 'absent' as const }, expiresAt: Date.now() + 1000 } },
    async beginDestination() { calls.push('begin'); return { expectedState: { status: 'absent' as const }, expiresAt: Date.now() + 1000, session: 'session' as never } },
    async writeDestinationChunk(request: { bytes: Uint8Array; offset: number }) { calls.push('write'); return { acceptedBytes: request.bytes.length, nextOffset: request.offset + request.bytes.length } },
    async finalizeDestination(request: { planDigest: string }) { calls.push('finalize'); return { bytes: 1, cleanup: { status: 'complete' as const }, entries: 1, label: 'export.html' as never, planDigest: request.planDigest as never, status: 'published' as const } },
    async abortDestination() { calls.push('abort'); return { cleanup: { status: 'complete' as const }, stagedBytes: 0, stagedEntries: 0, status: 'aborted' as const } },
    async revokeDestinationPlan() { calls.push('revoke'); return { status: 'revoked' as const } },
  } as unknown as TockTeamDesktopPickerService
  return { calls, value }
}

test('print/export owner rejects unsafe or oversized resources before native effects', async () => {
  let native = false
  const fixture = picker()
  const owner = new DesktopPrintExportOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: { print: async () => { native = true; return true }, renderPdf: async () => { native = true; return new Uint8Array() } },
    picker: fixture.value,
  })
  assert.equal((await owner.render({ format: 'print', html: '<script>alert(1)</script>', identity, title: 'Unsafe' }, new AbortController().signal)).status, 'denied')
  assert.equal((await owner.render({ format: 'print', html: '<svg/onload=alert(1)>', identity, title: 'Unsafe' }, new AbortController().signal)).status, 'denied')
  assert.equal((await owner.render({ format: 'print', html: '<img src="https://example.com/x.png">', identity, title: 'Unsafe' }, new AbortController().signal)).status, 'denied')
  assert.equal((await owner.render({ format: 'print', html: '<img src=https://example.com/x.png>', identity, title: 'Unsafe' }, new AbortController().signal)).status, 'denied')
  assert.equal((await owner.render({
    authorization: 'selection',
    format: 'bogus',
    html: '<p>Unsafe format</p>',
    identity,
    purpose: 'export-pdf',
    title: 'Unsafe',
  } as never, new AbortController().signal)).status, 'denied')
  assert.equal(native, false)
  assert.deepEqual(fixture.calls, [])
})

test('print owner invokes bounded native print without destination authority', async () => {
  const fixture = picker()
  const owner = new DesktopPrintExportOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: { print: async html => html === '<p>Print</p>', renderPdf: async () => new Uint8Array() },
    picker: fixture.value,
  })
  assert.deepEqual(await owner.render({ format: 'print', html: '<p>Print</p>', identity, title: 'Print' }, new AbortController().signal), {
    operationId: identity.operationId,
    status: 'printed',
  })
  assert.deepEqual(fixture.calls, [])
})

test('accepts the sanitized static Markdown export contract without network resources', async () => {
  const fixture = picker()
  let printed = ''
  const owner = new DesktopPrintExportOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: { print: async html => { printed = html; return true }, renderPdf: async () => new Uint8Array() },
    picker: fixture.value,
  })
  const html = buildMarkdownExportDocument({
    embeds: [{ content: 'AQID', mimeType: 'image/png', target: { display: null, fragment: null, kind: 'media', path: 'image.png', source: '![[image.png]]' } }],
    markdown: '[External](https://example.com)\n\n![Remote](https://example.com/image.png)',
    title: 'Safe Export',
  })
  assert.equal((await owner.render({ format: 'print', html, identity, title: 'Safe Export' }, new AbortController().signal)).status, 'printed')
  assert.doesNotMatch(printed, /https?:/u)
  assert.match(printed, /data:image\/png;base64,AQID/u)
})

test('HTML export binds exact picker plan and writes reviewed bytes', async () => {
  const fixture = picker()
  const owner = new DesktopPrintExportOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: { print: async () => true, renderPdf: async () => new Uint8Array() },
    picker: fixture.value,
  })
  const result = await owner.render({
    authorization: 'selection' as never,
    format: 'html',
    html: '<p>Export</p>',
    identity,
    purpose: 'export-html',
    title: 'Export',
  }, new AbortController().signal)
  assert.equal(result.status, 'exported')
  assert.deepEqual(fixture.calls, ['lock', 'begin', 'write', 'finalize'])
})
