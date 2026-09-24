import assert from 'node:assert/strict'
import test from 'node:test'
import * as transport from '../src/fetch.ts'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV9sAAAAASUVORK5CYII=', 'base64')
const lookup = async () => [{ address: '93.184.216.34' }]

test('loads image bytes over the same pinned, credential-free public transport', async () => {
  const seen: transport.PublicFetchRequest[] = []
  const result = await transport.fetchPublicImage('https://example.com/photo', { lookup, request: async request => {
    seen.push(request)
    return new Response(png, { headers: { 'content-type': 'image/png' } })
  } })
  assert.equal(result.mimeType, 'image/png')
  assert.equal(result.dataBase64, png.toString('base64'))
  assert.equal(seen[0]?.address, '93.184.216.34')
  assert.equal(seen[0]?.headers.cookie, undefined)
  assert.equal(seen[0]?.headers.authorization, undefined)
  assert.equal(seen[0]?.headers.referer, undefined)
})

test('uses the raster bytes when a CDN mislabels an image content type or extension', async () => {
  const images = [
    { mimeType: 'image/jpeg', data: Buffer.from('ffd8ffe000104a46494600', 'hex') },
    { mimeType: 'image/png', data: png },
    { mimeType: 'image/gif', data: Buffer.from('GIF89a') },
    { mimeType: 'image/webp', data: Buffer.from('524946460000000057454250', 'hex') },
    { mimeType: 'image/avif', data: Buffer.from('000000206674797061766966', 'hex') },
  ]
  for (const { mimeType, data } of images) {
    const result = await transport.fetchPublicImage('https://example.com/042423.png', {
      lookup,
      request: async () => new Response(data, { headers: { 'content-type': mimeType === 'image/png' ? 'image/jpeg' : 'image/png' } }),
    })
    assert.equal(result.mimeType, mimeType)
    assert.equal(result.dataBase64, data.toString('base64'))
  }
})

test('images have a separate bounded budget from text downloads', async () => {
  const data = Buffer.concat([png, Buffer.alloc(1_489_970 - png.length)])
  const options = { lookup, request: async () => new Response(data, { headers: { 'content-type': 'image/png', 'content-length': String(data.length) } }) }
  const result = await transport.fetchPublicImage('https://example.com/large.png', options)
  assert.equal(Buffer.from(result.dataBase64, 'base64').length, data.length)
  assert.equal(transport.defaultPublicFetchLimits.maxResponseBytes, 1_000_000)
  for (const declared of [true, false]) {
    const oversized = Buffer.concat([png, Buffer.alloc(10_000_001 - png.length)])
    await assert.rejects(transport.fetchPublicImage('https://example.com/oversized.png', {
      lookup, request: async () => new Response(oversized, { headers: { 'content-type': 'image/png', ...(declared ? { 'content-length': String(oversized.length) } : {}) } }),
    }), (error: unknown) => error instanceof transport.WebFetchError && error.code === 'body')
  }
})

test('image loading rejects private redirect targets, active formats, forged image bytes and oversized bodies', async () => {
  const cases = [
    { response: new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }), code: 'address' },
    { response: new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), code: 'content-type' },
    { response: new Response('<script>bad()</script>', { headers: { 'content-type': 'image/png' } }), code: 'content-type' },
    { response: new Response('<svg/>', { headers: { 'content-type': 'image/png' } }), code: 'content-type' },
    { response: new Response(png, { headers: { 'content-type': 'text/html' } }), code: 'content-type' },
    { response: new Response(png, { headers: { 'content-type': 'image/png' } }), code: 'body', maxResponseBytes: 8 },
  ]
  for (const value of cases) await assert.rejects(transport.fetchPublicImage('https://example.com/image', {
    lookup, request: async () => value.response,
    ...(value.maxResponseBytes ? { limits: { maxResponseBytes: value.maxResponseBytes } } : {}),
  }), (error: unknown) => error instanceof transport.WebFetchError && error.code === value.code)
})
