import { isSafeVaultRelativePath } from './session.ts'

export const MAX_EMBED_TARGETS = 100
export const MAX_EMBED_CONTENT_BYTES = 2_000_000
export const MAX_EMBED_DEPTH = 3
export const MAX_EMBED_TOTAL_BYTES = 25 * 1024 * 1024
export const MAX_EMBED_MEDIA_BYTES = 64 * 1024 * 1024
export const MAX_EMBED_WARNINGS = 32

export type EmbedKind = 'base' | 'canvas' | 'media' | 'note'
export interface EmbedTarget {
  display: string | null
  fragment: string | null
  kind: EmbedKind
  path: string
  source: string
}

export interface ResolvedEmbedNode {
  content: string
  depth?: number
  mimeType?: string
  parentPath?: string
  target: EmbedTarget
}

export type EmbedResolutionStatus = 'cancelled' | 'ready' | 'stale'

export interface EmbedResolutionResult {
  embeds: readonly ResolvedEmbedNode[]
  status: EmbedResolutionStatus
  truncated: boolean
  warnings: readonly string[]
}

interface EmbedIndexEntry {
  aliases?: readonly string[]
  kind?: string
  name?: string
  path: string
}

export interface EmbedDocumentResult {
  content: string
  generation?: number
  path?: string
  revision?: string
}

export interface EmbedAttachmentResult {
  dataBase64: string
  generation?: number
  mimeType: string
  path?: string
}

export interface EmbedResolverOptions {
  entries: readonly EmbedIndexEntry[]
  isCurrent?: () => boolean
  maxDepth?: number
  maxMediaBytes?: number
  maxNodes?: number
  maxTotalBytes?: number
  readAttachment(path: string, signal: AbortSignal): Promise<EmbedAttachmentResult>
  readDocument(path: string, signal: AbortSignal): Promise<EmbedDocumentResult>
  signal?: AbortSignal
  source: string
}

function kind(path: string): EmbedKind | null {
  if (/\.canvas$/iu.test(path)) return 'canvas'
  if (/\.base$/iu.test(path)) return 'base'
  if (/\.(?:3gp|avif|bmp|flac|gif|ico|jpe?g|m4a|mkv|mp3|mov|mp4|ogv|ogg|pdf|png|svg|wav|weba|webm|webp)$/iu.test(path)) return 'media'
  if (/\.(?:markdown|md)$/iu.test(path) || !/\.[^/]+$/u.test(path)) return 'note'
  return null
}

function codeSpans(line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const match of line.matchAll(/(`+)([^`]*?)\1/gu)) {
    if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length])
  }
  return ranges
}

function escapedAt(line: string, index: number): boolean {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) slashes += 1
  return slashes % 2 === 1
}

export function collectEmbedTargets(source: string): EmbedTarget[] {
  if (new TextEncoder().encode(source).byteLength > MAX_EMBED_CONTENT_BYTES) throw new Error('Embed source exceeds the content limit.')
  const targets: EmbedTarget[] = []
  const lines = source.split(/\r?\n/u)
  let fence: { character: string; length: number } | null = null
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1]
    if (marker !== undefined) {
      if (fence === null) fence = { character: marker[0]!, length: marker.length }
      else if (marker[0] === fence.character && marker.length >= fence.length && /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(line)) fence = null
      continue
    }
    if (fence !== null) continue
    const code = codeSpans(line)
    for (const match of line.matchAll(/!\[\[([^\]\r\n]{1,4096})\]\]/gu)) {
      if (match.index === undefined || code.some(([start, end]) => match.index! >= start && match.index! < end) || escapedAt(line, match.index)) continue
      const [rawTarget, displayPart] = match[1]!.split('|', 2)
      const targetPart = rawTarget ?? ''
      const hash = targetPart.indexOf('#')
      const path = (hash < 0 ? targetPart : targetPart.slice(0, hash)).trim()
      const fragment = hash < 0 ? null : targetPart.slice(hash + 1).trim() || null
      const targetKind = kind(path)
      const normalizedPath = targetKind === 'note' && !/\.(?:markdown|md)$/iu.test(path) ? `${path}.md` : path
      if (targetKind === null || !isSafeVaultRelativePath(normalizedPath)) continue
      targets.push({
        display: displayPart?.trim() || null,
        fragment,
        kind: targetKind,
        path: normalizedPath.replaceAll('\\', '/'),
        source: match[0],
      })
      if (targets.length > MAX_EMBED_TARGETS) throw new Error('Embed target limit exceeded.')
    }
  }
  return targets
}

