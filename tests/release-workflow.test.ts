import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('runtime CI verifies the nested TockTutor workspace before staging', () => {
  const workflow = readFileSync(
    join(root, '.github', 'workflows', 'ci.yml'),
    'utf8',
  ).replace(/\r\n?/g, '\n')

  assert.match(workflow, /plugins\/tocktutor\/pnpm-lock\.yaml/u)
  assert.match(workflow, /pnpm -C plugins\/tocktutor install --frozen-lockfile/u)
  assert.match(workflow, /pnpm run typecheck:tocktutor/u)
  assert.match(workflow, /pnpm run test:tocktutor/u)
  assert.match(workflow, /pnpm run build:tocktutor/u)
  assert.ok(workflow.indexOf('pnpm run build:tocktutor') < workflow.indexOf('pnpm run stage:dsh'))
})

test('Linux CI evaluates and builds every canonical and compatibility Nix output', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
  const nix = workflow.slice(workflow.indexOf('  nix:'), workflow.indexOf('  runtime:'))

  assert.match(nix, /DeterminateSystems\/nix-installer-action@[0-9a-f]{40}/u)
  assert.match(nix, /nix flake check --no-build/u)
  for (const output of [
    'tockteam',
    'tockteam-desktop',
    'tockteam-web',
    'tockteam-tui',
    'tockteam-pinned',
    'tockteam-desktop-pinned',
    'tockteam-web-pinned',
    'tockteam-tui-pinned',
  ]) assert.match(nix, new RegExp(`\\.#${output}\\b`, 'u'))
  assert.match(nix, /node scripts\/smoke-web\.mjs "\$PWD\/result-web"/u)
})

test('cross-platform core CI loads the native TockTutor search index dependency', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
  const core = workflow.slice(workflow.indexOf('  core:'), workflow.indexOf('  runtime:'))
  for (const target of ['macOS arm64', 'macOS x64', 'Linux x64', 'Windows x64']) {
    assert.match(core, new RegExp(`name: ${target}`, 'u'))
  }
  assert.match(core, /pnpm -C plugins\/tocktutor install --frozen-lockfile/u)
  assert.match(core, /pnpm -C plugins\/tocktutor\/packages\/tockbot-note-runtime run test:search-index/u)
})

test('CI actions are immutable and release write access is publish-only', () => {
  for (const name of ['ci.yml', 'release.yml']) {
    const workflow = readFileSync(join(root, '.github', 'workflows', name), 'utf8')
    const actions = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)].map(match => match[1])
    assert.ok(actions.length > 0)
    for (const action of actions) assert.match(action ?? '', /@[0-9a-f]{40}$/u)
  }
  const release = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8')
  assert.match(release, /permissions:\n  contents: read/u)
  assert.match(release, /publish:[\s\S]*permissions:\n      contents: write/u)
  assert.match(release, /run: gh release create "\$RELEASE_TAG"/u)
  assert.doesNotMatch(release, /run:.*\$\{\{ github\.ref_name \}\}/u)
})

test('publishable UI package builds its Node entrypoint before packing', () => {
  const manifest = JSON.parse(readFileSync(
    join(root, 'plugins', 'ui', 'package.json'),
    'utf8',
  )) as { scripts?: { prepack?: string } }

  assert.equal(manifest.scripts?.prepack, 'pnpm run build')
})

test('macOS packages retain the production signing hook', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    build?: { afterPack?: string }
  }
  const hook = readFileSync(join(root, 'scripts', 'after-pack.cjs'), 'utf8')

  assert.equal(manifest.build?.afterPack, 'scripts/after-pack.cjs')
  assert.match(hook, /DSH_DESKTOP_SIGN_IDENTITY \|\| '-'/u)
  assert.match(hook, /spawnSync\('\/usr\/bin\/codesign'/u)
})

test('tagged releases validate the package version and launcher audits before packaging', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8').replace(/\r\n?/g, '\n')
  assert.match(workflow, /name: Validate release contract/u)
  const validate = workflow.slice(workflow.indexOf('  validate:'), workflow.indexOf('  launcher-package-smoke:'))
  const validateTag = 'node scripts/check-release-version.mjs --tag "$GITHUB_REF_NAME"'
  assert.match(validate, /node scripts\/check-release-version\.mjs --tag "\$GITHUB_REF_NAME"/u)
  for (const command of [
    'pnpm test:ueli-package-feasibility',
    'pnpm audit:ueli-package-feasibility',
    'pnpm audit:installed-evidence',
  ]) assert.match(validate, new RegExp(command.replaceAll('.', '\\.'), 'u'))
  assert.ok(workflow.indexOf('  validate:') < workflow.indexOf('  package:'))
  assert.ok(workflow.indexOf(validateTag) < workflow.indexOf('  package:'))
  assert.match(workflow, /package:\n    needs: validate/u)
  assert.match(workflow, /launcher-package-smoke:\n    name: Gate release on packaged TockLauncher smoke/u)
  assert.match(workflow, /launcher-package-smoke:[\s\S]*run: pnpm test:launcher:packaged/u)
  assert.match(workflow, /node scripts\/check-release-version\.mjs --tag "\$GITHUB_REF_NAME" --artifact dist\/release-package\.json/u)
  assert.match(workflow, /publish:\n    name:[\s\S]*needs: \[package, launcher-package-smoke\]/u)
})

test('tagged releases build and upload both TUI archive formats', () => {
  const workflow = readFileSync(
    join(root, '.github', 'workflows', 'release.yml'),
    'utf8',
  ).replace(/\r\n?/g, '\n')

  assert.match(workflow, /name: macOS x64[\s\S]*?os: macos-15-intel[\s\S]*?node_arch: x64/u)
  assert.match(
    readFileSync(join(root, 'package.json'), 'utf8'),
    /"dist:mac:x64": "node scripts\/check-mac-architecture\.mjs x64/u,
  )
  assert.match(workflow, /run: node scripts\/build-tui\.mjs/)
  assert.match(workflow, /release\/tockteam-tui-\*\.tar\.gz/)
  assert.match(workflow, /release\/tockteam-tui-\*\.zip/)
  assert.match(workflow, /Windows packaging remains outside this release matrix[\s\S]+finite tar\.gz portable archive/u)
  assert.match(readFileSync(join(root, 'scripts', 'build-windows.mjs'), 'utf8'), /windows-portable-archive\.mjs[\s\S]+TockTeam-Desktop-\$\{version\}-x64\.tar\.gz/u)
  assert.match(workflow, /fetch-depth: 0/)
  assert.match(workflow, /fetch-tags: true/)
})
