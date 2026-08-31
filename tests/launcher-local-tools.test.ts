import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  MAX_LOCAL_TOOL_INPUT_LENGTH,
  MAX_ROWLAND_PATTERN_LENGTH,
  base64Decode,
  base64Encode,
  normalizeUuidToolOptions,
  rowland,
} from '../src/launcher-local-tools.ts'

const source = readFileSync(new URL('../src/launcher-local-tools.ts', import.meta.url), 'utf8')

test('local tool output is announced and tools reflow at narrow widths', () => {
  assert.match(source, /aria-live/u)
  assert.match(source, /launcher-local-tool-content[\s\S]*min-w-0/u)
  assert.match(source, /role.*status/u)
})

test('browser-safe Base64 and finite Rowland tools preserve deterministic vectors', () => {
  assert.equal(base64Encode('Tockbot ✓ 你好 🚀'), 'VG9ja2JvdCDinJMg5L2g5aW9IPCfmoA=')
  assert.equal(base64Decode('VG9ja2JvdA=='), 'Tockbot')
  assert.throws(() => base64Decode('not base64!'))
  assert.equal(rowland('Hello\tWorld\nFoo\tBar', '$0 $1', '\\n', '\\t'), 'Hello World\nFoo Bar')
  assert.equal(rowland('a\tb', '$$ $0 $2', '\\n', '\\t'), '$ a ')
  assert.match(rowland('x', '$NOPE()', '\\n', '\\t'), /Unknown function: NOPE/u)
  assert.equal(rowland('abcdef', '$SUBSTRING($0,1,3)', '\\n', '\\t'), 'bc')
  assert.match(rowland('x', '$UUID(N,v6)', '\\n', '\\t'), /^[0-9a-f]{32}$/u)
  assert.match(rowland('x', '$SUBSTRING($0,nope,3)', '\\n', '\\t'), /valid numbers/u)
})

test('local tools reject runtime input and expansion beyond finite bounds', () => {
  assert.throws(() => base64Encode('x'.repeat(MAX_LOCAL_TOOL_INPUT_LENGTH + 1)), /limit/u)
  assert.throws(() => rowland('x'.repeat(MAX_LOCAL_TOOL_INPUT_LENGTH + 1), '$0', '\\n', '\\t'), /limit/u)
  assert.throws(() => rowland('x', 'x'.repeat(MAX_ROWLAND_PATTERN_LENGTH + 1), '\\n', '\\t'), /limit/u)
  assert.throws(() => rowland('a\n'.repeat(8_000), 'x'.repeat(MAX_ROWLAND_PATTERN_LENGTH), '\\n', '\\t'), /limit/u)
})

test('UUID tool options allow only finite versions and integer counts', () => {
  assert.deepEqual(normalizeUuidToolOptions('v7', '2', 10), { count: 2, version: 'v7' })
  assert.deepEqual(normalizeUuidToolOptions('bogus', '1.5', 10), { count: 10, version: 'v4' })
  assert.deepEqual(normalizeUuidToolOptions('v6', '0', 10), { count: 1, version: 'v6' })
})
