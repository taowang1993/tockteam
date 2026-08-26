import { isSafeVaultRelativePath } from './session.ts'

export const MAX_EDITOR_COMMAND_SOURCE_BYTES = 2000_000
export type EditorCommandId =
  | 'bold'
  | 'callout-tip'
  | 'delete-line'
  | 'highlight'
  | 'insert-table'
  | 'italic'
  | 'link'
  | 'strikethrough'

export interface EditorCommandResult {
  selectionEnd: number
  selectionStart: number
  source: string
}

export interface EditorSelectionRange {
  from: number
  to: number
}

export interface MultiEditorCommandResult {
  ranges: readonly EditorSelectionRange[]
  source: string
}

export type TableCommand =
  | { column: number; kind: 'align-center' | 'align-default' | 'align-left' | 'align-right' | 'delete-column' | 'sort-ascending' | 'sort-descending' }
  | { kind: 'add-row'; row: number }
  | { kind: 'delete-row' | 'move-row-down' | 'move-row-up'; row: number }

interface ShortcutLike {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function boundedRange(source: string, start: number, end: number): [number, number] {
  const safeStart = Number.isSafeInteger(start) ? Math.max(0, Math.min(start, source.length)) : 0
  const safeEnd = Number.isSafeInteger(end) ? Math.max(safeStart, Math.min(end, source.length)) : safeStart
  return [safeStart, safeEnd]
}

function replaceRange(source: string, start: number, end: number, value: string, selectOffset = 0): EditorCommandResult {
  const next = `${source.slice(0, start)}${value}${source.slice(end)}`
  if (byteLength(next) > MAX_EDITOR_COMMAND_SOURCE_BYTES) return { selectionEnd: end, selectionStart: start, source }
  return {
    selectionEnd: start + value.length - selectOffset,
    selectionStart: start + selectOffset,
    source: next,
  }
}

export function applyEditorCommand(
  source: string,
  command: EditorCommandId,
  selectionStart: number,
  selectionEnd: number,
): EditorCommandResult {
  const [start, end] = boundedRange(source, selectionStart, selectionEnd)
  const selected = source.slice(start, end)
  if (command === 'delete-line') {
    const lineStart = Math.max(source.lastIndexOf('\n', Math.max(0, start - 1)), source.lastIndexOf('\r', Math.max(0, start - 1))) + 1
    let lineEnd = source.length
    for (let index = start; index < source.length; index += 1) {
      if (source[index] !== '\n' && source[index] !== '\r') continue
      lineEnd = index + (source.startsWith('\r\n', index) ? 2 : 1)
      break
    }
    return replaceRange(source, lineStart, lineEnd, '')
  }
  if (command === 'insert-table') {
    const prefix = start > 0 && !/(?:\r\n|[\r\n]){2}$/u.test(source.slice(0, start)) ? '\n\n' : ''
    const suffix = end < source.length && !/^(?:\r\n|[\r\n]){2}/u.test(source.slice(end)) ? '\n' : ''
    const table = `${prefix}| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n${suffix}`
    return replaceRange(source, start, end, table, prefix.length + 2)
  }
  if (command === 'callout-tip') {
    const content = (selected || 'Tip').split(/\r?\n/u).map(line => `> ${line}`).join('\n')
    return replaceRange(source, start, end, `> [!tip]\n${content}\n`)
  }
  const wrappers: Record<Exclude<EditorCommandId, 'callout-tip' | 'delete-line' | 'insert-table'>, [string, string]> = {
    bold: ['**', '**'],
    highlight: ['==', '=='],
    italic: ['*', '*'],
    link: ['[', '](Target.md)'],
    strikethrough: ['~~', '~~'],
  }
  const [before, after] = wrappers[command]
  const value = `${before}${selected || 'text'}${after}`
  return {
    selectionEnd: start + before.length + (selected || 'text').length,
    selectionStart: start + before.length,
    source: `${source.slice(0, start)}${value}${source.slice(end)}`,
  }
}

/** Apply one Markdown command to every range in one atomic source transaction. */
export function applyEditorCommandToSelections(
  source: string,
  command: EditorCommandId,
  selections: readonly EditorSelectionRange[],
): MultiEditorCommandResult {
  const ranges = selections
    .map(range => {
      const [from, to] = boundedRange(source, range.from, range.to)
      return { from, to }
    })
    .sort((left, right) => left.from - right.from || left.to - right.to)
  if (ranges.length === 0) return { ranges: Object.freeze([]), source }
  if (command === 'delete-line') {
    const lines = new Map<number, { from: number; to: number }>()
    for (const range of ranges) {
      const from = Math.max(source.lastIndexOf('\n', Math.max(0, range.from - 1)), source.lastIndexOf('\r', Math.max(0, range.from - 1))) + 1
      let to = source.length
      for (let index = range.to; index < source.length; index += 1) {
        if (source[index] !== '\n' && source[index] !== '\r') continue
        to = index + (source.startsWith('\r\n', index) ? 2 : 1)
        break
      }
      lines.set(from, { from, to })
    }
    const ordered = [...lines.values()].sort((left, right) => left.from - right.from)
    let next = source
    for (const line of [...ordered].reverse()) next = `${next.slice(0, line.from)}${next.slice(line.to)}`
    return { ranges: Object.freeze(ordered.map(line => ({ from: line.from, to: Math.min(line.from, next.length) }))), source: next }
  }
  let next = source
  const result: Array<{ original: number; range: EditorSelectionRange }> = []
  for (let original = ranges.length - 1; original >= 0; original -= 1) {
    const range = ranges[original]!
    const commandResult = applyEditorCommand(next, command, range.from, range.to)
    const changed = commandResult.source !== next
    const delta = changed ? commandResult.source.length - next.length : 0
    if (changed) {
      for (const entry of result) {
        if (entry.range.from >= range.to) {
          entry.range = { from: entry.range.from + delta, to: entry.range.to + delta }
        }
      }
    }
    next = commandResult.source
    result.push({ original, range: changed
      ? { from: commandResult.selectionStart, to: commandResult.selectionEnd }
      : { from: range.from, to: range.to } })
  }
  result.sort((left, right) => left.original - right.original)
  return { ranges: Object.freeze(result.map(entry => entry.range)), source: next }
}

function parseTable(source: string): { cells: string[][]; eol: string; finalEol: boolean } | null {
  if (byteLength(source) > MAX_EDITOR_COMMAND_SOURCE_BYTES) return null
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const finalEol = /(?:\r\n|[\r\n])$/u.test(source)
  const lines = source.split(/\r?\n/u)
  if (finalEol) lines.pop()
  if (lines.length < 2) return null
  const cells = lines.map(line => line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map(cell => cell.trim()))
  const width = cells[0]?.length ?? 0
  if (width < 1 || cells.some(row => row.length !== width)) return null
  if (!cells[1]?.every(cell => /^:?-{3,}:?$/u.test(cell))) return null
  return { cells, eol, finalEol }
}

function serializeTable(cells: string[][], eol: string, finalEol: boolean): string {
  return `${cells.map(row => `| ${row.join(' | ')} |`).join(eol)}${finalEol ? eol : ''}`
}

function compareCells(left: string, right: string): number {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (left.trim() !== '' && right.trim() !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber
  }
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

export function applyTableCommand(source: string, command: TableCommand): string {
  const parsed = parseTable(source)
  if (parsed === null) return source
  const cells = parsed.cells.map(row => [...row])
  const width = cells[0]!.length
  if (command.kind === 'add-row') {
    const index = Math.max(0, Math.min(command.row, cells.length - 2)) + 2
    cells.splice(index, 0, Array.from({ length: width }, () => ''))
  } else if (command.kind === 'delete-row' || command.kind === 'move-row-down' || command.kind === 'move-row-up') {
    const index = command.row + 2
    if (index < 2 || index >= cells.length) return source
    if (command.kind === 'delete-row') cells.splice(index, 1)
    else {
      const destination = index + (command.kind === 'move-row-up' ? -1 : 1)
      if (destination < 2 || destination >= cells.length) return source
      const [row] = cells.splice(index, 1)
      if (row !== undefined) cells.splice(destination, 0, row)
    }
  } else {
    if (!('column' in command)) return source
    if (!Number.isSafeInteger(command.column) || command.column < 0 || command.column >= width) return source
    if (command.kind === 'delete-column') {
      if (width === 1) return source
      for (const row of cells) row.splice(command.column, 1)
    } else if (command.kind.startsWith('align-')) {
      const marker = command.kind === 'align-center' ? ':---:'
        : command.kind === 'align-left' ? ':---'
          : command.kind === 'align-right' ? '---:' : '---'
      cells[1]![command.column] = marker
    } else {
      const direction = command.kind === 'sort-descending' ? -1 : 1
      const rows = cells.slice(2).map((row, index) => ({ index, row }))
      rows.sort((left, right) => direction * compareCells(left.row[command.column] ?? '', right.row[command.column] ?? '') || left.index - right.index)
      cells.splice(2, cells.length - 2, ...rows.map(entry => entry.row))
    }
  }
  return serializeTable(cells, parsed.eol, parsed.finalEol)
}

const SLASH_COMMANDS = new Map<string, EditorCommandId>([
  ['/bold', 'bold'],
  ['/callout', 'callout-tip'],
  ['/highlight', 'highlight'],
  ['/italic', 'italic'],
  ['/link', 'link'],
  ['/strike', 'strikethrough'],
  ['/table', 'insert-table'],
])

export function resolveSlashCommand(value: string): EditorCommandId | null {
  return SLASH_COMMANDS.get(value.trim().toLocaleLowerCase()) ?? null
}

export function resolvePlatformEditorCommand(event: ShortcutLike, isMac: boolean): EditorCommandId | null {
  const primary = isMac ? event.metaKey : event.ctrlKey
  if (!primary || event.altKey) return null
  const key = event.key.toLocaleLowerCase()
  if (!event.shiftKey && key === 'b') return 'bold'
  if (!event.shiftKey && key === 'i') return 'italic'
  if (event.shiftKey && key === 'x') return 'strikethrough'
  if (event.shiftKey && key === 'h') return 'highlight'
  if (event.shiftKey && key === 'k') return 'delete-line'
  return null
}

export function internalLinkDropMarkdown(path: string, label?: string): string | null {
  if (!isSafeVaultRelativePath(path)) return null
  const target = path
  const safeLabel = label?.replace(/[\[\]|\r\n]/gu, '').trim().slice(0, 1_000)
  return safeLabel ? `[[${target}|${safeLabel}]]` : `[[${target}]]`
}

function codeRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const fence = /^ {0,3}(`{3,}|~{3,}).*$(?:\r?\n|\r)([\s\S]*?)^ {0,3}\1\s*$/gmu
  for (const match of source.matchAll(fence)) {
    if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length])
  }
  for (const match of source.matchAll(/`[^`\r\n]*`/gu)) {
    if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length])
  }
  return ranges
}

export function pagePreviewTargetAtOffset(
  source: string,
  offset: number,
): { fragment: string | null; path: string } | null {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.length || byteLength(source) > MAX_EDITOR_COMMAND_SOURCE_BYTES) return null
  if (codeRanges(source).some(([start, end]) => offset >= start && offset < end)) return null
  for (const match of source.matchAll(/\[\[([^\]|\r\n]{1,2000})(?:\|[^\]\r\n]{0,2000})?\]\]/gu)) {
    if (match.index === undefined || offset < match.index || offset >= match.index + match[0].length) continue
    const [path, fragment] = match[1]!.split('#', 2)
    if (!isSafeVaultRelativePath(/\.md$/iu.test(path!) ? path! : `${path!}.md`)) return null
    return { fragment: fragment?.replace(/^\^/u, '') || null, path: path! }
  }
  return null
}
