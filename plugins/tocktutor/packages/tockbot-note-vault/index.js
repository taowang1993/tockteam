import { constants } from 'node:fs'
import { lstat, open, opendir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import Schema from 'schemastery'
import { createVaultInspection } from './inspection.js'

export const name = 'tockbot-note-vault'
export const inject = ['tools']

export const Config = Schema.object({
  root: Schema.string().required(),
  maxReadBytes: Schema.natural().min(1).default(256 * 1024),
  maxSearchBytes: Schema.natural().min(1).default(64 * 1024 * 1024),
  maxSearchEntries: Schema.natural().min(1).default(20_000),
  maxSearchFileBytes: Schema.natural().min(1).default(2 * 1024 * 1024),
  maxSearchResults: Schema.natural().min(1).default(50),
})

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const VAULT_DOCUMENT_EXTENSIONS = new Set([...MARKDOWN_EXTENSIONS, '.base', '.canvas'])
// Accepted attachment policy ported from Tockbot a1f11e92236df639c3f5b004feee62bb9c2e0a57
// apps/web/src/components/notes/NotesMediaEmbeds.ts.
const ATTACHMENT_EXTENSIONS = new Map(Object.entries({
  image: ['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'],
  audio: ['.3gp', '.flac', '.m4a', '.mp3', '.ogg', '.wav'],
  video: ['.mkv', '.mov', '.mp4', '.ogv', '.webm'],
  pdf: ['.pdf'],
}).flatMap(([mediaKind, extensions]) => extensions.map(extension => [extension, mediaKind])))
const MAX_PREVIEW_CHARS = 240
const MAX_SCAN_WARNINGS = 20
const MAX_METADATA_PROPERTIES = 50
const MAX_METADATA_VALUES = 20
const MAX_METADATA_VALUE_CHARS = 240
const MAX_GRAPH_RELATIONSHIPS = 10_000
const MAX_CANVAS_NODES = 256
const MAX_CANVAS_EDGES = 512
const MAX_CANVAS_STRING_CHARS = 1_000
const RELATED_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with'])
const WORD_PATTERN = /[\p{L}\p{N}]+/gu

const CURSOR_OUTPUT_SCHEMA = { oneOf: [{ type: 'string' }, { type: 'null' }] }
const TRUNCATION_REASON_SCHEMA = {
  oneOf: [
    { type: 'string', enum: ['byte-limit', 'entry-limit', 'file-limit', 'metadata-limit', 'result-limit'] },
    { type: 'null' },
  ],
}
const SCAN_OUTPUT_PROPERTIES = {
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

const SEARCH_OUTPUT_SCHEMA = {
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
    ...SCAN_OUTPUT_PROPERTIES,
  },
  required: ['query', 'matches', 'truncated', ...SCAN_OUTPUT_REQUIRED],
}

const OUTLINE_OUTPUT_SCHEMA = {
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

const READ_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['path', 'content'],
}

const LINK_RECORD_SCHEMA = {
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

const LINKS_OUTPUT_SCHEMA = {
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

const LIST_OUTPUT_SCHEMA = {
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
        required: [
          'path', 'type', 'modifiedMs', 'createdMs', 'size',
        ],
      },
    },
    truncated: { type: 'boolean' },
    ...SCAN_OUTPUT_PROPERTIES,
  },
  required: ['entries', 'truncated', ...SCAN_OUTPUT_REQUIRED],
}

const GRAPH_OUTPUT_SCHEMA = {
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
          kind: LINK_RECORD_SCHEMA.properties.kind,
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
    scan: SCAN_OUTPUT_PROPERTIES.scan,
    truncationReason: TRUNCATION_REASON_SCHEMA,
    warnings: SCAN_OUTPUT_PROPERTIES.warnings,
    cursor: CURSOR_OUTPUT_SCHEMA,
  },
  required: [
    'path', 'nodes', 'edges', 'missing', 'orphans', 'complete', 'truncated',
    'scan', 'truncationReason', 'warnings',
  ],
}

