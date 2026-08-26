import { createHash } from 'node:crypto'
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
import type { InspectedSourceFile, PlannedSourceResult } from './markdown.ts'

const decoder = new TextDecoder('utf-8', { fatal: true })
const encoder = new TextEncoder()
const ACCEPTED_ASSETS = new Set([
  '3gp', 'avif', 'bmp', 'flac', 'gif', 'jpeg', 'jpg', 'm4a', 'mkv', 'mov',
  'mp3', 'mp4', 'ogg', 'ogv', 'pdf', 'png', 'wav', 'webm', 'webp',
])
const GENERAL_ARCHIVE_LIMITS: ArchiveLimits = {
  maxArchiveBytes: 500 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxDepth: 64,
  maxEntries: 20_000,
  maxEntryBytes: 50 * 1024 * 1024,
  maxFilenameBytes: 4_096,
  maxParserMs: 120_000,
  maxTotalBytes: 500 * 1024 * 1024,
}

function decode(bytes: Uint8Array, maximum: number): string {
  if (bytes.byteLength > maximum) throw new ImportExportError('limit-exceeded')
  try {
    return decoder.decode(bytes)
  } catch {
    throw new ImportExportError('unsupported-type')
  }
}

function extension(path: string): string {
  const name = path.split('/').at(-1) ?? ''
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLocaleLowerCase('en-US')
}

function stem(path: string): string {
  const name = path.split('/').at(-1) ?? path
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function safeSegment(value: string, fallback = 'Untitled'): string {
  const cleaned = value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/gu, '')
    .replace(/[\\/:*?"<>|]/gu, '-')
    .replace(/[. ]+$/gu, '')
    .replace(/^\.+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 96)
  return cleaned || fallback
}

function uniqueDestination(base: string, used: Set<string>): string {
  const normalized = normalizeRelativePath(base)
  const dot = normalized.lastIndexOf('.')
  const prefix = dot > normalized.lastIndexOf('/') ? normalized.slice(0, dot) : normalized
  const suffix = dot > normalized.lastIndexOf('/') ? normalized.slice(dot) : ''
  for (let number = 1; number <= 10_000; number += 1) {
    const candidate = number === 1 ? normalized : `${prefix}-${String(number)}${suffix}`
    const alias = destinationAliasKey(candidate)
    if (!used.has(alias)) {
      used.add(alias)
      return candidate
    }
  }
  throw new ImportExportError('limit-exceeded')
}

function finalize(
  files: PlannedFile[],
  skipped: SkippedEntry[],
  sourceEntries: number,
  warnings: string[] = [],
): PlannedSourceResult {
  if (files.length === 0) throw new ImportExportError('unsupported-type')
  files.sort((left, right) => left.destination.localeCompare(right.destination))
  skipped.sort((left, right) => left.label.localeCompare(right.label) || left.reason.localeCompare(right.reason))
  const size = files.reduce((total, file) => total + file.bytes.byteLength, 0)
  return {
    digest: sha256(stableJson({
      files: files.map(file => ({ destination: file.destination, digest: sha256(file.bytes), kind: file.kind })),
      skipped,
    })),
    files,
    size,
    skipped,
    sourceEntries,
    warnings: [
      ...warnings,
      ...(skipped.length === 0 ? [] : [`${String(skipped.length)} source ${skipped.length === 1 ? 'record is' : 'records are'} unsupported or intentionally omitted.`]),
    ],
  }
}

function yamlScalar(value: string): string {
  if (/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?)$/u.test(value) && !/^-?0\d/u.test(value)) return value
  return JSON.stringify(value)
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
      continue
    }
    if (character === '"' && field === '') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/u, ''))
      rows.push(row)
      row = []
      field = ''
    } else if (character === '\r' && source[index + 1] === '\n') {
      // The following newline closes the row.
    } else field += character
  }
  if (quoted) throw new ImportExportError('unsupported-type')
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function uniqueKeys(headers: string[]): string[] {
  const used = new Set<string>()
  return headers.map((header, index) => {
    const base = safeSegment(header.toLocaleLowerCase('en-US').replace(/\s+/gu, '-'), `column-${String(index + 1)}`)
    for (let suffix = 1; suffix <= 1_000; suffix += 1) {
      const candidate = suffix === 1 ? base : `${base}-${String(suffix)}`
      const alias = candidate.toLocaleLowerCase('en-US')
      if (!used.has(alias)) {
        used.add(alias)
        return candidate
      }
    }
    throw new ImportExportError('limit-exceeded')
  })
}

