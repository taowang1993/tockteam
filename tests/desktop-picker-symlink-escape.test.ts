import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { TockTeamDesktopGrantError, computeDesktopDestinationPlanDigest } from '../src/host-contract.ts'

test('vault backup rejects member paths because Desktop accepts only one opaque archive', () => {
  const bytes = Buffer.from('archive member bytes')
  assert.throws(
    () => computeDesktopDestinationPlanDigest({
      entries: [{
        digest: createHash('sha256').update(bytes).digest('hex') as never,
        size: bytes.length,
        target: { kind: 'relative-file', relativePath: 'files/Projects/Plan.md' as never },
      }],
      purpose: 'vault-backup',
      totalBytes: bytes.length,
    } as never),
    (cause: unknown) => cause instanceof TockTeamDesktopGrantError && cause.code === 'unsafe-target',
  )
})
