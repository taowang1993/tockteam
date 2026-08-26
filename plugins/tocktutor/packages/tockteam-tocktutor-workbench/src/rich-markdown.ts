// Bounded TockTeam renderer informed by Tockbot's source-detached NotesExportHtml contract.
export const MAX_RICH_MARKDOWN_BYTES = 2000_000
export const MAX_RICH_MARKDOWN_BLOCKS = 20000
export const MAX_RICH_MARKDOWN_FOOTNOTES = 1000

export interface RenderMarkdownOptions {
  strictLineBreaks?: boolean
}

export interface BuildMarkdownExportDocumentOptions extends RenderMarkdownOptions {
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
  if (trimmed.length === 0 || trimmed.length > 4096 || /[\u0000-\u001f\u007f]/u.test(trimmed)) return null
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

function renderInline(source: string, footnoteNumbers: ReadonlyMap<string, number>): string {
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
  text = text.replace(/\[\[([^\]\n]{1,2000})(?:\|([^\]\n]{0,2000}))?\]\]/gu, (_match, target: string, alias?: string) => {
    const path = safeUrl(target)
    return path === null
      ? escapeMarkdownHtml(`[[${target}${alias === undefined ? '' : `|${alias}`}]]`)
      : `<a class="internal-link" data-target="${escapeMarkdownHtml(path)}" href="#">${escapeMarkdownHtml(alias ?? target)}</a>`
  })
  text = text.replace(/\[\^([^\]\n]{1,200})\]/gu, (match, label: string) => {
    const number = footnoteNumbers.get(label.toLocaleLowerCase())
    return number === undefined ? match : `<sup class="footnote-ref"><a href="#fn-${String(number)}">${String(number)}</a></sup>`
  })
  text = text.replace(/\^\[([^\]\n]{1,2000})\]/gu, (_match, value: string) => hold(`<sup class="footnote-inline">${renderInline(value, footnoteNumbers)}</sup>`))
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

function tableDelimiter(line: string): boolean {
  const cells = line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|')
  return cells.length >= 2 && cells.every(cell => /^\s*:?-{3,}:?\s*$/u.test(cell))
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map(cell => cell.trim())
}

function paragraphHtml(lines: string[], strict: boolean, footnotes: ReadonlyMap<string, number>): string {
  if (lines.length === 0) return ''
  let html = renderInline(lines[0]!.replace(/[ \t]+$/u, ''), footnotes)
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1]!
    const separator = !strict || / {2,}$/u.test(previous) ? '<br>' : ' '
    html += `${separator}${renderInline(lines[index]!.replace(/[ \t]+$/u, ''), footnotes)}`
  }
  return `<p>${html}</p>`
}

export function renderMarkdownHtml(markdown: string, options: RenderMarkdownOptions = {}): string {
  if (bytes(markdown) > MAX_RICH_MARKDOWN_BYTES) return `<pre>${escapeMarkdownHtml(markdown.slice(0, MAX_RICH_MARKDOWN_BYTES))}</pre>`
  const source = stripComments(stripLeadingFrontmatter(markdown)).replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const lines = source.split('\n')
  const footnotes = collectFootnotes(lines)
  const blocks: string[] = []
  let paragraph: string[] = []
  let taskIndex = 0
  const flush = (): void => {
    if (paragraph.length === 0) return
    blocks.push(paragraphHtml(paragraph, options.strictLineBreaks === true, footnotes.numbers))
    paragraph = []
  }
  for (let index = 0; index < lines.length && blocks.length < MAX_RICH_MARKDOWN_BLOCKS; index += 1) {
    const line = lines[index]!
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
      blocks.push(language === 'mermaid'
        ? `<figure class="mermaid" data-language="mermaid"><pre>${escaped}</pre></figure>`
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
      blocks.push(`<h${String(level)}>${renderInline(heading[2]!, footnotes.numbers)}</h${String(level)}>`)
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
      blocks.push(`<aside class="callout callout-${escapeMarkdownHtml(type)}" data-fold="${callout[2] === '-' ? 'closed' : 'open'}"><strong>${renderInline(title, footnotes.numbers)}</strong>${paragraphHtml(body, options.strictLineBreaks === true, footnotes.numbers)}</aside>`)
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
      blocks.push(`<table><thead><tr>${headers.map(cell => `<th>${renderInline(cell, footnotes.numbers)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_header, cell) => `<td>${renderInline(row[cell] ?? '', footnotes.numbers)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    const task = line.match(/^\s{0,64}[-+*]\s+\[([^\]])\]\s*(.*)$/u)
    if (task !== null) {
      flush()
      blocks.push(`<ul class="task-list"><li><input aria-label="Task" data-task-index="${String(taskIndex)}" type="checkbox"${task[1] === ' ' ? '' : ' checked'}> ${renderInline(task[2]!, footnotes.numbers)}</li></ul>`)
      taskIndex += 1
      continue
    }
    const list = line.match(/^\s{0,64}([-+*]|\d{1,9}[.)])\s+(.*)$/u)
    if (list !== null) {
      flush()
      const ordered = /^\d/u.test(list[1]!)
      blocks.push(`<${ordered ? 'ol' : 'ul'}><li>${renderInline(list[2]!, footnotes.numbers)}</li></${ordered ? 'ol' : 'ul'}>`)
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
    blocks.push(`<section class="footnotes"><ol>${footnotes.definitions.map(definition => `<li id="fn-${String(definition.number)}">${renderInline(definition.text, footnotes.numbers)}</li>`).join('')}</ol></section>`)
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

export function buildMarkdownExportDocument(options: BuildMarkdownExportDocumentOptions): string {
  const title = escapeMarkdownHtml(options.title.slice(0, 1000))
  const body = renderMarkdownHtml(options.markdown, options)
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline';"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:780px;margin:40px auto;padding:0 24px;color:#202124}pre,code{font-family:ui-monospace,monospace}pre{overflow:auto;padding:12px;background:#f5f5f5}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px}.callout{border-left:4px solid #6750a4;padding:8px 12px;background:#f7f5ff}.math-display{text-align:center}.footnotes{border-top:1px solid #ddd}</style></head><body>${body}</body></html>`
}