const NULLABLE_STRING_SCHEMA = { oneOf: [{ type: 'string' }, { type: 'null' }] }
const NULLABLE_NUMBER_SCHEMA = { oneOf: [{ type: 'number' }, { type: 'null' }] }
const CANVAS_OUTPUT_SCHEMA = {
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

const PROPERTY_TYPE_SCHEMA = {
  type: 'string',
  enum: ['null', 'string', 'number', 'boolean', 'date', 'datetime', 'list'],
}
const FACETS_OUTPUT_SCHEMA = {
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

function isMarkdown(filePath) {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function isCanvas(filePath) {
  return path.extname(filePath).toLowerCase() === '.canvas'
}

function isBase(filePath) {
  return path.extname(filePath).toLowerCase() === '.base'
}

function isVaultDocument(filePath) {
  return VAULT_DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function attachmentMediaKind(filePath) {
  return ATTACHMENT_EXTENSIONS.get(path.extname(filePath).toLowerCase()) ?? null
}

function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function assertInside(root, target) {
  if (!isInside(root, target)) {
    throw new Error('Vault paths must stay inside the configured vault.')
  }
}

function isHiddenVaultPath(relativePath) {
  return relativePath.split(/[\\/]/u).some(segment => segment.startsWith('.') && segment !== '.')
}

function assertNoHiddenPath(root, target) {
  if (isHiddenVaultPath(path.relative(root, target))) {
    throw new Error('Hidden vault paths are not allowed.')
  }
}

function compareVaultPaths(left, right) {
  const collated = left.localeCompare(right)
  return collated || (left < right ? -1 : left > right ? 1 : 0)
}

async function assertNoSymlinkPath(root, target) {
  const relative = path.relative(root, target)
  if (!relative || relative === '.') return
  let current = root
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    if ((await lstat(current)).isSymbolicLink()) {
      throw new Error('Vault symbolic links are not allowed.')
    }
  }
}

function vaultRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/')
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

async function openVerifiedVaultFile(root, candidate) {
  assertInside(root, candidate)
  await assertNoSymlinkPath(root, candidate)
  const canonical = await realpath(candidate)
  assertInside(root, canonical)
  const expected = await stat(canonical, { bigint: true })
  if (!expected.isFile() || !isVaultDocument(candidate) || !isVaultDocument(canonical)) {
    throw new Error('Vault reads support Markdown, Canvas, or Base files only.')
  }

  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const actual = await handle.stat({ bigint: true })
    if (!actual.isFile() || !sameFile(expected, actual)) {
      throw new Error('Vault file changed while it was being opened.')
    }
    return {
      canonical,
      createdMs: Number(actual.birthtimeMs || actual.ctimeMs),
      handle,
      modifiedMs: Number(actual.mtimeMs),
      size: Number(actual.size),
    }
  } catch (error) {
    await handle.close()
    throw error
  }
}

async function statVerifiedVaultFile(root, candidate) {
  assertInside(root, candidate)
  await assertNoSymlinkPath(root, candidate)
  const canonical = await realpath(candidate)
  assertInside(root, canonical)
  const expected = await stat(canonical, { bigint: true })
  if (!expected.isFile()) throw new Error('Vault attachment must be a file.')
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const actual = await handle.stat({ bigint: true })
    if (!actual.isFile() || !sameFile(expected, actual)) {
      throw new Error('Vault attachment changed while it was being inspected.')
    }
    return {
      createdMs: Number(actual.birthtimeMs || actual.ctimeMs),
      modifiedMs: Number(actual.mtimeMs),
      size: Number(actual.size),
    }
  } finally {
    await handle.close()
  }
}

async function openVaultFile(root, requestedPath) {
  if (typeof requestedPath !== 'string' || requestedPath.trim() === '' || requestedPath.includes('\0')) {
    throw new Error('path must be a non-empty vault-relative string')
  }
  if (path.isAbsolute(requestedPath)) {
    throw new Error('Vault paths must stay inside the configured vault.')
  }
  const candidate = path.resolve(root, requestedPath)
  try {
    assertInside(root, candidate)
    assertNoHiddenPath(root, candidate)
    const file = await openVerifiedVaultFile(root, candidate)
    return { ...file, path: vaultRelative(root, candidate) }
  } catch (error) {
    if (error?.message?.startsWith('Vault ') || error?.message?.startsWith('Hidden ')) throw error
    throw new Error('Vault path could not be opened safely.')
  }
}

async function readBounded(handle, limit, signal, expectedSize = 0) {
  const chunks = []
  let offset = 0
  let chunkSize = Math.min(limit + 1, 64 * 1024, Math.max(1, expectedSize + 1))
  while (offset <= limit) {
    signal.throwIfAborted()
    const chunk = Buffer.allocUnsafe(chunkSize)
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset)
    if (bytesRead === 0) break
    chunks.push(chunk.subarray(0, bytesRead))
    offset += bytesRead
    chunkSize = Math.min(limit + 1 - offset, 64 * 1024)
  }
  signal.throwIfAborted()
  return offset > limit ? null : Buffer.concat(chunks, offset)
}

