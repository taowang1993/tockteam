import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { DSH_SOURCE_SPEC, resolveDshSource, verifySha512 } from '../scripts/dsh-source.mjs'

test('desktop release source pins DSH 0.1.1-rc.2 by full commit', () => {
  assert.equal(DSH_SOURCE_SPEC.version, '0.1.1-rc.2')
  assert.equal(DSH_SOURCE_SPEC.repository, 'https://github.com/deepseek-ai/deepseek-harness.git')
  assert.equal(DSH_SOURCE_SPEC.ref, 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e')
  assert.equal(DSH_SOURCE_SPEC.revision, DSH_SOURCE_SPEC.ref)
  assert.equal(DSH_SOURCE_SPEC.pnpmIntegrity, 'sha512-GcyFLBIMcSV2DyRD7mvgyltA+fUFmN4aCaHxd1A+AQ5Xwjx3ZG4B52HeWb+HT7IqM5jDOrlpH8E+uUa28PTWIA==')
})

test('downloaded package archives must match their pinned SHA-512 integrity', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-integrity-'))
  const archive = join(root, 'package.tgz')
  try {
    writeFileSync(archive, 'reviewed archive')
    assert.doesNotThrow(() => verifySha512(archive, 'sha512-OerZSQNtH8QoB997TKwKN2OtwTv0YaOln+sM2jwVeoxJxLpJ1fZ9ZE8CX0MKJNq6uXkwNFNPlF5fR6Fsw+wH2Q=='))
    assert.throws(() => verifySha512(archive, DSH_SOURCE_SPEC.pnpmIntegrity), /integrity mismatch/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('DSH source override must match the pinned package version', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-source-'))
  const previous = process.env.DSH_SOURCE
  try {
    mkdirSync(join(root, 'apps', 'cli'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-root',
      version: DSH_SOURCE_SPEC.version,
    }))
    writeFileSync(join(root, 'apps', 'cli', 'package.json'), '{}\n')
    process.env.DSH_SOURCE = root
    assert.equal(resolveDshSource(), resolve(root))

    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-root',
      version: '0.0.0',
    }))
    assert.throws(() => resolveDshSource(), /0\.1\.1-rc\.2 is required/)
  } finally {
    if (previous === undefined) delete process.env.DSH_SOURCE
    else process.env.DSH_SOURCE = previous
    rmSync(root, { recursive: true, force: true })
  }
})
