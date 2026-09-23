import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  inferPropertyType,
  parseFrontmatterProperties,
  renameFrontmatterProperty,
  renamePropertiesRecoverably,
  setFrontmatterProperty,
} from '../dist/properties.js'

test('malformed flat lists have bounded parse time', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { parseFrontmatterProperties } from ${JSON.stringify(new URL('../dist/properties.js', import.meta.url).href)};
    const source = '---\\ntags: [one' + ' '.repeat(200_000) + "'two']\\n---\\n";
    assert.notEqual(parseFrontmatterProperties(source)[0]?.type, 'list');
  `], { timeout: 2_000, encoding: 'utf8' })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
})

test('round-trips supported property types without corrupting the Markdown body', () => {
  const source = '---\ntitle: "Lesson: one"\ntags:\n  - class\naliases: [one, "two words"]\npoints: 3\ndone: false\ndate: 2026-08-26\nwhen: 2026-08-26T10:30:00Z\n---\n# Body\n'
  const properties = parseFrontmatterProperties(source)
  assert.deepEqual(properties.map(property => [property.key, property.type]), [
    ['title', 'text'],
    ['tags', 'list'],
    ['aliases', 'list'],
    ['points', 'number'],
    ['done', 'checkbox'],
    ['date', 'date'],
    ['when', 'datetime'],
  ])
  assert.deepEqual(properties.find(property => property.key === 'aliases')?.value, ['one', 'two words'])
  const changed = setFrontmatterProperty(source, 'title', 'Draft #2')
  assert.match(changed, /title: "Draft #2"/u)
  assert.match(changed, /---\n# Body\n$/u)
  assert.equal(inferPropertyType(['one', 'two']), 'list')
})

test('inserts properties before the closing delimiter without changing surrounding content', () => {
  for (const eol of ['\n', '\r\n']) {
    for (const marker of ['---', '...']) {
      for (const content of ['', `value: one${eol}`, `value: one${eol}# Keep this comment${eol}`]) {
        for (const suffix of ['', eol, `${eol}# Body${eol}---${eol}Keep this too`]) {
          const prefix = `---${eol}${content}`
          const source = `${prefix}${marker}${suffix}`
          assert.equal(
            setFrontmatterProperty(source, 'other', 'two'),
            `${prefix}other: two${eol}${marker}${suffix}`,
            JSON.stringify(source),
          )
        }
      }
    }
  }
})

test('preserves quoted scalar strings when parsing and writing properties', () => {
  for (const value of ['true', 'false', 'null', '~', '42', '0', '-1.25', '']) {
    for (const quote of ['"', "'"]) {
      const source = `---\nvalue:  ${quote}${value}${quote}  \n---\n# Body\n`
      assert.deepEqual(parseFrontmatterProperties(source), [{ key: 'value', type: 'text', value }], source)
      assert.deepEqual(parseFrontmatterProperties(setFrontmatterProperty(source, 'value', value)), [
        { key: 'value', type: 'text', value },
      ])
    }
  }
  assert.equal(parseFrontmatterProperties('---\nvalue: "\\u0074rue"\n---')[0]?.value, 'true')
  for (const value of [true, false, null, 0, 42, -1.25]) {
    assert.equal(parseFrontmatterProperties(setFrontmatterProperty('# Body\n', 'value', value))[0]?.value, value)
  }
})

test('renames one safe frontmatter key and rejects conflicts or malformed names', () => {
  const source = '---\nstatus: active\nowner: Ada\n---\nBody\n'
  assert.equal(renameFrontmatterProperty(source, 'status', 'state'), '---\nstate: active\nowner: Ada\n---\nBody\n')
  assert.throws(() => renameFrontmatterProperty(source, 'status', 'owner'), /exists/u)
  assert.throws(() => renameFrontmatterProperty(source, 'status', 'bad:key'), /invalid/u)
})

