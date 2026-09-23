import assert from 'node:assert/strict'
import test from 'node:test'
import {
  convertMarkdownFormats,
  extractSelectionToNote,
  mergeNotes,
  mergePropertyConflicts,
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

test('merging accepts the long Markdown extension supported by the vault planner', () => {
  assert.deepEqual(mergeNotes({ destination: 'Destination', destinationPath: 'Destination.markdown',
    source: 'Source', sourcePath: 'Source.markdown', placement: 'append', leftover: 'link' }), {
    destinationContent: 'Destination\n\nSource', sourceContent: '[[Destination.markdown|Destination]]\n',
  })
})

test('merging preserves indentation, trailing spaces, and each body’s authored line endings', () => {
  const destination = '# Destination\r\nKeep this.  \r\n'
  const source = '    source code\n\nKeep this too.  \n'
  const input = { destination, destinationPath: 'Destination.md', source, sourcePath: 'Source.md', leftover: 'embed' as const }
  assert.equal(mergeNotes({ ...input, placement: 'append' }).destinationContent, `${destination}\r\n${source}`)
  assert.equal(mergeNotes({ ...input, placement: 'prepend' }).destinationContent, `${source}\r\n${destination}`)
})

test('merge preview refuses unresolved properties rather than appending a second header', () => {
  const input = {
    destination: '---\ntitle: Destination\n---\n\nBody.\n', destinationPath: 'Destination.md',
    source: '---\ntitle: Source\n---\n\nSource body.\n', sourcePath: 'Source.md',
    placement: 'append' as const, leftover: 'none' as const,
  }
  assert.throws(() => mergeNotes(input), /propert/iu)
})

test('merging combines properties at the top and requires an explicit choice for conflicts', () => {
  const result = mergeNotes({
    destination: '---\r\ntitle: Destination\r\ntags: [class]\r\n---\r\n\r\n# Destination\r\n', destinationPath: 'Destination.md',
    source: '---\ntitle: Source\nlevel: 2\n---\n\n    source code\n', sourcePath: 'Source.md',
    placement: 'prepend', leftover: 'none', propertyChoices: { title: 'source' },
  })
  assert.equal(result.destinationContent, '---\r\ntitle: Source\r\ntags: [class]\r\nlevel: 2\r\n---\r\n\n    source code\n\r\n# Destination\r\n')
})

test('merge property review exposes exact conflicting values and preserves structured values and comments', () => {
  const source = '---\ntitle: Source\n# Keep this comment.\nsettings:\n  enabled: true\n  labels: [one, two]\n---\nSource body.\n'
  const destination = '---\ntitle: Destination\n---\nDestination body.\n'
  assert.deepEqual(mergePropertyConflicts(source, destination), [{ key: 'title', source: 'title: Source\n', destination: 'title: Destination\n' }])
  const merged = mergeNotes({ source, destination, sourcePath: 'Source.md', destinationPath: 'Destination.md', placement: 'append', leftover: 'none', propertyChoices: { title: 'destination' } })
  assert.match(merged.destinationContent, /title: Destination\n# Keep this comment\.\nsettings:\n  enabled: true\n  labels: \[one, two\]/u)
  assert.ok(merged.destinationContent.endsWith('Destination body.\n\nSource body.\n'))
})

test('merge review does not silently discard conflicting comments or significant block-scalar newlines', () => {
  assert.equal(mergePropertyConflicts('---\ntitle: Same # source comment\n---\n', '---\ntitle: Same # destination comment\n---\n').length, 1)
  assert.equal(mergePropertyConflicts('---\ntext: |+\n  Text\n\n---\n', '---\ntext: |+\n  Text\n---\n').length, 1)
})

test('merge preserves large integer values and exposes distinct integer conflicts', () => {
  const source = '---\nid: 9007199254740993\n---\nS'
  const destination = '---\nb: 2\n---\nD'
  const result = mergeNotes({ source, destination, sourcePath: 'Source.md', destinationPath: 'Destination.md', placement: 'append', leftover: 'none' })
  assert.match(result.destinationContent, /id: 9007199254740993\n/u)
  assert.deepEqual(mergePropertyConflicts(source, '---\nid: 9007199254740992\n---\nD'), [{ key: 'id', source: 'id: 9007199254740993\n', destination: 'id: 9007199254740992\n' }])
})

test('merge refuses numeric scalars that cannot round-trip without changing their authored value', () => {
  for (const value of ['0.10000000000000001', '1e999', '1e-999']) {
    const source = `---\nvalue: ${value}\n---\nS`
    assert.throws(() => mergePropertyConflicts(source, ''), /numeric|precision|round.trip/iu, value)
    assert.throws(() => mergeNotes({ source, destination: '---\nb: 2\n---\nD', sourcePath: 'Source.md', destinationPath: 'Destination.md', placement: 'append', leftover: 'none' }), /numeric|precision|round.trip/iu, value)
  }
  for (const value of ['3.25', '-0.0', '1.0', '1e+3']) {
    const source = `---\nvalue: ${value} # Keep the number.\n---\nS`
    const result = mergeNotes({ source, destination: '---\nb: 2\n---\nD', sourcePath: 'Source.md', destinationPath: 'Destination.md', placement: 'append', leftover: 'none' })
    assert.ok(result.destinationContent.includes(`value: ${value} # Keep the number.`), value)
  }
})

test('merge retains both document-level comment preambles and trailing comments', () => {
  const source = '---\n# Source preamble\n\na: 1\n\n# Source ending\n---\nS'
  const destination = '---\n# Destination preamble\n\nb: 2\n\n# Destination ending\n---\nD'
  const result = mergeNotes({ source, destination, sourcePath: 'Source.md', destinationPath: 'Destination.md', placement: 'append', leftover: 'none' })
  for (const comment of ['Source preamble', 'Source ending', 'Destination preamble', 'Destination ending']) assert.ok(result.destinationContent.includes(`# ${comment}`), comment)
  assert.deepEqual(mergePropertyConflicts(result.destinationContent, ''), [])
})

test('merge enforces property-count, YAML-length, and node budgets on the combined output', () => {
  const mapping = (prefix: string) => `---\n${Array.from({ length: 600 }, (_, i) => `${prefix}${i}: ${i}`).join('\n')}\n---\nBody`
  const largeScalar = (key: string) => `---\n${key}: ${'x'.repeat(40_000)}\n---\nBody`
  const manyNodes = (key: string) => `---\n${key}: [${Array.from({ length: 2_100 }, () => 'value').join(', ')}]\n---\nBody`
  for (const [source, destination] of [[mapping('s'), mapping('d')], [largeScalar('s'), largeScalar('d')], [manyNodes('s'), manyNodes('d')]]) {
    assert.deepEqual(mergePropertyConflicts(source!, ''), [])
    assert.deepEqual(mergePropertyConflicts(destination!, ''), [])
    assert.throws(() => mergeNotes({ source: source!, destination: destination!, sourcePath: 'Source.md', destinationPath: 'Destination.md', placement: 'append', leftover: 'none' }), /propert/iu)
  }
})

test('merging a header ending at EOF inserts a boundary without dropping either body', () => {
  const merged = mergeNotes({ source: 'Source body.', destination: '---\ntitle: Destination\n---', sourcePath: 'Source.md', destinationPath: 'Destination.md', placement: 'append', leftover: 'none' })
  assert.equal(merged.destinationContent, '---\ntitle: Destination\n---\nSource body.')
})

test('merge property handling refuses malformed, duplicate, or alias-bearing YAML without changing input', () => {
  const input = { destination: '---\ntitle: Destination\n---\nBody', destinationPath: 'Destination.md', sourcePath: 'Source.md', placement: 'append' as const, leftover: 'none' as const }
  for (const source of ['---\ntitle: One\ntitle: Two\n---\nBody', '---\ntitle: [\n---\nBody', '---\ntitle: &name Value\nother: *name\n---\nBody', '---\ntitle: Unclosed\nBody']) {
    assert.throws(() => mergeNotes({ ...input, source }), /propert/iu)
  }
})

test('merge leftovers identify the destination relative to the original note and encode wiki delimiters', () => {
  const merged = mergeNotes({ source: 'Source', destination: 'Destination', sourcePath: 'Notes/Sub/Source.md', destinationPath: 'Notes/中文 #Target|].md', placement: 'append', leftover: 'embed' })
  assert.equal(merged.sourceContent, '![[../%E4%B8%AD%E6%96%87%20%23Target%7C%5D.md]]\n')
})

test('merge review rejects oversized input/output and physical-name aliases conservatively', () => {
  const input = { destination: 'Destination', destinationPath: 'Destination.md', source: 'Source', sourcePath: 'Source.md', placement: 'append' as const, leftover: 'none' as const }
  assert.throws(() => mergePropertyConflicts('x'.repeat(2_000_001), ''), /large/iu)
  assert.throws(() => mergeNotes({ ...input, source: 'x'.repeat(1_000_000), destination: 'y'.repeat(1_000_000) }), /large/iu)
  assert.throws(() => mergeNotes({ ...input, sourcePath: 'Notes/café.md', destinationPath: 'Notes/cafe\u0301.md' }))
})

test('merge joins preserve empty bodies and existing separators without stripping authored whitespace', () => {
  const input = { destinationPath: 'Destination.md', sourcePath: 'Source.md', placement: 'append' as const, leftover: 'none' as const }
  for (const [destination, source, expected] of [
    ['', '    code', '    code'], ['Destination', '', 'Destination'],
    ['Left\r\n\r\n', '    Right', 'Left\r\n\r\n    Right'],
    ['Left', '\n\n    Right', 'Left\n\n    Right'],
    ['---\n---\nLeft', '---\n---\nRight', '---\n---\nLeft\n\nRight'],
  ]) assert.equal(mergeNotes({ ...input, destination: destination!, source: source! }).destinationContent, expected)
})

test('merging rejects non-Markdown, case-alias, and invalid option inputs', () => {
  const input = { destination: 'Destination', destinationPath: 'Destination.md', source: 'Source', sourcePath: 'Source.md', placement: 'append' as const, leftover: 'none' as const }
  assert.throws(() => mergeNotes({ ...input, sourcePath: 'Source.canvas' }))
  assert.throws(() => mergeNotes({ ...input, destinationPath: 'source.MD' }))
  assert.throws(() => mergeNotes({ ...input, placement: 'sideways' as 'append' }))
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
