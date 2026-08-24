import type { Context } from '@deepseek-ai/cordis'
import type { JsonSchemaNode, JsonValue, ToolDefinition } from '@deepseek-ai/dsh-tools'
import type {
  NoteVaultRuntime,
  VaultCanvasArgs,
  VaultFacetsArgs,
  VaultGraphArgs,
  VaultListArgs,
  VaultLinksArgs,
  VaultOutlineArgs,
  VaultReadArgs,
  VaultReference,
  VaultSearchArgs,
} from 'tockbot-note-runtime'

export const name = 'note-vault-tools'
export const inject = ['tools', 'noteVault']

type AdapterContext = Context & {
  noteVault: NoteVaultRuntime
  tools: { register(definition: ToolDefinition): () => void }
}

const CURSOR_OUTPUT_SCHEMA: JsonSchemaNode = {
  oneOf: [{ type: 'string' }, { type: 'null' }],
}
const TRUNCATION_REASON_SCHEMA: JsonSchemaNode = {
  oneOf: [
    {
      type: 'string',
      enum: ['byte-limit', 'entry-limit', 'file-limit', 'metadata-limit', 'result-limit'],
    },
    { type: 'null' },
  ],
}
const SCAN_OUTPUT_PROPERTIES: Record<string, JsonSchemaNode> = {
  cursor: CURSOR_OUTPUT_SCHEMA,
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
  truncationReason: TRUNCATION_REASON_SCHEMA,
  warnings: { type: 'array', items: { type: 'string' } },
}
const SCAN_OUTPUT_REQUIRED = ['cursor', 'scan', 'truncationReason', 'warnings']

const SEARCH_OUTPUT_SCHEMA: JsonSchemaNode = {
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
          kind: {
            type: 'string',
            enum: [
              'base', 'block', 'canvas', 'content', 'line', 'path', 'property', 'section', 'tag',
              'task',
            ],
          },
          line: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
          preview: { type: 'string' },
          lineEnd: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
          score: { type: 'number' },
          operator: {
            type: 'string',
            enum: [
              'any', 'block', 'content', 'file', 'line', 'path', 'property', 'related', 'section',
              'tag', 'task', 'task-done', 'task-todo',
            ],
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
    ...SCAN_OUTPUT_PROPERTIES,
  },
  required: ['query', 'matches', 'truncated', ...SCAN_OUTPUT_REQUIRED],
}

const OUTLINE_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string' },
    headings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          level: { type: 'integer' },
          line: { type: 'integer' },
          selector: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['level', 'line', 'selector', 'text'],
      },
    },
    truncated: { type: 'boolean' },
    footnotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ordinal: { type: 'integer' },
          kind: { type: 'string', enum: ['inline'] },
          content: { type: 'string' },
          line: { type: 'integer' },
        },
        required: ['ordinal', 'kind', 'content', 'line'],
      },
    },
    footnotesTruncated: { type: 'boolean' },
    queries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ordinal: { type: 'integer' },
          query: { type: 'string' },
          line: { type: 'integer' },
          lineEnd: { type: 'integer' },
          fence: { type: 'string' },
        },
        required: ['ordinal', 'query', 'line', 'lineEnd', 'fence'],
      },
    },
    queriesTruncated: { type: 'boolean' },
  },
  required: ['path', 'headings', 'truncated'],
}

const READ_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['path', 'content'],
}

const LINK_RECORD_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    authoredTarget: { type: 'string' },
    displayText: { type: 'string' },
    fragment: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    kind: {
      type: 'string',
      enum: ['canvas-file', 'embed', 'image', 'image-reference', 'markdown', 'reference', 'tag', 'wiki'],
    },
    line: { type: 'integer' },
    normalizedTarget: { type: 'string' },
    resolvedPath: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    sourcePath: { type: 'string' },
    status: { type: 'string', enum: ['ambiguous', 'resolved', 'unresolved'] },
  },
  required: [
    'authoredTarget', 'displayText', 'fragment', 'kind', 'line', 'normalizedTarget',
    'resolvedPath', 'sourcePath', 'status',
  ],
}

const LINKS_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string' },
    outgoing: { type: 'array', items: { type: 'string' } },
    backlinks: { type: 'array', items: { type: 'string' } },
    outgoingDetails: { type: 'array', items: LINK_RECORD_SCHEMA },
    backlinkDetails: { type: 'array', items: LINK_RECORD_SCHEMA },
    tagRelations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tag: { type: 'string' },
          paths: { type: 'array', items: { type: 'string' } },
        },
        required: ['tag', 'paths'],
      },
    },
    truncated: { type: 'boolean' },
    complete: { type: 'boolean' },
    unlinkedMentions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourcePath: { type: 'string' },
          line: { type: 'integer' },
          matchedText: { type: 'string' },
          identifierKind: { type: 'string', enum: ['title', 'basename', 'alias'] },
          snippet: { type: 'string' },
        },
        required: ['sourcePath', 'line', 'matchedText', 'identifierKind', 'snippet'],
      },
    },
    ...SCAN_OUTPUT_PROPERTIES,
  },
  required: [
    'path', 'outgoing', 'backlinks', 'outgoingDetails', 'backlinkDetails', 'tagRelations',
    'truncated', ...SCAN_OUTPUT_REQUIRED,
  ],
}

