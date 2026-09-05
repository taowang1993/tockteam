import assert from 'node:assert/strict'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { installCompiledPackageDependencies } from '../scripts/stage-package-dependencies.mjs'

function writeManifest(directory: string, manifest: object): void {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify(manifest)}\n`)
}

function collectLinks(directory: string, links: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) links.push(path)
    else if (entry.isDirectory()) collectLinks(path, links)
  }
  return links
}

function copyMaterialized(source: string, destination: string): void {
  const canonical = lstatSync(source).isSymbolicLink() ? realpathSync(source) : source
  const stat = lstatSync(canonical)
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true })
    for (const entry of readdirSync(canonical)) {
      copyMaterialized(join(canonical, entry), join(destination, entry))
    }
    return
  }
  copyFileSync(canonical, destination)
}

test('a copied Windows-oriented package keeps its non-workspace dependency closure offline', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'tockteam-stage-deps-'))
  const sourcePackage = join(fixture, 'outside-workspace', 'fixture-package')
  const dependencyStore = join(fixture, 'pnpm-store')
  const dependencyPackage = join(dependencyStore, 'fixture-dependency')
  const stage = join(fixture, 'stage')
  const outputPackage = join(stage, 'node_modules', 'fixture-package')
  const copied = join(fixture, 'copied')
  try {
    writeManifest(sourcePackage, {
      name: 'fixture-package',
      version: '1.0.0',
      main: 'index.cjs',
      dependencies: { 'fixture-dependency': '1.0.0' },
    })
    writeFileSync(
      join(sourcePackage, 'index.cjs'),
      "module.exports = require('fixture-dependency').value\n",
    )
    writeManifest(dependencyPackage, {
      name: 'fixture-dependency',
      version: '1.0.0',
      main: 'index.cjs',
      dependencies: { 'fixture-transitive': '1.0.0' },
    })
    writeFileSync(
      join(dependencyPackage, 'index.cjs'),
      "module.exports = { value: require('fixture-transitive').value }\n",
    )
    writeManifest(join(dependencyPackage, 'node_modules', 'fixture-transitive'), {
      name: 'fixture-transitive',
      version: '1.0.0',
      main: 'index.cjs',
    })
    writeFileSync(
      join(dependencyPackage, 'node_modules', 'fixture-transitive', 'index.cjs'),
      "module.exports = { value: 'staged dependency' }\n",
    )

    mkdirSync(join(sourcePackage, 'node_modules'), { recursive: true })
    symlinkSync(
      process.platform === 'win32'
        ? dependencyPackage
        : relative(join(sourcePackage, 'node_modules'), dependencyPackage),
      join(sourcePackage, 'node_modules', 'fixture-dependency'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    writeManifest(outputPackage, {
      name: 'fixture-package',
      version: '1.0.0',
      main: 'index.cjs',
    })
    writeFileSync(join(outputPackage, 'index.cjs'), readFileSync(join(sourcePackage, 'index.cjs')))
    installCompiledPackageDependencies(join(sourcePackage, 'package.json'), outputPackage, {
      resolveDependencyManifest: (requireFromPackage, dependency) =>
        requireFromPackage.resolve(`${dependency}/package.json`),
    })

    const stageRoot = `${realpathSync(stage)}${sep}`
    const links = collectLinks(stage)
    assert.ok(links.length > 0)
    for (const link of links) {
      assert.ok(`${realpathSync(link)}${sep}`.startsWith(stageRoot), `${link} escapes the stage`)
    }

    copyMaterialized(stage, copied)
    const copiedPackage = join(copied, 'node_modules', 'fixture-package')
    assert.equal(existsSync(join(copiedPackage, 'node_modules', 'fixture-dependency', 'package.json')), true)
    assert.equal(lstatSync(join(copiedPackage, 'node_modules', 'fixture-dependency')).isSymbolicLink(), false)
    rmSync(sourcePackage, { recursive: true, force: true })
    rmSync(dependencyStore, { recursive: true, force: true })
    rmSync(stage, { recursive: true, force: true })
    const result = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("."))'], {
      cwd: copiedPackage,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, 'staged dependency')
    assert.equal(
      existsSync(
        join(
          copiedPackage,
          'node_modules',
          'fixture-dependency',
          'node_modules',
          'fixture-transitive',
          'index.cjs',
        ),
      ),
      true,
    )
    assert.deepEqual(collectLinks(copied), [])
    assert.equal(lstatSync(copiedPackage).isDirectory(), true)
    assert.equal(resolve(copiedPackage).startsWith(resolve(copied)), true)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
