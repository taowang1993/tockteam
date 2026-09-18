import { expandTemplate } from './capture.ts'
import { isSafeVaultRelativePath } from './session.ts'

export type ComposerLeftover = 'link' | 'embed' | 'none'

function appendBlock(source: string, block: string, prepend = false): string {
  if (prepend) return `${block.replace(/\s+$/u, '')}\n\n${source.replace(/^\s+/u, '')}`
  const separator = source === '' || /(?:\r\n|[\r\n]){2}$/u.test(source) ? '' : /(?:\r\n|[\r\n])$/u.test(source) ? '\n' : '\n\n'
  return `${source}${separator}${block.replace(/^\s+/u, '')}`
}

function link(path: string, label: string, kind: ComposerLeftover): string {
  if (kind === 'none') return ''
  if (kind === 'embed') return `![[${path}]]`
  return `[[${path}|${label.replace(/[\[\]|\r\n]/gu, ' ').trim().slice(0, 200) || path}]]`
}

export function extractSelectionToNote(input: {
  destinationPath: string
  destinationTitle: string
  end: number
  leftover: ComposerLeftover
  source: string
  sourceTitle: string
  start: number
  template?: string
}): { destinationContent: string; sourceContent: string } {
  if (!isSafeVaultRelativePath(input.destinationPath) || !/\.md$/iu.test(input.destinationPath)) throw new Error('Composer destination is invalid.')
  if (!Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.end) || input.start < 0 || input.end <= input.start || input.end > input.source.length) throw new Error('Composer selection is invalid.')
  const selected = input.source.slice(input.start, input.end)
  const replacement = link(input.destinationPath, selected, input.leftover)
  const destinationContent = input.template === undefined
    ? `${selected.replace(/^\s+|\s+$/gu, '')}\n`
    : expandTemplate(input.template, {
        content: selected.replace(/^\s+|\s+$/gu, ''),
        fromTitle: input.sourceTitle,
        now: new Date(),
        title: input.destinationTitle,
      }).replace(/\s+$/u, '')
  return {
    destinationContent,
    sourceContent: `${input.source.slice(0, input.start)}${replacement}${input.source.slice(input.end)}`,
  }
}

export function mergeNotes(input: {
  destination: string
  destinationPath: string
  leftover: ComposerLeftover
  placement: 'append' | 'prepend'
  source: string
  sourcePath: string
}): { destinationContent: string; sourceContent: string } {
  if (!isSafeVaultRelativePath(input.destinationPath) || !isSafeVaultRelativePath(input.sourcePath) || input.destinationPath === input.sourcePath) throw new Error('Composer merge paths are invalid.')
  return {
    destinationContent: appendBlock(input.destination, input.source, input.placement === 'prepend'),
    sourceContent: `${link(input.destinationPath, input.destinationPath.replace(/\.md$/iu, ''), input.leftover)}\n`,
  }
}

export interface FormatConversionOptions {
  deprecatedProperties?: boolean
  roamBear?: boolean
  zettelkasten?: ReadonlyMap<string, string>
}

function convertFrontmatter(lines: string[]): void {
  if (lines[0] !== '---') return
  const end = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'))
  if (end < 0) return
  const replacements = new Map([['alias', 'aliases'], ['tag', 'tags'], ['cssclass', 'cssclasses']])
  for (let index = 1; index < end; index += 1) {
    const match = lines[index]?.match(/^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/u)
    const replacement = match === null || match === undefined ? undefined : replacements.get(match[1]!.toLocaleLowerCase())
    if (replacement !== undefined) lines[index] = `${replacement}:${match![2]}`
  }
}

export function convertMarkdownFormats(source: string, options: FormatConversionOptions): string {
  if (new TextEncoder().encode(source).byteLength > 2_000_000) throw new Error('Format conversion source is too large.')
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const finalEol = /(?:\r\n|[\r\n])$/u.test(source)
  const lines = source.split(/\r?\n/u)
  if (finalEol) lines.pop()
  if (options.deprecatedProperties === true) convertFrontmatter(lines)
  let fence: { character: string; length: number } | null = null
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]!
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1]
    if (marker !== undefined) {
      if (fence === null) fence = { character: marker[0]!, length: marker.length }
      else if (marker[0] === fence.character && marker.length >= fence.length && /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(line)) fence = null
      continue
    }
    if (fence !== null) continue
    if (options.roamBear === true) {
      line = line.replace(/^(\s*[-+*]\s+)TODO\s+/u, '$1[ ] ')
      line = line.replace(/\^\^([^\r\n^]{1,100000})\^\^/gu, '==$1==')
    }
    if (options.zettelkasten !== undefined) {
      line = line.replace(/\[\[(\d{8,14})\]\]/gu, (original, uid: string) => {
        const path = options.zettelkasten?.get(uid)
        return path !== undefined && isSafeVaultRelativePath(path) ? `[[${path}|${uid}]]` : original
      })
    }
    lines[index] = line
  }
  return `${lines.join(eol)}${finalEol ? eol : ''}`
}
