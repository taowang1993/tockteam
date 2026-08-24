import type { PublicTextResult } from './fetch.ts'

export type ReaderViewErrorCode = 'input' | 'limits' | 'parser'

export class ReaderViewError extends Error {
  readonly code: ReaderViewErrorCode

  constructor(code: ReaderViewErrorCode, message: string) {
    super(message)
    this.name = 'ReaderViewError'
    this.code = code
  }
}

export interface ReaderViewLimits {
  maxParserInputChars: number
  maxParserTokens: number
  maxReaderOutputChars: number
  maxReaderTitleChars: number
  maxReaderWarningChars: number
  maxReaderWarnings: number
}

export const defaultReaderViewLimits: Readonly<ReaderViewLimits> = {
  maxParserInputChars: 1_000_000,
  maxParserTokens: 50_000,
  maxReaderOutputChars: 200_000,
  maxReaderTitleChars: 200,
  maxReaderWarningChars: 200,
  maxReaderWarnings: 8,
}

export const maximumReaderViewLimits: Readonly<ReaderViewLimits> = {
  maxParserInputChars: 2_000_000,
  maxParserTokens: 100_000,
  maxReaderOutputChars: 500_000,
  maxReaderTitleChars: 500,
  maxReaderWarningChars: 500,
  maxReaderWarnings: 32,
}

export interface ReaderViewResult {
  content: string
  sourceUrl: string
  title: string
  warnings: string[]
}

const activeContentTags = new Set([
  'audio',
  'canvas',
  'iframe',
  'math',
  'noscript',
  'object',
  'picture',
  'script',
  'style',
  'svg',
  'template',
  'video',
])
const blockTags = new Set([
  'article',
  'aside',
  'blockquote',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])
const discardedTags = new Set([
  'embed',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
])

function fail(code: ReaderViewErrorCode, message: string): never {
  throw new ReaderViewError(code, message)
}

function checkedLimits(overrides: Partial<ReaderViewLimits>): ReaderViewLimits {
  const limits = { ...defaultReaderViewLimits, ...overrides }
  for (const key of Object.keys(maximumReaderViewLimits) as Array<keyof ReaderViewLimits>) {
    const value = limits[key]
    if (!Number.isSafeInteger(value) || value < 1 || value > maximumReaderViewLimits[key]) {
      return fail('limits', 'Reader View limits are invalid.')
    }
  }
  return limits
}

function decodeEntity(raw: string, body: string): string {
  const name = body.toLowerCase()
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  if (named[name] !== undefined) return named[name]
  const value = name.startsWith('#x')
    ? Number.parseInt(name.slice(2), 16)
    : name.startsWith('#')
      ? Number.parseInt(name.slice(1), 10)
      : Number.NaN
  if (!Number.isInteger(value)
    || value < 0x20
    || value > 0x10ffff
    || (value >= 0xd800 && value <= 0xdfff)) return raw
  return String.fromCodePoint(value)
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/giu, decodeEntity)
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/gu, '\n')
    .replace(/[\t\f\v ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function boundedWarning(message: string, maxChars: number): string {
  return message.length <= maxChars
    ? message
    : maxChars === 1
      ? '…'
      : `${message.slice(0, maxChars - 1)}…`
}

function finalize(
  input: PublicTextResult,
  limits: ReaderViewLimits,
  title: string,
  content: string,
  warningMessages: string[],
): ReaderViewResult {
  const normalized = normalizeText(content).slice(0, limits.maxReaderOutputChars)
  const boundedContent = normalized && normalized.length < limits.maxReaderOutputChars
    ? `${normalized}\n`
    : normalized
  return {
    content: boundedContent,
    sourceUrl: input.url,
    title: (normalizeText(title) || new URL(input.url).hostname).slice(0, limits.maxReaderTitleChars),
    warnings: warningMessages
      .slice(0, limits.maxReaderWarnings)
      .map(message => boundedWarning(message, limits.maxReaderWarningChars)),
  }
}

function projectHtml(input: PublicTextResult, limits: ReaderViewLimits): ReaderViewResult {
  const html = input.text
  const lower = html.toLowerCase()
  const output: string[] = []
  let outputLength = 0
  let index = 0
  let tokens = 0
  let truncated = false
  let capture: 'h1' | 'title' | null = null
  let documentTitle = ''
  let headingTitle = ''

  const append = (value: string) => {
    if (!value || truncated) return
    const remaining = limits.maxReaderOutputChars - outputLength
    if (value.length > remaining) {
      if (remaining > 0) output.push(value.slice(0, remaining))
      outputLength = limits.maxReaderOutputChars
      truncated = true
      return
    }
    output.push(value)
    outputLength += value.length
  }
  const countToken = () => {
    tokens += 1
    if (tokens > limits.maxParserTokens) return fail('parser', 'The HTML is too complex for Reader View.')
  }

  while (index < html.length && !truncated) {
    if (html.startsWith('<!--', index)) {
      countToken()
      const end = html.indexOf('-->', index + 4)
      if (end < 0) break
      index = end + 3
      continue
    }
    if (html[index] !== '<') {
      countToken()
      const end = html.indexOf('<', index)
      const text = decodeEntities(html.slice(index, end < 0 ? html.length : end))
      if (capture === 'title') documentTitle += text.slice(0, limits.maxReaderTitleChars - documentTitle.length)
      else {
        if (capture === 'h1') headingTitle += text.slice(0, limits.maxReaderTitleChars - headingTitle.length)
        append(text)
      }
      index = end < 0 ? html.length : end
      continue
    }

    countToken()
    const end = html.indexOf('>', index + 1)
    if (end < 0) {
      append(decodeEntities(html.slice(index)))
      break
    }
    const token = html.slice(index, end + 1)
    const match = /^<\s*(\/?)\s*([a-z][\w:-]*)/iu.exec(token)
    index = end + 1
    if (!match) continue
    const closing = match[1] === '/'
    const tag = match[2]?.toLowerCase() ?? ''

    if (!closing && activeContentTags.has(tag)) {
      const closeStart = lower.indexOf(`</${tag}`, index)
      if (closeStart < 0) break
      const closeEnd = html.indexOf('>', closeStart + tag.length + 2)
      if (closeEnd < 0) break
      index = closeEnd + 1
      continue
    }
    if (discardedTags.has(tag)) continue
    if (!closing && tag === 'title' && !documentTitle) capture = 'title'
    else if (!closing && tag === 'h1' && !headingTitle) capture = 'h1'
    else if (closing && tag === capture) capture = null
    if (tag !== 'title' && blockTags.has(tag)) append('\n')
  }

  const content = output.join('')
  const warnings: string[] = []
  if (truncated) warnings.push('Reader content was truncated to the configured limit.')
  if (!normalizeText(content)) warnings.push('No readable text was found.')
  return finalize(input, limits, documentTitle || headingTitle, content, warnings)
}

export function projectReaderView(
  input: PublicTextResult,
  overrides: Partial<ReaderViewLimits> = {},
): ReaderViewResult {
  const limits = checkedLimits(overrides)
  if (input.text.length > limits.maxParserInputChars) return fail('input', 'The response is too large for Reader View.')
  if (input.contentType !== 'text/plain') return projectHtml(input, limits)

  const normalized = normalizeText(input.text)
  const truncated = normalized.length > limits.maxReaderOutputChars
  const content = normalized.slice(0, limits.maxReaderOutputChars)
  return finalize(input, limits, '', content, truncated
    ? ['Reader content was truncated to the configured limit.']
    : content
      ? []
      : ['No readable text was found.'])
}
