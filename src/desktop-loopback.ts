import { timingSafeEqual } from 'node:crypto'

export interface DesktopLoopbackEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
}

export function desktopBearerAuthorized(value: string | undefined, expected: string): boolean {
  if (value === undefined) return false
  const actual = Buffer.from(value)
  const target = Buffer.from(expected)
  return actual.length === target.length && timingSafeEqual(actual, target)
}

export function desktopLoopbackEndpoint(environment: DesktopLoopbackEnvironment): URL | undefined {
  if (environment.endpoint === undefined || environment.token === undefined) return undefined
  try {
    const endpoint = new URL(environment.endpoint)
    return endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1'
      ? endpoint
      : undefined
  } catch {
    return undefined
  }
}
