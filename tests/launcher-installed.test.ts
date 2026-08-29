import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  inspectInstalledEvidenceCatalog,
  inspectInstalledEvidenceWorkflow,
} from '../scripts/ueli/installed-evidence.mjs'
import { inspectInstalledReport } from '../scripts/check-installed-report.mjs'
import {
  PACKAGED_PREPARATION_PLAN,
  canonicalPath,
  inspectExtraResources,
  parseWindowsGitPaths,
  pathContained,
  prepareSmokeEnvironmentRoots,
  selectCdpDescriptor,
  selectWindowsGitPath,
  smokeEnvironment,
  trustedPathEntries,
  windowsCdpListenerOwned,
} from '../scripts/launcher-packaged-smoke.mjs'
import { replaceWindowsPortableArchive, WINDOWS_PORTABLE_MARKER } from '../scripts/install-windows.mjs'
import {
  installerBuildPlan,
  normalizePortableManifestPath,
  PORTABLE_MANIFEST_MAX_ENTRIES,
  windowsPortableArchiveArgs,
  writeWindowsPortableManifest,
} from '../scripts/launcher-installed-smoke.mjs'

const root = join(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>
}
const packagedSmoke = readFileSync(join(root, 'scripts', 'launcher-packaged-smoke.mjs'), 'utf8')
const installedSmoke = readFileSync(join(root, 'scripts', 'launcher-installed-smoke.mjs'), 'utf8')
const cleanup = readFileSync(join(root, 'scripts', 'process-cleanup.mjs'), 'utf8')
const releaseWorkflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8').replace(/\r\n?/gu, '\n')
const installedWorkflow = readFileSync(join(root, '.github', 'workflows', 'tocklauncher-installed.yml'), 'utf8').replace(/\r\n?/gu, '\n')
const catalog = JSON.parse(readFileSync(join(root, 'scripts', 'ueli', 'installed-evidence-catalog.json'), 'utf8')) as {
  schemaVersion: number
  issue: string
  publication: Record<string, boolean>
  rows: Array<{ id: string; platform: string; owner: string; required: boolean; state: string; evidence?: Record<string, string> | null }>
}

test('TockTeam exposes an executable installed-artifact smoke and audit', () => {
  assert.equal(typeof packageJson.scripts?.['test:launcher:installed'], 'string')
  assert.equal(typeof packageJson.scripts?.['audit:installed-evidence'], 'string')
  assert.match(installedSmoke, /replaceMacBundle/u)
  assert.match(installedSmoke, /TOCKTEAM_INSTALLED_SMOKE/u)
  assert.match(installedSmoke, /rollback|reinstall/iu)
  assert.match(installedSmoke, /unsigned|notarized/iu)
  assert.match(installedSmoke, /cp.*-cR/u)
  assert.match(installedSmoke, /ENOSPC/u)
  assert.match(installedSmoke, /TOCKTEAM_RESOURCES_ROOT/u)
  assert.match(installedSmoke, /DSH_SOURCE/u)
  assert.match(installedSmoke, /electronVersion/u)
  assert.match(installedSmoke, /portableArchive|replaceWindowsPortableArchive/u)
  assert.match(installedSmoke, /tar\.exe/u)
  assert.match(installedSmoke, /dpkg-query/u)
  assert.match(installedSmoke, /\/usr\/bin\/dpkg/u)
  assert.match(installedSmoke, /--install/u)
  assert.match(installedSmoke, /--purge/u)
  assert.match(installedSmoke, /post-install|inspectPackage/u)
  assert.doesNotMatch(installedSmoke, /\bnsis\b/iu)
  assert.match(installedSmoke, /detached:\s*(?:true|process\.platform)/u)
})

