import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { createTrustedRaycastCanIUseData } from './trusted-raycast-can-i-use-data.ts'
import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'

/** Separate inert-data decision: .beads/reports/2026-09-10-can-i-use-data-admission.md. */
export const TRUSTED_RAYCAST_CAN_I_USE_ASSET = Object.freeze({
  file: 'can-i-use-data.json.gz',
  bytes: 793106,
  sha256: '6e919a283fcb9d940b129cf2796b6e2b1355630c24309db70177dde45d55a7bb',
  capsuleBytes: 11301166,
  capsuleSha256: '09a21a4f83e27fe07d4b71ac5b8e531ac1fb8f4713ca0f7305b8cf07d5d49035',
})

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/** Caller supplies bounded Host-owned bytes. No file access, package evaluation or runtime admission. */
export function decodeTrustedRaycastCanIUseData(bytes: unknown) {
  try {
    const pin = TRUSTED_RAYCAST_CAN_I_USE_ASSET
    if (!Buffer.isBuffer(bytes) || bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) {
      return failTrustedRaycastCanIUse('DATA_UNAVAILABLE')
    }
    const capsule = gunzipSync(bytes, { maxOutputLength: pin.capsuleBytes })
    if (capsule.length !== pin.capsuleBytes || sha256(capsule) !== pin.capsuleSha256) {
      return failTrustedRaycastCanIUse('DATA_UNAVAILABLE')
    }
    // Only exact, already schema-verified bytes reach JSON.parse; there is no caller-supplied pin.
    const { entries } = JSON.parse(capsule.toString('utf8')) as { entries: { path: string; base64: string }[] }
    const json = (path: string): unknown => JSON.parse(Buffer.from(entries.find(row => row.path === path)!.base64, 'base64').toString('utf8'))
    return createTrustedRaycastCanIUseData({
      defaults: json('defaults.json'),
      canonicalTargets: json('canonical-targets.json'),
      catalog: json('catalog.json'),
      agents: json('agents.json'),
      support: json('support.json'),
    })
  } catch { return failTrustedRaycastCanIUse('DATA_UNAVAILABLE') }
}
