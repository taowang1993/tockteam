import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

import {
  inspectLauncherPackageFeasibility,
  loadLauncherPackageFeasibilityInputs,
} from '../scripts/ueli/check-package-feasibility.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const contractPath = join(repoRoot, 'scripts/ueli/desktop-release-contract.json')
const checkerPath = join(repoRoot, 'scripts/ueli/check-package-feasibility.mjs')

function runAudit() {
  return spawnSync(process.execPath, [checkerPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

test('the foundation contract describes packaged TockLauncher assets without claiming public release', () => {
  const result = runAudit()

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /TockTeam Desktop package feasibility passed/u)
  assert.match(result.stdout, /launcherImplemented=true/u)
  assert.match(result.stdout, /launcherPackaged=true/u)
})

test('the contract preserves the current TockTeam identity and configured package formats', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  const { identity, targets, foundation } = inputs.contract

  assert.deepEqual(identity, {
    packageName: '@tockteam/desktop',
    productName: 'TockTeam Desktop',
    appId: 'ai.deepseek.tockteam-desktop',
    executableName: 'tockteam-desktop',
    desktopName: 'tockteam-desktop.desktop',
    protocols: ['tocktutor'],
    dataDirectory: 'TockTeam-Desktop',
  })
  assert.deepEqual(targets, [
    { platform: 'mac', formats: ['dmg', 'zip'], architectures: ['arm64', 'x64'] },
    { platform: 'linux', formats: ['AppImage', 'deb'], architectures: ['arm64', 'x64'] },
    { platform: 'win', formats: ['dir'], architectures: ['x64'] },
  ])
  assert.deepEqual(foundation, {
    launcherImplemented: true,
    launcherPackaged: true,
    admittedRuntimeDependencies: ['color@4.2.3', 'fast-xml-parser@5.7.0', 'mathjs@15.2.0', 'uuid@14.0.0', 'fuse.js@7.1.0', 'fuzzysort@3.1.0', 'electron-updater@6.8.3'],
    runtimeDependencyClosure: [
      '@babel/runtime@7.29.7', '@nodable/entities@2.1.1', 'argparse@2.0.1', 'builder-util-runtime@9.5.1',
      'color-convert@2.0.1', 'color-name@1.1.4', 'color-string@1.9.1', 'color@4.2.3', 'complex.js@2.4.3', 'debug@4.4.3',
      'decimal.js@10.6.0', 'electron-updater@6.8.3', 'escape-latex@1.2.0', 'fast-xml-builder@1.2.0', 'fast-xml-parser@5.7.0',
      'fraction.js@5.3.4', 'fs-extra@10.1.0', 'fuse.js@7.1.0', 'fuzzysort@3.1.0', 'graceful-fs@4.2.11', 'is-arrayish@0.3.4',
      'javascript-natural-sort@0.7.1', 'js-yaml@4.3.1', 'jsonfile@6.2.1', 'lazy-val@1.0.5', 'lodash.escaperegexp@4.1.2', 'lodash.isequal@4.5.0',
      'mathjs@15.2.0', 'ms@2.1.3', 'path-expression-matcher@1.5.0', 'sax@1.6.1', 'seedrandom@3.0.5', 'semver@7.7.4',
      'simple-swizzle@0.2.4', 'strnum@2.2.3', 'tiny-emitter@2.1.0', 'tiny-typed-emitter@2.1.0', 'typed-function@4.2.2',
      'universalify@2.0.1', 'uuid@14.0.0', 'xml-naming@0.1.0',
    ],
    launcherAssets: foundation.launcherAssets,
    launcherNotices: foundation.launcherNotices,
    shippedVendorSource: false,
    importedUeliIdentity: false,
  })
})

test('the feasibility audit rejects identity and resource drift', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  const mutation = structuredClone(inputs)
  mutation.contract.identity.appId = 'works.tockbot.desktop'
  mutation.contract.resources.builderFiles.push('vendor/ueli/**/*')

  assert.match(
    inspectLauncherPackageFeasibility(mutation).failures.join('\n'),
    /app ID differs from TockTeam identity.*vendor\/ueli must not ship/su,
  )
})

test('the feasibility audit rejects admitted Ueli-derived dependencies and launcher claims', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  const mutation = structuredClone(inputs)
  mutation.contract.foundation.admittedRuntimeDependencies = [{ name: 'fuse.js', version: '7.1.0' }]
  mutation.contract.foundation.launcherPackaged = false
  mutation.contract.publication.installedArtifact = true
  mutation.contract.publication.signed = true

  assert.match(
    inspectLauncherPackageFeasibility(mutation).failures.join('\n'),
    /launcher must be packaged in foundation.*Ueli-derived runtime dependencies differ.*installed artifact evidence must remain false.*signing evidence must remain false/su,
  )
})

