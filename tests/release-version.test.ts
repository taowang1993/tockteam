import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertReleaseVersion } from '../scripts/check-release-version.mjs'

test('release version check accepts an exact v-prefixed package and artifact version', () => {
  assert.equal(assertReleaseVersion({ tag: 'v0.1.14', packageVersion: '0.1.14', artifactVersion: '0.1.14' }), '0.1.14')
})

test('release version check rejects non-exact tags and artifact drift', () => {
  assert.throws(() => assertReleaseVersion({ tag: '0.1.14', packageVersion: '0.1.14', artifactVersion: '0.1.14' }), /must equal/u)
  assert.throws(() => assertReleaseVersion({ tag: 'v0.1.14', packageVersion: '0.1.13', artifactVersion: '0.1.13' }), /must equal/u)
  assert.throws(() => assertReleaseVersion({ tag: 'v0.1.14', packageVersion: '0.1.14', artifactVersion: '0.1.13' }), /artifact version/u)
  assert.throws(() => assertReleaseVersion({ tag: 'v0.1.14+build', packageVersion: '0.1.14', artifactVersion: '0.1.14' }), /must equal/u)
})
