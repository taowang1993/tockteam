import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, type VaultReference } from 'tockbot-note-runtime'
import { TockTutorDesktopGateway } from '../dist/host-actions.js'

type Fixture = {
  gateway: TockTutorDesktopGateway
  renders: string[]
  root: string
  runtime: NoteVaultRuntime
  signal: AbortSignal
  vault: VaultReference
}

async function withFixture(config: Partial<Config>, source: string, check: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'native-export-inventory-'))
  const context = new Context()
  const renders: string[] = []
  try {
    await mkdir(join(root, 'A'), { recursive: true })
    await mkdir(join(root, 'Z', 'Nested'), { recursive: true })
    await writeFile(join(root, 'Root.md'), source)
    await writeFile(join(root, 'A', 'Shared.md'), 'First shared note')
    await writeFile(join(root, 'Z', 'Nested', 'Shared.md'), 'Other shared note')
    await context.plugin(NoteVaultRuntime, { ...Config(), ...config, vaultRoot: root, stateRoot: null })
    const runtime = context.noteVault
    const vault = runtime.state
    assert.ok(vault.active)
    await context.plugin({
      name: 'native-export-inventory-owners',
      apply(ctx) {
        ctx.provide('tockTeamDesktopVaultSelection', {
          async adopt(input: { operationId: string }) { return { claim: 'selection-claim', operationId: input.operationId, status: 'bound' } },
          async release() {},
        } as never)
        ctx.provide('tockTeamDesktopCaller', {
          async claim() { return { operationId: 'export-operation', requestId: 'export-request', sessionId: 'export-session', windowId: 'export-window', vaultId: vault.id, vaultGeneration: vault.generation } },
        } as never)
        ctx.provide('tockTeamDesktopPicker', {
          async pick() { return { authorization: 'destination-grant', operationId: 'export-operation', status: 'selected', label: 'Export' } },
        } as never)
        ctx.provide('tockTeamDesktopPrintExport', {
          async render(input: { html: string; format: string }) { renders.push(input.html); return { operationId: 'export-operation', status: input.format === 'print' ? 'printed' : 'exported' } },
        } as never)
        ctx.provide('tockTeamDesktopPopOut', {} as never)
        ctx.provide('tockTeamDesktopMicrophone', {} as never)
      },
    })
    await context.plugin(TockTutorDesktopGateway)
    const gateway = context.get('tocktutorDesktop') as TockTutorDesktopGateway
    assert.ok(gateway instanceof TockTutorDesktopGateway)
    await check({ gateway, renders, root, runtime, signal: new AbortController().signal, vault })
    assert.equal(await readFile(join(root, 'Root.md'), 'utf8'), source)
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

function render(fixture: Fixture, format: 'print' | 'html' | 'pdf') {
  const { gateway, vault, signal } = fixture
  return format === 'print'
    ? gateway.printNote('print-authorization', 'Root.md', vault, signal)
    : gateway.exportNote('export-authorization', format, 'Root.md', vault, signal)
}

for (const truncationReason of ['depth-limit', 'entry-limit'] as const) {
  for (const format of ['print', 'html', 'pdf'] as const) {
    test(`native ${format} refuses a ${truncationReason} embed inventory instead of selecting a false unique basename`, async () => {
      const config = truncationReason === 'depth-limit' ? { maxTreeDepth: 2 } : { maxTreeEntries: 4 }
      await withFixture(config, '# Export\n![[Shared]]\n', async fixture => {
        const page = await fixture.runtime.listTree({ expectedVault: fixture.vault, limit: 500 }, fixture.signal)
        assert.equal(page.complete, false)
        assert.equal(page.cursor, null)
        assert.equal(page.truncationReason, truncationReason)
        assert.ok(page.entries.some(entry => entry.path === 'A/Shared.md'))
        assert.equal(page.entries.some(entry => entry.path === 'Z/Nested/Shared.md'), false)
        await assert.rejects(render(fixture, format), /inventory.*incomplete/iu)
        assert.deepEqual(fixture.renders, [])
      })
    })
  }
}

test('native export drains ordinary tree pages and preserves an exact embed selection', async () => {
  await withFixture({ maxTreeResults: 2 }, '![[A/Shared]]', async fixture => {
    const firstPage = await fixture.runtime.listTree({ expectedVault: fixture.vault, limit: 500 }, fixture.signal)
    assert.equal(firstPage.truncationReason, 'result-limit')
    assert.ok(firstPage.cursor)
    await render(fixture, 'html')
    assert.equal(fixture.renders.length, 1)
    assert.match(fixture.renders[0]!, /First shared note/u)
    assert.doesNotMatch(fixture.renders[0]!, /Other shared note/u)
  })
})

test('a complete paginated inventory keeps ambiguous embedded basenames unresolved', async () => {
  await withFixture({ maxTreeResults: 2 }, '![[Shared]]', async fixture => {
    await render(fixture, 'pdf')
    assert.equal(fixture.renders.length, 1)
    assert.doesNotMatch(fixture.renders[0]!, /First shared note|Other shared note/u)
  })
})

test('native print keeps its inventory page limit', async () => {
  await withFixture({ maxTreeResults: 1 }, '![[A/Shared]]', async fixture => {
    for (let index = 0; index < 6; index += 1) await writeFile(join(fixture.root, `Extra${index}.md`), 'Extra')
    await assert.rejects(render(fixture, 'print'), /scan.*complete/iu)
    assert.deepEqual(fixture.renders, [])
  })
})

test('native export refuses inventory warnings before resolving embeds', { skip: process.platform === 'win32' }, async () => {
  await withFixture({}, '![[Shared]]', async fixture => {
    await symlink('Missing.md', join(fixture.root, 'Broken.md'))
    const page = await fixture.runtime.listTree({ expectedVault: fixture.vault, limit: 500 }, fixture.signal)
    assert.equal(page.complete, true)
    assert.ok(page.warnings.length > 0)
    await assert.rejects(render(fixture, 'html'), /inventory.*incomplete/iu)
    assert.deepEqual(fixture.renders, [])
  })
})

test('native print without embeds remains available when the vault inventory is bounded', async () => {
  await withFixture({ maxTreeDepth: 1 }, '# Plain note\n', async fixture => {
    await render(fixture, 'print')
    assert.equal(fixture.renders.length, 1)
    assert.match(fixture.renders[0]!, /Plain note/u)
  })
})
