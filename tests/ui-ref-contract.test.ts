import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (name: string): string => readFileSync(
  new URL(`../plugins/ui/src/${name}.tsx`, import.meta.url),
  'utf8',
)

test('UI wrappers forward accepted refs to their underlying elements', () => {
  for (const name of ['skeleton', 'spinner', 'switch', 'textarea', 'tooltip']) {
    const source = read(name)
    assert.match(source, /React\.forwardRef</u, name)
    assert.match(source, /ref=\{ref\}/u, name)
  }
})
