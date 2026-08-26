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

test('builds a self-contained inert export accepted by the deny-by-default Desktop owner', () => {
  const document = buildMarkdownExportDocument({
    markdown: '# Export\n[External](https://example.com)\n![Remote](https://example.com/image.png)\n',
    title: 'A < B',
  })
  assert.match(document, /<title>A &lt; B<\/title>/u)
  assert.doesNotMatch(document, /<meta|\s(?:href|src)=|https?:\/\//u)
})

test('includes bounded resolved embeds in static HTML without rewriting authored Markdown', () => {
  const markdown = '# Export\n![[Attachments/image.png]]\n![[Second.md#Part]]\n![[Board.canvas]]\n![[voice.weba]]\n'
  const document = buildMarkdownExportDocument({
    markdown,
    title: 'Embeds',
    embeds: [
      { content: 'AQID', mimeType: 'image/png', target: { display: null, fragment: null, kind: 'media', path: 'Attachments/image.png', source: '![[Attachments/image.png]]' } },
      { content: '## Part\n<script>alert(1)</script>\n', target: { display: null, fragment: 'Part', kind: 'note', path: 'Second.md', source: '![[Second.md#Part]]' } },
      { content: '{"nodes":[]}', target: { display: null, fragment: null, kind: 'canvas', path: 'Board.canvas', source: '![[Board.canvas]]' } },
      { content: '', mimeType: 'audio/webm', target: { display: null, fragment: null, kind: 'media', path: 'voice.weba', source: '![[voice.weba]]' } },
    ],
  })
  assert.match(document, /<section[^>]+aria-label="Resolved Embeds"/u)
  assert.match(document, /<img[^>]+src="data:image\/png;base64,AQID"/u)
  assert.match(document, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u)
  assert.match(document, /<pre>\{&quot;nodes&quot;:\[\]\}<\/pre>/u)
  assert.match(document, /Audio Embed: voice\.weba/u)
  assert.match(document, /data-target="Second\.md#Part"/u)
  assert.doesNotMatch(document, /<audio|<script/u)
})

test('sanitizes block raw text/table HTML and keeps external embeds inert by default', () => {
  const html = renderMarkdownHtml([
    '<p class="lesson" onclick="alert(1)">Safe <strong>text</strong></p>',
    '<table><tr><td>Cell</td><td><img src="https://evil.example/x"></td></tr></table>',
    '![Video](https://www.youtube.com/watch?v=NnTvZWp5Q7o)',
    '![Remote](https://images.example/remote.png)',
  ].join('\n'))
  assert.match(html, /<p class="lesson">Safe <strong>text<\/strong><\/p>/u)
  assert.match(html, /<table>/u)
  assert.doesNotMatch(html, /onclick|<img|<iframe|https:\/\//u)
  assert.match(html, /tocktutor-external-embed-inert/u)
})

test('viewer mode emits inert buttons for the isolated Web Viewer handoff', () => {
  const html = renderMarkdownHtml('![Video](https://www.youtube.com/watch?v=NnTvZWp5Q7o)\n![Page](https://example.com/article)', { externalEmbedMode: 'viewer' })
  assert.match(html, /data-external-embed-kind="youtube"/u)
  assert.match(html, /data-external-url="https:\/\/www\.youtube-nocookie\.com\/embed\/NnTvZWp5Q7o"/u)
  assert.match(html, /data-external-embed-kind="image"/u)
  assert.doesNotMatch(html, /<img[^>]+src="https:\/\//u)
})
