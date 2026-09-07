import {
  classifyExternalEmbed,
  externalEmbedButtonHtml,
  externalEmbedInertHtml,
} from './external-embeds.ts'
import { isSafeVaultRelativePath } from './session.ts'

// Bounded TockTeam renderer informed by Tockbot's source-detached NotesExportHtml contract.
export const MAX_RICH_MARKDOWN_BYTES = 2000_000
export const MAX_RICH_MARKDOWN_BLOCKS = 20000
export const MAX_RICH_MARKDOWN_FOOTNOTES = 1000

export interface RenderMarkdownOptions {
  /** External HTTP(S) media is inert by default; viewer mode emits a button for the isolated Web Viewer. */
  externalEmbedMode?: 'inert' | 'viewer'
  strictLineBreaks?: boolean
}

export interface StaticMarkdownEmbed {
  content: string
  mimeType?: string
  target: {
    display: string | null
    fragment: string | null
    kind: 'base' | 'canvas' | 'media' | 'note'
    path: string
    source: string
  }
}

export interface BuildMarkdownExportDocumentOptions extends RenderMarkdownOptions {
  embeds?: readonly StaticMarkdownEmbed[]
  markdown: string
  title: string
}

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function escapeMarkdownHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 4096 || trimmed.startsWith('//') || /[\u0000-\u001f\u007f]/u.test(trimmed)) return null
  if (/^(?:https?:|mailto:)/iu.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && (url.username !== '' || url.password !== '')) return null
      return url.toString()
    } catch {
      return null
    }
  }
  if (/^(?:#|\.\.?\/|\/)?[^:\s\\]+(?:[/?#][^\s\\]*)?$/u.test(trimmed) && !trimmed.split('/').includes('..')) return trimmed
  return null
}

const SAFE_RAW_TAG = /^<\/?(?:br|code|del|em|kbd|mark|s|small|strong|sub|sup|u)>$/iu
const SAFE_RAW_BLOCK_TAGS = new Set(['a', 'br', 'code', 'del', 'div', 'em', 'mark', 'p', 's', 'span', 'strong', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u'])
const SAFE_RAW_VOID_TAGS = new Set(['br'])
const RAW_HTML_BLOCK_TAGS = new Set(['div', 'p', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr'])
const ACTIVE_HTML_TAGS = new Set(['embed', 'form', 'iframe', 'link', 'math', 'meta', 'object', 'script', 'style', 'svg'])
const ACTIVE_HTML_VOID_TAGS = new Set(['link', 'meta'])
const ACTIVE_HTML_OPEN = /<\s*(embed|form|iframe|link|math|meta|object|script|style|svg)\b[^>]*>/iu

function activeHtmlClose(name: string): RegExp {
  return new RegExp(`</\\s*${name}\\s*>`, 'iu')
}

/** Remove active HTML outside fenced code without reordering the authored Markdown. */
function stripActiveHtml(markdown: string): string {
  const lines = markdown.split('\n')
  let fence: { character: string; length: number } | null = null
  let active: string | null = null
  return lines.map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)
    if (fence !== null) {
      if (marker !== null && marker[1]![0] === fence.character && marker[1]!.length >= fence.length
        && line.slice((marker.index ?? 0) + marker[1]!.length).trim() === '') fence = null
      return line
    }
    if (active === null && marker !== null) {
      fence = { character: marker[1]![0]!, length: marker[1]!.length }
      return line
    }
    let result = line
    if (active !== null) {
      const close = result.match(activeHtmlClose(active))
      if (close === null) return ''
      result = result.slice((close.index ?? 0) + close[0].length)
      active = null
    }
    while (true) {
      const open = result.match(ACTIVE_HTML_OPEN)
      if (open === null) break
      const name = open[1]!.toLocaleLowerCase()
      if (!ACTIVE_HTML_TAGS.has(name)) break
      const start = open.index ?? 0
      if (ACTIVE_HTML_VOID_TAGS.has(name) || /\/\s*>$/u.test(open[0])) {
        result = result.slice(0, start) + result.slice(start + open[0].length)
        continue
      }
      const close = result.match(activeHtmlClose(name))
      if (close === null) {
        result = result.slice(0, start)
        active = name
        break
      }
      result = result.slice(0, start) + result.slice((close.index ?? 0) + close[0].length)
    }
    return result.replace(/<\/\s*(?:embed|form|iframe|math|object|script|style|svg)\s*>/giu, '')
  }).join('\n')
}

function rawHtmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of source.matchAll(/([A-Za-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gu)) {
    const name = match[1]?.toLocaleLowerCase()
    if (name !== undefined) attributes[name] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attributes
}

function sanitizeRawHtmlTag(tag: string): string {
  const match = tag.match(/^<\s*(\/)?\s*([A-Za-z][\w:-]*)([^>]*)>$/u)
  if (match === null) return escapeMarkdownHtml(tag)
  const closing = match[1] !== undefined
  const name = match[2]!.toLocaleLowerCase()
  if (!SAFE_RAW_BLOCK_TAGS.has(name)) return ''
  if (closing) return SAFE_RAW_VOID_TAGS.has(name) ? '' : `</${name}>`
  if (SAFE_RAW_VOID_TAGS.has(name)) return `<${name}>`
  const attrs = rawHtmlAttributes(match[3] ?? '')
  const safe: string[] = []
  if (attrs.class !== undefined && /^[A-Za-z0-9 _-]{1,200}$/u.test(attrs.class)) safe.push(`class="${escapeMarkdownHtml(attrs.class.trim())}"`)
  if (attrs.title !== undefined && attrs.title.length <= 200) safe.push(`title="${escapeMarkdownHtml(attrs.title)}"`)
  if (name === 'a' && attrs.href !== undefined) {
    const href = safeUrl(attrs.href)
    if (href !== null) safe.push(`href="${escapeMarkdownHtml(href)}" rel="noopener noreferrer"`)
  }
  for (const attribute of ['colspan', 'rowspan', 'width', 'height'] as const) {
    if (attrs[attribute] !== undefined && /^\d{1,4}$/u.test(attrs[attribute])) safe.push(`${attribute}="${attrs[attribute]}"`)
  }
  return `<${name}${safe.length === 0 ? '' : ` ${safe.join(' ')}`}>`
}

function renderSafeRawHtmlBlock(source: string): string | null {
  if (bytes(source) > 100_000 || !/^\s*</u.test(source)) return null
  const withoutActive = source
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(?:script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?(?:<\/\s*(?:script|style|iframe|object|embed|form|svg|math)\s*>|$)/giu, '')
  let result = ''
  let cursor = 0
  const stack: string[] = []
  for (const match of withoutActive.matchAll(/<[^>]{1,200}>/gu)) {
    const parsed = match[0]!.match(/^<\s*(\/)?\s*([A-Za-z][\w:-]*)([^>]*)>$/u)
    if (parsed !== null) {
      const name = parsed[2]!.toLocaleLowerCase()
      if (SAFE_RAW_BLOCK_TAGS.has(name) && !SAFE_RAW_VOID_TAGS.has(name)) {
        if (parsed[1] === undefined) stack.push(name)
        else if (stack.pop() !== name) return escapeMarkdownHtml(source)
      }
    }
    result += escapeMarkdownHtml(withoutActive.slice(cursor, match.index))
    result += sanitizeRawHtmlTag(match[0]!)
    cursor = (match.index ?? cursor) + match[0]!.length
  }
  if (stack.length > 0) return escapeMarkdownHtml(source)
  result += escapeMarkdownHtml(withoutActive.slice(cursor))
  return result.trim() === '' ? '' : result
}

function rawHtmlBlockName(line: string): string | null {
  const name = line.trim().match(/^<\s*([A-Za-z][\w:-]*)(?:\s|>|\/)/u)?.[1]?.toLocaleLowerCase()
  return name !== undefined && RAW_HTML_BLOCK_TAGS.has(name) ? name : null
}

function renderInline(source: string, footnoteNumbers: ReadonlyMap<string, number>, externalEmbedMode: 'inert' | 'viewer' = 'inert'): string {
  const tokens: string[] = []
  const hold = (html: string): string => {
    const token = `\u0000${String(tokens.length)}\u0000`
    tokens.push(html)
    return token
  }
  let text = source
  text = text.replace(/<[^>]{1,200}>/gu, tag => SAFE_RAW_TAG.test(tag) ? hold(tag.toLocaleLowerCase()) : tag)
  text = text.replace(/`([^`\n]{0,10000})`/gu, (_match, code: string) => hold(`<code>${escapeMarkdownHtml(code)}</code>`))
  text = escapeMarkdownHtml(text)
  text = text.replace(/!\[([^\]\n]{0,1000})\]\(([^)\n]{1,4096})\)/gu, (match, alt: string, target: string) => {
    const external = classifyExternalEmbed(target)
    if (external !== null) {
      const image = external.kind === 'youtube' || external.kind === 'twitter' ? external : { ...external, kind: 'image' as const }
      return externalEmbedMode === 'viewer' ? externalEmbedButtonHtml(alt, image) : externalEmbedInertHtml(alt, image)
    }
    const url = safeUrl(target)
    return url === null || !/^(?:data:image\/|(?:https?:)?\/|\.\.?\/|[^:]+$)/iu.test(url)
      ? escapeMarkdownHtml(match)
      : `<img alt="${escapeMarkdownHtml(alt)}" loading="lazy" referrerpolicy="no-referrer" src="${escapeMarkdownHtml(url)}">`
  })
  text = text.replace(/\[([^\]\n]{1,2000})\]\(([^)\n]{1,4096})\)/gu, (match, label: string, target: string) => {
    const url = safeUrl(target)
    return url === null
      ? escapeMarkdownHtml(match)
      : `<a href="${escapeMarkdownHtml(url)}" rel="noopener noreferrer">${label}</a>`
  })
  text = text.replace(/\[\[([^\]|\n]{1,2000})(?:\|([^\]\n]{1,2000}))?\]\]/gu, (_match, target: string, alias?: string) => {
    const candidate = target.trim()
    const path = isSafeVaultRelativePath(candidate) ? candidate : null
    return path === null
      ? escapeMarkdownHtml(`[[${target}${alias === undefined ? '' : `|${alias}`}]]`)
      : `<a class="internal-link" data-target="${escapeMarkdownHtml(path)}" href="#">${escapeMarkdownHtml(alias ?? target)}</a>`
  })
  text = text.replace(/\[\^([^\]\n]{1,200})\]/gu, (match, label: string) => {
    const number = footnoteNumbers.get(label.toLocaleLowerCase())
    return number === undefined ? match : `<sup class="footnote-ref"><a href="#fn-${String(number)}">${String(number)}</a></sup>`
  })
  text = text.replace(/\^\[([^\]\n]{1,2000})\]/gu, (_match, value: string) => hold(`<sup class="footnote-inline">${renderInline(value, footnoteNumbers, externalEmbedMode)}</sup>`))
  text = text.replace(/\$([^$\n]{1,20000})\$/gu, (_match, value: string) => `<span class="math-inline" role="math">${escapeMarkdownHtml(value)}</span>`)
  text = text.replace(/==([^=\n]{1,20000})==/gu, '<mark>$1</mark>')
  text = text.replace(/~~([^~\n]{1,20000})~~/gu, '<del>$1</del>')
  text = text.replace(/\*\*([^*\n]{1,20000})\*\*/gu, '<strong>$1</strong>')
  text = text.replace(/(?<!\*)\*([^*\n]{1,20000})\*(?!\*)/gu, '<em>$1</em>')
  text = text.replace(/\u0000(\d+)\u0000/gu, (_match, index: string) => tokens[Number(index)] ?? '')
  return text
}

function stripLeadingFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) return markdown
  const lines = markdown.split(/\r?\n/u)
  const end = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'))
  return end < 0 ? markdown : lines.slice(end + 1).join('\n')
}

function stripComments(markdown: string): string {
  let result = ''
  let index = 0
  while (index < markdown.length) {
    const start = markdown.indexOf('%%', index)
    if (start < 0) return result + markdown.slice(index)
    const end = markdown.indexOf('%%', start + 2)
    if (end < 0 || end - start > 100_000) return result + markdown.slice(index)
    result += markdown.slice(index, start)
    index = end + 2
  }
  return result
}

interface FootnoteDefinition {
  label: string
  number: number
  text: string
}

function collectFootnotes(lines: string[]): { definitions: FootnoteDefinition[]; numbers: Map<string, number>; hidden: Set<number> } {
  const definitions: FootnoteDefinition[] = []
  const numbers = new Map<string, number>()
  const hidden = new Set<number>()
  for (let index = 0; index < lines.length && definitions.length < MAX_RICH_MARKDOWN_FOOTNOTES; index += 1) {
    const match = lines[index]?.match(/^\[\^([^\]]{1,200})\]:\s*(.*)$/u)
    if (match === undefined || match === null) continue
    const key = match[1]!.toLocaleLowerCase()
    if (numbers.has(key)) continue
    const number = definitions.length + 1
    numbers.set(key, number)
    definitions.push({ label: match[1]!, number, text: match[2]! })
    hidden.add(index)
  }
  return { definitions, numbers, hidden }
}

function renderBoundedMermaid(source: string): string | null {
  if (source.length > 20_000) return null
  const statements = source.split(/[;\r\n]+/u).map(value => value.trim()).filter(Boolean)
  if (!/^graph\s+(?:TD|TB|LR|RL|BT)$/iu.test(statements.shift() ?? '') || statements.length === 0 || statements.length > 100) return null
  const edges: Array<{ from: string; to: string }> = []
  const labels = new Map<string, string>()
  for (const statement of statements) {
    const match = statement.match(/^([A-Za-z][\w-]*)(?:\[([^\]]{1,200})\])?\s*--+>?\s*([A-Za-z][\w-]*)(?:\[([^\]]{1,200})\])?$/u)
    if (match === null) return null
    const from = match[1]!
    const to = match[3]!
    if (!labels.has(from)) labels.set(from, match[2] ?? from)
    if (!labels.has(to)) labels.set(to, match[4] ?? to)
    edges.push({ from, to })
  }
  const nodeIds = [...labels.keys()]
  const nodeWidth = 132
  const width = Math.max(320, Math.min(1200, 40 + nodeIds.length * 180))
  const height = 128
  const gap = nodeIds.length < 2 ? 0 : (width - 40 - nodeWidth) / (nodeIds.length - 1)
  const position = (id: string): { x: number; y: number } => ({
    x: 20 + nodeIds.indexOf(id) * gap,
    y: 38,
  })
  const edgeMarkup = edges.map(edge => {
    const from = position(edge.from)
    const to = position(edge.to)
    const fromX = from.x + nodeWidth / 2
    const toX = to.x + nodeWidth / 2
    const midpoint = (fromX + toX) / 2
    return `<path class="mermaid-edge-path" d="M ${String(fromX)} 64 C ${String(midpoint)} 20, ${String(midpoint)} 20, ${String(toX)} 64" marker-end="url(#mermaid-arrow)"></path>`
  }).join('')
  const nodeMarkup = nodeIds.map(id => {
    const point = position(id)
    return `<g class="mermaid-node" data-node-id="${escapeMarkdownHtml(id)}"><rect class="mermaid-node-shape" height="52" rx="8" width="${String(nodeWidth)}" x="${String(point.x)}" y="${String(point.y)}"></rect><text class="mermaid-node-label" text-anchor="middle" x="${String(point.x + nodeWidth / 2)}" y="70">${escapeMarkdownHtml(labels.get(id) ?? id)}</text></g>`
  }).join('')
  return `<div aria-label="Mermaid Diagram" class="mermaid-diagram" role="img"><svg aria-hidden="true" class="mermaid-svg" preserveAspectRatio="xMidYMid meet" viewBox="0 0 ${String(width)} ${String(height)}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="mermaid-arrow" markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4" viewBox="0 0 8 8"><path class="mermaid-arrow-head" d="M 0 0 L 8 4 L 0 8 z"></path></marker></defs>${edgeMarkup}${nodeMarkup}</svg></div>`
}

function tableDelimiter(line: string): boolean {
  const cells = line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|')
  return cells.length >= 2 && cells.every(cell => /^\s*:?-{3,}:?\s*$/u.test(cell))
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map(cell => cell.trim())
}

function blockIdText(value: string): { id: string; text: string } | null {
  const match = value.match(/(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\s*$/u)
  if (match === null) return null
  return { id: match[1]!, text: value.slice(0, match.index ?? 0).replace(/[ \t]+$/u, '') }
}

function paragraphHtml(lines: string[], strict: boolean, footnotes: ReadonlyMap<string, number>, externalEmbedMode: 'inert' | 'viewer'): string {
  if (lines.length === 0) return ''
  const last = blockIdText(lines.at(-1)!.replace(/[ \t]+$/u, ''))
  const content = last === null ? lines : [...lines.slice(0, -1), last.text]
  let html = renderInline(content[0]!.replace(/[ \t]+$/u, ''), footnotes, externalEmbedMode)
  for (let index = 1; index < content.length; index += 1) {
    const previous = content[index - 1]!
    const separator = !strict || / {2,}$/u.test(previous) ? '<br>' : ' '
    html += `${separator}${renderInline(content[index]!.replace(/[ \t]+$/u, ''), footnotes, externalEmbedMode)}`
  }
  return `<p${last === null ? '' : ` id="${escapeMarkdownHtml(last.id)}"`}>${html}</p>`
}

interface MarkdownListItem {
  checked: boolean | null
  content: string
  indent: number
  marker: string
  ordered: boolean
}

function parseMarkdownListItem(line: string): MarkdownListItem | null {
  const match = line.match(/^( {0,64})([-+*]|\d{1,9}[.)])\s+(.*)$/u)
  if (match === null) return null
  const ordered = /^\d/u.test(match[2]!)
  const task = ordered ? null : match[3]!.match(/^\[([^\]])\]\s*(.*)$/u)
  return {
    checked: task === null ? null : task[1] !== ' ',
    content: task?.[2] ?? match[3]!,
    indent: match[1]!.length,
    marker: match[2]!,
    ordered,
  }
}

function renderMarkdownList(
  items: readonly MarkdownListItem[],
  start: number,
  indent: number,
  taskIndex: number,
  footnotes: ReadonlyMap<string, number>,
  externalEmbedMode: 'inert' | 'viewer',
): { html: string; next: number; taskIndex: number } {
  const ordered = items[start]!.ordered
  const children: string[] = []
  let cursor = start
  let nextTaskIndex = taskIndex
  let hasTasks = false
  while (cursor < items.length) {
    const item = items[cursor]!
    if (item.indent !== indent || item.ordered !== ordered) break
    cursor += 1
    let input = ''
    if (item.checked !== null) {
      hasTasks = true
      input = `<input aria-label="Task" data-task-index="${String(nextTaskIndex)}" type="checkbox"${item.checked ? ' checked' : ''}> `
      nextTaskIndex += 1
    }
    let nested = ''
    while (cursor < items.length && items[cursor]!.indent > indent) {
      const result = renderMarkdownList(items, cursor, items[cursor]!.indent, nextTaskIndex, footnotes, externalEmbedMode)
      nested += result.html
      cursor = result.next
      nextTaskIndex = result.taskIndex
    }
    children.push(`<li>${input}${renderInline(item.content, footnotes, externalEmbedMode)}${nested}</li>`)
  }
  const tag = ordered ? 'ol' : 'ul'
  const startValue = ordered ? Number.parseInt(items[start]!.marker, 10) : 1
  const attributes = ordered && startValue !== 1
    ? ` start="${String(startValue)}"`
    : !ordered && hasTasks ? ' class="task-list"' : ''
  return { html: `<${tag}${attributes}>${children.join('')}</${tag}>`, next: cursor, taskIndex: nextTaskIndex }
}

export function renderMarkdownHtml(markdown: string, options: RenderMarkdownOptions = {}): string {
  if (bytes(markdown) > MAX_RICH_MARKDOWN_BYTES) return `<pre>${escapeMarkdownHtml(markdown.slice(0, MAX_RICH_MARKDOWN_BYTES))}</pre>`
  const source = stripActiveHtml(stripComments(stripLeadingFrontmatter(markdown)).replaceAll('\r\n', '\n').replaceAll('\r', '\n'))
  const lines = source.split('\n')
  const footnotes = collectFootnotes(lines)
  const externalEmbedMode = options.externalEmbedMode ?? 'inert'
  const blocks: string[] = []
  let paragraph: string[] = []
  let taskIndex = 0
  const flush = (): void => {
    if (paragraph.length === 0) return
    blocks.push(paragraphHtml(paragraph, options.strictLineBreaks === true, footnotes.numbers, externalEmbedMode))
    paragraph = []
  }
  for (let index = 0; index < lines.length && blocks.length < MAX_RICH_MARKDOWN_BLOCKS; index += 1) {
    const line = lines[index]!
    const rawName = rawHtmlBlockName(line)
    if (rawName !== null) {
      flush()
      const rawLines = [line]
      index += 1
      const close = new RegExp(`</\\s*${rawName}\\s*>`, 'iu')
      while (index < lines.length && !close.test(rawLines.at(-1) ?? '')) {
        rawLines.push(lines[index]!)
        index += 1
      }
      blocks.push(renderSafeRawHtmlBlock(rawLines.join('\n')) ?? paragraphHtml(rawLines, options.strictLineBreaks === true, footnotes.numbers, externalEmbedMode))
      index -= 1
      continue
    }
    if (footnotes.hidden.has(index)) {
      flush()
      continue
    }
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s]*)\s*$/u)
    if (fence !== null) {
      flush()
      const marker = fence[1]!
      const language = fence[2]!.toLocaleLowerCase()
      const code: string[] = []
      index += 1
      while (index < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${String(marker.length)},}\\s*$`, 'u').test(lines[index]!)) {
        code.push(lines[index]!)
        index += 1
      }
      const escaped = escapeMarkdownHtml(code.join('\n'))
      const mermaid = language === 'mermaid' ? renderBoundedMermaid(code.join('\n')) : null
      blocks.push(language === 'mermaid'
        ? mermaid ?? `<figure class="mermaid" data-language="mermaid"><pre>${escaped}</pre></figure>`
        : `<pre data-language="${escapeMarkdownHtml(language)}"><code>${escaped}</code></pre>`)
      continue
    }
    const displayMath = line.match(/^\s*\$\$(.{1,20000})\$\$\s*$/u)
    if (displayMath !== null) {
      flush()
      blocks.push(`<div class="math-display" role="math">${escapeMarkdownHtml(displayMath[1]!)}</div>`)
      continue
    }
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u)
    if (heading !== null) {
      flush()
      const level = heading[1]!.length
      const content = blockIdText(heading[2]!)
      const title = content?.text ?? heading[2]!
      const id = content === null ? '' : ` id="${escapeMarkdownHtml(content.id)}"`
      blocks.push(`<h${String(level)}${id}>${renderInline(title, footnotes.numbers, externalEmbedMode)}</h${String(level)}>`)
      continue
    }
    const callout = line.match(/^>\s*\[!([A-Za-z0-9_-]+)\]([+-])?(?:\s+(.*))?$/u)
    if (callout !== null) {
      flush()
      const body: string[] = []
      while (index + 1 < lines.length && /^> ?/u.test(lines[index + 1]!)) {
        index += 1
        body.push(lines[index]!.replace(/^> ?/u, ''))
      }
      const type = callout[1]!.toLocaleLowerCase()
      const title = callout[3] ?? type[0]!.toLocaleUpperCase() + type.slice(1)
      blocks.push(`<aside class="callout callout-${escapeMarkdownHtml(type)}" data-callout="${escapeMarkdownHtml(type)}" data-fold="${callout[2] === '-' ? 'closed' : 'open'}"><strong>${renderInline(title, footnotes.numbers, externalEmbedMode)}</strong>${paragraphHtml(body, options.strictLineBreaks === true, footnotes.numbers, externalEmbedMode)}</aside>`)
      continue
    }
    const quote = line.match(/^ {0,3}> ?(.*)$/u)
    if (quote !== null) {
      flush()
      const body = [quote[1]!]
      while (index + 1 < lines.length && /^ {0,3}> ?/u.test(lines[index + 1]!)) {
        index += 1
        body.push(lines[index]!.replace(/^ {0,3}> ?/u, ''))
      }
      const content = body.join('\n').split(/\n[ \t]*\n/u)
        .map(value => paragraphHtml(value.split('\n'), options.strictLineBreaks === true, footnotes.numbers, externalEmbedMode))
        .join('')
      blocks.push(`<blockquote>${content}</blockquote>`)
      continue
    }
    if (index + 1 < lines.length && line.includes('|') && tableDelimiter(lines[index + 1]!)) {
      flush()
      const headers = tableCells(line)
      index += 1
      const rows: string[][] = []
      while (index + 1 < lines.length && lines[index + 1]!.includes('|') && lines[index + 1]!.trim() !== '') {
        index += 1
        rows.push(tableCells(lines[index]!))
      }
      blocks.push(`<table><thead><tr>${headers.map(cell => `<th>${renderInline(cell, footnotes.numbers, externalEmbedMode)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_header, cell) => `<td>${renderInline(row[cell] ?? '', footnotes.numbers, externalEmbedMode)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    const list = parseMarkdownListItem(line)
    if (list !== null) {
      flush()
      const items = [list]
      while (index + 1 < lines.length) {
        const next = parseMarkdownListItem(lines[index + 1]!)
        if (next === null) break
        items.push(next)
        index += 1
      }
      let cursor = 0
      let html = ''
      while (cursor < items.length) {
        const result = renderMarkdownList(items, cursor, items[cursor]!.indent, taskIndex, footnotes.numbers, externalEmbedMode)
        html += result.html
        cursor = result.next
        taskIndex = result.taskIndex
      }
      blocks.push(html)
      continue
    }
    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
      flush()
      blocks.push('<hr>')
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    paragraph.push(line)
  }
  flush()
  if (footnotes.definitions.length > 0) {
    blocks.push(`<section class="footnotes"><ol>${footnotes.definitions.map(definition => `<li id="fn-${String(definition.number)}">${renderInline(definition.text, footnotes.numbers, externalEmbedMode)}</li>`).join('')}</ol></section>`)
  }
  return blocks.join('\n')
}

export function buildMarkdownSlides(markdown: string, options: RenderMarkdownOptions = {}): string[] {
  if (bytes(markdown) > MAX_RICH_MARKDOWN_BYTES) return [renderMarkdownHtml(markdown, options)]
  const lines = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  const slides: string[] = []
  let current: string[] = []
  let fence: { character: string; length: number } | null = null
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1]
    if (marker !== undefined) {
      if (fence === null) fence = { character: marker[0]!, length: marker.length }
      else if (marker[0] === fence.character && marker.length >= fence.length && /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(line)) fence = null
      current.push(line)
      continue
    }
    if (fence === null && /^ {0,3}---\s*$/u.test(line)) {
      slides.push(renderMarkdownHtml(current.join('\n'), options))
      current = []
    } else current.push(line)
  }
  slides.push(renderMarkdownHtml(current.join('\n'), options))
  return slides
}

function stripStaticResourceAttributes(html: string): string {
  return html.replace(/\s+(?:href|src)=(?:"[^"]*"|'[^']*')/giu, '')
}

function renderStaticEmbed(embed: StaticMarkdownEmbed): string {
  const path = escapeMarkdownHtml(embed.target.path)
  const label = escapeMarkdownHtml(embed.target.display ?? embed.target.path)
  if (embed.target.kind === 'note') {
    const content = stripStaticResourceAttributes(renderMarkdownHtml(embed.content))
    return `<article data-embed-kind="note" data-embed-path="${path}"><h3>${label}</h3>${content}</article>`
  }
  if (embed.target.kind === 'canvas' || embed.target.kind === 'base') {
    return `<article data-embed-kind="${embed.target.kind}" data-embed-path="${path}"><h3>${label}</h3><pre>${escapeMarkdownHtml(embed.content)}</pre></article>`
  }
  const mimeType = embed.mimeType?.toLowerCase() ?? ''
  if (/^image\/(?:avif|gif|jpeg|png|webp)$/u.test(mimeType)
    && embed.content.length <= 2_000_000
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(embed.content)) {
    return `<figure data-embed-kind="media" data-embed-path="${path}"><img alt="${label}" src="data:${mimeType};base64,${embed.content}"><figcaption>${label}</figcaption></figure>`
  }
  const media = mimeType.startsWith('audio/') ? 'Audio' : mimeType.startsWith('video/') ? 'Video' : mimeType === 'application/pdf' ? 'PDF' : 'Media'
  return `<article data-embed-kind="media" data-embed-path="${path}"><p>${media} Embed: ${label}</p></article>`
}

export function buildMarkdownExportDocument(options: BuildMarkdownExportDocumentOptions): string {
  const title = escapeMarkdownHtml(options.title.slice(0, 1000))
  const body = stripStaticResourceAttributes(renderMarkdownHtml(options.markdown, { ...options, externalEmbedMode: 'inert' }))
  const embeds = (options.embeds ?? []).slice(0, 100).filter(embed => bytes(embed.content) <= MAX_RICH_MARKDOWN_BYTES)
  const resolved = embeds.length === 0
    ? ''
    : `<section aria-label="Resolved Embeds"><h2>Resolved Embeds</h2>${embeds.map(renderStaticEmbed).join('')}</section>`
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}${resolved}</body></html>`
}
