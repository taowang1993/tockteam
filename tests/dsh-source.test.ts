import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  acquireNpmAssembly,
  DSH_SOURCE_SPEC,
  parseDshSourceSpec,
  resolveDshSource,
  verifySha512,
} from '../scripts/dsh-source.mjs'

test('desktop release source pins the published DSH npm assembly', () => {
  assert.deepEqual(DSH_SOURCE_SPEC, {
    source: 'npm',
    package: '@deepseek-ai/dsh',
    version: '0.1.2-rc.1',
    integrity: 'sha512-RPq48TzxvwpdT9/7W1tbhZDBMmeK+bxDrX9cqQC27Wx/LqtgJF8PSa3b3xriU8oxtvhwYmk21w2cej3uMQrnVA==',
    tarball: 'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.2-rc.1.tgz',
    packageManager: 'pnpm@11.20.0',
    pnpmIntegrity: 'sha512-mm8zCpW2ZEbqCI+vFSFAWooB8H/ecSTMmVjf7VLUu0NnN+ZbCPhfN7Rvy6N1CSVYrFEmK4FoRLIvY0Bu0Wa/7g==',
  })
})

test('the runtime lock and stripped manifest pin the complete 0.1.2 release line', () => {
  const manifest = JSON.parse(readFileSync(new URL('../scripts/dsh-runtime-0.1.2-rc.1-package.json', import.meta.url), 'utf8'))
  const lock = readFileSync(new URL('../scripts/dsh-runtime-0.1.2-rc.1-lock.yaml', import.meta.url), 'utf8')
  const nix = readFileSync(new URL('../nix/dsh-runtime-pinned.nix', import.meta.url), 'utf8')

  assert.equal(manifest.name, '@deepseek-ai/dsh')
  assert.equal(manifest.version, DSH_SOURCE_SPEC.version)
  assert.equal(manifest.devDependencies, undefined)
  assert.doesNotMatch(lock, /@deepseek-ai\/dsh-[^@'\n]+@(?!0\.1\.2-rc\.1)/u)
  assert.match(nix, /dsh-runtime-\$\{dshSourceSpec\.version\}-package\.json/u)
  assert.match(nix, /if \[ -d config \]/u)
})

test('browser plugins use the 0.1.2 platform store without the removed client runtime', () => {
  const rootManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const clientManifests = [
    '../web/package.json',
    '../plugins/panel-controls/package.json',
    '../plugins/pinned-summary/package.json',
    '../plugins/plugin-marketplace/package.json',
    '../plugins/sidebar/package.json',
    '../plugins/skins/package.json',
  ].map(path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')))
  const skinsClient = readFileSync(new URL('../plugins/skins/src/client/plugin.tsx', import.meta.url), 'utf8')
  const sidebarClient = readFileSync(new URL('../plugins/sidebar/src/client/plugin.tsx', import.meta.url), 'utf8')
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8')

  assert.equal(rootManifest.devDependencies['@deepseek-ai/dsh-client-store'], DSH_SOURCE_SPEC.version)
  for (const manifest of [rootManifest, ...clientManifests]) {
    assert.doesNotMatch(JSON.stringify(manifest.dsh.client.inject), /dsh-client-runtime/u)
  }
  for (const client of [skinsClient, sidebarClient]) {
    assert.match(client, /from '@deepseek-ai\/dsh-client-store'/u)
    assert.doesNotMatch(client, /dsh-client-runtime/u)
  }
  assert.match(build, /'@deepseek-ai\/dsh-client-store'/u)
})

test('TockTutor metadata follows the 0.1.2 client and Host contracts', () => {
  const packagePaths = [
    '../plugins/tocktutor/package.json',
    '../plugins/tocktutor/packages/tockbot-note-desktop/package.json',
    '../plugins/tocktutor/packages/tockbot-note-runtime/package.json',
    '../plugins/tocktutor/packages/tockbot-note-vault/package.json',
    '../plugins/tocktutor/packages/tockbot-web-clip/package.json',
    '../plugins/tocktutor/packages/tockteam-note-vault-tools/package.json',
    '../plugins/tocktutor/packages/tockteam-tocktutor/package.json',
    '../plugins/tocktutor/packages/tockteam-tocktutor-assistant/package.json',
    '../plugins/tocktutor/packages/tockteam-tocktutor-import-export/package.json',
    '../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json',
  ]
  const manifests = packagePaths.map(path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')))
  const clientSources = [
    '../plugins/tocktutor/packages/tockbot-note-desktop/src/client-api.ts',
    '../plugins/tocktutor/packages/tockbot-web-clip/src/client.tsx',
    '../plugins/tocktutor/packages/tockteam-tocktutor-assistant/src/client.ts',
    '../plugins/tocktutor/packages/tockteam-tocktutor-import-export/src/client-api.ts',
    '../plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/client-api.ts',
  ].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))

  const rootManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const cordisPins = {
    '@deepseek-ai/cordis': '4.0.2',
    '@deepseek-ai/cordis-plugin-include': '1.0.7',
    '@deepseek-ai/cordis-plugin-loader': '1.0.3',
  }
  for (const [name, version] of Object.entries(cordisPins)) {
    assert.equal(rootManifest.devDependencies[name], version)
  }
  for (const manifest of manifests) {
    assert.doesNotMatch(JSON.stringify(manifest), /0\.1\.1-rc\.2|dsh-client-runtime/u)
    for (const dependencies of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies]) {
      for (const [name, version] of Object.entries(dependencies ?? {})) {
        if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, DSH_SOURCE_SPEC.version, name)
        if (name in cordisPins) assert.equal(version, cordisPins[name as keyof typeof cordisPins], name)
      }
    }
  }
  for (const source of clientSources) {
    assert.doesNotMatch(source, /dsh-client-runtime/u)
  }
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

test('fresh npm assemblies replace the cache pointer only after extraction', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-assembly-'))
  const fixture = join(root, 'fixture', 'package')
  const cache = join(root, 'cache')
  const archive = join(cache, 'package.tgz')
  try {
    mkdirSync(join(fixture, 'lib'), { recursive: true })
    mkdirSync(cache)
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh',
      version: DSH_SOURCE_SPEC.version,
      devDependencies: { '@deepseek-ai/dsh-experimental-unpublished': DSH_SOURCE_SPEC.version },
    }))
    writeFileSync(join(fixture, 'lib', 'bin.js'), '')
    const packed = spawnSync('tar', ['-czf', archive, '-C', join(root, 'fixture'), 'package'], { encoding: 'utf8' })
    assert.equal(packed.status, 0, packed.stderr)

    const first = acquireNpmAssembly(cache, archive)
    writeFileSync(join(first, '.mutated'), '')
    const second = acquireNpmAssembly(cache, archive)
    assert.notEqual(second, first)
    assert.equal(existsSync(first), false)
    assert.equal(existsSync(join(second, '.mutated')), false)
    assert.equal(readFileSync(join(cache, 'assembly-path'), 'utf8').trim(), basename(second))
    const workspace = readFileSync(join(second, 'pnpm-workspace.yaml'), 'utf8')
    assert.match(workspace, /minimumReleaseAgeExclude/u)
    assert.match(workspace, /ignoredBuiltDependencies/u)
    assert.equal(JSON.parse(readFileSync(join(second, 'package.json'), 'utf8')).devDependencies, undefined)

    const brokenArchive = join(cache, 'broken.tgz')
    writeFileSync(brokenArchive, 'not a tarball')
    assert.throws(() => acquireNpmAssembly(cache, brokenArchive), /tar .* failed with status/u)
    assert.equal(readFileSync(join(cache, 'assembly-path'), 'utf8').trim(), basename(second))
    assert.equal(existsSync(second), true)

    writeFileSync(join(cache, 'assembly-path'), '../outside\n')
    assert.throws(() => acquireNpmAssembly(cache, archive), /invalid cached DSH assembly pointer/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
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
    assert.throws(() => resolveDshSource(), /0\.1\.2-rc\.1 is required/)
  } finally {
    if (previous === undefined) delete process.env.DSH_SOURCE
    else process.env.DSH_SOURCE = previous
    rmSync(root, { recursive: true, force: true })
  }
})
