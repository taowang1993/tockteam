import assert from 'node:assert/strict'
import test from 'node:test'

import { createExecutableBaseFrontmatterEdit } from '../src/base-edit.ts'
import { parseExecutableBase } from '../src/base-parser.ts'
import { queryExecutableBaseView, type BaseHydratedFile } from '../src/base-query.ts'
import {
  executableBaseCellRangeTsv,
  executableBaseCsvFilename,
  executableBaseViewCsv,
  executableBaseViewTsv,
} from '../src/base-spreadsheet.ts'
import { createBaseViewModel } from '../src/base-view-model.ts'

const revision = (character: string): string => `file:${character.repeat(64)}`

const definitionSource = `formulas:
  doubled: 'note.score * 2'
properties:
  note.status:
    displayName: Status
filters:
  and:
    - 'note.active == true'
views:
  - type: table
    name: Ranked
    order:
      - file.name
      - note.status
      - formula.doubled
    sort:
      - note.score desc
    limit: 2
    summaries:
      - sum(note.score)
      note.score: Average
  - type: list
    name: List
    order: [file.name, note.status]
  - type: cards
    name: Cards
    order: [file.name, note.status]
  - type: map
    name: Places
    coordinates: note.location
    order: [file.name, note.location]
`

const files: BaseHydratedFile[] = [
  {
    path: 'Alpha.md',
    revision: revision('a'),
    source: `---
status: '=ready'
score: 2
active: true
location: '51.5, -0.1'
unknown: keep
---
# Alpha
`,
  },
  {
    path: 'Beta.md',
    revision: revision('b'),
    source: `---
status: done
score: 4
active: true
location: '40.7, -74'
---
# Beta
`,
  },
  {
    path: 'Gamma.md',
    revision: revision('c'),
    source: `---
status: hidden
score: 9
active: false
location: '35.7, 139.7'
---
# Gamma
`,
  },
]

test('parses and executes the bounded filter, sort, limit, formula, summary, and search pipeline', () => {
  const parsed = parseExecutableBase(definitionSource)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return

  assert.deepEqual(parsed.views.map(view => [view.type, view.name]), [
    ['table', 'Ranked'],
    ['list', 'List'],
    ['cards', 'Cards'],
    ['map', 'Places'],
  ])

  const query = queryExecutableBaseView(parsed, parsed.views[0]!, files)
  assert.deepEqual(query.unsupported, [])
  assert.deepEqual(query.rows.map(row => row.file.path), ['Beta.md', 'Alpha.md'])
  assert.equal(query.rows[0]?.values['formula.doubled'], 8)
  assert.deepEqual(query.summaries.map(summary => summary.value), [6, 3])

  const model = createBaseViewModel(parsed, files, 'Ranked', 'alpha')
  assert.equal(model.status, 'ready')
  if (model.status !== 'ready') return
  assert.equal(model.kind, 'table')
  assert.deepEqual(model.columns.map(column => [column.key, column.label]), [
    ['file.name', 'File Name'], ['note.status', 'Status'], ['formula.doubled', 'formula.doubled'],
  ])
  assert.equal(model.rows[0]?.cells[0]?.label, 'File Name')
  assert.deepEqual(model.rows.map(row => row.path), ['Alpha.md'])
  assert.deepEqual(model.summaries.map(summary => summary.value), [2, 2])
})

test('search keeps cross-file formula lookup while summarizing only visible rows', () => {
  const parsed = parseExecutableBase(`formulas:\n  related: 'file("B.md").size'\nviews:\n  - type: table\n    name: Notes\n    order: [file.name, formula.related]\n    summaries: [sum(formula.related)]\n`)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  const inputs = [
    { path: 'A.md', revision: revision('a'), source: '# A' },
    { path: 'B.md', revision: revision('b'), source: '# B' },
  ]
  const model = createBaseViewModel(parsed, inputs, 'Notes', 'A')
  assert.equal(model.status, 'ready')
  if (model.status !== 'ready') return
  assert.deepEqual(model.rows.map(row => row.path), ['A.md'])
  assert.deepEqual(model.unsupported, [])
  assert.deepEqual(model.summaries.map(summary => summary.value), [3])
})

