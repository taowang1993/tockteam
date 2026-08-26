import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyEditorCommand,
  applyEditorCommandToSelections,
  applyTableCommand,
  internalLinkDropMarkdown,
  pagePreviewTargetAtOffset,
  resolvePlatformEditorCommand,
  resolveSlashCommand,
} from '../dist/editor-commands.js'

test('applies bounded formatting, insertion, and line commands at exact source ranges', () => {
  assert.deepEqual(applyEditorCommand('Hello world\n', 'bold', 6, 11), {
    selectionEnd: 13,
    selectionStart: 8,
    source: 'Hello **world**\n',
  })
  assert.equal(applyEditorCommand('Before\r\nAfter\r\n', 'delete-line', 9, 9).source, 'Before\r\n')
  assert.match(applyEditorCommand('# Note\n', 'insert-table', 7, 7).source, /\| Column 1 \| Column 2 \|/u)
  assert.equal(applyEditorCommand('word', 'callout-tip', 0, 4).source, '> [!tip]\n> word\n')
})

test('applies multi-cursor formatting as one source-preserving transaction', () => {
  const result = applyEditorCommandToSelections('one two\nthree four', 'bold', [
    { from: 0, to: 3 },
    { from: 14, to: 18 },
  ])
  assert.equal(result.source, '**one** two\nthree **four**')
  assert.deepEqual(result.ranges, [{ from: 2, to: 5 }, { from: 20, to: 24 }])
  assert.equal(applyEditorCommandToSelections('one\ntwo\nthree\n', 'delete-line', [
    { from: 1, to: 1 },
    { from: 9, to: 9 },
  ]).source, 'two\n')
})

test('edits complete Markdown table rows and columns without losing alignment', () => {
  const table = '| Name | Score |\n| :--- | ---: |\n| Ada | 2 |\n| Bob | 10 |\n'
  assert.equal(applyTableCommand(table, { column: 1, kind: 'sort-ascending' }), '| Name | Score |\n| :--- | ---: |\n| Ada | 2 |\n| Bob | 10 |\n')
  assert.equal(applyTableCommand(table, { column: 1, kind: 'sort-descending' }), '| Name | Score |\n| :--- | ---: |\n| Bob | 10 |\n| Ada | 2 |\n')
  assert.equal(applyTableCommand(table, { column: 0, kind: 'align-center' }), '| Name | Score |\n| :---: | ---: |\n| Ada | 2 |\n| Bob | 10 |\n')
  assert.equal(applyTableCommand(table, { column: 1, kind: 'delete-column' }), '| Name |\n| :--- |\n| Ada |\n| Bob |\n')
  assert.equal(applyTableCommand(table, { kind: 'add-row', row: 0 }), '| Name | Score |\n| :--- | ---: |\n|  |  |\n| Ada | 2 |\n| Bob | 10 |\n')
})

test('resolves slash, hotkey, internal-link drop, and Page Preview targets safely', () => {
  assert.equal(resolveSlashCommand('/table'), 'insert-table')
  assert.equal(resolveSlashCommand('/unknown'), null)
  assert.equal(resolvePlatformEditorCommand({ altKey: false, ctrlKey: true, key: 'b', metaKey: false, shiftKey: false }, false), 'bold')
  assert.equal(resolvePlatformEditorCommand({ altKey: false, ctrlKey: false, key: 'b', metaKey: true, shiftKey: false }, true), 'bold')
  assert.equal(internalLinkDropMarkdown('Notes/Target.md', 'Target'), '[[Notes/Target.md|Target]]')
  assert.equal(internalLinkDropMarkdown('../escape.md', 'Escape'), null)
  const source = 'Open [[Target#Part]] here. `[[Literal]]`\n```md\n[[Fence]]\n```\n'
  assert.deepEqual(pagePreviewTargetAtOffset(source, source.indexOf('Target') + 2), { fragment: 'Part', path: 'Target' })
  assert.equal(pagePreviewTargetAtOffset(source, source.indexOf('Literal') + 2), null)
  assert.equal(pagePreviewTargetAtOffset(source, source.indexOf('Fence') + 2), null)
})
