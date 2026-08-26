export type ExternalEmbedKind = 'image' | 'twitter' | 'web' | 'youtube'

export interface ExternalEmbedTarget {
  kind: ExternalEmbedKind
  sourceUrl: string
  viewerUrl: string
}

const MAX_EXTERNAL_URL_BYTES = 4_096
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,64}$/u
const TWEET_ID = /^\d{6,32}$/u

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'home.arpa' || host.endsWith('.home.arpa')) return true
  if (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') || host.startsWith('::ffff:')) return true
  if (/^\d+(?:\.\d+){3}$/u.test(host)) {
    const octets = host.split('.').map(Number)
    if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true
    const [first, second] = octets
    return first! === 0 || first! === 10 || first! === 127 || first! === 169 && second === 254
      || first! === 172 && second! >= 16 && second! <= 31
      || first! === 192 && second === 0 || first! === 192 && second === 168
      || first! === 198 && (second === 18 || second === 19)
      || first! >= 224
  }
  return /^\d+(?:\.\d+){3}$/u.test(host)
}

function parsePublicUrl(value: string): URL | null {
  if (typeof value !== 'string' || value.length === 0 || new TextEncoder().encode(value).byteLength > MAX_EXTERNAL_URL_BYTES || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) return null
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '' || url.hostname === '' || isPrivateHostname(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

function normalizedHost(url: URL): string {
  return url.hostname.toLocaleLowerCase().replace(/^(?:www\.|m\.|mobile\.)/u, '')
}

export function classifyExternalEmbed(value: string): ExternalEmbedTarget | null {
  const url = parsePublicUrl(value)
  if (url === null) return null
  const host = normalizedHost(url)
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    const id = host === 'youtu.be'
      ? parts[0]
      : url.pathname === '/watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(parts[0] ?? '') ? parts[1] : null
    if (id !== null && id !== undefined && YOUTUBE_ID.test(id)) {
      return { kind: 'youtube', sourceUrl: url.toString(), viewerUrl: `https://www.youtube-nocookie.com/embed/${id}` }
    }
  }
  if (host === 'twitter.com' || host === 'x.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    const index = parts.findIndex(part => /^status(?:es)?$/iu.test(part))
    const id = index >= 0 ? parts[index + 1] : undefined
    if (id !== undefined && TWEET_ID.test(id)) {
      return { kind: 'twitter', sourceUrl: url.toString(), viewerUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true` }
    }
  }
  return { kind: 'web', sourceUrl: url.toString(), viewerUrl: url.toString() }
}

export function externalEmbedButtonHtml(alt: string, target: ExternalEmbedTarget): string {
  const label = alt.trim() || (target.kind === 'youtube' ? 'YouTube Video' : target.kind === 'twitter' ? 'Tweet' : target.kind === 'image' ? 'External Image' : 'Open Web Page')
  const escapedLabel = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  const escapedUrl = target.viewerUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const text = target.kind === 'image' ? `External Image: ${escapedLabel}` : target.kind === 'youtube' ? `YouTube: ${escapedLabel}` : target.kind === 'twitter' ? `Tweet: ${escapedLabel}` : `Open Web Page: ${escapedLabel}`
  return `<button class="tocktutor-external-embed" data-external-embed-kind="${target.kind}" data-external-url="${escapedUrl}" type="button">${text}</button>`
}

export function externalEmbedInertHtml(alt: string, target: ExternalEmbedTarget): string {
  const label = alt.trim() || (target.kind === 'image' ? 'External Image' : target.kind === 'youtube' ? 'YouTube Video' : target.kind === 'twitter' ? 'Tweet' : 'External Web Page')
  const escaped = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  return `<span class="tocktutor-external-embed-inert" data-external-embed-kind="${target.kind}">${escaped}</span>`
}

/** Return the viewer-safe URL only; the caller must still use the isolated Web Viewer. */
export function viewerExternalUrl(value: string): string | null {
  return classifyExternalEmbed(value)?.viewerUrl ?? null
}