function normalizeIdentifier(value: string): string {
  try {
    return decodeURIComponent(value).trim().replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\s+$/u, '').toLocaleLowerCase()
  } catch {
    return value.trim().replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\s+$/u, '').toLocaleLowerCase()
  }
}

function withoutExtension(value: string): string {
  return value.replace(/\.(?:markdown|md)$/iu, '')
}

function entryIdentifiers(entry: EmbedIndexEntry): Set<string> {
  const values = [entry.path, entry.name ?? '', withoutExtension(entry.path), ...(entry.aliases ?? [])]
  return new Set(values.map(normalizeIdentifier).filter(Boolean))
}

/** Resolve an authored path exactly before falling back to one unambiguous basename or alias. */
export function resolveEmbedTargetPath(entries: readonly EmbedIndexEntry[], targetPath: string): string | null {
  const wanted = normalizeIdentifier(targetPath)
  if (!wanted) return null
  const exact = entries.find(entry => normalizeIdentifier(entry.path) === wanted)
  if (exact !== undefined) return exact.path
  const extensionless = normalizeIdentifier(withoutExtension(targetPath))
  const exactStem = entries.filter(entry => normalizeIdentifier(withoutExtension(entry.path)) === extensionless)
  if (exactStem.length === 1) return exactStem[0]!.path
  const basename = wanted.split('/').at(-1)
  if (basename === undefined) return null
  const basenameStem = normalizeIdentifier(withoutExtension(basename))
  const matches = entries.filter(entry => {
    const identifiers = entryIdentifiers(entry)
    const entryBasename = normalizeIdentifier(entry.path.split('/').at(-1) ?? entry.path)
    const entryBasenameStem = normalizeIdentifier(withoutExtension(entryBasename))
    return identifiers.has(wanted) || identifiers.has(extensionless) || identifiers.has(basename)
      || identifiers.has(basenameStem) || entryBasename === basename || entryBasenameStem === basenameStem
  })
  return matches.length === 1 ? matches[0]?.path ?? null : null
}

function codeLines(source: string): Set<number> {
  const lines = source.replace(/\r\n?/gu, '\n').split('\n')
  const result = new Set<number>()
  let fence: { character: string; length: number } | null = null
  lines.forEach((line, index) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u)
    const marker = match?.[1]
    if (fence !== null) {
      result.add(index)
      if (marker !== undefined && marker[0] === fence.character && marker.length >= fence.length && (match?.[2] ?? '').trim() === '') fence = null
      return
    }
    if (marker !== undefined) {
      result.add(index)
      fence = { character: marker[0]!, length: marker.length }
    }
  })
  return result
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') }

function stripTrailingBlockId(line: string, blockId: string): string {
  return line.replace(new RegExp(`(?:^|\\s)\\^${escapeRegExp(blockId)}(?=$|\\s)`, 'u'), ' ').replace(/\s+$/u, '').trimEnd()
}

function listMarker(line: string): { indent: number; kind: string } | null {
  const match = /^(\s*)([-*+]|\d+[.)])\s+/u.exec(line)
  if (match === null) return null
  return { indent: match[1]!.length, kind: /^\d/u.test(match[2]!) ? 'ordered' : `bullet:${match[2]!}` }
}

function extractListBlock(lines: string[], end: number): string | null {
  let start = end
  let rootIndent = Number.POSITIVE_INFINITY
  let rootKind: string | null = null
  let blanks = 0
  for (let index = end; index >= 0; index -= 1) {
    const line = lines[index]!
    if (line.trim() === '') {
      blanks += 1
      if (blanks > 1) break
      continue
    }
    blanks = 0
    const marker = listMarker(line)
    if (marker === null) {
      if (/^\s+\S/u.test(line)) continue
      break
    }
    if (marker.indent < rootIndent) {
      rootIndent = marker.indent
      rootKind = marker.kind
      start = index
    } else if (marker.indent === rootIndent) {
      if (rootKind !== marker.kind) break
      start = index
    }
  }
  return rootIndent < Number.POSITIVE_INFINITY ? lines.slice(start, end + 1).join('\n').trimEnd() : null
}

