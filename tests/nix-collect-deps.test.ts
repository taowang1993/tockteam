import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('Nix surfaces use the repository npm runtime pin', () => {
  const source = JSON.parse(readFileSync(join(root, 'dsh-source.json'), 'utf8')) as {
    integrity: string
    source: string
    tarball: string
    version: string
  }
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>
  }
  const runtime = readFileSync(join(root, 'nix', 'dsh-runtime-pinned.nix'), 'utf8')
  const packageBuilder = readFileSync(join(root, 'nix', 'tockteam.nix'), 'utf8')
  const registerPlugins = readFileSync(join(root, 'nix', 'register-plugins.py'), 'utf8')
  const pinnedPnpm = readFileSync(join(root, 'nix', 'pnpm-pinned.nix'), 'utf8')
  const flake = readFileSync(join(root, 'flake.nix'), 'utf8')
  const lock = JSON.parse(readFileSync(join(root, 'flake.lock'), 'utf8')) as {
    nodes: Record<string, unknown>
  }

  assert.equal(source.source, 'npm')
  assert.equal(rootManifest.devDependencies['@tockteam/tocktutor-workbench'], 'file:plugins/tocktutor/packages/tockteam-tocktutor-workbench')
  assert.equal(source.tarball.endsWith(`/dsh-${source.version}.tgz`), true)
  assert.match(source.integrity, /^sha512-/u)
  assert.match(runtime, /fetchurl/u)
  assert.match(runtime, /hash = dshSourceSpec\.integrity/u)
  assert.match(runtime, /dsh-runtime-\$\{dshSourceSpec\.version\}-lock\.yaml/u)
  assert.match(runtime, /pnpm install --frozen-lockfile --ignore-scripts/u)
  assert.match(runtime, /node_modules\/\.pnpm\/node_modules/u)
  assert.match(runtime, /manifest\.dependencies = Object\.fromEntries\(Object\.entries\(dependencies\)\.sort\(\(\[a\], \[b\]\) => a < b \? -1 : a > b \? 1 : 0\)\)/u)
  assert.doesNotMatch(runtime, /localeCompare/u)
  assert.doesNotMatch(runtime, /fakeHash|fetchFromGitHub/u)
  assert.match(runtime, /pinnedPnpm/u)
  assert.match(packageBuilder, /pinnedPnpm/u)
  assert.match(pinnedPnpm, /dshSourceSpec\.pnpmIntegrity/u)
  assert.match(packageBuilder, /tocktutor-build-manifest\.mjs/u)
  assert.match(packageBuilder, /tocktutor-packages/u)
  assert.match(packageBuilder, /package-deps\/tockbot-note-runtime/u)
  assert.match(packageBuilder, /node-gyp\.js.*rebuild/su)
  assert.match(packageBuilder, /smoke-native\.cjs/u)
  assert.match(packageBuilder, /vendor\/dsh-std\/packages/u)
  assert.match(registerPlugins, /tockteam-tocktutor/u)
  assert.match(registerPlugins, /client-api\.js/u)
  assert.match(registerPlugins, /host\.js/u)
  assert.doesNotMatch(flake, /llm-agents|dshSource\s*=/u)
  for (const alias of ['tockteam-pinned = tockteam', 'tockteam-web-pinned = tockteam-web', 'tockteam-tui-pinned = tockteam-tui']) {
    assert.match(flake, new RegExp(alias))
  }
  assert.deepEqual(Object.keys(lock.nodes).sort(), ['nixpkgs', 'root'])
})