export function planCsv(bytes: Uint8Array, sourceName: string): PlannedSourceResult {
  const rows = parseCsv(decode(bytes, 2 * 1024 * 1024))
  if (rows.length < 2 || rows[0]?.every(value => value.trim() === '')) throw new ImportExportError('unsupported-type')
  const headers = rows[0]!
  if (headers.length > 200 || rows.some(row => row.length > 200)) throw new ImportExportError('limit-exceeded')
  const keys = uniqueKeys(headers)
  const titleIndex = headers.findIndex(value => /^(?:name|title)$/iu.test(value.trim()))
  const root = `Imported/${safeSegment(stem(sourceName), 'CSV Import')}`
  const batch = sha256(bytes).slice(7, 23)
  const used = new Set<string>()
  const files: PlannedFile[] = []
  const skipped: SkippedEntry[] = []
  for (const [offset, values] of rows.slice(1).entries()) {
    if (offset >= 500) {
      skipped.push({ label: `row ${String(offset + 2)}`, reason: 'row-limit' })
      continue
    }
    if (values.every(value => value.trim() === '')) continue
    const title = safeSegment(values[titleIndex < 0 ? 0 : titleIndex] ?? '', `Row ${String(offset + 1)}`)
    const destination = uniqueDestination(`${root}/${title}.md`, used)
    const properties = keys.flatMap((key, index) => {
      const value = values[index]?.trim() ?? ''
      return value === '' ? [] : [`${key}: ${yamlScalar(value)}`]
    })
    const content = [
      '---',
      `title: ${yamlScalar(title)}`,
      `import-batch: ${yamlScalar(batch)}`,
      ...properties,
      '---',
      '',
      `# ${title}`,
      '',
    ].join('\n')
    files.push({ bytes: encoder.encode(content), destination, kind: 'document', sourceKey: `row:${String(offset + 2)}` })
  }
  const baseName = safeSegment(stem(sourceName), 'CSV Import')
  files.push({
    bytes: encoder.encode([
      'filters:',
      `  - note.import-batch == ${JSON.stringify(batch)}`,
      'properties:',
      ...keys.map(key => `  note.${key}:\n    displayName: ${yamlScalar(key)}`),
      'views:',
      '  - type: table',
      `    name: ${JSON.stringify(baseName)}`,
      '    order:',
      '      - file.name',
      ...keys.map(key => `      - note.${key}`),
      '',
    ].join('\n')),
    destination: uniqueDestination(`${root}/${baseName}.base`, used),
    kind: 'document',
    sourceKey: 'generated-base',
  })
  return finalize(files, skipped, rows.length)
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/giu, (_match, decimal: string, hex: string, name: string) => {
    if (decimal) return String.fromCodePoint(Number(decimal))
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16))
    return named[name.toLocaleLowerCase('en-US')] ?? ''
  })
}

function stripResidualMarkup(value: string): string {
  return decodeEntities(value)
    .replace(/<(?:script|style|iframe|object|embed|svg)\b[^>]*>[^]*?<\/(?:script|style|iframe|object|embed|svg)>/giu, '')
    .replace(/<[^>\n]*>/gu, '')
}

