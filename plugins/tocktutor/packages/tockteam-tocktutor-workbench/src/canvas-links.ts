export class CanvasLinkUrlError extends Error {
  readonly code: 'invalid' | 'http-only' | 'credential-bearing'

  constructor(code: 'invalid' | 'http-only' | 'credential-bearing', message: string) {
    super(message)
    this.name = 'CanvasLinkUrlError'
    this.code = code
  }
}

/** Normalize user-entered Canvas links without allowing credentials or non-web schemes. */
export function normalizeCanvasLinkUrl(value: string): string {
  const trimmed = value.trim()
  const candidate = /^[a-z][a-z\d+.-]*:(?!\d)/iu.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new CanvasLinkUrlError('invalid', 'Enter a valid web page URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CanvasLinkUrlError('http-only', 'Canvas link cards require an HTTP or HTTPS URL.')
  }
  if (url.username || url.password) {
    throw new CanvasLinkUrlError('credential-bearing', 'Canvas link cards cannot include usernames or passwords.')
  }
  return url.toString()
}

/** Validate persisted Canvas URLs while preserving valid explicit spelling. */
export function tryNormalizeCanvasLinkUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  try {
    const normalized = normalizeCanvasLinkUrl(trimmed)
    return /^https?:\/\//iu.test(trimmed) ? trimmed : normalized
  } catch {
    return undefined
  }
}
