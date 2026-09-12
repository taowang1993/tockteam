import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

test('configured tracer rejects a child that emits no result', async t => {
  const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
  if (!artifact || !existsSync(artifact)) { t.skip('set TRUSTED_RAYCAST_ARTIFACT_TAR for tracer integration tests'); return }
  const child = spawn(process.execPath, ['scripts/trusted-raycast-tracer.mjs'], { env: { ...process.env, TRUSTED_RAYCAST_ARTIFACT_TAR: artifact, TRUSTED_RAYCAST_FORCE_NO_RESULT: '1', TRUSTED_RAYCAST_CHILD_DEADLINE_MS: '300' }, stdio: 'ignore' })
  const code = await new Promise<number | null>(resolve => child.once('close', resolve))
  assert.notEqual(code, 0)
})
