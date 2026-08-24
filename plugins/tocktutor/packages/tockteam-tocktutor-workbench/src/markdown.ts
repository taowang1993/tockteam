import type { EditorMode } from './session.ts'

export const MAX_MARKDOWN_BYTES = 1_000_000
export const MAX_MARKDOWN_LINES = 10_000
export const MAX_MARKDOWN_LINE_LENGTH = 16_384
export const MAX_READING_BLOCKS = 4_096

export type EditorStatus = 'saved' | 'unsaved' | 'saving' | 'save-failed'
export type EditorShortcut = 'save' | 'command-palette' | 'delete-line' | 'simplify-selection'

export interface ReadingLink {
  label: string
  href: string | null
  inert: boolean
  resource: boolean
}

export type ReadingBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string; links: ReadingLink[] }
  | { kind: 'task'; index: number; text: string; checked: boolean }
  | { kind: 'code'; language: string; text: string }

export type ReadingProjection =
  | { status: 'ready'; source: string; blocks: ReadingBlock[]; warnings: string[] }
  | { status: 'unsupported'; reason: string }

interface SourceLine {
  text: string
  start: number
}

interface TaskLocation {
  index: number
  markerStart: number
  marker: string
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username === ''
      && url.password === ''
  } catch {
    return false
  }
}

function sourceLines(source: string): SourceLine[] {
  const result: SourceLine[] = []
  let start = 0
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character !== '\n' && character !== '\r') continue
    result.push({ text: source.slice(start, index), start })
    if (character === '\r' && source[index + 1] === '\n') index += 1
    start = index + 1
  }
  result.push({ text: source.slice(start), start })
  return result
}

function maskComments(line: string, open: boolean): { text: string; open: boolean } {
  const chars = line.split('')
  let cursor = 0
  let inside = open
  while (cursor < line.length) {
    const marker = line.indexOf('%%', cursor)
    if (marker < 0) {
      if (inside) for (let index = cursor; index < line.length; index += 1) chars[index] = ' '
      break
    }
    if (inside) {
      for (let index = cursor; index < marker + 2; index += 1) chars[index] = ' '
      inside = false
    } else {
      for (let index = marker; index < marker + 2; index += 1) chars[index] = ' '
      inside = true
    }
    cursor = marker + 2
  }
  return { text: chars.join(''), open: inside }
}

function fence(value: string): { marker: string; rest: string } | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(value)
  return match === null ? null : { marker: match[1]!, rest: match[2]! }
}

function taskMatch(value: string): { prefix: string; marker: string; body: string } | null {
  const match = /^(\s*[-*+]\s+)\[([^\]\n])\](?:\s+)(.*)$/u.exec(value)
  return match === null
    ? null
    : { prefix: match[1]!, marker: match[2]!, body: match[3]! }
}

function taskLocations(source: string): TaskLocation[] {
  const locations: TaskLocation[] = []
  let commentOpen = false
  let fenceMarker: string | null = null
  for (const line of sourceLines(source)) {
    const masked = maskComments(line.text, commentOpen)
    commentOpen = masked.open
    const fenceMatch = fence(masked.text)
    if (fenceMarker !== null) {
      if (fenceMatch !== null
        && fenceMatch.marker[0] === fenceMarker[0]
        && fenceMatch.marker.length >= fenceMarker.length
        && fenceMatch.rest.trim() === '') fenceMarker = null
      continue
    }
    if (fenceMatch !== null) {
      fenceMarker = fenceMatch.marker
      continue
    }
    const match = taskMatch(masked.text)
    if (match === null) continue
    locations.push({
      index: locations.length,
      markerStart: line.start + match.prefix.length,
      marker: match.marker,
    })
  }
  return locations
}

function inlineLinks(text: string): ReadingLink[] {
  const links: ReadingLink[] = []
  const pattern = /(!?)\[([^\]\n]{0,512})\]\(([^)\n]{1,4096})\)/gu
  for (const match of text.matchAll(pattern)) {
    const resource = match[1] === '!'
    const label = match[2] ?? ''
    const target = match[3]?.trim() ?? ''
    const safe = !resource && isSafeExternalUrl(target)
    links.push({
      label,
      href: safe ? target : null,
      inert: !safe,
      resource,
    })
  }
  return links
}

function containsUnsafeMarkup(text: string): boolean {
  return /<\/?(?:script|style|iframe|object|embed|form|img|audio|video|svg|link|meta)\b[^>]*>/iu.test(text)
}

function displayText(text: string): string {
  return text.replace(/^\s*[-*+]\s+/u, '').replace(/^\s*\d+[.)]\s+/u, '')
}

