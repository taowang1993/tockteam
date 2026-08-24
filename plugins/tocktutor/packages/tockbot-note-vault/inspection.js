import { createHash } from 'node:crypto'
import path from 'node:path'

const DIRECTORY_SCOPED_INPUT = Symbol.for('tockbot-note-vault.directory-scoped-input')
const SCANNED_ENTRIES = Symbol.for('tockbot-note-vault.scanned-entries')

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
const MAX_PROVIDER_PAGES = 1_024
const MAX_METADATA_PROPERTIES = 50
const MAX_METADATA_VALUES = 20
const MAX_METADATA_VALUE_CHARS = 240
const MAX_GRAPH_RELATIONSHIPS = 10_000
const MAX_LINK_TAGS = 50
const MAX_LINK_TAG_RELATIONS = 10_000
const MAX_LINK_TAG_COMPARISONS = 500_000
const MAX_UNLINKED_IDENTIFIERS = 50
const MAX_UNLINKED_IDENTIFIER_CLAIMS = 100_000
const MAX_UNLINKED_COMPARISONS = 500_000
const MAX_UNLINKED_MENTIONS = 10_000
const MAX_PATH_REWRITE_WORK = 10_000
const MAX_INLINE_DESTINATION_CHARS = 100_000
const MAX_INLINE_DESTINATION_DEPTH = 64
const MAX_CANVAS_NODES = 256
const MAX_CANVAS_EDGES = 512
const MAX_CANVAS_STRING_CHARS = 1_000
const RELATED_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with'])
const WORD_PATTERN = /[\p{L}\p{N}]+/gu

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

function isHiddenVaultPath(relativePath) {
  return relativePath.split(/[\\/]/u).some(segment => segment.startsWith('.') && segment !== '.')
}

function compareVaultPaths(left, right) {
  const collated = left.localeCompare(right)
  return collated || (left < right ? -1 : left > right ? 1 : 0)
}

function previewLine(line, matchIndex) {
  if (line.length <= MAX_PREVIEW_CHARS) return line.trim()
  const start = Math.max(0, Math.min(matchIndex - 80, line.length - MAX_PREVIEW_CHARS))
  const text = line.slice(start, start + MAX_PREVIEW_CHARS).trim()
  return `${start > 0 ? '…' : ''}${text}${start + MAX_PREVIEW_CHARS < line.length ? '…' : ''}`
}

function unquote(value) {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) return trimmed.slice(1, -1)
  return trimmed
}

function splitSearchTokens(query) {
  const tokens = []
  let token = ''
  let quote = null
  let regex = false
  let escaped = false
  let brackets = 0
  let parentheses = 0
  for (const character of query) {
    if (escaped) {
      token += character
      escaped = false
      continue
    }
    if (character === '\\') {
      token += character
      escaped = true
      continue
    }
    if (quote) {
      token += character
      if (character === quote) quote = null
      continue
    }
    if (regex) {
      token += character
      if (character === '/') regex = false
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      token += character
      continue
    }
    if (character === '/' && (token === '' || token.endsWith(':'))) {
      regex = true
      token += character
      continue
    }
    if (character === '[') brackets += 1
    if (character === ']' && brackets > 0) brackets -= 1
    if (character === '(' && (parentheses > 0 || token.endsWith(':'))) parentheses += 1
    if (character === ')' && parentheses > 0) parentheses -= 1
    if (/\s/u.test(character) && brackets === 0 && parentheses === 0) {
      if (token) tokens.push(token)
      token = ''
      continue
    }
    token += character
  }
  if (quote || regex || escaped || brackets || parentheses) throw new Error('invalid search pattern')
  if (token) tokens.push(token)
  return tokens
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function assertSafeSearchRegex(source) {
  let characterClass = false
  let escaped = false
  let literalPrefixLength = 0
  let prefixOpen = true
  let quantifiers = 0
  let unboundedQuantifiers = 0
  let variableQuantifiers = 0
  let unanchoredRepeatsAreSafeSeparators = true
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (escaped) {
      if (/^[1-9]$/u.test(character) || (character === 'k' && source[index + 1] === '<')) {
        throw new Error('unsafe search regex: backreferences are not supported')
      }
      escaped = false
      prefixOpen = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '[') {
      characterClass = true
      prefixOpen = false
      continue
    }
    if (character === ']' && characterClass) {
      characterClass = false
      continue
    }
    if (characterClass) continue
    if (prefixOpen && /[\p{L}\p{N}_-]/u.test(character)) literalPrefixLength += 1
    else if (character !== '^' || index !== 0) prefixOpen = false
    if (character === '(' || character === ')' || character === '|') {
      throw new Error('unsafe search regex: groups and alternation are not supported')
    }
    if (character === '*' || character === '+') {
      quantifiers += 1
      unboundedQuantifiers += 1
      variableQuantifiers += 1
      const separator = source.slice(0, index).endsWith('\\s')
        && literalPrefixLength >= 3
        && /[\p{L}\p{N}_-]/u.test(source[index + 1] ?? '')
      if (!separator) unanchoredRepeatsAreSafeSeparators = false
      continue
    }
    if (character === '?') {
      quantifiers += 1
      variableQuantifiers += 1
      continue
    }
    if (character !== '{') continue
    const repeat = /^\{(\d+)(?:,(\d*))?\}/u.exec(source.slice(index))
    if (!repeat) continue
    const lower = Number(repeat[1])
    const upper = repeat[2] === undefined ? lower : repeat[2] === '' ? null : Number(repeat[2])
    if (lower > 64 || upper != null && upper > 64) {
      throw new Error('unsafe search regex: repeat bounds must not exceed 64')
    }
    quantifiers += 1
    if (upper == null || upper !== lower) variableQuantifiers += 1
    if (upper == null) {
      unboundedQuantifiers += 1
      const separator = source.slice(0, index).endsWith('\\s')
        && literalPrefixLength >= 3
        && /[\p{L}\p{N}_-]/u.test(source[index + repeat[0].length] ?? '')
      if (!separator) unanchoredRepeatsAreSafeSeparators = false
    }
    index += repeat[0].length - 1
  }
  if (quantifiers > 4 || unboundedQuantifiers > 1 || variableQuantifiers > 1) {
    throw new Error('unsafe search regex: quantifier complexity is too high')
  }
  if (
    unboundedQuantifiers > 0
    && !source.startsWith('^')
    && !unanchoredRepeatsAreSafeSeparators
  ) {
    throw new Error('unsafe search regex: unanchored unbounded repeats are not supported')
  }
}

function compileSearchPattern(rawValue, options) {
  const value = unquote(rawValue)
  if (!value || value.length > 512) throw new Error('invalid search pattern')
  const inline = value.match(/^\/((?:\\.|[^/])+)\/([imsu]*)$/u)
  let source = inline ? inline[1] : (options.regex ? value : escapeRegex(value))
  const flags = inline ? inline[2] : `${options.caseSensitive ? '' : 'i'}u`
  try {
    new RegExp(source, flags)
  } catch {
    throw new Error('invalid search pattern')
  }
  if (inline || options.regex) assertSafeSearchRegex(source)
  if (options.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  return new RegExp(source, flags)
}

function compileSearchPatterns(rawValue, options) {
  const quoted = unquote(rawValue)
  const values = quoted === rawValue
    ? splitSearchTokens(rawValue.replace(/^\((.*)\)$/u, '$1')).map(unquote)
    : [quoted]
  return values.filter(Boolean).map(value => compileSearchPattern(value, options))
}

function parseSearchTerm(token, options) {
  if (token.startsWith('[') && token.endsWith(']')) {
    const body = token.slice(1, -1).trim()
    const colon = body.indexOf(':')
    const key = (colon === -1 ? body : body.slice(0, colon)).trim().toLowerCase()
    if (!key) throw new Error('invalid search pattern')
    if (colon === -1) return { field: 'property', key, nullValue: false, patterns: null }
    const rawValue = body.slice(colon + 1).trim()
    if (!rawValue) throw new Error('invalid search pattern')
    return {
      field: 'property',
      key,
      nullValue: /^null$/iu.test(rawValue),
      patterns: /^null$/iu.test(rawValue) ? null : compileSearchPatterns(rawValue, options),
    }
  }

  const colon = token.indexOf(':')
  const candidate = colon > 0 ? token.slice(0, colon).toLowerCase() : null
  const known = new Set([
    'block', 'content', 'file', 'ignore-case', 'line', 'match-case', 'path',
    'section', 'tag', 'task', 'task-done', 'task-todo',
  ])
  const operator = candidate && known.has(candidate) ? candidate : 'any'
  const rawValue = operator === 'any' ? token : token.slice(colon + 1)
  if (!rawValue) throw new Error('invalid search pattern')
  if (operator === 'tag') {
    const tag = unquote(rawValue).replace(/^#+/u, '').toLowerCase()
    if (!tag) throw new Error('invalid search pattern')
    return { field: 'tag', tag }
  }
  const compileOptions = {
    ...options,
    caseSensitive: operator === 'match-case' ? true : operator === 'ignore-case' ? false : options.caseSensitive,
  }
  if (['block', 'line', 'section', 'task', 'task-done', 'task-todo'].includes(operator)) {
    return {
      field: operator.startsWith('task') ? 'task' : operator,
      operator,
      patterns: compileSearchPatterns(rawValue, compileOptions),
      status: operator === 'task-todo' ? 'todo' : operator === 'task-done' ? 'done' : 'any',
    }
  }
  return {
    field: ['content', 'file', 'path'].includes(operator) ? operator : 'any',
    operator,
    pattern: compileSearchPattern(rawValue, compileOptions),
  }
}

function parseSearchQuery(query, options) {
  const groups = [{ include: [], exclude: [] }]
  for (const rawToken of splitSearchTokens(query)) {
    if (/^OR$/iu.test(rawToken)) {
      const current = groups.at(-1)
      if (current.include.length || current.exclude.length) groups.push({ include: [], exclude: [] })
      continue
    }
    const negated = rawToken.startsWith('-') && rawToken.length > 1
    const token = negated ? rawToken.slice(1) : rawToken
    groups.at(-1)[negated ? 'exclude' : 'include'].push(parseSearchTerm(token, options))
  }
  return groups.filter(group => group.include.length || group.exclude.length)
}

function stripYamlComment(value) {
  let brackets = 0
  let quote = null
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '[') brackets += 1
    if (character === ']') brackets = Math.max(0, brackets - 1)
    if (character === '#' && brackets === 0 && index > 0 && /\s/u.test(value[index - 1])) {
      return value.slice(0, index).trim()
    }
  }
  return value.trim()
}

function splitYamlSequence(value) {
  const values = []
  let quote = null
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = null
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === ',') {
      values.push(value.slice(start, index))
      start = index + 1
    }
  }
  values.push(value.slice(start))
  return values
}

function normalizeTags(value) {
  const clean = stripYamlComment(value)
  const values = clean.startsWith('[') && clean.endsWith(']')
    ? splitYamlSequence(clean.slice(1, -1))
    : ((clean.startsWith('"') && clean.endsWith('"'))
        || (clean.startsWith("'") && clean.endsWith("'"))
      ? [clean]
      : clean.split(/[\s,]+/u))
  return values
    .map(tag => unquote(tag).replace(/^#/u, '').trim())
    .filter(Boolean)
}

function frontmatterTags(propertyLines) {
  const tags = []
  let readingTags = false
  for (const { text } of propertyLines) {
    const property = text.match(/^([\w.-]+)\s*:\s*(.*)$/u)
    if (property) {
      readingTags = ['tag', 'tags'].includes(property[1].toLowerCase())
      if (readingTags) tags.push(...normalizeTags(property[2]))
      continue
    }
    const item = readingTags ? text.match(/^\s*-\s*(.+)$/u) : null
    if (item) tags.push(...normalizeTags(item[1]))
  }
  return [...new Set(tags)].sort((left, right) => left.localeCompare(right))
}

function frontmatterProperties(propertyLines) {
  const properties = new Map()
  let active
  for (const item of propertyLines) {
    const property = item.text.match(/^([\w.-]+)\s*:\s*(.*)$/u)
    if (property) {
      const raw = stripYamlComment(property[2])
      active = {
        key: property[1].toLowerCase(),
        line: item.line,
        value: unquote(raw),
        values: raw.startsWith('[') && raw.endsWith(']')
          ? splitYamlSequence(raw.slice(1, -1)).map(value => unquote(value).trim()).filter(Boolean)
          : [],
        isNull: raw === '' || /^(?:null|~)$/iu.test(raw),
      }
      properties.set(active.key, active)
      continue
    }
    const child = active ? item.text.match(/^\s*-\s*(.+)$/u) : null
    if (child) active.values.push(unquote(child[1]).trim())
  }
  return properties
}

function parseMarkdownFence(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u)
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null
  return { marker: match[1][0], length: match[1].length, trailing: match[2] }
}

function isEscapedSyntax(text, index) {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) slashes += 1
  return slashes % 2 === 1
}

function findUnescaped(text, token, start) {
  let index = text.indexOf(token, start)
  while (index !== -1 && isEscapedSyntax(text, index)) index = text.indexOf(token, index + token.length)
  return index
}

function findClosingBackticks(text, marker, start) {
  let index = text.indexOf(marker, start)
  while (index !== -1) {
    if (text[index - 1] !== '`' && text[index + marker.length] !== '`') return index
    index = text.indexOf(marker, index + marker.length)
  }
  return -1
}

