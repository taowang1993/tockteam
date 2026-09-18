import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

import {
  DESKTOP_DESTINATION_PLAN_VERSION,
  MAX_DESKTOP_DESTINATION_CHUNK_BYTES,
  MAX_DESKTOP_GRANT_SESSION_MS,
  MAX_DESKTOP_SOURCE_DEPTH,
  MAX_DESKTOP_SOURCE_ENTRIES,
  MAX_DESKTOP_SOURCE_ENTRY_BYTES,
  MAX_DESKTOP_SOURCE_PAGE_ENTRIES,
  MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES,
  MAX_DESKTOP_SOURCE_TOTAL_BYTES,
  TOCKTEAM_DESKTOP_CALLER_SERVICE,
  TOCKTEAM_DESKTOP_PICKER_SERVICE,
  TockTeamDesktopGrantError,
  computeDesktopDestinationPlanDigest,
  type DesktopSha256,
} from '@tockteam/desktop/host'
import * as desktopHost from '@tockteam/desktop/host'

test('retained Desktop Host export exposes the bounded caller and path-free grant contracts', () => {
  assert.equal(TOCKTEAM_DESKTOP_CALLER_SERVICE, 'tockTeamDesktopCaller')
  assert.equal(TOCKTEAM_DESKTOP_PICKER_SERVICE, 'tockTeamDesktopPicker')
  assert.equal(MAX_DESKTOP_SOURCE_ENTRIES, 100_000)
  assert.equal(MAX_DESKTOP_SOURCE_DEPTH, 128)
  assert.equal(MAX_DESKTOP_SOURCE_ENTRY_BYTES, 1024 * 1024 * 1024)
  assert.equal(MAX_DESKTOP_SOURCE_TOTAL_BYTES, 1024 * 1024 * 1024)
  assert.equal(MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES, 4096)
  assert.equal(MAX_DESKTOP_SOURCE_PAGE_ENTRIES, 256)
  assert.equal(MAX_DESKTOP_DESTINATION_CHUNK_BYTES, 1024 * 1024)
  assert.equal(MAX_DESKTOP_GRANT_SESSION_MS, 15 * 60 * 1000)

  assert.deepEqual(
    Object.entries(desktopHost)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .filter(name => /(?:cleanup|delete|path|redeem|remove|resolve|unlink)/iu.test(name)),
    [],
    'the canonical Host export must not expose a generic path, grant resolver, or cleanup capability',
  )
})

test('destination plans use the locked domain-separated v1 digest', () => {
  assert.equal(DESKTOP_DESTINATION_PLAN_VERSION, 1)
  assert.equal(
    computeDesktopDestinationPlanDigest({
      entries: [{
        digest: 'a'.repeat(64) as DesktopSha256,
        size: 3,
        target: { kind: 'selected-file' },
      }],
      purpose: 'export-html',
      totalBytes: 3,
    }),
    '71e710a4309ccb4308e45680bbf16561fa2165d942629b7faff4dc87cbfe4387',
  )
})

test('vault backup binds one opaque selected-file archive artifact', () => {
  assert.equal(
    computeDesktopDestinationPlanDigest({
      entries: [{
        digest: 'b'.repeat(64) as DesktopSha256,
        size: 7,
        target: { kind: 'selected-file' },
      }],
      purpose: 'vault-backup',
      totalBytes: 7,
    }),
    '8bde99389b0f98d3ad4a033c6b695c65f1ae9c92d427984d1aef68912412fc7e',
  )
})

test('browser conditions cannot import the Host-only contract', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--conditions=browser',
      '--input-type=module',
      '--eval',
      "await import('@tockteam/desktop/host')",
    ],
    { encoding: 'utf8' },
  )

  assert.notEqual(child.status, 0)
  assert.match(child.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/u)
})

test('grant failures carry a closed machine-readable code', () => {
  const error = new TockTeamDesktopGrantError('replayed')

  assert.ok(error instanceof Error)
  assert.equal(error.name, 'TockTeamDesktopGrantError')
  assert.equal(error.code, 'replayed')
  assert.doesNotMatch(error.message, /(?:\/Users\/|[A-Za-z]:\\)/u)

  const recovery = new TockTeamDesktopGrantError('recovery-required')
  assert.equal(recovery.message, 'Desktop destination recovery requires user action.')
})
