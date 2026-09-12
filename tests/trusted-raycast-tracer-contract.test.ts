import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTrustedRaycastResult } from '../src/trusted-raycast-tracer-contract.ts'

test('translation result admission requires a changed target-script result', () => {
  assert.deepEqual(parseTrustedRaycastResult('RESULT {"input":"hello","translated":"你好","target":"zh-CN"}', 'hello'), { input: 'hello', translated: '你好', target: 'zh-CN' })
  assert.throws(() => parseTrustedRaycastResult('RESULT {"input":"hello","translated":"hello","target":"zh-CN"}'), /cross-language/)
  assert.throws(() => parseTrustedRaycastResult('RESULT {"input":"other","translated":"你好","target":"zh-CN"}', 'hello'), /input/)
  assert.throws(() => parseTrustedRaycastResult('RESULT {"input":"hello","translated":"你好","target":"zh-CN","extra":true}'), /shape/)
  assert.throws(() => parseTrustedRaycastResult('RESULT {"input":"hello","translated":"bonjour","target":"zh-CN"}'), /cross-language/)
  assert.throws(() => parseTrustedRaycastResult(''), /no result/)
})
