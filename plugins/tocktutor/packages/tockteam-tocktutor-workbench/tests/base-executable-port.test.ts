import assert from 'node:assert/strict'
import test from 'node:test'

import { parseExecutableBase } from '../src/base-parser.ts'
import { queryExecutableBaseView, type BaseHydratedFile } from '../src/base-query.ts'
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
  assert.deepEqual(query.summaries.map(summary => summary.value), [6])

  const model = createBaseViewModel(parsed, files, 'Ranked', 'alpha')
  assert.equal(model.status, 'ready')
  if (model.status !== 'ready') return
  assert.equal(model.kind, 'table')
  assert.deepEqual(model.rows.map(row => row.path), ['Alpha.md'])
  assert.deepEqual(model.summaries.map(summary => summary.value), [2])
})
