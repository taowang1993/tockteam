import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
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

test('Windows-style staging copies a non-workspace package dependency tree without symlinks', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'tockteam-stage-deps-'))
  const sourcePackage = join(fixture, 'outside-workspace', 'fixture-package')
  const dependencyStore = join(fixture, 'pnpm-store')
  const dependencyPackage = join(dependencyStore, 'fixture-dependency')
  const outputPackage = join(fixture, 'staged', 'fixture-package')
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

    mkdirSync(outputPackage, { recursive: true })
    writeFileSync(
      join(outputPackage, 'package.json'),
      readFileSync(join(sourcePackage, 'package.json')),
    )
    writeFileSync(join(outputPackage, 'index.cjs'), readFileSync(join(sourcePackage, 'index.cjs')))
    installCompiledPackageDependencies(join(sourcePackage, 'package.json'), outputPackage, {
      materializeDependencies: 'copy',
      resolveDependencyManifest: (requireFromPackage, dependency) =>
        requireFromPackage.resolve(`${dependency}/package.json`),
    })

    rmSync(sourcePackage, { recursive: true, force: true })
    rmSync(dependencyStore, { recursive: true, force: true })
    const result = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("."))'], {
      cwd: outputPackage,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, 'staged dependency')
    assert.equal(
      existsSync(
        join(
          outputPackage,
          'node_modules',
          'fixture-dependency',
          'node_modules',
          'fixture-transitive',
          'index.cjs',
        ),
      ),
      true,
    )
    assert.deepEqual(collectLinks(outputPackage), [])
    assert.equal(lstatSync(outputPackage).isDirectory(), true)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
