import assert from 'node:assert/strict'
import test from 'node:test'
import {
  inferPropertyType,
  parseFrontmatterProperties,
  renameFrontmatterProperty,
  renamePropertiesRecoverably,
  setFrontmatterProperty,
} from '../dist/properties.js'

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
