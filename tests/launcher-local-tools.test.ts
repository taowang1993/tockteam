import assert from 'node:assert/strict'
import { test } from 'node:test'
import { base64Decode, base64Encode, rowland } from '../src/launcher-local-tools.ts'

test('browser-safe Base64 and finite Rowland tools preserve deterministic vectors', () => {
  assert.equal(base64Encode('Tockbot ✓ 你好 🚀'), 'VG9ja2JvdCDinJMg5L2g5aW9IPCfmoA=')
  assert.equal(base64Decode('VG9ja2JvdA=='), 'Tockbot')
  assert.throws(() => base64Decode('not base64!'))
  assert.equal(rowland('Hello\tWorld\nFoo\tBar', '$0 $1', '\\n', '\\t'), 'Hello World\nFoo Bar')
  assert.equal(rowland('a\tb', '$$ $0 $2', '\\n', '\\t'), '$ a ')
  assert.match(rowland('x', '$NOPE()', '\\n', '\\t'), /Unknown function: NOPE/u)
})
