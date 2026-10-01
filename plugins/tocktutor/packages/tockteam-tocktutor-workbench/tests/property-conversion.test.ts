import assert from 'node:assert/strict'
import test from 'node:test'
import { preparePropertyTypeChange } from '../src/properties.ts'

test('previews all supported property-type conversions without dropping comments, body or other YAML', () => {
  const source = '---\r\n# Keep\r\nstatus: "42" # Keep this comment\r\nnested:\r\n  untouched: yes\r\n---\r\n# Body\r\n'
  const number = preparePropertyTypeChange(source, 'status', 'number')
  assert.equal(number.ok, true)
  if (!number.ok) return
  assert.equal(number.value, 42)
  assert.equal(number.lossy, false)
  assert.match(number.nextSource, /status: 42 # Keep this comment\r\n/u)
  assert.ok(number.nextSource.endsWith('nested:\r\n  untouched: yes\r\n---\r\n# Body\r\n'))
  for (const [raw, target, value] of [['true', 'text', 'true'], ['"false"', 'checkbox', false], ['17', 'list', ['17']], ['[one]', 'text', 'one'], ['2026-10-01', 'datetime', '2026-10-01T00:00']] as const) {
    const result = preparePropertyTypeChange(`---\nfield: ${raw}\n---\n`, 'field', target)
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(result.value, value)
  }
})

test('marks lossy conversions and refuses invalid, structured, ambiguous and out-of-range values', () => {
  for (const [raw, target] of [['[one, two]', 'text'], ['2026-10-01T12:30', 'date']] as const) {
    const result = preparePropertyTypeChange(`---\nfield: ${raw}\n---\n`, 'field', target)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.lossy, true)
  }
  for (const [raw, target] of [['"not a number"', 'number'], ['"9007199254740993"', 'number'], ['"0.10000000000000001"', 'number'], ['[one, two]', 'checkbox'], ['2026-02-30', 'date'], ['2026-10-01T12:30:59Z', 'datetime'], ['{nested: true}', 'text']] as const) {
    assert.equal(preparePropertyTypeChange(`---\nfield: ${raw}\n---\n`, 'field', target).ok, false)
  }
  assert.equal(preparePropertyTypeChange('---\nfield: one\nField: two\n---\n', 'field', 'text').ok, false)
})
