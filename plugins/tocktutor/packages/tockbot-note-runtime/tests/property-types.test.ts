import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, link, open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { NoteVaultError } from '../src/index.ts'

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'tocktutor-types-'))
  const vault = join(root, 'vault'), stateRoot = join(root, 'state')
  await mkdir(vault)
  const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
  const context = new Context()
  await context.plugin(NoteVaultRuntime, { ...NoteVaultRuntime.Config(), vaultRoot: vault, stateRoot })
  const runtime = context.noteVault
  const state = runtime.state
  if (!state.active) assert.fail('Expected active vault')
  const expectedVault = { id: state.id, generation: state.generation }
  const signal = new AbortController().signal
  t.after(async () => { await context.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  return { root, vault, runtime, expectedVault, signal, file: join(vault, '.obsidian', 'types.json') }
}

const code = (expected: string) => (error: unknown) => error instanceof NoteVaultError && error.code === expected

test('creates only the fixed registry, persists supported assignments and preserves unrelated settings', async t => {
  const f = await fixture(t)
  const missing = await f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal)
  assert.deepEqual(missing, { generation: 1, revision: null, types: {} })
  let result = await f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: null, key: 'custom key', type: 'text' }, f.signal)
  assert.equal(result.types['custom key'], 'text')
  assert.match(result.revision!, /^file:[0-9a-f]{64}$/)
  await writeFile(f.file, '{"theme":{"keep":true},"large":9007199254740993,"precise":0.10000000000000001,"types":{"unknown choice":"future-type","due":"date"}}')
  result = await f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal)
  for (const [key, type] of Object.entries({ 'note.rating': 'number', '123field': 'checkbox', '课程': 'datetime', aliases: 'aliases', tags: 'tags', labels: 'multitext' })) {
    result = await f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: result.revision, key, type: type as never }, f.signal)
  }
  const savedBytes = await readFile(f.file, 'utf8')
  assert.match(savedBytes, /"large":\s*9007199254740993/u)
  assert.match(savedBytes, /"precise":\s*0\.10000000000000001/u)
  const saved = JSON.parse(savedBytes)
  assert.deepEqual(saved.theme, { keep: true })
  assert.equal(saved.types['unknown choice'], 'future-type')
  assert.equal(saved.types.due, 'date')
  assert.equal(saved.types['note.rating'], 'number')
  assert.equal(result.types['unknown choice'], undefined)
  assert.equal(JSON.stringify(result).includes('theme'), false)
})

test('rejects a new key at registry capacity without changing bytes, while existing choices remain editable', async t => {
  const f = await fixture(t)
  await mkdir(join(f.vault, '.obsidian'))
  const types = Object.fromEntries(Array.from({ length: 1_000 }, (_value, index) => [`field ${index}`, 'text']))
  const original = JSON.stringify({ types, keep: true }) + '\n'
  await writeFile(f.file, original)
  const current = await f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal)
  await assert.rejects(f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: current.revision, key: 'one more', type: 'number' }, f.signal), code('too-large'))
  assert.equal(await readFile(f.file, 'utf8'), original)
  assert.deepEqual(await readdir(join(f.vault, '.obsidian')), ['types.json'])
  assert.deepEqual(await f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal), current)
  const updated = await f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: current.revision, key: 'field 0', type: 'number' }, f.signal)
  assert.equal(updated.types['field 0'], 'number')
  assert.equal(Object.keys(updated.types).length, 1_000)
  assert.equal(JSON.parse(await readFile(f.file, 'utf8')).keep, true)
})

