import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('restores the isolated viewer only on its first DOM-ready event', () => {
  const source = readFileSync(new URL('../src/client.tsx', import.meta.url), 'utf8')
  assert.match(source, /addEventListener\('dom-ready', ready, \{ once: true \}\)/u)
})

test('styles the isolated viewer with statically discoverable Tailwind utilities', () => {
  const source = readFileSync(new URL('../src/client.tsx', import.meta.url), 'utf8')
  assert.match(source, /element\.className = 'flex min-h-0 w-full flex-1 border-0'/u)
  assert.doesNotMatch(source, /frameStyle|Object\.assign\(element\.style/u)
})