const NULLABLE_STRING_SCHEMA: JsonSchemaNode = {
  oneOf: [{ type: 'string' }, { type: 'null' }],
}
const NULLABLE_NUMBER_SCHEMA: JsonSchemaNode = {
  oneOf: [{ type: 'number' }, { type: 'null' }],
}
const CANVAS_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['node', 'edge'] },
          id: { type: 'string' },
          line: { type: 'integer' },
          type: NULLABLE_STRING_SCHEMA,
          x: NULLABLE_NUMBER_SCHEMA,
          y: NULLABLE_NUMBER_SCHEMA,
          width: NULLABLE_NUMBER_SCHEMA,
          height: NULLABLE_NUMBER_SCHEMA,
          text: NULLABLE_STRING_SCHEMA,
          file: NULLABLE_STRING_SCHEMA,
          url: NULLABLE_STRING_SCHEMA,
          label: NULLABLE_STRING_SCHEMA,
          color: NULLABLE_STRING_SCHEMA,
          fromNode: NULLABLE_STRING_SCHEMA,
          toNode: NULLABLE_STRING_SCHEMA,
          fromSide: NULLABLE_STRING_SCHEMA,
          toSide: NULLABLE_STRING_SCHEMA,
          fromEnd: NULLABLE_STRING_SCHEMA,
          toEnd: NULLABLE_STRING_SCHEMA,
        },
        required: [
          'kind', 'id', 'line', 'type', 'x', 'y', 'width', 'height', 'text', 'file',
          'url', 'label', 'color', 'fromNode', 'toNode', 'fromSide', 'toSide',
          'fromEnd', 'toEnd',
        ],
      },
    },
    cursor: CURSOR_OUTPUT_SCHEMA,
    truncated: { type: 'boolean' },
    truncationReason: TRUNCATION_REASON_SCHEMA,
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['path', 'items', 'cursor', 'truncated', 'truncationReason', 'warnings'],
}

const PROPERTY_TYPE_SCHEMA: JsonSchemaNode = {
  type: 'string',
  enum: ['null', 'string', 'number', 'boolean', 'date', 'datetime', 'list'],
}
const FACETS_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { tag: { type: 'string' }, count: { type: 'integer' } },
        required: ['tag', 'count'],
      },
    },
    properties: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          count: { type: 'integer' },
          types: { type: 'array', items: PROPERTY_TYPE_SCHEMA },
        },
        required: ['key', 'count', 'types'],
      },
    },
    complete: { type: 'boolean' },
    truncated: { type: 'boolean' },
    ...SCAN_OUTPUT_PROPERTIES,
  },
  required: ['tags', 'properties', 'complete', 'truncated', ...SCAN_OUTPUT_REQUIRED],
}

const GRAPH_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          depth: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
        },
        required: ['path', 'depth'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourcePath: { type: 'string' },
          targetPath: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['canvas-file', 'embed', 'image', 'image-reference', 'markdown', 'reference', 'tag', 'wiki'],
          },
          line: { type: 'integer' },
          fragment: CURSOR_OUTPUT_SCHEMA,
        },
        required: ['sourcePath', 'targetPath', 'kind', 'line', 'fragment'],
      },
    },
    missing: { type: 'array', items: LINK_RECORD_SCHEMA },
    orphans: { type: 'array', items: { type: 'string' } },
    complete: { type: 'boolean' },
    truncated: { type: 'boolean' },
    scan: SCAN_OUTPUT_PROPERTIES.scan!,
    truncationReason: TRUNCATION_REASON_SCHEMA,
    warnings: SCAN_OUTPUT_PROPERTIES.warnings!,
    cursor: CURSOR_OUTPUT_SCHEMA,
  },
  required: [
    'path', 'nodes', 'edges', 'missing', 'orphans', 'complete', 'truncated',
    'scan', 'truncationReason', 'warnings',
  ],
}

const LIST_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entries: {
      type: 'array',
      items: {
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
      },
    },
    truncated: { type: 'boolean' },
    ...SCAN_OUTPUT_PROPERTIES,
  },
  required: ['entries', 'truncated', ...SCAN_OUTPUT_REQUIRED],
}

function activeVault(ctx: AdapterContext): VaultReference {
  const state = ctx.noteVault.state
  if (!state.active) throw new Error('Vault tools require an active vault')
  return { generation: state.generation, id: state.id }
}

