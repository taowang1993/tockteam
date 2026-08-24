import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { verifyTockTutorBuildManifest } from '../scripts/tocktutor-build-manifest.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('TockTutor tracked package outputs match their source workspace', () => {
  verifyTockTutorBuildManifest()
})

test('TockTutor workspace setup rejects a different ambient DSH checkout', () => {
  const result = spawnSync(process.execPath, ['scripts/install-tocktutor.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DSH_SOURCE: '/tmp/dsh-override' },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unset DSH_SOURCE first/u)
})
