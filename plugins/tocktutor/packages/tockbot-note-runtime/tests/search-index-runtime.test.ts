import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, readFile, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { type TestContext } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime from '../src/index.ts'
import type { SearchIndexProcess, SearchIndexProcessOptions } from '../src/search-index-process.ts'
import { searchIndexOwnershipFailure } from '../src/search-index-ownership.ts'

type Index = Pick<SearchIndexProcess, 'search' | 'invalidate' | 'close'>
function factory(t: TestContext, create: (options: SearchIndexProcessOptions) => Index) {
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(options: SearchIndexProcessOptions): Index }, 'createSearchIndex', create)
}
const idle = (): Index => ({ search: async () => null, invalidate() {}, close: async () => {} })
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
async function replacement(runtime: NoteVaultRuntime) { await Reflect.get(runtime, 'searchIndexReplacement') }
async function mount(root: string | null, state: string) {
  const context = new Context()
  await context.plugin(NoteVaultRuntime, { ...NoteVaultRuntime.Config(), vaultRoot: root, stateRoot: state })
  await replacement(context.noteVault)
  return context
}

test('latest-only replacement waits for retirement and disposal prevents pending construction', async t => {
  const root = await mkdtemp(join(tmpdir(), 'index-runtime-latest-'))
  const a = join(root, 'a'), b = join(root, 'b')
  await mkdir(a); await mkdir(b)
  const held = Promise.withResolvers<void>()
  let constructions = 0, closes = 0
  factory(t, () => { constructions++; return { ...idle(), close: () => { closes++; return held.promise } } })
  const context = await mount(a, join(root, 'state'))
  try {
    const runtime = context.noteVault
    runtime.activate(b, runtime.state.generation)
    runtime.activate(a, runtime.state.generation)
    assert.equal(closes, 1)
    await tick()
    assert.equal(constructions, 1)
    held.resolve(); await replacement(runtime)
    assert.equal(constructions, 2, 'intermediate B must not construct')
    const next = Promise.withResolvers<void>()
    const current = Reflect.get(runtime, 'searchIndex').index as Index
    t.mock.method(current, 'close', () => next.promise)
    runtime.activate(b, runtime.state.generation)
    const disposal = context.fiber.dispose()
    try {
      await tick()
      assert.equal(constructions, 2)
    } finally { next.resolve(); await disposal }
    assert.equal(constructions, 2, 'disposal must cancel the pending B generation')
  } finally { held.resolve(); await context.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

test('a sibling retirement cannot enter the gap between admission and construction', async t => {
  const root = await mkdtemp(join(tmpdir(), 'index-runtime-siblings-'))
  const a = join(root, 'a'), b = join(root, 'b'); await mkdir(a); await mkdir(b)
  const held = Promise.withResolvers<void>()
  let constructions = 0
  factory(t, () => { constructions++; return { ...idle(), close: () => held.promise } })
  const first = await mount(null, join(root, 'first-state'))
  const second = await mount(b, join(root, 'second-state'))
  try {
    first.noteVault.activate(a, first.noteVault.state.generation)
    second.noteVault.activate(a, second.noteVault.state.generation)
    await tick()
    assert.equal(constructions, 1, 'the sibling retirement must fence the already-queued admission')
    held.resolve()
    await replacement(first.noteVault); await replacement(second.noteVault)
    assert.equal(constructions, 3)
  } finally { held.resolve(); await first.fiber.dispose(); await second.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

test('verified native failure stays on exact scanning until a legitimate invalidation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'index-runtime-failure-'))
  const vault = join(root, 'vault'); await mkdir(vault)
  const options: SearchIndexProcessOptions[] = []
  factory(t, value => { options.push(value); return idle() })
  const context = await mount(vault, join(root, 'state'))
  try {
    const runtime = context.noteVault
    options[0]!.failed!(new Error('fixture native failure'))
    await tick()
    assert.equal(options.length, 1, 'failure must not schedule automatic retries')
    assert.equal(searchIndexOwnershipFailure(), null)
    const state = runtime.state
    if (!state.active) assert.fail('active vault required')
    await runtime.createDocument({ path: 'Alpha.md', content: '#alpha', expectedVault: { id: state.id, generation: state.generation } }, new AbortController().signal)
    await replacement(runtime)
    assert.equal(options.length, 2)
  } finally { await context.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

test('Host inventory and bounded reads report real filesystem completion, not waiting', async t => {
  const root = await mkdtemp(join(tmpdir(), 'index-runtime-progress-'))
  const vault = join(root, 'vault'); await mkdir(vault)
  const note = join(vault, 'Alpha.md'); await writeFile(note, '#alpha')
  let options: SearchIndexProcessOptions | undefined
  factory(t, value => { options = value; return idle() })
  const context = await mount(vault, join(root, 'state'))
  const held = Promise.withResolvers<void>(), reached = Promise.withResolvers<void>()
  try {
    let steps = 0
    const signal = new AbortController().signal
    assert.equal((await options!.list(signal, () => { steps++ }))?.length, 1)
    assert.ok(steps >= 4)
    const handle = await open(note, 'r'), prototype = Object.getPrototypeOf(handle)
    const read = prototype.read
    await handle.close()
    t.mock.method(prototype, 'read', async function (this: object, ...args: unknown[]) {
      const result = await Reflect.apply(read, this, args)
      reached.resolve(); await held.promise
      return result
    })
    const reading = options!.read('Alpha.md', signal, () => { steps++ })
    await reached.promise
    const before = steps
    await tick()
    assert.equal(steps, before)
    held.resolve()
    assert.equal((await reading)?.content, '#alpha')
    assert.ok(steps >= before + 7, 'reads, final file checks and close must each report completion')
  } finally { held.resolve(); await context.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

test('documents deleted after inventory are absent candidates, not index failures', async t => {
  const root = await mkdtemp(join(tmpdir(), 'index-runtime-deleted-'))
  const vault = join(root, 'vault'); await mkdir(join(vault, 'folder'), { recursive: true })
  await writeFile(join(vault, 'Alpha.md'), '#alpha')
  await writeFile(join(vault, 'folder', 'Beta.md'), '#beta')
  let options: SearchIndexProcessOptions | undefined
  factory(t, value => { options = value; return idle() })
  const context = await mount(vault, join(root, 'state'))
  try {
    const controller = new AbortController()
    assert.equal((await options!.list(controller.signal, () => {}))?.length, 2)
    await rm(join(vault, 'Alpha.md'))
    await rm(join(vault, 'folder'), { recursive: true })
    for (const path of ['Alpha.md', 'folder/Beta.md']) {
      assert.equal(await options!.read(path, controller.signal, () => {}), null)
    }
    controller.abort()
    await assert.rejects(options!.read('Alpha.md', controller.signal, () => {}), { name: 'AbortError' })
  } finally { await context.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

test('an empty directory advances the Host filesystem progress clock', async t => {
  const root = await mkdtemp(join(tmpdir(), 'index-runtime-empty-'))
  const vault = join(root, 'vault'); await mkdir(vault)
  let options: SearchIndexProcessOptions | undefined
  factory(t, value => { options = value; return idle() })
  const context = await mount(vault, join(root, 'state'))
  try {
    let steps = 0
    assert.deepEqual(await options!.list(new AbortController().signal, () => { steps++ }), [])
    assert.ok(steps >= 6, 'directory inspection, open, EOF/close and final checks all progress')
  } finally { await context.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

// Last in this isolated test Host: poisoning the process deliberately cannot be undone.
test('uncertain cleanup survives service recreation without skipping unrelated disposal', async t => {
  const root = await mkdtemp(join(tmpdir(), 'index-runtime-quarantine-'))
  const vault = join(root, 'vault'); await mkdir(vault)
  let constructions = 0
  factory(t, () => { constructions++; return { ...idle(), close: async () => { throw new Error('uncertain fixture cleanup') } } })
  const context = await mount(vault, join(root, 'state'))
  const runtime = context.noteVault
  const draft = Promise.withResolvers<void>()
  let draftFinished = false
  const drafts = Reflect.get(runtime, 'draftOperations') as Map<string, Promise<void>>
  drafts.set('fixture', draft.promise.then(() => { draftFinished = true }))
  let second: Context | undefined
  try {
    const disposing = context.fiber.dispose()
    await tick()
    assert.ok(searchIndexOwnershipFailure())
    assert.equal(draftFinished, false)
    draft.resolve(); await disposing
    assert.equal(draftFinished, true)
    assert.ok(Reflect.get(runtime, 'searchIndexFailure'))
    second = await mount(vault, join(root, 'second-state'))
    assert.equal(constructions, 1)
    await assert.rejects(readFile(join(root, 'second-state', 'search-index')), { code: 'ENOENT' })
  } finally { draft.resolve(); await context.fiber.dispose(); await second?.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
