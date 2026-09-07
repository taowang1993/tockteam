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
  assert.doesNotMatch(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u)
  assert.match(html, /<strong>Safe<\/strong>/u)
  assert.match(html, /aria-label="Mermaid Diagram"/u)
  assert.match(html, /<svg[^>]+class="mermaid-svg"/u)
  assert.match(html, /class="mermaid-edge-path"/u)
  assert.match(html, /class="mermaid-node-label"[^>]*>A<\/text>/u)
})

test('suppresses active HTML outside fenced code while preserving surrounding Markdown order', () => {
  const html = renderMarkdownHtml('Before\n\n<script>alert(1)</script><strong>Safe</strong>\n\nAfter\n\n```md\n<script>literal</script>\n```\n')
  assert.match(html, /<p>Before<\/p>\n<p><strong>Safe<\/strong><\/p>\n<p>After<\/p>/u)
  assert.doesNotMatch(html, /alert\(1\)/u)
  assert.match(html, /&lt;script&gt;literal&lt;\/script&gt;/u)
})

test('hides block IDs from text while keeping them addressable', () => {
  const html = renderMarkdownHtml('# Welcome ^welcome\n\nTarget block. ^target\n')
  assert.match(html, /<h1 id="welcome">Welcome<\/h1>/u)
  assert.match(html, /<p id="target">Target block\.<\/p>/u)
  assert.doesNotMatch(html, /\^welcome|\^target/u)
})

test('renders ordinary blockquotes and wikilink aliases as semantic content', () => {
  const html = renderMarkdownHtml('> First line\n>\n> second line\n\nOpen [[Welcome]] and [[Study Guide|start here]].\n')
  assert.match(html, /<blockquote><p>First line<\/p><p>second line<\/p><\/blockquote>/u)
  assert.match(html, /data-target="Welcome" href="#">Welcome<\/a>/u)
  assert.match(html, /data-target="Study Guide" href="#">start here<\/a>/u)
  assert.doesNotMatch(html, /&gt; First line|\[\[Study Guide/u)
})

test('groups contiguous and nested list items into semantic lists', () => {
  const html = renderMarkdownHtml([
    '1. First',
    '2. Second',
    '   - Nested one',
    '   - Nested two',
    '- [x] Done',
    '- [ ] Next',
  ].join('\n'))

  assert.match(html, /<ol><li>First<\/li><li>Second<ul><li>Nested one<\/li><li>Nested two<\/li><\/ul><\/li><\/ol>/u)
  assert.match(html, /<ul class="task-list"><li><input[^>]+checked[^>]*> Done<\/li><li><input[^>]+data-task-index="1"[^>]*> Next<\/li><\/ul>/u)
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
    externalEmbedMode: 'viewer',
    markdown: '# Export\n[External](https://example.com)\n![Remote](https://example.com/image.png)\n',
    title: 'A < B',
  })
  assert.match(document, /<title>A &lt; B<\/title>/u)
  assert.doesNotMatch(document, /<meta|data-external-url|\s(?:href|src)=|https?:\/\//u)
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
  assert.doesNotMatch(document, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u)
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

test('escapes malformed raw nesting and rejects protocol-relative image resources', () => {
  const html = renderMarkdownHtml('<div>\n<table><tr><td>Cell</td></tr></table>\n</div>\n\n<div><span>Broken</div></span>\n\n![Remote](//evil.example/image.png)')
  assert.match(html, /<div>\n<table>/u)
  assert.match(html, /&lt;div&gt;&lt;span&gt;Broken&lt;\/div&gt;&lt;\/span&gt;/u)
  assert.doesNotMatch(html, /src=|\\\\n/u)
  assert.match(html, /!\[Remote\]\(\/\/evil\.example\/image\.png\)/u)
})

test('viewer mode emits inert buttons for the isolated Web Viewer handoff', () => {
  const html = renderMarkdownHtml('![Video](https://www.youtube.com/watch?v=NnTvZWp5Q7o)\n![Page](https://example.com/article)', { externalEmbedMode: 'viewer' })
  assert.match(html, /data-external-embed-kind="youtube"/u)
  assert.match(html, /data-external-url="https:\/\/www\.youtube-nocookie\.com\/embed\/NnTvZWp5Q7o"/u)
  assert.match(html, /data-external-embed-kind="image"/u)
  assert.doesNotMatch(html, /<img[^>]+src="https:\/\//u)
})
