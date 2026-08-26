import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMarkdownExportDocument,
  buildMarkdownSlides,
  renderMarkdownHtml,
} from '../dist/rich-markdown.js'

test('renders bounded rich Markdown without executing raw HTML or unsafe URLs', () => {
  const html = renderMarkdownHtml([
    '# Lesson',
    '',
    '> [!tip]+ Safe callout',
    '> Body with ==highlight== and $x + 1$.',
    '',
    '| Name | Score |',
    '| --- | ---: |',
    '| Ada | 5 |',
    '',
    'Reference[^one] and [safe](https://example.com).',
    '[unsafe](javascript:alert(1))',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
    '',
    '<script>alert(1)</script><strong>Safe</strong>',
    '',
    '[^one]: Footnote text.',
  ].join('\n'))
  assert.match(html, /<h1>Lesson<\/h1>/u)
  assert.match(html, /class="callout callout-tip"/u)
  assert.match(html, /<mark>highlight<\/mark>/u)
  assert.match(html, /class="math-inline"/u)
  assert.match(html, /<table>/u)
  assert.match(html, /class="footnotes"/u)
  assert.match(html, /href="https:\/\/example\.com\/"/u)
  assert.doesNotMatch(html, /href="javascript:/u)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;<strong>Safe<\/strong>/u)
  assert.match(html, /aria-label="Mermaid Diagram"/u)
  assert.match(html, />A<\/span><span aria-hidden="true"> → <\/span><span class="mermaid-node">B</u)
})

test('honors strict line breaks and builds fenced-aware slides', () => {
  assert.match(renderMarkdownHtml('First\nsecond\n', { strictLineBreaks: false }), /First<br>second/u)
  assert.match(renderMarkdownHtml('First\nsecond\n', { strictLineBreaks: true }), /First second/u)
  assert.match(renderMarkdownHtml('First  \nsecond\n', { strictLineBreaks: true }), /First<br>second/u)
  const slides = buildMarkdownSlides('One\n---\n```md\n---\n```\n---\nThree\n')
  assert.equal(slides.length, 3)
  assert.match(slides[1]!, /<pre/u)
})

test('builds a self-contained static export with a deny-by-default resource policy', () => {
  const document = buildMarkdownExportDocument({ markdown: '# Export\n', title: 'A < B' })
  assert.match(document, /default-src 'none'/u)
  assert.match(document, /img-src data: blob:/u)
  assert.match(document, /<title>A &lt; B<\/title>/u)
  assert.doesNotMatch(document, /https?:\/\//u)
})
