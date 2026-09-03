import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  DSH_SOURCE_SPEC,
  parseDshSourceSpec,
  resolveDshSource,
  verifySha512,
} from '../scripts/dsh-source.mjs'

test('desktop release source pins the published DSH npm assembly', () => {
  assert.deepEqual(DSH_SOURCE_SPEC, {
    source: 'npm',
    package: '@deepseek-ai/dsh',
    version: '0.1.1-rc.2',
    integrity: 'sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOEETBMLAl+xWPtFw6ICsN3wg==',
    tarball: 'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.1-rc.2.tgz',
    packageManager: 'pnpm@11.20.0',
    pnpmIntegrity: 'sha512-mm8zCpW2ZEbqCI+vFSFAWooB8H/ecSTMmVjf7VLUu0NnN+ZbCPhfN7Rvy6N1CSVYrFEmK4FoRLIvY0Bu0Wa/7g==',
  })
})

test('npm source specs reject untrusted or unpinned release inputs', () => {
  const valid = { ...DSH_SOURCE_SPEC }
  assert.throws(
    () => parseDshSourceSpec({ ...valid, package: '@example/dsh' }),
    /package must be @deepseek-ai\/dsh/u,
  )
  assert.throws(
    () => parseDshSourceSpec({ ...valid, tarball: 'https://example.com/dsh.tgz' }),
    /tarball must be the exact registry package URL/u,
  )
  assert.throws(
    () => parseDshSourceSpec({ ...valid, packageManager: 'pnpm@latest' }),
    /packageManager must pin a pnpm version/u,
  )
  assert.throws(
    () => parseDshSourceSpec({ ...valid, integrity: 'sha512-invalid' }),
    /integrity must be a SHA-512 SRI digest/u,
  )
})

test('npm archive extraction keeps tar operands relative on Windows', () => {
  const source = readFileSync(new URL('../scripts/dsh-source.mjs', import.meta.url), 'utf8')
  assert.match(
    source,
    /function extractTarball\(archive, extraction\)[\s\S]*?\['-xzf', basename\(archive\), '-C', basename\(extraction\)\][\s\S]*?cwd: dirname\(archive\)/u,
  )
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
    assert.deepEqual(resolveDshSource(), { kind: 'source', path: resolve(root) })

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