function withoutGeneration<Result extends { generation: number }>(
  value: Result,
): Omit<Result, 'generation'> {
  const { generation: _generation, ...result } = value
  return result
}

function renderJson(value: JsonValue) {
  return [{ type: 'text' as const, text: JSON.stringify(value, undefined, 2) }]
}

export function apply(context: Context): void {
  const ctx = context as AdapterContext
  ctx.tools.register({
    name: 'vault_search',
    description: 'Search note content, paths, titles, properties, tags, Canvas text, and inert Base text inside the configured note vault. This is read-only.',
    parameters: {
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
    },
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderJson(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return withoutGeneration(await ctx.noteVault.search(
        args as unknown as VaultSearchArgs,
        activeVault(ctx),
        exec.signal,
      ))
    },
  })

  ctx.tools.register({
    name: 'vault_read',
    description: 'Read one Markdown, Canvas, or inert Base document, or one Markdown heading, block ID, or footnote. This is read-only.',
    parameters: {
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
    },
    output: {
      schema: READ_OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: (value as { content: string }).content,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return withoutGeneration(await ctx.noteVault.read(
        args as unknown as VaultReadArgs,
        activeVault(ctx),
        exec.signal,
      ))
    },
  })

  ctx.tools.register({
    name: 'vault_list',
    description: 'List Markdown, Canvas, and inert Base documents with bounded metadata. This is read-only.',
    parameters: {
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
    },
    output: {
      schema: LIST_OUTPUT_SCHEMA,
      render: (_args, value) => renderJson(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return withoutGeneration(await ctx.noteVault.list(
        args as unknown as VaultListArgs,
        activeVault(ctx),
        exec.signal,
      ))
    },
  })

  ctx.tools.register({
    name: 'vault_links',
    description: 'Resolve outgoing Markdown links and backlinks for one note. This is read-only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Markdown path relative to the vault root.' },
        includeUnlinked: { type: 'boolean', description: 'Also report incoming unlinked mentions of unique identifiers.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching link scan.' },
      },
      required: ['path'],
    },
    output: {
      schema: LINKS_OUTPUT_SCHEMA,
      render: (_args, value) => renderJson(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return withoutGeneration(await ctx.noteVault.links(
        args as unknown as VaultLinksArgs,
        activeVault(ctx),
        exec.signal,
      ))
    },
  })

  ctx.tools.register({
    name: 'vault_outline',
    description: 'Return bounded Markdown ATX headings with duplicate-safe selectors. This is read-only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Markdown path relative to the vault root.' },
        includeFootnotes: { type: 'boolean', description: 'Also inventory inline footnotes with source-order ordinals.' },
        includeQueries: { type: 'boolean', description: 'Also extract inert root-level query fences.' },
        limit: { type: 'integer', description: 'Maximum headings, footnotes, and queries each, capped at 50.' },
      },
      required: ['path'],
    },
    output: {
      schema: OUTLINE_OUTPUT_SCHEMA,
      render: (_args, value) => renderJson(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return withoutGeneration(await ctx.noteVault.outline(
        args as unknown as VaultOutlineArgs,
        activeVault(ctx),
        exec.signal,
      ))
    },
  })

  ctx.tools.register({
    name: 'vault_graph',
    description: 'Inspect a bounded local or cursor-paged global relationship graph. This is read-only.',
    parameters: {
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
    },
    output: {
      schema: GRAPH_OUTPUT_SCHEMA,
      render: (_args, value) => renderJson(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return withoutGeneration(await ctx.noteVault.graph(
        args as unknown as VaultGraphArgs,
        activeVault(ctx),
        exec.signal,
      ))
    },
  })

  ctx.tools.register({
    name: 'vault_canvas',
    description: 'Inspect bounded inert Canvas nodes and edges without opening or fetching their targets. This is read-only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Canvas path relative to the vault root.' },
        limit: { type: 'integer', description: 'Maximum items, capped at 50.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching Canvas inspection.' },
      },
      required: ['path'],
    },
    output: {
      schema: CANVAS_OUTPUT_SCHEMA,
      render: (_args, value) => renderJson(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return withoutGeneration(await ctx.noteVault.canvas(
        args as unknown as VaultCanvasArgs,
        activeVault(ctx),
        exec.signal,
      ))
    },
  })

  ctx.tools.register({
    name: 'vault_facets',
    description: 'Count bounded additive tag and property facets over Markdown scan pages. This is read-only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        directory: { type: 'string', description: 'Optional vault-relative directory to aggregate recursively.' },
        limit: { type: 'integer', description: 'Maximum tags and properties per page, capped at 50 each.' },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching facet scan.' },
      },
    },
    output: {
      schema: FACETS_OUTPUT_SCHEMA,
      render: (_args, value) => renderJson(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return withoutGeneration(await ctx.noteVault.facets(
        args as unknown as VaultFacetsArgs,
        activeVault(ctx),
        exec.signal,
      ))
    },
  })
}
