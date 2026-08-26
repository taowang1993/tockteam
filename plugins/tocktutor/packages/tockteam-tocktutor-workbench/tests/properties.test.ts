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
  const source = '---\ntitle: "Lesson: one"\ntags:\n  - class\npoints: 3\ndone: false\ndate: 2026-08-26\nwhen: 2026-08-26T10:30:00Z\n---\n# Body\n'
  const properties = parseFrontmatterProperties(source)
  assert.deepEqual(properties.map(property => [property.key, property.type]), [
    ['title', 'text'],
    ['tags', 'list'],
    ['points', 'number'],
    ['done', 'checkbox'],
    ['date', 'date'],
    ['when', 'datetime'],
  ])
  const changed = setFrontmatterProperty(source, 'title', 'Draft #2')
  assert.match(changed, /title: "Draft #2"/u)
  assert.match(changed, /---\n# Body\n$/u)
  assert.equal(inferPropertyType(['one', 'two']), 'list')
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
