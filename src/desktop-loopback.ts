export interface DesktopLoopbackEnvironment {
  endpoint?: string | undefined
  token?: string | undefined
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