test('rolls back earlier property renames when a later save fails', async () => {
  const files = [
    { path: 'A.md', revision: 'a', source: '---\nstatus: one\n---\n' },
    { path: 'B.md', revision: 'b', source: '---\nstatus: two\n---\n' },
  ]
  const writes: string[] = []
  const rollbacks: string[] = []
  const result = await renamePropertiesRecoverably(files, 'status', 'state', {
    rollback: async file => { rollbacks.push(file.path) },
    save: async file => {
      writes.push(file.path)
      if (file.path === 'B.md') throw new Error('conflict')
      return { revision: `${file.revision}-saved` }
    },
  })
  assert.equal(result.status, 'rolled-back')
  assert.deepEqual(writes, ['A.md', 'B.md'])
  assert.deepEqual(rollbacks, ['A.md'])
})

test('property editing rejects bounded or structured values rather than producing duplicate or invalid frontmatter', async () => {
  const { setFrontmatterProperty } = await import('../src/properties.ts')
  for (const source of ['---\nnested:\n  child: value\n---\nBody\n', '---\nnested: |\n  multiline\n---\nBody\n', '---\nnested: {child: value}\n---\nBody\n']) {
    assert.throws(() => setFrontmatterProperty(source, 'nested', 'replacement'), /Source Mode/)
  }
  assert.throws(() => setFrontmatterProperty('---\nname: Kept\n---\n' + 'x'.repeat(1_000_001), 'name', 'Changed'), /large/)
})


test('rejects authored structured or non-string lists without flattening them, preserving supported string lists', async () => {
  const { parseFrontmatterProperties, setFrontmatterProperty } = await import('../src/properties.ts')
  for (const authored of ['\n  - child: original', '\n  - [nested, list]', '\n  - {child: original}', ' [[nested], plain]', ' [{child: original}]', '\n  - 3', '\n  - true', '\n  - null', ' [one, 3]', ' [false, null]', ' [2026-09-21]', ' [0x10, .nan]', '\n- child: original', '\n  \t- value', '\n  - -', '\n  - first\n    - nested']) {
    const source = `---\nitems:${authored}\nkeep: original\n---\nBody\n`
    assert.notEqual(parseFrontmatterProperties(source)[0]?.type, 'list', authored)
    assert.throws(() => setFrontmatterProperty(source, 'items', ['replacement']), /Source Mode/, authored)
    assert.equal(source, `---\nitems:${authored}\nkeep: original\n---\nBody\n`)
    assert.equal(setFrontmatterProperty(source, 'keep', 'changed'), source.replace('keep: original', 'keep: changed'))
  }
  for (const authored of [' [one, "two, three", "true", "3", "2026-09-21", "[nested]"]', "\n  - one\n  - 'child: original'\n  - 'null'\n  - 'it''s text'", ' []']) {
    const source = `---\nitems:${authored}\n---\nBody\n`
    const parsed = parseFrontmatterProperties(source)[0]!
    assert.equal(parsed.type, 'list')
    assert.deepEqual(parseFrontmatterProperties(setFrontmatterProperty(source, 'items', parsed.value))[0], parsed)
  }
})


test('quotes ambiguous user-entered string-list values so supported edits remain string lists', async () => {
  const { parseFrontmatterProperties, setFrontmatterProperty } = await import('../src/properties.ts')
  const values = ['0x10', '.nan', 'TRUE', 'null', '1e3', '-', '?', 'first\nsecond', 'a\tb', 'normal-tag', '2026-review', '123tag']
  const source = setFrontmatterProperty('# Body\n', 'items', values)
  assert.deepEqual(parseFrontmatterProperties(source)[0], { key: 'items', type: 'list', value: values })
})


test('keeps ordinary numeric-prefixed tag names editable rather than mistaking them for numeric scalars', async () => {
  const { parseFrontmatterProperties, setFrontmatterProperty } = await import('../src/properties.ts')
  const source = '---\ntags: [2026-review, 123tag, normal-tag]\n---\n'
  const property = { key: 'tags', type: 'list', value: ['2026-review', '123tag', 'normal-tag'] }
  assert.deepEqual(parseFrontmatterProperties(source)[0], property)
  assert.deepEqual(parseFrontmatterProperties(setFrontmatterProperty(source, 'tags', property.value))[0], property)
})