test('hydrates .markdown files and exposes their basename to Base formulas', () => {
  const parsed = parseExecutableBase(`views:\n  - type: table\n    name: Notes\n    order: [file.name, note.status]\n`)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  const file: BaseHydratedFile = {
    path: 'Lessons/Alpha.markdown',
    revision: revision('d'),
    source: '---\nstatus: ready\n---\n# Alpha\n',
  }
  const query = queryExecutableBaseView(parsed, parsed.views[0]!, [file])
  assert.deepEqual(query.unsupported, [])
  assert.equal(query.rows[0]?.file.path, 'Lessons/Alpha.markdown')
  assert.equal(query.rows[0]?.values['file.name'], 'Alpha')
  assert.equal(query.rows[0]?.values['note.status'], 'ready')
})

test('shows vault notes with ordinary punctuation in a Base without admitting unsafe paths', () => {
  const parsed = parseExecutableBase('views:\n  - type: table\n    name: Table\n')
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  const path = '笔记/周日荐书：《AI众神时代》，看一看？.md'
  const file = { path, revision: revision('d'), source: '# Book\n' }
  const query = queryExecutableBaseView(parsed, parsed.views[0]!, [file])
  assert.deepEqual(query.unsupported, [])
  assert.deepEqual(query.rows.map(row => row.file.path), [path])
  for (const unsafe of ['../note.md', '笔记/../note.md', '笔记\\note.md', '笔记/line\nfeed.md']) {
    assert.deepEqual(queryExecutableBaseView(parsed, parsed.views[0]!, [{ ...file, path: unsafe }]).unsupported.map(entry => entry.kind), ['input'])
  }
  assert.deepEqual(queryExecutableBaseView(parsed, parsed.views[0]!, [file, file]).unsupported.map(entry => entry.kind), ['input'])
})

test('preserves quotes inside Obsidian Base filter statements', () => {
  const parsed = parseExecutableBase(`filters:\n  and:\n    - 'note.status != "archived"'\nviews:\n  - type: table\n    name: Filtered\n    order: [file.name]\n`)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  assert.deepEqual(parsed.filters, [{ kind: 'and', children: [{ kind: 'statement', statement: 'note.status != "archived"' }] }])
  const query = queryExecutableBaseView(parsed, parsed.views[0]!, files)
  assert.deepEqual(query.unsupported, [])
  assert.deepEqual(query.rows.map(row => row.file.path), ['Alpha.md', 'Beta.md', 'Gamma.md'])
})

test('preserves literal quotes and YAML escapes in Base filters', () => {
  const parsed = parseExecutableBase(`filters:\n  and:\n    - '"a" == "a"'\n    - 'note.title == "O''Brien"'\nviews:\n  - type: table\n    name: Filtered\n`)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  assert.deepEqual(parsed.filters, [{ kind: 'and', children: [
    { kind: 'statement', statement: '"a" == "a"' },
    { kind: 'statement', statement: 'note.title == "O\'Brien"' },
  ] }])
  const file = { path: 'A.md', revision: revision('a'), source: '---\ntitle: O\'Brien\n---\n# A\n' }
  const query = queryExecutableBaseView(parsed, parsed.views[0]!, [file])
  assert.deepEqual(query.unsupported, [])
  assert.deepEqual(query.rows.map(row => row.file.path), ['A.md'])
})

test('accepts Obsidian sort property entries and applies their direction', () => {
  const parsed = parseExecutableBase(`views:\n  - type: table\n    name: Ranked\n    order: [file.name, note.score]\n    sort:\n      - property: note.score\n        direction: DESC\n`)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  assert.deepEqual(parsed.views[0]?.sort, ['note.score desc'])
  const query = queryExecutableBaseView(parsed, parsed.views[0]!, files)
  assert.deepEqual(query.unsupported, [])
  assert.deepEqual(query.rows.map(row => row.file.path), ['Gamma.md', 'Beta.md', 'Alpha.md'])
})

test('projects table, list, cards, and bounded map-label models from the same row values', () => {
  const parsed = parseExecutableBase(definitionSource)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return

  const expectedKinds = ['table', 'list', 'cards', 'map-label']
  for (const [index, expectedKind] of expectedKinds.entries()) {
    const model = createBaseViewModel(parsed, files, parsed.views[index]?.name)
    assert.equal(model.status, 'ready')
    if (model.status !== 'ready') continue
    assert.equal(model.kind, expectedKind)
    assert.deepEqual(model.rows.map(row => row.path), index === 0 ? ['Beta.md', 'Alpha.md'] : ['Alpha.md', 'Beta.md'])
  }

  const map = createBaseViewModel(parsed, files, 'Places')
  assert.equal(map.status, 'ready')
  if (map.status !== 'ready') {
    assert.fail('Map model should be ready')
  } else {
    assert.deepEqual(map.rows[0]?.coordinates, { latitude: 51.5, longitude: -0.1 })
    assert.equal(map.rows[0]?.cells[0]?.text, 'Alpha')
  }
})

