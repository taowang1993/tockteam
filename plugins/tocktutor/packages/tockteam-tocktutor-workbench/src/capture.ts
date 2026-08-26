import { isSafeVaultRelativePath } from './session.ts'

export const MAX_TEMPLATE_BYTES = 1_000_000

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function formatDate(value: Date, format: string): string {
  const replacements: Record<string, string> = {
    YYYY: String(value.getFullYear()),
    MMMM: value.toLocaleString('en', { month: 'long' }),
    MMM: value.toLocaleString('en', { month: 'short' }),
    MM: pad(value.getMonth() + 1),
    DD: pad(value.getDate()),
    dddd: value.toLocaleString('en', { weekday: 'long' }),
    ddd: value.toLocaleString('en', { weekday: 'short' }),
    HH: pad(value.getHours()),
    hh: pad((value.getHours() % 12) || 12),
    mm: pad(value.getMinutes()),
    ss: pad(value.getSeconds()),
    SSS: pad(value.getMilliseconds(), 3),
    A: value.getHours() < 12 ? 'AM' : 'PM',
  }
  let output = ''
  for (let index = 0; index < format.length;) {
    if (format[index] === '[') {
      const close = format.indexOf(']', index + 1)
      if (close >= 0) {
        output += format.slice(index + 1, close)
        index = close + 1
        continue
      }
    }
    const token = Object.keys(replacements).toSorted((left, right) => right.length - left.length).find(candidate => format.startsWith(candidate, index))
    if (token === undefined) {
      output += format[index]
      index += 1
    } else {
      output += replacements[token]
      index += token.length
    }
  }
  return output
}

function safeFolder(folder: string): string {
  if (!isSafeVaultRelativePath(folder) || /^[A-Za-z]:/u.test(folder)) throw new Error('The capture folder is invalid.')
  return folder.replace(/\/$/u, '')
}

function slug(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 80) || 'capture'
}

function collisionPath(path: string, existing: ReadonlySet<string>): string {
  if (!existing.has(path)) return path
  const extension = path.match(/(\.[^./]+)$/u)?.[1] ?? ''
  const stem = extension === '' ? path : path.slice(0, -extension.length)
  for (let index = 2; index <= 1_000; index += 1) {
    const candidate = `${stem}-${String(index)}${extension}`
    if (!existing.has(candidate)) return candidate
  }
  throw new Error('No collision-safe capture path is available.')
}

export function expandTemplate(
  template: string,
  context: { now: Date; title: string; content?: string; fromTitle?: string },
): string {
  if (new TextEncoder().encode(template).byteLength > MAX_TEMPLATE_BYTES) throw new Error('The template is too large.')
  return template.replace(/\{\{(title|content|fromTitle|date|time)(?::([^}\r\n]{1,100}))?\}\}/gu, (source, name: string, format?: string) => {
    if (name === 'title') return context.title
    if (name === 'content') return context.content ?? ''
    if (name === 'fromTitle') return context.fromTitle ?? ''
    if (name === 'date') return formatDate(context.now, format ?? 'YYYY-MM-DD')
    if (name === 'time') return formatDate(context.now, format ?? 'HH:mm')
    return source
  })
}

export function buildCaptureNote(input: {
  body: string
  existing: ReadonlySet<string>
  folder?: string
  now: Date
  title: string
}): { content: string; path: string } {
  const title = input.title.trim().slice(0, 200)
  if (title === '') throw new Error('Capture title is required.')
  if (new TextEncoder().encode(input.body).byteLength > MAX_TEMPLATE_BYTES) throw new Error('Capture body is too large.')
  const folder = safeFolder(input.folder ?? 'Inbox')
  const date = formatDate(input.now, 'YYYY-MM-DD')
  return {
    content: `# ${title}\n\n${input.body}`,
    path: collisionPath(`${folder}/${date}-${slug(title)}.md`, input.existing),
  }
}

export function buildJournalNote(input: {
  dateFormat?: string
  folder: string
  now: Date
  template?: string
}): { content: string; path: string } {
  const folder = safeFolder(input.folder)
  const date = formatDate(input.now, input.dateFormat ?? 'YYYY-MM-DD')
  if (date.length === 0 || date.length > 200 || /[\\/:*?"<>|]/u.test(date)) throw new Error('The journal date format is invalid.')
  return {
    content: input.template === undefined
      ? `---\njournal-date: ${formatDate(input.now, 'YYYY-MM-DD')}\n---\n# ${date}\n`
      : expandTemplate(input.template, { now: input.now, title: date }),
    path: `${folder}/${date}.md`,
  }
}

export function uniqueNotePath(now: Date, existing: ReadonlySet<string>): string {
  const candidate = new Date(now)
  candidate.setSeconds(0, 0)
  for (let index = 0; index < 1_440; index += 1) {
    const path = `${formatDate(candidate, 'YYYYMMDDHHmm')}.md`
    if (!existing.has(path)) return path
    candidate.setMinutes(candidate.getMinutes() + 1)
  }
  throw new Error('No unique-note timestamp is available within one day.')
}
