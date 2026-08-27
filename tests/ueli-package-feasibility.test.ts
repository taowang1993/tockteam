import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

import {
  inspectLauncherPackageFeasibility,
  loadLauncherPackageFeasibilityInputs,
} from '../scripts/ueli/check-package-feasibility.mjs'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/u, '')
const contractPath = join(repoRoot, 'scripts/ueli/desktop-release-contract.json')
const checkerPath = join(repoRoot, 'scripts/ueli/check-package-feasibility.mjs')

function runAudit() {
  return spawnSync(process.execPath, [checkerPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

test('the foundation contract describes TockTeam Desktop without claiming launcher artifacts', () => {
  const result = runAudit()

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /TockTeam Desktop package feasibility passed/u)
  assert.match(result.stdout, /launcherImplemented=false/u)
  assert.match(result.stdout, /launcherPackaged=false/u)
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
    launcherImplemented: false,
    launcherPackaged: false,
    admittedRuntimeDependencies: [],
    runtimeDependencyClosure: [],
    launcherAssets: [],
    launcherNotices: [],
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
  mutation.contract.foundation.launcherPackaged = true
  mutation.contract.publication.installedArtifact = true
  mutation.contract.publication.signed = true

  assert.match(
    inspectLauncherPackageFeasibility(mutation).failures.join('\n'),
    /launcher must not be packaged in foundation.*Ueli-derived runtime dependencies must remain empty.*installed artifact evidence must remain false.*signing evidence must remain false/su,
  )
})

test('the notice ledger keeps attribution in provenance without adding cross-surface notices', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  const ledger = inputs.noticeLedger

  assert.deepEqual(ledger.entries.map(({ id, disposition }) => ({ id, disposition })), [
    { id: 'ueli-mit', disposition: 'provenance-only' },
    { id: 'gnome-application-search-icons', disposition: 'provenance-only' },
    { id: 'openmoji-custom-web-search-icon', disposition: 'deferred-until-asset-shipped' },
    { id: 'ueli-dependency-graph', disposition: 'not-admitted' },
  ])
  assert.equal(inputs.contract.foundation.launcherNotices.length, 0)
  assert.equal((await readFile(join(repoRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8')).includes('Ueli'), false)
  assert.deepEqual(inspectLauncherPackageFeasibility(inputs).failures, [])
})

test('the feasibility audit rejects identity leakage in package inputs', async () => {
  const inputs = await loadLauncherPackageFeasibilityInputs({ repoRoot })
  const mutation = structuredClone(inputs)
  mutation.packageJson.productName = 'Tockbot'
  mutation.mainSource += '\nconst leakedIdentity = "ueli";\n'

  assert.match(
    inspectLauncherPackageFeasibility(mutation).failures.join('\n'),
    /product name differs from TockTeam identity.*forbidden launcher identity leakage/su,
  )
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