test('serializes exactly visible rows as spreadsheet-safe TSV, CSV, and cell ranges', () => {
  const parsed = parseExecutableBase(definitionSource)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  const model = createBaseViewModel(parsed, files, 'Ranked', 'alpha')

  assert.equal(executableBaseViewTsv(model), "File Name\tStatus\tformula.doubled\nAlpha\t'=ready\t4")
  assert.equal(executableBaseViewCsv(model), "File Name,Status,formula.doubled\r\nAlpha,'=ready,4")
  assert.equal(executableBaseCellRangeTsv([['=formula', 'line\nbreak'], ['plain', '"quote"']]), "'=formula\t\"line\nbreak\"\nplain\t\"\"\"quote\"\"\"")
  assert.equal(executableBaseCsvFilename('../ Unsafe: Ranked *'), 'Unsafe-Ranked.csv')
})

test('stages supported frontmatter edits with exact identity, revision, and rollback source', () => {
  const request = createExecutableBaseFrontmatterEdit(files[0]!, 'note.status', 'review')
  assert.ok(request)
  assert.equal(request.expectedRevision, revision('a'))
  assert.equal(request.previousSource, files[0]?.source)
  assert.equal(request.expectedPropertyIdentity, '["status","text","=ready"]')
  assert.match(request.source, /status: review/u)
  assert.match(request.source, /unknown: keep/u)
  assert.match(request.source, /# Alpha/u)

  assert.equal(createExecutableBaseFrontmatterEdit(files[0]!, 'formula.doubled', '20'), null)
  assert.equal(createExecutableBaseFrontmatterEdit(files[0]!, 'file.name', 'Renamed'), null)
  assert.equal(createExecutableBaseFrontmatterEdit({ ...files[0]!, revision: 'stale' }, 'note.status', 'review'), null)
})

test('keeps quoted Base values as text across consecutive edits', () => {
  for (const value of ['true', 'false', 'null', '~', '42', '-1.25']) {
    const file = { path: 'Note.md', revision: revision('a'), source: `---\nstatus: "${value}"\n---\n# Body\n` }
    const first = createExecutableBaseFrontmatterEdit(file, 'note.status', '100')
    assert.ok(first, value)
    assert.equal(first.previousValue, value)
    assert.equal(first.expectedPropertyIdentity, JSON.stringify(['status', 'text', value]))
    assert.equal(first.source, '---\nstatus: "100"\n---\n# Body\n')
    const second = createExecutableBaseFrontmatterEdit({ ...file, revision: revision('b'), source: first.source }, 'note.status', 'review')
    assert.ok(second)
    assert.equal(second.previousValue, '100')
    assert.equal(second.source, '---\nstatus: review\n---\n# Body\n')
  }
})

test('applies limit before current-view search and never searches hidden properties', () => {
  const parsed = parseExecutableBase(`views:\n  - type: table\n    name: Limited\n    order: [file.name, note.status]\n    sort: [note.score desc]\n    limit: 1\n    summaries: [sum(note.score)]\n`)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return

  const limitedOut = createBaseViewModel(parsed, files, 'Limited', 'alpha')
  assert.equal(limitedOut.status, 'ready')
  if (limitedOut.status === 'ready') assert.equal(limitedOut.rows.length, 0)
  const hiddenOut = createBaseViewModel(parsed, files, 'Limited', '4')
  assert.equal(hiddenOut.status, 'ready')
  if (hiddenOut.status === 'ready') assert.equal(hiddenOut.rows.length, 0)
})

test('fails closed for unsupported filters, ambiguous definitions, and invalid hydration identities', () => {
  const unsupportedFilter = parseExecutableBase(`views:\n  - type: table\n    filters: 'fetch("https://example.com")'\n`)
  assert.equal(unsupportedFilter.status, 'ready')
  if (unsupportedFilter.status === 'ready') {
    const query = queryExecutableBaseView(unsupportedFilter, unsupportedFilter.views[0]!, files)
    assert.equal(query.rows.length, 0)
    assert.deepEqual(query.unsupported.map(entry => entry.kind), ['formula'])
  }

  assert.equal(parseExecutableBase(`views:\n  - name: Same\n  - name: Same\n`).status, 'unsupported')
  const parsed = parseExecutableBase(definitionSource)
  assert.equal(parsed.status, 'ready')
  if (parsed.status === 'ready') {
    const invalid = queryExecutableBaseView(parsed, parsed.views[0]!, [{ ...files[0]!, revision: 'unsafe' }])
    assert.deepEqual(invalid.unsupported.map(entry => entry.kind), ['input'])
    const duplicate = queryExecutableBaseView(parsed, parsed.views[0]!, [{
      ...files[0]!,
      source: '---\nstatus: one\nStatus: two\n---\n',
    }])
    assert.deepEqual(duplicate.unsupported.map(entry => entry.kind), ['input'])
    const excessive = queryExecutableBaseView(parsed, parsed.views[0]!, Array.from({ length: 2_001 }, (_, index) => ({
      path: `Note-${String(index)}.md`,
      revision: revision('d'),
      source: '',
    })))
    assert.deepEqual(excessive.unsupported.map(entry => entry.kind), ['input'])
  }
})

test('fails closed instead of dropping malformed restrictions or ambiguous definitions', () => {
  for (const source of [
    '"filters": false\nviews:\n  - type: table\n',
    'filters:\nfalse\nviews:\n  - type: table\n',
    'views:\n  - type: table\n  filters: false\n',
    'filters: false\nfilters: true\nviews:\n  - type: table\n',
    'views:\n  - type: table\n    limit: 1\n    limit: 2\n',
    'views:\n  - name: First\n    name: Second\n',
    'views:\n  - type: table\n    order: [file.name]\n    order: [note.status]\n',
  ]) assert.equal(parseExecutableBase(source).status, 'unsupported', source)
})

test('rejects duplicate formula definitions rather than widening a Base filter', () => {
  const source = `formulas:
  visible: note.active == true
  visible: true
filters: formula.visible
views:
  - name: Notes
`
  assert.equal(parseExecutableBase(source).status, 'unsupported')
  for (const declaration of ['visible: ""', 'visible:']) {
    assert.equal(parseExecutableBase(`formulas:\n  ${declaration}\n  visible: true\nfilters: formula.visible\nviews:\n  - name: Notes\n`).status, 'unsupported', declaration)
  }
})

test('rejects empty entries in inline Base lists instead of dropping columns or sorts', () => {
  for (const field of ['order', 'sort', 'summaries']) {
    for (const list of ['[,]', '[file.name,, note.status]']) {
      assert.equal(parseExecutableBase(`views:\n  - name: Notes\n    ${field}: ${list}\n`).status, 'unsupported', `${field}: ${list}`)
    }
  }
  assert.equal(parseExecutableBase('views:\n  - name: Notes\n    order: [file.name,]\n').status, 'ready')
})

test('rejects invalid Base number conversions without crashing rows', () => {
  const parsed = parseExecutableBase(`formulas:\n  converted: 'number(file.properties)'\nviews:\n  - type: table\n    name: Table\n    order: [file.name, formula.converted]\n`)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  const model = createBaseViewModel(parsed, [{ path: 'A.md', revision: revision('a'), source: '# A\n' }])
  assert.equal(model.status, 'ready')
  if (model.status === 'ready') assert.deepEqual(model.unsupported, [{ expression: 'formula.converted', kind: 'formula' }])
})

test('reports unsupported object-to-text formulas without crashing the Base', () => {
  const file = { path: 'A.md', revision: revision('a'), source: '# A\n' }
  for (const expression of ['upper(file.properties)', 'lower(file.properties)', 'length(file.properties)', 'concat(file.properties)', 'contains(file.properties, "x")', 'contains(list(file.properties), "x")']) {
    const parsed = parseExecutableBase(`formulas:\n  text: '${expression}'\nviews:\n  - type: table\n    order: [file.name, formula.text]\n`)
    assert.equal(parsed.status, 'ready')
    if (parsed.status !== 'ready') continue
    const model = createBaseViewModel(parsed, [file])
    assert.equal(model.status, 'ready')
    if (model.status === 'ready') assert.deepEqual(model.unsupported, [{ expression: 'formula.text', kind: 'formula' }])
  }
})

test('refuses nonnumeric Base summary objects without throwing', () => {
  const file = { path: 'A.md', revision: revision('a'), source: '# A\n' }
  for (const expression of ['sum(file.properties)', 'range(file.properties)']) {
    const parsed = parseExecutableBase(`views:\n  - type: table\n    name: Table\n    summaries: [${expression}]\n`)
    assert.equal(parsed.status, 'ready')
    if (parsed.status !== 'ready') continue
    const model = createBaseViewModel(parsed, [file])
    assert.equal(model.status, 'ready')
    if (model.status === 'ready') assert.deepEqual(model.unsupported, [{ expression, kind: 'summary' }])
  }
})
