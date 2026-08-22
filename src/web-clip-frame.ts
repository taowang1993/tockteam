export const MAX_WEB_CLIP_DOCUMENT_CHARS = 1_000_000
export const WEB_CLIP_GUEST_ARGUMENT = '--tockteam-web-clip-guest'
export const WEB_CLIP_PARTITION_PREFIX = 'tockteam-web-clip-'
export const WEB_CLIP_DOCUMENT_PREFIX = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'; connect-src \'none\'; font-src \'none\'; form-action \'none\'; frame-src \'none\'; img-src data:; media-src \'none\'; navigate-to \'none\'; object-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'"><meta name="referrer" content="no-referrer">'

interface WebClipFrame {
  allowedUrl: string | null
  embedderId: number
}

const requestCredentialHeaders = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
])
const responseCredentialHeaders = new Set([
  'proxy-authenticate',
  'set-cookie',
  'set-cookie2',
  'www-authenticate',
])

export function isWebClipPartition(partition: string | undefined): boolean {
  return partition?.startsWith(WEB_CLIP_PARTITION_PREFIX) === true
}

function withoutHeaders<T>(headers: Record<string, T>, blocked: ReadonlySet<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !blocked.has(name.toLowerCase())))
}

export function stripWebClipRequestHeaders<T>(headers: Record<string, T>): Record<string, T> {
  return withoutHeaders(headers, requestCredentialHeaders)
}

export function stripWebClipResponseHeaders<T>(headers: Record<string, T>): Record<string, T> {
  return withoutHeaders(headers, responseCredentialHeaders)
}

function buildDocumentUrl(html: string): string {
  if (typeof html !== 'string' || html.length > MAX_WEB_CLIP_DOCUMENT_CHARS) {
    throw new Error('Web Clip document is invalid or too large')
  }
  return `data:text/html;charset=utf-8,${encodeURIComponent(`${WEB_CLIP_DOCUMENT_PREFIX}${html.toWellFormed()}`)}`
}

export class WebClipFrameAuthorizations {
  private readonly frames = new Map<number, WebClipFrame>()

  attach(frameId: number, embedderId: number): void {
    this.frames.set(frameId, { allowedUrl: null, embedderId })
  }

  authorize(frameId: number, embedderId: number, html: string): string {
    const frame = this.frames.get(frameId)
    if (frame === undefined || frame.embedderId !== embedderId) {
      throw new Error('Web Clip frame is unavailable')
    }
    const url = buildDocumentUrl(html)
    frame.allowedUrl = url
    return url
  }

  allows(frameId: number, url: string): boolean {
    return this.frames.get(frameId)?.allowedUrl === url
  }

  commit(frameId: number): void {
    const frame = this.frames.get(frameId)
    if (frame !== undefined) frame.allowedUrl = null
  }

  detach(frameId: number): void {
    this.frames.delete(frameId)
  }
}
