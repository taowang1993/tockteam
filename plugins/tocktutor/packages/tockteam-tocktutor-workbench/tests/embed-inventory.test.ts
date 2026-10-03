import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, type VaultReference } from 'tockbot-note-runtime'
import { TockTutorWorkbenchGateway } from '../dist/host-read.js'
import { WorkbenchRouteController, type WorkbenchRouteRemote } from '../dist/route.js'
import { renderMarkdownHtml } from '../dist/rich-markdown.js'
import type { NoteVaultChangeEvent } from '../dist/types.js'

type Fixture = { controller: WorkbenchRouteController; gateway: TockTutorWorkbenchGateway; root: string; runtime: NoteVaultRuntime; vault: VaultReference }

async function withFixture(
  config: Partial<Config>, source: string, check: (fixture: Fixture) => Promise<void>, duplicate = true, brokenAlias = false,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'workbench-embed-inventory-'))
  const context = new Context()
  let controller: WorkbenchRouteController | undefined
  try {
    await mkdir(join(root, 'A'), { recursive: true })
    await mkdir(join(root, 'Z', 'Nested'), { recursive: true })
    await writeFile(join(root, 'Root.md'), source)
    await writeFile(join(root, 'A', 'Shared.md'), 'First shared note')
    if (duplicate) await writeFile(join(root, 'Z', 'Nested', 'Shared.md'), 'Other shared note')
    if (brokenAlias) await symlink('Missing.md', join(root, 'Broken.md'))
    await context.plugin(NoteVaultRuntime, { ...Config(), ...config, vaultRoot: root, stateRoot: null })
    await context.plugin({
      name: 'embed-inventory-desktop-selection',
      apply(ctx) {
        ctx.provide('tockTeamDesktopVaultSelection', {
          async adopt(input: { operationId: string }) { return { claim: 'selection-claim', operationId: input.operationId, status: 'bound' } },
          async release() {},
        } as never)
      },
    })
    await context.plugin(TockTutorWorkbenchGateway)
    const runtime = context.get('noteVault'), gateway = context.get('tocktutorWorkbench')
    assert.ok(runtime instanceof NoteVaultRuntime)
    assert.ok(gateway instanceof TockTutorWorkbenchGateway)
    const vault = runtime.state
    assert.ok(vault.active)
    const remote = {
      $on: (_name: string, listener: (event: NoteVaultChangeEvent) => void) => context.on('note-vault/change', listener),
      tocktutorWorkbench: new Proxy(gateway, {
        get(target, name) {
          const method = Reflect.get(target, name)
          if (typeof method !== 'function') return method
          return async (...args: unknown[]) => {
            try { return { ok: true, value: await Reflect.apply(method, target, args) } }
            catch (error) { return { ok: false, error } }
          }
        },
      }),
    } as unknown as WorkbenchRouteRemote
    controller = new WorkbenchRouteController(remote, () => {})
    await controller.reload()
    assert.equal(controller.getSnapshot().phase, 'ready', controller.getSnapshot().message)
    assert.equal(await controller.select('Root.md'), true)
    await controller.loadEmbeds()
    await check({ controller, gateway, root, runtime, vault })
    assert.equal(await readFile(join(root, 'Root.md'), 'utf8'), source)
  } finally {
    await controller?.dispose()
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

for (const reason of ['depth-limit', 'entry-limit'] as const) {
  test(`incomplete Workbench ${reason} inventory does not treat a short embed name as unique`, async () => {
    await withFixture(reason === 'depth-limit' ? { maxTreeDepth: 2 } : { maxTreeEntries: 4 }, '# Lesson\n\n![[Shared]]\n', async ({ controller, runtime, vault }) => {
      const page = await runtime.listTree({ expectedVault: vault, limit: 200 }, new AbortController().signal)
      assert.equal(page.truncationReason, reason)
      assert.ok(page.entries.some(entry => entry.path === 'A/Shared.md'))
      assert.equal(page.entries.some(entry => entry.path === 'Z/Nested/Shared.md'), false)
      const snapshot = controller.getSnapshot()
      assert.deepEqual(snapshot.embeds, [])
      assert.doesNotMatch(renderMarkdownHtml(snapshot.source!, { resolvedEmbeds: snapshot.embeds }), /First shared note|Other shared note/u)
      assert.ok(snapshot.warnings.some(message => /embed.*file list.*incomplete/iu.test(message)))
    })
  })
}

test('incomplete Workbench inventory retains an explicitly named embed', async () => {
  await withFixture({ maxTreeDepth: 2 }, '![[A/Shared]]', async ({ controller }) => {
    assert.deepEqual(controller.getSnapshot().embeds?.map(embed => [embed.target.path, embed.content]), [['A/Shared.md', 'First shared note']])
  })
})

test('complete paginated Workbench inventory keeps duplicate embed names unresolved', async () => {
  await withFixture({ maxTreeResults: 2 }, '![[Shared]]', async ({ controller }) => {
    assert.ok(controller.getSnapshot().entries.some(entry => entry.path === 'Z/Nested/Shared.md'))
    assert.deepEqual(controller.getSnapshot().embeds, [])
    assert.ok(controller.getSnapshot().warnings.some(message => message === 'Embed not found: Shared.md'))
  })
})

test('complete Workbench inventory still resolves a unique short embed name', async () => {
  await withFixture({}, '![[Shared]]', async ({ controller }) => {
    assert.deepEqual(controller.getSnapshot().embeds?.map(embed => embed.target.path), ['A/Shared.md'])
  }, false)
})

test('Workbench inventory warnings prevent false unique embed names', { skip: process.platform === 'win32' }, async () => {
  await withFixture({}, '![[Shared]]', async ({ controller }) => {
    assert.deepEqual(controller.getSnapshot().embeds, [])
    assert.ok(controller.getSnapshot().warnings.some(message => /embed.*file list.*incomplete/iu.test(message)))
  }, false, true)
})

test('a refreshed Workbench inventory withdraws a previously unique embed when a duplicate appears', async () => {
  await withFixture({}, '![[Shared]]', async ({ controller, runtime, vault }) => {
    assert.deepEqual(controller.getSnapshot().embeds?.map(embed => embed.target.path), ['A/Shared.md'])
    await runtime.createDocument({ content: 'Other shared note', expectedVault: vault, path: 'Z/Nested/Shared.md' }, new AbortController().signal)
    const deadline = Date.now() + 1_000
    while (Date.now() < deadline && (!controller.getSnapshot().entries.some(entry => entry.path === 'Z/Nested/Shared.md') || controller.getSnapshot().embeds?.length)) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.ok(controller.getSnapshot().entries.some(entry => entry.path === 'Z/Nested/Shared.md'))
    assert.deepEqual(controller.getSnapshot().embeds, [])
  }, false)
})

test('an older pending embed read cannot revive content after the inventory becomes ambiguous', async () => {
  await withFixture({}, '![[Shared]]', async ({ controller, gateway, runtime, vault }) => {
    let entered!: () => void, release!: () => void
    const requested = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const original = gateway.openDocument.bind(gateway)
    let held = false
    gateway.openDocument = async (...args) => {
      const result = await original(...args)
      if (!held && args[0] === 'A/Shared.md') { held = true; entered(); await gate }
      return result
    }
    const pending = controller.loadEmbeds()
    try {
      await requested
      await runtime.createDocument({ content: 'Other shared note', expectedVault: vault, path: 'Z/Nested/Shared.md' }, new AbortController().signal)
      const deadline = Date.now() + 1_000
      while (Date.now() < deadline && !controller.getSnapshot().entries.some(entry => entry.path === 'Z/Nested/Shared.md')) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.ok(controller.getSnapshot().entries.some(entry => entry.path === 'Z/Nested/Shared.md'))
      release()
      assert.equal(await pending, false)
      assert.deepEqual(controller.getSnapshot().embeds, [])
    } finally {
      release()
      await pending
      gateway.openDocument = original
    }
  }, false)
})
