import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {
  NoteVaultState,
  VaultCanvasArgs,
  VaultFacetsArgs,
  VaultGraphArgs,
  VaultListArgs,
  VaultLinksArgs,
  VaultOutlineArgs,
  VaultReadArgs,
  VaultReference,
  VaultSearchArgs,
  VaultSearchResult,
} from 'tockbot-note-runtime'
import { apply, inject } from '../src/index.ts'

class TestTools extends Service {
  readonly definitions = new Map<string, ToolDefinition>()

  constructor(ctx: Context) {
    super(ctx, 'tools')
  }

  register(definition: ToolDefinition): () => void {
    return this.ctx.effect(() => {
      this.definitions.set(definition.name, definition)
      return () => { this.definitions.delete(definition.name) }
    })
  }
}

class TestNoteVault extends Service {
  state: NoteVaultState = { active: true, generation: 7, id: 'vault:test' }
  readonly canvases: Array<{
    args: VaultCanvasArgs
    expectedVault: VaultReference
    signal: AbortSignal
  }> = []
  readonly facetsCalls: Array<{
    args: VaultFacetsArgs
    expectedVault: VaultReference
    signal: AbortSignal
  }> = []
  readonly graphs: Array<{
    args: VaultGraphArgs
    expectedVault: VaultReference
    signal: AbortSignal
  }> = []
  readonly linksCalls: Array<{
    args: VaultLinksArgs
    expectedVault: VaultReference
    signal: AbortSignal
  }> = []
  readonly lists: Array<{
    args: VaultListArgs
    expectedVault: VaultReference
    signal: AbortSignal
  }> = []
  readonly outlines: Array<{
    args: VaultOutlineArgs
    expectedVault: VaultReference
    signal: AbortSignal
  }> = []
  readonly reads: Array<{
    args: VaultReadArgs
    expectedVault: VaultReference
    signal: AbortSignal
  }> = []
  readonly searches: Array<{
    args: VaultSearchArgs
    expectedVault: VaultReference
    signal: AbortSignal
  }> = []
  error: Error | null = null
  notesSearchResult: (VaultSearchResult & { generation: number }) | null = null
  notesReadContent: string | null = null

  constructor(ctx: Context) {
    super(ctx, 'noteVault')
  }

  async canvas(args: VaultCanvasArgs, expectedVault: VaultReference, signal: AbortSignal) {
    this.canvases.push({ args, expectedVault, signal })
    if (this.error !== null) throw this.error
    return {
      path: args.path,
      items: [{
        kind: 'node' as const,
        id: 'one',
        line: 1,
        type: 'text',
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        text: 'canary',
        file: null,
        url: null,
        label: null,
        color: null,
        fromNode: null,
        toNode: null,
        fromSide: null,
        toSide: null,
        fromEnd: null,
        toEnd: null,
      }],
      cursor: null,
      truncated: false,
      truncationReason: null,
      warnings: [],
      generation: expectedVault.generation,
    }
  }

  async facets(args: VaultFacetsArgs, expectedVault: VaultReference, signal: AbortSignal) {
    this.facetsCalls.push({ args, expectedVault, signal })
    if (this.error !== null) throw this.error
    return {
      tags: [{ tag: 'work', count: 2 }],
      properties: [{ key: 'status', count: 1, types: ['string' as const] }],
      complete: true,
      truncated: false,
      cursor: null,
      scan: { bytes: 12, entries: 1, files: 1 },
      truncationReason: null,
      warnings: [],
      generation: expectedVault.generation,
    }
  }

  async graph(args: VaultGraphArgs, expectedVault: VaultReference, signal: AbortSignal) {
    this.graphs.push({ args, expectedVault, signal })
    if (this.error !== null) throw this.error
    return {
      path: args.path ?? null,
      nodes: [{ path: args.path ?? 'note.md', depth: 0 }],
      edges: [],
      missing: [],
      orphans: [],
      complete: true,
      truncated: false,
      scan: { bytes: 12, entries: 1, files: 1 },
      truncationReason: null,
      warnings: [],
      cursor: null,
      generation: expectedVault.generation,
    }
  }

