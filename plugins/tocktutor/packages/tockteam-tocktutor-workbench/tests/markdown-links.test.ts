import assert from 'node:assert/strict'
import test from 'node:test'
import { markdownLinkHref, resolveMarkdownLink } from '../src/markdown-links.ts'
import { renderMarkdownHtml } from '../src/rich-markdown.ts'

test('ordinary links round-trip exact nested vault paths without double decoding', () => {
  for (const target of ['Notes/健康 [A] (1) #?%.md', 'Notes/%20.md', 'file.pdf']) {
    const href = markdownLinkHref('Drafts/Source.md', target)
    assert.equal(resolveMarkdownLink('Drafts/Source.md', href)?.path, target)
    assert.ok(!href.includes('#'))
  }
  assert.equal(markdownLinkHref('Notes/Source.md', 'Notes/Target.md'), './Target.md')
  for (const href of ['../../escape.md', '/root.md', '//host/a.md', 'javascript:foo', '%2Froot.md', '..%2Fescape.md', './%00.md', './x%5cy.md']) {
    assert.equal(resolveMarkdownLink('Source.md', href), null, href)
  }
})

test('Reading preserves Markdown link escapes and distinguishes relative links from wikilinks', () => {
  const html = renderMarkdownHtml('[A \\[link\\]](../Notes/A%20%231.md) and [Web](https://example.com/?a=1\\&b=2)', { externalEmbedMode: 'viewer' })
  assert.match(html, /data-link-kind="markdown"/)
  assert.match(html, /data-target="\.\.\/Notes\/A%20%231.md"/)
  assert.match(html, />A \[link\]<\/a>/)
  assert.match(html, /data-external-url="https:\/\/example.com\/\?a=1&amp;b=2"/)
  assert.doesNotMatch(renderMarkdownHtml('[Bad](javascript:alert%281%29)'), /<a /)
})
