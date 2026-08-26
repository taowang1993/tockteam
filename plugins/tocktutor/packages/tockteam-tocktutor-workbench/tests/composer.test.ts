import assert from 'node:assert/strict'
import test from 'node:test'
import {
  convertMarkdownFormats,
  extractSelectionToNote,
  mergeNotes,
} from '../dist/composer.js'

test('extracts selection with link/embed/none leftovers and optional template wrapping', () => {
  const source = '# Lesson\nKeep this. Selected text. End.\n'
  const start = source.indexOf('Selected')
  const end = start + 'Selected text.'.length
  assert.deepEqual(extractSelectionToNote({
    destinationPath: 'Notes/Extract.md',
    destinationTitle: 'Extract',
    end,
    leftover: 'link',
    source,
    start,
    template: '# {{newTitle}}\n\n{{content}}\n\nFrom {{fromTitle}}',
    sourceTitle: 'Lesson',
  }), {
    destinationContent: '# Extract\n\nSelected text.\n\nFrom Lesson',
    sourceContent: '# Lesson\nKeep this. [[Notes/Extract.md|Selected text.]] End.\n',
  })
})

test('merges notes with exact prepend/append placement and leftover embed', () => {
  assert.deepEqual(mergeNotes({
    destination: '# Destination\nBody  \n',
    destinationPath: 'Destination.md',
    placement: 'append',
    source: '# Source\nMove me.\n',
    sourcePath: 'Source.md',
    leftover: 'embed',
  }), {
    destinationContent: '# Destination\nBody  \n\n# Source\nMove me.\n',
    sourceContent: '![[Destination.md]]\n',
  })
})

test('converts bounded Roam/Bear, deprecated properties, and Zettelkasten links outside fences', () => {
  const source = [
    '---',
    'alias: Lesson',
    'tag: class',
    'cssclass: wide',
    '---',
    '- TODO Review #lesson',
    '^^highlight^^',
    'See [[202608261504]].',
    '```md',
    '- TODO literal #literal [[202608261505]]',
    '```',
    '',
  ].join('\n')
  const converted = convertMarkdownFormats(source, {
    deprecatedProperties: true,
    roamBear: true,
    zettelkasten: new Map([['202608261504', 'Notes/202608261504 Lesson.md']]),
  })
  assert.match(converted, /aliases: Lesson/u)
  assert.match(converted, /tags: class/u)
  assert.match(converted, /cssclasses: wide/u)
  assert.match(converted, /- \[ \] Review #lesson/u)
  assert.match(converted, /==highlight==/u)
  assert.match(converted, /\[\[Notes\/202608261504 Lesson\.md\|202608261504\]\]/u)
  assert.match(converted, /- TODO literal #literal \[\[202608261505\]\]/u)
})