test('the notice ledger keeps exact attribution for shipped launcher assets', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  const ledger = inputs.noticeLedger

  assert.deepEqual(ledger.entries.map(({ id, disposition }) => ({ id, disposition })), [
    { id: 'ueli-mit', disposition: 'provenance-only' },
    { id: 'gnome-application-search-icons', disposition: 'provenance-only' },
    { id: 'openmoji-custom-web-search-icon', disposition: 'deferred-until-asset-shipped' },
    { id: 'ueli-dependency-graph', disposition: 'not-admitted' },
  ])
  assert.deepEqual(ledger.entries.map(({ id, attribution }) => ({ id, attribution })), [
    { id: 'ueli-mit', attribution: 'https://github.com/oliverschwendener/ueli' },
    { id: 'gnome-application-search-icons', attribution: 'https://www.gnome.org' },
    { id: 'openmoji-custom-web-search-icon', attribution: 'https://openmoji.org/' },
    { id: 'ueli-dependency-graph', attribution: 'Ueli package dependency graph' },
  ])
  assert.equal(inputs.contract.foundation.launcherNotices.length, 2)
  assert.equal((await readFile(join(repoRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8')).includes('Ueli'), true)
  assert.deepEqual(inspectLauncherPackageFeasibility(inputs).failures, [])
})

test('the feasibility audit rejects mutated notice attribution', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  for (const entry of inputs.noticeLedger.entries.slice(0, 3)) {
    const mutation = structuredClone(inputs)
    const target = mutation.noticeLedger.entries.find(({ id }) => id === entry.id)
    assert.ok(target)
    target.attribution = 'https://example.invalid/mutated'
    assert.match(
      inspectLauncherPackageFeasibility(mutation).failures.join('\n'),
      /notice ledger entries differ/u,
    )
  }
})

test('the feasibility audit rejects application identity leakage but permits provenance text', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  const provenanceMutation = structuredClone(inputs)
  provenanceMutation.mainSource += '\nconst upstreamProvenance = "Ueli";\nconst compatibilityExtensionId = "ueli-extension";\n'
  assert.deepEqual(inspectLauncherPackageFeasibility(provenanceMutation).failures, [])

  const mutation = structuredClone(inputs)
  mutation.packageJson.productName = 'Tockbot'
  const failures = inspectLauncherPackageFeasibility(mutation).failures
  assert.match(failures.join('\n'), /product name differs from TockTeam identity/u)
  assert.match(failures.join('\n'), /forbidden launcher identity leakage/u)

  const sourceIdentityMutation = structuredClone(inputs)
  sourceIdentityMutation.mainSource = sourceIdentityMutation.mainSource.replace(
    "const DATA_DIRECTORY = 'TockTeam-Desktop'",
    "const DATA_DIRECTORY = 'Ueli'",
  )
  assert.match(
    inspectLauncherPackageFeasibility(sourceIdentityMutation).failures.join('\n'),
    /forbidden launcher identity leakage/u,
  )
})

test('the feasibility audit derives Ueli runtime dependencies and rejects vendor references', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })

  const dependencyMutation = structuredClone(inputs)
  dependencyMutation.packageJson.devDependencies['@fluentui/react-components'] = '9.0.0'
  assert.match(
    inspectLauncherPackageFeasibility(dependencyMutation).failures.join('\n'),
    /Ueli-derived dependency is admitted.*@fluentui\/react-components/u,
  )

  const pathMutation = structuredClone(inputs)
  pathMutation.packageJson.optionalDependencies = { 'local-ueli': 'file:vendor/ueli' }
  assert.match(
    inspectLauncherPackageFeasibility(pathMutation).failures.join('\n'),
    /dependency value must not reference vendor\/ueli/u,
  )

  assert.deepEqual(inspectLauncherPackageFeasibility(inputs).failures, [])
})

test('the feasibility audit rejects launcher lockfile specifier, resolution, and snapshot drift', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  const lockfileText = await readFile(join(repoRoot, 'pnpm-lock.yaml'), 'utf8')
  for (const mutate of [
    (lockfile: string) => lockfile.replace(
      '      fuse.js:\n        specifier: 7.1.0\n        version: 7.1.0',
      '      fuse.js:\n        specifier: 7.0.0\n        version: 7.1.0',
    ),
    (lockfile: string) => lockfile.replace(
      'sha512-trLf4SzuuUxfusZADLINj+dE8clK1frKdmqiJNb1Es75fmI5oY6X2mxLVUciLLjxqw/xr72Dhy+lER6dGd02FQ==',
      'sha512-mutated',
    ),
    (lockfile: string) => lockfile.replace('  fuzzysort@3.1.0: {}', '  fuzzysort@3.1.0:\n    dependencies:\n      unexpected: 1.0.0'),
  ]) {
    const mutation = { ...structuredClone(inputs), lockfileText: mutate(lockfileText) }
    assert.match(
      inspectLauncherPackageFeasibility(mutation).failures.join('\n'),
      /lockfile/u,
    )
  }
})

test('the release evidence distinguishes configured host targets from launcher publication', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })

  assert.deepEqual(inputs.contract.publication, {
    configuredTargets: ['macOS arm64', 'macOS x64', 'Linux arm64', 'Linux x64', 'Windows x64'],
    workflowArtifacts: ['macOS arm64', 'macOS x64', 'Linux x64'],
    launcherArtifacts: [],
    installedArtifact: false,
    signed: false,
    notarized: false,
    publicDistribution: false,
  })
  assert.deepEqual(inspectLauncherPackageFeasibility(inputs).failures, [])
})
