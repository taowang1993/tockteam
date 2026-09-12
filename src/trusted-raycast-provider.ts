import { request } from 'node:http'
import { desktopLoopbackEndpoint } from './desktop-loopback.ts'
import { TRUSTED_RAYCAST_ACTIVATION_PATH, type TrustedRaycastEnvironment } from './trusted-raycast-channel.ts'

/** Stdlib HTTP has no fetch body deadline: the Host owns the entire stream lifetime. */
export function activateTrustedRaycast(environment: TrustedRaycastEnvironment): { ready: Promise<void>; dispose(): Promise<void> } {
  const endpoint = desktopLoopbackEndpoint(environment)
  if (!endpoint || endpoint.pathname !== TRUSTED_RAYCAST_ACTIVATION_PATH || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) throw new Error('Invalid Translate activation endpoint')
  let resolveReady!: () => void
  let rejectReady!: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  const connection = request(endpoint, { method: 'POST', headers: { authorization: `Bearer ${environment.token}` }, agent: false })
  const timer = setTimeout(() => connection.destroy(new Error('Translate activation timed out')), 15000)
  connection.once('response', response => {
    let body = ''
    response.setEncoding('utf8')
    response.on('error', error => connection.destroy(error))
    if (response.statusCode !== 200) { connection.destroy(new Error('Translate activation rejected')); return }
    response.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 16 || !'{"active":true}\n'.startsWith(body)) { connection.destroy(new Error('Invalid Translate activation acknowledgment')); return }
      if (body === '{"active":true}\n') { clearTimeout(timer); resolveReady() }
    })
    response.once('end', () => connection.destroy())
  })
  connection.on('error', rejectReady)
  const closed = new Promise<void>(resolve => connection.once('close', () => {
    clearTimeout(timer)
    rejectReady(new Error('Translate activation closed'))
    resolve()
  }))
  connection.end('{}')
  return { ready, async dispose() { connection.destroy(); await closed } }
}
