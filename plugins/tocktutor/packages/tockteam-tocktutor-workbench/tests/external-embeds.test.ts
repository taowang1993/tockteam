import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyExternalEmbed, viewerExternalUrl } from '../dist/external-embeds.js'

test('classifies credential-free public external media and canonical viewer targets', () => {
  assert.deepEqual(classifyExternalEmbed('https://www.youtube.com/watch?v=NnTvZWp5Q7o'), {
    kind: 'youtube',
    sourceUrl: 'https://www.youtube.com/watch?v=NnTvZWp5Q7o',
    viewerUrl: 'https://www.youtube-nocookie.com/embed/NnTvZWp5Q7o',
  })
  assert.deepEqual(classifyExternalEmbed('https://x.com/tockteam/status/1580548874246443010')?.kind, 'twitter')
  assert.equal(classifyExternalEmbed('https://example.com/image.png')?.kind, 'web')
  assert.equal(viewerExternalUrl('https://example.com/a'), 'https://example.com/a')
})

test('rejects private, credentialed, malformed, and non-HTTP external targets', () => {
  for (const value of [
    'http://127.0.0.1/a',
    'http://10.0.0.1/a',
    'http://192.168.1.2/a',
    'http://[::1]/a',
    'http://[fe81::1]/a',
    'http://[febf::1]/a',
    'http://router.home.arpa/a',
    'https://user:secret@example.com/a',
    'javascript:alert(1)',
    'https://example.com/\nnext',
  ]) assert.equal(classifyExternalEmbed(value), null, value)
})