  async links(args: VaultLinksArgs, expectedVault: VaultReference, signal: AbortSignal) {
    this.linksCalls.push({ args, expectedVault, signal })
    if (this.error !== null) throw this.error
    return {
      path: args.path,
      outgoing: ['target.md'],
      backlinks: [],
      outgoingDetails: [],
      backlinkDetails: [],
      tagRelations: [],
      truncated: false,
      cursor: null,
      scan: { bytes: 12, entries: 1, files: 1 },
      truncationReason: null,
      warnings: [],
      generation: expectedVault.generation,
    }
  }

  async list(args: VaultListArgs, expectedVault: VaultReference, signal: AbortSignal) {
    this.lists.push({ args, expectedVault, signal })
    if (this.error !== null) throw this.error
    return {
      entries: [{
        path: 'note.md',
        type: 'markdown' as const,
        title: 'Note',
        modifiedMs: 2,
        createdMs: 1,
        size: 12,
        tags: ['tag'],
        aliases: [],
        properties: [],
        tasks: { done: 0, todo: 1, total: 1 },
      }],
      truncated: false,
      cursor: null,
      scan: { bytes: 12, entries: 1, files: 1 },
      truncationReason: null,
      warnings: [],
      generation: expectedVault.generation,
    }
  }

  async outline(args: VaultOutlineArgs, expectedVault: VaultReference, signal: AbortSignal) {
    this.outlines.push({ args, expectedVault, signal })
    if (this.error !== null) throw this.error
    return {
      path: args.path,
      headings: [{ level: 1, line: 1, selector: 'Title', text: 'Title' }],
      truncated: false,
      footnotes: [{ ordinal: 1, kind: 'inline' as const, content: 'note', line: 2 }],
      footnotesTruncated: false,
      queries: [{ ordinal: 1, query: 'tag:#work', line: 3, lineEnd: 5, fence: 'query' }],
      queriesTruncated: false,
      generation: expectedVault.generation,
    }
  }

  async read(args: VaultReadArgs, expectedVault: VaultReference, signal: AbortSignal) {
    this.reads.push({ args, expectedVault, signal })
    if (this.error !== null) throw this.error
    return {
      path: args.path,
      content: this.notesReadContent ?? `content:${args.path}`,
      generation: expectedVault.generation,
    }
  }

  async search(args: VaultSearchArgs, expectedVault: VaultReference, signal: AbortSignal) {
    this.searches.push({ args, expectedVault, signal })
    if (this.error !== null) throw this.error
    return this.notesSearchResult ?? {
      query: args.query,
      matches: [],
      truncated: false,
      cursor: null,
      scan: { bytes: 12, entries: 3, files: 2 },
      truncationReason: null,
      warnings: [],
      generation: expectedVault.generation,
    }
  }
}

async function load() {
  const context = new Context()
  await context.plugin(TestTools)
  const runtimeFiber = await context.plugin(TestNoteVault)
  const adapterFiber = await context.plugin({ apply, inject })
  const tools = context.get('tools') as unknown as TestTools
  const noteVault = context.get('noteVault') as unknown as TestNoteVault
  return { adapterFiber, context, noteVault, runtimeFiber, tools }
}

function execution(signal: AbortSignal): ToolRunContext {
  return { signal } as ToolRunContext
}

