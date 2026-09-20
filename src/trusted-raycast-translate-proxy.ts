/** Resolve only Google's fixed origin in Electron main; never expose proxy configuration to the renderer. */
export async function resolveTrustedTranslateProxy(resolveProxy: (url: string) => Promise<string>): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const rules = await Promise.race([
      resolveProxy('https://translate.google.com'),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Translate proxy lookup timed out')), 5000) }),
    ])
    const first = rules.split(';')[0]!.trim()
    if (first === 'DIRECT') return ''
    const match = /^(PROXY|HTTPS) (\[[\da-f:]+\]|[^\s/:@]+):(\d+)$/i.exec(first)
    if (!match) throw new Error('Translate requires a direct connection or an HTTP/HTTPS proxy')
    try { return new URL(`${match[1]!.toUpperCase() === 'HTTPS' ? 'https' : 'http'}://${match[2]}:${match[3]}`).origin }
    catch { throw new Error('Translate proxy configuration is invalid') }
  } finally { clearTimeout(timer) }
}
