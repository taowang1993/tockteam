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
  assert.deepEqual(model.rows.map(row => row.path), ['Alpha.md'])
  assert.deepEqual(model.summaries.map(summary => summary.value), [2, 2])
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

  assert.equal(executableBaseViewTsv(model), "file.name\tStatus\tformula.doubled\nAlpha\t'=ready\t4")
  assert.equal(executableBaseViewCsv(model), "file.name,Status,formula.doubled\r\nAlpha,'=ready,4")
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