test('vault_read preserves its contract and delegates through the active runtime generation', async () => {
  const loaded = await load()
  try {
    const tool = loaded.tools.definitions.get('vault_read')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Markdown, Canvas, or Base path relative to the vault root.' },
        heading: { type: 'string', description: 'Optional Markdown heading to read with its child content.' },
        blockId: { type: 'string', description: 'Optional Markdown block ID without the leading caret.' },
        footnote: { type: 'string', description: 'Optional Markdown footnote label without brackets.' },
        inlineFootnote: { type: 'integer', description: 'Optional source-order inline footnote ordinal.' },
      },
      required: ['path'],
    })
    assert.deepEqual(tool.output.schema, {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    })

    const signal = new AbortController().signal
    for (const args of [
      { path: 'note.md' },
      { path: 'note.md', heading: 'Decisions' },
      { path: 'note.md', blockId: 'canary' },
      { path: 'note.md', footnote: '1' },
      { path: 'note.md', inlineFootnote: 2 },
      { path: 'board.canvas' },
      { path: 'query.base' },
    ] satisfies VaultReadArgs[]) {
      assert.deepEqual(
        await tool.execute(args, execution(signal)),
        { path: args.path, content: `content:${args.path}` },
      )
    }
    assert.equal(loaded.noteVault.reads.length, 7)
    for (const call of loaded.noteVault.reads) {
      assert.deepEqual(call.expectedVault, { generation: 7, id: 'vault:test' })
      assert.equal(call.signal, signal)
    }
    assert.deepEqual(
      tool.output.render({}, { path: 'note.md', content: 'rendered' }),
      [{ type: 'text', text: 'rendered' }],
    )

    const selectorError = new Error('choose at most one selector')
    loaded.noteVault.error = selectorError
    await assert.rejects(
      tool.execute({ path: 'note.md', heading: 'A', blockId: 'b' }, execution(signal)),
      error => error === selectorError,
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('vault_search preserves its schema, result, rendering, and runtime call', async () => {
  const loaded = await load()
  try {
    const tool = loaded.tools.definitions.get('vault_search')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Case-insensitive text to find.' },
        mode: {
          type: 'string',
          enum: ['literal', 'query', 'related'],
          description: 'Search mode. Defaults to backward-compatible literal matching.',
        },
        scope: {
          type: 'string',
          enum: ['all', 'content', 'path', 'properties'],
          description: 'Where literal mode searches. Defaults to all.',
        },
        caseSensitive: { type: 'boolean', description: 'Match query case exactly in query mode.' },
        wholeWord: { type: 'boolean', description: 'Match whole words in query mode.' },
        regex: { type: 'boolean', description: 'Treat query terms as regular expressions in query mode.' },
        directory: { type: 'string', description: 'Optional vault-relative directory for query mode.' },
        limit: { type: 'integer', description: 'Maximum matches, capped at 50.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching search.' },
      },
      required: ['query'],
    })
    assert.deepEqual(tool.output.schema, {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        matches: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string' },
              kind: { type: 'string', enum: ['base', 'block', 'canvas', 'content', 'line', 'path', 'property', 'section', 'tag', 'task'] },
              line: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
              preview: { type: 'string' },
              lineEnd: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
              score: { type: 'number' },
              operator: {
                type: 'string',
                enum: ['any', 'block', 'content', 'file', 'line', 'path', 'property', 'related', 'section', 'tag', 'task', 'task-done', 'task-todo'],
              },
              provenance: {
                type: 'string',
                enum: ['body', 'canvas', 'frontmatter', 'path', 'section', 'task'],
              },
            },
            required: ['path', 'kind', 'line', 'preview'],
          },
        },
        truncated: { type: 'boolean' },
        cursor: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        scan: {
          type: 'object',
          additionalProperties: false,
          properties: {
            bytes: { type: 'integer' },
            entries: { type: 'integer' },
            files: { type: 'integer' },
          },
          required: ['bytes', 'entries', 'files'],
        },
        truncationReason: {
          oneOf: [
            { type: 'string', enum: ['byte-limit', 'entry-limit', 'file-limit', 'metadata-limit', 'result-limit'] },
            { type: 'null' },
          ],
        },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['query', 'matches', 'truncated', 'cursor', 'scan', 'truncationReason', 'warnings'],
    })

    const args: VaultSearchArgs = {
      query: 'status:active',
      mode: 'query',
      scope: 'properties',
      caseSensitive: true,
      wholeWord: true,
      regex: false,
      directory: 'projects',
      limit: 4,
      cursor: 'opaque',
    }
    const signal = new AbortController().signal
    const result = await tool.execute(args, execution(signal))
    assert.deepEqual(result, {
      query: args.query,
      matches: [],
      truncated: false,
      cursor: null,
      scan: { bytes: 12, entries: 3, files: 2 },
      truncationReason: null,
      warnings: [],
    })
    assert.deepEqual(loaded.noteVault.searches, [{
      args,
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    }])
    assert.deepEqual(
      tool.output.render(args, result as never),
      [{ type: 'text', text: JSON.stringify(result, undefined, 2) }],
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('notes_search adapts the active generation into TockDriver citations without exposing source details', async () => {
  const loaded = await load()
  try {
    loaded.noteVault.notesSearchResult = {
      query: 'launch',
      matches: [
        {
          path: 'Notes/Launch.md',
          kind: 'content',
          line: 3,
          preview: 'Bearer private /Users/max/secret launch plan',
        },
        {
          path: 'Notes/Launch.md',
          kind: 'path',
          line: null,
          preview: 'Launch',
        },
      ],
      truncated: true,
      cursor: null,
      scan: { bytes: 64, entries: 2, files: 2 },
      truncationReason: 'file-limit',
      warnings: ['Notes/Huge.md: exceeds the per-file scan limit'],
      generation: 7,
    }
    const tool = loaded.tools.definitions.get('notes_search')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      vaultId: { type: 'string', description: 'Opaque id of the active Notes vault.', required: true },
      query: { type: 'string', description: 'Text or terms to search.', required: true },
      mode: {
        type: 'string',
        enum: ['keyword', 'semantic'],
        description: 'Keyword matching by default, or bounded local related matching.',
      },
      limit: { type: 'integer', description: 'Maximum citations, capped at 25.' },
    })
    const signal = new AbortController().signal
    const result = await tool.execute({
      vaultId: 'vault:test',
      query: 'launch',
      mode: 'semantic',
      limit: 4,
    }, execution(signal))
    assert.deepEqual(result, {
      vaultId: 'vault:test',
      query: 'launch',
      mode: 'semantic',
      citations: [{
        path: 'Notes/Launch.md',
        title: 'Launch',
        line: 3,
        snippet: 'Bearer [REDACTED] [REDACTED] launch plan',
        matchType: 'semantic',
      }],
      omittedFiles: 1,
      truncated: true,
    })
    assert.deepEqual(loaded.noteVault.searches.at(-1), {
      args: { query: 'launch', mode: 'related', limit: 4 },
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    })
    assert.doesNotMatch(JSON.stringify(result), /\/Users\/max|private|secret/u)
    assert.deepEqual(
      tool.output.render({}, result as never),
      [{ type: 'text', text: JSON.stringify(result, undefined, 2) }],
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('notes_read returns a bounded redacted canonical note result and rejects another vault', async () => {
  const loaded = await load()
  try {
    loaded.noteVault.notesReadContent = `# Launch\n\nBearer private /Users/max/secret\n${'x'.repeat(70_000)}`
    const tool = loaded.tools.definitions.get('notes_read')
    assert.ok(tool)
    const signal = new AbortController().signal
    const result = await tool.execute({ vaultId: 'vault:test', path: 'Notes/Launch.md' }, execution(signal)) as {
      vaultId: string
      path: string
      title: string
      content: string
      truncated?: boolean
    }
    assert.equal(result.vaultId, 'vault:test')
    assert.equal(result.path, 'Notes/Launch.md')
    assert.equal(result.title, 'Launch')
    assert.equal(result.truncated, true)
    assert.ok(result.content.length <= 64_000)
    assert.doesNotMatch(JSON.stringify(result), /\/Users\/max|private|secret/u)
    assert.deepEqual(loaded.noteVault.reads.at(-1), {
      args: { path: 'Notes/Launch.md' },
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    })
    await assert.rejects(
      tool.execute({ vaultId: 'vault:other', path: 'Notes/Launch.md' }, execution(signal)),
      /not the active vault/u,
    )
    assert.equal(loaded.noteVault.reads.length, 1)
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('notes compatibility tools fail closed on cancellation, malformed paths, and stale generations', async () => {
  const loaded = await load()
  try {
    const aborted = new AbortController()
    aborted.abort('Bearer secret /Users/max')
    await assert.rejects(
      loaded.tools.definitions.get('notes_search')!.execute({ vaultId: 'vault:test', query: 'x' }, execution(aborted.signal)),
      error => error instanceof Error && error.name === 'AbortError' && !String(error).includes('/Users/max'),
    )
    await assert.rejects(
      loaded.tools.definitions.get('notes_read')!.execute({ vaultId: 'vault:test', path: '../secret.md' }, execution(new AbortController().signal)),
      /safe vault-relative Markdown path/u,
    )
    loaded.noteVault.notesSearchResult = {
      query: 'x',
      matches: [],
      truncated: false,
      cursor: null,
      scan: { bytes: 0, entries: 0, files: 0 },
      truncationReason: null,
      warnings: [],
      generation: 8,
    }
    await assert.rejects(
      loaded.tools.definitions.get('notes_search')!.execute({ vaultId: 'vault:test', query: 'x' }, execution(new AbortController().signal)),
      /invalid bounded result/u,
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('vault_list preserves metadata results and delegates every list option', async () => {
  const loaded = await load()
  try {
    const tool = loaded.tools.definitions.get('vault_list')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      type: 'object',
      additionalProperties: false,
      properties: {
        directory: { type: 'string', description: 'Optional vault-relative directory to list recursively.' },
        kind: {
          type: 'string',
          enum: ['documents', 'attachments', 'all'],
          description: 'Entry kinds to list. Defaults to documents.',
        },
        includeStats: { type: 'boolean', description: 'Add source statistics to Markdown entries.' },
        sort: {
          type: 'string',
          enum: ['created', 'modified', 'path', 'recent'],
          description: 'Deterministic ordering. Defaults to path.',
        },
        limit: { type: 'integer', description: 'Maximum entries, capped at 50.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching list.' },
      },
    })
    assert.equal(tool.output.schema.type, 'object')
    assert.deepEqual(tool.output.schema.required, [
      'entries', 'truncated', 'cursor', 'scan', 'truncationReason', 'warnings',
    ])
    const entrySchema = tool.output.schema.properties?.entries
    assert.equal(entrySchema?.type, 'array')
    assert.deepEqual(entrySchema.items, {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string', enum: ['attachment', 'base', 'canvas', 'markdown'] },
        mediaKind: { type: 'string', enum: ['audio', 'image', 'pdf', 'video'] },
        extension: { type: 'string' },
        modifiedMs: { type: 'number' },
        createdMs: { oneOf: [{ type: 'number' }, { type: 'null' }] },
        size: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } },
        aliases: { type: 'array', items: { type: 'string' } },
        properties: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              isNull: { type: 'boolean' },
              key: { type: 'string' },
              values: { type: 'array', items: { type: 'string' } },
            },
            required: ['isNull', 'key', 'values'],
          },
        },
        tasks: {
          type: 'object',
          additionalProperties: false,
          properties: {
            done: { type: 'integer' },
            todo: { type: 'integer' },
            total: { type: 'integer' },
          },
          required: ['done', 'todo', 'total'],
        },
        stats: {
          type: 'object',
          additionalProperties: false,
          properties: {
            words: { type: 'integer' },
            characters: { type: 'integer' },
            headings: { type: 'integer' },
            readingMinutes: { type: 'integer' },
          },
          required: ['words', 'characters', 'headings', 'readingMinutes'],
        },
      },
      required: ['path', 'type', 'modifiedMs', 'createdMs', 'size'],
    })

    const args: VaultListArgs = {
      directory: 'projects',
      kind: 'all',
      includeStats: true,
      sort: 'recent',
      limit: 3,
      cursor: 'opaque',
    }
    const signal = new AbortController().signal
    const result = await tool.execute(args, execution(signal))
    assert.deepEqual(result, {
      entries: [{
        path: 'note.md',
        type: 'markdown',
        title: 'Note',
        modifiedMs: 2,
        createdMs: 1,
        size: 12,
        tags: ['tag'],
        aliases: [],
        properties: [],
        tasks: { done: 0, todo: 1, total: 1 },
      }],
      truncated: false,
      cursor: null,
      scan: { bytes: 12, entries: 1, files: 1 },
      truncationReason: null,
      warnings: [],
    })
    assert.deepEqual(loaded.noteVault.lists, [{
      args,
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    }])
    assert.deepEqual(
      tool.output.render(args, result as never),
      [{ type: 'text', text: JSON.stringify(result, undefined, 2) }],
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('vault_links preserves detailed link results and delegates scan options', async () => {
  const loaded = await load()
  try {
    const tool = loaded.tools.definitions.get('vault_links')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Markdown path relative to the vault root.' },
        includeUnlinked: { type: 'boolean', description: 'Also report incoming unlinked mentions of unique identifiers.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching link scan.' },
      },
      required: ['path'],
    })
    assert.deepEqual(tool.output.schema.required, [
      'path', 'outgoing', 'backlinks', 'outgoingDetails', 'backlinkDetails', 'tagRelations',
      'truncated', 'cursor', 'scan', 'truncationReason', 'warnings',
    ])
    const args: VaultLinksArgs = { path: 'note.md', includeUnlinked: true, cursor: 'opaque' }
    const signal = new AbortController().signal
    const result = await tool.execute(args, execution(signal))
    assert.deepEqual(result, {
      path: 'note.md',
      outgoing: ['target.md'],
      backlinks: [],
      outgoingDetails: [],
      backlinkDetails: [],
      tagRelations: [],
      truncated: false,
      cursor: null,
      scan: { bytes: 12, entries: 1, files: 1 },
      truncationReason: null,
      warnings: [],
    })
    assert.deepEqual(loaded.noteVault.linksCalls, [{
      args,
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    }])
    assert.deepEqual(
      tool.output.render(args, result as never),
      [{ type: 'text', text: JSON.stringify(result, undefined, 2) }],
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('vault_outline preserves optional inventories and delegates their bounds', async () => {
  const loaded = await load()
  try {
    const tool = loaded.tools.definitions.get('vault_outline')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Markdown path relative to the vault root.' },
        includeFootnotes: { type: 'boolean', description: 'Also inventory inline footnotes with source-order ordinals.' },
        includeQueries: { type: 'boolean', description: 'Also extract inert root-level query fences.' },
        limit: { type: 'integer', description: 'Maximum headings, footnotes, and queries each, capped at 50.' },
      },
      required: ['path'],
    })
    assert.deepEqual(tool.output.schema.required, ['path', 'headings', 'truncated'])
    const args: VaultOutlineArgs = {
      path: 'note.md',
      includeFootnotes: true,
      includeQueries: true,
      limit: 4,
    }
    const signal = new AbortController().signal
    const result = await tool.execute(args, execution(signal))
    assert.deepEqual(result, {
      path: 'note.md',
      headings: [{ level: 1, line: 1, selector: 'Title', text: 'Title' }],
      truncated: false,
      footnotes: [{ ordinal: 1, kind: 'inline', content: 'note', line: 2 }],
      footnotesTruncated: false,
      queries: [{ ordinal: 1, query: 'tag:#work', line: 3, lineEnd: 5, fence: 'query' }],
      queriesTruncated: false,
    })
    assert.deepEqual(loaded.noteVault.outlines, [{
      args,
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    }])
    assert.deepEqual(
      tool.output.render(args, result as never),
      [{ type: 'text', text: JSON.stringify(result, undefined, 2) }],
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('vault_graph preserves local/global graph options and canonical results', async () => {
  const loaded = await load()
  try {
    const tool = loaded.tools.definitions.get('vault_graph')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      type: 'object',
      additionalProperties: false,
      properties: {
        scope: {
          type: 'string',
          enum: ['local', 'global'],
          description: 'Graph scope. Defaults to local.',
        },
        path: { type: 'string', description: 'Markdown or Canvas path relative to the vault root for local scope.' },
        depth: { type: 'integer', description: 'Local traversal depth from 1 through 3. Defaults to 1.' },
        direction: {
          type: 'string',
          enum: ['outgoing', 'backlinks', 'both'],
          description: 'Local relationship direction to traverse. Defaults to both.',
        },
        tag: { type: 'string', description: 'Optional exact tag or parent tag filter for local scope.' },
        includeTags: { type: 'boolean', description: 'Include normalized tag nodes and edges in global scope.' },
        includeAttachments: { type: 'boolean', description: 'Include accepted attachment nodes reached by explicit global relationships.' },
        limit: { type: 'integer', description: 'Maximum combined output items, capped at 50.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching global graph page.' },
      },
    })
    assert.deepEqual(tool.output.schema.required, [
      'path', 'nodes', 'edges', 'missing', 'orphans', 'complete', 'truncated',
      'scan', 'truncationReason', 'warnings',
    ])
    const args: VaultGraphArgs = {
      scope: 'local',
      path: 'note.md',
      depth: 3,
      direction: 'both',
      tag: 'work',
      includeTags: true,
      includeAttachments: true,
      limit: 8,
      cursor: 'opaque',
    }
    const signal = new AbortController().signal
    const result = await tool.execute(args, execution(signal))
    assert.deepEqual(result, {
      path: 'note.md',
      nodes: [{ path: 'note.md', depth: 0 }],
      edges: [],
      missing: [],
      orphans: [],
      complete: true,
      truncated: false,
      scan: { bytes: 12, entries: 1, files: 1 },
      truncationReason: null,
      warnings: [],
      cursor: null,
    })
    assert.deepEqual(loaded.noteVault.graphs, [{
      args,
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    }])
    assert.deepEqual(
      tool.output.render(args, result as never),
      [{ type: 'text', text: JSON.stringify(result, undefined, 2) }],
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('vault_canvas preserves inert node fields, paging, and runtime delegation', async () => {
  const loaded = await load()
  try {
    const tool = loaded.tools.definitions.get('vault_canvas')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Canvas path relative to the vault root.' },
        limit: { type: 'integer', description: 'Maximum items, capped at 50.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching Canvas inspection.' },
      },
      required: ['path'],
    })
    assert.deepEqual(tool.output.schema.required, [
      'path', 'items', 'cursor', 'truncated', 'truncationReason', 'warnings',
    ])
    const args: VaultCanvasArgs = { path: 'board.canvas', limit: 2, cursor: 'opaque' }
    const signal = new AbortController().signal
    const result = await tool.execute(args, execution(signal))
    assert.deepEqual(result, {
      path: 'board.canvas',
      items: [{
        kind: 'node', id: 'one', line: 1, type: 'text', x: 1, y: 2, width: 3, height: 4,
        text: 'canary', file: null, url: null, label: null, color: null, fromNode: null,
        toNode: null, fromSide: null, toSide: null, fromEnd: null, toEnd: null,
      }],
      cursor: null,
      truncated: false,
      truncationReason: null,
      warnings: [],
    })
    assert.deepEqual(loaded.noteVault.canvases, [{
      args,
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    }])
    assert.deepEqual(
      tool.output.render(args, result as never),
      [{ type: 'text', text: JSON.stringify(result, undefined, 2) }],
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('vault_facets preserves bounded additive counts and all eight public names', async () => {
  const loaded = await load()
  try {
    assert.deepEqual([...loaded.tools.definitions.keys()], [
      'vault_search',
      'vault_read',
      'notes_search',
      'notes_read',
      'vault_list',
      'vault_links',
      'vault_outline',
      'vault_graph',
      'vault_canvas',
      'vault_facets',
    ])
    const tool = loaded.tools.definitions.get('vault_facets')
    assert.ok(tool)
    assert.deepEqual(tool.parameters, {
      type: 'object',
      additionalProperties: false,
      properties: {
        directory: { type: 'string', description: 'Optional vault-relative directory to aggregate recursively.' },
        limit: { type: 'integer', description: 'Maximum tags and properties per page, capped at 50 each.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching facet scan.' },
      },
    })
    assert.deepEqual(tool.output.schema.required, [
      'tags', 'properties', 'complete', 'truncated',
      'cursor', 'scan', 'truncationReason', 'warnings',
    ])
    const args: VaultFacetsArgs = { directory: 'projects', limit: 4, cursor: 'opaque' }
    const signal = new AbortController().signal
    const result = await tool.execute(args, execution(signal))
    assert.deepEqual(result, {
      tags: [{ tag: 'work', count: 2 }],
      properties: [{ key: 'status', count: 1, types: ['string'] }],
      complete: true,
      truncated: false,
      cursor: null,
      scan: { bytes: 12, entries: 1, files: 1 },
      truncationReason: null,
      warnings: [],
    })
    assert.deepEqual(loaded.noteVault.facetsCalls, [{
      args,
      expectedVault: { generation: 7, id: 'vault:test' },
      signal,
    }])
    assert.deepEqual(
      tool.output.render(args, result as never),
      [{ type: 'text', text: JSON.stringify(result, undefined, 2) }],
    )
  } finally {
    await loaded.context.fiber.dispose()
  }
})

test('vault tools fail closed while inactive and all unregister on runtime loss', async () => {
  const loaded = await load()
  try {
    const tool = loaded.tools.definitions.get('vault_read')
    assert.ok(tool)
    loaded.noteVault.state = { active: false, generation: 8 }
    await assert.rejects(
      tool.execute({ path: 'note.md' }, execution(new AbortController().signal)),
      /active vault/i,
    )
    assert.equal(loaded.noteVault.reads.length, 0)

    await loaded.runtimeFiber.dispose()
    assert.deepEqual([...loaded.tools.definitions], [])
  } finally {
    await loaded.context.fiber.dispose()
  }
})
