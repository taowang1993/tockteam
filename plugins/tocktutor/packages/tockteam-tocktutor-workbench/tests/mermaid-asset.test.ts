import assert from 'node:assert/strict'
import test from 'node:test'
import { createMermaidFrameHandler, MERMAID_FRAME_PATH } from '../dist/mermaid-asset.js'

function response(): { status: number; headers: Record<string, string | number>; body: Buffer | undefined; writeHead: (status: number, headers: Record<string, string | number>) => { end: (body?: Buffer) => void } } {
  const record = { status: 0, headers: {}, body: undefined } as { status: number; headers: Record<string, string | number>; body: Buffer | undefined }
  return Object.assign(record, { writeHead(status: number, headers: Record<string, string | number>) {
    record.status = status
    record.headers = headers
    return { end(body?: Buffer) { record.body = body } }
  } })
}

test('serves one fixed package-owned Mermaid frame script and no vault data', async () => {
  assert.equal(MERMAID_FRAME_PATH, '/tocktutor/mermaid-frame.js')
  const handler = createMermaidFrameHandler()
  const get = response()
  await handler({ method: 'GET', url: `${MERMAID_FRAME_PATH}?anything=ignored` } as never, get as never)
  assert.equal(get.status, 200)
  assert.equal(get.headers['Content-Type'], 'text/javascript; charset=utf-8')
  assert.equal(get.headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(get.headers['Cache-Control'], 'no-store')
  assert.equal(get.body?.length, get.headers['Content-Length'])
  assert.match(get.body!.toString('utf8'), /tocktutor-mermaid/u)
  const head = response()
  await handler({ method: 'HEAD' } as never, head as never)
  assert.equal(head.status, 200)
  assert.equal(head.body, undefined)
  const post = response()
  await handler({ method: 'POST' } as never, post as never)
  assert.equal(post.status, 405)
  assert.equal(post.body, undefined)
})