function maskMarkdownLine(text, state, signal) {
  const output = text.split('')
  const mask = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if ((index - start) % 1_024 === 0) signal?.throwIfAborted()
      output[index] = ' '
    }
  }
  let cursor = 0
  while (cursor < text.length) {
    if (cursor % 1_024 === 0) signal?.throwIfAborted()
    if (state.region) {
      let end = -1
      let length = state.region.close.length
      if (state.region.rawTag) {
        const match = new RegExp(`</${state.region.rawTag}\\s*>`, 'iu').exec(text.slice(cursor))
        if (match) {
          end = cursor + match.index
          length = match[0].length
        }
      } else if (state.region.backticks) {
        end = findClosingBackticks(text, state.region.close, cursor)
      } else {
        end = findUnescaped(text, state.region.close, cursor)
      }
      if (end === -1) {
        mask(cursor, text.length)
        break
      }
      mask(cursor, end + length)
      cursor = end + length
      state.region = null
      continue
    }

    if (text[cursor] === '`' && !isEscapedSyntax(text, cursor)) {
      const marker = /^`+/u.exec(text.slice(cursor))[0]
      state.region = { backticks: true, close: marker }
      mask(cursor, cursor + marker.length)
      cursor += marker.length
      continue
    }

    const rawTag = /^<(script|style|pre|code|textarea)(?:\s|>)/iu.exec(text.slice(cursor))
    const region = text.startsWith('<!--', cursor)
      ? { close: '-->', length: 4 }
      : text.startsWith('<![CDATA[', cursor)
        ? { close: ']]>', length: 9 }
        : text.startsWith('<?', cursor)
          ? { close: '?>', length: 2 }
          : text.startsWith('%%', cursor)
            ? { close: '%%', length: 2 }
            : text.startsWith('$$', cursor)
              ? { close: '$$', length: 2 }
              : text[cursor] === '$'
                  && !isEscapedSyntax(text, cursor)
                  && findUnescaped(text, '$', cursor + 1) !== -1
                ? { close: '$', length: 1 }
                : rawTag
                  ? { close: '', length: rawTag[0].length, rawTag: rawTag[1].toLowerCase() }
                  : null
    if (!region) {
      cursor += 1
      continue
    }
    mask(cursor, cursor + region.length)
    cursor += region.length
    state.region = region
  }
  return output.join('')
}

const HTML_VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
])
const HTML_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'colgroup',
  'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'head', 'header', 'html', 'iframe', 'legend', 'li', 'main', 'menu', 'nav',
  'noframes', 'ol', 'optgroup', 'option', 'p', 'search', 'section', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul',
])

function* scanHtmlTags(text, signal) {
  for (let start = text.indexOf('<'); start !== -1; start = text.indexOf('<', start + 1)) {
    signal?.throwIfAborted()
    let cursor = start + 1
    const closing = text[cursor] === '/'
    if (closing) cursor += 1
    const nameStart = cursor
    if (!/[A-Za-z]/u.test(text[cursor] ?? '')) continue
    cursor += 1
    while (/[A-Za-z\d-]/u.test(text[cursor] ?? '')) cursor += 1
    const name = text.slice(nameStart, cursor).toLowerCase()
    if (!/[\s/>]/u.test(text[cursor] ?? '')) continue
    let quote = null
    for (; cursor < text.length; cursor += 1) {
      if ((cursor - start) % 1_024 === 0) signal?.throwIfAborted()
      const character = text[cursor]
      if (quote) {
        if (character === quote && !isEscapedSyntax(text, cursor)) quote = null
        continue
      }
      if (character === '"' || character === "'") {
        quote = character
        continue
      }
      if (character !== '>') continue
      let before = cursor - 1
      while (before > start && /\s/u.test(text[before])) before -= 1
      yield {
        closing,
        end: cursor + 1,
        name,
        selfClosing: !closing && text[before] === '/',
        start,
      }
      start = cursor
      break
    }
  }
}

function maskHtmlRanges(text, ranges, signal) {
  if (!ranges.length) return text
  const output = text.split('')
  for (const range of ranges) {
    for (let index = range.start; index < range.end; index += 1) {
      if ((index - range.start) % 1_024 === 0) signal?.throwIfAborted()
      output[index] = ' '
    }
  }
  return output.join('')
}

function closeHtmlStack(stack, name) {
  return stack.at(-1)?.name === name ? stack.pop() : null
}

function maskOneHtmlLine(text, signal) {
  const stack = []
  const ranges = []
  for (const tag of scanHtmlTags(text, signal)) {
    ranges.push({ start: tag.start, end: tag.end, tag: true })
    if (tag.selfClosing || HTML_VOID_TAGS.has(tag.name)) continue
    if (!tag.closing) {
      stack.push({ name: tag.name, start: tag.start })
      continue
    }
    const opening = closeHtmlStack(stack, tag.name)
    if (!opening) continue
    if (!stack.length) ranges.push({ start: opening.start, end: tag.end, tag: false })
  }
  let pending = null
  if (stack.length) {
    const containerPrefix = /^(?: {0,3}>[ \t]?)+/u.exec(text)?.[0].length ?? 0
    const opening = stack[0]
    pending = {
      blankLineBlock: opening.start <= containerPrefix + 3
        && (HTML_BLOCK_TAGS.has(opening.name) || opening.name.includes('-')),
      stack,
      start: opening.start,
    }
  }
  const completed = ranges.filter(range => range.tag || !pending || range.end <= pending.start)
  return { pending, text: maskHtmlRanges(text, completed, signal) }
}

function pairedHtmlStarts(lines, signal) {
  const stack = []
  const paired = new Set()
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    signal?.throwIfAborted()
    for (const tag of scanHtmlTags(lines[lineIndex].text, signal)) {
      if (!tag.closing && !tag.selfClosing && !HTML_VOID_TAGS.has(tag.name)) {
        stack.push({
          key: `${String(lineIndex)}:${String(tag.start)}`,
          name: tag.name,
          start: tag.start,
        })
        continue
      }
      if (!tag.closing) continue
      const opening = closeHtmlStack(stack, tag.name)
      if (opening) paired.add(opening.key)
    }
  }
  return paired
}

function maskHtmlVisibleLines(lines, signal) {
  const output = lines.map(line => ({ ...line }))
  const paired = pairedHtmlStarts(output, signal)
  let block = null
  const maskPending = (endLine, endOffset) => {
    for (let index = block.startLine; index <= endLine; index += 1) {
      const start = index === block.startLine ? block.start : 0
      const end = index === endLine ? endOffset : output[index].text.length
      output[index].text = maskHtmlRanges(output[index].text, [{ start, end }], signal)
    }
  }

  for (let lineIndex = 0; lineIndex < output.length; lineIndex += 1) {
    signal?.throwIfAborted()
    const line = output[lineIndex]
    if (block && !line.text.trim() && block.blankLineBlock) {
      maskPending(lineIndex - 1, output[lineIndex - 1]?.text.length ?? 0)
      block = null
    }
    if (block) {
      const stack = block.stack
      let closeEnd = null
      for (const tag of scanHtmlTags(line.text, signal)) {
        if (!tag.closing && !tag.selfClosing && !HTML_VOID_TAGS.has(tag.name)) {
          stack.push({ name: tag.name, start: tag.start })
          continue
        }
        if (!tag.closing || !closeHtmlStack(stack, tag.name)) continue
        if (!stack.length) {
          closeEnd = tag.end
          break
        }
      }
      if (closeEnd == null) continue
      maskPending(lineIndex, closeEnd)
      block = null
    }

    const parsed = maskOneHtmlLine(line.text, signal)
    line.text = parsed.text
    if (parsed.pending) {
      const key = `${String(lineIndex)}:${String(parsed.pending.start)}`
      if (parsed.pending.blankLineBlock || paired.has(key)) {
        block = { ...parsed.pending, startLine: lineIndex }
      }
    }
  }
  if (block?.blankLineBlock) {
    maskPending(output.length - 1, output.at(-1)?.text.length ?? 0)
  }
  return output
}

function visibleMarkdownLines(lines, bodyStart, signal) {
  const visible = []
  let fence = null
  const state = { region: null }
  for (let index = bodyStart; index < lines.length; index += 1) {
    signal?.throwIfAborted()
    const line = lines[index]
    const containerLine = line.replace(/^(?: {0,3}>[ \t]?)+/u, '')
    const activeRegion = Boolean(state.region)
    const parsedFence = activeRegion ? null : parseMarkdownFence(containerLine)
    if (fence) {
      if (
        parsedFence
        && parsedFence.marker === fence.marker
        && parsedFence.length >= fence.length
        && parsedFence.trailing.trim() === ''
      ) fence = null
      continue
    }
    if (parsedFence) {
      fence = parsedFence
      continue
    }
    if (!activeRegion && /^(?: {4}|\t)/u.test(containerLine)) continue
    visible.push({ index, line: index + 1, text: maskMarkdownLine(line, state, signal) })
  }
  return maskHtmlVisibleLines(visible, signal)
}

function inlineMarkdownTags(visibleLines) {
  const tags = []
  for (const { text } of visibleLines) {
    for (const match of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu)) {
      tags.push(match[1])
    }
  }
  return tags
}

function collectMarkdownHeadings(lines, bodyStart, visibleLines = visibleMarkdownLines(lines, bodyStart)) {
  return visibleLines.flatMap(line => {
    const match = line.text.match(/^(#{1,6})\s+(.+)$/u)
    return match ? [{
      depth: match[1].length,
      index: line.index,
      title: match[2].replace(/[ \t]+#+[ \t]*$/u, '').trim(),
    }] : []
  })
}

function markdownDetails(content, relativePath, signal) {
  const lines = content.split(/\r?\n/u)
  let bodyStart = 0
  let propertyLines = []
  let title = ''
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && ['---', '...'].includes(line.trim()))
    if (end > 0) {
      bodyStart = end + 1
      propertyLines = lines.slice(1, end).map((text, index) => ({ line: index + 2, text }))
      const titleLine = propertyLines.find(({ text }) => /^title\s*:/iu.test(text))
      if (titleLine) title = unquote(titleLine.text.replace(/^title\s*:/iu, ''))
    }
  }
  const visibleLines = visibleMarkdownLines(lines, bodyStart, signal)
  if (!title) title = collectMarkdownHeadings(lines, bodyStart, visibleLines)[0]?.title ?? ''
  if (!title) title = path.basename(relativePath, path.extname(relativePath))
  const properties = frontmatterProperties(propertyLines)
  const tasks = visibleLines.flatMap(item => {
    const match = item.text.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/u)
    return match ? [{
      done: match[1].toLowerCase() === 'x',
      line: item.line,
      text: match[2],
    }] : []
  })
  const tags = [...new Set([
    ...frontmatterTags(propertyLines),
    ...inlineMarkdownTags(visibleLines),
  ])].sort((left, right) => left.localeCompare(right))
  return { bodyStart, lines, properties, propertyLines, tags, tasks, title, visibleLines }
}

function maskedMarkdownSource(content, relativePath, signal, details = null) {
  const visibleByIndex = new Map(
    (details ?? markdownDetails(content, relativePath, signal)).visibleLines
      .map(line => [line.index, line.text]),
  )
  const parts = content.split(/(\r?\n)/u)
  let lineIndex = 0
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]
    parts[index] = visibleByIndex.get(lineIndex) ?? ' '.repeat(line.length)
    lineIndex += 1
  }
  return parts.join('')
}

function* scanInlineLinkSpans(source, signal) {
  for (
    let cursor = source.indexOf('[');
    cursor >= 0 && cursor < source.length - 3;
    cursor = source.indexOf('[', cursor + 1)
  ) {
    signal.throwIfAborted()
    const image = source[cursor - 1] === '!'
    const start = image ? cursor - 1 : cursor
    let labelEnd = cursor + 1
    const labelLimit = Math.min(source.length, cursor + MAX_INLINE_DESTINATION_CHARS + 1)
    while (labelEnd < labelLimit) {
      signal.throwIfAborted()
      if (source[labelEnd] === '\\') {
        labelEnd += 2
        continue
      }
      if (source[labelEnd] === ']') break
      labelEnd += 1
    }
    if (labelEnd >= labelLimit || source[labelEnd + 1] !== '(') {
      cursor = labelEnd
      continue
    }
    const destinationStart = labelEnd + 2
    let depth = 0
    let closing = -1
    for (let index = destinationStart; index < source.length; index += 1) {
      signal.throwIfAborted()
      const character = source[index]
      if (character === '\\') {
        index += 1
        continue
      }
      if (character === '(') {
        depth += 1
        if (depth > MAX_INLINE_DESTINATION_DEPTH) break
      } else if (character === ')') {
        if (depth === 0) {
          closing = index
          break
        }
        depth -= 1
      }
      if (index - destinationStart > MAX_INLINE_DESTINATION_CHARS) break
    }
    if (closing < 0) continue
    const raw = source.slice(destinationStart, closing)
    const title = raw.match(/[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\))[ \t]*$/u)
    const destinationEnd = title?.index ?? raw.length
    const destination = raw.slice(0, destinationEnd).trim()
    if (!destination || destination.length > MAX_INLINE_DESTINATION_CHARS) continue
    yield {
      destination,
      destinationEnd: destinationStart + destinationEnd,
      destinationStart,
      end: closing + 1,
      image,
      linkText: source.slice(cursor + 1, labelEnd),
      start,
    }
    cursor = closing
  }
}

function referenceContainer(line) {
  let cursor = 0
  let depth = 0
  while (depth < 64) {
    let marker = cursor
    while (marker - cursor < 3 && line[marker] === ' ') marker += 1
    if (line[marker] !== '>') break
    depth += 1
    cursor = marker + 1
    if (line[cursor] === ' ' || line[cursor] === '\t') cursor += 1
  }
  return { contentStart: cursor, depth }
}

function referenceTitleStart(value) {
  const leading = value.length - value.trimStart().length
  const marker = value[leading]
  return ['"', "'", '('].includes(marker)
    ? { close: marker === '(' ? ')' : marker, offset: leading }
    : null
}

function hasUnescapedTitleClose(value, close, start) {
  let index = value.indexOf(close, start)
  while (index !== -1) {
    if (!isEscapedSyntax(value, index)) return true
    index = value.indexOf(close, index + 1)
  }
  return false
}

function* scanReferenceDestinationSpans(source, signal) {
  let lineStart = 0
  let pendingTitleDepth = null
  let title = null
  while (lineStart <= source.length) {
    signal.throwIfAborted()
    const newline = source.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? source.length : newline
    const contentEnd = source[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd
    const line = source.slice(lineStart, contentEnd)
    const container = referenceContainer(line)
    const containerText = line.slice(container.contentStart)
    if (title) {
      if (container.depth === title.depth && title.lines < 64) {
        title.lines += 1
        if (hasUnescapedTitleClose(containerText, title.close, 0)) title = null
        if (newline < 0) break
        lineStart = newline + 1
        continue
      }
      title = null
    }
    if (pendingTitleDepth != null) {
      const possibleTitle = referenceTitleStart(containerText)
      if (container.depth === pendingTitleDepth && possibleTitle) {
        if (!hasUnescapedTitleClose(containerText, possibleTitle.close, possibleTitle.offset + 1)) {
          title = { close: possibleTitle.close, depth: container.depth, lines: 1 }
        }
        pendingTitleDepth = null
        if (newline < 0) break
        lineStart = newline + 1
        continue
      }
      pendingTitleDepth = null
    }

    const match = line.match(/^(?: {0,3}>[ \t]?){0,64}[ \t]*\[((?:\\.|[^\]\\\r\n]){1,999})\]:[ \t]*/u)
    if (match && !match[1].trim().startsWith('^')) {
      const destinationStart = lineStart + match[0].length
      let destinationEnd = destinationStart
      if (source[destinationStart] === '<') {
        const close = source.indexOf('>', destinationStart + 1)
        if (close > destinationStart + 1 && close <= contentEnd) destinationEnd = close + 1
      } else {
        while (
          destinationEnd < contentEnd
          && !/[\s<>]/u.test(source[destinationEnd])
        ) destinationEnd += 1
      }
      if (destinationEnd > destinationStart) {
        yield {
          destination: source.slice(destinationStart, destinationEnd),
          destinationEnd,
          destinationStart,
          label: match[1],
        }
        const suffix = source.slice(destinationEnd, contentEnd)
        const titleStart = referenceTitleStart(suffix)
        if (titleStart) {
          if (!hasUnescapedTitleClose(suffix, titleStart.close, titleStart.offset + 1)) {
            title = { close: titleStart.close, depth: container.depth, lines: 1 }
          }
        } else if (!suffix.trim()) {
          pendingTitleDepth = container.depth
        }
      }
    }
    if (newline < 0) break
    lineStart = newline + 1
  }
}

function markdownHeadings(content) {
  const details = markdownDetails(content, '')
  return {
    headings: collectMarkdownHeadings(details.lines, details.bodyStart, details.visibleLines),
    lines: details.lines,
  }
}

function markdownHeadingSelector(title, occurrence) {
  const selector = occurrence === 1 ? title : `${title}::${String(occurrence)}`
  if (selector.length <= MAX_METADATA_VALUE_CHARS) return selector
  const digest = createHash('sha256')
    .update(`${title}\0${String(occurrence)}`)
    .digest('base64url')
    .slice(0, 22)
  const suffix = `::@${digest}`
  return `${title.slice(0, MAX_METADATA_VALUE_CHARS - suffix.length)}${suffix}`
}

function markdownOutline(content) {
  const counts = new Map()
  return markdownHeadings(content).headings.map(heading => {
    const key = heading.title.toLowerCase()
    const occurrence = (counts.get(key) ?? 0) + 1
    counts.set(key, occurrence)
    return {
      level: heading.depth,
      line: heading.index + 1,
      selector: markdownHeadingSelector(heading.title, occurrence),
      text: heading.title,
    }
  })
}

function markdownSection(content, requestedHeading) {
  const selector = typeof requestedHeading === 'string'
    ? requestedHeading.replace(/^#+\s*/u, '').trim()
    : ''
  const occurrenceMatch = selector.match(/^(.*)::([1-9]\d*)$/u)
  const hashedMatch = selector.match(/^(.*)::@([A-Za-z0-9_-]{22})$/u)
  const heading = (occurrenceMatch?.[1] ?? (hashedMatch ? '' : selector)).toLowerCase()
  const occurrence = Number(occurrenceMatch?.[2] ?? 1)
  if (!heading && !hashedMatch) throw new Error('heading must be a non-empty string')
  const parsed = markdownHeadings(content)
  let selected
  if (hashedMatch) {
    const counts = new Map()
    selected = parsed.headings.find(candidate => {
      const key = candidate.title.toLowerCase()
      const candidateOccurrence = (counts.get(key) ?? 0) + 1
      counts.set(key, candidateOccurrence)
      return markdownHeadingSelector(candidate.title, candidateOccurrence) === selector
    })
  } else {
    selected = parsed.headings
      .filter(candidate => candidate.title.toLowerCase() === heading)[occurrence - 1]
  }
  if (!selected) throw new Error(`The ${requestedHeading} heading was not found.`)
  const next = parsed.headings.find(candidate => (
    candidate.index > selected.index && candidate.depth <= selected.depth
  ))
  const section = parsed.lines.slice(selected.index, next?.index ?? parsed.lines.length).join('\n')
  return content.endsWith('\n') && !section.endsWith('\n') ? `${section}\n` : section
}

function validateMarkdownSelector(value, name, pattern) {
  const selector = typeof value === 'string' ? value.trim() : ''
  if (!selector || selector.length > 200 || !pattern.test(selector)) {
    throw new Error(`${name} must be a valid single-line identifier`)
  }
  return selector
}

function precedingListBlock(lines, end) {
  let first = -1
  let blanks = 0
  let rootIndent = Number.POSITIVE_INFINITY
  let rootKind = null
  for (let index = end; index >= 0; index -= 1) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      blanks += 1
      if (blanks > 1) break
      continue
    }
    blanks = 0
    const marker = /^(\s*)([-+*]|\d+[.)])\s+/u.exec(line)
    if (marker) {
      const indent = marker[1].length
      const kind = /^\d/u.test(marker[2]) ? 'ordered' : marker[2]
      if (indent < rootIndent) {
        rootIndent = indent
        rootKind = kind
        first = index
      } else if (indent === rootIndent) {
        if (kind !== rootKind) break
        first = index
      }
      continue
    }
    if (/^\s+\S/u.test(line)) continue
    break
  }
  return first < 0 ? null : lines.slice(first, end + 1).join('\n').trimEnd()
}

function markdownBlock(content, requestedBlockId) {
  const blockId = validateMarkdownSelector(requestedBlockId, 'blockId', /^[A-Za-z0-9-]+$/u)
  const details = markdownDetails(content, '')
  const escaped = escapeRegex(blockId)
  const pattern = new RegExp(`(^|\\s)\\^${escaped}\\s*$`, 'u')
  const matches = details.visibleLines.filter(line => {
    const match = pattern.exec(line.text)
    return match && !isEscapedSyntax(line.text, match.index + match[1].length)
  })
  if (matches.length === 0) throw new Error(`The ${blockId} block ID was not found.`)
  if (matches.length > 1) throw new Error(`The ${blockId} block ID is ambiguous.`)
  const selected = matches[0]
  const standalone = new RegExp(`^\\s*\\^${escaped}\\s*$`, 'u').test(selected.text)
  if (!standalone) {
    return details.lines[selected.index]
      .replace(new RegExp(`\\s*\\^${escaped}\\s*$`, 'u'), '')
      .trimEnd()
  }

  const visibleIndexes = new Set(details.visibleLines.map(line => line.index))
  let end = selected.index - 1
  while (end >= details.bodyStart && !details.lines[end].trim()) end -= 1
  if (end < details.bodyStart || !visibleIndexes.has(end)) {
    throw new Error(`The ${blockId} block ID was not found.`)
  }
  const list = precedingListBlock(details.lines, end)
  if (list) return list
  let start = end
  while (
    start > details.bodyStart
    && details.lines[start - 1].trim()
    && visibleIndexes.has(start - 1)
  ) start -= 1
  return details.lines.slice(start, end + 1).join('\n').trimEnd()
}

function markdownFootnote(content, requestedFootnote) {
  const footnote = validateMarkdownSelector(requestedFootnote, 'footnote', /^[^\]\r\n]+$/u)
  const details = markdownDetails(content, '')
  const pattern = new RegExp(`^ {0,3}\\[\\^${escapeRegex(footnote)}\\]:`, 'u')
  const matches = details.visibleLines.filter(line => pattern.test(line.text))
  if (matches.length === 0) throw new Error(`The ${footnote} footnote was not found.`)
  if (matches.length > 1) throw new Error(`The ${footnote} footnote is ambiguous.`)
  const start = matches[0].index
  let end = start + 1
  while (
    end < details.lines.length
    && /^(?: {2,}|\t)/u.test(details.lines[end])
  ) end += 1
  return details.lines.slice(start, end).join('\n').trimEnd()
}

const INLINE_FOOTNOTE_PATTERN = /\^\[([^\[\]\r\n]+)\]/gu

// Ported from Tockbot a1f11e92236df639c3f5b004feee62bb9c2e0a57
// apps/web/src/components/notes/NotesFootnotes.ts (inline form only, Pennivo adaptation retained).
function inlineFootnotes(content) {
  const details = markdownDetails(content, '')
  const footnotes = []
  for (const line of details.visibleLines) {
    for (const match of line.text.matchAll(INLINE_FOOTNOTE_PATTERN)) {
      if (isEscapedSyntax(line.text, match.index)) continue
      const source = details.lines[line.index].slice(match.index, match.index + match[0].length)
      if (!source.slice(2, -1).trim()) continue
      footnotes.push({ line: line.line, source })
    }
  }
  return footnotes.map((footnote, index) => ({
    ordinal: index + 1,
    kind: 'inline',
    content: footnote.source.slice(2, -1).trim().slice(0, MAX_METADATA_VALUE_CHARS),
    line: footnote.line,
    source: footnote.source,
  }))
}

function markdownInlineFootnote(content, ordinal) {
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new Error('inlineFootnote must be a positive integer')
  }
  const found = inlineFootnotes(content)[ordinal - 1]
  if (!found) throw new Error(`The inline footnote ${String(ordinal)} was not found.`)
  return found.source
}

function authoredLineRecords(content) {
  const records = []
  let start = 0
  for (const match of content.matchAll(/\r\n|\n|\r/gu)) {
    records.push({ text: content.slice(start, match.index), ending: match[0] })
    start = match.index + match[0].length
  }
  records.push({ text: content.slice(start), ending: '' })
  return records
}

function embeddedQueryBlocks(content) {
  const records = authoredLineRecords(content)
  const bodyStart = markdownDetails(content, '').bodyStart
  const state = { region: null }
  const queries = []
  let fence = null
  let metadataTruncated = false
  for (let index = bodyStart; index < records.length; index += 1) {
    const line = records[index]
    const activeRegion = Boolean(state.region)
    const parsed = activeRegion ? null : parseMarkdownFence(line.text)
    if (fence) {
      if (
        parsed
        && parsed.marker === fence.marker
        && parsed.length >= fence.length
        && parsed.trailing.trim() === ''
      ) {
        if (fence.query) {
          const interior = records.slice(fence.index + 1, index)
          const authored = interior.map((record, interiorIndex) => (
            record.text + (interiorIndex < interior.length - 1 ? record.ending : '')
          )).join('')
          const authoredFence = fence.marker.repeat(fence.length)
          if (
            authored.length > MAX_METADATA_VALUE_CHARS
            || authoredFence.length > MAX_METADATA_VALUE_CHARS
          ) metadataTruncated = true
          queries.push({
            ordinal: queries.length + 1,
            query: authored.slice(0, MAX_METADATA_VALUE_CHARS),
            line: fence.index + 1,
            lineEnd: index + 1,
            fence: authoredFence.slice(0, MAX_METADATA_VALUE_CHARS),
          })
        }
        fence = null
      }
      continue
    }
    if (parsed) {
      fence = {
        ...parsed,
        index,
        query: /^query$/iu.test(parsed.trailing.trim()),
      }
      continue
    }
    if (!activeRegion && /^(?: {4}|\t)/u.test(line.text)) continue
    maskMarkdownLine(line.text, state)
  }
  return { queries, metadataTruncated }
}

function canvasSearchLines(content) {
  try {
    const parsed = JSON.parse(content)
    const values = [
      ...(Array.isArray(parsed.nodes)
        ? parsed.nodes.flatMap(node => [node?.text, node?.file, node?.url, node?.label])
        : []),
      ...(Array.isArray(parsed.edges) ? parsed.edges.map(edge => edge?.label) : []),
    ]
    return values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
  } catch {
    return [content]
  }
}

function cursorChecksum(payload) {
  return createHash('sha256').update(payload).digest('base64url')
}

function encodeCursor(operation, key, position) {
  const payload = JSON.stringify({ key, operation, position, version: 1 })
  return Buffer.from(JSON.stringify({ checksum: cursorChecksum(payload), payload })).toString('base64url')
}

function decodeCursor(cursor, operation, key) {
  if (cursor == null) return { path: '', offset: 0 }
  if (typeof cursor !== 'string' || cursor === '' || cursor.length > 4096) {
    throw new Error('invalid cursor')
  }
  try {
    const bytes = Buffer.from(cursor, 'base64url')
    if (bytes.toString('base64url') !== cursor) throw new Error('non-canonical cursor')
    const envelope = JSON.parse(bytes.toString('utf8'))
    if (
      typeof envelope?.payload !== 'string'
      || typeof envelope?.checksum !== 'string'
      || cursorChecksum(envelope.payload) !== envelope.checksum
    ) throw new Error('cursor checksum mismatch')
    const decoded = JSON.parse(envelope.payload)
    if (decoded?.version !== 1 || decoded.operation !== operation || decoded.key !== key) {
      throw new Error('cursor does not match this operation')
    }
    if (
      typeof decoded.position?.path !== 'string'
      || decoded.position.path.includes('\0')
      || !Number.isInteger(decoded.position.offset)
      || decoded.position.offset < 0
      || (
        decoded.position.incompleteReason != null
        && !['byte-limit', 'entry-limit', 'file-limit', 'metadata-limit', 'result-limit']
          .includes(decoded.position.incompleteReason)
      )
    ) throw new Error('invalid cursor position')
    return decoded.position
  } catch (error) {
    if (error?.message === 'cursor does not match this operation') throw error
    throw new Error('invalid cursor')
  }
}

function boundedStateWarnings(state) {
  let truncated = false
  const warnings = state.warnings.slice(0, MAX_SCAN_WARNINGS).map(warning => {
    if (warning.length <= MAX_METADATA_VALUE_CHARS) return warning
    truncated = true
    return warning.slice(0, MAX_METADATA_VALUE_CHARS)
  })
  if (truncated) {
    state.truncated = true
    state.truncationReason ??= 'metadata-limit'
  }
  return warnings
}

function scanOutput(state) {
  const warnings = boundedStateWarnings(state)
  return {
    cursor: state.cursor,
    scan: { bytes: state.bytes, entries: state.entries, files: state.files },
    truncationReason: state.truncationReason,
    warnings,
  }
}

function markOutputMetadataTruncated(state, warning) {
  state.truncated = true
  state.truncationReason ??= 'metadata-limit'
  if (
    warning
    && state.warnings.length < MAX_SCAN_WARNINGS
    && !state.warnings.includes(warning)
  ) state.warnings.push(warning)
}

function markOutputResultTruncated(state, warning) {
  state.truncated = true
  state.truncationReason = 'result-limit'
  if (
    warning
    && state.warnings.length < MAX_SCAN_WARNINGS
    && !state.warnings.includes(warning)
  ) state.warnings.push(warning)
}

function boundedOutputString(value, state, warning) {
  if (value == null || value.length <= MAX_METADATA_VALUE_CHARS) return value
  markOutputMetadataTruncated(state, warning)
  return value.slice(0, MAX_METADATA_VALUE_CHARS)
}

function boundedOutputValues(values, state, warning) {
  if (
    values.length > MAX_METADATA_VALUES
    || values.some(value => value.length > MAX_METADATA_VALUE_CHARS)
  ) markOutputMetadataTruncated(state, warning)
  return values.slice(0, MAX_METADATA_VALUES)
    .map(value => value.slice(0, MAX_METADATA_VALUE_CHARS))
}

function boundSearchMatches(matches, state) {
  for (const match of matches) {
    match.preview = boundedOutputString(
      match.preview,
      state,
      `${match.path}: truncated search preview`,
    )
  }
}

function safeInspectionPath(value, { hidden = false } = {}) {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) return null
  if (
    value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || /^[A-Za-z]:/u.test(value)
  ) return null
  const segments = value.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null
  if (!hidden && isHiddenVaultPath(value)) return null
  return value
}

function isHiddenInspectionRequest(value) {
  return typeof value === 'string'
    && !value.includes('\\')
    && !path.posix.isAbsolute(value)
    && !path.win32.isAbsolute(value)
    && !/^[A-Za-z]:/u.test(value)
    && value.split('/').every(segment => segment && segment !== '.' && segment !== '..')
    && isHiddenVaultPath(value)
}

function inspectionDirectory(requestedDirectory) {
  if (requestedDirectory == null || requestedDirectory === '') return { path: '', prefix: '' }
  const directory = safeInspectionPath(requestedDirectory)
  if (!directory) {
    if (isHiddenInspectionRequest(requestedDirectory)) {
      throw new Error('Hidden vault paths are not allowed.')
    }
    throw new Error('Vault paths must stay inside the configured vault.')
  }
  return { path: directory, prefix: `${directory}/` }
}

function normalizeInventoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const entryPath = safeInspectionPath(entry.path)
  if (!entryPath) return null
  if (!Number.isFinite(entry.createdMs) || !Number.isFinite(entry.modifiedMs)) return null
  if (!Number.isInteger(entry.size) || entry.size < 0) return null
  if (
    entry.revision !== undefined
    && (typeof entry.revision !== 'string' || !entry.revision || entry.revision.length > 4096)
  ) return null
  if (entry.kind === 'document') {
    return isVaultDocument(entryPath) ? { ...entry, path: entryPath } : null
  }
  const mediaKind = attachmentMediaKind(entryPath)
  if (
    entry.kind !== 'attachment'
    || mediaKind == null
    || entry.mediaKind !== mediaKind
  ) return null
  return { ...entry, path: entryPath }
}

function validateInventoryPage(page) {
  if (!page || typeof page !== 'object' || !Array.isArray(page.entries)) {
    throw new Error('Vault inventory provider returned an invalid page.')
  }
  if (
    page.cursor !== null
    && (typeof page.cursor !== 'string' || page.cursor === '' || page.cursor.length > 4096)
  ) {
    throw new Error('Vault inventory provider returned an invalid cursor.')
  }
  if (typeof page.complete !== 'boolean' || typeof page.truncated !== 'boolean') {
    throw new Error('Vault inventory provider returned invalid completeness metadata.')
  }
  if (!Array.isArray(page.warnings)) {
    throw new Error('Vault inventory provider returned invalid warnings.')
  }
  if (
    page.truncationReason !== null
    && !['byte-limit', 'entry-limit', 'file-limit', 'metadata-limit', 'result-limit']
      .includes(page.truncationReason)
  ) throw new Error('Vault inventory provider returned an invalid truncation reason.')
  return page
}

function containsAbsolutePath(value) {
  return /(?:^|[\s="'`()=:])(?:[A-Za-z]:[\\/]|\\\\|\/\S)/u.test(value)
}

