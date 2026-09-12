import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  extractKaomojiReferenceImages,
  KAOMOJI_REFERENCE_MAX_BYTES,
  validateKaomojiPngHeader,
  validateKaomojiReferenceImage,
} from '../scripts/trusted-raycast-kaomoji-reference.ts'

const artifact = join(resolve('.'), 'plugins/trusted-raycast/vendor/kaomoji-search.tar')

test('extracts only the two pinned official Kaomoji reference images', async () => {
  const references = await extractKaomojiReferenceImages(artifact)
  assert.deepEqual(references.map(reference => ({ height: reference.height, name: reference.name, sha256: reference.sha256, size: reference.bytes.length, width: reference.width })), [
    { height: 1250, name: 'kaomoji-search-1.png', sha256: '837d549e5aa962a8dd9978f9c7240b8ce41a98a98a71793c2fc025021ed79b1b', size: 1_208_970, width: 2000 },
    { height: 1250, name: 'kaomoji-search-2.png', sha256: '006120acb4a075cf873e9a387e2173959d7dca26820a4bdc58953e3260958279', size: 1_180_195, width: 2000 },
  ])
})

test('rejects an unapproved outer artifact before extraction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-kaomoji-reference-test-'))
  try {
    const candidate = join(root, 'candidate.tar'); await writeFile(candidate, 'not the approved artifact')
    await assert.rejects(() => extractKaomojiReferenceImages(candidate), /artifact digest does not match/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects over-bound, wrong-hash, and truncated reference bytes', async () => {
  const [reference] = await extractKaomojiReferenceImages(artifact)
  assert.ok(reference)
  assert.throws(() => validateKaomojiReferenceImage(reference.name, Buffer.alloc(KAOMOJI_REFERENCE_MAX_BYTES + 1), `${reference.sha256}  metadata/${reference.name}\n`), /exceeds the 2 MiB bound/u)
  const wrongHash = Buffer.from(reference.bytes); wrongHash[100] = wrongHash[100]! ^ 1
  assert.throws(() => validateKaomojiReferenceImage(reference.name, wrongHash, `${reference.sha256}  metadata/${reference.name}\n`), /digest does not match/u)
  assert.throws(() => validateKaomojiReferenceImage(reference.name, reference.bytes.subarray(0, reference.bytes.length - 1), `${reference.sha256}  metadata/${reference.name}\n`), /byte length does not match/u)
})

test('rejects non-PNG signatures and unexpected dimensions', async () => {
  const [reference] = await extractKaomojiReferenceImages(artifact)
  assert.ok(reference)
  const wrongSignature = Buffer.from(reference.bytes); wrongSignature[0] = 0
  assert.throws(() => validateKaomojiPngHeader(reference.name, wrongSignature), /canonical PNG signature/u)
  const wrongDimensions = Buffer.from(reference.bytes); wrongDimensions.writeUInt32BE(1999, 16)
  assert.throws(() => validateKaomojiPngHeader(reference.name, wrongDimensions), /dimensions do not match/u)
})

test('rejects missing and duplicate SOURCE-CHECKS entries', async () => {
  const [reference] = await extractKaomojiReferenceImages(artifact)
  assert.ok(reference)
  assert.throws(() => validateKaomojiReferenceImage(reference.name, reference.bytes, ''), /exactly one SOURCE-CHECKS entry/u)
  const line = `${reference.sha256}  metadata/${reference.name}\n`
  assert.throws(() => validateKaomojiReferenceImage(reference.name, reference.bytes, line + line), /exactly one SOURCE-CHECKS entry/u)
})
