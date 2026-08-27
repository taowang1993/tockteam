#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '../..')
const EXPECTED_IDENTITY = Object.freeze({
  packageName: '@tockteam/desktop',
  productName: 'TockTeam Desktop',
  appId: 'ai.deepseek.tockteam-desktop',
  executableName: 'tockteam-desktop',
  desktopName: 'tockteam-desktop.desktop',
  protocols: Object.freeze(['tocktutor']),
  dataDirectory: 'TockTeam-Desktop',
})
const EXPECTED_TARGETS = Object.freeze([
  Object.freeze({ platform: 'mac', formats: Object.freeze(['dmg', 'zip']), architectures: Object.freeze(['arm64', 'x64']) }),
  Object.freeze({ platform: 'linux', formats: Object.freeze(['AppImage', 'deb']), architectures: Object.freeze(['arm64', 'x64']) }),
  Object.freeze({ platform: 'win', formats: Object.freeze(['dir']), architectures: Object.freeze(['x64']) }),
])
const EXPECTED_FOUNDATION = Object.freeze({
  launcherImplemented: true,
  launcherPackaged: false,
  admittedRuntimeDependencies: Object.freeze([]),
  runtimeDependencyClosure: Object.freeze([]),
  launcherAssets: Object.freeze([]),
  launcherNotices: Object.freeze([]),
  shippedVendorSource: false,
  importedUeliIdentity: false,
})
const EXPECTED_PUBLICATION = Object.freeze({
  configuredTargets: Object.freeze(['macOS arm64', 'macOS x64', 'Linux arm64', 'Linux x64', 'Windows x64']),
  workflowArtifacts: Object.freeze(['macOS arm64', 'macOS x64', 'Linux x64']),
  launcherArtifacts: Object.freeze([]),
  installedArtifact: false,
  signed: false,
  notarized: false,
  publicDistribution: false,
})
const EXPECTED_UELI_INTEGRATION = Object.freeze({
  baseline: 'v9.29.0',
  peeledCommit: 'c9670d61cb2576802adf99d95622c58538d265f3',
  admittedRuntimeDependencies: Object.freeze([]),
  runtimeDependencyClosure: Object.freeze([]),
  shippedVendorSource: false,
  importedIdentity: false,
})
const EXPECTED_NOTICE_ENTRIES = Object.freeze([
  Object.freeze({
    id: 'ueli-mit',
    source: 'vendor/ueli/LICENSE',
    license: 'MIT',
    sha256: '8da6c1a79d367a41aadf313019833f4bb3f2ff55f0da5b522fd058183d2f9106',
    attribution: 'https://github.com/oliverschwendener/ueli',
    disposition: 'provenance-only',
  }),
  Object.freeze({
    id: 'gnome-application-search-icons',
    source: 'vendor/ueli/assets/Extensions/ApplicationSearch/LICENSE',
    license: 'CC BY-SA 3.0',
    sha256: 'ed29c8f605a1a27368c832b47816405bc6bb18f1d3ec53372cc5c40e64ae680d',
    attribution: 'https://www.gnome.org',
    disposition: 'provenance-only',
  }),
  Object.freeze({
    id: 'openmoji-custom-web-search-icon',
    source: 'vendor/ueli/docs/Extensions/CustomWebSearch/README.md',
    license: 'CC BY-SA 4.0',
    sha256: '377515334214846e9564c3dfb03d9a8e50f31e8d590fad20c6f09c165fa35244',
    attribution: 'https://openmoji.org/',
    disposition: 'deferred-until-asset-shipped',
  }),
  Object.freeze({
    id: 'ueli-dependency-graph',
    source: Object.freeze(['vendor/ueli/package.json', 'vendor/ueli/package-lock.json']),
    license: 'mixed',
    attribution: 'Ueli package dependency graph',
    disposition: 'not-admitted',
  }),
])
const FORBIDDEN_APPLICATION_IDENTITY = /tockbot|works\.tockbot|OliverSchwendener\.Ueli|\bueli\b/iu
const VENDOR_SOURCE = /vendor[/\\]ueli/iu