function boundedProviderWarning(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const warning = value.trim().slice(0, MAX_METADATA_VALUE_CHARS)
  return containsAbsolutePath(warning) ? 'vault inventory provider warning' : warning
}

async function collectInspectionInventory(input, config, signal, position, options) {
  const entries = []
  const warnings = []
  const seenPaths = new Set()
  const seenCursors = new Set()
  let providerCursor = null
  let entriesRead = 0
  let sourceIncompleteReason = null
  let sourceHasMore = false
  let lastEntry = position.path
  let previousProviderPath = null
  let providerPages = 0
  while (entriesRead < config.maxSearchEntries) {
    signal.throwIfAborted()
    providerPages += 1
    if (providerPages > MAX_PROVIDER_PAGES) {
      throw new Error('Vault inventory provider exceeded the page limit.')
    }
    const requestedLimit = Math.max(1, config.maxSearchEntries - entriesRead)
    const page = validateInventoryPage(await input.list({
      cursor: providerCursor,
      limit: requestedLimit,
    }, signal))
    signal.throwIfAborted()
    if (page.entries.length > requestedLimit) {
      throw new Error('Vault inventory provider exceeded the requested page limit.')
    }
    const pageEntriesRead = position.path
      ? page.entries.filter(entry => {
          const entryPath = safeInspectionPath(entry?.path)
          return entryPath && (
            compareVaultPaths(entryPath, position.path) > 0
            || (entryPath === position.path && position.offset > 0)
          )
        }).length
      : Number.isInteger(page[SCANNED_ENTRIES]) && page[SCANNED_ENTRIES] >= page.entries.length
        ? page[SCANNED_ENTRIES]
        : page.entries.length
    entriesRead += pageEntriesRead
    for (const warning of page.warnings.slice(0, MAX_SCAN_WARNINGS - warnings.length)) {
      signal.throwIfAborted()
      const bounded = boundedProviderWarning(warning)
      if (bounded && warnings.length < MAX_SCAN_WARNINGS) warnings.push(bounded)
    }
    for (const rawEntry of page.entries) {
      signal.throwIfAborted()
      const entry = normalizeInventoryEntry(rawEntry)
      if (!entry) throw new Error('Vault inventory provider returned an invalid entry.')
      if (
        previousProviderPath != null
        && compareVaultPaths(entry.path, previousProviderPath) <= 0
      ) throw new Error('Vault inventory provider entries must be strictly path ordered.')
      previousProviderPath = entry.path
      if (seenPaths.has(entry.path)) throw new Error('Vault inventory provider returned a duplicate entry.')
      seenPaths.add(entry.path)
      lastEntry = entry.path
      if (options.directory && !entry.path.startsWith(`${options.directory}/`)) continue
      if (position.path && compareVaultPaths(entry.path, position.path) < 0) continue
      if (position.path && entry.path === position.path && position.offset === 0) continue
      if (entry.kind === 'attachment' && !options.includeAttachments) continue
      if (entry.kind === 'document' && !options.includeDocuments) continue
      entries.push(entry)
    }
    if (page.cursor === null) {
      if (!page.complete || page.truncated) {
        sourceIncompleteReason = page.truncationReason ?? 'entry-limit'
      }
      break
    }
    if (seenCursors.has(page.cursor)) {
      throw new Error('Vault inventory provider repeated a cursor.')
    }
    seenCursors.add(page.cursor)
    providerCursor = page.cursor
    if (entriesRead >= config.maxSearchEntries) {
      sourceHasMore = true
      break
    }
  }
  return {
    entries: entries.sort((left, right) => compareVaultPaths(left.path, right.path)),
    entriesRead: Math.min(entriesRead, config.maxSearchEntries),
    hasMore: sourceHasMore,
    incompleteReason: sourceIncompleteReason,
    lastEntry,
    warnings,
  }
}

async function readInspectionDocument(input, requestedPath, limit, signal) {
  signal.throwIfAborted()
  const normalized = safeInspectionPath(requestedPath)
  if (!normalized) {
    if (isHiddenInspectionRequest(requestedPath)) {
      throw new Error('Hidden vault paths are not allowed.')
    }
    throw new Error('Vault paths must stay inside the configured vault.')
  }
  if (!isVaultDocument(normalized)) {
    throw new Error('Vault reads support Markdown, Canvas, or Base files only.')
  }
  let document
  try {
    document = await input.read(normalized, limit, signal)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (
      (error?.message?.startsWith('Vault ') || error?.message?.startsWith('Hidden '))
      && !containsAbsolutePath(error.message)
    ) throw error
    if (/byte cap|byte limit|too large|exceeds/iu.test(error?.message ?? '')) {
      throw new Error(`Vault file exceeds the configured ${String(limit)}-byte limit.`)
    }
    throw new Error('Vault path could not be opened safely.')
  }
  signal.throwIfAborted()
  if (
    !document
    || document.path !== normalized
    || typeof document.content !== 'string'
    || Buffer.byteLength(document.content) > limit
  ) {
    if (typeof document?.content === 'string' && Buffer.byteLength(document.content) > limit) {
      throw new Error(`Vault file exceeds the configured ${String(limit)}-byte limit.`)
    }
    throw new Error('Vault inspection provider returned an invalid document.')
  }
  return { path: normalized, content: document.content }
}