function relativeSource(base: string, reference: string): string | null {
  const raw = reference.split(/[?#]/u, 1)[0] ?? ''
  let cleaned: string
  try { cleaned = decodeURIComponent(raw) } catch { return null }
  if (cleaned === '' || /^[a-z][a-z\d+.-]*:/iu.test(cleaned) || cleaned.startsWith('//') || cleaned.startsWith('/')) return null
  const stack = base.split('/').slice(0, -1)
  for (const segment of cleaned.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (stack.length === 0) return null
      stack.pop()
    } else stack.push(segment)
  }
  try {
    return normalizeRelativePath(stack.join('/'))
  } catch {
    return null
  }
}

function relativeSuffix(reference: string): string {
  const index = reference.search(/[?#]/u)
  return index < 0 ? '' : reference.slice(index).replace(/[\u0000-\u001f\u007f"'<>]/gu, '')
}

function markdownRelativePath(path: string): string {
  return path.split('/').map(segment => segment === '..' ? segment : encodeURIComponent(segment)).join('/')
}

function relativeOutput(from: string, to: string): string {
  const fromParts = from.split('/').slice(0, -1)
  const toParts = to.split('/')
  let common = 0
  while (fromParts[common] !== undefined && fromParts[common] === toParts[common]) common += 1
  return [...fromParts.slice(common).map(() => '..'), ...toParts.slice(common)].join('/') || toParts.at(-1) || to
}

function htmlMarkdown(
  html: string,
  sourcePath: string,
  outputRoot: string,
  noteMap: ReadonlyMap<string, string>,
  skipped: SkippedEntry[],
): { markdown: string; resources: string[] } {
  let value = html
    .replace(/<!--[^]*?-->/gu, '')
    .replace(/<(?:script|style|iframe|object|embed|svg)\b[^>]*>[^]*?<\/(?:script|style|iframe|object|embed|svg)>/giu, '')
  const resources: string[] = []
  const currentDestination = noteMap.get(sourcePath) ?? `${outputRoot}/Imported.md`
  const resource = (reference: string, kind: 'link' | 'media', label = ''): string => {
    const decoded = decodeEntities(reference)
    const local = relativeSource(sourcePath, decoded)
    if (local === null) {
      skipped.push({ label: reference.slice(0, 512), reason: 'remote-resource' })
      return label
    }
    resources.push(local)
    const relative = relativeOutput(currentDestination, `${outputRoot}/${local}`)
    return kind === 'media'
      ? `![[${relative}]]`
      : `[${label || local.split('/').at(-1) || 'Resource'}](${markdownRelativePath(relative)}${relativeSuffix(decoded)})`
  }
  value = value.replace(/<(audio|video)\b([^>]*)>([^]*?)<\/\1>/giu, (_match, _tag: string, attributes: string, inner: string) => {
    const reference = /\bsrc\s*=\s*["']([^"']+)["']/iu.exec(attributes)?.[1]
      ?? /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/iu.exec(inner)?.[1]
    return reference === undefined ? '' : resource(reference, 'media')
  })
  value = value.replace(/<(?:audio|video)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*\/?>/giu, (_match, reference: string) => resource(reference, 'media'))
  value = value.replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu, (_match, reference: string) => {
    const decoded = decodeEntities(reference)
    const local = relativeSource(sourcePath, decoded)
    if (local === null) {
      skipped.push({ label: reference.slice(0, 512), reason: 'remote-resource' })
      return ''
    }
    resources.push(local)
    return `![](${markdownRelativePath(relativeOutput(currentDestination, `${outputRoot}/${local}`))})`
  })
  value = value.replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([^]*?)<\/a>/giu, (_match, reference: string, label: string) => {
    const decoded = decodeEntities(reference)
    const local = relativeSource(sourcePath, decoded)
    const destination = local === null ? undefined : noteMap.get(local)
    const text = decodeEntities(label.replace(/<[^>]+>/gu, '')).trim()
    if (destination !== undefined) return `[${text}](${markdownRelativePath(relativeOutput(currentDestination, destination))}${relativeSuffix(decoded)})`
    if (local !== null) return resource(reference, 'link', text)
    return text
  })
  value = value
    .replace(/<h1\b[^>]*>([^]*?)<\/h1>/giu, '\n# $1\n')
    .replace(/<h2\b[^>]*>([^]*?)<\/h2>/giu, '\n## $1\n')
    .replace(/<h3\b[^>]*>([^]*?)<\/h3>/giu, '\n### $1\n')
    .replace(/<li\b[^>]*>([^]*?)<\/li>/giu, '\n- $1')
    .replace(/<(?:br|hr)\s*\/?>/giu, '\n')
    .replace(/<\/(?:div|p|section|article|ul|ol)>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
  value = stripResidualMarkup(value)
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
  return { markdown: `${value}\n`, resources }
}

export function planHtml(files: InspectedSourceFile[], rootName: string): PlannedSourceResult {
  if (files.length === 0 || files.length > 500) throw new ImportExportError('limit-exceeded')
  const source = new Map(files.map(file => [normalizeRelativePath(file.path), file]))
  const root = `Imported/${safeSegment(rootName, 'HTML Import')}`
  const noteMap = new Map<string, string>()
  const used = new Set<string>()
  for (const path of [...source.keys()].sort()) {
    if (extension(path) === 'html' || extension(path) === 'htm') {
      noteMap.set(path, uniqueDestination(`${root}/${path.replace(/\.(?:html?|HTML?)$/u, '.md')}`, used))
    }
  }
  const filesOut: PlannedFile[] = []
  const skipped: SkippedEntry[] = []
  const referenced = new Set<string>()
  for (const [path, destination] of noteMap) {
    const input = source.get(path)!
    const converted = htmlMarkdown(decode(input.bytes, 10 * 1024 * 1024), path, root, noteMap, skipped)
    converted.resources.forEach(resource => referenced.add(resource))
    filesOut.push({ bytes: encoder.encode(converted.markdown), destination, kind: 'document', sourceKey: input.fingerprint })
  }
  for (const path of [...referenced].sort()) {
    const input = source.get(path)
    if (input === undefined || !ACCEPTED_ASSETS.has(extension(path))) {
      skipped.push({ label: path, reason: 'unsupported-resource' })
      continue
    }
    if (input.bytes.byteLength > 10 * 1024 * 1024) {
      skipped.push({ label: path, reason: 'limit-exceeded' })
      continue
    }
    filesOut.push({ bytes: new Uint8Array(input.bytes), destination: uniqueDestination(`${root}/${path}`, used), kind: 'attachment', sourceKey: input.fingerprint })
  }
  return finalize(filesOut, skipped, files.length)
}

export function planHtmlZip(bytes: Uint8Array, rootName: string): PlannedSourceResult {
  const entries = parseZip(bytes, {
    ...GENERAL_ARCHIVE_LIMITS,
    maxArchiveBytes: 50 * 1024 * 1024,
    maxEntries: 500,
    maxEntryBytes: 10 * 1024 * 1024,
    maxTotalBytes: 100 * 1024 * 1024,
  })
  return planHtml(entries.map(entry => ({
    bytes: entry.bytes,
    fingerprint: `${entry.path}:${sha256(entry.bytes)}`,
    path: entry.path,
  })), rootName)
}

function classHtml(html: string, className: string): string[] {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return [...html.matchAll(new RegExp(`<([a-z][\\w:-]*)\\b[^>]*class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([^]*?)<\\/\\1>`, 'giu'))]
    .map(match => match[2] ?? '')
}

function classText(html: string, className: string): string[] {
  return classHtml(html, className).flatMap(raw => {
    const value = stripResidualMarkup(raw.replace(/<[^>]+>/gu, '')).replace(/\s+/gu, ' ').trim()
    return value === '' ? [] : [value]
  })
}

const JOURNAL_MONTHS = new Map([
  ['january', 1], ['february', 2], ['march', 3], ['april', 4], ['may', 5], ['june', 6],
  ['july', 7], ['august', 8], ['september', 9], ['october', 10], ['november', 11], ['december', 12],
])
const JOURNAL_ASSET_ALIASES = new Map([['generic-map', 'location'], ['multi-pin-map', 'location']])
const JOURNAL_IGNORED_ASSETS = new Set(['live-photo', 'photo', 'video'])
const JOURNAL_OVERLAY_CLASSES = ['activityMetrics', 'activityMetricsCalories', 'activityMetricsDistance', 'activityMetricsDuration', 'activityType', 'gridItemOverlayFooter', 'gridItemOverlayHeader', 'gridItemOverlayText', 'mediaArtist', 'mediaCategory', 'mediaTitle']

function journalDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  let year: number
  let month: number
  let day: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  const long = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/u.exec(value)
  if (iso !== null) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3])
  } else if (long !== null) {
    day = Number(long[1]); month = JOURNAL_MONTHS.get((long[2] ?? '').toLocaleLowerCase('en-US')) ?? 0; year = Number(long[3])
  } else return undefined
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function journalFragment(html: string): string {
  return stripResidualMarkup(decodeEntities(html
    .replace(/<(?:script|style)\b[^>]*>[^]*?<\/(?:script|style)>/giu, '')
    .replace(/<!--[^]*?-->/gu, '')
    .replace(/<(strong|b)\b[^>]*>([^]*?)<\/\1>/giu, '**$2**')
    .replace(/<(em|i)\b[^>]*>([^]*?)<\/\1>/giu, '*$2*')
    .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^]*?)<\/a>/giu, '[$2]($1)')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')))
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function journalMetadata(html: string): Map<string, Set<string>> {
  const metadata = new Map<string, Set<string>>()
  const itemPattern = /<([a-z][\w:-]*)\b([^>]*\bclass=["'][^"']*\bgridItem\b[^"']*\bassetType_([A-Za-z][A-Za-z0-9_-]*)\b[^"']*["'][^>]*)>([^]*?)<\/\1>/giu
  for (const match of html.matchAll(itemPattern)) {
    const rawType = match[3] ?? ''
    const normalized = rawType.replace(/(\w)([A-Z])/gu, '$1-$2').replace(/_/gu, '-').toLocaleLowerCase('en-US').replace(/-+/gu, '-').replace(/^-+|-+$/gu, '')
    const key = JOURNAL_ASSET_ALIASES.get(normalized) ?? normalized
    if (!/^[a-z][a-z0-9-]*$/u.test(key) || JOURNAL_IGNORED_ASSETS.has(key)) continue
    const inner = match[4] ?? ''
    const tokens = new Set<string>()
    for (const className of JOURNAL_OVERLAY_CLASSES) {
      for (const value of classText(inner, className)) for (const token of value.split(',')) if (token.trim() !== '') tokens.add(token.trim())
    }
    for (const attribute of inner.matchAll(/\s(?:aria-label|title|alt)\s*=\s*["']([^"']+)["']/giu)) {
      for (const token of decodeEntities(attribute[1] ?? '').split(',')) if (token.trim() !== '') tokens.add(token.trim())
    }
    if (tokens.size === 0) continue
    const values = metadata.get(key) ?? new Set<string>()
    for (const token of tokens) if (values.size < 100) values.add(token.slice(0, 512))
    metadata.set(key, values)
    if (metadata.size >= 64) break
  }
  return metadata
}

export function planAppleJournal(files: InspectedSourceFile[]): PlannedSourceResult {
  const used = new Set<string>()
  const output: PlannedFile[] = []
  const skipped: SkippedEntry[] = []
  for (const file of files) {
    if (!/\.html?$/iu.test(file.path)) continue
    const html = decode(file.bytes, 10 * 1024 * 1024)
    const date = journalDate(classText(html, 'pageHeader')[0])
    const metadata = journalMetadata(html)
    const prompt = classText(html, 'reflectionPrompt')[0]
    const body = [...classHtml(html, 'p2'), ...classHtml(html, 'p3')]
      .map(value => journalFragment(value)).filter(Boolean)
    const frontmatter = [
      ...(date === undefined ? [] : [`date: ${date}`]),
      ...[...metadata].flatMap(([key, values]) => [`${key}:`, ...[...values].map(value => `  - ${JSON.stringify(value)}`)]),
    ]
    const sections = [prompt, ...body].filter((value): value is string => value !== undefined && value !== '')
    const content = `${frontmatter.length === 0 ? '' : `---\n${frontmatter.join('\n')}\n---\n\n`}${sections.join('\n\n')}${sections.length === 0 ? '' : '\n'}`
    const destination = uniqueDestination(`Journal/${safeSegment(stem(file.path))}.md`, used)
    output.push({ bytes: encoder.encode(content), destination, kind: 'document', sourceKey: file.fingerprint })
    if (/data-asset-type=["'](?:photo|video|live-photo)["']/iu.test(html) || /\bassetType_(?:photo|video|live[-_]?[Pp]hoto)\b/u.test(html)) {
      skipped.push({ label: `${file.path} media`, reason: 'unsupported-media' })
    }
  }
  return finalize(output, skipped, files.length)
}

interface RoamBlock { children?: RoamBlock[]; string?: string }

function roamBlocks(blocks: RoamBlock[], depth: number, count: { value: number }): string[] {
  if (depth > 64) throw new ImportExportError('limit-exceeded')
  const lines: string[] = []
  for (const block of blocks) {
    count.value += 1
    if (count.value > 100_000) throw new ImportExportError('limit-exceeded')
    const raw = typeof block.string === 'string' ? block.string : ''
    if (raw.length > 100_000) throw new ImportExportError('limit-exceeded')
    const converted = raw
      .replace(/\{\{\[\[TODO\]\]\}\}/gu, '[ ]')
      .replace(/\{\{\[\[DONE\]\]\}\}/gu, '[x]')
      .replace(/#\[\[([^\]]+)\]\]/gu, '#$1')
      .replace(/\[\[([^\]]+)\]\]/gu, '[[$1]]')
      .replace(/\^\^([^]+?)\^\^/gu, '==$1==')
    lines.push(`${'  '.repeat(depth)}- ${converted}`)
    if (Array.isArray(block.children)) lines.push(...roamBlocks(block.children, depth + 1, count))
  }
  return lines
}

export function planRoam(bytes: Uint8Array): PlannedSourceResult {
  const source = decode(bytes, 25 * 1024 * 1024)
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new ImportExportError('unsupported-type') }
  if (!Array.isArray(value) || value.length > 5_000) throw new ImportExportError('limit-exceeded')
  const used = new Set<string>()
  const files: PlannedFile[] = []
  const skipped: SkippedEntry[] = []
  const count = { value: 0 }
  for (const [index, page] of value.entries()) {
    if (page === null || typeof page !== 'object' || typeof (page as { title?: unknown }).title !== 'string') {
      skipped.push({ label: `page ${String(index + 1)}`, reason: 'malformed-page' })
      continue
    }
    const typed = page as { title: string; children?: RoamBlock[] }
    const lines = Array.isArray(typed.children) ? roamBlocks(typed.children, 0, count) : []
    const destination = uniqueDestination(`Imported/Roam Research/${safeSegment(typed.title)}.md`, used)
    files.push({ bytes: encoder.encode(`# ${typed.title}\n\n${lines.join('\n')}\n`), destination, kind: 'document', sourceKey: `page:${String(index)}` })
  }
  return finalize(files, skipped, value.length)
}

function keepTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const microseconds = Number(value)
  if (!Number.isFinite(microseconds) || microseconds < 0) return undefined
  const date = new Date(microseconds / 1_000)
  try { return date.toISOString() } catch { return undefined }
}

export function planGoogleKeep(bytes: Uint8Array): PlannedSourceResult {
  const entries = parseZip(bytes, { ...GENERAL_ARCHIVE_LIMITS, maxArchiveBytes: 200 * 1024 * 1024, maxEntries: 5_000, maxTotalBytes: 250 * 1024 * 1024 })
  const byPath = new Map(entries.map(entry => [entry.path, entry]))
  const used = new Set<string>()
  const files: PlannedFile[] = []
  const skipped: SkippedEntry[] = []
  const referenced = new Set<string>()
  const attachmentTargets = new Map<string, string>()
  let notes = 0
  for (const entry of entries) {
    if (!/(?:^|\/)Keep\/[^/]+\.json$/u.test(entry.path)) continue
    notes += 1
    if (notes > 2_000) throw new ImportExportError('limit-exceeded')
    let note: Record<string, unknown>
    try { note = JSON.parse(decode(entry.bytes, 5 * 1024 * 1024)) as Record<string, unknown> } catch { throw new ImportExportError('unsupported-type') }
    const title = safeSegment(typeof note.title === 'string' ? note.title : '', 'Untitled Keep Note')
    const labels = Array.isArray(note.labels)
      ? [...new Set(note.labels.flatMap(label => label !== null && typeof label === 'object' && typeof (label as { name?: unknown }).name === 'string'
        ? [safeSegment((label as { name: string }).name.replace(/^#+/u, '').replace(/[\s,]+/gu, '-'))]
        : []))]
      : []
    const tasks = Array.isArray(note.listContent)
      ? note.listContent.flatMap(item => {
        if (item === null || typeof item !== 'object' || typeof (item as { text?: unknown }).text !== 'string') return []
        const value = (item as { text: string }).text.trim().replace(/\s+/gu, ' ')
        return value === '' ? [] : [`- ${(item as { isChecked?: unknown }).isChecked === true ? '[x]' : '[ ]'} ${value}`]
      })
      : []
    const attachments = Array.isArray(note.attachments) ? note.attachments : []
    const attachmentLinks: string[] = []
    for (const attachment of attachments) {
      if (attachment === null || typeof attachment !== 'object' || typeof (attachment as { filePath?: unknown }).filePath !== 'string') continue
      const reference = (attachment as { filePath: string }).filePath
      const directory = entry.path.slice(0, entry.path.lastIndexOf('/') + 1)
      const path = `${directory}${reference}`
      referenced.add(path)
      const source = byPath.get(path)
      if (source === undefined || !ACCEPTED_ASSETS.has(extension(path))) {
        skipped.push({ label: path, reason: 'unsupported-attachment' })
        continue
      }
      let target = attachmentTargets.get(path)
      if (target === undefined) {
        target = uniqueDestination(`Imported/Google Keep/Attachments/${safeSegment(path.split('/').at(-1) ?? 'asset')}`, used)
        attachmentTargets.set(path, target)
        files.push({ bytes: source.bytes, destination: target, kind: 'attachment', sourceKey: path })
      }
      attachmentLinks.push(`![[${target.slice('Imported/Google Keep/'.length)}]]`)
    }
    const body = [typeof note.textContent === 'string' ? note.textContent.trim() : '', tasks.join('\n')].filter(Boolean).join('\n\n')
    const created = keepTimestamp(note.createdTimestampUsec)
    const updated = keepTimestamp(note.userEditedTimestampUsec)
    const color = typeof note.color === 'string' && /^[a-z]+$/iu.test(note.color) ? note.color.toLocaleLowerCase('en-US') : undefined
    const content = [
      '---',
      ...(created === undefined ? [] : [`created: ${yamlScalar(created)}`]),
      ...(updated === undefined ? [] : [`updated: ${yamlScalar(updated)}`]),
      ...(labels.length === 0 ? [] : ['tags:', ...labels.map(label => `  - ${safeSegment(label)}`)]),
      ...(note.isPinned === true ? ['pinned: true'] : []),
      ...(note.isArchived === true ? ['archived: true'] : []),
      ...(note.isTrashed === true ? ['trashed: true'] : []),
      ...(color === undefined ? [] : [`keep-color: ${color}`]),
      '---', '', `# ${title}`, '', body, ...attachmentLinks, '',
    ].join('\n')
    files.push({ bytes: encoder.encode(content), destination: uniqueDestination(`Imported/Google Keep/${title}.md`, used), kind: 'document', sourceKey: entry.path })
  }
  for (const entry of entries) {
    if (/(?:^|\/)Keep\/[^/]+\.json$/u.test(entry.path) || referenced.has(entry.path)) continue
    skipped.push({ label: entry.path, reason: 'unsupported-type' })
  }
  return finalize(files, skipped, entries.length)
}

export function planTextbundle(files: InspectedSourceFile[]): PlannedSourceResult {
  if (files.length > 202 || files.reduce((total, file) => total + file.bytes.byteLength, 0) > 25 * 1024 * 1024) {
    throw new ImportExportError('limit-exceeded')
  }
  const textFile = files.find(file => /(?:^|\/)text\.(?:md|markdown)$/iu.test(file.path))
  if (textFile === undefined) throw new ImportExportError('unsupported-type')
  const rootPrefix = textFile.path.slice(0, textFile.path.lastIndexOf('/') + 1)
  const info = files.find(file => file.path === `${rootPrefix}info.json`)
  if (info !== undefined) {
    let metadata: unknown
    try { metadata = JSON.parse(decode(info.bytes, 512 * 1024)) } catch { throw new ImportExportError('unsupported-type') }
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) throw new ImportExportError('unsupported-type')
    const type = (metadata as { type?: unknown }).type
    if (type !== undefined && !['net.daringfireball.markdown', 'text/markdown', 'text/x-markdown'].includes(String(type))) {
      throw new ImportExportError('unsupported-type')
    }
  }
  const bundleName = safeSegment(stem(rootPrefix.replace(/\/$/u, '') || textFile.path).replace(/\.textbundle$/iu, ''), 'Textbundle')
  const used = new Set<string>()
  const skipped: SkippedEntry[] = []
  const output: PlannedFile[] = []
  const markdown = decode(textFile.bytes, 25 * 1024 * 1024).replace(/\]\(\.\/assets\//gu, '](assets/').replace(/\]\(assets\//gu, '](assets/')
  for (const file of files) {
    if (!file.path.startsWith(`${rootPrefix}assets/`)) continue
    const relative = file.path.slice(`${rootPrefix}assets/`.length)
    if (relative.includes('/') || !ACCEPTED_ASSETS.has(extension(relative)) || file.bytes.byteLength > 10 * 1024 * 1024) {
      skipped.push({ label: `assets/${relative}`, reason: 'unsupported-type' })
      continue
    }
    output.push({ bytes: file.bytes, destination: uniqueDestination(`Imported/${bundleName}/assets/${safeSegment(relative)}`, used), kind: 'attachment', sourceKey: file.fingerprint })
  }
  output.push({ bytes: encoder.encode(`${markdown.replace(/\n*$/u, '')}\n`), destination: uniqueDestination(`Imported/${bundleName}/${bundleName}.md`, used), kind: 'document', sourceKey: textFile.fingerprint })
  return finalize(output, skipped, files.length)
}

export function planTextpack(bytes: Uint8Array): PlannedSourceResult {
  const entries = parseZip(bytes, {
    ...GENERAL_ARCHIVE_LIMITS,
    maxArchiveBytes: 25 * 1024 * 1024,
    maxDepth: 16,
    maxEntries: 202,
    maxEntryBytes: 10 * 1024 * 1024,
    maxTotalBytes: 25 * 1024 * 1024,
  })
  return planTextbundle(entries.map(entry => ({
    bytes: entry.bytes,
    fingerprint: `${entry.path}:${sha256(entry.bytes)}`,
    path: entry.path,
  })))
}

function xmlText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([^]*?)(?:\\]\\]>)?<\\/${tag}>`, 'iu').exec(xml)
  return match === null ? undefined : decodeEntities(match[1] ?? '').trim()
}

function enmlMarkdown(content: string): string {
  return stripResidualMarkup(content
    .replace(/<(?:script|style|iframe|object|svg)\b[^>]*>[^]*?<\/(?:script|style|iframe|object|svg)>/giu, '')
    .replace(/<en-media\b[^>]*\bhash=["']([0-9a-f]+)["'][^>]*\/>/giu, (_match, hash: string) => `__EN_MEDIA_${hash.toLocaleLowerCase('en-US')}__`)
    .replace(/<(?:br)\s*\/?>/giu, '\n')
    .replace(/<\/(?:div|p|li)>/giu, '\n')
    .replace(/<[^>]+>/gu, ''))
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function assertWellFormedXml(xml: string): void {
  const scrubbed = xml
    .replace(/<!\[CDATA\[[^]*?\]\]>/gu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<\?[^]*?\?>/gu, '')
  if (/<!/u.test(scrubbed)) throw new ImportExportError('unsupported-type')
  const stack: string[] = []
  let cursor = 0
  for (const match of scrubbed.matchAll(/<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*)?\s*\/?>/gu)) {
    const index = match.index ?? 0
    if (/[<>]/u.test(scrubbed.slice(cursor, index))) throw new ImportExportError('unsupported-type')
    const token = match[0]
    const name = (match[1] ?? '').toLocaleLowerCase('en-US')
    if (token.startsWith('</')) {
      if (stack.pop() !== name) throw new ImportExportError('unsupported-type')
    } else if (!token.endsWith('/>')) stack.push(name)
    cursor = index + token.length
  }
  if (stack.length !== 0 || /[<>]/u.test(scrubbed.slice(cursor))) throw new ImportExportError('unsupported-type')
}

function evernoteDate(value: string | undefined): string | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(value ?? '')
  if (match === null) return undefined
  const parts = match.slice(1).map(Number)
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = parts
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const roundTrip = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
  return roundTrip.every((part, index) => part === parts[index]) ? date.toISOString() : undefined
}

function evernoteRoot(sourceName: string): string {
  const sourceStem = stem(sourceName)
  const parts = sourceStem.split('@@@')
  const folders = parts.length === 2 && parts.every(part => part.trim() !== '')
    ? parts.map((part, index) => safeSegment(part, index === 0 ? 'Stack' : 'Notebook'))
    : [safeSegment(sourceStem, 'Evernote')]
  return `Imported/Evernote/${folders.join('/')}`
}

export function planEvernote(bytes: Uint8Array, sourceName: string): PlannedSourceResult {
  const xml = decode(bytes, 100 * 1024 * 1024)
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new ImportExportError('unsupported-type')
  assertWellFormedXml(xml)
  const noteMatches = [...xml.matchAll(/<note>([^]*?)<\/note>/giu)]
  if (noteMatches.length === 0 || noteMatches.length > 5_000) throw new ImportExportError('unsupported-type')
  const root = evernoteRoot(sourceName)
  const used = new Set<string>()
  const output: PlannedFile[] = []
  const skipped: SkippedEntry[] = []
  let resourceBytes = 0
  let resourceCount = 0
  for (const [index, match] of noteMatches.entries()) {
    const note = match[1] ?? ''
    const title = safeSegment(xmlText(note, 'title') ?? '', `Note ${String(index + 1)}`)
    let body = enmlMarkdown(xmlText(note, 'content') ?? '')
    const resources = [...note.matchAll(/<resource>([^]*?)<\/resource>/giu)]
    for (const [resourceIndex, resourceMatch] of resources.entries()) {
      resourceCount += 1
      if (resourceCount > 20_000) throw new ImportExportError('limit-exceeded')
      const resource = resourceMatch[1] ?? ''
      const mime = xmlText(resource, 'mime') ?? ''
      const data = xmlText(resource, 'data') ?? ''
      const originalName = xmlText(resource, 'file-name') ?? `resource-${String(resourceIndex + 1)}`
      const suffix = mime === 'image/png' ? 'png' : extension(originalName)
      if (!ACCEPTED_ASSETS.has(suffix) || !/^[A-Za-z\d+/=\s]+$/u.test(data)) {
        skipped.push({ label: `${title} resource ${String(resourceIndex + 1)}`, reason: 'unsupported-resource' })
        continue
      }
      const asset = Buffer.from(data.replace(/\s+/gu, ''), 'base64')
      resourceBytes += asset.byteLength
      if (asset.byteLength > 50 * 1024 * 1024 || resourceBytes > 500 * 1024 * 1024) {
        throw new ImportExportError('limit-exceeded')
      }
      const name = safeSegment(originalName.includes('.') ? originalName : `${originalName}.${suffix}`)
      const destination = uniqueDestination(`${root}/Attachments/${title}/${name}`, used)
      output.push({ bytes: new Uint8Array(asset), destination, kind: 'attachment', sourceKey: `resource:${String(index)}:${String(resourceIndex)}` })
      const hash = createHash('md5').update(asset).digest('hex')
      body = body.replaceAll(`__EN_MEDIA_${hash}__`, `![[Attachments/${title}/${name}]]`)
    }
    body = body.replace(/__EN_MEDIA_[0-9a-f]+__/gu, '')
    const tags = [...note.matchAll(/<tag>([^]*?)<\/tag>/giu)].map(tag => safeSegment(decodeEntities(tag[1] ?? '')))
    const created = evernoteDate(xmlText(note, 'created'))
    const updated = evernoteDate(xmlText(note, 'updated'))
    const sourceUrlValue = xmlText(note, 'source-url')
    const sourceUrl = sourceUrlValue !== undefined && sourceUrlValue.length <= 2_048 ? sourceUrlValue : undefined
    const content = [
      '---',
      ...(created === undefined ? [] : [`created: ${yamlScalar(created)}`]),
      ...(updated === undefined ? [] : [`updated: ${yamlScalar(updated)}`]),
      ...(sourceUrl === undefined ? [] : [`source-url: ${yamlScalar(sourceUrl)}`]),
      ...(tags.length === 0 ? [] : ['tags:', ...tags.map(tag => `  - ${tag}`)]),
      '---', '', `# ${title}`, '', body, '',
    ].join('\n')
    output.push({ bytes: encoder.encode(content), destination: uniqueDestination(`${root}/${title}.md`, used), kind: 'document', sourceKey: `note:${String(index)}` })
  }
  return finalize(output, skipped, noteMatches.length)
}

