import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const ARTIFACT_SHA256 = '9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f'
const ARCHIVE_ROOT = 'tockteam-raycast-kaomoji-artifact'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
export const KAOMOJI_REFERENCE_MAX_BYTES = 2 * 1024 * 1024

const contracts = Object.freeze({
  'kaomoji-search-1.png': Object.freeze({ size: 1_208_970, sha256: '837d549e5aa962a8dd9978f9c7240b8ce41a98a98a71793c2fc025021ed79b1b' }),
  'kaomoji-search-2.png': Object.freeze({ size: 1_180_195, sha256: '006120acb4a075cf873e9a387e2173959d7dca26820a4bdc58953e3260958279' }),
})
export type KaomojiReferenceName = keyof typeof contracts
export type KaomojiReferenceImage = Readonly<{ bytes: Buffer; height: 1250; name: KaomojiReferenceName; sha256: string; width: 2000 }>
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

export function validateKaomojiPngHeader(name: KaomojiReferenceName, bytes: Buffer): Readonly<{ height: 1250; width: 2000 }> {
  if (bytes.length < 24 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`${name} does not have the canonical PNG signature and IHDR`)
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20)
  if (width !== 2000 || height !== 1250) throw new Error(`${name} dimensions do not match the reviewed 2000×1250 capture`)
  return Object.freeze({ height: 1250, width: 2000 })
}

export function validateKaomojiReferenceImage(name: KaomojiReferenceName, bytes: Buffer, checksums: string): KaomojiReferenceImage {
  const contract = contracts[name]
  if (bytes.length > KAOMOJI_REFERENCE_MAX_BYTES) throw new Error(`${name} exceeds the 2 MiB bound`)
  if (bytes.length !== contract.size) throw new Error(`${name} byte length does not match the reviewed artifact`)
  const entries = checksums.split(/\r?\n/u).filter(line => line.endsWith(`  metadata/${name}`))
  if (entries.length !== 1) throw new Error(`${name} must have exactly one SOURCE-CHECKS entry`)
  const match = entries[0]!.match(/^([0-9a-f]{64})  metadata\/(kaomoji-search-[12]\.png)$/u)
  if (!match || match[2] !== name || match[1] !== contract.sha256) throw new Error(`${name} SOURCE-CHECKS digest does not match the reviewed artifact`)
  const actual = sha256(bytes)
  if (actual !== contract.sha256 || actual !== match[1]) throw new Error(`${name} digest does not match SOURCE-CHECKS`)
  const dimensions = validateKaomojiPngHeader(name, bytes)
  return Object.freeze({ bytes, ...dimensions, name, sha256: actual })
}

export async function extractKaomojiReferenceImages(artifact: string): Promise<readonly KaomojiReferenceImage[]> {
  const artifactBytes = await readFile(artifact)
  if (sha256(artifactBytes) !== ARTIFACT_SHA256) throw new Error('Kaomoji artifact digest does not match the approved bytes')
  const checksumsResult = await execFile('/usr/bin/tar', ['xOf', artifact, `${ARCHIVE_ROOT}/SOURCE-CHECKS.sha256`], { encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 15_000 })
  const checksums = checksumsResult.stdout
  const references: KaomojiReferenceImage[] = []
  for (const name of Object.keys(contracts) as KaomojiReferenceName[]) {
    const result = await execFile('/usr/bin/tar', ['xOf', artifact, `${ARCHIVE_ROOT}/source/metadata/${name}`], { encoding: null, maxBuffer: KAOMOJI_REFERENCE_MAX_BYTES, timeout: 15_000 }) as unknown as { stdout: Buffer }
    references.push(validateKaomojiReferenceImage(name, result.stdout, checksums))
  }
  return Object.freeze(references)
}
