import assert from 'node:assert/strict'
import test from 'node:test'
import { appendBaseView, setBaseViewField } from '../dist/base-authoring.js'
import { parseExecutableBase } from '../dist/base-parser.js'

const original = 'formulas:\n  doubled: note.score * 2\nviews:\n  - type: table\n    name: Notes\n    # Keep this comment\n    sort:\n      - property: file.name\n        direction: ASC\n  - type: list\n    name: Other\n    order: [file.name]\nproperties:\n  note.status:\n    displayName: Status\n'

test('sort and filter changes preserve unrelated views, source comments and unknown sections', () => {
  const sorted = setBaseViewField(original, 'Notes', 'sort', ['file.name desc'])
  assert.ok(sorted)
  assert.match(sorted, /# Keep this comment/u)
  assert.match(sorted, /  - type: list\n    name: Other\n    order: \[file.name\]/u)
  assert.match(sorted, /properties:\n  note.status:\n    displayName: Status/u)
  const filtered = setBaseViewField(sorted, 'Notes', 'filters', 'note.status == "ready"')
  assert.ok(filtered)
  const parsed = parseExecutableBase(filtered)
  assert.equal(parsed.status, 'ready')
  if (parsed.status === 'ready') {
    assert.deepEqual(parsed.views[0]?.sort, ['file.name desc'])
    assert.deepEqual(parsed.views[0]?.filters, [{ kind: 'statement', statement: 'note.status == "ready"' }])
  }
  const clear = setBaseViewField(filtered, 'Notes', 'filters', '')
  assert.ok(clear)
  const cleared = parseExecutableBase(clear)
  assert.equal(cleared.status, 'ready')
  if (cleared.status === 'ready') assert.deepEqual(cleared.views[0]?.filters, [])
})

test('renames an inline view name without losing the default layout', () => {
  const original = 'views:\n  - name: Old\n    # Keep\n'
  const renamed = setBaseViewField(original, 'Old', 'name', 'New Name')
  assert.ok(renamed)
  assert.match(renamed, /# Keep/u)
  const parsed = parseExecutableBase(renamed)
  assert.equal(parsed.status, 'ready')
  if (parsed.status === 'ready') assert.equal(parsed.views[0]?.name, 'New Name')
})

test('result limits can be added and cleared without changing other view fields', () => {
  const limited = setBaseViewField(original, 'Notes', 'limit', '25')
  assert.ok(limited)
  const parsed = parseExecutableBase(limited)
  assert.equal(parsed.status, 'ready')
  if (parsed.status === 'ready') assert.equal(parsed.views[0]?.limit, 25)
  const cleared = setBaseViewField(limited, 'Notes', 'limit', '')
  assert.ok(cleared)
  assert.match(cleared, /# Keep this comment/u)
  const final = parseExecutableBase(cleared)
  if (final.status === 'ready') assert.equal(final.views[0]?.limit, null)
})

test('view creation rejects duplicate names and preserves remaining Base source', () => {
  const added = appendBaseView(original, 'cards', 'Gallery')
  assert.ok(added)
  assert.match(added, /properties:\n  note.status:\n    displayName: Status/u)
  assert.equal(appendBaseView(added, 'list', 'GALLERY'), null)
  const parsed = parseExecutableBase(added)
  assert.equal(parsed.status, 'ready')
  if (parsed.status === 'ready') assert.deepEqual(parsed.views.map(view => view.name), ['Notes', 'Other', 'Gallery'])
})
