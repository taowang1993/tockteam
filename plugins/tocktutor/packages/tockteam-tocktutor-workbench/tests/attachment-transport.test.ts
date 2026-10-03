import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config as RuntimeConfig } from 'tockbot-note-runtime'
import { TockTutorWorkbenchGateway } from '../dist/host-read.js'
import { resolveEmbedGraph } from '../dist/embeds.js'
import { renderMarkdownHtml } from '../dist/rich-markdown.js'

async function withGateway(check: (gateway: TockTutorWorkbenchGateway, runtime: NoteVaultRuntime, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'tocktutor-attachment-transport-'))
  const context = new Context()
  try {
    await context.plugin(NoteVaultRuntime, RuntimeConfig({ vaultRoot: root, stateRoot: null } as never))
    await context.plugin(TockTutorWorkbenchGateway)
    const gateway = context.get('tocktutorWorkbench'), runtime = context.get('noteVault')
    assert.ok(gateway instanceof TockTutorWorkbenchGateway)
    assert.ok(runtime instanceof NoteVaultRuntime)
    await check(gateway, runtime, root)
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

test('stores a valid 5 MiB attachment through the Host transport without losing bytes', async () => {
  await withGateway(async (gateway, runtime, root) => {
    const expectedVault = runtime.state
    assert.ok(expectedVault.active)
    const data = Buffer.alloc(5 * 1024 * 1024, 0x5a)
    const path = 'Attachments/Large.pdf'
    const signal = new AbortController().signal
    const result = await gateway.storeAttachment({ dataBase64: data.toString('base64'), expectedVault, path }, signal)
    assert.equal(result.status, 'stored')
    assert.equal(result.size, data.length)
    assert.equal(result.digest, `sha256:${createHash('sha256').update(data).digest('hex')}`)
    assert.deepEqual(await readFile(join(root, path)), data)
    const preview = await gateway.previewAttachment(path, expectedVault, signal)
    assert.equal(preview.dataBase64, data.toString('base64'))
    assert.equal(preview.digest, result.digest)
  })
})

test('resolves a valid 5 MiB existing attachment through the real Host preview', async () => {
  await withGateway(async (gateway, runtime, root) => {
    const expectedVault = runtime.state
    assert.ok(expectedVault.active)
    const data = Buffer.alloc(5 * 1024 * 1024, 0x5a)
    const path = 'Large.png'
    await writeFile(join(root, path), data)
    const result = await resolveEmbedGraph({
      entries: [{ kind: 'attachment', path }],
      readAttachment: (path, signal) => gateway.previewAttachment(path, expectedVault, signal),
      readDocument: async () => { throw new Error('A media embed does not read a note.') },
      source: `![[${path}]]`,
    })
    assert.equal(result.status, 'ready')
    assert.deepEqual(result.warnings, [])
    assert.equal(result.embeds.length, 1)
    assert.equal(result.embeds[0]?.content, data.toString('base64'))
  })
})

test('renders a valid 5 MiB projected attachment without overflowing validation', () => {
  const path = 'Large.png', source = `![[${path}]]`
  const content = Buffer.alloc(5 * 1024 * 1024, 0x5a).toString('base64')
  const html = renderMarkdownHtml(source, { resolvedEmbeds: [{
    content,
    mimeType: 'image/png',
    target: { display: null, fragment: null, kind: 'media', path, source },
  }] })
  assert.ok(html.includes(`src="data:image/png;base64,${content}"`))
})

test('retains attachment bytes at the 25 MiB limit and with every padding length', async () => {
  await withGateway(async (gateway, runtime, root) => {
    const expectedVault = runtime.state
    assert.ok(expectedVault.active)
    const signal = new AbortController().signal
    for (const size of [0, 1, 2, 3, 25 * 1024 * 1024]) {
      const data = Buffer.alloc(size, 0x5a), path = `Attachments/Size-${size}.pdf`
      const result = await gateway.storeAttachment({ dataBase64: data.toString('base64'), expectedVault, path }, signal)
      assert.equal(result.size, size)
      assert.deepEqual(await readFile(join(root, path)), data)
    }
  })
})

test('rejects malformed, oversized, cancelled and stale attachment requests without writing files', async () => {
  await withGateway(async (gateway, runtime, root) => {
    const expectedVault = runtime.state
    assert.ok(expectedVault.active)
    const signal = new AbortController().signal
    await mkdir(join(root, 'Attachments'))
    const path = 'Attachments/Rejected.pdf'
    for (const dataBase64 of ['A', 'A===', 'AA=A', 'AAAA==', 'AA==\n', '____', 'AA-+', 'AAAA=', `${'AAAA'.repeat(2_000_000)}!===`]) {
      await assert.rejects(gateway.storeAttachment({ dataBase64, expectedVault, path }, signal), { name: 'TypeError', message: 'Attachment data must be bounded base64.' })
    }
    await assert.rejects(gateway.storeAttachment({ dataBase64: 'A'.repeat(35_000_004), expectedVault, path }, signal), /bounded base64/u)
    await assert.rejects(gateway.storeAttachment({ dataBase64: Buffer.alloc(25 * 1024 * 1024 + 1).toString('base64'), expectedVault, path }, signal), /25 MiB/u)
    const cancelled = new AbortController()
    cancelled.abort()
    await assert.rejects(gateway.storeAttachment({ dataBase64: 'AQID', expectedVault, path }, cancelled.signal), { name: 'AbortError' })
    await assert.rejects(gateway.storeAttachment({ dataBase64: 'AQID', expectedVault: { ...expectedVault, generation: expectedVault.generation + 1 }, path }, signal), { code: 'stale-vault' })
    assert.deepEqual(await readdir(join(root, 'Attachments')), [])
  })
})

test('keeps malformed projected media inert and enforces the media byte budget', async () => {
  for (const content of ['A===', 'AA=A', 'AAAA==', 'AQID<script>']) {
    const path = 'Bad.png', source = `![[${path}]]`
    const result = await resolveEmbedGraph({
      entries: [{ kind: 'attachment', path }],
      readAttachment: async () => ({ dataBase64: content, mimeType: 'image/png', path }),
      readDocument: async () => { throw new Error('Media does not read a note.') },
      source,
    })
    assert.equal(result.embeds.length, 0)
    assert.deepEqual(result.warnings, [`Invalid media encoding: ${path}`])
    const html = renderMarkdownHtml(source, { resolvedEmbeds: [{ content, mimeType: 'image/png', target: { display: null, fragment: null, kind: 'media', path, source } }] })
    assert.ok(!html.includes('<img'))
    assert.ok(!html.includes('<script>'))
  }
  const result = await resolveEmbedGraph({
    entries: [{ kind: 'attachment', path: 'Large.png' }],
    maxMediaBytes: 1,
    readAttachment: async () => ({ dataBase64: Buffer.alloc(5 * 1024 * 1024).toString('base64'), mimeType: 'image/png', path: 'Large.png' }),
    readDocument: async () => { throw new Error('Media does not read a note.') },
    source: '![[Large.png]]',
  })
  assert.equal(result.embeds.length, 0)
  assert.equal(result.truncated, true)
  assert.deepEqual(result.warnings, ['Embed media budget reached.'])
})
