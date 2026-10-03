import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { type TestContext } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, NoteVaultError } from '../src/index.ts'

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'note-selection-persistence-'))
  const firstRoot = join(root, 'First')
  const secondRoot = join(root, 'Second')
  const stateRoot = join(root, 'state')
  const contexts: Context[] = []
  await mkdir(firstRoot)
  await mkdir(secondRoot)
  await writeFile(join(firstRoot, 'Note.md'), '# First vault\n')
  await writeFile(join(secondRoot, 'Note.md'), '# Second vault\n')
  t.after(async () => {
    for (const context of contexts) await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
  async function start(vaultRoot: string | null = null, overrides: Partial<Config> = {}) {
    const context = new Context()
    contexts.push(context)
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot, restoreActiveVault: true, ...overrides })
    return { context, runtime: context.noteVault }
  }
  return { root, firstRoot, secondRoot, stateRoot, start }
}

for (const unavailable of ['missing', 'file'] as const) {
  test(`a ${unavailable} last-active vault preserves other recent selections through restart`, async t => {
    const f = await fixture(t)
    const first = await f.start(f.firstRoot)
    const initial = first.runtime.state
    assert.ok(initial.active)
    const lastActive = first.runtime.activate(f.secondRoot, initial.generation)
    assert.ok(lastActive.active)
    const other = first.runtime.listRecentVaults().find(record => record.id === initial.id)
    assert.ok(other)
    await first.context.fiber.dispose()
    // Simulate a disconnected or externally moved folder without deleting any notes.
    await rename(f.secondRoot, join(f.root, 'Unavailable'))
    if (unavailable === 'file') await writeFile(f.secondRoot, 'not a vault directory')
    // A valid unified selection takes precedence over retired legacy activation data.
    await writeFile(join(f.stateRoot, 'notes-vault-path'), f.firstRoot + '\n')

    const restarted = await f.start()
    assert.deepEqual(restarted.runtime.state, { active: false, generation: 0 })
    assert.deepEqual(restarted.runtime.listRecentVaults(), [other])
    const selected = restarted.runtime.activateRecentVault(other.id, restarted.runtime.state.generation)
    assert.ok(selected.active)
    assert.equal(selected.id, initial.id)
    assert.equal((await restarted.runtime.openDocument('Note.md', selected, new AbortController().signal)).content, '# First vault\n')
    assert.equal(await readFile(join(f.root, 'Unavailable', 'Note.md'), 'utf8'), '# Second vault\n')
  })
}

test('removing a recent selection with no active vault survives restart and preserves notes', async t => {
  const f = await fixture(t)
  const first = await f.start(f.firstRoot)
  const original = first.runtime.state
  assert.ok(original.active)
  const selected = first.runtime.activate(f.secondRoot, original.generation)
  assert.ok(selected.active)
  const inactive = await first.runtime.removeVault(selected)
  assert.equal(inactive.active, false)
  assert.equal(first.runtime.listRecentVaults().length, 1)
  assert.deepEqual(first.runtime.removeRecentVault(original.id, inactive.generation), [])
  await first.context.fiber.dispose()

  const restarted = await f.start()
  assert.deepEqual(restarted.runtime.state, { active: false, generation: 0 })
  assert.deepEqual(restarted.runtime.listRecentVaults(), [])
  assert.equal(await readFile(join(f.firstRoot, 'Note.md'), 'utf8'), '# First vault\n')
  assert.equal(await readFile(join(f.secondRoot, 'Note.md'), 'utf8'), '# Second vault\n')
})

for (const active of [true, false]) {
  test(`failed recent-selection persistence with active=${active} preserves the list and permits retry`, async t => {
    const f = await fixture(t)
    const first = await f.start(f.firstRoot)
    const original = first.runtime.state
    assert.ok(original.active)
    const selected = first.runtime.activate(f.secondRoot, original.generation)
    assert.ok(selected.active)
    if (!active) await first.runtime.removeVault(selected)
    const beforeState = first.runtime.state
    const before = first.runtime.listRecentVaults()
    const stateDirectory = join(f.stateRoot, 'vault-state')
    const savedDirectory = join(f.stateRoot, 'saved-vault-state')
    const originalSelection = await readFile(join(stateDirectory, 'selection.json'), 'utf8')
    await rename(stateDirectory, savedDirectory)
    await writeFile(stateDirectory, 'blocks selection persistence')
    assert.throws(() => first.runtime.removeRecentVault(original.id, beforeState.generation))
    assert.deepEqual(first.runtime.listRecentVaults(), before)
    assert.deepEqual(first.runtime.state, beforeState)
    assert.equal(await readFile(join(savedDirectory, 'selection.json'), 'utf8'), originalSelection)
    await rm(stateDirectory)
    await rename(savedDirectory, stateDirectory)
    const remaining = before.filter(record => record.id !== original.id)
    assert.deepEqual(first.runtime.removeRecentVault(original.id, beforeState.generation), remaining)
    await first.context.fiber.dispose()
    const restarted = await f.start()
    assert.deepEqual(restarted.runtime.listRecentVaults().map(record => record.id), remaining.map(record => record.id))
    assert.equal(await readFile(join(f.firstRoot, 'Note.md'), 'utf8'), '# First vault\n')
  })
}

test('stale or invalid recent-removal requests leave saved state and the current vault unchanged', async t => {
  const f = await fixture(t)
  const first = await f.start(f.firstRoot)
  const initial = first.runtime.state
  assert.ok(initial.active)
  const selected = first.runtime.activate(f.secondRoot, initial.generation)
  assert.ok(selected.active)
  const before = first.runtime.listRecentVaults()
  const selectionFile = join(f.stateRoot, 'vault-state', 'selection.json')
  const bytes = await readFile(selectionFile, 'utf8')
  assert.throws(() => first.runtime.removeRecentVault(initial.id, initial.generation),
    error => error instanceof NoteVaultError && error.code === 'stale-vault')
  assert.throws(() => first.runtime.removeRecentVault('../First', selected.generation),
    error => error instanceof NoteVaultError && error.code === 'denied')
  assert.deepEqual(first.runtime.listRecentVaults(), before)
  assert.deepEqual(first.runtime.state, selected)
  assert.equal(await readFile(selectionFile, 'utf8'), bytes)
})

test('recent-removal works in memory when persistent storage is disabled', async t => {
  const f = await fixture(t)
  const first = await f.start(f.firstRoot, { stateRoot: null })
  const initial = first.runtime.state
  assert.ok(initial.active)
  const selected = first.runtime.activate(f.secondRoot, initial.generation)
  assert.ok(selected.active)
  const inactive = await first.runtime.removeVault(selected)
  assert.deepEqual(first.runtime.removeRecentVault(initial.id, inactive.generation), [])
  await assert.rejects(readFile(join(f.stateRoot, 'vault-state', 'selection.json')), { code: 'ENOENT' })
})

test('malformed unified selection does not admit its recent records or activate a vault', async t => {
  const f = await fixture(t)
  const first = await f.start(f.firstRoot)
  await first.context.fiber.dispose()
  const selectionFile = join(f.stateRoot, 'vault-state', 'selection.json')
  const selection = JSON.parse(await readFile(selectionFile, 'utf8'))
  await writeFile(selectionFile, JSON.stringify({ ...selection, activeRoot: 42 }))
  const restarted = await f.start()
  assert.deepEqual(restarted.runtime.state, { active: false, generation: 0 })
  assert.deepEqual(restarted.runtime.listRecentVaults(), [])
  assert.equal(await readFile(join(f.firstRoot, 'Note.md'), 'utf8'), '# First vault\n')
})
