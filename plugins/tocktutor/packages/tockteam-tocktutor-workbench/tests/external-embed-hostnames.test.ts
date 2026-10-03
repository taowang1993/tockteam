import assert from 'node:assert/strict'
import test from 'node:test'

const { classifyExternalEmbed, viewerExternalUrl } = await import(
  process.env.TOCKTUTOR_EXTERNAL_EMBEDS_ENTRY ?? '../src/external-embeds.ts'
) as typeof import('../src/external-embeds.ts')
const { renderMarkdownHtml } = await import(
  process.env.TOCKTUTOR_RICH_MARKDOWN_ENTRY ?? '../src/rich-markdown.ts'
) as typeof import('../src/rich-markdown.ts')

test('public DNS names beginning with fc or fd remain available to the Web Viewer', () => {
  for (const source of [
    'https://fda.gov/consumer',
    'https://fcbarcelona.com/news',
    'https://fd.io/',
    'http://fcdn.example.com/article',
    'https://FDA.GOV./consumer',
  ]) {
    const normalized = new URL(source).toString()
    assert.deepEqual(classifyExternalEmbed(source), {
      kind: 'web', sourceUrl: normalized, viewerUrl: normalized,
    }, source)
    assert.equal(viewerExternalUrl(source), normalized)
  }
})

test('private IPv6 addresses and private or credentialed DNS names remain unavailable', () => {
  for (const source of [
    'http://[fc00::1]/',
    'https://[fd00::1234]/',
    'http://[FCFF:FFFF::1]/',
    'http://[fdff:ffff::1]/',
    'http://[fe80::1]/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://fda.local/',
    'http://fc-router.home.arpa/',
    'https://user:password@fda.gov/',
  ]) {
    assert.equal(classifyExternalEmbed(source), null, source)
    assert.equal(viewerExternalUrl(source), null, source)
  }
  assert.equal(classifyExternalEmbed('https://[2606:4700:4700::1111]/')?.kind, 'web')
})

test('Reading renders public fc and fd embeds as viewer buttons while private targets stay inert', () => {
  const markdown = [
    '![FDA article](https://fda.gov/consumer)',
    '![Club news](https://fcbarcelona.com/news)',
    '![FD project](https://fd.io/)',
    '![Private address](http://[fd00::1]/)',
  ].join('\n\n')
  const html = renderMarkdownHtml(markdown, { externalEmbedMode: 'viewer' })
  for (const source of ['https://fda.gov/consumer', 'https://fcbarcelona.com/news', 'https://fd.io/']) {
    assert.ok(html.includes(`data-external-url="${source}"`), source)
  }
  assert.equal((html.match(/data-external-url=/gu) ?? []).length, 3)
  assert.doesNotMatch(html, /(?:src|href|data-external-url)="http:\/\/\[fd00::1\]/u)
  assert.doesNotMatch(renderMarkdownHtml(markdown), /data-external-url=/u)
})
