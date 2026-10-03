import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import ToolRuntime, { validateJsonSchemaValue, type ToolDefinition, type ToolExecutionInput, type ToolRunContext } from '@deepseek-ai/dsh-tools'
// @ts-expect-error The standalone plugin intentionally publishes no root declarations.
import { apply as applyStandalone } from 'tockbot-note-vault'

async function withTools(check: (tools: Map<string, ToolDefinition>) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'standalone-vault-search-'))
  try {
    const vaultRoot = join(root, 'vault')
    await mkdir(vaultRoot)
    await writeFile(join(vaultRoot, 'Lesson.md'), '---\ntags: [lesson]\nstatus: active\n---\n# Lesson\nA needle in a local note.\n[[Other]]\n')
    await writeFile(join(vaultRoot, 'Other.md'), '# Other\nAnother needle in a second note.\n')
    await writeFile(join(vaultRoot, 'Board.canvas'), JSON.stringify({ nodes: [{ id: 'card', type: 'text', text: 'Board text', x: 0, y: 0, width: 300, height: 200 }], edges: [] }))
    const tools = new Map<string, ToolDefinition>()
    await applyStandalone({ tools: { register(tool: ToolDefinition) { tools.set(tool.name, tool) } } }, {
      root: vaultRoot,
      maxReadBytes: 256 * 1024,
      maxSearchBytes: 1024 * 1024,
      maxSearchEntries: 100,
      maxSearchFileBytes: 256 * 1024,
      maxSearchResults: 20,
    })
    await check(tools)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function withSearch(check: (search: ToolDefinition) => Promise<void>): Promise<void> {
  await withTools(async tools => {
    const search = tools.get('vault_search')
    assert.ok(search)
    await check(search)
  })
}

const execution = (signal = new AbortController().signal) => ({ signal }) as ToolRunContext

for (const mode of ['literal', 'query', 'related'] as const) {
  test(`standalone ${mode} search returns results accepted by the pinned DSH output contract`, async () => {
    await withSearch(async search => {
      const args = { mode, query: 'needle' }
      const result = await search.execute(args, execution())
      assert.deepEqual(validateJsonSchemaValue(search.output.schema, result), [])
      const rendered = JSON.stringify(search.output.render(args, result as never))
      assert.ok(rendered.includes('Lesson.md'))
      assert.ok(rendered.includes('A needle in a local note.'))
      assert.ok(rendered.includes('Other.md'))
    })
  })
}

test('standalone search preserves complete cursor pages and bounded rendering', async () => {
  await withSearch(async search => {
    const paths = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const args = { query: 'needle', limit: 1, ...(cursor === undefined ? {} : { cursor }) }
      const result = await search.execute(args, execution())
      assert.deepEqual(validateJsonSchemaValue(search.output.schema, result), [])
      const page = JSON.parse(JSON.stringify(result)) as { matches: Array<{ path: string }>; cursor: string | null }
      assert.equal(page.matches.length, 1)
      assert.equal(paths.has(page.matches[0]!.path), false)
      paths.add(page.matches[0]!.path)
      assert.ok(JSON.stringify(search.output.render(args, result as never)).includes(page.matches[0]!.path))
      cursor = page.cursor ?? undefined
      if (cursor !== undefined) {
        assert.equal(cursors.has(cursor), false)
        cursors.add(cursor)
        assert.ok(cursors.size < 4)
      }
    } while (cursor !== undefined)
    assert.deepEqual([...paths].sort(), ['Lesson.md', 'Other.md'])
  })
})

test('standalone search preserves empty results and cancellation', async () => {
  await withSearch(async search => {
    const args = { query: 'absent-canary' }
    const result = await search.execute(args, execution())
    assert.deepEqual(validateJsonSchemaValue(search.output.schema, result), [])
    assert.deepEqual(JSON.parse(JSON.stringify(result)).matches, [])
    const cancelled = new AbortController()
    cancelled.abort()
    await assert.rejects(search.execute({ query: 'needle' }, execution(cancelled.signal)), { name: 'AbortError' })
  })
})

test('all eight standalone read tools return results accepted by the pinned DSH output contracts', async () => {
  await withTools(async tools => {
    const cases: Array<[string, Record<string, string | boolean>]> = [
      ['vault_search', { query: 'needle' }],
      ['vault_read', { path: 'Lesson.md' }],
      ['vault_list', { includeStats: true }],
      ['vault_links', { path: 'Lesson.md' }],
      ['vault_outline', { path: 'Lesson.md' }],
      ['vault_graph', { scope: 'global', includeTags: true }],
      ['vault_canvas', { path: 'Board.canvas' }],
      ['vault_facets', {}],
    ]
    for (const [name, args] of cases) {
      const tool = tools.get(name)
      assert.ok(tool)
      const result = await tool.execute(args, execution())
      assert.deepEqual(validateJsonSchemaValue(tool.output.schema, result), [], name)
      assert.ok(tool.output.render(args, result as never).length > 0)
    }
  })
})

test('the pinned DSH tool runtime delivers successful standalone search results to the model', async () => {
  await withTools(async tools => {
    class PromptRegistration extends Service {
      constructor(ctx: Context) { super(ctx, 'systemPrompt') }
      tools() { return this.ctx.effect(() => () => undefined) }
    }
    const context = new Context()
    try {
      await context.plugin(PromptRegistration)
      await context.plugin(ToolRuntime, { mode: 'native' })
      for (const tool of tools.values()) context.tools.register(tool)
      for (const mode of ['literal', 'query', 'related'] as const) {
        const result = await context.tools.execute({
          name: 'vault_search',
          callId: `standalone-${mode}` as ToolExecutionInput['callId'],
          arguments: { mode, query: 'needle' },
          signal: new AbortController().signal,
        })
        assert.equal(result.isError, false, JSON.stringify(result))
        assert.ok(JSON.stringify(result.content).includes('Lesson.md'))
        assert.ok(JSON.stringify(result.content).includes('A needle in a local note.'))
      }
    } finally {
      await context.fiber.dispose()
    }
  })
})
