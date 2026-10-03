import assert from 'node:assert/strict'
import http from 'node:http'
import { syncBuiltinESMExports } from 'node:module'
import { fetchPublicText, WebFetchError } from '../../src/fetch.ts'

const status = Number(process.argv[2])
assert.ok([200, 204, 205, 304, 404, 600].includes(status))
let peerClosed
const server = http.createServer((request, response) => {
  peerClosed = new Promise(resolve => request.socket.once('close', resolve))
  response.writeHead(status, { 'content-type': 'text/plain' })
  if (status === 205) response.write('ignored body that stays open')
  else response.end(status === 200 ? 'readable content' : '')
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const originalRequest = http.request
const address = server.address()
assert.ok(address && typeof address === 'object')
http.request = (url, options, callback) => {
  assert.equal(url.hostname, 'fixture.example')
  assert.equal(options.agent, false)
  return originalRequest(new URL(`http://127.0.0.1:${address.port}/`), {
    ...options, lookup: undefined,
  }, callback)
}
syncBuiltinESMExports()
try {
  const pending = fetchPublicText('http://fixture.example/', {
    lookup: async () => [{ address: '93.184.216.34' }],
    limits: { timeoutMs: 1_000 },
  })
  if (status === 200 || status === 204 || status === 205) {
    assert.equal((await pending).text, status === 200 ? 'readable content' : '')
  } else {
    await assert.rejects(pending, error => error instanceof WebFetchError
      && error.code === (status === 600 ? 'network' : 'status'))
  }
  await peerClosed
} finally {
  http.request = originalRequest
  syncBuiltinESMExports()
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