async function scanVault(input, config, signal, visitor, options = {}) {
  const {
    cursor,
    key = '',
    operation = 'scan',
    directory = '',
    includeAttachments = false,
    includeDocuments = true,
    onAttachment = null,
  } = options
  const position = decodeCursor(cursor, operation, key)
  const state = {
    bytes: 0,
    cursor: null,
    entries: 0,
    files: 0,
    truncated: false,
    truncationReason: null,
    warnings: [],
  }
  const warn = message => {
    if (state.warnings.length < MAX_SCAN_WARNINGS) state.warnings.push(message)
  }
  let collection
  try {
    const inventoryInput = directory && typeof input[DIRECTORY_SCOPED_INPUT] === 'function'
      ? input[DIRECTORY_SCOPED_INPUT](directory)
      : input
    collection = await collectInspectionInventory(inventoryInput, config, signal, position, {
      directory,
      includeAttachments,
      includeDocuments,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (error?.message?.startsWith('Vault ') && !containsAbsolutePath(error.message)) throw error
    throw new Error('Vault scan failed safely.')
  }
  const items = collection.entries
  signal.throwIfAborted()
  const inventoryPaths = Object.freeze(items.map(candidate => candidate.path))
  signal.throwIfAborted()
  state.entries = collection.entriesRead
  state.lastPath = position.path
  state.sourceEnd = collection.lastEntry
  for (const warning of collection.warnings) warn(warning)

  // ponytail: scan on demand; add an mtime cache when large-vault latency is measured.
  for (let index = 0; index < items.length; index += 1) {
    signal.throwIfAborted()
    const item = items[index]
    if (item.kind === 'attachment') {
      state.files += 1
      state.lastPath = item.path
      await onAttachment?.({
        path: item.path,
        createdMs: item.createdMs,
        modifiedMs: item.modifiedMs,
        size: item.size,
        mediaKind: item.mediaKind,
      })
      continue
    }
    state.files += 1
    if (item.size > config.maxSearchFileBytes) {
      state.lastPath = item.path
      state.truncated = true
      state.truncationReason ??= 'file-limit'
      warn(`${item.path}: exceeds the per-file scan limit`)
      continue
    }
    const remaining = config.maxSearchBytes - state.bytes
    if (item.size > remaining) {
      state.truncated = true
      state.truncationReason = 'byte-limit'
      if (state.bytes === 0) {
        state.lastPath = item.path
        warn(`${item.path}: exceeds the aggregate scan limit`)
        continue
      }
      state.cursor = encodeCursor(operation, key, { path: state.lastPath, offset: 0 })
      break
    }
    let document
    try {
      document = await readInspectionDocument(
        input,
        item.path,
        Math.min(config.maxSearchFileBytes, remaining),
        signal,
      )
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      state.lastPath = item.path
      state.truncated = true
      state.truncationReason ??= 'file-limit'
      warn(`${item.path}: could not be opened safely`)
      continue
    }
    const byteLength = Buffer.byteLength(document.content)
    state.bytes += byteLength
    state.lastPath = item.path
    const result = await visitor({
      content: document.content,
      createdMs: item.createdMs,
      modifiedMs: item.modifiedMs,
      path: item.path,
      size: byteLength,
    }, inventoryPaths, item.path === position.path ? position.offset : 0)
    if (result) {
      const nextPosition = typeof result === 'object' && result.position
        ? result.position
        : { path: item.path, offset: 0 }
      const hasMore = nextPosition.offset > 0 || index < items.length - 1
      if (hasMore) {
        state.truncated = true
        state.truncationReason = 'result-limit'
        state.cursor = encodeCursor(operation, key, nextPosition)
      }
      break
    }
  }
  if (!state.cursor && collection.hasMore) {
    state.truncated = true
    state.truncationReason = 'entry-limit'
    if (state.sourceEnd) {
      state.cursor = encodeCursor(operation, key, { path: state.sourceEnd, offset: 0 })
    }
  }
  if (collection.incompleteReason) {
    state.truncated = true
    state.truncationReason ??= collection.incompleteReason
  }
  return state
}

async function searchVault(input, query, scope, limit, config, signal, cursor) {
  const matches = []
  const needle = query.toLowerCase()
  const propertyNeedle = needle.length > 1 && needle.startsWith('#') ? needle.slice(1) : needle
  const key = JSON.stringify({ query: needle, scope })
  const state = await scanVault(input, config, signal, (document, _paths, resumeOffset) => {
    const documentMatches = []
    const markdown = isMarkdown(document.path)
      ? markdownDetails(document.content, document.path)
      : null
    const title = markdown?.title ?? path.basename(document.path, path.extname(document.path))

    if (
      (scope === 'all' || scope === 'path')
      && `${title}\n${document.path}`.toLowerCase().includes(needle)
    ) documentMatches.push({
      path: document.path,
      kind: 'path',
      line: null,
      preview: `${title} — ${document.path}`,
    })

    if (markdown && (scope === 'all' || scope === 'properties')) {
      for (const property of markdown.propertyLines) {
        signal.throwIfAborted()
        const column = property.text.toLowerCase().indexOf(propertyNeedle)
        if (column !== -1) documentMatches.push({
          path: document.path,
          kind: 'property',
          line: property.line,
          preview: previewLine(property.text, column),
        })
      }
    }

    if (scope === 'all' || scope === 'content') {
      const lines = markdown
        ? markdown.lines.slice(markdown.bodyStart).map((text, index) => ({
            line: markdown.bodyStart + index + 1,
            text,
          }))
        : isBase(document.path)
          ? document.content.split(/\r?\n/u).map((text, index) => ({ line: index + 1, text }))
          : canvasSearchLines(document.content).map(text => ({ line: null, text }))
      for (const line of lines) {
        signal.throwIfAborted()
        const column = line.text.toLowerCase().indexOf(needle)
        if (column !== -1) documentMatches.push({
          path: document.path,
          kind: markdown ? 'content' : isBase(document.path) ? 'base' : 'canvas',
          line: line.line,
          preview: previewLine(line.text, column),
        })
      }
    }

    documentMatches.sort((left, right) => (
      (left.line ?? -1) - (right.line ?? -1)
      || left.kind.localeCompare(right.kind)
    ))
    const available = documentMatches.slice(resumeOffset)
    const taken = available.slice(0, limit - matches.length)
    matches.push(...taken)
    if (taken.length < available.length) {
      return { position: { path: document.path, offset: resumeOffset + taken.length } }
    }
    return matches.length >= limit
  }, { cursor, key, operation: 'search' })
  boundSearchMatches(matches, state)

  return {
    matches,
    query,
    truncated: state.truncated,
    ...scanOutput(state),
  }
}

function patternIndex(pattern, value, signal) {
  signal.throwIfAborted()
  pattern.lastIndex = 0
  const index = pattern.exec(value)?.index ?? -1
  signal.throwIfAborted()
  return index
}

function allPatternsMatch(patterns, value, signal) {
  return patterns.every(pattern => patternIndex(pattern, value, signal) !== -1)
}

function tagMatches(tags, requestedTag) {
  const normalized = requestedTag.toLowerCase()
  return tags.some(tag => {
    const candidate = tag.toLowerCase()
    return candidate === normalized || candidate.startsWith(`${normalized}/`)
  })
}

function structuredTermMatches(term, document, signal) {
  signal.throwIfAborted()
  if (!isMarkdown(document.path)) return []
  const details = markdownDetails(document.content, document.path)
  if (term.field === 'property') {
    const property = details.properties.get(term.key)
    if (!property || (term.nullValue && !property.isNull)) return []
    const value = (property.values.length ? property.values : [property.value]).join('\n')
    if (term.patterns && !allPatternsMatch(term.patterns, value, signal)) return []
    return [{
      path: document.path,
      kind: 'property',
      line: property.line,
      lineEnd: property.line,
      operator: 'property',
      preview: `${term.key}: ${property.value}`,
      provenance: 'frontmatter',
    }]
  }
  if (term.field === 'tag') {
    if (!tagMatches(details.tags, term.tag)) return []
    const property = details.properties.get('tags') ?? details.properties.get('tag')
    const bodyLine = details.visibleLines.find(item => {
      signal.throwIfAborted()
      return tagMatches(
      [...item.text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu)].map(match => match[1]),
        term.tag,
      )
    })
    const line = bodyLine?.line ?? property?.line ?? null
    return [{
      path: document.path,
      kind: 'tag',
      line,
      lineEnd: line,
      operator: 'tag',
      preview: bodyLine?.text.trim() || `${property?.key ?? 'tags'}: ${property?.value ?? term.tag}`,
      provenance: bodyLine ? 'body' : 'frontmatter',
    }]
  }
  if (term.field === 'task') {
    const task = details.tasks.find(item => {
      signal.throwIfAborted()
      return (term.status === 'any' || item.done === (term.status === 'done'))
        && allPatternsMatch(term.patterns, item.text, signal)
    })
    if (!task) return []
    return [{
      path: document.path,
      kind: 'task',
      line: task.line,
      lineEnd: task.line,
      operator: term.operator,
      preview: `${task.done ? '[x]' : '[ ]'} ${task.text}`,
      provenance: 'task',
    }]
  }
  if (term.field === 'line') {
    const line = details.visibleLines.find(item => {
      signal.throwIfAborted()
      return allPatternsMatch(term.patterns, item.text, signal)
    })
    return line ? [{
      path: document.path,
      kind: 'line',
      line: line.line,
      lineEnd: line.line,
      operator: 'line',
      preview: line.text.trim().slice(0, MAX_PREVIEW_CHARS),
      provenance: 'body',
    }] : []
  }
  if (term.field === 'block') {
    const blocks = []
    let block = []
    for (const line of [...details.visibleLines, { text: '' }]) {
      signal.throwIfAborted()
      if (line.text.trim()) block.push(line)
      else if (block.length) {
        blocks.push(block)
        block = []
      }
    }
    const selected = blocks.find(lines => {
      signal.throwIfAborted()
      return allPatternsMatch(term.patterns, lines.map(line => line.text).join('\n'), signal)
    })
    return selected ? [{
      path: document.path,
      kind: 'block',
      line: selected[0].line,
      lineEnd: selected.at(-1).line,
      operator: 'block',
      preview: selected.map(line => line.text.trim()).join(' ').slice(0, MAX_PREVIEW_CHARS),
      provenance: 'body',
    }] : []
  }
  if (term.field === 'section') {
    const headings = collectMarkdownHeadings(details.lines, details.bodyStart)
    const selected = headings.map(heading => {
      signal.throwIfAborted()
      const next = headings.find(candidate => {
        signal.throwIfAborted()
        return candidate.index > heading.index && candidate.depth <= heading.depth
      })
      const lines = details.visibleLines.filter(line => {
        signal.throwIfAborted()
        return line.index >= heading.index && line.index < (next?.index ?? details.lines.length)
      })
      return { heading, lines }
    }).find(section => {
      signal.throwIfAborted()
      return allPatternsMatch(term.patterns, section.lines.map(line => line.text).join('\n'), signal)
    })
    return selected ? [{
      path: document.path,
      kind: 'section',
      line: selected.heading.index + 1,
      lineEnd: selected.lines.at(-1)?.line ?? selected.heading.index + 1,
      operator: 'section',
      preview: selected.lines.map(line => line.text.trim()).join(' ').slice(0, MAX_PREVIEW_CHARS),
      provenance: 'section',
    }] : []
  }
  return []
}

function queryTermMatches(term, document, signal) {
  signal.throwIfAborted()
  if (['block', 'line', 'property', 'section', 'tag', 'task'].includes(term.field)) {
    return structuredTermMatches(term, document, signal).length > 0
  }
  const basename = path.basename(document.path)
  if (term.field === 'file') return patternIndex(term.pattern, basename, signal) !== -1
  if (term.field === 'path') return patternIndex(term.pattern, document.path, signal) !== -1
  if (term.field === 'content') return patternIndex(term.pattern, document.content, signal) !== -1
  return patternIndex(term.pattern, document.content, signal) !== -1
    || patternIndex(term.pattern, document.path, signal) !== -1
}

function queryDocumentMatches(document, groups, signal) {
  const matches = []
  const seen = new Set()
  const add = match => {
    const key = `${match.kind}:${String(match.line)}:${match.operator ?? ''}`
    if (!seen.has(key)) {
      seen.add(key)
      matches.push(match)
    }
  }
  for (const group of groups) {
    signal.throwIfAborted()
    if (group.exclude.some(term => queryTermMatches(term, document, signal))) continue
    if (!group.include.every(term => queryTermMatches(term, document, signal))) continue
    if (group.include.length === 0) {
      add({ path: document.path, kind: 'path', line: null, preview: document.path })
      continue
    }
    for (const term of group.include) {
      signal.throwIfAborted()
      if (['block', 'line', 'property', 'section', 'tag', 'task'].includes(term.field)) {
        for (const match of structuredTermMatches(term, document, signal)) add(match)
        continue
      }
      const pathValue = term.field === 'file' ? path.basename(document.path) : document.path
      const pathColumn = term.field === 'content' ? -1 : patternIndex(term.pattern, pathValue, signal)
      if (pathColumn !== -1) add({
        path: document.path,
        kind: 'path',
        line: null,
        preview: document.path,
      })
      if (term.field === 'file' || term.field === 'path') continue
      const markdown = isMarkdown(document.path)
      const lines = markdown || isBase(document.path)
        ? document.content.split(/\r?\n/u).map((text, index) => ({ line: index + 1, text }))
        : canvasSearchLines(document.content).map(text => ({ line: null, text }))
      for (const line of lines) {
        signal.throwIfAborted()
        const column = patternIndex(term.pattern, line.text, signal)
        if (column === -1) continue
        add({
          path: document.path,
          kind: markdown ? 'content' : isBase(document.path) ? 'base' : 'canvas',
          line: line.line,
          preview: previewLine(line.text, column),
        })
      }
    }
  }
  return matches.sort((left, right) => (
    (left.line ?? -1) - (right.line ?? -1)
    || left.kind.localeCompare(right.kind)
  ))
}

async function searchQueryVault(input, query, options, limit, config, signal, cursor) {
  const groups = parseSearchQuery(query, options)
  const start = inspectionDirectory(options.directory)
  const key = JSON.stringify({
    caseSensitive: options.caseSensitive,
    directory: start.prefix,
    query,
    regex: options.regex,
    wholeWord: options.wholeWord,
  })
  const matches = []
  const state = await scanVault(input, config, signal, (document, _paths, resumeOffset) => {
    const documentMatches = queryDocumentMatches(document, groups, signal)
    const available = documentMatches.slice(resumeOffset)
    const taken = available.slice(0, limit - matches.length)
    matches.push(...taken)
    if (taken.length < available.length) {
      return { position: { path: document.path, offset: resumeOffset + taken.length } }
    }
    return matches.length >= limit
  }, { cursor, key, operation: 'query-search', directory: start.path })
  boundSearchMatches(matches, state)
  return {
    matches,
    query,
    truncated: state.truncated,
    ...scanOutput(state),
  }
}

function relatedToken(value) {
  const token = value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
  return token.length > 4 ? token.replace(/(?:ing|ed|es|s)$/u, '') : token
}

function relatedTokens(value) {
  const tokens = []
  for (const match of value.matchAll(WORD_PATTERN)) {
    const token = relatedToken(match[0])
    if (token.length >= 2 && !RELATED_STOP_WORDS.has(token)) tokens.push(token)
  }
  return tokens
}

async function searchRelatedVault(input, query, options, limit, config, signal, cursor) {
  const wanted = new Set(relatedTokens(query))
  const start = inspectionDirectory(options.directory)
  const key = JSON.stringify({ directory: start.prefix, query: [...wanted].sort() })
  const position = decodeCursor(cursor, 'related', key)
  const candidates = []
  const sourceCursor = position.path
    ? encodeCursor('related-source', key, { path: position.path, offset: 0 })
    : undefined
  const state = await scanVault(input, config, signal, document => {
    const pathScore = new Set(relatedTokens(document.path).filter(token => wanted.has(token))).size * 20
    const lines = isMarkdown(document.path) || isBase(document.path)
      ? document.content.split(/\r?\n/u).map((text, index) => ({ line: index + 1, text }))
      : canvasSearchLines(document.content).map(text => ({ line: null, text }))
    const scoredLines = lines.flatMap(line => {
      const matching = relatedTokens(line.text).filter(token => wanted.has(token))
      if (matching.length === 0) return []
      const score = new Set(matching).size * 10
        + matching.length
        + (/^#{1,6}\s/u.test(line.text) ? 4 : 0)
      return [{ ...line, score }]
    }).sort((left, right) => right.score - left.score || (left.line ?? 0) - (right.line ?? 0))
    const score = pathScore + scoredLines.reduce((sum, line) => sum + line.score, 0)
    if (score > 0) {
      const best = scoredLines[0]
      candidates.push({
        path: document.path,
        kind: best ? (isMarkdown(document.path) ? 'content' : isBase(document.path) ? 'base' : 'canvas') : 'path',
        line: best?.line ?? null,
        lineEnd: best?.line ?? null,
        operator: 'related',
        preview: best?.text.trim().slice(0, MAX_PREVIEW_CHARS) || document.path,
        provenance: best ? (isMarkdown(document.path) || isBase(document.path) ? 'body' : 'canvas') : 'path',
        score,
      })
    }
    return false
  }, { cursor: sourceCursor, key, operation: 'related-source', directory: start.path })
  const sourcePosition = state.cursor
    ? decodeCursor(state.cursor, 'related-source', key)
    : null
  candidates.sort((left, right) => right.score - left.score || compareVaultPaths(left.path, right.path))
  const matches = candidates.slice(position.offset, position.offset + limit)
  const pageHasMore = position.offset + matches.length < candidates.length
  const nextPosition = pageHasMore
    ? { path: position.path, offset: position.offset + matches.length }
    : sourcePosition
  state.cursor = nextPosition ? encodeCursor('related', key, nextPosition) : null
  if (pageHasMore) {
    state.truncated = true
    state.truncationReason = 'result-limit'
  }
  boundSearchMatches(matches, state)
  return {
    matches,
    query,
    truncated: state.truncated,
    ...scanOutput(state),
  }
}

// Ported from Tockbot a1f11e92236df639c3f5b004feee62bb9c2e0a57
// apps/web/src/components/notes/NotesEditorTools.ts (getNoteStats).
function documentStats(markdown) {
  const words = markdown.trim()
    .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  return {
    words,
    characters: markdown.length,
    headings: markdown.match(/^#{1,6}\s+.+$/gmu)?.length ?? 0,
    readingMinutes: Math.max(1, Math.ceil(words / 200)),
  }
}

function listedMetadata(document, markdown, state) {
  if (!markdown) return {
    aliases: [],
    properties: [],
    tasks: { done: 0, todo: 0, total: 0 },
  }
  const aliases = [...new Set(['alias', 'aliases'].flatMap(key => {
    const property = markdown.properties.get(key)
    if (!property) return []
    return property.values.length ? property.values : [property.value]
  }).map(value => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
  const allProperties = [...markdown.properties.values()]
  const properties = allProperties.slice(0, MAX_METADATA_PROPERTIES).map(property => {
    const allValues = property.values.length
      ? property.values
      : (property.isNull ? [] : [property.value])
    return {
      isNull: property.isNull,
      key: boundedOutputString(
        property.key,
        state,
        `${document.path}: truncated property metadata`,
      ),
      values: boundedOutputValues(
        allValues,
        state,
        `${document.path}: truncated property metadata`,
      ),
    }
  })
  if (allProperties.length > MAX_METADATA_PROPERTIES) {
    markOutputMetadataTruncated(
      state,
      `${document.path}: omitted properties after ${String(MAX_METADATA_PROPERTIES)}`,
    )
  }
  const done = markdown.tasks.filter(task => task.done).length
  return {
    aliases: boundedOutputValues(
      aliases,
      state,
      `${document.path}: truncated aliases`,
    ),
    properties,
    tasks: { done, todo: markdown.tasks.length - done, total: markdown.tasks.length },
  }
}

async function listVault(input, directory, sort, limit, config, signal, cursor, options = {}) {
  const kind = options.kind ?? 'documents'
  const includeStats = options.includeStats === true
  const documents = []
  const attachments = []
  const start = inspectionDirectory(directory)
  const key = JSON.stringify({ directory: start.prefix, sort, kind, includeStats })
  const position = decodeCursor(cursor, 'list', key)
  const sourceCursor = position.path
    ? encodeCursor('list-source', key, { path: position.path, offset: 0 })
    : undefined
  const state = await scanVault(input, config, signal, document => {
    documents.push(document)
    return false
  }, {
    cursor: sourceCursor,
    key,
    operation: 'list-source',
    directory: start.path,
    includeAttachments: kind !== 'documents',
    includeDocuments: kind !== 'attachments',
    onAttachment: attachment => {
      attachments.push(attachment)
    },
  })
  const sourcePosition = state.cursor
    ? decodeCursor(state.cursor, 'list-source', key)
    : null
  const entries = documents.map(document => {
    const markdown = isMarkdown(document.path)
      ? markdownDetails(document.content, document.path)
      : null
    return {
      path: document.path,
      title: boundedOutputString(
        markdown?.title ?? path.basename(document.path, path.extname(document.path)),
        state,
        `${document.path}: truncated title`,
      ),
      type: markdown ? 'markdown' : isBase(document.path) ? 'base' : 'canvas',
      modifiedMs: document.modifiedMs,
      createdMs: Number.isFinite(document.createdMs) ? document.createdMs : null,
      size: document.size,
      tags: boundedOutputValues(
        markdown?.tags ?? [],
        state,
        `${document.path}: truncated tags`,
      ),
      ...listedMetadata(document, markdown, state),
      ...(markdown && includeStats ? { stats: documentStats(document.content) } : {}),
    }
  })
  for (const attachment of attachments) {
    entries.push({
      path: attachment.path,
      type: 'attachment',
      mediaKind: attachmentMediaKind(attachment.path),
      extension: path.extname(attachment.path).toLowerCase(),
      modifiedMs: attachment.modifiedMs,
      createdMs: Number.isFinite(attachment.createdMs) ? attachment.createdMs : null,
      size: attachment.size,
    })
  }
  const timestamp = (entry, field) => entry[field] ?? 0
  entries.sort((left, right) => {
    if (sort === 'modified') return timestamp(right, 'modifiedMs') - timestamp(left, 'modifiedMs')
      || left.path.localeCompare(right.path)
    if (sort === 'created') return timestamp(right, 'createdMs') - timestamp(left, 'createdMs')
      || left.path.localeCompare(right.path)
    if (sort === 'recent') return Math.max(timestamp(right, 'modifiedMs'), timestamp(right, 'createdMs'))
      - Math.max(timestamp(left, 'modifiedMs'), timestamp(left, 'createdMs'))
      || left.path.localeCompare(right.path)
    return left.path.localeCompare(right.path)
  })
  const page = entries.slice(position.offset, position.offset + limit)
  const pageHasMore = position.offset + page.length < entries.length
  const nextPosition = pageHasMore
    ? { path: position.path, offset: position.offset + page.length }
    : sourcePosition
  state.cursor = nextPosition ? encodeCursor('list', key, nextPosition) : null
  if (pageHasMore) {
    state.truncated = true
    state.truncationReason = 'result-limit'
  }
  return {
    entries: page,
    truncated: state.truncated,
    ...scanOutput(state),
  }
}

// Path-rewrite behavior adapted from Tockbot a1f11e92236df639c3f5b004feee62bb9c2e0a57
// apps/web/src/lib/notes-compat/link-rewriter.ts and link-syntax.ts. The
// provider-backed planner below is pure; mutation and recovery remain caller-owned.
function isPathOrUnder(candidate, prefix) {
  return candidate === prefix || candidate.startsWith(`${prefix}/`)
}

function pathRewriteSidecar(markdownPath) {
  return `${markdownPath.replace(/\.md$/iu, '')}-md-images`
}

function mapRewrittenPath(candidate, oldPath, newPath, isDirectory) {
  if (isDirectory) {
    if (candidate === oldPath) return newPath
    if (candidate.startsWith(`${oldPath}/`)) return `${newPath}${candidate.slice(oldPath.length)}`
    return candidate
  }
  if (candidate === oldPath) return newPath
  const oldSidecar = pathRewriteSidecar(oldPath)
  if (candidate.startsWith(`${oldSidecar}/`)) {
    return `${pathRewriteSidecar(newPath)}${candidate.slice(oldSidecar.length)}`
  }
  return candidate
}

function relativeRewritePath(fromDirectory, targetPath) {
  const relative = path.posix.relative(fromDirectory || '.', targetPath)
  if (!relative) return './'
  return relative.startsWith('..') ? relative : `./${relative}`
}

function rewriteRelativeUrl(url, oldDirectory, newDirectory, oldPath, newPath, isDirectory) {
  if (url.startsWith('#') || url.startsWith('/') || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(url)) {
    return null
  }
  const hash = url.indexOf('#')
  const pathPart = hash < 0 ? url : url.slice(0, hash)
  const fragment = hash < 0 ? '' : url.slice(hash)
  if (!pathPart) return null
  const oldTarget = path.posix.normalize(path.posix.join(oldDirectory || '.', pathPart))
  const newTarget = mapRewrittenPath(oldTarget, oldPath, newPath, isDirectory)
  const rewritten = `${relativeRewritePath(newDirectory, newTarget)}${fragment}`
  return rewritten === url ? null : rewritten
}

function parseReferenceDestination(value) {
  if (value.startsWith('<')) {
    if (!value.endsWith('>')) return null
    const url = value.slice(1, -1)
    return url && !/[<>\r\n]/u.test(url) ? { angle: true, url } : null
  }
  return value && !/[\s<>]/u.test(value) ? { angle: false, url: value } : null
}

function rewriteMarkdownPathLinks(content, sourcePath, oldPath, newPath, isDirectory, work, signal) {
  const masked = maskedMarkdownSource(content, sourcePath, signal)
  const oldDirectory = path.posix.dirname(sourcePath)
  const mappedSourcePath = mapRewrittenPath(sourcePath, oldPath, newPath, isDirectory)
  const newDirectory = path.posix.dirname(mappedSourcePath)
  const replacements = []
  const takeWork = () => {
    signal.throwIfAborted()
    if (work.count >= work.limit) {
      work.capped = true
      return false
    }
    work.count += 1
    return true
  }
  for (const span of scanInlineLinkSpans(masked, signal)) {
    if (!takeWork()) return { capped: true, content }
    const decoded = span.destination.replaceAll('%20', ' ')
    const rewritten = rewriteRelativeUrl(
      decoded,
      oldDirectory,
      newDirectory,
      oldPath,
      newPath,
      isDirectory,
    )
    if (rewritten == null) continue
    replacements.push({
      end: span.destinationEnd,
      start: span.destinationStart,
      value: rewritten.replaceAll(' ', '%20'),
    })
  }
  for (const span of scanReferenceDestinationSpans(masked, signal)) {
    if (!takeWork()) return { capped: true, content }
    const destination = parseReferenceDestination(span.destination)
    if (!destination) continue
    const rewritten = rewriteRelativeUrl(
      destination.url,
      oldDirectory,
      newDirectory,
      oldPath,
      newPath,
      isDirectory,
    )
    if (rewritten == null) continue
    replacements.push({
      end: span.destinationEnd,
      start: span.destinationStart,
      value: destination.angle ? `<${rewritten}>` : rewritten,
    })
  }
  if (!replacements.length) return { capped: false, content }
  replacements.sort((left, right) => left.start - right.start)
  let cursor = 0
  const parts = []
  for (const replacement of replacements) {
    signal.throwIfAborted()
    if (replacement.start < cursor) continue
    parts.push(content.slice(cursor, replacement.start), replacement.value)
    cursor = replacement.end
  }
  parts.push(content.slice(cursor))
  return { capped: false, content: parts.join('') }
}

function consumeLinkWork(budget) {
  if (!budget) return true
  if (budget.count >= budget.limit) {
    budget.capped = true
    return false
  }
  budget.count += 1
  return true
}

function markdownLinkRecords(content, relativePath, signal, budget = null) {
  const details = markdownDetails(content, relativePath, signal)
  const masked = maskedMarkdownSource(content, relativePath, signal, details)
  const definitions = new Map()
  const definitionLines = new Set()
  let definitionLine = 1
  let definitionNewline = masked.indexOf('\n')
  for (const span of scanReferenceDestinationSpans(masked, signal)) {
    while (definitionNewline !== -1 && definitionNewline < span.destinationStart) {
      definitionLine += 1
      definitionNewline = masked.indexOf('\n', definitionNewline + 1)
    }
    if (!consumeLinkWork(budget)) break
    const destination = parseReferenceDestination(span.destination)
    if (!destination) continue
    definitions.set(span.label.trim().toLowerCase(), destination.url)
    definitionLines.add(definitionLine)
  }
  const records = []
  let inlineLine = 1
  let inlineNewline = masked.indexOf('\n')
  for (const span of scanInlineLinkSpans(masked, signal)) {
    while (inlineNewline !== -1 && inlineNewline < span.start) {
      inlineLine += 1
      inlineNewline = masked.indexOf('\n', inlineNewline + 1)
    }
    if (!consumeLinkWork(budget)) break
    const destination = parseReferenceDestination(span.destination)
    records.push({
      authoredTarget: destination?.url ?? span.destination,
      displayText: span.linkText.trim(),
      kind: span.image ? 'image' : 'markdown',
      line: inlineLine,
    })
  }
  linkLineLoop: for (const line of details.visibleLines) {
    signal.throwIfAborted()
    if (budget?.capped) break
    if (definitionLines.has(line.line)) continue
    for (const match of line.text.matchAll(/(!?)\[\[([^\]]+)\]\]/gu)) {
      signal.throwIfAborted()
      if (isEscapedSyntax(line.text, match.index)) continue
      if (!consumeLinkWork(budget)) break linkLineLoop
      const [target, display] = match[2].split('|', 2)
      records.push({
        authoredTarget: target.trim(),
        displayText: (display ?? target).trim(),
        kind: match[1] ? 'embed' : 'wiki',
        line: line.line,
      })
    }
    for (const match of line.text.matchAll(/(!?)\[([^\]]+)\]\[([^\]]*)\]/gu)) {
      signal.throwIfAborted()
      if (isEscapedSyntax(line.text, match.index)) continue
      const label = (match[3] || match[2]).trim()
      const target = definitions.get(label.toLowerCase())
      if (!target) continue
      if (!consumeLinkWork(budget)) break linkLineLoop
      records.push({
        authoredTarget: target.trim(),
        displayText: match[2].trim(),
        kind: match[1] ? 'image-reference' : 'reference',
        line: line.line,
      })
    }
  }
  return records.sort((left, right) => (
    left.line - right.line
    || left.kind.localeCompare(right.kind)
    || left.authoredTarget.localeCompare(right.authoredTarget)
  ))
}

function canvasLinkRecords(content, relativePath, signal, budget = null) {
  try {
    const canvas = JSON.parse(content)
    if (!Array.isArray(canvas.nodes)) return []
    let searchOffset = 0
    const records = []
    for (const node of canvas.nodes) {
      signal.throwIfAborted()
      if (node?.type !== 'file' || typeof node.file !== 'string' || !node.file.trim()) continue
      if (!consumeLinkWork(budget)) break
      const pattern = new RegExp(`"file"\\s*:\\s*${escapeRegex(JSON.stringify(node.file))}`, 'u')
      const match = pattern.exec(content.slice(searchOffset))
      const offset = match ? searchOffset + match.index : -1
      if (match) searchOffset = offset + match[0].length
      records.push({
        authoredTarget: node.file.trim(),
        displayText: typeof node.label === 'string' ? node.label : node.file.trim(),
        kind: 'canvas-file',
        line: offset < 0 ? 1 : content.slice(0, offset).split('\n').length,
      })
    }
    return records
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return []
  }
}

function documentLinkRecords(document, signal, budget = null) {
  if (isMarkdown(document.path)) {
    return markdownLinkRecords(document.content, document.path, signal, budget)
  }
  if (isCanvas(document.path)) {
    return canvasLinkRecords(document.content, document.path, signal, budget)
  }
  return []
}

function linkPathIndex(documents, signal, includeAliases = true, state = null) {
  const paths = new Map()
  const basenames = new Map()
  const aliases = new Map()
  let aliasClaims = 0
  for (const document of documents) {
    signal.throwIfAborted()
    paths.set(document.path.toLowerCase(), document.path)
    const basename = path.posix.basename(document.path, path.posix.extname(document.path)).toLowerCase()
    basenames.set(basename, basenames.has(basename) ? null : document.path)
    if (!includeAliases || !isMarkdown(document.path) || typeof document.content !== 'string') continue
    const properties = markdownDetails(document.content, document.path).properties
    for (const key of ['alias', 'aliases']) {
      const property = properties.get(key)
      if (!property) continue
      const allValues = property.values.length ? property.values : [property.value]
      const values = allValues
        .filter(value => value.trim().length <= MAX_METADATA_VALUE_CHARS)
        .slice(0, MAX_METADATA_VALUES)
      if (state && values.length < allValues.length) {
        markOutputMetadataTruncated(state, `${document.path}: truncated link aliases`)
      }
      for (const value of values) {
        signal.throwIfAborted()
        aliasClaims += 1
        if (aliasClaims > MAX_UNLINKED_IDENTIFIER_CLAIMS) {
          if (state) {
            markOutputResultTruncated(
              state,
              `link alias claims exceeded ${String(MAX_UNLINKED_IDENTIFIER_CLAIMS)}`,
            )
          }
          return { aliases, basenames, paths }
        }
        const alias = value.trim().toLowerCase()
        if (!alias) continue
        if (!aliases.has(alias)) aliases.set(alias, document.path)
        else if (aliases.get(alias) !== document.path) aliases.set(alias, null)
      }
    }
  }
  return { aliases, basenames, paths }
}

function resolveLinkTarget(sourcePath, authoredTarget, index) {
  const hash = authoredTarget.indexOf('#')
  const fragment = hash === -1 ? null : authoredTarget.slice(hash + 1).trim() || null
  let target = (hash === -1 ? authoredTarget : authoredTarget.slice(0, hash)).trim().split('?', 1)[0]
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
  let normalizedTarget = target
  try {
    normalizedTarget = decodeURIComponent(target).replaceAll('\\', '/')
  } catch {
    return { fragment, normalizedTarget, resolvedPath: null, status: 'unresolved' }
  }
  if (
    !normalizedTarget
    || /^[a-z][a-z\d+.-]*:/iu.test(normalizedTarget)
    || path.posix.isAbsolute(normalizedTarget)
  ) return { fragment, normalizedTarget, resolvedPath: null, status: 'unresolved' }
  const sourceDirectory = path.posix.dirname(sourcePath)
  const candidates = [
    path.posix.join(sourceDirectory, normalizedTarget),
    path.posix.normalize(normalizedTarget),
  ]
  const withExtensions = candidates.flatMap(candidate => (
    path.posix.extname(candidate) ? [candidate] : [candidate, `${candidate}.md`, `${candidate}.markdown`, `${candidate}.canvas`]
  ))
  for (const candidate of withExtensions) {
    if (candidate === '..' || candidate.startsWith('../') || path.posix.isAbsolute(candidate)) continue
    const match = index.paths.get(candidate.toLowerCase())
    if (match) return { fragment, normalizedTarget, resolvedPath: match, status: 'resolved' }
  }
  if (!normalizedTarget.includes('/')) {
    const basename = index.basenames.get(normalizedTarget.toLowerCase())
    if (basename === null) {
      return { fragment, normalizedTarget, resolvedPath: null, status: 'ambiguous' }
    }
    if (basename) {
      return { fragment, normalizedTarget, resolvedPath: basename, status: 'resolved' }
    }
    const alias = index.aliases.get(normalizedTarget.toLowerCase())
    if (alias === null) {
      return { fragment, normalizedTarget, resolvedPath: null, status: 'ambiguous' }
    }
    if (alias) {
      return { fragment, normalizedTarget, resolvedPath: alias, status: 'resolved' }
    }
  }
  return { fragment, normalizedTarget, resolvedPath: null, status: 'unresolved' }
}

function enrichLinkRecords(records, sourcePath, index, signal) {
  return records.map(record => {
    signal.throwIfAborted()
    return {
      ...record,
      ...resolveLinkTarget(sourcePath, record.authoredTarget, index),
      sourcePath,
    }
  })
}

const MENTION_LINK_MASKS = [
  /!?\[\[[^\]]+\]\]/gu,
  /!?\[[^\]]*\]\(\s*(?:<[^>]+>|[^\s)]+)[^)]*\)/gu,
  /!?\[[^\]]+\]\[[^\]]*\]/gu,
]

