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
const EXPECTED_LAUNCHER_DEPENDENCIES = Object.freeze({
  color: '4.2.3',
  'electron-updater': '6.8.3',
  'fast-xml-parser': '5.7.0',
  'fuse.js': '7.1.0',
  fuzzysort: '3.1.0',
  mathjs: '15.2.0',
  uuid: '14.0.0',
})
const EXPECTED_LAUNCHER_DEPENDENCY_LIST = Object.freeze(['color@4.2.3', 'fast-xml-parser@5.7.0', 'mathjs@15.2.0', 'uuid@14.0.0', 'fuse.js@7.1.0', 'fuzzysort@3.1.0', 'electron-updater@6.8.3'])
const EXPECTED_LAUNCHER_RUNTIME_CLOSURE = Object.freeze([
  '@babel/runtime@7.29.7',
  '@nodable/entities@2.1.1',
  'argparse@2.0.1',
  'builder-util-runtime@9.5.1',
  'color-convert@2.0.1',
  'color-name@1.1.4',
  'color-string@1.9.1',
  'color@4.2.3',
  'complex.js@2.4.3',
  'debug@4.4.3',
  'decimal.js@10.6.0',
  'electron-updater@6.8.3',
  'escape-latex@1.2.0',
  'fast-xml-builder@1.2.0',
  'fast-xml-parser@5.7.0',
  'fraction.js@5.3.4',
  'fs-extra@10.1.0',
  'fuse.js@7.1.0',
  'fuzzysort@3.1.0',
  'graceful-fs@4.2.11',
  'is-arrayish@0.3.4',
  'javascript-natural-sort@0.7.1',
  'js-yaml@4.3.1',
  'jsonfile@6.2.1',
  'lazy-val@1.0.5',
  'lodash.escaperegexp@4.1.2',
  'lodash.isequal@4.5.0',
  'mathjs@15.2.0',
  'ms@2.1.3',
  'path-expression-matcher@1.5.0',
  'sax@1.6.1',
  'seedrandom@3.0.5',
  'semver@7.7.4',
  'simple-swizzle@0.2.4',
  'strnum@2.2.3',
  'tiny-emitter@2.1.0',
  'tiny-typed-emitter@2.1.0',
  'typed-function@4.2.2',
  'universalify@2.0.1',
  'uuid@14.0.0',
  'xml-naming@0.1.0',
])
const EXPECTED_LAUNCHER_LOCKFILE = Object.freeze({
  path: 'pnpm-lock.yaml',
  rootImporter: Object.freeze({
    color: Object.freeze({ specifier: '4.2.3', version: '4.2.3' }),
    'fast-xml-parser': Object.freeze({ specifier: '5.7.0', version: '5.7.0' }),
    'mathjs': Object.freeze({ specifier: '15.2.0', version: '15.2.0' }),
    uuid: Object.freeze({ specifier: '14.0.0', version: '14.0.0' }),
    'fuse.js': Object.freeze({ specifier: '7.1.0', version: '7.1.0' }),
    fuzzysort: Object.freeze({ specifier: '3.1.0', version: '3.1.0' }),
    'electron-updater': Object.freeze({ specifier: '6.8.3', version: '6.8.3(supports-color@7.2.0)' }),
  }),
  packages: Object.freeze({
    '@nodable/entities@2.1.1': Object.freeze({ integrity: 'sha512-Pig3HxDIoMgjdEH8OCf/dkcTmLFjJRjWuq8jSnklu284/TKOPibSRERmOykiwmyXTtv61mP+44f3GMx0tLAyjg==' }),
    'fast-xml-builder@1.2.0': Object.freeze({ integrity: 'sha512-00aAWieqff+ZJhsXA4g1g7M8k+7AYoMUUHF+/zFb5U6Uv/P0Vl4QZo84/IcufzYalLuEj9928bXN9PbbFzMF0Q==' }),
    'path-expression-matcher@1.5.0': Object.freeze({ integrity: 'sha512-cbrerZV+6rvdQrrD+iGMcZFEiiSrbv9Tfdkvnusy6y0x0GKBXREFg/Y65GhIfm0tnLntThhzCnfKwp1WRjeCyQ==' }),
    'strnum@2.2.3': Object.freeze({ integrity: 'sha512-oKx6RUCuHfT3oyVjtnrmn19H1SiCqgJSg+54XqURKp5aCMbrXrhLjRN9TjuwMjiYstZ0MzDrHqkGZ5dFTKd+zg==' }),
    'xml-naming@0.1.0': Object.freeze({ integrity: 'sha512-k8KO9hrMyNk6tUWqUfkTEZbezRRpONVOzUTnc97VnCvyj6Tf9lyUR9EDAIeiVLv56jsMcoXEwjW8Kv5yPY52lw==' }),
    'color@4.2.3': Object.freeze({ integrity: 'sha512-1rXeuUUiGGrykh+CeBdu5Ie7OJwinCgQY0bc7GCRxy5xVHy+moaqkpL/jqQq0MtQOeYcrqEz4abc5f0KtU7W4A==' }),
    'fast-xml-parser@5.7.0': Object.freeze({ integrity: 'sha512-MTcrUoRQ1GSQ9iG3QJzBGquYYYeA7piZaJoIWbPFGbRn6Jj6z7xgoAyi4DrZX4y2ZIQQBF59gc/zmvvejjgoFQ==' }),
    'mathjs@15.2.0': Object.freeze({ integrity: 'sha512-UAQzSVob9rNLdGpqcFMYmSu9dkuLYy7Lr2hBEQS5SHQdknA9VppJz3cy2KkpMzTODunad6V6cNv+5kOLsePLow==' }),
    'uuid@14.0.0': Object.freeze({ integrity: 'sha512-Qo+uWgilfSmAhXCMav1uYFynlQO7fMFiMVZsQqZRMIXp0O7rR7qjkj+cPvBHLgBqi960QCoo/PH2/6ZtVqKvrg==' }),
    'fuse.js@7.1.0': Object.freeze({ integrity: 'sha512-trLf4SzuuUxfusZADLINj+dE8clK1frKdmqiJNb1Es75fmI5oY6X2mxLVUciLLjxqw/xr72Dhy+lER6dGd02FQ==' }),
    'fuzzysort@3.1.0': Object.freeze({ integrity: 'sha512-sR9BNCjBg6LNgwvxlBd0sBABvQitkLzoVY9MYYROQVX/FvfJ4Mai9LsGhDgd8qYdds0bY77VzYd5iuB+v5rwQQ==' }),
    'electron-updater@6.8.3': Object.freeze({ integrity: 'sha512-Z6sgw3jgbikWKXei1ENdqFOxBP0WlXg3TtKfz0rgw2vIZFJUyI4pD7ZN7jrkm7EoMK+tcm/qTnPUdqfZukBlBQ==' }),
  }),
  snapshots: Object.freeze({
    '@nodable/entities@2.1.1': Object.freeze({}),
    'fast-xml-builder@1.2.0': Object.freeze({ dependencies: Object.freeze({ 'path-expression-matcher': '1.5.0', 'xml-naming': '0.1.0' }) }),
    'path-expression-matcher@1.5.0': Object.freeze({}),
    'strnum@2.2.3': Object.freeze({}),
    'xml-naming@0.1.0': Object.freeze({}),
    'color@4.2.3': Object.freeze({ dependencies: Object.freeze({ 'color-convert': '2.0.1', 'color-string': '1.9.1' }) }),
    'fast-xml-parser@5.7.0': Object.freeze({ dependencies: Object.freeze({ '@nodable/entities': '2.1.1', 'fast-xml-builder': '1.2.0', 'path-expression-matcher': '1.5.0', strnum: '2.2.3' }) }),
    'mathjs@15.2.0': Object.freeze({ dependencies: Object.freeze({ '@babel/runtime': '7.29.7', 'complex.js': '2.4.3', 'decimal.js': '10.6.0', 'escape-latex': '1.2.0', 'fraction.js': '5.3.4', 'javascript-natural-sort': '0.7.1', seedrandom: '3.0.5', 'tiny-emitter': '2.1.0', 'typed-function': '4.2.2' }) }),
    'uuid@14.0.0': Object.freeze({}),
    'fuse.js@7.1.0': Object.freeze({}),
    'fuzzysort@3.1.0': Object.freeze({}),
    'electron-updater@6.8.3(supports-color@7.2.0)': Object.freeze({
      dependencies: Object.freeze({
        'builder-util-runtime': '9.5.1(supports-color@7.2.0)',
        'fs-extra': '10.1.0',
        'js-yaml': '4.3.1',
        'lazy-val': '1.0.5',
        'lodash.escaperegexp': '4.1.2',
        'lodash.isequal': '4.5.0',
        semver: '7.7.4',
        'tiny-typed-emitter': '2.1.0',
      }),
      transitivePeerDependencies: Object.freeze(['supports-color']),
    }),
  }),
})
const EXPECTED_FOUNDATION = Object.freeze({
  launcherImplemented: true,
  launcherPackaged: false,
  admittedRuntimeDependencies: EXPECTED_LAUNCHER_DEPENDENCY_LIST,
  runtimeDependencyClosure: EXPECTED_LAUNCHER_RUNTIME_CLOSURE,
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
  admittedRuntimeDependencies: EXPECTED_LAUNCHER_DEPENDENCY_LIST,
  runtimeDependencyClosure: EXPECTED_LAUNCHER_RUNTIME_CLOSURE,
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function validateLauncherLockfile(lockfile, lockfileText, failures) {
  addFailure(failures, sameJson(lockfile, EXPECTED_LAUNCHER_LOCKFILE), 'launcher lockfile contract differs from the reviewed exact dependency evidence')
  if (typeof lockfileText !== 'string') {
    failures.push('launcher lockfile text is unavailable')
    return
  }
  addFailure(failures, /^lockfileVersion: '9\.0'$/mu.test(lockfileText), 'launcher lockfile version differs from pnpm 9 evidence')
  const importer = lockfileText.match(/^importers:\n\n  \.:([\s\S]*?)^packages:\n/m)?.[1] ?? ''
  const dependencies = importer.match(/^    dependencies:\n([\s\S]*?)^    devDependencies:/m)?.[1] ?? ''
  for (const [name, values] of Object.entries(EXPECTED_LAUNCHER_LOCKFILE.rootImporter)) {
    const packageKey = escapeRegExp(name)
    const specifier = escapeRegExp(values.specifier)
    const version = escapeRegExp(values.version)
    addFailure(
      failures,
      new RegExp(`^      ${packageKey}:\n        specifier: ${specifier}\n        version: ${version}$`, 'mu').test(dependencies),
      `launcher lockfile root importer differs for ${name}`,
    )
  }
  const packages = lockfileText.match(/^packages:\n([\s\S]*?)^snapshots:\n/m)?.[1] ?? ''
  for (const [name, values] of Object.entries(EXPECTED_LAUNCHER_LOCKFILE.packages)) {
    const packageKey = escapeRegExp(name)
    const integrity = escapeRegExp(values.integrity)
    addFailure(
      failures,
      new RegExp(`^  '?${packageKey}'?:\n    resolution: \\{integrity: ${integrity}\\}$`, 'mu').test(packages),
      `launcher lockfile package resolution differs for ${name}`,
    )
  }
  const snapshots = lockfileText.match(/^snapshots:\n([\s\S]*)$/m)?.[1] ?? ''
  for (const [name, expected] of Object.entries(EXPECTED_LAUNCHER_LOCKFILE.snapshots)) {
    if (Object.keys(expected).length === 0) {
      addFailure(
        failures,
        new RegExp(`^  '?${escapeRegExp(name)}'?: \\{\\}$`, 'mu').test(snapshots),
        `launcher lockfile snapshot is not empty for ${name}`,
      )
      continue
    }
    const block = `${snapshots}\n  __launcher_lockfile_end__: {}`.match(new RegExp(`^  '?${escapeRegExp(name)}'?:\\n([\\s\\S]*?)(?=^  \\S)`, 'mu'))?.[1] ?? ''
    for (const [dependency, version] of Object.entries(expected.dependencies ?? {})) {
      addFailure(
        failures,
        new RegExp(`^    dependencies:\\n(?:      .*\\n)*      '?${escapeRegExp(dependency)}'?: ${escapeRegExp(version)}$`, 'mu').test(block),
        `launcher lockfile snapshot dependency differs for ${name}: ${dependency}`,
      )
    }
    for (const peer of expected.transitivePeerDependencies ?? []) {
      addFailure(
        failures,
        new RegExp(`^    transitivePeerDependencies:\\n(?:      .*\\n)*      - ${escapeRegExp(peer)}$`, 'mu').test(block),
        `launcher lockfile snapshot peer differs for ${name}: ${peer}`,
      )
    }
  }
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
  const { contract, lockfileText, packageJson, vendorPackageJson, mainSource } = inputs
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

  addFailure(failures, sameJson(packageJson?.dependencies, EXPECTED_LAUNCHER_DEPENDENCIES), 'launcher dependencies differ from the approved direct search set')
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
      const approvedVersion = EXPECTED_LAUNCHER_DEPENDENCIES[dependencyName]
      addFailure(
        failures,
        approvedVersion === undefined
          ? !ueliRuntimeDependencies.has(dependencyName)
          : version === approvedVersion,
        approvedVersion === undefined
          ? `Ueli-derived dependency is admitted in package inputs: ${dependencyName}`
          : `approved launcher dependency version differs: ${dependencyName}@${version}`,
      )
    }
  }

  validateLauncherLockfile(contract?.launcherLockfile, lockfileText, failures)

  const foundation = contract?.foundation ?? {}
  addFailure(failures, foundation.launcherImplemented === true, 'launcher implementation must be recorded in foundation')
  addFailure(failures, foundation.launcherPackaged === false, 'launcher must not be packaged in foundation')
  addFailure(failures, sameJson(foundation.admittedRuntimeDependencies, EXPECTED_LAUNCHER_DEPENDENCY_LIST), 'Ueli-derived runtime dependencies differ from the approved launcher set')
  addFailure(failures, sameJson(foundation.runtimeDependencyClosure, EXPECTED_LAUNCHER_RUNTIME_CLOSURE), 'runtime dependency closure differs from the approved launcher set')
  addFailure(failures, Array.isArray(foundation.launcherAssets) && foundation.launcherAssets.length === 0, 'launcher asset admission must remain empty in foundation')
  addFailure(failures, Array.isArray(foundation.launcherNotices) && foundation.launcherNotices.length === 0, 'launcher notice admission must remain empty in foundation')
  addFailure(failures, foundation.shippedVendorSource === false, 'foundation must not ship vendor source')
  addFailure(failures, foundation.importedUeliIdentity === false, 'foundation must not import Ueli identity')
  addFailure(failures, sameJson(foundation, EXPECTED_FOUNDATION), 'foundation contract differs from the reviewed empty-launcher state')

  const integration = contract?.ueliIntegration ?? {}
  addFailure(failures, sameJson(integration, EXPECTED_UELI_INTEGRATION), 'Ueli integration admission differs from the reviewed launcher state')

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
  const lockfileText = await readFile(path.join(repoRoot, contract.launcherLockfile.path), 'utf8')
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
    lockfileText,
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
