import { isSafeVaultRelativePath } from './session.ts'
import type { VaultTreeEntry } from './types.ts'

export type SlashLinkRequest =
  | { kind: 'note'; path: string }
  | { kind: 'new-note'; path: string }
  | { kind: 'attachment'; path: string }
  | { kind: 'upload'; file: File }
export interface SlashLinkResult { href: string; label: string; writtenPath?: string }
export class SlashWriteUncertainError extends Error {
  constructor(path: string) { super(`The write outcome for ${path} is uncertain. Check the vault and use an existing-file link before trying another write.`) }
}
export interface SlashLinkContext {
  sourcePath: string
  entries: readonly VaultTreeEntry[]
  isCurrent(): boolean
  resolve(request: SlashLinkRequest, signal: AbortSignal): Promise<SlashLinkResult>
  reportUnlinked(result: SlashLinkResult): void
}

function safePath(path: string): boolean {
  return isSafeVaultRelativePath(path) && !/[\u0000-\u001f\u007f]/u.test(path)
}

/** Inputs are decoded, vault-relative identities; output is a Markdown URL, not a Host path. */
export function markdownLinkHref(source: string, target: string): string {
  if (!safePath(source) || !safePath(target)) throw new Error('Invalid note or attachment path.')
  const from = source.split('/').slice(0, -1), to = target.split('/')
  while (from.length && to.length > 1 && from[0] === to[0]) { from.shift(); to.shift() }
  const encoded = to.map(part => encodeURIComponent(part).replace(/[!'()*]/gu, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)).join('/')
  return `${from.length ? '../'.repeat(from.length) : './'}${encoded}`
}

export function resolveMarkdownLink(source: string, href: string): { path: string; fragment: string | null } | null {
  if (!safePath(source) || !href || href.length > 4096 || /^[a-z][a-z\d+.-]*:|^[\/\\]|[\u0000-\u001f\u007f]/iu.test(href)) return null
  const hash = href.indexOf('#'), raw = hash < 0 ? href : href.slice(0, hash)
  if (raw.includes('?')) return null
  try {
    const parts = source.split('/').slice(0, -1)
    for (const segment of raw.split('/')) {
      const decoded = decodeURIComponent(segment)
      if (/[\/\\]/u.test(decoded)) return null
      if (decoded === '.') continue
      if (decoded === '..') { if (!parts.length) return null; parts.pop() }
      else parts.push(decoded)
    }
    const path = raw === '' ? source : parts.join('/')
    return safePath(path) ? { path, fragment: hash < 0 ? null : decodeURIComponent(href.slice(hash + 1)) } : null
  } catch { return null }
}
