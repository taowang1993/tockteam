import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  inspectInstalledEvidenceCatalog,
  inspectInstalledEvidenceWorkflow,
} from '../scripts/ueli/installed-evidence.mjs'
import { inspectInstalledReport } from '../scripts/check-installed-report.mjs'
import {
  inspectExtraResources,
  findNsisInstaller,
  selectCdpDescriptor,
  smokeEnvironment,
} from '../scripts/launcher-packaged-smoke.mjs'

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
  assert.match(installedSmoke, /dpkg-query/u)
  assert.match(installedSmoke, /\/usr\/bin\/dpkg/u)
  assert.match(installedSmoke, /--unpack/u)
  assert.match(installedSmoke, /--purge/u)
  assert.match(installedSmoke, /post-install|inspectPackage/u)
  assert.match(installedSmoke, /Uninstall TockTeam Desktop\.exe/u)
  assert.match(installedSmoke, /detached:\s*(?:true|process\.platform)/u)
})

test('installed smoke selects only the loopback descriptor and root NSIS artifact', async () => {
  const pages = [
    { title: 'TockCoder', webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/wrong-port' },
    { title: 'Other', webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/page/right-port' },
    { title: 'TockCoder', webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/page/right-title' },
  ]
  assert.equal(selectCdpDescriptor(pages, 'TockCoder', 1234)?.webSocketDebuggerUrl, pages[2]!.webSocketDebuggerUrl)
  assert.equal(selectCdpDescriptor(pages, 'TockCoder', 7777), undefined)
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-nsis-artifact-'))
  try {
    await mkdir(join(rootPath, 'win-unpacked'), { recursive: true })
    await writeFile(join(rootPath, 'win-unpacked', 'TockTeam Desktop.exe'), '')
    await writeFile(join(rootPath, 'TockTeam-Desktop-0.1.14-x64.exe'), '')
    assert.equal(await findNsisInstaller(rootPath, 1), join(rootPath, 'TockTeam-Desktop-0.1.14-x64.exe'))
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
    'Windows:nsis-install', 'Windows:identity-resources-notices', 'Windows:security-action-settings',
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
    if (row.state === 'local-verified' || row.state === 'partially-verified') assert.equal(typeof row.evidence, 'object')
  }
  assert.deepEqual(new Set(catalog.rows.map(row => row.platform)), new Set(['macOS', 'Windows', 'Linux']))
  assert.deepEqual(inspectInstalledEvidenceCatalog({ ...catalog, rows: catalog.rows.slice(1) }).failures.filter(failure => failure.includes('required installed evidence row is missing')), ['required installed evidence row is missing: macOS:artifact-build'])
  const invalidOwner = structuredClone(catalog)
  invalidOwner.rows[0]!.owner = 'reports/fabricated.md'
  assert.ok(inspectInstalledEvidenceCatalog(invalidOwner).failures.some(failure => failure.includes('owner is not an approved source')))
  const swappedOwner = structuredClone(catalog)
  swappedOwner.rows.find(row => row.id === 'Windows:nsis-install')!.owner = 'scripts/launcher-installed-smoke.mjs'
  assert.ok(inspectInstalledEvidenceCatalog(swappedOwner).failures.some(failure => failure.includes('owner is incorrect')))
  const fabricated = structuredClone(catalog)
  const shortcut = fabricated.rows.find(row => row.id === 'macOS:shortcut-second-instance')
  assert.ok(shortcut)
  shortcut.state = 'local-verified'
  shortcut.evidence = { kind: 'local-run', platform: 'darwin-arm64', commit: 'a'.repeat(40), version: '0.1.14', identity: 'ai.deepseek.tockteam-desktop', result: 'passed', reference: '/tmp/fabricated.json' }
  assert.ok(inspectInstalledEvidenceCatalog(fabricated).failures.some(failure => failure.includes('must remain workflow-required')))
})

test('installed report validation requires package identity, version, and a passing result', () => {
  const report = {
    version: '0.1.14',
    appId: 'ai.deepseek.tockteam-desktop',
    productName: 'TockTeam Desktop',
    platform: 'win32',
    installed: { package: { version: '0.1.14', appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', assetCount: 65, vendorSourceShipped: false, appPathUsesAsar: true, appPath: '/tmp/install/resources/app.asar', extraResources: { roots: ['dsh-runtime', 'node-runtime', 'tockteam-desktop.png', 'lib/tockteam/cli.js', 'lib/tockteam/package.json', 'bin/tockteam', 'bin/tockteam.cmd'] } }, renderer: { security: { appPath: '/tmp/install/resources/app.asar' }, launcher: { notificationPermission: 'denied' } } },
  }
  assert.equal(inspectInstalledReport(report, { platform: 'win32', version: '0.1.14' }).failures.length, 0)
  assert.ok(inspectInstalledReport({ ...report, version: '0.1.13' }, { platform: 'win32', version: '0.1.14' }).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...report, installed: undefined }, { platform: 'win32', version: '0.1.14' }).failures.length > 0)
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
  assert.match(installedWorkflow, /scripts\/stage-dsh\.mjs/u)
  assert.match(installedWorkflow, /scripts\/build-dsh\.mjs/u)
  assert.match(installedWorkflow, /upload-artifact/u)
  assert.equal(inspectInstalledEvidenceWorkflow(installedWorkflow).failures.length, 0)
  const mutatedWorkflow = installedWorkflow.replaceAll('pnpm test:launcher:installed', 'pnpm test:launcher:packaged')
  assert.ok(inspectInstalledEvidenceWorkflow(mutatedWorkflow).failures.some(failure => failure.includes('execute installed smoke')))
})