interface BearMetadata {
  archived: boolean
  archivedAt?: string
  created?: string
  id?: string
  tags: string[]
  trashed: boolean
  trashedAt?: string
  updated?: string
}

function bearDate(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const date = new Date(value)
  try { return date.toISOString() } catch { return undefined }
}

function bearMetadata(info: Record<string, unknown>): BearMetadata {
  const nested = info['net.shinyfrog.bear']
  const source = nested !== null && typeof nested === 'object' && !Array.isArray(nested) ? nested as Record<string, unknown> : info
  const archived = source.archived === true || source.archived === 1
  const trashed = source.trashed === true || source.trashed === 1
  const id = typeof source.uniqueIdentifier === 'string' && source.uniqueIdentifier.trim() !== '' ? source.uniqueIdentifier.trim() : undefined
  const tags = Array.isArray(info.tags) ? info.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const archivedAt = archived ? bearDate(source.archivedDate) : undefined
  const created = bearDate(source.creationDate ?? info.created)
  const trashedAt = trashed ? bearDate(source.trashedDate) : undefined
  const updated = bearDate(source.modificationDate ?? info.updated)
  return {
    archived,
    ...(archivedAt === undefined ? {} : { archivedAt }),
    ...(created === undefined ? {} : { created }),
    ...(id === undefined ? {} : { id }),
    tags,
    trashed,
    ...(trashedAt === undefined ? {} : { trashedAt }),
    ...(updated === undefined ? {} : { updated }),
  }
}