export function projectReading(source: string): ReadingProjection {
  if (new TextEncoder().encode(source).byteLength > MAX_MARKDOWN_BYTES) {
    return { status: 'unsupported', reason: 'Markdown document exceeds the reading limit.' }
  }
  const lines = sourceLines(source)
  if (lines.length > MAX_MARKDOWN_LINES || lines.some(line => line.text.length > MAX_MARKDOWN_LINE_LENGTH)) {
    return { status: 'unsupported', reason: 'Markdown document exceeds the line limit.' }
  }

  const blocks: ReadingBlock[] = []
  const warnings: string[] = []
  let commentOpen = false
  let fenceMarker: string | null = null
  let fenceLanguage = ''
  let fenceLines: string[] = []
  let paragraph: string[] = []
  let taskIndex = 0

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    const text = paragraph.join('\n').trim()
    paragraph = []
    if (text === '') return
    if (containsUnsafeMarkup(text)) warnings.push('Unsafe HTML is inert in Reading view.')
    const links = inlineLinks(text)
    if (links.some(link => link.inert)) warnings.push('Local, credential-bearing, or resource links remain inert.')
    blocks.push({ kind: 'paragraph', text, links })
  }

  for (const line of lines) {
    const masked = maskComments(line.text, commentOpen)
    commentOpen = masked.open
    const visible = masked.text
    const fenceMatch = fence(visible)
    if (fenceMarker !== null) {
      if (fenceMatch !== null
        && fenceMatch.marker[0] === fenceMarker[0]
        && fenceMatch.marker.length >= fenceMarker.length
        && fenceMatch.rest.trim() === '') {
        blocks.push({ kind: 'code', language: fenceLanguage, text: fenceLines.join('\n') })
        if (blocks.length > MAX_READING_BLOCKS) return { status: 'unsupported', reason: 'Reading projection exceeds the block limit.' }
        fenceMarker = null
        fenceLanguage = ''
        fenceLines = []
      } else {
        fenceLines.push(line.text)
      }
      continue
    }
    if (fenceMatch !== null) {
      flushParagraph()
      fenceMarker = fenceMatch.marker
      fenceLanguage = fenceMatch.rest.trim().split(/\s+/u)[0] ?? ''
      fenceLines = []
      continue
    }

    const trimmed = visible.trim()
    if (trimmed === '') {
      flushParagraph()
      continue
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/u.exec(trimmed)
    if (heading !== null) {
      flushParagraph()
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]! })
      continue
    }
    const task = taskMatch(visible)
    if (task !== null) {
      flushParagraph()
      blocks.push({
        kind: 'task',
        index: taskIndex,
        text: task.body,
        checked: task.marker !== ' ',
      })
      taskIndex += 1
      continue
    }
    paragraph.push(displayText(visible))
  }
  if (fenceMarker !== null) {
    blocks.push({ kind: 'code', language: fenceLanguage, text: fenceLines.join('\n') })
    warnings.push('Unclosed code fence remains a literal code block.')
  } else {
    flushParagraph()
  }
  if (blocks.length > MAX_READING_BLOCKS) return { status: 'unsupported', reason: 'Reading projection exceeds the block limit.' }
  return { status: 'ready', source, blocks, warnings: [...new Set(warnings)] }
}

export function toggleMarkdownTask(source: string, taskIndex: number): string {
  if (!Number.isSafeInteger(taskIndex) || taskIndex < 0) return source
  const location = taskLocations(source).find(task => task.index === taskIndex)
  if (location === undefined) return source
  const next = location.marker === ' ' ? 'x' : ' '
  return `${source.slice(0, location.markerStart)}[${next}]${source.slice(location.markerStart + 3)}`
}

export function nextEditorMode(mode: EditorMode, lastEditingMode: 'wysiwyg' | 'source'): EditorMode {
  if (mode === 'reading') return lastEditingMode
  return mode === 'source' ? 'wysiwyg' : 'source'
}

export function resolveEditorShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  isMac: boolean,
): EditorShortcut | null {
  const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (event.altKey) return null
  if (modifier && !event.shiftKey && event.key.toLowerCase() === 's') return 'save'
  if (modifier && !event.shiftKey && event.key.toLowerCase() === 'p') return 'command-palette'
  if (modifier && event.shiftKey && event.key.toLowerCase() === 'k') return 'delete-line'
  if (!modifier && !event.shiftKey && !event.metaKey && !event.ctrlKey && event.key === 'Escape') {
    return 'simplify-selection'
  }
  return null
}

export function editorStatusLabel(status: EditorStatus): string {
  switch (status) {
    case 'saved': return 'Saved'
    case 'unsaved': return 'Unsaved'
    case 'saving': return 'Saving'
    case 'save-failed': return 'Save Failed'
  }
}

export function visualMotion(reduced: boolean): { reduced: boolean; transitionMs: number; animate: boolean } {
  return reduced
    ? { reduced: true, transitionMs: 0, animate: false }
    : { reduced: false, transitionMs: 160, animate: true }
}
