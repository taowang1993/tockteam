import type { IncomingMessage } from 'node:http'

function authority(value: string): URL | undefined {
  try {
    const url = new URL(`http://${value}`)
    return url.username === '' && url.password === '' && url.pathname === '/'
      && url.search === '' && url.hash === ''
      ? url
      : undefined
  } catch {
    return undefined
  }
}

function loopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1' || hostname === '[::1]'
}

function trusted(host: URL, trustedHosts: readonly string[]): boolean {
  if (loopback(host.hostname)) return true
  return trustedHosts.some(value => {
    const candidate = authority(value)
    if (candidate === undefined || candidate.hostname !== host.hostname) return false
    return candidate.port === '' || candidate.port === host.port
  })
}

/** Match DSH's browser trust fence for privileged plugin HTTP routes. */
export function isTrustedBrowserRequest(
  request: Pick<IncomingMessage, 'headers'>,
  trustedHosts: readonly string[] = [],
): boolean {
  const hostValue = request.headers.host
  if (hostValue === undefined) return false
  const host = authority(hostValue)
  if (host === undefined || !trusted(host, trustedHosts)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === host.host
  } catch {
    return false
  }
}

export function webRuntimeTrustedHosts(context: { get(name: string): unknown }): readonly string[] {
  const runtime = context.get('webRuntime') as { trustedHosts?: unknown } | undefined
  return Array.isArray(runtime?.trustedHosts)
    && runtime.trustedHosts.every(value => typeof value === 'string')
    ? runtime.trustedHosts
    : []
}
