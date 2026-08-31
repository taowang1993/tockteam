const MAX_URL_LENGTH = 8_192

export function parseLauncherBrowserHttpUrl(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH || /[\0\r\n]/u.test(value)) {
    throw new Error('Custom browser URL must be a bounded HTTP(S) URL')
  }
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('Custom browser URL must be a valid HTTP(S) URL') }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('Custom browser URL must be an HTTP(S) URL without credentials')
  }
  return parsed.toString()
}

export function parseLauncherCustomBrowserArgumentTemplate(template: string, url: string): readonly string[] {
  if (template !== '{{url}}') throw new Error('Invalid custom browser argument template: only {{url}} is allowed')
  return Object.freeze([parseLauncherBrowserHttpUrl(url)])
}

export function isLauncherCustomBrowserArgumentTemplate(value: unknown): value is '{{url}}' {
  return value === '{{url}}'
}
