import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('restores the isolated viewer only on its first DOM-ready event', () => {
  const source = readFileSync(new URL('../src/client.tsx', import.meta.url), 'utf8')
  assert.match(source, /addEventListener\('dom-ready', ready, \{ once: true \}\)/u)
})