test('installed smoke selects only the loopback descriptor and atomically replaces portable archives', async () => {
  const pages = [
    { title: 'TockCoder', webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/wrong-port' },
    { title: 'Other', webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/page/right-port' },
    { title: 'TockCoder', webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/page/right-title' },
  ]
  assert.equal(selectCdpDescriptor(pages, 'TockCoder', 1234)?.webSocketDebuggerUrl, pages[2]!.webSocketDebuggerUrl)
  assert.equal(selectCdpDescriptor(pages, 'TockCoder', 7777), undefined)
  assert.equal(windowsCdpListenerOwned('  TCP    127.0.0.1:1234    0.0.0.0:0    LISTENING    42\n', 42, 1234), true)
  assert.equal(windowsCdpListenerOwned('  TCP    127.0.0.1:1234    0.0.0.0:0    LISTENING    41\n', 42, 1234), false)
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-portable-artifact-'))
  try {
    const archive = join(rootPath, 'TockTeam-Desktop-0.1.14-x64.zip')
    const destination = join(rootPath, 'installed')
    const backupDirectory = join(rootPath, 'backup')
    await writeFile(archive, 'portable archive')
    const extracted = []
    const extractArchive = async (_source: string, pending: string) => {
      assert.equal((await stat(pending)).isDirectory(), true)
      extracted.push(pending)
      await mkdir(join(pending, 'win-unpacked'), { recursive: true })
      await writeFile(join(pending, '.tockteam-portable.json'), '{"version":"0.1.14"}')
      await writeFile(join(pending, 'win-unpacked', 'TockTeam Desktop.exe'), '')
    }
    const validateInstall = async (path: string) => {
      assert.equal((await stat(join(path, '.tockteam-portable.json'))).isFile(), true)
      assert.equal((await stat(join(path, 'win-unpacked', 'TockTeam Desktop.exe'))).isFile(), true)
    }
    const result = await replaceWindowsPortableArchive({ archive, destination, backupDirectory, extractArchive, validateInstall })
    assert.equal(result.destination, destination)
    assert.equal(extracted.length, 1)
    await assert.rejects(replaceWindowsPortableArchive({ archive, destination, backupDirectory, extractArchive, validateInstall: async path => { await validateInstall(path); if (resolve(path) === resolve(destination)) throw new Error('rollback') } }), /rollback/u)
    assert.equal((await stat(join(destination, 'win-unpacked', 'TockTeam Desktop.exe'))).isFile(), true)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('packaged smoke resolves Windows git safely and prepares fresh workspaces in dependency order', () => {
  assert.deepEqual(
    PACKAGED_PREPARATION_PLAN.map(step => [step.name, ...step.args]),
    [
      ['root-build', 'run', 'build'],
      ['dsh-build', 'run', 'build:dsh'],
      ['tocktutor-install', '-C', 'plugins/tocktutor', 'install', '--frozen-lockfile'],
      ['tocktutor-build', 'run', 'build:tocktutor'],
      ['runtime-stage', 'run', 'stage:dsh'],
    ],
  )
  const parsed = parseWindowsGitPaths('INFO: ignored\r\nrelative\\git.exe\nC:\\Program Files\\Git\\cmd\\git.EXE\r\nD:/Git/cmd/git.exe\n')
  assert.deepEqual(parsed, ['C:\\Program Files\\Git\\cmd\\git.EXE', 'D:/Git/cmd/git.exe'])
  assert.equal(selectWindowsGitPath({
    whereOutput: 'C:\\untrusted\\git.exe\r\n',
    fallbackPaths: ['C:\\Program Files\\Git\\cmd\\git.exe'],
    isFile: candidate => candidate === 'C:\\Program Files\\Git\\cmd\\git.exe',
  }), 'C:\\Program Files\\Git\\cmd\\git.exe')
  assert.equal(selectWindowsGitPath({
    whereOutput: 'relative\\git.exe\n',
    fallbackPaths: ['relative\\git.exe'],
    isFile: () => true,
  }), undefined)
})

test('Windows portable manifests are finite and skip symlink cycles', { skip: process.platform === 'win32' }, async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-portable-manifest-'))
  try {
    const outputDir = join(rootPath, 'output')
    const resources = join(outputDir, 'win-unpacked', 'resources')
    await mkdir(resources, { recursive: true })
    await writeFile(join(resources, 'app.asar'), 'payload')
    await writeFile(join(outputDir, WINDOWS_PORTABLE_MARKER), '{}\n')
    await symlink(outputDir, join(resources, 'cycle'), 'dir')
    const manifestPath = join(rootPath, 'portable-manifest.txt')
    const entries = await writeWindowsPortableManifest(outputDir, manifestPath)
    const manifest = await readFile(manifestPath, 'utf8')
    assert.ok(entries.includes('win-unpacked'))
    assert.ok(entries.includes('win-unpacked/resources/app.asar'))
    assert.ok(entries.includes(WINDOWS_PORTABLE_MARKER))
    assert.equal(entries.filter(entry => entry === 'win-unpacked/resources/cycle').length, 1)
    assert.equal(manifest.split('\n').filter(entry => entry === 'win-unpacked/resources/cycle').length, 1)
    assert.throws(() => normalizePortableManifestPath('../escape'), /relative/u)
    assert.throws(() => normalizePortableManifestPath('C:\\escape'), /relative/u)
    assert.throws(() => normalizePortableManifestPath('win-unpacked/bad\nname'), /newline/u)
    assert.equal(PORTABLE_MANIFEST_MAX_ENTRIES, 500_000)
    await assert.rejects(writeWindowsPortableManifest(outputDir, manifestPath, { maxEntries: 2 }), /exceeds 2 entries/u)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('Windows installer uses one multi-format build plan without publishing', () => {
  const target = { key: 'linux' }
  const plan = installerBuildPlan(target, ['deb', 'AppImage'], { linux: { target: ['dir'] } })
  assert.deepEqual(plan.formats, ['deb', 'AppImage'])
  assert.deepEqual(plan.config.linux.target, ['deb', 'AppImage'])
  assert.equal(Object.hasOwn(plan.config, 'publish'), false)
  assert.equal(plan.config.electronVersion.length > 0, true)
})

test('Windows portable archive uses a bounded relative manifest', () => {
  assert.deepEqual(windowsPortableArchiveArgs({
    archive: 'C:\\tmp\\portable.zip',
    outputDir: 'C:\\tmp\\output',
    manifestPath: 'C:\\tmp\\portable-manifest.txt',
  }), [
    '-a', '-c', '-f', 'C:\\tmp\\portable.zip',
    '--no-recursion', '-C', 'C:\\tmp\\output', '-T', 'C:\\tmp\\portable-manifest.txt',
  ])
})

test('launched smoke environments use disposable user roots and bounded tools', () => {
  const environment = smokeEnvironment({ NODE_OPTIONS: '--require=evil', NODE_PATH: '/tmp/evil', PATH: '/tmp/evil' }, '/tmp/tockteam-smoke-root')
  assert.equal(environment.NODE_OPTIONS, undefined)
  assert.equal(environment.NODE_PATH, undefined)
  assert.equal(environment.HOME, '/tmp/tockteam-smoke-root/home')
  assert.equal(environment.USERPROFILE, '/tmp/tockteam-smoke-root/home')
  assert.equal(environment.XDG_CONFIG_HOME, '/tmp/tockteam-smoke-root/xdg/config')
  assert.equal(environment.XDG_DATA_DIRS, '/tmp/tockteam-smoke-root/xdg/data-dirs')
  assert.equal(environment.TMPDIR, '/tmp/tockteam-smoke-root/tmp')
  assert.equal(environment.TEMP, '/tmp/tockteam-smoke-root/tmp')
  assert.equal(environment.TMP, '/tmp/tockteam-smoke-root/tmp')
  const pathSeparator = process.platform === 'win32' ? ';' : ':'
  const pathEntries = environment.PATH?.split(pathSeparator) ?? []
  const nodeDirectory = dirname(process.execPath)
  assert.ok(pathEntries.some(directory => join(directory, basename(process.execPath)) === process.execPath))
  assert.equal(pathEntries.filter(directory => directory === nodeDirectory).length, 1)
  const localBin = join(root, 'node_modules', '.bin')
  assert.ok(pathEntries.includes(localBin))
  assert.equal(pathEntries.filter(directory => directory === localBin).length, 1)
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const systemDirectories = process.platform === 'win32'
    ? [join(systemRoot, 'System32'), systemRoot, join(systemRoot, 'System32', 'Wbem'), join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0')]
    : ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  for (const directory of systemDirectories) assert.ok(pathEntries.includes(directory))
  const simulatedWindows = trustedPathEntries({
    platform: 'win32',
    nodeDirectory: 'C:\\Node',
    repositoryRoot: 'C:\\repo',
    systemRoot: 'C:\\Windows',
    gitExecutable: 'C:\\Program Files\\Git\\cmd\\git.exe',
  })
  assert.equal(simulatedWindows.filter(directory => directory === 'C:\\repo\\node_modules\\.bin').length, 1)
  assert.equal(simulatedWindows.filter(directory => directory === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0').length, 1)
})

test('packaged smoke creates every disposable environment root before a launch', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-smoke-roots-'))
  const disposableRoot = join(rootPath, 'nested', 'smoke')
  try {
    const expected = smokeEnvironment({}, disposableRoot)
    const created = await prepareSmokeEnvironmentRoots(disposableRoot)
    const configured = ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_DATA_DIRS', 'TMPDIR', 'TEMP', 'TMP']
      .map(key => expected[key])
      .filter((path): path is string => path !== undefined)
    assert.deepEqual(new Set(created), new Set(configured))
    for (const path of created) assert.equal((await stat(path)).isDirectory(), true)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('canonical path helpers resolve aliases and fail closed for invalid paths', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-canonical-path-'))
  try {
    const actualRoot = join(rootPath, 'real')
    const actualApp = join(actualRoot, 'Contents', 'Resources', 'app.asar')
    await mkdir(join(actualRoot, 'Contents', 'Resources'), { recursive: true })
    await writeFile(actualApp, '')
    const actualCanonical = await canonicalPath(actualApp)
    assert.ok(actualCanonical)
    assert.equal(await pathContained(actualRoot, actualApp), true)
    assert.equal(await canonicalPath(''), undefined)
    assert.equal(await pathContained('', actualApp), false)
    if (process.platform !== 'win32') {
      const aliasRoot = join(rootPath, 'alias')
      await symlink(actualRoot, aliasRoot, 'dir')
      const aliasApp = join(aliasRoot, 'Contents', 'Resources', 'app.asar')
      assert.equal(await canonicalPath(aliasApp), actualCanonical)
      assert.equal(await pathContained(aliasRoot, aliasApp), true)
      assert.equal(await pathContained(aliasRoot, join(rootPath, 'outside', 'app.asar')), false)
    }
    if (process.platform === 'darwin') assert.equal(await canonicalPath('/var'), await canonicalPath('/private/var'))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('package smoke is hermetic and verifies resources plus process ownership', () => {
  for (const key of ['TOCKTEAM_RESOURCES_ROOT', 'TOCKTEAM_WEB_ROOT', 'TOCKTEAM_SOURCE_ROOT', 'DSH_SOURCE', 'DSH_HOME']) {
    assert.match(packagedSmoke, new RegExp(key, 'u'))
  }
  assert.match(packagedSmoke, /sha256/iu)
  assert.match(packagedSmoke, /builderExtraResources/u)
  assert.match(packagedSmoke, /lstat/u)
  assert.match(packagedSmoke, /4_096/u)
  assert.doesNotMatch(packagedSmoke, /500_000/u)
  assert.match(packagedSmoke, /remote-debugging-address=127\.0\.0\.1/u)
  assert.match(packagedSmoke, /productJson\.productName|packageJson\.productName/u)
  assert.match(packagedSmoke, /stopChildProcess/u)
  assert.doesNotMatch(packagedSmoke, /spawnOptions\.shell\s*=\s*true/u)
  assert.match(cleanup, /taskkill/iu)
  assert.match(cleanup, /process\.kill\(-/u)
  assert.match(cleanup, /assertProcessTreeGone/u)
})

test('extra-resource inspection is bounded and never follows symlink cycles', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-extra-resource-limit-'))
  try {
    await mkdir(join(rootPath, 'dsh-runtime'), { recursive: true })
    await mkdir(join(rootPath, 'node-runtime'), { recursive: true })
    await mkdir(join(rootPath, 'lib', 'tockteam'), { recursive: true })
    await mkdir(join(rootPath, 'bin'), { recursive: true })
    for (const file of ['tockteam-desktop.png', 'lib/tockteam/cli.js', 'lib/tockteam/package.json', 'bin/tockteam', 'bin/tockteam.cmd']) await writeFile(join(rootPath, file), '')
    for (let index = 0; index < 4_100; index += 1) await writeFile(join(rootPath, `bounded-${String(index)}`), '')
    await symlink(rootPath, join(rootPath, 'dsh-runtime', 'cycle'))
    const result = await inspectExtraResources(join(rootPath, 'app.asar'))
    assert.equal(result.checkedEntries, 4096)
    assert.deepEqual(result.vendorScan, { scope: 'bounded-no-follow', maxDepth: 2, maxEntries: 4096, checkedEntries: result.checkedEntries, forbiddenSourceFound: false })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('installed evidence catalog owns the exact platform rows and rejects fabricated local proof', () => {
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.issue, 'tockteam-tl.15')
  assert.deepEqual(Object.keys(catalog.publication).sort(), ['installedArtifact', 'notarized', 'publicDistribution', 'signed'])
  assert.deepEqual(Object.values(catalog.publication), [false, false, false, false])
  const expectedIds = [
    'macOS:artifact-build', 'macOS:identity-and-resources', 'macOS:notices-and-bounded-vendor-scan',
    'macOS:ad-hoc-signature', 'macOS:security-and-workbench', 'macOS:launcher-action',
    'macOS:settings-session-compatibility', 'macOS:reinstall-settings', 'macOS:rollback',
    'macOS:provider-catalog', 'macOS:permissions-and-cleanup', 'macOS:shortcut-second-instance',
    'Windows:portable-archive-install', 'Windows:identity-resources-notices', 'Windows:security-action-settings',
    'Windows:notices-and-bounded-vendor-scan', 'Windows:control-panel-terminal-elevation',
    'Windows:reinstall-rollback-cleanup', 'Windows:shortcut-second-instance-permissions',
    'Linux:deb-install', 'Linux:appimage-install', 'Linux:identity-resources-notices',
    'Linux:notices-and-bounded-vendor-scan', 'Linux:security-action-settings', 'Linux:file-search-custom-browser',
    'Linux:reinstall-rollback-cleanup', 'Linux:shortcut-second-instance-permissions',
  ]
  assert.deepEqual(catalog.rows.map(row => row.id), expectedIds)
  assert.equal(catalog.rows.length, 27)
  const localMacRows = new Set([
    'macOS:artifact-build', 'macOS:identity-and-resources', 'macOS:ad-hoc-signature',
    'macOS:security-and-workbench', 'macOS:launcher-action', 'macOS:settings-session-compatibility',
    'macOS:reinstall-settings', 'macOS:rollback', 'macOS:permissions-and-cleanup',
  ])
  const partialMacRows = new Set(['macOS:notices-and-bounded-vendor-scan', 'macOS:provider-catalog'])
  for (const row of catalog.rows) {
    assert.ok(row.id && row.platform && row.owner && row.state)
    if (row.required) assert.notEqual(row.owner, 'unowned')
    const expectedState = localMacRows.has(row.id) ? 'local-verified' : partialMacRows.has(row.id) ? 'partially-verified' : 'workflow-required'
    assert.equal(row.state, expectedState)
    if (expectedState === 'workflow-required') assert.equal(row.evidence, null)
    else {
      assert.equal(row.evidence?.platform, 'darwin')
      assert.equal(row.evidence?.commit, 'afe16ea4f22c102014a943c8c3267e0fe564e36d')
      assert.equal(row.evidence?.reportSha256, '2ae01ad484522ae2b1c63feb04e106b9e2279083dcdb5a2d5e5dbd19ccecfe84')
      assert.equal(row.evidence?.reference, '.beads/reports/tocklauncher-installed-macos-arm64.json')
    }
  }
  assert.deepEqual(new Set(catalog.rows.map(row => row.platform)), new Set(['macOS', 'Windows', 'Linux']))
  assert.deepEqual(inspectInstalledEvidenceCatalog({ ...catalog, rows: catalog.rows.slice(1) }).failures.filter(failure => failure.includes('required installed evidence row is missing')), ['required installed evidence row is missing: macOS:artifact-build'])
  const invalidPlatform = structuredClone(catalog)
  invalidPlatform.rows[0]!.platform = 'Linux'
  assert.ok(inspectInstalledEvidenceCatalog(invalidPlatform).failures.some(failure => failure.includes('platform does not match')))
  const invalidOwner = structuredClone(catalog)
  invalidOwner.rows[0]!.owner = 'reports/fabricated.md'
  assert.ok(inspectInstalledEvidenceCatalog(invalidOwner).failures.some(failure => failure.includes('owner is not an approved source')))
  const swappedOwner = structuredClone(catalog)
  swappedOwner.rows.find(row => row.id === 'Windows:portable-archive-install')!.owner = 'scripts/launcher-installed-smoke.mjs'
  assert.ok(inspectInstalledEvidenceCatalog(swappedOwner).failures.some(failure => failure.includes('owner is incorrect')))
  const fabricated = structuredClone(catalog)
  const shortcut = fabricated.rows.find(row => row.id === 'macOS:shortcut-second-instance')
  assert.ok(shortcut)
  shortcut.state = 'local-verified'
  shortcut.evidence = { kind: 'checked-in-report', platform: 'darwin', commit: 'a'.repeat(40), version: '0.1.14', identity: 'ai.deepseek.tockteam-desktop', result: 'passed', reference: '.beads/reports/fabricated.json', reportSha256: 'b'.repeat(64) }
  assert.ok(inspectInstalledEvidenceCatalog(fabricated).failures.some(failure => failure.includes('report is missing')))
  const traversal = structuredClone(catalog)
  const promoted = traversal.rows.find(row => row.id === 'macOS:artifact-build')!
  promoted.evidence!.reference = '.beads/reports/../package.json'
  assert.ok(inspectInstalledEvidenceCatalog(traversal).failures.some(failure => failure.includes('not checked in')))
})

test('installed report validation requires complete platform lifecycle evidence', () => {
  const appPath = '/tmp/install/win-unpacked/resources/app.asar'
  const roots = ['dsh-runtime', 'node-runtime', 'tockteam-desktop.png', 'lib/tockteam/cli.js', 'lib/tockteam/package.json', 'bin/tockteam', 'bin/tockteam.cmd']
  const packageInventory = { version: '0.1.14', appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', assetCount: 65, assetsVerified: true, noticesVerified: true, appPathUsesAsar: true, appPath, extraResources: { roots }, vendorScan: { scope: 'bounded-no-follow', maxDepth: 2, maxEntries: 4096, checkedEntries: 114, forbiddenSourceFound: false, launcherSourceAbsent: true } }
  const renderer = { security: { appPath }, launcher: { notificationPermission: 'denied' } }
  const report = {
    result: 'passed', sourceCommit: 'a'.repeat(40), version: '0.1.14', appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', platform: 'win32',
    cleanup: { temporaryInstallRemoved: true, processTreesGone: true },
    installed: {
      portableArchive: { path: '/tmp/TockTeam-Desktop-0.1.14-x64.zip', format: 'zip', version: '0.1.14' }, installRoot: '/tmp/install', package: packageInventory, renderer,
      reinstall: { package: packageInventory, settings: { restored: 0.6, runtimeReady: 'ready' } }, secondInstance: { singleInstance: true, permissions: 'renderer-permission-denied' }, rollback: { preservedAsarSha256: 'b'.repeat(64), validationFailureRecovered: true }, cleanup: { installRootRemoved: true },
    },
  }
  const expected = { appId: 'ai.deepseek.tockteam-desktop', platform: 'win32', productName: 'TockTeam Desktop', version: '0.1.14' }
  assert.equal(inspectInstalledReport(report, expected).failures.length, 0)
  assert.ok(inspectInstalledReport({ ...report, result: 'failed' }, expected).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, reinstall: undefined } }, expected).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, package: { ...packageInventory, vendorScan: undefined } } }, expected).failures.length > 0)
  const linuxPackage = { ...packageInventory, appPath: '/tmp/deb-root/opt/TockTeam Desktop/resources/app.asar' }
  const linuxRenderer = { security: { appPath: linuxPackage.appPath }, launcher: { notificationPermission: 'denied' } }
  const linuxReport = { ...report, platform: 'linux', installed: { deb: { artifact: '/tmp/TockTeam-Desktop.deb', installRoot: '/tmp/deb-root', package: linuxPackage, renderer: linuxRenderer, reinstall: { package: linuxPackage, settings: { restored: 0.6, runtimeReady: 'ready' } }, secondInstance: { singleInstance: true, permissions: 'renderer-permission-denied' }, rollback: { state: 'workflow-required' }, uninstall: 'dpkg-purge-passed' }, appImage: { artifact: '/tmp/TockTeam-Desktop.AppImage', installRoot: '/tmp/appimage-root', package: { ...linuxPackage, appPath: '/tmp/appimage-root/resources/app.asar' }, renderer: { security: { appPath: '/tmp/appimage-root/resources/app.asar' }, launcher: { notificationPermission: 'denied' } }, runtime: { runtimeReady: true }, secondInstance: { singleInstance: true, permissions: 'renderer-permission-denied' } } } }
  assert.equal(inspectInstalledReport(linuxReport, { ...expected, platform: 'linux' }).failures.length, 0)
  assert.ok(inspectInstalledReport({ ...linuxReport, installed: { ...linuxReport.installed, appImage: undefined } }, { ...expected, platform: 'linux' }).failures.length > 0)
  const macRoot = '/tmp/Applications/TockTeam Desktop.app'
  const macPackage = { ...packageInventory, appPath: `${macRoot}/Contents/Resources/app.asar` }
  const macReport = {
    ...report,
    platform: 'darwin',
    installed: {
      installRoot: macRoot,
      package: macPackage,
      renderer: { security: { appPath: macPackage.appPath }, launcher: { notificationPermission: 'denied' } },
      identity: { appId: expected.appId, asarPath: macPackage.appPath, signature: 'adhoc', resources: true },
      reinstallSettings: { package: macPackage, identity: { appId: expected.appId, asarPath: macPackage.appPath, signature: 'adhoc', resources: true }, settings: { restored: 0.6, runtimeReady: 'ready' }, version: expected.version },
      rollback: { preservedAsarSha256: 'c'.repeat(64), validationFailureRecovered: true },
      provider: { controlPanel: 'unsupported', destructiveEffects: 'not-invoked', providerCount: 24, terminal: 'ready' },
      secondInstance: { singleInstance: true, permissions: 'renderer-permission-denied' },
      processTreesGone: true,
      temporaryInstallRemoved: true,
    },
  }
  assert.equal(inspectInstalledReport(macReport, { ...expected, platform: 'darwin' }).failures.length, 0)
  assert.ok(inspectInstalledReport({ ...macReport, installed: { ...macReport.installed, package: { ...macPackage, vendorScan: undefined } } }, { ...expected, platform: 'darwin' }).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...macReport, installed: { ...macReport.installed, provider: undefined } }, { ...expected, platform: 'darwin' }).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...macReport, installed: { ...macReport.installed, reinstallSettings: { ...macReport.installed.reinstallSettings, package: { ...macPackage, version: '0.0.0' } } } }, { ...expected, platform: 'darwin' }).failures.length > 0)
})

test('release and platform workflows retain ordered package and installed gates', () => {
  assert.match(releaseWorkflow, /launcher-package-smoke:/u)
  assert.match(releaseWorkflow, /needs: validate/u)
  assert.match(releaseWorkflow, /publish:[\s\S]*needs:\s*\[?package,?\s*launcher-package-smoke/u)
  assert.match(installedWorkflow, /workflow_dispatch:/u)
  assert.match(installedWorkflow, /pull_request:/u)
  assert.match(installedWorkflow, /runs-on: windows-latest/u)
  assert.match(installedWorkflow, /runs-on: ubuntu-24\.04/u)
  for (const [index, job] of ['windows-x64', 'linux-x64'].entries()) {
    const start = installedWorkflow.indexOf(`  ${job}:`)
    const end = index === 1 ? installedWorkflow.length : installedWorkflow.indexOf('  linux-x64:', start)
    const section = installedWorkflow.slice(start, end)
    assert.match(section, /actions\/checkout@[0-9a-f]{40}/u)
    assert.match(section, /fetch-depth: 0/u)
    assert.match(section, /fetch-tags: true/u)
    assert.match(section, /submodules: recursive/u)
    assert.match(section, /compression-level: 0/u)
  }
  assert.match(installedWorkflow, /id: ueli-gates/u)
  assert.match(installedWorkflow, /id: installed-smoke/u)
  assert.match(installedWorkflow, /id: report-check/u)
  assert.match(installedWorkflow, /Record installed gate outcomes/u)
  assert.match(installedWorkflow, /tockteam-installed-launcher-gate-\$\{\{ github\.run_id \}\}\.json/u)
  assert.match(installedWorkflow, /test:launcher:installed/u)
  assert.match(installedWorkflow, /check-installed-report\.mjs/u)
  assert.match(installedWorkflow, /portable-archive/u)
  assert.doesNotMatch(installedWorkflow, /NSIS artifact/u)
  assert.match(installedWorkflow, /test:ueli-baseline/u)
  assert.match(installedWorkflow, /audit:ueli-baseline/u)
  assert.match(installedWorkflow, /test:ueli-launcher-parity/u)
  assert.match(installedWorkflow, /audit:ueli-launcher-parity/u)
  assert.match(installedWorkflow, /test:ueli-package-feasibility/u)
  assert.match(installedWorkflow, /audit:ueli-package-feasibility/u)
  assert.match(installedWorkflow, /paths:[\s\S]*scripts\/\*\*/u)
  assert.match(installedWorkflow, /upload-artifact/u)
  assert.equal(inspectInstalledEvidenceWorkflow(installedWorkflow).failures.length, 0)
  const mutatedWorkflow = installedWorkflow.replaceAll('pnpm test:launcher:installed', 'pnpm test:launcher:packaged')
  assert.ok(inspectInstalledEvidenceWorkflow(mutatedWorkflow).failures.some(failure => failure.includes('execute installed smoke')))
  const missingHistory = installedWorkflow.replaceAll('fetch-depth: 0', 'fetch-depth: 1')
  assert.ok(inspectInstalledEvidenceWorkflow(missingHistory).failures.some(failure => failure.includes('full checkout history')))
  const missingSubmodules = installedWorkflow.replaceAll('submodules: recursive', 'submodules: false')
  assert.ok(inspectInstalledEvidenceWorkflow(missingSubmodules).failures.some(failure => failure.includes('recursive submodules')))
  const compressedUpload = installedWorkflow.replaceAll('compression-level: 0', 'compression-level: 6')
  assert.ok(inspectInstalledEvidenceWorkflow(compressedUpload).failures.some(failure => failure.includes('disable artifact compression')))
})