async function readFileSystemVaultDocument(root, requestedPath, limit, signal) {
  const file = await openVaultFile(root, requestedPath)
  try {
    if (file.size > limit) {
      throw new Error(`Vault file exceeds the configured ${String(limit)}-byte limit.`)
    }
    const bytes = await readBounded(file.handle, limit, signal, file.size)
    if (bytes === null) {
      throw new Error(`Vault file exceeds the configured ${String(limit)}-byte limit.`)
    }
    return { content: bytes.toString('utf8'), path: file.path }
  } finally {
    await file.handle.close()
  }
}

async function collectFileSystemEntries(root, startDirectory, signal) {
  const allEntries = []
  const visit = async directory => {
    signal.throwIfAborted()
    await assertNoSymlinkPath(root, directory)
    const canonicalDirectory = await realpath(directory)
    assertInside(root, canonicalDirectory)
    const stream = await opendir(canonicalDirectory)
    for await (const entry of stream) {
      signal.throwIfAborted()
      const absolutePath = path.join(canonicalDirectory, entry.name)
      allEntries.push({ absolutePath, entry, path: vaultRelative(root, absolutePath) })
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.isSymbolicLink()) {
        await visit(absolutePath)
      }
    }
  }
  await visit(startDirectory)
  // ponytail: deterministic cursors require sorting the native listing;
  // split unusually wide vaults if enumeration memory becomes measurable.
  return allEntries.sort((left, right) => compareVaultPaths(left.path, right.path))
}

