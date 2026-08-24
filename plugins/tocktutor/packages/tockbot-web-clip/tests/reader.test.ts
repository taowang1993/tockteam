import assert from 'node:assert/strict'
import test from 'node:test'
import type { PublicTextResult } from '../src/fetch.ts'
import {
  ReaderViewError,
  projectReaderView,
} from '../src/reader.ts'

function fetched(text: string, contentType: PublicTextResult['contentType'] = 'text/html'): PublicTextResult {
  return { contentType, text, url: 'https://example.com/article' }
}

test('projects readable HTML as bounded inert text with source metadata', () => {
  const result = projectReaderView(fetched(`
    <html><head><title>Useful &amp; Safe</title><style>.secret{}</style></head>
    <body><script>steal()</script><main><h1>Heading</h1><p>Read <a href="javascript:steal()">this</a>.</p>
    <img src="https://private.invalid/a.png" alt="hidden"><iframe src="http://127.0.0.1">frame secret</iframe>
    <form><button>Do not execute</button></form></main></body></html>
  `))

  assert.equal(result.title, 'Useful & Safe')
  assert.equal(result.sourceUrl, 'https://example.com/article')
  assert.match(result.content, /Heading/)
  assert.match(result.content, /Read this\./)
  assert.match(result.content, /Do not execute/)
  assert.doesNotMatch(result.content, /steal|secret|private|javascript|127\.0\.0\.1|hidden/)
  assert.deepEqual(result.warnings, [])
})

test('normalizes plain text without interpreting markup', () => {
  const result = projectReaderView(fetched('  one\r\n\r\n   two <literal>  ', 'text/plain'))
  assert.equal(result.title, 'example.com')
  assert.equal(result.content, 'one\n\ntwo <literal>\n')
})

test('preserves malformed entities and drops unterminated active blocks', () => {
  const result = projectReaderView(fetched('<article>Before &#999999999999; &unknown;<script>hidden forever'))
  assert.equal(result.content, 'Before &#999999999999; &unknown;\n')
})

test('rejects effectively unbounded direct Reader limits', () => {
  for (const key of Object.keys({
    maxParserInputChars: 0,
    maxParserTokens: 0,
    maxReaderOutputChars: 0,
    maxReaderTitleChars: 0,
    maxReaderWarningChars: 0,
    maxReaderWarnings: 0,
  })) {
    assert.throws(
      () => projectReaderView(fetched('<p>bounded</p>'), { [key]: Number.MAX_SAFE_INTEGER }),
      (error: unknown) => error instanceof ReaderViewError && error.code === 'limits',
    )
  }
})

test('enforces parser input and work limits', () => {
  assert.throws(
    () => projectReaderView(fetched('<p>too long</p>'), { maxParserInputChars: 4 }),
    (error: unknown) => error instanceof ReaderViewError && error.code === 'input',
  )
  assert.throws(
    () => projectReaderView(fetched('<b></b><b></b>'), { maxParserTokens: 2 }),
    (error: unknown) => error instanceof ReaderViewError && error.code === 'parser',
  )
})

test('bounds output, title, warnings, and empty projections', () => {
  const truncated = projectReaderView(fetched('<title>Very Long Title</title><p>abcdefghij</p>'), {
    maxReaderOutputChars: 5,
    maxReaderTitleChars: 4,
    maxReaderWarningChars: 7,
    maxReaderWarnings: 1,
  })
  assert.equal(truncated.title, 'Very')
  assert.ok(truncated.content.length <= 5)
  assert.deepEqual(truncated.warnings, ['Reader…'])

  const empty = projectReaderView(fetched('<script>hidden</script><img src="x">'))
  assert.equal(empty.content, '')
  assert.deepEqual(empty.warnings, ['No readable text was found.'])
})
