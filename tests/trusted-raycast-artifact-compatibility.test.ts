import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertTrustedRaycastReactPair,
  TRUSTED_RAYCAST_RUNTIME,
  TRUSTED_RAYCAST_UPSTREAM_LOCK,
} from '../src/trusted-raycast-artifact.ts'

test('trusted Raycast child pins a React 19-compatible reconciler', () => {
  assertTrustedRaycastReactPair()
  assert.equal(TRUSTED_RAYCAST_RUNTIME.reconciler, '0.31.0')
  assert.throws(() => assertTrustedRaycastReactPair('18.3.1'), /incompatible/)
  assert.throws(() => assertTrustedRaycastReactPair('19.1.0', '^19.1.0'), /incompatible/)
  assert.equal(TRUSTED_RAYCAST_UPSTREAM_LOCK.axios.version, '0.31.1')
  assert.match(TRUSTED_RAYCAST_UPSTREAM_LOCK.axios.integrity, /^sha512-/)

  const fixture = {
    packages: {
      'node_modules/axios': TRUSTED_RAYCAST_UPSTREAM_LOCK.axios,
      'node_modules/react-reconciler': { version: TRUSTED_RAYCAST_RUNTIME.reconciler },
      'node_modules/scheduler': { version: '0.25.0' },
    },
  }
  assert.equal(fixture.packages['node_modules/axios'].version, '0.31.1')
  assert.notEqual(fixture.packages['node_modules/axios'].version, '0.21.4')
})
