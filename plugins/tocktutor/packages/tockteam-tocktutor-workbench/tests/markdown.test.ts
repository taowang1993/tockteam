import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  editorStatusLabel,
  nextEditorMode,
  projectReading,
  resolveEditorShortcut,
  toggleMarkdownTask,
  visualMotion,
} from '../src/markdown.ts'

test('keeps Markdown source exact while projecting bounded Reading blocks', () => {
  const source = '# Title\r\n\r\n- [ ] ship it\r\n\r\n<script>alert(1)</script>\r\n\r\n```md\n- [ ] literal\n```\r\n'
  const projection = projectReading(source)
  assert.equal(projection.status, 'ready')
  if (projection.status !== 'ready') return
  assert.equal(projection.source, source)
  assert.equal(projection.blocks.some(block => block.kind === 'heading'), true)
  assert.equal(projection.blocks.filter(block => block.kind === 'task').length, 1)
  assert.equal(projection.warnings.some(warning => /inert/i.test(warning)), true)
})

test('toggles only the indexed visible task and preserves line endings/comments/fences', () => {
  const source = '- [ ] first\r\n%%\r\n- [ ] hidden\r\n%%\r\n```md\n- [ ] fenced\n```\r\n- [x] second'
  assert.equal(toggleMarkdownTask(source, 1), '- [ ] first\r\n%%\r\n- [ ] hidden\r\n%%\r\n```md\n- [ ] fenced\n```\r\n- [ ] second')
  assert.equal(toggleMarkdownTask(source, 0), '- [x] first\r\n%%\r\n- [ ] hidden\r\n%%\r\n```md\n- [ ] fenced\n```\r\n- [x] second')
  assert.equal(toggleMarkdownTask(source, 9), source)
})

test('resolves bounded editor shortcuts, modes, status labels, and reduced motion', () => {
  assert.equal(resolveEditorShortcut({ key: 's', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, true), 'save')
  assert.equal(resolveEditorShortcut({ key: 'k', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true }, false), 'delete-line')
  assert.equal(resolveEditorShortcut({ key: 'Escape', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }, false), 'simplify-selection')
  assert.equal(resolveEditorShortcut({ key: 's', metaKey: true, ctrlKey: true, altKey: false, shiftKey: false }, true), null)
  assert.equal(nextEditorMode('reading', 'source'), 'source')
  assert.equal(nextEditorMode('source', 'source'), 'wysiwyg')
  assert.equal(editorStatusLabel('save-failed'), 'Save Failed')
  assert.deepEqual(visualMotion(true), { reduced: true, transitionMs: 0, animate: false })
})

test('keeps the browser-safe Markdown module free of Host authority', async () => {
  const source = await readFile(new URL('../src/markdown.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /node:|electron|window\.electronAPI|(?:^|[/'" ])fs(?:['"/])|child_process/u)
})