async function fileSystemInventoryPage(root, request, signal) {
  signal.throwIfAborted()
  const limit = Number.isInteger(request.limit) && request.limit > 0 ? request.limit : 100
  const directory = request.directory ?? ''
  const startDirectory = directory ? path.resolve(root, directory) : root
  assertInside(root, startDirectory)
  assertNoHiddenPath(root, startDirectory)
  const allEntries = await collectFileSystemEntries(root, startDirectory, signal)
  const candidates = allEntries.filter(candidate => (
    candidate.entry.isFile()
    && !isHiddenVaultPath(candidate.path)
    && (isVaultDocument(candidate.path) || attachmentMediaKind(candidate.path))
  ))
  const remaining = candidates.filter(candidate => (
    request.cursor == null || compareVaultPaths(candidate.path, request.cursor) > 0
  ))
  const selected = remaining.slice(0, limit)
  const entries = []
  const warnings = []
  for (const candidate of selected) {
    signal.throwIfAborted()
    try {
      const mediaKind = attachmentMediaKind(candidate.path)
      if (mediaKind) {
        entries.push({
          path: candidate.path,
          kind: 'attachment',
          mediaKind,
          ...await statVerifiedVaultFile(root, candidate.absolutePath),
        })
      } else {
        const file = await openVerifiedVaultFile(root, candidate.absolutePath)
        try {
          entries.push({
            path: candidate.path,
            kind: 'document',
            createdMs: file.createdMs,
            modifiedMs: file.modifiedMs,
            size: file.size,
          })
        } finally {
          await file.handle.close()
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError' || error?.message?.startsWith('Vault ')) throw error
      if (warnings.length < MAX_SCAN_WARNINGS) warnings.push(`${candidate.path}: could not be opened safely`)
    }
  }
  const hasMore = remaining.length > selected.length
  const sourceEnd = selected.at(-1)?.path ?? request.cursor ?? null
  const rawRemaining = allEntries.filter(candidate => (
    request.cursor == null || compareVaultPaths(candidate.path, request.cursor) > 0
  ))
  const scannedEntries = sourceEnd == null
    ? rawRemaining.length
    : rawRemaining.filter(candidate => compareVaultPaths(candidate.path, sourceEnd) <= 0).length
  return {
    entries,
    cursor: hasMore ? sourceEnd : null,
    complete: !hasMore,
    truncated: hasMore,
    truncationReason: hasMore ? 'result-limit' : null,
    warnings,
    [SCANNED_ENTRIES]: scannedEntries,
  }
}

const DIRECTORY_SCOPED_INPUT = Symbol.for('tockbot-note-vault.directory-scoped-input')
const SCANNED_ENTRIES = Symbol.for('tockbot-note-vault.scanned-entries')

function createFileSystemInspectionInput(root) {
  const read = (requestedPath, limit, signal) => (
    readFileSystemVaultDocument(root, requestedPath, limit, signal)
  )
  return {
    list: (request, signal) => fileSystemInventoryPage(root, request, signal),
    read,
    [DIRECTORY_SCOPED_INPUT](directory) {
      return {
        list: (request, signal) => fileSystemInventoryPage(root, { ...request, directory }, signal),
        read,
      }
    },
  }
}

function renderJson(value) {
  return [{ type: 'text', text: JSON.stringify(value, undefined, 2) }]
}

export async function apply(ctx, config) {
  const root = await realpath(config.root)
  if (!(await stat(root)).isDirectory()) throw new Error('Vault root must be a directory.')
  const maxSearchResults = Math.floor(config.maxSearchResults)
  const inspection = createVaultInspection(createFileSystemInspectionInput(root), config)

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
        limit: { type: 'integer', description: `Maximum matches, capped at ${String(maxSearchResults)}.` },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching search.' },
      },
      required: ['query'],
    },
    output: { schema: SEARCH_OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return await inspection.search(args, exec.signal)
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
    output: { schema: READ_OUTPUT_SCHEMA, render: (_args, value) => [{ type: 'text', text: value.content }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return await inspection.read(args, exec.signal)
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
        limit: { type: 'integer', description: `Maximum entries, capped at ${String(maxSearchResults)}.` },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching list.' },
      },
    },
    output: { schema: LIST_OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return await inspection.list(args, exec.signal)
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
    output: { schema: LINKS_OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return await inspection.links(args, exec.signal)
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
        limit: { type: 'integer', description: `Maximum headings, footnotes, and queries each, capped at ${String(maxSearchResults)}.` },
      },
      required: ['path'],
    },
    output: { schema: OUTLINE_OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return await inspection.outline(args, exec.signal)
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
        limit: { type: 'integer', description: `Maximum combined output items, capped at ${String(maxSearchResults)}.` },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching global graph page.' },
      },
    },
    output: { schema: GRAPH_OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return await inspection.graph(args, exec.signal)
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
        limit: { type: 'integer', description: `Maximum items, capped at ${String(maxSearchResults)}.` },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching Canvas inspection.' },
      },
      required: ['path'],
    },
    output: { schema: CANVAS_OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return await inspection.canvas(args, exec.signal)
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
        limit: { type: 'integer', description: `Maximum tags and properties per page, capped at ${String(maxSearchResults)} each.` },
        cursor: { type: 'string', description: 'Opaque cursor returned by an earlier matching facet scan.' },
      },
    },
    output: { schema: FACETS_OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return await inspection.facets(args, exec.signal)
    },
  })
}