function addFailure(failures, condition, message) {
  if (!condition) failures.push(message)
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function expectedNoticeShape(entry) {
  return {
    id: entry.id,
    source: entry.source,
    license: entry.license,
    ...(entry.sha256 === undefined ? {} : { sha256: entry.sha256 }),
    attribution: entry.attribution,
    disposition: entry.disposition,
  }
}

function validateNoticeLedger(inputs, failures) {
  const { contract, noticeLedger, noticeContents = {} } = inputs
  addFailure(failures, contract.noticeLedger === 'scripts/ueli/notice-ledger.json', 'notice ledger path differs from the TockTeam contract')
  addFailure(failures, noticeLedger?.schemaVersion === 1, 'notice ledger schemaVersion is not 1')
  addFailure(failures, noticeLedger?.baseline === 'v9.29.0', 'notice ledger baseline differs from v9.29.0')
  const entries = Array.isArray(noticeLedger?.entries) ? noticeLedger.entries : []
  addFailure(failures, sameJson(entries.map(expectedNoticeShape), EXPECTED_NOTICE_ENTRIES.map(expectedNoticeShape)), 'notice ledger entries differ from the reviewed provenance ledger')
  for (const entry of entries) {
    const sources = Array.isArray(entry.source) ? entry.source : [entry.source]
    for (const source of sources) {
      const contents = noticeContents[source]
      addFailure(failures, typeof contents === 'string' && contents.length > 0, `notice source is missing or empty: ${source}`)
    }
    if (entry.sha256 !== undefined && sources.length === 1) {
      addFailure(failures, hash(noticeContents[sources[0]]) === entry.sha256, `notice source hash differs from the ledger: ${sources[0]}`)
    }
  }
  const openMoji = entries.find(({ id }) => id === 'openmoji-custom-web-search-icon')
  const openMojiText = openMoji && noticeContents[openMoji.source]
  addFailure(failures, typeof openMojiText === 'string' && /OpenMoji/u.test(openMojiText) && /CC BY-SA 4\.0/u.test(openMojiText), 'OpenMoji CC BY-SA 4.0 attribution is missing')
}

export function inspectLauncherPackageFeasibility(inputs) {
  const { contract, packageJson, vendorPackageJson, mainSource } = inputs
  const failures = []
  const build = packageJson?.build ?? {}
  const identity = contract?.identity ?? {}

  addFailure(failures, contract?.schemaVersion === 1, 'release contract schemaVersion is not 1')
  for (const key of ['packageName', 'productName', 'appId', 'executableName', 'desktopName', 'dataDirectory']) {
    addFailure(failures, identity[key] === EXPECTED_IDENTITY[key], `${key} differs from TockTeam identity`)
  }
  addFailure(failures, sameJson(identity.protocols, EXPECTED_IDENTITY.protocols), 'protocol list differs from TockTeam identity')
  addFailure(failures, packageJson?.name === identity.packageName, 'package name differs from TockTeam identity')
  addFailure(failures, packageJson?.productName === identity.productName, 'product name differs from TockTeam identity')
  addFailure(failures, packageJson?.desktopName === identity.desktopName, 'desktop name differs from TockTeam identity')
  addFailure(failures, build.appId === identity.appId, 'app ID differs from TockTeam identity')
  addFailure(failures, build.productName === identity.productName, 'Builder product name differs from TockTeam identity')
  addFailure(failures, build.linux?.executableName === identity.executableName, 'Builder executable name differs from TockTeam identity')
  addFailure(failures, typeof mainSource === 'string' && mainSource.includes(`const PRODUCT_NAME = '${identity.productName}'`), 'Electron main display name differs from TockTeam identity')
  addFailure(failures, typeof mainSource === 'string' && mainSource.includes(`const DATA_DIRECTORY = '${identity.dataDirectory}'`), 'Electron main data directory differs from TockTeam identity')
  for (const protocol of identity.protocols ?? []) {
    addFailure(failures, typeof mainSource === 'string' && mainSource.includes(`setAsDefaultProtocolClient('${protocol}')`), `Electron main protocol registration is missing: ${protocol}`)
  }

  const packageIdentityValues = [
    packageJson?.name,
    packageJson?.productName,
    packageJson?.desktopName,
    build.appId,
    build.linux?.executableName,
    ...Object.values(identity),
  ].filter((value) => typeof value === 'string')
  const sourceIdentityValues = []
  for (const expression of [
    /\b(?:PRODUCT_NAME|DATA_DIRECTORY)\s*=\s*(['"`])([^'"`]*)\1/gu,
    /\b(?:partition|userData|appId|productName|executableName|dataDirectory|applicationName|applicationId|sessionName|sessionId|profileName|profileId)\s*(?:=|:)\s*(['"`])([^'"`]*)\1/gu,
    /\bsetPath\(\s*(['"`])[^'"`]*\1\s*,\s*(['"`])([^'"`]*)\2/gu,
    /\b(?:setName|fromPartition|setAsDefaultProtocolClient)\(\s*(['"`])([^'"`]*)\1/gu,
  ]) {
    for (const match of String(mainSource ?? '').matchAll(expression)) sourceIdentityValues.push(match[match.length - 1])
  }
  addFailure(
    failures,
    ![...packageIdentityValues, ...sourceIdentityValues].some((value) => FORBIDDEN_APPLICATION_IDENTITY.test(value)),
    'forbidden launcher identity leakage',
  )

  const targets = Array.isArray(contract?.targets) ? contract.targets : []
  addFailure(failures, sameJson(targets, EXPECTED_TARGETS), 'configured target matrix differs from TockTeam packaging')
  for (const target of targets) {
    const builderTarget = build[target.platform]?.target
    addFailure(failures, Array.isArray(builderTarget) && sameJson(builderTarget, target.formats), `Builder ${target.platform} target differs from the release contract`)
    addFailure(failures, Array.isArray(target.architectures) && target.architectures.length > 0, `${target.platform} target architecture metadata is missing`)
  }

  const resources = contract?.resources ?? {}
  addFailure(failures, build.asar === true && resources.asar === true, 'ASAR packaging must remain enabled')
  addFailure(failures, sameJson(packageJson?.files, resources.npmFiles), 'npm package files differ from the release contract')
  addFailure(failures, sameJson(build.files, resources.builderFiles), 'Builder application files differ from the release contract')
  addFailure(failures, sameJson(build.extraResources, resources.builderExtraResources), 'Builder extra resources differ from the release contract')
  const resourceSource = JSON.stringify({
    files: packageJson?.files,
    buildFiles: build.files,
    extraResources: build.extraResources,
    contractResources: resources,
  })
  addFailure(failures, !VENDOR_SOURCE.test(resourceSource), 'vendor/ueli must not ship in npm, Builder files, or Builder resources')

  const ueliRuntimeDependencies = new Set([
    ...Object.keys(vendorPackageJson?.dependencies ?? {}),
    ...Object.keys(vendorPackageJson?.optionalDependencies ?? {}),
  ])
  for (const [section, values] of Object.entries(packageJson ?? {})) {
    if (!/dependencies$/iu.test(section)) continue
    if (Array.isArray(values)) {
      for (const value of values) {
        addFailure(failures, typeof value !== 'string' || !VENDOR_SOURCE.test(value), `dependency value must not reference vendor/ueli: ${value}`)
        addFailure(failures, typeof value !== 'string' || !ueliRuntimeDependencies.has(value), `Ueli-derived dependency is admitted in package inputs: ${value}`)
      }
      continue
    }
    if (!values || typeof values !== 'object') continue
    for (const [dependencyName, version] of Object.entries(values)) {
      addFailure(failures, typeof version !== 'string' || !VENDOR_SOURCE.test(version), `dependency value must not reference vendor/ueli: ${dependencyName}@${version}`)
      addFailure(failures, !ueliRuntimeDependencies.has(dependencyName), `Ueli-derived dependency is admitted in package inputs: ${dependencyName}`)
    }
  }

  const foundation = contract?.foundation ?? {}
  addFailure(failures, foundation.launcherImplemented === true, 'launcher implementation must be recorded in foundation')
  addFailure(failures, foundation.launcherPackaged === false, 'launcher must not be packaged in foundation')
  addFailure(failures, Array.isArray(foundation.admittedRuntimeDependencies) && foundation.admittedRuntimeDependencies.length === 0, 'Ueli-derived runtime dependencies must remain empty')
  addFailure(failures, Array.isArray(foundation.runtimeDependencyClosure) && foundation.runtimeDependencyClosure.length === 0, 'runtime dependency closure must remain empty')
  addFailure(failures, Array.isArray(foundation.launcherAssets) && foundation.launcherAssets.length === 0, 'launcher asset admission must remain empty in foundation')
  addFailure(failures, Array.isArray(foundation.launcherNotices) && foundation.launcherNotices.length === 0, 'launcher notice admission must remain empty in foundation')
  addFailure(failures, foundation.shippedVendorSource === false, 'foundation must not ship vendor source')
  addFailure(failures, foundation.importedUeliIdentity === false, 'foundation must not import Ueli identity')
  addFailure(failures, sameJson(foundation, EXPECTED_FOUNDATION), 'foundation contract differs from the reviewed empty-launcher state')

  const integration = contract?.ueliIntegration ?? {}
  addFailure(failures, sameJson(integration, EXPECTED_UELI_INTEGRATION), 'Ueli integration admission differs from the reviewed empty-launcher state')

  const publication = contract?.publication ?? {}
  addFailure(failures, sameJson(publication.configuredTargets, EXPECTED_PUBLICATION.configuredTargets), 'configured publication targets differ from the release evidence')
  addFailure(failures, sameJson(publication.workflowArtifacts, EXPECTED_PUBLICATION.workflowArtifacts), 'workflow artifact evidence differs from the release evidence')
  addFailure(failures, Array.isArray(publication.launcherArtifacts) && publication.launcherArtifacts.length === 0, 'launcher publication evidence must remain empty in foundation')
  const publicationLabels = {
    installedArtifact: 'installed artifact',
    signed: 'signing',
    notarized: 'notarization',
    publicDistribution: 'public distribution',
  }
  for (const key of Object.keys(publicationLabels)) {
    addFailure(failures, publication[key] === false, `${publicationLabels[key]} evidence must remain false`)
  }
  addFailure(failures, sameJson(publication, EXPECTED_PUBLICATION), 'publication evidence contains an unapproved claim')

  validateNoticeLedger(inputs, failures)

  return {
    failures,
    summary: {
      packageName: identity.packageName,
      productName: identity.productName,
      appId: identity.appId,
      targets: targets.map(({ platform }) => platform),
      launcherImplemented: foundation.launcherImplemented,
      launcherPackaged: foundation.launcherPackaged,
      admittedRuntimeDependencies: foundation.admittedRuntimeDependencies,
    },
  }
}

export async function loadLauncherPackageFeasibilityInputs({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const contractPath = path.join(repoRoot, 'scripts/ueli/desktop-release-contract.json')
  const packagePath = path.join(repoRoot, 'package.json')
  const mainPath = path.join(repoRoot, 'src/main.ts')
  const contract = JSON.parse(await readFile(contractPath, 'utf8'))
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const noticeLedger = JSON.parse(await readFile(path.join(repoRoot, contract.noticeLedger), 'utf8'))
  const vendorPackageJson = JSON.parse(await readFile(path.join(repoRoot, 'vendor/ueli/package.json'), 'utf8'))
  const noticeContents = {}
  for (const entry of noticeLedger.entries ?? []) {
    const sources = Array.isArray(entry.source) ? entry.source : [entry.source]
    for (const source of sources) {
      try {
        noticeContents[source] = await readFile(path.join(repoRoot, source), 'utf8')
      } catch {
        noticeContents[source] = ''
      }
    }
  }
  return {
    contract,
    packageJson,
    mainSource: await readFile(mainPath, 'utf8'),
    vendorPackageJson,
    noticeLedger,
    noticeContents,
  }
}

async function main() {
  const repoRoot = DEFAULT_REPO_ROOT
  const result = inspectLauncherPackageFeasibility(await loadLauncherPackageFeasibilityInputs({ repoRoot }))
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else if (result.failures.length === 0) {
    console.log(`TockTeam Desktop package feasibility passed: launcherImplemented=${result.summary.launcherImplemented}; launcherPackaged=${result.summary.launcherPackaged}`)
  } else {
    for (const failure of result.failures) console.error(`- ${failure}`)
  }
  process.exitCode = result.failures.length === 0 ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