function transformBearMarkdown(markdown: string, transform: (text: string) => string): string {
  let fence: { length: number; marker: '`' | '~' } | null = null
  return markdown.split('\n').map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1]
    if (fence !== null) {
      if (marker?.startsWith(fence.marker) && marker.length >= fence.length && line.slice(marker.length).trim() === '') fence = null
      return line
    }
    if (marker !== undefined) {
      fence = { length: marker.length, marker: marker[0] === '`' ? '`' : '~' }
      return line
    }
    let output = ''
    let cursor = 0
    for (const code of line.matchAll(/(`+)[^]*?\1/gu)) {
      const index = code.index ?? 0
      output += transform(line.slice(cursor, index)) + code[0]
      cursor = index + code[0].length
    }
    return output + transform(line.slice(cursor))
  }).join('\n')
}

function bearWikiTarget(destination: string): string {
  return destination.slice('Imported/Bear/'.length).replace(/\.md$/iu, '')
}

function rewriteBearLinks(markdown: string, targets: ReadonlyMap<string, string>): string {
  return transformBearMarkdown(markdown, text => {
    const linked = text.replace(/\[([^\]]*)\]\(bear:\/\/x-callback-url\/open-note\?id=([A-Z0-9-]+)(?:&[^)]*)?\)/giu, (match, label: string, id: string) => {
      const target = targets.get(id.toLocaleUpperCase('en-US'))
      if (target === undefined) return match
      const alias = label.replace(/[|[\]]/gu, ' ').replace(/\s+/gu, ' ').trim() || target.split('/').at(-1) || target
      return `[[${target}|${alias}]]`
    })
    return linked.replace(/bear:\/\/x-callback-url\/open-note\?id=([A-Z0-9-]+)(?:&[^\s)]+)?/giu, (match, id: string) => {
      const target = targets.get(id.toLocaleUpperCase('en-US'))
      return target === undefined ? match : `[[${target}]]`
    })
  })
}

export function planBear(bytes: Uint8Array): PlannedSourceResult {
  const entries = parseZip(bytes, GENERAL_ARCHIVE_LIMITS)
  const byPath = new Map(entries.map(entry => [entry.path, entry]))
  const used = new Set<string>()
  const output: PlannedFile[] = []
  const skipped: SkippedEntry[] = []
  const consumed = new Set<string>()
  const notes: Array<{ destination: string; entry: (typeof entries)[number]; metadata: BearMetadata; source: string; title: string }> = []
  for (const entry of entries) {
    if (!/(?:^|\/)text\.md$/iu.test(entry.path)) continue
    consumed.add(entry.path)
    const directory = entry.path.slice(0, entry.path.lastIndexOf('/') + 1)
    const infoEntry = byPath.get(`${directory}info.json`)
    if (infoEntry !== undefined) consumed.add(infoEntry.path)
    let info: Record<string, unknown> = {}
    if (infoEntry !== undefined) {
      try { info = JSON.parse(decode(infoEntry.bytes, 512 * 1024)) as Record<string, unknown> } catch { throw new ImportExportError('unsupported-type') }
    }
    const source = decode(entry.bytes, 5 * 1024 * 1024)
    const heading = /^#\s+(.+)$/mu.exec(source)?.[1]
    const title = safeSegment(typeof info.title === 'string' ? info.title : heading ?? '', 'Bear Note')
    const metadata = bearMetadata(info)
    const folder = metadata.trashed ? 'Trash/' : metadata.archived ? 'Archive/' : ''
    const destination = uniqueDestination(`Imported/Bear/${folder}${title}.md`, used)
    notes.push({ destination, entry, metadata, source, title })
    const assetPrefix = `${directory}assets/`
    for (const asset of entries.filter(candidate => candidate.path.startsWith(assetPrefix))) {
      consumed.add(asset.path)
      if (!ACCEPTED_ASSETS.has(extension(asset.path))) {
        skipped.push({ label: asset.path, reason: 'unsupported-attachment' })
        continue
      }
      const name = safeSegment(asset.path.slice(assetPrefix.length))
      output.push({ bytes: asset.bytes, destination: uniqueDestination(`Imported/Bear/Attachments/${title}/${name}`, used), kind: 'attachment', sourceKey: asset.path })
    }
  }
  const idTargets = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const note of notes) {
    if (note.metadata.id === undefined) continue
    const id = note.metadata.id.toLocaleUpperCase('en-US')
    if (idTargets.has(id)) { idTargets.delete(id); ambiguous.add(id) } else if (!ambiguous.has(id)) idTargets.set(id, bearWikiTarget(note.destination))
  }
  for (const note of notes) {
    const metadata = note.metadata
    const frontmatter = [
      '---',
      ...(metadata.created === undefined ? [] : [`created: ${yamlScalar(metadata.created)}`]),
      ...(metadata.updated === undefined ? [] : [`updated: ${yamlScalar(metadata.updated)}`]),
      ...(metadata.tags.length === 0 ? [] : ['tags:', ...metadata.tags.map(tag => `  - ${safeSegment(tag)}`)]),
      ...(metadata.archived ? [`archived: ${metadata.archivedAt === undefined ? 'true' : yamlScalar(metadata.archivedAt)}`] : []),
      ...(metadata.trashed ? [`trashed: ${metadata.trashedAt === undefined ? 'true' : yamlScalar(metadata.trashedAt)}`] : []),
      '---', '',
    ].join('\n')
    output.push({ bytes: encoder.encode(`${frontmatter}${rewriteBearLinks(note.source.replace(/^\s*/u, ''), idTargets)}`), destination: note.destination, kind: 'document', sourceKey: note.entry.path })
  }
  for (const entry of entries) if (!consumed.has(entry.path)) skipped.push({ label: entry.path, reason: 'unsupported-record' })
  return finalize(output, skipped, entries.length)
}