test('Nix registration preserves Desktop exports and TockTutor package outputs', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'tockteam-nix-register-'))
  const bundle = join(fixture, 'bundle')
  const dist = join(fixture, 'dist')
  const runtime = join(fixture, 'runtime')
  try {
    mkdirSync(join(bundle, 'manifests'), { recursive: true })
    mkdirSync(join(bundle, 'tocktutor-packages', 'tockteam-tocktutor'), { recursive: true })
    mkdirSync(join(runtime, 'node_modules'), { recursive: true })
    writeFileSync(join(runtime, 'package.json'), JSON.stringify({ dependencies: {} }))
    writeFileSync(join(bundle, 'manifests', 'desktop.json'), JSON.stringify({
      name: '@tockteam/desktop',
      version: '1.0.0',
    }))
    writeFileSync(join(bundle, 'manifests', 'tockteam-tocktutor.json'), JSON.stringify({
      name: '@tockteam/tocktutor',
      version: '2.0.0',
    }))
    writeFileSync(join(bundle, 'tocktutor-packages', 'tockteam-tocktutor', 'cordis.patch.yml'), '[]\n')
    writeFileSync(join(bundle, 'client.d.ts'), 'export {}\n')
    writeFileSync(join(bundle, 'host.d.ts'), 'export {}\n')
    mkdirSync(dist)
    for (const file of ['plugin.js', 'client.js', 'client.js.map', 'client-api.js', 'host.js', 'cordis.patch.yml']) {
      writeFileSync(join(dist, file), '')
    }

    const result = spawnSync('python3', [join(root, 'nix', 'register-plugins.py'), bundle, dist, runtime, 'full'], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    for (const file of ['dist/client-api.js', 'dist/host.js', 'client.d.ts', 'host.d.ts']) {
      assert.equal(readFileSync(join(runtime, 'node_modules', '@tockteam', 'desktop', file), 'utf8'), file.endsWith('.d.ts') ? 'export {}\n' : '')
    }
    assert.equal(readFileSync(join(runtime, 'node_modules', '@tockteam', 'tocktutor', 'cordis.patch.yml'), 'utf8'), '[]\n')
    const manifest = JSON.parse(readFileSync(join(runtime, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    assert.equal(manifest.dependencies['@tockteam/desktop'], '1.0.0')
    assert.equal(manifest.dependencies['@tockteam/tocktutor'], '2.0.0')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

function writePackage(store: string, name: string, version: string, manifest: object, source: string) {
  const packageDir = join(store, `${name.replace('/', '+')}@${version}`, 'node_modules', ...name.split('/'))
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name,
    version,
    type: 'module',
    main: './index.js',
    ...manifest,
  }))
  writeFileSync(join(packageDir, 'index.js'), source)
}

test('Nix registration preserves exact package-local native dependencies', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'tockteam-nix-native-deps-'))
  const bundle = join(fixture, 'bundle')
  const dist = join(fixture, 'dist')
  const runtime = join(fixture, 'runtime')
  try {
    mkdirSync(join(bundle, 'manifests'), { recursive: true })
    mkdirSync(join(bundle, 'package-deps', 'better-sidebar-runtime', 'node-pty'), { recursive: true })
    mkdirSync(join(dist, 'plugins', 'better-sidebar-runtime'), { recursive: true })
    mkdirSync(join(runtime, 'node_modules', 'node-pty'), { recursive: true })
    writeFileSync(join(runtime, 'package.json'), JSON.stringify({ dependencies: {} }))
    writeFileSync(join(runtime, 'node_modules', 'node-pty', 'package.json'), JSON.stringify({ name: 'node-pty', version: '1.2.0-beta.15' }))
    writeFileSync(join(bundle, 'manifests', 'better-sidebar-runtime.json'), JSON.stringify({
      name: '@tockteam/better-sidebar-runtime',
      version: '0.1.5',
      dependencies: { 'node-pty': '1.1.0' },
    }))
    writeFileSync(join(bundle, 'package-deps', 'better-sidebar-runtime', 'node-pty', 'package.json'), JSON.stringify({ name: 'node-pty', version: '1.1.0' }))
    writeFileSync(join(dist, 'plugins', 'better-sidebar-runtime', 'index.js'), '')

    const result = spawnSync('python3', [join(root, 'nix', 'register-plugins.py'), bundle, dist, runtime, 'full'], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    const resolved = JSON.parse(readFileSync(join(
      runtime,
      'node_modules',
      '@tockteam',
      'better-sidebar-runtime',
      'node_modules',
      'node-pty',
      'package.json',
    ), 'utf8')) as { version: string }
    assert.equal(resolved.version, '1.1.0')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('Nix dependency collector preserves conflicting package-local versions', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'tockteam-nix-conflicting-deps-'))
  const store = join(fixture, '.pnpm')
  const output = join(fixture, 'closure')
  const manifest = join(fixture, 'package.json')

  try {
    writePackage(store, '@fixture/first', '1.0.0', {
      dependencies: { '@fixture/shared': '2.0.0' },
    }, "export { value } from '@fixture/shared'\n")
    writePackage(store, '@fixture/second', '1.0.0', {
      dependencies: { '@fixture/shared': '1.0.0' },
    }, "export { value } from '@fixture/shared'\n")
    writePackage(store, '@fixture/shared', '1.0.0', {}, "export const value = 'second-version'\n")
    writePackage(store, '@fixture/shared', '2.0.0', {}, "export const value = 'first-version'\n")
    const workspacePackage = join(fixture, 'workspace-package')
    mkdirSync(workspacePackage)
    writeFileSync(join(workspacePackage, 'package.json'), JSON.stringify({ name: '@fixture/workspace', version: '1.0.0' }))
    mkdirSync(join(fixture, 'node_modules', '@fixture'), { recursive: true })
    symlinkSync(workspacePackage, join(fixture, 'node_modules', '@fixture', 'workspace'), 'dir')
    writeFileSync(manifest, JSON.stringify({
      dependencies: {
        '@fixture/first': '1.0.0',
        '@fixture/second': '1.0.0',
        '@fixture/workspace': 'workspace:*',
      },
    }))

    const result = spawnSync('python3', [join(root, 'nix', 'collect-deps.py'), store, manifest, output], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    const first = await import(pathToFileURL(join(output, '@fixture', 'first', 'index.js')).href)
    const second = await import(pathToFileURL(join(output, '@fixture', 'second', 'index.js')).href)
    assert.equal(first.value, 'first-version')
    assert.equal(second.value, 'second-version')
    assert.equal(existsSync(join(output, '@fixture', 'workspace')), false)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('Nix dependency collector preserves transitive peer resolution', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'tockteam-nix-deps-'))
  const store = join(fixture, '.pnpm')
  const output = join(fixture, 'closure')
  const manifest = join(fixture, 'package.json')

  try {
    writePackage(store, '@fixture/root', '1.0.0', {
      peerDependencies: { '@fixture/peer': '^1.0.0' },
    }, "export { value } from '@fixture/peer'\n")
    writePackage(store, '@fixture/root', '2.0.0', {
      peerDependencies: { '@fixture/peer': '2.0.0' },
    }, "export { value } from '@fixture/peer'\n")
    writePackage(store, '@fixture/peer', '1.0.0', {}, "export const value = 'resolved'\n")
    writePackage(store, '@fixture/peer', '2.0.0', {}, "export const value = 'wrong-version'\n")
    const rootPackage = join(store, '@fixture+root@1.0.0', 'node_modules', '@fixture', 'root')
    const rootPeer = join(store, '@fixture+root@1.0.0', 'node_modules', '@fixture', 'peer')
    symlinkSync(join(store, '@fixture+peer@1.0.0', 'node_modules', '@fixture', 'peer'), rootPeer, 'dir')
    writeFileSync(manifest, JSON.stringify({
      dependencies: { '@fixture/root': '1.0.0' },
    }))
    mkdirSync(join(fixture, 'node_modules', '@fixture'), { recursive: true })
    symlinkSync(rootPackage, join(fixture, 'node_modules', '@fixture', 'root'), 'dir')

    const result = spawnSync('python3', [join(root, 'nix', 'collect-deps.py'), store, manifest, output], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(
      readFileSync(join(output, '@fixture', 'root', 'node_modules', '@fixture', 'peer', 'package.json'), 'utf8').includes('"version":"1.0.0"'),
      true,
    )

    // Runtime-generated fixture path: this assertion exercises Node's real ESM resolver.
    const collected = await import(pathToFileURL(join(output, '@fixture', 'root', 'index.js')).href)
    assert.equal(collected.value, 'resolved')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
