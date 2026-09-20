import { createRequire } from 'node:module'

// Use the admitted child's existing undici, not a new dependency or renderer network API.
const { request: upstreamRequest, ProxyAgent } = createRequire(import.meta.url)('undici')
export { ProxyAgent }
const proxy = process.env.TRUSTED_RAYCAST_TRANSLATE_PROXY
const dispatcher = proxy ? new ProxyAgent(proxy) : undefined

/** Both pinned calls (token lookup and translation) need the same routing and full-body deadline. */
export function request(url: string, options: { dispatcher?: unknown; signal?: AbortSignal } = {}) {
  const deadline = AbortSignal.timeout(10000)
  return upstreamRequest(url, {
    ...options,
    dispatcher: options.dispatcher ?? dispatcher,
    signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
  })
}
