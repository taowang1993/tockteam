import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertNoAppleDoubleEntries,
  packagingEnvironment,
} from '../scripts/desktop-pack-environment.mjs'
import {
  createTockTutorBuildManifest,
  verifyTockTutorBuildManifest,
} from '../scripts/tocktutor-build-manifest.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('TockTutor tracked package outputs match their source workspace', () => {
  verifyTockTutorBuildManifest()
})

test('TockTutor build manifest ignores local analysis caches', () => {
  assert.equal(
    createTockTutorBuildManifest().files.some(({ path }) => path.startsWith('.fallow/')),
    false,
  )
})

test('Desktop packaging disables AppleDouble only in child environments', () => {
  const parent = { COPYFILE_DISABLE: '0', TOCKTEAM_PACK_TEST: 'present' }
  const child = packagingEnvironment(parent)
  assert.equal(child.COPYFILE_DISABLE, '1')
  assert.equal(child.TOCKTEAM_PACK_TEST, 'present')
  assert.equal(parent.COPYFILE_DISABLE, '0')
  assert.doesNotThrow(() => assertNoAppleDoubleEntries(['package/client.js']))
  assert.throws(
    () => assertNoAppleDoubleEntries(['package/client.js', 'package/._package']),
    /AppleDouble/u,
  )
})

test('TockTutor workspace setup uses local pnpm and ignores an ambient DSH checkout', () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'path'),
  )
  const result = spawnSync(process.execPath, ['scripts/install-tocktutor.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...env, DSH_SOURCE: '/tmp/dsh-override', PATH: dirname(process.execPath) },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /build:dsh|DSH_SOURCE/u)
})
