import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  inspectInstalledEvidenceCatalog,
  inspectInstalledEvidenceWorkflow,
} from '../scripts/ueli/installed-evidence.mjs'
import { inspectInstalledReport } from '../scripts/check-installed-report.mjs'
import {
  inspectExtraResources,
  selectCdpDescriptor,
  smokeEnvironment,
  windowsCdpListenerOwned,
} from '../scripts/launcher-packaged-smoke.mjs'
import { replaceWindowsPortableArchive } from '../scripts/install-windows.mjs'

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
  assert.equal(environment.PATH, ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'))
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
    await symlink(rootPath, join(rootPath, 'dsh-runtime', 'cycle'))
    const result = await inspectExtraResources(join(rootPath, 'app.asar'))
    assert.ok(result.checkedEntries <= 4096)
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
  for (const row of catalog.rows) {
    assert.ok(row.id && row.platform && row.owner && row.state)
    if (row.required) assert.notEqual(row.owner, 'unowned')
    assert.equal(row.state, 'workflow-required')
    assert.equal(row.evidence, null)
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
  shortcut.evidence = { kind: 'checked-in-report', platform: 'darwin-arm64', commit: 'a'.repeat(40), version: '0.1.14', identity: 'ai.deepseek.tockteam-desktop', result: 'passed', reference: 'scripts/ueli/evidence/fabricated.json', reportSha256: 'b'.repeat(64) }
  assert.ok(inspectInstalledEvidenceCatalog(fabricated).failures.length > 0)
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
})

test('release and platform workflows retain ordered package and installed gates', () => {
  assert.match(releaseWorkflow, /launcher-package-smoke:/u)
  assert.match(releaseWorkflow, /needs: validate/u)
  assert.match(releaseWorkflow, /publish:[\s\S]*needs:\s*\[?package,?\s*launcher-package-smoke/u)
  assert.match(installedWorkflow, /workflow_dispatch:/u)
  assert.match(installedWorkflow, /pull_request:/u)
  assert.match(installedWorkflow, /runs-on: windows-latest/u)
  assert.match(installedWorkflow, /runs-on: ubuntu-24\.04/u)
  assert.match(installedWorkflow, /test:launcher:installed/u)
  assert.match(installedWorkflow, /check-installed-report\.mjs/u)
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
})
