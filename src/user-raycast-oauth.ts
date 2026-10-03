import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

type PkceOptions = Readonly<{
  clientId: string
  endpoint: string
  onAuthorizeUrl: (address: string) => void | Promise<void>
  port?: number
  signal?: AbortSignal
  timeoutMs?: number
}>

/** Listen before offering the URL; neither the authorization code nor verifier reaches the renderer. */
export async function authorizeUserRaycastPkce(options: PkceOptions): Promise<Readonly<{ code: string; codeVerifier: string; redirectURI: string }>> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(options.clientId)) throw new Error('Invalid OAuth client ID')
  const endpoint = new URL(options.endpoint)
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1') || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Invalid OAuth authorization endpoint')
  const port = options.port ?? 38437
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid OAuth callback port')
  if (options.signal?.aborted) throw new Error('OAuth sign-in was canceled')
  const codeVerifier = randomBytes(32).toString('base64url')
  const state = randomBytes(32).toString('base64url')
  let resolveCode!: (code: string) => void
  let rejectCode!: (error: Error) => void
  const received = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject })
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || !request.url || request.url.length > 4096 || request.headers.host !== `127.0.0.1:${String((server.address() as { port: number }).port)}`) { response.writeHead(404).end(); return }
    let callback: URL
    try { callback = new URL(request.url, 'http://127.0.0.1') }
    catch { response.writeHead(400).end('Invalid sign-in response'); return }
    if (callback.pathname !== '/linear/callback' || callback.searchParams.getAll('state').length !== 1) { response.writeHead(404).end(); return }
    const supplied = Buffer.from(callback.searchParams.get('state')!)
    const expected = Buffer.from(state)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { response.writeHead(400).end('Invalid sign-in state'); return }
    const code = callback.searchParams.getAll('code')
    const error = callback.searchParams.getAll('error')
    if (error.length === 1 && error[0]) { response.writeHead(200).end('Sign-in was canceled. You can return to TockTeam.', () => rejectCode(new Error('OAuth sign-in was canceled'))); return }
    if (code.length !== 1 || !code[0] || code[0].length > 2048 || error.length) { response.writeHead(400).end('Invalid sign-in response'); return }
    response.writeHead(200).end('Sign-in complete. You can return to TockTeam.', () => resolveCode(code[0]!))
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
  const redirectURI = `http://127.0.0.1:${String((server.address() as { port: number }).port)}/linear/callback`
  endpoint.searchParams.set('response_type', 'code')
  endpoint.searchParams.set('client_id', options.clientId)
  endpoint.searchParams.set('scope', 'read')
  endpoint.searchParams.set('actor', 'user')
  endpoint.searchParams.set('redirect_uri', redirectURI)
  endpoint.searchParams.set('state', state)
  endpoint.searchParams.set('code_challenge', createHash('sha256').update(codeVerifier).digest('base64url'))
  endpoint.searchParams.set('code_challenge_method', 'S256')
  const cancel = () => rejectCode(new Error('OAuth sign-in was canceled'))
  options.signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => rejectCode(new Error('OAuth sign-in timed out')), options.timeoutMs ?? 120_000)
  try {
    await Promise.race([Promise.resolve().then(() => {
      if (options.signal?.aborted) throw new Error('OAuth sign-in was canceled')
      return options.onAuthorizeUrl(endpoint.href)
    }), received.then(() => undefined)])
    const code = await received
    return { code, codeVerifier, redirectURI }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', cancel)
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
