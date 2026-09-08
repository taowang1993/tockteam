import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRUSTED_RAYCAST_EXTENSION_IDS,
  getTrustedRaycastDescriptor,
  trustedRaycastDescriptors,
} from '../src/trusted-raycast-descriptors.ts'

const EXPECTED = Object.freeze({
  'google-translate': Object.freeze({
    artifactRoot: 'tockteam-raycast-artifact',
    artifactSha256: '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac',
    command: 'translate',
    sourceEntry: 'src/translate.tsx',
    vendorFile: 'google-translate.tar',
  }),
  'kaomoji-search': Object.freeze({
    artifactRoot: 'tockteam-raycast-kaomoji-artifact',
    artifactSha256: '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f',
    command: 'index',
    sourceEntry: 'src/index.tsx',
    vendorFile: 'kaomoji-search.tar',
  }),
})

test('trusted Raycast registry contains exactly the two reviewed extension descriptors', () => {
  assert.deepEqual(TRUSTED_RAYCAST_EXTENSION_IDS, ['google-translate', 'kaomoji-search'])
  assert.deepEqual(Object.keys(trustedRaycastDescriptors), TRUSTED_RAYCAST_EXTENSION_IDS)
  for (const id of TRUSTED_RAYCAST_EXTENSION_IDS) {
    const descriptor = getTrustedRaycastDescriptor(id)
    assert.ok(descriptor)
    assert.equal(Object.isFrozen(descriptor), true)
    assert.deepEqual({
      artifactRoot: descriptor.artifactRoot,
      artifactSha256: descriptor.artifactSha256,
      command: descriptor.command,
      sourceEntry: descriptor.sourceEntry,
      vendorFile: descriptor.vendorFile,
    }, EXPECTED[id])
    for (const path of [descriptor.artifactRoot, descriptor.sourceEntry, descriptor.vendorFile]) {
      assert.equal(path.startsWith('/'), false)
      assert.equal(path.split('/').includes('..'), false)
    }
  }
  assert.equal(Object.isFrozen(trustedRaycastDescriptors), true)
})

test('trusted Raycast descriptor lookup fails closed for unknown and malformed IDs', () => {
  for (const value of ['', 'translate', 'index', 'KAOMOJI-SEARCH', '../kaomoji-search', 'google-translate/../x', 1, null, {}]) {
    assert.equal(getTrustedRaycastDescriptor(value), undefined)
  }
})
