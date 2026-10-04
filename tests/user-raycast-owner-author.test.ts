import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isUserRaycastCreatorName, userRaycastOwnerOrAuthorName } from '../src/user-raycast-environment.ts'

for (const name of ['Ada', '  Étude 李 🙂  ', 'e\u0301', 'é', '\u200dName', '0', 'x'.repeat(1024), '🙂'.repeat(256), '李'.repeat(341) + 'x']) {
  test(`owner or author preserves a valid exact name of ${Buffer.byteLength(name)} UTF-8 bytes`, () => {
    assert.equal(isUserRaycastCreatorName(name), true)
    assert.equal(userRaycastOwnerOrAuthorName({ owner: name, author: 'Different Author' }), name)
    assert.equal(userRaycastOwnerOrAuthorName({ author: name }), name)
  })
}

const invalid: unknown[] = [undefined, null, false, 1, {}, [], new String('Creator'), '', '   ', '\u00a0\u2003\u3000', '\ud800', '\udfff', 'Name\ud800', 'x'.repeat(1025), '🙂'.repeat(256) + 'x', '🙂'.repeat(257), '李'.repeat(342)]
for (let index = 0; index < invalid.length; index++) test(`owner or author rejects invalid name case ${index + 1} without author fallback`, () => {
  assert.equal(isUserRaycastCreatorName(invalid[index]), false)
  assert.equal(userRaycastOwnerOrAuthorName({ owner: invalid[index], author: 'Valid Author', name: 'Not a Creator', title: 'Not a Creator' }), undefined)
  assert.equal(userRaycastOwnerOrAuthorName({ author: invalid[index] }), undefined)
})

test('owner or author rejects every C0, DEL and C1 control without broadening Unicode restrictions', () => {
  for (const code of [...Array.from({ length: 32 }, (_, index) => index), ...Array.from({ length: 33 }, (_, index) => index + 127)]) {
    const value = `Name${String.fromCharCode(code)}Suffix`
    assert.equal(isUserRaycastCreatorName(value), false, `Control U+${code.toString(16)}`)
    assert.equal(userRaycastOwnerOrAuthorName({ owner: value, author: 'Valid Author' }), undefined)
  }
  assert.equal(userRaycastOwnerOrAuthorName({ author: '\u200dExact\u2028Name\u2060' }), '\u200dExact\u2028Name\u2060')
})

test('owner or author ignores inherited declarations but accepts an own author when own owner is absent', () => {
  assert.equal(userRaycastOwnerOrAuthorName(Object.create({ owner: 'Inherited Owner', author: 'Inherited Author' })), undefined)
  assert.equal(userRaycastOwnerOrAuthorName(Object.assign(Object.create({ owner: 'Inherited Owner' }), { author: 'Own Author' })), 'Own Author')
  assert.equal(userRaycastOwnerOrAuthorName({ name: 'Not a Creator', title: 'Not a Creator', repository: 'Not a Creator' }), undefined)
  for (const manifest of [undefined, null, false, 1, 'Creator', []]) assert.equal(userRaycastOwnerOrAuthorName(manifest), undefined)
})

test('owner or author never invokes declared accessors or value conversions', () => {
  let invoked = false
  const forbidden = () => { invoked = true; throw Error('Must not invoke creator accessors or conversions') }
  assert.equal(userRaycastOwnerOrAuthorName(Object.defineProperty({ author: 'No Fallback' }, 'owner', { get: forbidden })), undefined)
  assert.equal(userRaycastOwnerOrAuthorName(Object.defineProperty({}, 'author', { get: forbidden })), undefined)
  assert.equal(userRaycastOwnerOrAuthorName(Object.defineProperty({ author: 'No Fallback' }, 'owner', { set: forbidden })), undefined)
  assert.equal(userRaycastOwnerOrAuthorName({ owner: { toString: forbidden, valueOf: forbidden, [Symbol.toPrimitive]: forbidden }, author: 'No Fallback' }), undefined)
  assert.equal(invoked, false)
  assert.equal(userRaycastOwnerOrAuthorName(Object.defineProperty({}, 'owner', { value: 'Own Nonenumerable Creator' })), 'Own Nonenumerable Creator')
})
