import { parseZip, type ArchiveLimits } from '../archive.ts'
import {
  destinationAliasKey,
  ImportExportError,
  normalizeRelativePath,
  sha256,
  stableJson,
  type PlannedFile,
  type SkippedEntry,
} from '../core.ts'

export const MARKDOWN_MAX_ENTRIES = 500
export const MARKDOWN_MAX_ENTRY_BYTES = 10 * 1024 * 1024
export const MARKDOWN_MAX_TOTAL_BYTES = 100 * 1024 * 1024

export const MARKDOWN_ARCHIVE_LIMITS: ArchiveLimits = {
  maxArchiveBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxDepth: 64,
  maxEntries: MARKDOWN_MAX_ENTRIES,
  maxEntryBytes: MARKDOWN_MAX_ENTRY_BYTES,
  maxFilenameBytes: 4_096,
  maxParserMs: 30_000,
  maxTotalBytes: MARKDOWN_MAX_TOTAL_BYTES,
}

const DOCUMENT_EXTENSIONS = new Set(['base', 'canvas', 'markdown', 'md'])
const ATTACHMENT_EXTENSIONS = new Set([
  '3gp', 'avif', 'bmp', 'flac', 'gif', 'jpeg', 'jpg', 'm4a', 'mkv', 'mov',
  'mp3', 'mp4', 'ogg', 'ogv', 'pdf', 'png', 'wav', 'webm', 'webp',
])
const decoder = new TextDecoder('utf-8', { fatal: true })

export interface InspectedSourceFile {
  bytes: Uint8Array
  fingerprint: string
  path: string
}

export interface PlannedSourceResult {
  digest: string
  files: PlannedFile[]
  size: number
  skipped: SkippedEntry[]
  sourceEntries: number
  warnings: string[]
}

function extension(path: string): string {
  const name = path.split('/').at(-1) ?? ''
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLocaleLowerCase('en-US')
}

function planMarkdown(files: InspectedSourceFile[]): PlannedSourceResult {
  if (!Array.isArray(files) || files.length === 0) throw new ImportExportError('unsupported-type')
  if (files.length > MARKDOWN_MAX_ENTRIES) throw new ImportExportError('limit-exceeded')
  const aliases = new Set<string>()
  const planned: PlannedFile[] = []
  const skipped: SkippedEntry[] = []
  let size = 0
  for (const source of files.toSorted((left, right) => left.path.localeCompare(right.path))) {
    if (!(source.bytes instanceof Uint8Array) || source.bytes.byteLength > MARKDOWN_MAX_ENTRY_BYTES) {
      throw new ImportExportError('limit-exceeded')
    }
    const path = normalizeRelativePath(source.path)
    const suffix = extension(path)
    const kind = DOCUMENT_EXTENSIONS.has(suffix)
      ? 'document'
      : ATTACHMENT_EXTENSIONS.has(suffix)
        ? 'attachment'
        : null
    if (kind === null) {
      skipped.push({ label: path, reason: 'unsupported-type' })
      continue
    }
    if (kind === 'document') {
      try {
        decoder.decode(source.bytes)
      } catch {
        throw new ImportExportError('unsupported-type')
      }
    }
    const alias = destinationAliasKey(path)
    if (aliases.has(alias)) throw new ImportExportError('destination-collision')
    aliases.add(alias)
    size += source.bytes.byteLength
    if (size > MARKDOWN_MAX_TOTAL_BYTES) throw new ImportExportError('limit-exceeded')
    planned.push({
      bytes: new Uint8Array(source.bytes),
      destination: path,
      kind,
      sourceKey: source.fingerprint,
    })
  }
  if (planned.length === 0) throw new ImportExportError('unsupported-type')
  const canonical = {
    files: planned.map(file => ({
      destination: file.destination,
      digest: sha256(file.bytes),
      kind: file.kind,
      sourceKey: file.sourceKey,
    })),
    skipped,
  }
  return {
    digest: sha256(stableJson(canonical)),
    files: planned,
    size,
    skipped,
    sourceEntries: files.length,
    warnings: skipped.length === 0
      ? []
      : [`${String(skipped.length)} unsupported or unsafe source ${skipped.length === 1 ? 'entry' : 'entries'} will not be imported.`],
  }
}

export function planMarkdownFolder(files: InspectedSourceFile[]): PlannedSourceResult {
  return planMarkdown(files)
}

export function planMarkdownZip(bytes: Uint8Array, signal?: AbortSignal): PlannedSourceResult {
  const entries = parseZip(bytes, MARKDOWN_ARCHIVE_LIMITS, signal === undefined ? {} : { signal })
  return planMarkdown(entries.map(entry => ({
    bytes: entry.bytes,
    fingerprint: `${entry.path}:${sha256(entry.bytes)}`,
    path: entry.path,
  })))
}
