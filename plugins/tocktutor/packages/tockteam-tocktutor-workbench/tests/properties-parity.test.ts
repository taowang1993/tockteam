import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFrontmatterProperties, renameFrontmatterProperty, setFrontmatterProperty } from '../src/properties.ts'

test('ordinary spaced, dotted, numeric-prefixed and Unicode property names round-trip without unrelated changes', () => {
  for (const eol of ['\n', '\r\n', '\r']) {
    const source = ['---', '# Keep the comment', 'custom key: original', 'note.rating: 3', '123field: false', '课程: Lesson', 'nested:', '  child: keep', '---', '# Body', ''].join(eol)
    assert.deepEqual(parseFrontmatterProperties(source).map(({ key }) => key), ['custom key', 'note.rating', '123field', '课程', 'nested'])
    assert.equal(setFrontmatterProperty(source, 'custom key', 'changed'), source.replace('custom key: original', 'custom key: changed'))
    assert.equal(setFrontmatterProperty(source, 'note.rating', 4), source.replace('note.rating: 3', 'note.rating: 4'))
    assert.equal(setFrontmatterProperty(source, '123field', true), source.replace('123field: false', '123field: true'))
    assert.equal(renameFrontmatterProperty(source, 'custom key', 'new name'), source.replace('custom key: original', 'new name: original'))
    const added = setFrontmatterProperty('# Body', 'custom key', 'one')
    assert.deepEqual(parseFrontmatterProperties(added), [{ key: 'custom key', type: 'text', value: 'one' }])
  }
})

test('removing a property preserves unrelated bytes and refuses structured or duplicate values', async () => {
  const { removeFrontmatterProperty } = await import('../src/properties.ts')
  for (const eol of ['\n', '\r\n', '\r']) {
    const source = ['---', '# Keep', 'custom key:', '  - one', '  - two', 'nested:', '  child: original', 'keep: original', '---', '# Body', ''].join(eol)
    assert.equal(removeFrontmatterProperty(source, 'custom key'), source.replace(['custom key:', '  - one', '  - two', ''].join(eol), ''))
    assert.throws(() => removeFrontmatterProperty(source, 'nested'), /Source Mode/)
  }
  assert.throws(() => removeFrontmatterProperty('---\nname: first\nName: second\n---\n', 'name'), /Duplicate/)
  assert.throws(() => removeFrontmatterProperty('# Body', 'bad:key'), /invalid/)
})

test('normalizes only tag and cssclasses list edits while preserving aliases and ordinary strings', async () => {
  const { normalizePropertyListValue } = await import('../src/properties.ts')
  assert.equal(normalizePropertyListValue('tags', ' ###new  tag '), 'new-tag')
  assert.equal(normalizePropertyListValue('cssclasses', '#wide view'), 'wide-view')
  for (const key of ['aliases', 'labels', 'custom key']) assert.equal(normalizePropertyListValue(key, ' #new  tag '), ' #new  tag ')
})

test('broader property names still refuse injection, duplicates, reserved keys and ambiguous renames', () => {
  const source = '---\ncustom key: first\nCustom Key: second\nkeep: original\n---\nBody\n'
  for (const key of ['bad:key', 'bad\nname', 'bad\rname', 'bad\tname', 'bad\u0000name', '- injected', '[injected]', '__proto__', 'constructor', 'prototype', 'x'.repeat(129)]) {
    assert.throws(() => setFrontmatterProperty('# Body', key, 'one'), /invalid/, key)
    assert.throws(() => renameFrontmatterProperty('---\nkeep: original\n---\n', 'keep', key), /invalid/, key)
  }
  assert.throws(() => setFrontmatterProperty(source, 'custom key', 'changed'), /Duplicate/)
  assert.throws(() => renameFrontmatterProperty(source, 'custom key', 'renamed'), /Duplicate/)
  assert.equal(setFrontmatterProperty(source, 'keep', 'changed'), source.replace('keep: original', 'keep: changed'))
})