export function resolveNoteEmbedFragment(source: string, fragment: string | null): string | null {
  if (new TextEncoder().encode(source).byteLength > MAX_EMBED_CONTENT_BYTES) return null
  const body = withoutFrontmatter(source).replace(/\r\n?/gu, '\n')
  if (fragment === null) return body
  const lines = body.split('\n')
  const fenced = codeLines(body)
  if (fragment.startsWith('^')) {
    const id = fragment.slice(1).trim()
    if (!/^[A-Za-z0-9-]{1,200}$/u.test(id)) return null
    for (let index = 0; index < lines.length; index += 1) {
      if (fenced.has(index)) continue
      const line = lines[index]!
      if (new RegExp(`^\\s*\\^${escapeRegExp(id)}\\s*$`, 'u').test(line)) {
        let cursor = index - 1
        while (cursor >= 0 && lines[cursor]!.trim() === '') cursor -= 1
        if (cursor < 0) return null
        const list = extractListBlock(lines, cursor)
        if (list !== null) return list
        let start = cursor
        while (start > 0 && lines[start - 1]!.trim() !== '') start -= 1
        return lines.slice(start, index).map(row => stripTrailingBlockId(row, id)).join('\n').trimEnd()
      }
      const inline = new RegExp(`(?:^|\\s)\\^${escapeRegExp(id)}(?=$|\\s)`, 'u').exec(line)
      if (inline !== null && !escapedAt(line, inline.index)) return `${stripTrailingBlockId(line, id).trim()}\n`
    }
    return null
  }
  const wanted = normalizeIdentifier(fragment.replace(/^#+/u, '').split('#').filter(Boolean).at(-1) ?? '')
  if (!wanted) return null
  let start = -1
  let level = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (fenced.has(index)) continue
    const heading = lines[index]!.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u)
    if (heading !== null && normalizeIdentifier(heading[2]!) === wanted) {
      start = index
      level = heading[1]!.length
      break
    }
  }
  if (start < 0) return null
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (fenced.has(index)) continue
    const heading = lines[index]!.match(/^ {0,3}(#{1,6})\s+/u)
    if (heading !== null && heading[1]!.length <= level) {
      end = index
      break
    }
  }
  return `${lines.slice(start, end).join('\n').replace(/\n+$/u, '')}\n`
}

function withoutFrontmatter(source: string): string {
  if (!/^---\r?\n/u.test(source)) return source
  const lines = source.replace(/\r\n?/gu, '\n').split('\n')
  const end = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'))
  return end < 0 ? source : lines.slice(end + 1).join('\n')
}

function allowedMime(mimeType: string, target: EmbedTarget): boolean {
  const mime = mimeType.toLocaleLowerCase().split(';', 1)[0]!.trim()
  if (target.kind !== 'media') return false
  return /^image\/(?:avif|bmp|gif|jpeg|png|svg\+xml|webp)$/u.test(mime)
    || /^audio\/(?:3gpp|flac|mp4|mpeg|ogg|wav|webm)$/u.test(mime)
    || /^video\/(?:3gpp|mp4|mpeg|ogg|quicktime|webm)$/u.test(mime)
    || mime === 'application/pdf'
}

function freezeTarget(target: EmbedTarget): EmbedTarget {
  return Object.freeze({ ...target })
}

/**
 * Resolve local embed content as one bounded, cancellable graph. Reads are
 * cached by canonical path, while each occurrence keeps its own target and
 * depth so presentation modes can preserve source order. `isCurrent` is
 * checked after every await to prevent late work crossing a route identity.
 */
export async function resolveEmbedGraph(options: EmbedResolverOptions): Promise<EmbedResolutionResult> {
  const signal = options.signal ?? new AbortController().signal
  const maxDepth = Math.min(MAX_EMBED_DEPTH, Math.max(0, Math.floor(options.maxDepth ?? MAX_EMBED_DEPTH)))
  const maxNodes = Math.min(MAX_EMBED_TARGETS, Math.max(0, Math.floor(options.maxNodes ?? MAX_EMBED_TARGETS)))
  const maxTotalBytes = Math.min(MAX_EMBED_TOTAL_BYTES, Math.max(0, Math.floor(options.maxTotalBytes ?? MAX_EMBED_TOTAL_BYTES)))
  const maxMediaBytes = Math.min(MAX_EMBED_MEDIA_BYTES, Math.max(0, Math.floor(options.maxMediaBytes ?? MAX_EMBED_MEDIA_BYTES)))
  const documents = new Map<string, Promise<EmbedDocumentResult>>()
  const attachments = new Map<string, Promise<EmbedAttachmentResult>>()
  const embeds: ResolvedEmbedNode[] = []
  const warnings: string[] = []
  const seenWarnings = new Set<string>()
  let totalBytes = 0
  let mediaBytes = 0
  let truncated = false
  const warn = (message: string): void => {
    if (warnings.length >= MAX_EMBED_WARNINGS || seenWarnings.has(message)) return
    seenWarnings.add(message)
    warnings.push(message)
  }
  const current = (): boolean => options.isCurrent?.() !== false
  const check = (): void => {
    signal.throwIfAborted()
    if (!current()) throw new StaleEmbedError()
  }
  const readDocument = (path: string): Promise<EmbedDocumentResult> => {
    const cached = documents.get(path)
    if (cached !== undefined) return cached
    const promise = options.readDocument(path, signal)
    documents.set(path, promise)
    return promise
  }
  const readAttachment = (path: string): Promise<EmbedAttachmentResult> => {
    const cached = attachments.get(path)
    if (cached !== undefined) return cached
    const promise = options.readAttachment(path, signal)
    attachments.set(path, promise)
    return promise
  }
  const visit = async (target: EmbedTarget, depth: number, stack: readonly string[], parentPath?: string): Promise<void> => {
    check()
    if (embeds.length >= maxNodes) {
      truncated = true
      warn('Embed node limit reached.')
      return
    }
    const path = resolveEmbedTargetPath(options.entries, target.path)
    if (path === null) {
      warn(`Embed not found: ${target.path}`)
      return
    }
    if (stack.includes(path)) {
      warn(`Embed cycle ignored: ${path}`)
      return
    }
    try {
      if (target.kind === 'media') {
        const value = await readAttachment(path)
        check()
        if (value.path !== undefined && value.path !== path) {
          warn(`Embed path mismatch: ${path}`)
          return
        }
        if (!allowedMime(value.mimeType, target)) {
          warn(`Unsupported media type: ${path}`)
          return
        }
        const encodedBytes = new TextEncoder().encode(value.dataBase64).byteLength
        if (encodedBytes > maxMediaBytes - mediaBytes || encodedBytes > MAX_EMBED_MEDIA_BYTES) {
          truncated = true
          warn('Embed media budget reached.')
          return
        }
        mediaBytes += encodedBytes
        embeds.push({
          content: value.dataBase64,
          depth,
          mimeType: value.mimeType,
          ...(parentPath === undefined ? {} : { parentPath }),
          target: freezeTarget({ ...target, path }),
        })
        return
      }
      const value = await readDocument(path)
      check()
      if (value.path !== undefined && value.path !== path) {
        warn(`Embed path mismatch: ${path}`)
        return
      }
      if (new TextEncoder().encode(value.content).byteLength > MAX_EMBED_CONTENT_BYTES) {
        warn(`Embed content is too large: ${path}`)
        return
      }
      const content = target.kind === 'note' ? resolveNoteEmbedFragment(value.content, target.fragment) : value.content
      if (content === null) {
        warn(`Embed section not found: ${path}`)
        return
      }
      const contentBytes = new TextEncoder().encode(content).byteLength
      if (contentBytes > maxTotalBytes - totalBytes) {
        truncated = true
        warn('Embed content budget reached.')
        return
      }
      totalBytes += contentBytes
      embeds.push({
        content,
        depth,
        ...(parentPath === undefined ? {} : { parentPath }),
        target: freezeTarget({ ...target, path }),
      })
      if (depth >= maxDepth) {
        if (collectEmbedTargets(content).length > 0) warn(`Embed depth limit reached: ${path}`)
        return
      }
      for (const child of collectEmbedTargets(content)) await visit(child, depth + 1, [...stack, path], path)
    } catch (error) {
      if (error instanceof StaleEmbedError) throw error
      if (signal.aborted) throw error
      warn(`Embed could not be read: ${path}`)
    }
  }
  try {
    for (const target of collectEmbedTargets(options.source)) await visit(target, 0, [])
    check()
    return { embeds: Object.freeze(embeds.map(embed => Object.freeze(embed))), status: 'ready', truncated, warnings: Object.freeze([...warnings]) }
  } catch (error) {
    if (signal.aborted) return { embeds: Object.freeze([]), status: 'cancelled', truncated, warnings: Object.freeze([...warnings]) }
    if (error instanceof StaleEmbedError) return { embeds: Object.freeze([]), status: 'stale', truncated, warnings: Object.freeze([...warnings]) }
    throw error
  }
}

class StaleEmbedError extends Error {}

/** Alias kept short for consumers that treat this operation as a resolver. */
export const resolveEmbeds = resolveEmbedGraph
