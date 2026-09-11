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
    previousArtifactSha256s: [],
    react: '19.0.0',
    reconciler: '0.31.0',
    sourceEntry: 'src/translate.tsx',
    sourceRevision: '1063bfaa34be81528c4e397c91b57c42ec370d79',
    vendorFile: 'google-translate.tar',
  }),
  'kaomoji-search': Object.freeze({
    artifactRoot: 'tockteam-raycast-kaomoji-artifact',
    artifactSha256: '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f',
    command: 'index',
    previousArtifactSha256s: [],
    react: '19.0.0',
    reconciler: '0.31.0',
    sourceEntry: 'src/index.tsx',
    sourceRevision: 'b7845053e3f39dadcf984217be5249fb51ab2ce8',
    vendorFile: 'kaomoji-search.tar',
  }),
  'can-i-use': Object.freeze({
    artifactRoot: 'tockteam-raycast-can-i-use-artifact',
    artifactSha256: '0e23b06703ad85e91f9c6793c5de689204e9fe3bdb0fed3106a1324406bf3858',
    command: 'index', previousArtifactSha256s: [], react: '19.0.0', reconciler: '0.31.0',
    sourceEntry: 'src/index.tsx', sourceRevision: '186d955eda64f9e956b25a3fdf5566b1d38f57f2', vendorFile: 'can-i-use.tar',
  }),
})

test('trusted Raycast registry contains exactly the three reviewed extension descriptors', () => {
  assert.deepEqual(TRUSTED_RAYCAST_EXTENSION_IDS, ['google-translate', 'kaomoji-search', 'can-i-use'])
  assert.deepEqual(Object.keys(trustedRaycastDescriptors), TRUSTED_RAYCAST_EXTENSION_IDS)
  for (const id of TRUSTED_RAYCAST_EXTENSION_IDS) {
    const descriptor = getTrustedRaycastDescriptor(id)
    assert.ok(descriptor)
    assert.equal(Object.isFrozen(descriptor), true)
    assert.deepEqual({
      artifactRoot: descriptor.artifactRoot,
      artifactSha256: descriptor.artifactSha256,
      command: descriptor.command,
      previousArtifactSha256s: descriptor.previousArtifactSha256s,
      react: descriptor.react,
      reconciler: descriptor.reconciler,
      sourceEntry: descriptor.sourceEntry,
      sourceRevision: descriptor.sourceRevision,
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
