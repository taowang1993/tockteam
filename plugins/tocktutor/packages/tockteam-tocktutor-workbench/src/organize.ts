import { isSafeVaultRelativePath } from './session.ts'

export const MAX_ORGANIZE_BYTES = 1_000_000
export const MAX_ORGANIZE_CAPTURES = 100

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function date(value: Date): string {
  return `${String(value.getFullYear())}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80) || 'note'
}

function safeUrl(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '' ? url.toString() : null
  } catch {
    return null
  }
}

function digest(value: string): string {
  let hash = 2166136261
  for (const character of value) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0
  return hash.toString(16).padStart(8, '0')
}

export function buildHighlightNote(input: {
  highlights: readonly string[]
  now: Date
  sourceUrl?: string
  title: string
}): { content: string; path: string } {
  const title = input.title.trim().slice(0, 200)
  if (title === '' || input.highlights.length === 0 || input.highlights.length > 1_000) throw new Error('Highlight input is invalid.')
  const url = safeUrl(input.sourceUrl)
  if (input.sourceUrl !== undefined && input.sourceUrl.trim() !== '' && url === null) throw new Error('Highlight source URL is invalid.')
  const body = input.highlights.map(highlight => {
    if (bytes(highlight) > MAX_ORGANIZE_BYTES) throw new Error('Highlight input is too large.')
    return highlight.split(/\r?\n/u).map(line => `> ${line}`).join('\n')
  }).join('\n\n')
  const content = [
    '---',
    ...(url === null ? [] : [`source: ${JSON.stringify(url)}`]),
    `title: ${JSON.stringify(title)}`,
    '---',
    `# ${title}`,
    '',
    body,
    '',
  ].join('\n')
  if (bytes(content) > MAX_ORGANIZE_BYTES) throw new Error('Highlight input is too large.')
  return { content, path: `Highlights/${date(input.now)}-${slug(title)}.md` }
}

export interface OrganizationProposal {
  captures: readonly string[]
  content: string
  destination: string
  id: string
  title: string
}

export function buildOrganizationProposal(input: {
  captures: ReadonlyArray<{ content: string; path: string }>
  now: Date
  title: string
}): OrganizationProposal {
  if (input.captures.length === 0 || input.captures.length > MAX_ORGANIZE_CAPTURES) throw new Error('Organization requires bounded captures.')
  const title = input.title.trim().slice(0, 200)
  if (title === '') throw new Error('Organization title is required.')
  const seen = new Set<string>()
  for (const capture of input.captures) {
    if (!isSafeVaultRelativePath(capture.path) || !/^Inbox\/.+\.md$/iu.test(capture.path)) throw new Error('Capture path is invalid.')
    if (seen.has(capture.path) || bytes(capture.content) > MAX_ORGANIZE_BYTES) throw new Error('Capture input is invalid or too large.')
    seen.add(capture.path)
  }
  const sections = input.captures.map(capture => {
    const heading = capture.content.match(/^#\s+(.+)$/mu)?.[1]?.trim() || capture.path.split('/').at(-1)!.replace(/\.md$/iu, '')
    const body = capture.content.replace(/^---[\s\S]*?^---\s*/mu, '').replace(/^#\s+.*(?:\r?\n|$)/u, '').trim()
    return `## ${heading}\n\nSource: [[${capture.path}]]\n\n${body}`
  })
  const destination = `Organized/${date(input.now)}-${slug(title)}.md`
  const content = `# ${title}\n\n${sections.join('\n\n')}\n`
  if (bytes(content) > MAX_ORGANIZE_BYTES) throw new Error('Organization output is too large.')
  const canonical = JSON.stringify({ captures: [...seen], content, destination, title })
  return { captures: Object.freeze([...seen]), content, destination, id: `organize-${digest(canonical)}`, title }
}