function maskMentionLinks(text, referenceLabels) {
  let masked = text
  for (const pattern of MENTION_LINK_MASKS) {
    masked = masked.replace(pattern, match => ' '.repeat(match.length))
  }
  if (referenceLabels.size) {
    masked = masked.replace(/\[[^\]]+\]/gu, match => (
      referenceLabels.has(match.slice(1, -1).trim().toLowerCase()) ? ' '.repeat(match.length) : match
    ))
  }
  return masked
}

// Ported from Tockbot a1f11e92236df639c3f5b004feee62bb9c2e0a57
// apps/web/src/components/notes/NotesMentions.ts (buildUnlinkedMentions, Pennivo adaptation retained).
// Identifiers are eligible only when the bounded scan proves them unique; ambiguous ones warn.
function unlinkedMentionScan(documents, requestedPath, state, signal) {
  const detailsByPath = new Map()
  const detailsOf = document => {
    let details = detailsByPath.get(document.path)
    if (!details) {
      details = markdownDetails(document.content, document.path)
      detailsByPath.set(document.path, details)
    }
    return details
  }
  let metadataIncomplete = false
  const documentAliases = (details, documentPath) => {
    const allAliases = [...new Set(['alias', 'aliases'].flatMap(key => {
      signal.throwIfAborted()
      const property = details.properties.get(key)
      if (!property) return []
      return property.values.length ? property.values : [property.value]
    }).map(value => value.trim()).filter(Boolean))]
    const aliases = allAliases
      .filter(alias => alias.length <= MAX_METADATA_VALUE_CHARS)
      .slice(0, MAX_METADATA_VALUES)
    if (aliases.length < allAliases.length) {
      metadataIncomplete = true
      markOutputMetadataTruncated(state, `${documentPath}: truncated aliases for unlinked mentions`)
    }
    return aliases
  }
  const claimants = new Map()
  let claims = 0
  let claimsCapped = false
  const claim = (value, documentPath) => {
    signal.throwIfAborted()
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) return
    if (text.length > MAX_METADATA_VALUE_CHARS) {
      metadataIncomplete = true
      markOutputMetadataTruncated(state, `${documentPath}: truncated identifiers for unlinked mentions`)
      return
    }
    claims += 1
    if (claims > MAX_UNLINKED_IDENTIFIER_CLAIMS) {
      claimsCapped = true
      return
    }
    const key = text.toLowerCase()
    if (!claimants.has(key)) claimants.set(key, documentPath)
    else if (claimants.get(key) !== documentPath) claimants.set(key, null)
  }
  claimLoop: for (const document of documents) {
    signal.throwIfAborted()
    if (!isMarkdown(document.path)) continue
    const details = detailsOf(document)
    claim(details.properties.get('title')?.value, document.path)
    claim(path.posix.basename(document.path, path.posix.extname(document.path)), document.path)
    for (const alias of documentAliases(details, document.path)) {
      signal.throwIfAborted()
      claim(alias, document.path)
      if (claimsCapped) break claimLoop
    }
    if (claimsCapped) break
  }
  if (claimsCapped) {
    markOutputResultTruncated(
      state,
      `unlinked identifier claims exceeded ${String(MAX_UNLINKED_IDENTIFIER_CLAIMS)}`,
    )
  }

  const target = documents.find(document => document.path === requestedPath)
  const targetDetails = detailsOf(target)
  const identifiers = []
  const ambiguous = []
  const seen = new Set()
  const addIdentifier = (value, kind) => {
    signal.throwIfAborted()
    const text = typeof value === 'string' ? value.trim() : ''
    const key = text.toLowerCase()
    if (!text || seen.has(key)) return
    if (text.length > MAX_METADATA_VALUE_CHARS || identifiers.length >= MAX_UNLINKED_IDENTIFIERS) {
      metadataIncomplete = true
      markOutputMetadataTruncated(state, `${requestedPath}: truncated unlinked mention identifiers`)
      return
    }
    seen.add(key)
    if (claimants.get(key) === requestedPath) {
      identifiers.push({
        text,
        kind,
        pattern: new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegex(text)})($|[^\\p{L}\\p{N}_])`, 'iu'),
      })
    } else {
      ambiguous.push(text)
    }
  }
  addIdentifier(targetDetails.properties.get('title')?.value, 'title')
  addIdentifier(path.posix.basename(requestedPath, path.posix.extname(requestedPath)), 'basename')
  for (const alias of documentAliases(targetDetails, requestedPath)) {
    signal.throwIfAborted()
    addIdentifier(alias, 'alias')
  }

  const mentions = []
  let comparisons = 0
  let mentionsCapped = false
  let workCapped = false
  if (identifiers.length && !metadataIncomplete && !claimsCapped) {
    mentionLoop: for (const document of documents) {
      signal.throwIfAborted()
      if (document.path === requestedPath || !isMarkdown(document.path)) continue
      const details = detailsOf(document)
      const referenceLabels = new Set()
      for (const line of details.visibleLines) {
        signal.throwIfAborted()
        const definition = line.text.match(/^ {0,3}\[([^\]]+)\]:\s*/u)
        if (definition && !definition[1].trim().startsWith('^')) {
          referenceLabels.add(definition[1].trim().toLowerCase())
        }
      }
      for (const line of details.visibleLines) {
        signal.throwIfAborted()
        if (/^ {0,3}\[[^\]]+\]:\s*/u.test(line.text)) continue
        const masked = maskMentionLinks(line.text, referenceLabels)
        let found
        for (const identifier of identifiers) {
          signal.throwIfAborted()
          comparisons += 1
          if (comparisons > MAX_UNLINKED_COMPARISONS) {
            workCapped = true
            break mentionLoop
          }
          identifier.pattern.lastIndex = 0
          const match = identifier.pattern.exec(masked)
          signal.throwIfAborted()
          if (match) {
            found = { identifier, match }
            break
          }
        }
        if (!found) continue
        if (mentions.length >= MAX_UNLINKED_MENTIONS) {
          mentionsCapped = true
          break mentionLoop
        }
        const start = found.match.index + found.match[1].length
        const original = details.lines[line.index]
        mentions.push({
          sourcePath: document.path,
          line: line.line,
          matchedText: original.slice(start, start + found.match[2].length),
          identifierKind: found.identifier.kind,
          snippet: original.trim().slice(0, MAX_PREVIEW_CHARS),
        })
      }
    }
    signal.throwIfAborted()
    mentions.sort((left, right) => (
      left.sourcePath.localeCompare(right.sourcePath) || left.line - right.line
    ))
  }
  if (mentionsCapped || workCapped) {
    markOutputResultTruncated(
      state,
      mentionsCapped
        ? `unlinked mentions exceeded ${String(MAX_UNLINKED_MENTIONS)}`
        : `unlinked mention work exceeded ${String(MAX_UNLINKED_COMPARISONS)} comparisons`,
    )
  }
  return { mentions, ambiguous }
}

function collectTagRelations(requested, documents, position, state, signal) {
  if (!isMarkdown(requested.path)) return []
  const requestedDetails = markdownDetails(requested.content, requested.path)
  const requestedTags = requestedDetails.tags
    .filter(tag => tag.length <= MAX_METADATA_VALUE_CHARS)
    .slice(0, MAX_LINK_TAGS)
  if (
    requestedDetails.tags.length > MAX_LINK_TAGS
    || requestedTags.length < Math.min(requestedDetails.tags.length, MAX_LINK_TAGS)
  ) {
    markOutputMetadataTruncated(
      state,
      `${requested.path}: omitted tags after ${String(MAX_LINK_TAGS)}`,
    )
  }

  const tagDocuments = []
  for (const document of documents) {
    signal.throwIfAborted()
    if (
      !isMarkdown(document.path)
      || (position.path && document.path === requested.path)
    ) continue
    const allTags = document.path === requested.path
      ? requestedDetails.tags
      : markdownDetails(document.content, document.path).tags
    const tags = allTags
      .filter(tag => tag.length <= MAX_METADATA_VALUE_CHARS)
      .slice(0, MAX_LINK_TAGS)
    if (tags.length < allTags.length) {
      markOutputMetadataTruncated(state, `${document.path}: truncated tags`)
    }
    tagDocuments.push({ path: document.path, tags })
  }

  const relations = []
  let comparisons = 0
  let relationCapped = false
  let workCapped = false
  relationLoop: for (const tag of requestedTags) {
    const normalized = tag.toLowerCase()
    for (const document of tagDocuments) {
      signal.throwIfAborted()
      let matched = false
      for (const documentTag of document.tags) {
        signal.throwIfAborted()
        comparisons += 1
        if (comparisons > MAX_LINK_TAG_COMPARISONS) {
          workCapped = true
          break relationLoop
        }
        const candidate = documentTag.toLowerCase()
        if (candidate === normalized || candidate.startsWith(`${normalized}/`)) {
          matched = true
          break
        }
      }
      if (!matched) continue
      if (relations.length >= MAX_LINK_TAG_RELATIONS) {
        relationCapped = true
        break relationLoop
      }
      relations.push({ path: document.path, tag })
    }
  }
  if (relationCapped || workCapped) {
    markOutputResultTruncated(
      state,
      relationCapped
        ? `tag relationships exceeded ${String(MAX_LINK_TAG_RELATIONS)}`
        : `tag relationship work exceeded ${String(MAX_LINK_TAG_COMPARISONS)} comparisons`,
    )
  }
  return relations
}

async function vaultLinks(input, requestedPath, config, signal, cursor, includeUnlinked = false) {
  const requested = await readInspectionDocument(input, requestedPath, config.maxReadBytes, signal)
  if (!isMarkdown(requested.path) && !isCanvas(requested.path)) {
    throw new Error('Vault links support Markdown or Canvas files only.')
  }
  if (includeUnlinked && !isMarkdown(requested.path)) {
    throw new Error('unlinked mentions support Markdown files only.')
  }
  const linkKey = JSON.stringify({ path: requested.path, unlinked: includeUnlinked })
  const position = decodeCursor(cursor, 'links', linkKey)
  const documents = []
  const sourceCursor = position.path
    ? encodeCursor('links-source', linkKey, { path: position.path, offset: 0 })
    : undefined
  const state = await scanVault(input, config, signal, document => {
    documents.push(document)
    return false
  }, { cursor: sourceCursor, key: linkKey, operation: 'links-source' })
  const sourcePosition = state.cursor
    ? decodeCursor(state.cursor, 'links-source', linkKey)
    : null
  const sourceComplete = position.path === '' && sourcePosition == null && !state.truncated
  if (!documents.some(document => document.path === requested.path)) {
    documents.push({ ...requested, modifiedMs: 0, size: Buffer.byteLength(requested.content) })
  }
  const index = linkPathIndex(documents, signal, true, state)
  const requestedDocument = documents.find(document => document.path === requested.path)
  const linkBudget = { count: 0, limit: MAX_GRAPH_RELATIONSHIPS, capped: false }
  const outgoingDetails = enrichLinkRecords(
    documentLinkRecords(requestedDocument, signal, linkBudget),
    requested.path,
    index,
    signal,
  )
  const allBacklinkDetails = []
  for (const document of documents) {
    signal.throwIfAborted()
    if (linkBudget.capped) break
    if (document.path === requested.path) continue
    const records = enrichLinkRecords(
      documentLinkRecords(document, signal, linkBudget),
      document.path,
      index,
      signal,
    )
    for (const record of records) {
      signal.throwIfAborted()
      if (record.resolvedPath === requested.path) allBacklinkDetails.push(record)
    }
  }
  allBacklinkDetails.sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath)
    || left.line - right.line
    || left.kind.localeCompare(right.kind)
  ))
  if (linkBudget.capped) {
    markOutputResultTruncated(
      state,
      `link relationship work exceeded ${String(MAX_GRAPH_RELATIONSHIPS)}`,
    )
  }
  const allTagItems = collectTagRelations(requested, documents, position, state, signal)
  let mentionItems = []
  if (includeUnlinked) {
    if (sourceComplete) {
      const scanned = unlinkedMentionScan(documents, requested.path, state, signal)
      mentionItems = scanned.mentions
      for (const identifier of scanned.ambiguous) {
        if (state.warnings.length < MAX_SCAN_WARNINGS) {
          state.warnings.push(`ambiguous identifier omitted from unlinked mentions: ${identifier}`)
        }
      }
    } else if (state.warnings.length < MAX_SCAN_WARNINGS) {
      state.warnings.push('unlinked mentions omitted because the vault scan is incomplete')
    }
  }
  const items = [
    ...(position.path ? [] : outgoingDetails.map(record => ({ record, type: 'outgoing' }))),
    ...allBacklinkDetails.map(record => ({ record, type: 'backlink' })),
    ...allTagItems.map(relation => ({ relation, type: 'tag' })),
    ...mentionItems.map(record => ({ record, type: 'mention' })),
  ]
  const page = items.slice(position.offset, position.offset + config.maxSearchResults)
  const pageHasMore = position.offset + page.length < items.length
  const nextPosition = pageHasMore
    ? { path: position.path, offset: position.offset + page.length }
    : sourcePosition
  state.cursor = nextPosition ? encodeCursor('links', linkKey, nextPosition) : null
  if (pageHasMore) {
    state.truncated = true
    state.truncationReason = 'result-limit'
  }
  const publicLinkRecord = record => {
    const { bounded, truncated } = boundedLinkRecord(record)
    if (truncated) {
      markOutputMetadataTruncated(state, `${record.sourcePath}: truncated link metadata`)
    }
    return bounded
  }
  const pageOutgoing = page.filter(item => item.type === 'outgoing')
    .map(item => publicLinkRecord(item.record))
  const backlinkDetails = page.filter(item => item.type === 'backlink')
    .map(item => publicLinkRecord(item.record))
  const tagMap = new Map()
  for (const item of page.filter(candidate => candidate.type === 'tag')) {
    const paths = tagMap.get(item.relation.tag) ?? []
    paths.push(item.relation.path)
    tagMap.set(item.relation.tag, paths)
  }
  const tagRelations = [...tagMap].map(([tag, paths]) => ({ tag, paths }))
  const outgoing = [...new Set(pageOutgoing.map(record => record.resolvedPath).filter(Boolean))]
    .sort((left, right) => compareVaultPaths(left, right))
  const backlinks = [...new Set(backlinkDetails.map(record => record.sourcePath))]
    .sort((left, right) => compareVaultPaths(left, right))
  const result = {
    path: requested.path,
    outgoing,
    backlinks,
    outgoingDetails: pageOutgoing,
    backlinkDetails,
    tagRelations,
    truncated: state.truncated,
    ...scanOutput(state),
  }
  if (includeUnlinked) {
    result.complete = sourceComplete && !state.truncated
    if (sourceComplete) {
      result.unlinkedMentions = page
        .filter(item => item.type === 'mention')
        .map(item => {
          const record = { ...item.record }
          record.matchedText = boundedOutputString(
            record.matchedText,
            state,
            `${record.sourcePath}: truncated unlinked mention metadata`,
          )
          record.snippet = boundedOutputString(
            record.snippet,
            state,
            `${record.sourcePath}: truncated unlinked mention metadata`,
          )
          return record
        })
    }
  }
  result.truncated = state.truncated
  result.warnings = boundedStateWarnings(state)
  result.truncated = state.truncated
  result.truncationReason = state.truncationReason
  if (includeUnlinked) result.complete = sourceComplete && !state.truncated
  return result
}

function propertyFacetType(property) {
  if (property.values.length) return 'list'
  if (property.isNull) return 'null'
  const value = property.value.trim()
  if (/^(?:true|false)$/iu.test(value)) return 'boolean'
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(value) && Number.isFinite(Number(value))) return 'number'
  const date = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (date) {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (
      parsed.getUTCFullYear() === Number(date[1])
      && parsed.getUTCMonth() + 1 === Number(date[2])
      && parsed.getUTCDate() === Number(date[3])
    ) return 'date'
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && Number.isFinite(Date.parse(value))) return 'datetime'
  return 'string'
}

async function vaultFacets(input, directory, limit, config, signal, cursor) {
  const start = inspectionDirectory(directory)
  const key = JSON.stringify({ directory: start.prefix })
  const tagCounts = new Map()
  const propertyCounts = new Map()
  const metadataWarnings = []
  let metadataTruncated = false
  const state = await scanVault(input, config, signal, document => {
    if (!isMarkdown(document.path)) return false
    const details = markdownDetails(document.content, document.path)
    const allTags = [...new Set(details.tags.map(tag => tag.toLowerCase()))]
    const tags = allTags.filter(tag => {
      if (tag.length <= MAX_METADATA_VALUE_CHARS) return true
      metadataTruncated = true
      return false
    })
    if (allTags.length > MAX_METADATA_PROPERTIES) {
      metadataTruncated = true
      if (metadataWarnings.length < MAX_SCAN_WARNINGS) {
        metadataWarnings.push(`${document.path}: omitted tags after ${String(MAX_METADATA_PROPERTIES)}`)
      }
    }
    for (const tag of tags.slice(0, MAX_METADATA_PROPERTIES)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
    const allProperties = [...details.properties.values()]
    const properties = allProperties.filter(property => {
      if (property.key.length <= MAX_METADATA_VALUE_CHARS) return true
      metadataTruncated = true
      return false
    })
    if (allProperties.length > MAX_METADATA_PROPERTIES) {
      metadataTruncated = true
      if (metadataWarnings.length < MAX_SCAN_WARNINGS) {
        metadataWarnings.push(`${document.path}: omitted properties after ${String(MAX_METADATA_PROPERTIES)}`)
      }
    }
    for (const property of properties.slice(0, MAX_METADATA_PROPERTIES)) {
      const facet = propertyCounts.get(property.key) ?? { count: 0, types: new Set() }
      facet.count += 1
      facet.types.add(propertyFacetType(property))
      propertyCounts.set(property.key, facet)
    }
    return false
  }, { cursor, key, operation: 'facets', directory: start.path })

  const tags = [...tagCounts].map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
  const properties = [...propertyCounts].map(([propertyKey, value]) => ({
    key: propertyKey,
    count: value.count,
    types: [...value.types].sort(),
  })).sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
  if (tags.length > limit || properties.length > limit) metadataTruncated = true
  if (metadataTruncated) {
    state.truncated = true
    state.truncationReason ??= 'metadata-limit'
  }
  state.warnings.push(...metadataWarnings.slice(0, MAX_SCAN_WARNINGS - state.warnings.length))
  return {
    tags: tags.slice(0, limit),
    properties: properties.slice(0, limit),
    complete: !state.truncated,
    truncated: state.truncated,
    ...scanOutput(state),
  }
}

function jsonArrayItemLines(content, key) {
  const keyMatch = new RegExp(`${escapeRegex(JSON.stringify(key))}\\s*:\\s*\\[`, 'u').exec(content)
  if (!keyMatch) return []
  const lines = []
  let squareDepth = 1
  let curlyDepth = 0
  let string = false
  let escaped = false
  let expectingItem = true
  for (let index = keyMatch.index + keyMatch[0].length; index < content.length; index += 1) {
    const character = content[index]
    if (string) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') string = false
      continue
    }
    if (character === '"') {
      string = true
      if (squareDepth === 1 && curlyDepth === 0 && expectingItem) {
        lines.push(content.slice(0, index).split('\n').length)
        expectingItem = false
      }
      continue
    }
    if (squareDepth === 1 && curlyDepth === 0 && expectingItem && !/[\s,\]]/u.test(character)) {
      lines.push(content.slice(0, index).split('\n').length)
      expectingItem = false
    }
    if (character === '[') squareDepth += 1
    else if (character === ']') {
      if (squareDepth === 1 && curlyDepth === 0) break
      squareDepth -= 1
    } else if (character === '{') curlyDepth += 1
    else if (character === '}') curlyDepth -= 1
    else if (character === ',' && squareDepth === 1 && curlyDepth === 0) expectingItem = true
  }
  return lines
}

function safeCanvasFile(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) return null
  const normalized = value.trim().replaceAll('\\', '/')
  if (path.posix.isAbsolute(normalized) || /^[a-z][a-z\d+.-]*:/iu.test(normalized)) return null
  const candidate = path.posix.normalize(normalized)
  return candidate === '..' || candidate.startsWith('../') ? null : normalized
}

function safeCanvasUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) return null
  const url = value.trim()
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\/[^/?#\s]*@/iu.test(url)) return null
  try {
    const parsed = new URL(url)
    return parsed.username || parsed.password ? null : url
  } catch {
    return url
  }
}

function parseCanvasItems(content, warnings) {
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Canvas document must contain valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Canvas document must contain valid JSON.')
  }
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : []
  const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : []
  let metadataTruncated = rawNodes.length > MAX_CANVAS_NODES || rawEdges.length > MAX_CANVAS_EDGES
  const itemId = value => {
    if (typeof value !== 'string' || value.includes('\0')) return ''
    const id = value.trim()
    if (id.length <= MAX_CANVAS_STRING_CHARS) return id
    metadataTruncated = true
    return ''
  }
  const seen = new Set()
  for (const entry of [...rawNodes, ...rawEdges]) {
    const id = itemId(entry?.id)
    if (!id) continue
    if (seen.has(id)) throw new Error(`duplicate Canvas item ID: ${id}`)
    seen.add(id)
  }
  const boundedString = value => {
    if (typeof value !== 'string') return null
    if (value.length <= MAX_CANVAS_STRING_CHARS) return value
    metadataTruncated = true
    return value.slice(0, MAX_CANVAS_STRING_CHARS)
  }
  const number = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const nodeLines = jsonArrayItemLines(content, 'nodes')
  const nodes = rawNodes.slice(0, MAX_CANVAS_NODES).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const id = itemId(entry.id)
    if (!id) return []
    return [{
      kind: 'node',
      id,
      line: nodeLines[index] ?? 1,
      type: boundedString(entry.type) ?? 'text',
      x: number(entry.x, 0),
      y: number(entry.y, 0),
      width: Math.max(80, number(entry.width, 220)),
      height: Math.max(48, number(entry.height, 120)),
      text: boundedString(entry.text),
      file: boundedString(safeCanvasFile(entry.file)),
      url: boundedString(safeCanvasUrl(entry.url)),
      label: boundedString(entry.label),
      color: boundedString(entry.color),
      fromNode: null,
      toNode: null,
      fromSide: null,
      toSide: null,
      fromEnd: null,
      toEnd: null,
    }]
  })
  const nodeIds = new Set(nodes.map(node => node.id))
  const edgeLines = jsonArrayItemLines(content, 'edges')
  const edges = rawEdges.slice(0, MAX_CANVAS_EDGES).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const id = itemId(entry.id)
    const fromNode = itemId(entry.fromNode)
    const toNode = itemId(entry.toNode)
    if (!id || !nodeIds.has(fromNode) || !nodeIds.has(toNode)) return []
    return [{
      kind: 'edge',
      id,
      line: edgeLines[index] ?? 1,
      type: null,
      x: null,
      y: null,
      width: null,
      height: null,
      text: null,
      file: null,
      url: null,
      label: boundedString(entry.label),
      color: boundedString(entry.color),
      fromNode,
      toNode,
      fromSide: boundedString(entry.fromSide),
      toSide: boundedString(entry.toSide),
      fromEnd: boundedString(entry.fromEnd),
      toEnd: boundedString(entry.toEnd),
    }]
  })
  if (metadataTruncated && warnings.length < MAX_SCAN_WARNINGS) {
    warnings.push('Canvas metadata exceeded configured output limits')
  }
  return { items: [...nodes, ...edges], metadataTruncated }
}

async function vaultCanvas(input, requestedPath, limit, config, signal, cursor) {
  const document = await readInspectionDocument(input, requestedPath, config.maxReadBytes, signal)
  if (!isCanvas(document.path)) throw new Error('Structured Canvas inspection supports Canvas files only.')
  const position = decodeCursor(cursor, 'canvas', document.path)
  if (position.path) throw new Error('invalid cursor')
  const warnings = []
  const parsed = parseCanvasItems(document.content, warnings)
  const items = parsed.items.slice(position.offset, position.offset + limit)
  const nextOffset = position.offset + items.length
  const hasMore = nextOffset < parsed.items.length
  return {
    path: document.path,
    items,
    cursor: hasMore ? encodeCursor('canvas', document.path, { path: '', offset: nextOffset }) : null,
    truncated: hasMore || parsed.metadataTruncated,
    truncationReason: hasMore ? 'result-limit' : parsed.metadataTruncated ? 'metadata-limit' : null,
    warnings,
  }
}

function boundedLinkRecord(record) {
  const bounded = { ...record }
  let truncated = false
  for (const field of ['authoredTarget', 'displayText', 'normalizedTarget']) {
    if (bounded[field].length <= MAX_METADATA_VALUE_CHARS) continue
    bounded[field] = bounded[field].slice(0, MAX_METADATA_VALUE_CHARS)
    truncated = true
  }
  if (bounded.fragment?.length > MAX_METADATA_VALUE_CHARS) {
    bounded.fragment = bounded.fragment.slice(0, MAX_METADATA_VALUE_CHARS)
    truncated = true
  }
  return { bounded, truncated }
}

function boundedMissingRecord(record, state) {
  const result = boundedLinkRecord(record)
  if (result.truncated) {
    markOutputMetadataTruncated(state, `${record.sourcePath}: truncated graph metadata`)
  }
  return result
}

function isLocalMissingTarget(record) {
  const target = record.normalizedTarget
  if (!target || /^[a-z][a-z\d+.-]*:/iu.test(target) || path.posix.isAbsolute(target)) return false
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(record.sourcePath), target))
  return candidate !== '..' && !candidate.startsWith('../') && !path.posix.isAbsolute(candidate)
}

function collectGraphRecords(documents, index, state, signal) {
  const records = []
  const budget = { count: 0, limit: MAX_GRAPH_RELATIONSHIPS, capped: false }
  for (const document of documents) {
    signal.throwIfAborted()
    if (budget.capped) break
    const found = enrichLinkRecords(
      documentLinkRecords(document, signal, budget),
      document.path,
      index,
      signal,
    )
    const remaining = MAX_GRAPH_RELATIONSHIPS - records.length
    records.push(...found.slice(0, remaining))
    if (found.length > remaining) budget.capped = true
  }
  if (budget.capped && state.warnings.length < MAX_SCAN_WARNINGS) {
    state.warnings.push(`graph relationships exceeded ${String(MAX_GRAPH_RELATIONSHIPS)}`)
  }
  return { records, truncated: budget.capped }
}

async function vaultGraph(input, requestedPath, options, limit, config, signal) {
  const requested = await readInspectionDocument(input, requestedPath, config.maxReadBytes, signal)
  if (!isMarkdown(requested.path) && !isCanvas(requested.path)) {
    throw new Error('Vault graph queries support Markdown or Canvas files only.')
  }
  const documents = []
  const state = await scanVault(input, config, signal, document => {
    if (isMarkdown(document.path) || isCanvas(document.path)) documents.push(document)
    return false
  }, { key: JSON.stringify(options), operation: 'graph-source' })
  if (!documents.some(document => document.path === requested.path)) {
    documents.push({ ...requested, modifiedMs: 0, size: Buffer.byteLength(requested.content) })
  }
  documents.sort((left, right) => compareVaultPaths(left.path, right.path))
  const documentByPath = new Map(documents.map(document => [document.path, document]))
  const index = linkPathIndex(documents, signal, false)
  const { records, truncated: recordsTruncated } = collectGraphRecords(documents, index, state, signal)
  let graphWorkTruncated = recordsTruncated
  const resolved = records.filter(record => record.status === 'resolved' && documentByPath.has(record.resolvedPath))
  const tag = options.tag
  const allowed = candidatePath => {
    if (candidatePath === requested.path || !tag) return true
    const document = documentByPath.get(candidatePath)
    return Boolean(document && isMarkdown(document.path) && tagMatches(
      markdownDetails(document.content, document.path).tags,
      tag,
    ))
  }

  const depths = new Map([[requested.path, 0]])
  const queue = [requested.path]
  while (queue.length) {
    signal.throwIfAborted()
    const current = queue.shift()
    const depth = depths.get(current)
    if (depth >= options.depth) continue
    const neighbors = new Set()
    for (const record of resolved) {
      if (options.direction !== 'backlinks' && record.sourcePath === current) {
        neighbors.add(record.resolvedPath)
      }
      if (options.direction !== 'outgoing' && record.resolvedPath === current) {
        neighbors.add(record.sourcePath)
      }
    }
    for (const neighbor of [...neighbors].filter(allowed).sort(compareVaultPaths)) {
      if (depths.has(neighbor)) continue
      if (depths.size >= limit) {
        graphWorkTruncated = true
        break
      }
      depths.set(neighbor, depth + 1)
      queue.push(neighbor)
    }
  }

  const allNodes = [...depths].map(([nodePath, depth]) => ({ path: nodePath, depth }))
  const visited = new Set(depths.keys())
  const allEdges = resolved.filter(record => (
    visited.has(record.sourcePath) && visited.has(record.resolvedPath)
  )).map(record => {
    const fragment = boundedOutputString(
      record.fragment,
      state,
      `${record.sourcePath}: truncated graph metadata`,
    )
    if (fragment !== record.fragment) graphWorkTruncated = true
    return {
      fragment,
      kind: record.kind,
      line: record.line,
      sourcePath: record.sourcePath,
      targetPath: record.resolvedPath,
    }
  }).sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath)
    || left.targetPath.localeCompare(right.targetPath)
    || left.line - right.line
    || left.kind.localeCompare(right.kind)
  ))
  const allMissing = options.direction === 'backlinks' ? [] : records.filter(record => (
    visited.has(record.sourcePath)
    && record.status === 'unresolved'
    && isLocalMissingTarget(record)
  )).map(record => {
    const { bounded, truncated } = boundedMissingRecord(record, state)
    if (truncated) graphWorkTruncated = true
    return bounded
  }).sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath)
    || left.line - right.line
    || left.authoredTarget.localeCompare(right.authoredTarget)
  ))
  const connected = new Set(resolved.flatMap(record => [record.sourcePath, record.resolvedPath]))
  const allOrphans = documents.map(document => document.path)
    .filter(candidate => allowed(candidate) && !connected.has(candidate))
    .sort(compareVaultPaths)

  let remaining = limit
  const take = values => {
    const selected = values.slice(0, remaining)
    remaining -= selected.length
    return selected
  }
  const nodes = take(allNodes)
  const edges = take(allEdges)
  const missing = take(allMissing)
  const orphans = take(allOrphans)
  const outputTruncated = graphWorkTruncated || [allNodes, allEdges, allMissing, allOrphans]
    .reduce((sum, values) => sum + values.length, 0) > limit
  if (outputTruncated) {
    state.truncated = true
    state.truncationReason ??= 'result-limit'
  }
  const warnings = boundedStateWarnings(state)
  return {
    path: requested.path,
    nodes,
    edges,
    missing,
    orphans,
    complete: !state.truncated,
    truncated: state.truncated,
    scan: { bytes: state.bytes, entries: state.entries, files: state.files },
    truncationReason: state.truncationReason,
    warnings,
  }
}

async function vaultGraphGlobal(input, options, limit, config, signal, cursor) {
  const key = JSON.stringify({
    scope: 'global',
    includeAttachments: options.includeAttachments,
    includeTags: options.includeTags,
  })
  const position = decodeCursor(cursor, 'graph', key)
  const documents = []
  const attachments = []
  const sourceCursor = position.path
    ? encodeCursor('graph-source', key, { path: position.path, offset: 0 })
    : undefined
  const state = await scanVault(input, config, signal, document => {
    if (isMarkdown(document.path) || isCanvas(document.path)) documents.push(document)
    return false
  }, {
    cursor: sourceCursor,
    key,
    operation: 'graph-source',
    includeAttachments: options.includeAttachments,
    onAttachment: attachment => {
      attachments.push(attachment)
    },
  })
  const sourcePosition = state.cursor
    ? decodeCursor(state.cursor, 'graph-source', key)
    : null
  documents.sort((left, right) => compareVaultPaths(left.path, right.path))
  attachments.sort((left, right) => compareVaultPaths(left.path, right.path))

  const index = linkPathIndex(documents, signal, false)
  if (options.includeAttachments) {
    for (const attachment of attachments) {
      signal.throwIfAborted()
      index.paths.set(attachment.path.toLowerCase(), attachment.path)
      const basename = path.posix.basename(
        attachment.path,
        path.posix.extname(attachment.path),
      ).toLowerCase()
      index.basenames.set(
        basename,
        index.basenames.has(basename) ? null : attachment.path,
      )
    }
  }
  const { records, truncated: recordsTruncated } = collectGraphRecords(
    documents,
    index,
    state,
    signal,
  )
  let graphWorkTruncated = recordsTruncated
  const documentPaths = new Set(documents.map(document => document.path))
  const graphTargets = new Set([
    ...documentPaths,
    ...(options.includeAttachments ? attachments.map(attachment => attachment.path) : []),
  ])
  const resolved = records.filter(record => (
    record.status === 'resolved' && graphTargets.has(record.resolvedPath)
  ))
  const tagEdges = []
  if (options.includeTags) {
    tagLoop: for (const document of documents) {
      signal.throwIfAborted()
      if (!isMarkdown(document.path)) continue
      const allTags = [...new Set(
        markdownDetails(document.content, document.path).tags.map(tag => tag.toLowerCase()),
      )]
      const tags = allTags
        .filter(tag => tag.length <= MAX_METADATA_VALUE_CHARS - 'tag:'.length)
        .slice(0, MAX_METADATA_PROPERTIES)
      if (tags.length < allTags.length) {
        graphWorkTruncated = true
        markOutputMetadataTruncated(state, `${document.path}: truncated graph tags`)
      }
      for (const tag of tags) {
        signal.throwIfAborted()
        if (tagEdges.length >= MAX_GRAPH_RELATIONSHIPS) {
          graphWorkTruncated = true
          markOutputResultTruncated(
            state,
            `graph tag relationships exceeded ${String(MAX_GRAPH_RELATIONSHIPS)}`,
          )
          break tagLoop
        }
        tagEdges.push({
          sourcePath: document.path,
          targetPath: `tag:${tag}`,
          kind: 'tag',
          line: 1,
          fragment: null,
        })
      }
    }
  }
  const attachmentNodes = options.includeAttachments
    ? [...new Set(resolved
        .map(record => record.resolvedPath)
        .filter(target => !documentPaths.has(target)))]
    : []
  const allNodes = [...new Set([
    ...documents.map(document => document.path),
    ...attachmentNodes,
    ...tagEdges.map(edge => edge.targetPath),
  ])].sort(compareVaultPaths).map(nodePath => ({ path: nodePath, depth: null }))
  const allEdges = [
    ...resolved.map(record => {
      const fragment = boundedOutputString(
        record.fragment,
        state,
        `${record.sourcePath}: truncated graph metadata`,
      )
      if (fragment !== record.fragment) graphWorkTruncated = true
      return {
        fragment,
        kind: record.kind,
        line: record.line,
        sourcePath: record.sourcePath,
        targetPath: record.resolvedPath,
      }
    }),
    ...tagEdges,
  ].sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath)
    || left.targetPath.localeCompare(right.targetPath)
    || left.line - right.line
    || left.kind.localeCompare(right.kind)
  ))
  const allMissing = records.filter(record => (
    record.status === 'unresolved' && isLocalMissingTarget(record)
  )).map(record => {
    const { bounded, truncated } = boundedMissingRecord(record, state)
    if (truncated) graphWorkTruncated = true
    return bounded
  }).sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath)
    || left.line - right.line
    || left.authoredTarget.localeCompare(right.authoredTarget)
  ))
  const connected = new Set(resolved.flatMap(record => [record.sourcePath, record.resolvedPath]))
  const allOrphans = documents.map(document => document.path)
    .filter(candidate => !connected.has(candidate))
    .sort(compareVaultPaths)
  const stream = [
    ...allNodes.map(item => ({ type: 'node', item })),
    ...allEdges.map(item => ({ type: 'edge', item })),
    ...allMissing.map(item => ({ type: 'missing', item })),
    ...allOrphans.map(item => ({ type: 'orphan', item })),
  ]
  const page = stream.slice(position.offset, position.offset + limit)
  const pageHasMore = position.offset + page.length < stream.length
  const sourceIncompleteReason = position.incompleteReason
    ?? (sourcePosition ? state.truncationReason : null)
  const nextPosition = pageHasMore
    ? {
        path: position.path,
        offset: position.offset + page.length,
        ...(sourceIncompleteReason ? { incompleteReason: sourceIncompleteReason } : {}),
      }
    : sourcePosition
      ? { ...sourcePosition, incompleteReason: sourceIncompleteReason }
      : null
  state.cursor = nextPosition ? encodeCursor('graph', key, nextPosition) : null
  if (pageHasMore) {
    state.truncated = true
    state.truncationReason = 'result-limit'
  }
  if (graphWorkTruncated) {
    state.truncated = true
    state.truncationReason ??= 'result-limit'
  }
  if (sourceIncompleteReason) {
    state.truncated = true
    state.truncationReason ??= sourceIncompleteReason
  }
  const pageItems = type => page.filter(item => item.type === type).map(item => item.item)
  const warnings = boundedStateWarnings(state)
  return {
    path: null,
    nodes: pageItems('node'),
    edges: pageItems('edge'),
    missing: pageItems('missing'),
    orphans: pageItems('orphan'),
    complete: !state.truncated,
    truncated: state.truncated,
    cursor: state.cursor,
    scan: { bytes: state.bytes, entries: state.entries, files: state.files },
    truncationReason: state.truncationReason,
    warnings,
  }
}

function rewritePlannerResult(state, updates = [], overrides = {}) {
  const warnings = boundedStateWarnings(state)
  return {
    updates,
    complete: overrides.complete ?? false,
    cursor: overrides.cursor ?? null,
    scan: { bytes: state.bytes, entries: state.entries, files: state.files },
    truncated: overrides.truncated ?? true,
    truncationReason: overrides.truncationReason ?? state.truncationReason,
    warnings,
  }
}

function rewritePlannerWarning(state, warning) {
  if (state.warnings.length < MAX_SCAN_WARNINGS && !state.warnings.includes(warning)) {
    state.warnings.push(warning)
  }
}

async function planVaultPathRewrite(input, config, args, signal) {
  const oldPath = safeInspectionPath(args?.oldPath)
  const newPath = safeInspectionPath(args?.newPath)
  if (!oldPath || !newPath) {
    if (isHiddenInspectionRequest(args?.oldPath) || isHiddenInspectionRequest(args?.newPath)) {
      throw new Error('Hidden vault paths are not allowed.')
    }
    throw new Error('Vault rewrite paths must stay inside the configured vault.')
  }
  if (typeof args?.isDirectory !== 'boolean') {
    throw new Error('Vault rewrite isDirectory must be a boolean.')
  }
  if (oldPath === newPath) throw new Error('Vault rewrite paths must be different.')
  if (args.isDirectory && isPathOrUnder(newPath, oldPath)) {
    throw new Error('Vault rewrite destination must not be inside its source directory.')
  }
  const key = JSON.stringify({ isDirectory: args.isDirectory, newPath, oldPath })
  const position = decodeCursor(args.cursor, 'path-rewrite', key)
  const state = {
    bytes: 0,
    entries: 0,
    files: 0,
    truncated: false,
    truncationReason: null,
    warnings: [],
  }
  let collection
  try {
    collection = await collectInspectionInventory(input, config, signal, { path: '', offset: 0 }, {
      directory: '',
      includeAttachments: false,
      includeDocuments: true,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (error?.message?.startsWith('Vault ') && !containsAbsolutePath(error.message)) throw error
    throw new Error('Vault rewrite scan failed safely.')
  }
  state.entries = collection.entriesRead
  for (const warning of collection.warnings) rewritePlannerWarning(state, warning)
  if (collection.hasMore || collection.incompleteReason) {
    state.truncated = true
    state.truncationReason = collection.incompleteReason ?? 'entry-limit'
    rewritePlannerWarning(state, 'path rewrite omitted sources because the Markdown inventory is incomplete')
    return rewritePlannerResult(state)
  }
  if (collection.warnings.length) {
    state.truncated = true
    state.truncationReason = 'file-limit'
    rewritePlannerWarning(state, 'path rewrite omitted sources because the inventory reported unsafe entries')
    return rewritePlannerResult(state)
  }

  const sources = []
  const fingerprint = createHash('sha256')
  for (const item of collection.entries) {
    signal.throwIfAborted()
    if (!isMarkdown(item.path)) continue
    state.files += 1
    if (item.size > config.maxSearchFileBytes) {
      state.truncated = true
      state.truncationReason = 'file-limit'
      rewritePlannerWarning(state, `${item.path}: omitted from path rewrite because it exceeds the file limit`)
      return rewritePlannerResult(state)
    }
    const remaining = config.maxSearchBytes - state.bytes
    if (item.size > remaining) {
      state.truncated = true
      state.truncationReason = 'byte-limit'
      rewritePlannerWarning(state, 'path rewrite omitted sources because the aggregate byte limit was reached')
      return rewritePlannerResult(state)
    }
    let document
    try {
      document = await readInspectionDocument(
        input,
        item.path,
        Math.min(config.maxSearchFileBytes, remaining),
        signal,
      )
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      state.truncated = true
      state.truncationReason = 'file-limit'
      rewritePlannerWarning(state, `${item.path}: omitted from path rewrite because it could not be opened safely`)
      return rewritePlannerResult(state)
    }
    const bytes = Buffer.byteLength(document.content)
    state.bytes += bytes
    const digest = createHash('sha256').update(document.content).digest('base64url')
    fingerprint
      .update(item.path)
      .update('\0')
      .update(item.revision ?? '')
      .update('\0')
      .update(digest)
      .update('\0')
    sources.push({ ...item, content: document.content })
  }
  const sourceFingerprint = fingerprint.digest('base64url')
  if (args.cursor != null && position.path !== sourceFingerprint) {
    throw new Error('Vault rewrite source changed during pagination.')
  }

  const work = { count: 0, limit: MAX_PATH_REWRITE_WORK, capped: false }
  const planned = []
  let updateBytes = 0
  for (const source of sources) {
    signal.throwIfAborted()
    const rewritten = rewriteMarkdownPathLinks(
      source.content,
      source.path,
      oldPath,
      newPath,
      args.isDirectory,
      work,
      signal,
    )
    if (rewritten.capped) {
      state.truncated = true
      state.truncationReason = 'result-limit'
      rewritePlannerWarning(
        state,
        `path rewrite work exceeded ${String(MAX_PATH_REWRITE_WORK)} link destinations`,
      )
      return rewritePlannerResult(state)
    }
    if (rewritten.content === source.content) continue
    updateBytes += Buffer.byteLength(rewritten.content)
    if (updateBytes > config.maxSearchBytes) {
      state.truncated = true
      state.truncationReason = 'byte-limit'
      rewritePlannerWarning(state, 'path rewrite updates exceeded the aggregate byte limit')
      return rewritePlannerResult(state)
    }
    const mappedPath = mapRewrittenPath(source.path, oldPath, newPath, args.isDirectory)
    planned.push({
      path: mappedPath,
      newContent: rewritten.content,
      ...(source.revision === undefined ? {} : { revision: source.revision }),
    })
  }
  if (position.offset > planned.length) throw new Error('invalid cursor')
  const pageEnd = Math.min(position.offset + config.maxSearchResults, planned.length)
  const updates = planned.slice(position.offset, pageEnd)
  const hasMore = pageEnd < planned.length
  const missingRevision = planned.some(update => update.revision === undefined)
  if (missingRevision) {
    for (const update of planned) {
      if (update.revision === undefined) {
        rewritePlannerWarning(state, `${update.path}: path rewrite update has no source revision`)
      }
    }
  }
  const cursor = hasMore
    ? encodeCursor('path-rewrite', key, { path: sourceFingerprint, offset: pageEnd })
    : null
  const truncationReason = hasMore ? 'result-limit' : missingRevision ? 'metadata-limit' : null
  return rewritePlannerResult(state, updates, {
    complete: !hasMore && !missingRevision,
    cursor,
    truncated: hasMore || missingRevision,
    truncationReason,
  })
}

function boundedLimit(requested, maximum) {
  const limit = requested ?? maximum
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer')
  return Math.min(limit, maximum)
}

function operationSignal(signal) {
  return signal ?? new AbortController().signal
}

export function createVaultInspection(input, config) {
  if (typeof input?.list !== 'function' || typeof input?.read !== 'function') {
    throw new TypeError('Vault inspection input must provide list and read callbacks.')
  }
  const limits = {
    maxReadBytes: Math.floor(config?.maxReadBytes),
    maxSearchBytes: Math.floor(config?.maxSearchBytes),
    maxSearchEntries: Math.floor(config?.maxSearchEntries),
    maxSearchFileBytes: Math.floor(config?.maxSearchFileBytes),
    maxSearchResults: Math.floor(config?.maxSearchResults),
  }
  if (Object.values(limits).some(limit => !Number.isInteger(limit) || limit < 1)) {
    throw new TypeError('Vault inspection limits must be positive integers.')
  }

  return Object.freeze({
    async search(args, signal) {
      const operation = operationSignal(signal)
      const query = typeof args?.query === 'string' ? args.query.trim() : ''
      if (query === '') throw new Error('query must be a non-empty string')
      const limit = boundedLimit(args.limit, limits.maxSearchResults)
      if (args.mode === 'related') {
        return await searchRelatedVault(
          input,
          query,
          { directory: args.directory },
          limit,
          limits,
          operation,
          args.cursor,
        )
      }
      if ((args.mode ?? 'literal') === 'query') {
        return await searchQueryVault(input, query, {
          caseSensitive: args.caseSensitive === true,
          directory: args.directory,
          regex: args.regex === true,
          wholeWord: args.wholeWord === true,
        }, limit, limits, operation, args.cursor)
      }
      return await searchVault(
        input,
        query,
        args.scope ?? 'all',
        limit,
        limits,
        operation,
        args.cursor,
      )
    },

    async read(args, signal) {
      const operation = operationSignal(signal)
      const document = await readInspectionDocument(input, args?.path, limits.maxReadBytes, operation)
      const selectors = [args.heading, args.blockId, args.footnote, args.inlineFootnote]
        .filter(value => value != null)
      if (selectors.length > 1) throw new Error('vault_read accepts only one Markdown selector')
      if (selectors.length > 0 && !isMarkdown(document.path)) {
        throw new Error('Markdown selectors support Markdown files only.')
      }
      if (args.heading != null) document.content = markdownSection(document.content, args.heading)
      if (args.blockId != null) document.content = markdownBlock(document.content, args.blockId)
      if (args.footnote != null) document.content = markdownFootnote(document.content, args.footnote)
      if (args.inlineFootnote != null) {
        document.content = markdownInlineFootnote(document.content, args.inlineFootnote)
      }
      return document
    },

    async list(args = {}, signal) {
      const operation = operationSignal(signal)
      const limit = boundedLimit(args.limit, limits.maxSearchResults)
      return await listVault(
        input,
        args.directory,
        args.sort ?? 'path',
        limit,
        limits,
        operation,
        args.cursor,
        {
          kind: args.kind ?? 'documents',
          includeStats: args.includeStats === true,
        },
      )
    },

    async links(args, signal) {
      return await vaultLinks(
        input,
        args?.path,
        limits,
        operationSignal(signal),
        args?.cursor,
        args?.includeUnlinked === true,
      )
    },

    async outline(args, signal) {
      const operation = operationSignal(signal)
      const limit = boundedLimit(args?.limit, limits.maxSearchResults)
      const document = await readInspectionDocument(input, args?.path, limits.maxReadBytes, operation)
      if (!isMarkdown(document.path)) throw new Error('Vault outlines support Markdown files only.')
      const headings = markdownOutline(document.content)
      let headingMetadataTruncated = false
      const boundedHeadings = headings.map(heading => {
        operation.throwIfAborted()
        if (
          heading.text.length > MAX_METADATA_VALUE_CHARS
          || heading.selector.length > MAX_METADATA_VALUE_CHARS
        ) headingMetadataTruncated = true
        return {
          ...heading,
          text: heading.text.slice(0, MAX_METADATA_VALUE_CHARS),
          selector: heading.selector.slice(0, MAX_METADATA_VALUE_CHARS),
        }
      })
      const result = {
        path: document.path,
        headings: boundedHeadings.slice(0, limit),
        truncated: headings.length > limit || headingMetadataTruncated,
      }
      if (args.includeFootnotes === true) {
        const foundFootnotes = inlineFootnotes(document.content)
        const footnoteMetadataTruncated = foundFootnotes.some(footnote => (
          footnote.source.slice(2, -1).trim().length > MAX_METADATA_VALUE_CHARS
        ))
        const footnotes = foundFootnotes.map(({ source: _source, ...footnote }) => footnote)
        result.footnotes = footnotes.slice(0, limit)
        result.footnotesTruncated = footnoteMetadataTruncated || footnotes.length > limit
      }
      if (args.includeQueries === true) {
        const { queries, metadataTruncated } = embeddedQueryBlocks(document.content)
        result.queries = queries.slice(0, limit)
        result.queriesTruncated = metadataTruncated || queries.length > limit
      }
      return result
    },

    async graph(args = {}, signal) {
      const operation = operationSignal(signal)
      const scope = args.scope ?? 'local'
      const limit = boundedLimit(args.limit, limits.maxSearchResults)
      if (scope === 'global') {
        if ([args.path, args.depth, args.direction, args.tag].some(value => value != null)) {
          throw new Error('global scope does not accept path, depth, direction, or tag')
        }
        return await vaultGraphGlobal(input, {
          includeTags: args.includeTags === true,
          includeAttachments: args.includeAttachments === true,
        }, limit, limits, operation, args.cursor)
      }
      if (scope !== 'local') throw new Error('scope must be local or global')
      if (args.cursor != null || args.includeTags != null || args.includeAttachments != null) {
        throw new Error('cursor, includeTags, and includeAttachments require global scope')
      }
      if (typeof args.path !== 'string' || !args.path.trim()) {
        throw new Error('local scope requires a path')
      }
      const depth = args.depth ?? 1
      if (!Number.isInteger(depth) || depth < 1 || depth > 3) {
        throw new Error('depth must be an integer from 1 through 3')
      }
      const direction = args.direction ?? 'both'
      if (!['outgoing', 'backlinks', 'both'].includes(direction)) {
        throw new Error('direction must be outgoing, backlinks, or both')
      }
      const tag = typeof args.tag === 'string' ? args.tag.trim().replace(/^#+/u, '') : ''
      if (args.tag != null && !tag) throw new Error('tag must be a non-empty string')
      return await vaultGraph(input, args.path, { depth, direction, tag }, limit, limits, operation)
    },

    async canvas(args, signal) {
      const limit = boundedLimit(args?.limit, limits.maxSearchResults)
      return await vaultCanvas(
        input,
        args?.path,
        limit,
        limits,
        operationSignal(signal),
        args?.cursor,
      )
    },

    async planPathRewrite(args, signal) {
      return await planVaultPathRewrite(input, limits, args, operationSignal(signal))
    },

    async facets(args = {}, signal) {
      const limit = boundedLimit(args.limit, limits.maxSearchResults)
      return await vaultFacets(
        input,
        args.directory,
        limit,
        limits,
        operationSignal(signal),
        args.cursor,
      )
    },
  })
}