test('rejects stale revisions, malformed/duplicate/oversized JSON and unsafe names without changing bytes', async t => {
  const f = await fixture(t)
  await mkdir(join(f.vault, '.obsidian'))
  await writeFile(f.file, '{"types":{"due":"date"},"keep":true}\n')
  const old = await f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal)
  const newer = '{"types":{"due":"text"},"keep":"external"}\n'
  await writeFile(f.file, newer)
  await assert.rejects(f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: old.revision, key: 'due', type: 'number' }, f.signal), code('conflict'))
  assert.equal(await readFile(f.file, 'utf8'), newer)
  for (const raw of ['{', '{"types":[]}', '{"types":{},"keep":1,"keep":2}', '{"types":{"due":"date","d\\u0075e":"text"}}', JSON.stringify({ types: {}, padding: 'x'.repeat(65_536) })]) {
    await writeFile(f.file, raw)
    await assert.rejects(f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal))
    await assert.rejects(f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: null, key: 'due', type: 'date' }, f.signal))
    assert.equal(await readFile(f.file, 'utf8'), raw)
  }
  await writeFile(f.file, '{"types":{}}')
  const current = await f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal)
  for (const key of ['bad:key', 'bad\nname', '../escape', '__proto__', 'constructor', 'prototype']) {
    await assert.rejects(f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: current.revision, key, type: 'date' }, f.signal), code('invalid-content'))
  }
  await assert.rejects(f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: current.revision, key: 'due', type: 'date', path: '../escape.json' } as never, f.signal), code('invalid-content'))
  assert.equal(await readFile(f.file, 'utf8'), '{"types":{}}')
})

test('preserves original bytes on write failure and a precommit race, with no orphaned temporary file', async t => {
  const f = await fixture(t)
  await mkdir(join(f.vault, '.obsidian'))
  const original = '{"types":{"due":"date"},"keep":true}\n'
  await writeFile(f.file, original)
  const current = await f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal)
  const probe = await open(join(f.root, 'probe'), 'w')
  const prototype = Object.getPrototypeOf(probe) as typeof probe
  const write = prototype.writeFile
  await probe.close()
  let failing = true
  const newer = '{"types":{"due":"text"},"keep":"external"}\n'
  t.mock.method(prototype, 'writeFile', async function (this: typeof probe, data: Parameters<typeof write>[0]) {
    if (failing) throw Object.assign(new Error('Injected disk failure'), { code: 'EIO' })
    await writeFile(f.file, newer)
    return write.call(this, data)
  })
  const request = { expectedVault: f.expectedVault, expectedRevision: current.revision, key: 'due', type: 'number' as const }
  await assert.rejects(f.runtime.setObsidianPropertyType(request, f.signal))
  assert.equal(await readFile(f.file, 'utf8'), original)
  failing = false
  await assert.rejects(f.runtime.setObsidianPropertyType(request, f.signal), code('conflict'))
  assert.equal(await readFile(f.file, 'utf8'), newer)
  assert.deepEqual(await readdir(join(f.vault, '.obsidian')), ['types.json'])
})

test('refuses linked targets, old vault generations and cancelled writes', async t => {
  const f = await fixture(t)
  await mkdir(join(f.vault, '.obsidian'))
  const outside = join(f.root, 'outside.json')
  await writeFile(outside, '{"types":{}}')
  for (const create of [() => symlink(outside, f.file), () => link(outside, f.file)]) {
    await create()
    await assert.rejects(f.runtime.getObsidianPropertyRegistry({ expectedVault: f.expectedVault }, f.signal))
    await assert.rejects(f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: null, key: 'due', type: 'date' }, f.signal))
    await rm(f.file)
  }
  await assert.rejects(f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: null, key: 'due', type: 'date' }, AbortSignal.abort()), { name: 'AbortError' })
  const other = join(f.root, 'other'); await mkdir(other)
  f.runtime.activate(other, f.expectedVault.generation)
  await assert.rejects(f.runtime.setObsidianPropertyType({ expectedVault: f.expectedVault, expectedRevision: null, key: 'due', type: 'date' }, f.signal), code('stale-vault'))
  assert.equal(await readFile(outside, 'utf8'), '{"types":{}}')
  await assert.rejects(readFile(f.file), { code: 'ENOENT' })
})
