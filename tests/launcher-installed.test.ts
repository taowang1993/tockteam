import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  inspectInstalledEvidenceCatalog,
  inspectInstalledEvidenceFreshness,
  inspectInstalledEvidenceWorkflow,
} from '../scripts/ueli/installed-evidence.mjs'
import { inspectInstalledReport } from '../scripts/check-installed-report.mjs'
import {
  PACKAGED_PREPARATION_PLAN,
  canonicalPath,
  collectPackagedProcessDiagnostics,
  inspectExtraResources,
  parseWindowsGitPaths,
  pathContained,
  prepareSmokeEnvironmentRoots,
  selectCdpDescriptor,
  selectWindowsGitPath,
  smokeEnvironment,
  trustedPathEntries,
  waitFor,
  waitForPackagedState,
  windowsCdpListenerOwned,
} from '../scripts/launcher-packaged-smoke.mjs'
import {
  defaultWindowsInstallDestination,
  parseWindowsInstallArgs,
  replaceWindowsPortableArchive,
  restoreWindowsPortableRuntimeLinks,
  validateWindowsPortableRoot,
  windowsPortableExtractArgs,
} from '../scripts/install-windows.mjs'
import {
  assertPackageParity,
  installerBuildPlan,
  macApplicationLaunchArgs,
  macMainProcessPids,
  recoverDebTransition,
  withInstalledSession,
  writeInstalledSmokeDiagnostics,
} from '../scripts/launcher-installed-smoke.mjs'
import {
  WINDOWS_PORTABLE_MARKER,
  normalizePortableManifestPath,
  PORTABLE_MANIFEST_MAX_ENTRIES,
  windowsPortableArchiveArgs,
  writeWindowsPortableArchiveMetadata,
  writeWindowsPortableManifest,
  writeWindowsPortableMarker,
} from '../scripts/windows-portable-archive.mjs'

const root = join(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>
}
const packagedSmoke = readFileSync(join(root, 'scripts', 'launcher-packaged-smoke.mjs'), 'utf8')
const installedSmoke = readFileSync(join(root, 'scripts', 'launcher-installed-smoke.mjs'), 'utf8')
const installedReportCheck = readFileSync(join(root, 'scripts', 'check-installed-report.mjs'), 'utf8')
const mainSource = readFileSync(join(root, 'src', 'main.ts'), 'utf8')
const installWindows = readFileSync(join(root, 'scripts', 'install-windows.mjs'), 'utf8')
const usageReference = readFileSync(join(root, '.agents', 'references', 'usage.md'), 'utf8')
const buildWindows = readFileSync(join(root, 'scripts', 'build-windows.mjs'), 'utf8')
const cleanup = readFileSync(join(root, 'scripts', 'process-cleanup.mjs'), 'utf8')
const releaseWorkflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8').replace(/\r\n?/gu, '\n')
const installedWorkflow = readFileSync(join(root, '.github', 'workflows', 'tocklauncher-installed.yml'), 'utf8').replace(/\r\n?/gu, '\n')
const catalog = JSON.parse(readFileSync(join(root, 'scripts', 'ueli', 'installed-evidence-catalog.json'), 'utf8')) as {
  schemaVersion: number
  issue: string
  evidenceStates: string[]
  publication: Record<string, boolean>
  rows: Array<{ id: string; platform: string; owner: string; required: boolean; state: string; evidence?: Record<string, string> | null }>
}

test('TockTeam exposes an executable installed-artifact smoke and audit', () => {
  assert.equal(typeof packageJson.scripts?.['test:launcher:installed'], 'string')
  assert.equal(typeof packageJson.scripts?.['audit:installed-evidence'], 'string')
  assert.match(packagedSmoke, /desktop\.log/u)
  assert.match(packagedSmoke, /process\.exit\(1\)/u, 'packaged smoke failures must fail their release step')
  assert.match(installedReportCheck, /process\.exit\(1\)/u, 'invalid installed reports must fail their workflow step')
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
  assert.match(installedSmoke, /writeWindowsPortableArchiveMetadata/u)
  assert.match(installedSmoke, /writeInstalledSmokeDiagnostics/u)
  assert.match(installedSmoke, /process\.exit\(1\)/u, 'installed smoke failures must exit before a later report check can mask them')
  assert.match(installedSmoke, /withInstalledSession/u)
  assert.match(installedSmoke, /--enable-logging=stderr/u)
  assert.match(installedSmoke, /--disable-gpu/u, 'Linux installed smoke must avoid hosted-runner GPU initialization')
  assert.match(installedSmoke, /> echo tockteam-installed-smoke/u, 'Windows terminal policy evidence must use a valid inert command query')
  assert.ok(installedSmoke.indexOf('const appImageEvidence = await runLinuxAppImageSmoke(appImage, artifact)') < installedSmoke.indexOf("await dpkg(['--install', deb])"))
  assert.match(installedSmoke, /sha256/u)
  assert.match(mainSource, /process\.stderr\.write/u)
  assert.match(mainSource, /resolveTrustedLauncherOsExecutable/u)
  assert.match(mainSource, /revalidateTrustedWorkflowWindowsExecutable/u)
  assert.match(installWindows, /process\.platform !== 'win32'/u)
  assert.match(installWindows, /System32/u)
  assert.match(installWindows, /windowsPortableExtractArgs/u)
  assert.match(installWindows, /process\.argv\[1\]/u)
  assert.match(usageReference, /node scripts\/install-windows\.mjs <archive> \[destination\]/u)
  assert.match(installedSmoke, /tar\.exe/u)
  assert.match(installedSmoke, /tar\.gz/u)
  assert.match(buildWindows, /windows-portable-archive\.mjs/u)
  assert.match(buildWindows, /writeWindowsPortableArchiveMetadata/u)
  assert.match(buildWindows, /windowsPortableArchiveArgs/u)
  assert.match(buildWindows, /tar\.gz/u)
  assert.doesNotMatch(buildWindows, /win-unpacked['"],?\s*\)/u)
  assert.match(installedSmoke, /dpkg-query/u)
  assert.match(installedSmoke, /\/usr\/bin\/dpkg/u)
  assert.match(installedSmoke, /--install/u)
  assert.match(installedSmoke, /finally \{\s*const purgeFailure = await dpkg\(\['--purge', packageName\]\)\.then\(\(\) => undefined/u)
  assert.doesNotMatch(installedSmoke, /--root=|--admindir=|deb-root|isolated dpkg/u)
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
    const archive = join(rootPath, 'TockTeam-Desktop-0.1.14-x64.tar.gz')
    const destination = join(rootPath, 'installed')
    const backupDirectory = join(rootPath, 'backup')
    await writeFile(archive, 'portable archive')
    const extracted = []
    const extractArchive = async (_source: string, pending: string) => {
      assert.equal((await stat(pending)).isDirectory(), true)
      extracted.push(pending)
      await mkdir(join(pending, 'win-unpacked', 'resources', 'dsh-runtime'), { recursive: true })
      await writeFile(join(pending, '.tockteam-portable.json'), '{"schemaVersion":1,"appId":"ai.deepseek.tockteam-desktop","productName":"TockTeam Desktop","version":"0.1.14","runtimeLinks":[]}')
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

test('Windows portable install rejects symlinked marker, root, ancestors, and cyclic targets', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-portable-containment-'))
  try {
    const markerPath = join(rootPath, WINDOWS_PORTABLE_MARKER)
    const runtime = join(rootPath, 'win-unpacked', 'resources', 'dsh-runtime')
    const writeMarker = async (runtimeLinks: readonly unknown[]) => await writeFile(markerPath, JSON.stringify({ schemaVersion: 1, appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', version: '0.1.14', runtimeLinks }))
    await mkdir(runtime, { recursive: true })
    await writeMarker([])
    const markerTarget = join(rootPath, 'marker-target.json')
    await writeFile(markerTarget, '{}')
    await rm(markerPath)
    await symlink(markerTarget, markerPath, 'file')
    await assert.rejects(restoreWindowsPortableRuntimeLinks(rootPath), /regular|symlink/u)
    await rm(markerPath)
    await writeMarker([])
    const outsideRuntime = join(rootPath, 'outside-runtime')
    await mkdir(outsideRuntime, { recursive: true })
    await rm(runtime, { recursive: true, force: true })
    await symlink(outsideRuntime, runtime, 'dir')
    await assert.rejects(restoreWindowsPortableRuntimeLinks(rootPath), /runtime root|extracted root/u)
    await rm(runtime)
    await mkdir(runtime, { recursive: true })
    const outside = join(rootPath, 'outside-target')
    await mkdir(outside, { recursive: true })
    await writeFile(join(outside, 'index.js'), '')
    await symlink(outside, join(runtime, 'workspace'), 'dir')
    await mkdir(join(runtime, 'node_modules', 'fixture'), { recursive: true })
    await writeFile(join(runtime, 'node_modules', 'fixture', 'link'), '')
    await writeMarker([{ path: 'node_modules/fixture/link', target: 'workspace/index.js', kind: 'file' }])
    await assert.rejects(restoreWindowsPortableRuntimeLinks(rootPath), /target.*runtime root|ancestor/u)
    await rm(join(runtime, 'workspace'))
    await mkdir(join(runtime, 'workspace'), { recursive: true })
    await writeMarker([{ path: 'node_modules/fixture/link', target: 'node_modules', kind: 'dir' }])
    await assert.rejects(restoreWindowsPortableRuntimeLinks(rootPath), /ancestor|cycle/u)
    await symlink('loop-b', join(runtime, 'workspace', 'loop-a'), 'dir')
    await symlink('loop-a', join(runtime, 'workspace', 'loop-b'), 'dir')
    await writeFile(join(runtime, 'node_modules', 'fixture', 'link'), '')
    await writeMarker([{ path: 'node_modules/fixture/link', target: 'workspace/loop-a', kind: 'dir' }])
    await assert.rejects(restoreWindowsPortableRuntimeLinks(rootPath), /loop|cycle|ELOOP/u)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('Windows source-build installer parses safe destinations and bounded extraction args', () => {
  const archive = 'C:\\tmp\\TockTeam-Desktop-0.1.14-x64.tar.gz'
  assert.deepEqual(parseWindowsInstallArgs([archive], { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' }), {
    archive,
    destination: 'C:\\Users\\tester\\AppData\\Local\\TockTeam\\Desktop',
  })
  assert.deepEqual(parseWindowsInstallArgs([archive, 'C:\\tmp\\TockTeam Desktop']), { archive, destination: 'C:\\tmp\\TockTeam Desktop' })
  assert.deepEqual(windowsPortableExtractArgs(archive, 'C:\\tmp\\pending'), ['-a', '-x', '-f', archive, '-C', 'C:\\tmp\\pending'])
  assert.throws(() => parseWindowsInstallArgs([], { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' }), /usage|archive/u)
  assert.throws(() => parseWindowsInstallArgs([archive, 'relative'], { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' }), /absolute|destination/u)
  assert.equal(defaultWindowsInstallDestination({ LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' }), 'C:\\Users\\tester\\AppData\\Local\\TockTeam\\Desktop')
})

test('macOS installed smoke uses Launch Services and observes one persistent app process', () => {
  const app = '/tmp/Applications/TockTeam Desktop.app'
  const executable = `${app}/Contents/MacOS/TockTeam Desktop`
  assert.deepEqual(macApplicationLaunchArgs(app, ['--toggle', '--user-data-dir=/tmp/profile']), [
    '-n', app, '--args', '--toggle', '--user-data-dir=/tmp/profile',
  ])
  assert.deepEqual(macMainProcessPids(`  41 ${executable} --flag\n  42 ${app}/Contents/Frameworks/TockTeam Desktop Helper.app/Contents/MacOS/TockTeam Desktop Helper --type=renderer\n  bad row\n`, executable), [41])
})

test('Linux deb recovery reinstalls and validates the preserved prior artifact', async () => {
  const installed: string[] = []
  const failure = await recoverDebTransition({
    candidate: '/tmp/candidate.deb',
    prior: '/tmp/prior.deb',
    install: async artifact => { installed.push(artifact) },
    validateCandidate: async () => { throw new Error('controlled candidate validation failure') },
    validateRecovery: async () => { assert.equal(installed.at(-1), '/tmp/prior.deb') },
  })
  assert.match(String(failure), /controlled candidate validation failure/u)
  assert.deepEqual(installed, ['/tmp/prior.deb', '/tmp/candidate.deb', '/tmp/prior.deb'])
  await assert.rejects(recoverDebTransition({
    candidate: '/tmp/candidate.deb', prior: '/tmp/prior.deb', install: async () => {}, validateCandidate: async () => {}, validateRecovery: async () => {},
  }), /must fail validation/u)
})

test('installed session cleanup preserves primary and cleanup failures', async () => {
  const session = {}
  let cleaned = false
  await assert.rejects(withInstalledSession(session, async () => { throw new Error('primary failure') }, async () => {
    cleaned = true
    throw new Error('cleanup failure')
  }), error => {
    assert.equal(cleaned, true)
    assert.ok(error instanceof AggregateError)
    assert.deepEqual([...error.errors].map(value => value.message), ['primary failure', 'cleanup failure'])
    return true
  })
  cleaned = false
  assert.equal(await withInstalledSession(session, async () => 'ok', async () => { cleaned = true }), 'ok')
  assert.equal(cleaned, true)
})

test('failed installed smoke diagnostics are bounded and retain nested assertion and cleanup errors', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-installed-diagnostics-'))
  try {
    const path = join(rootPath, 'diagnostics.json')
    const cause = new Error('root launch cause')
    const aggregate = new AggregateError([
      new Error('renderer assertion failed'),
      new Error('cleanup process remained'),
    ], 'installed session assertion and cleanup both failed', { cause })
    cause.cause = aggregate
    await writeInstalledSmokeDiagnostics(path, {
      platform: 'linux',
      version: '0.1.14',
      sourceCommit: 'a'.repeat(40),
      error: aggregate,
    })
    const diagnostics = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(diagnostics.result, 'failed')
    assert.equal(diagnostics.platform, 'linux')
    assert.equal(diagnostics.version, '0.1.14')
    assert.equal(diagnostics.sourceCommit, 'a'.repeat(40))
    assert.match(diagnostics.errorTail, /renderer assertion failed/u)
    assert.match(diagnostics.errorTail, /cleanup process remained/u)
    assert.match(diagnostics.errorTail, /root launch cause/u)
    assert.match(diagnostics.errorTail, /diagnostic cycle/u)
    assert.ok(diagnostics.errorTail.length <= 16_000)
    assert.equal(diagnostics.passed, undefined)

    const rootTailMarker = '[root diagnostic tail retained]'
    await writeInstalledSmokeDiagnostics(path, {
      platform: 'linux',
      version: '0.1.14',
      sourceCommit: 'a'.repeat(40),
      error: new Error(`${'discarded-prefix '.repeat(1_000)}${rootTailMarker}`),
    })
    const longRoot = JSON.parse(await readFile(path, 'utf8'))
    assert.match(longRoot.errorTail, /\[truncated to tail\]/u)
    assert.match(longRoot.errorTail, /\[root diagnostic tail retained\]/u)
    assert.ok(longRoot.errorTail.length <= 16_000)

    await writeInstalledSmokeDiagnostics(path, {
      platform: 'linux',
      version: '0.1.14',
      sourceCommit: 'a'.repeat(40),
      error: 'x'.repeat(20_000),
    })
    const bounded = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(bounded.errorTail.length, 16_000)
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

test('Windows portable replacement recreates absolute runtime links after promotion', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-portable-relocation-'))
  try {
    const archive = join(rootPath, 'portable.tar.gz')
    const destination = join(rootPath, 'installed')
    const backupDirectory = join(rootPath, 'backups')
    await writeFile(archive, 'portable archive')
    const expected = { appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', version: '0.1.14' }
    const extractArchive = async (_source: string, pending: string) => {
      const runtime = join(pending, 'win-unpacked', 'resources', 'dsh-runtime')
      const target = join(runtime, 'workspace', 'packages', 'boot', 'app-boot')
      await mkdir(join(target, 'lib'), { recursive: true })
      await mkdir(join(runtime, 'node_modules', '@deepseek-ai', 'dsh-app-boot'), { recursive: true })
      await writeFile(join(target, 'package.json'), '{}')
      await writeFile(join(target, 'lib', 'index.js'), 'export default true')
      await writeFile(join(pending, 'win-unpacked', 'TockTeam Desktop.exe'), '')
      await writeFile(join(pending, WINDOWS_PORTABLE_MARKER), JSON.stringify({
        schemaVersion: 1,
        ...expected,
        runtimeLinks: [{ path: 'node_modules/@deepseek-ai/dsh-app-boot', target: 'workspace/packages/boot/app-boot', kind: 'dir' }],
      }))
    }
    await replaceWindowsPortableArchive({
      archive,
      destination,
      backupDirectory,
      extractArchive,
      validateInstall: async path => { await validateWindowsPortableRoot(path, expected) },
    })
    const link = join(destination, 'win-unpacked', 'resources', 'dsh-runtime', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    const target = join(destination, 'win-unpacked', 'resources', 'dsh-runtime', 'workspace', 'packages', 'boot', 'app-boot')
    assert.equal(await readlink(link), target)
    assert.equal(await readFile(join(link, 'lib', 'index.js'), 'utf8'), 'export default true')
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('Windows portable archive restores relocated runtime links and rejects malicious metadata', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-portable-runtime-links-'))
  try {
    const outputDir = join(rootPath, 'archive')
    const sourceRuntime = join(rootPath, 'stage', 'dsh-runtime')
    const runtime = join(outputDir, 'win-unpacked', 'resources', 'dsh-runtime')
    const appBoot = join(runtime, 'workspace', 'packages', 'boot', 'app-boot')
    const appBootLink = join(runtime, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    const fileTarget = join(runtime, 'workspace', 'tools', 'fixture.js')
    const fileLink = join(runtime, 'node_modules', '.bin', 'fixture.js')
    await mkdir(join(sourceRuntime, 'node_modules', '@deepseek-ai'), { recursive: true })
    await mkdir(join(sourceRuntime, 'workspace', 'packages', 'boot', 'app-boot', 'lib'), { recursive: true })
    await symlink('../../workspace/packages/boot/app-boot', join(sourceRuntime, 'node_modules', '@deepseek-ai', 'dsh-app-boot'), 'dir')
    await mkdir(join(sourceRuntime, 'node_modules', '.bin'), { recursive: true })
    await mkdir(join(sourceRuntime, 'workspace', 'tools'), { recursive: true })
    await writeFile(join(sourceRuntime, 'workspace', 'packages', 'boot', 'app-boot', 'package.json'), '{}')
    await writeFile(join(sourceRuntime, 'workspace', 'packages', 'boot', 'app-boot', 'lib', 'index.js'), 'export default true')
    await writeFile(join(sourceRuntime, 'workspace', 'tools', 'fixture.js'), 'fixture')
    await symlink('../../workspace/tools/fixture.js', join(sourceRuntime, 'node_modules', '.bin', 'fixture.js'), 'file')
    await mkdir(join(runtime, 'node_modules', '@deepseek-ai'), { recursive: true })
    await mkdir(appBootLink, { recursive: true })
    await mkdir(join(appBoot, 'lib'), { recursive: true })
    await mkdir(join(runtime, 'node_modules', '.bin'), { recursive: true })
    await writeFile(fileLink, '')
    await writeFile(join(appBoot, 'package.json'), '{}')
    await writeFile(join(appBoot, 'lib', 'index.js'), 'export default true')
    await mkdir(join(runtime, 'workspace', 'tools'), { recursive: true })
    await writeFile(fileTarget, 'fixture')
    await mkdir(join(outputDir, 'win-unpacked'), { recursive: true })
    await writeFile(join(outputDir, 'win-unpacked', 'TockTeam Desktop.exe'), '')
    const metadataPath = join(outputDir, 'tockteam-portable-manifest.txt')
    const archiveMetadata = await writeWindowsPortableArchiveMetadata(outputDir, {
      appId: 'ai.deepseek.tockteam-desktop',
      productName: 'TockTeam Desktop',
      version: '0.1.14',
    }, metadataPath, { runtimeRoot: sourceRuntime, packagedRuntimeRoot: runtime })
    const marker = JSON.parse(await readFile(archiveMetadata.markerPath, 'utf8'))
    assert.deepEqual(marker.runtimeLinks, [
      { path: 'node_modules/.bin/fixture.js', target: 'workspace/tools/fixture.js', kind: 'file' },
      { path: 'node_modules/@deepseek-ai/dsh-app-boot', target: 'workspace/packages/boot/app-boot', kind: 'dir' },
    ])
    await restoreWindowsPortableRuntimeLinks(outputDir, {
      createDirectoryLink: async (target, path) => await symlink(target, path, process.platform === 'win32' ? 'junction' : 'dir'),
    })
    assert.deepEqual(JSON.parse(await readFile(join(appBootLink, 'package.json'), 'utf8')), {})
    assert.equal(await readFile(join(appBootLink, 'lib', 'index.js'), 'utf8'), 'export default true')
    assert.equal(await readFile(fileLink, 'utf8'), 'fixture')
    await validateWindowsPortableRoot(outputDir, { appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', version: '0.1.14' })
    await writeFile(archiveMetadata.markerPath, JSON.stringify({ ...marker, runtimeLinks: [{ path: '../escape', target: 'workspace/tools/fixture.js', kind: 'file' }] }))
    await assert.rejects(restoreWindowsPortableRuntimeLinks(outputDir, {
      createDirectoryLink: async (target, path) => await symlink(target, path, 'dir'),
    }), /relative/u)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('packaged polling retains bounded structured failure state', async () => {
  await assert.rejects(
    waitFor(async () => ({ providerStatuses: [{ extensionId: 'WindowsControlPanel', state: 'failed' }] }), () => false, 10),
    /WindowsControlPanel.*failed/u,
  )
})

test('packaged smoke reports child exit while polling CDP', async () => {
  const child = new EventEmitter() as EventEmitter & { exitCode: number | null; signalCode: NodeJS.Signals | null }
  child.exitCode = null
  child.signalCode = null
  const pending = waitForPackagedState(
    async () => { throw new Error('CDP fetch failed for http://127.0.0.1:32123/json/list') },
    () => false,
    child,
    {
      command: '/tmp/TockTeam Desktop',
      args: ['--remote-debugging-port=32123'],
      timeout: 10_000,
      output: () => ({ stdout: 'stdout-tail', stderr: 'stderr-tail' }),
    },
  )
  setTimeout(() => child.emit('exit', 7, null), 10)
  await assert.rejects(pending, error => {
    assert.match(String(error), /TockTeam Desktop/u)
    assert.match(String(error), /code=7/u)
    assert.match(String(error), /stdout-tail/u)
    assert.match(String(error), /stderr-tail/u)
    assert.match(String(error), /32123\/json\/list/u)
    return true
  })
})

test('packaged smoke live timeout includes launch args and process state before cleanup', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-packaged-diagnostics-'))
  try {
    await mkdir(join(rootPath, 'logs'), { recursive: true })
    await writeFile(join(rootPath, 'logs', 'desktop.log'), 'desktop log tail')
    const child = new EventEmitter() as EventEmitter & { pid: number; exitCode: number | null; signalCode: NodeJS.Signals | null }
    child.pid = process.pid
    child.exitCode = null
    child.signalCode = null
    const args = ['--remote-debugging-port=32123', `--user-data-dir=${rootPath}`]
    const pending = waitForPackagedState(
      async () => { throw new Error('CDP fetch failed for http://127.0.0.1:32123/json/list') },
      () => false,
      child,
      {
        command: '/tmp/TockTeam Desktop',
        args,
        timeout: 1,
        output: () => ({ stdout: 'stdout-tail', stderr: 'stderr-tail' }),
        diagnostics: () => collectPackagedProcessDiagnostics({ child, command: '/tmp/TockTeam Desktop', args, userData: rootPath, stdout: 'stdout-tail', stderr: 'stderr-tail' }),
      },
    )
    await assert.rejects(pending, error => {
      assert.match(String(error), /--remote-debugging-port=32123/u)
      assert.match(String(error), /pid=\d+/u)
      assert.match(String(error), /alive=true/u)
      assert.match(String(error), /stdout-tail/u)
      assert.match(String(error), /stderr-tail/u)
      assert.match(String(error), /desktop log tail/u)
      if (process.platform === 'linux') {
        assert.match(String(error), /\/proc\/\d+\/cmdline/u)
        assert.match(String(error), /\/proc\/\d+\/status/u)
        assert.match(String(error), /CoreDumping:/u)
        assert.match(String(error), /\/proc\/\d+\/wchan/u)
        assert.doesNotMatch(String(error), /\0/u)
      }
      return true
    })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test('Windows portable manifests are finite and skip symlink cycles', { skip: process.platform === 'win32' }, async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'tockteam-portable-manifest-'))
  try {
    const outputDir = join(rootPath, 'output')
    const resources = join(outputDir, 'win-unpacked', 'resources')
    await mkdir(resources, { recursive: true })
    await mkdir(join(resources, 'dsh-runtime'), { recursive: true })
    await writeFile(join(resources, 'app.asar'), 'payload')
    const markerPath = await writeWindowsPortableMarker(outputDir, { appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', version: '0.1.14' })
    assert.deepEqual(JSON.parse(await readFile(markerPath, 'utf8')), { schemaVersion: 1, appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', version: '0.1.14', runtimeLinks: [] })
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

test('installed parity allows bounded observational vendor-scan count differences', () => {
  const expected = {
    appId: 'ai.deepseek.tockteam-desktop',
    productName: 'TockTeam Desktop',
    version: '0.1.14',
    assetCount: 65,
    vendorScan: { scope: 'bounded-no-follow', maxDepth: 2, maxEntries: 4_096, checkedEntries: 58, forbiddenSourceFound: false, launcherSourceAbsent: true },
    extraResources: { roots: [] },
  }
  const installed = { ...expected, vendorScan: { ...expected.vendorScan, checkedEntries: 59 } }
  assert.doesNotThrow(() => assertPackageParity(expected, installed))
  assert.throws(() => assertPackageParity({ ...expected, vendorScan: { ...expected.vendorScan, checkedEntries: 4_097 } }, installed), /expected vendor-scan count/u)
  assert.throws(() => assertPackageParity(expected, { ...installed, vendorScan: { ...installed.vendorScan, checkedEntries: 4_097 } }), /installed vendor-scan count/u)
  assert.throws(() => assertPackageParity(expected, { ...installed, vendorScan: { ...installed.vendorScan, scope: 'unbounded' } }), /vendor-scan invariant drifted: scope/u)
})

test('Windows portable archive uses a bounded relative manifest', () => {
  assert.deepEqual(windowsPortableArchiveArgs({
    archive: 'C:\\tmp\\portable.tar.gz',
    outputDir: 'C:\\tmp\\output',
    manifestPath: 'C:\\tmp\\portable-manifest.txt',
  }), [
    '-a', '-c', '-f', 'C:\\tmp\\portable.tar.gz',
    '--no-recursion', '-C', 'C:\\tmp\\output', '-T', 'C:\\tmp\\portable-manifest.txt',
  ])
})

test('launched smoke environments use disposable user roots and bounded tools', () => {
  const smokeRoot = resolve('/tmp/tockteam-smoke-root')
  const shortTemp = resolve('/tmp/tt-short')
  const environment = smokeEnvironment({ NODE_OPTIONS: '--require=evil', NODE_PATH: '/tmp/evil', PATH: '/tmp/evil' }, smokeRoot)
  assert.equal(environment.NODE_OPTIONS, undefined)
  assert.equal(environment.NODE_PATH, undefined)
  assert.equal(environment.HOME, join(smokeRoot, 'home'))
  assert.equal(environment.USERPROFILE, join(smokeRoot, 'home'))
  assert.equal(environment.XDG_CONFIG_HOME, join(smokeRoot, 'xdg', 'config'))
  assert.equal(environment.XDG_DATA_DIRS, join(smokeRoot, 'xdg', 'data-dirs'))
  assert.equal(environment.TMPDIR, join(smokeRoot, 'tmp'))
  assert.equal(environment.TEMP, join(smokeRoot, 'tmp'))
  assert.equal(environment.TMP, join(smokeRoot, 'tmp'))
  const shortTempEnvironment = smokeEnvironment({}, smokeRoot, shortTemp)
  assert.equal(shortTempEnvironment.HOME, join(smokeRoot, 'home'))
  assert.equal(shortTempEnvironment.TMPDIR, shortTemp)
  assert.equal(shortTempEnvironment.TEMP, shortTemp)
  assert.equal(shortTempEnvironment.TMP, shortTemp)
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

test('installed evidence catalog owns exact platform rows and immutable hosted proof', () => {
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.issue, 'tockteam-tl.15')
  assert.deepEqual(catalog.evidenceStates, ['local-verified', 'hosted-verified', 'partially-verified', 'workflow-required', 'unverified', 'not-applicable'])
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
  const hostedRows = new Set([
    'Windows:portable-archive-install', 'Windows:identity-resources-notices', 'Windows:security-action-settings',
    'Windows:reinstall-rollback-cleanup', 'Windows:shortcut-second-instance-permissions',
    'Linux:deb-install', 'Linux:appimage-install', 'Linux:identity-resources-notices',
    'Linux:security-action-settings', 'Linux:file-search-custom-browser', 'Linux:shortcut-second-instance-permissions',
  ])
  const partialRows = new Set([
    'macOS:notices-and-bounded-vendor-scan', 'macOS:provider-catalog',
    'Windows:notices-and-bounded-vendor-scan', 'Windows:control-panel-terminal-elevation',
    'Linux:notices-and-bounded-vendor-scan', 'Linux:reinstall-rollback-cleanup',
  ])
  const provenanceFor = (platform: 'Linux' | 'Windows' | 'macOS') => {
    const reference = `.beads/reports/tocklauncher-installed-${platform === 'Linux' ? 'linux-x64' : platform === 'Windows' ? 'windows-x64' : 'macos-arm64'}.json`
    const bytes = readFileSync(join(root, reference))
    const report = JSON.parse(bytes.toString('utf8')) as { platform: string; sourceCommit: string }
    return { platform: report.platform, commit: report.sourceCommit, reportSha256: createHash('sha256').update(bytes).digest('hex'), reference }
  }
  const provenance = { Linux: provenanceFor('Linux'), Windows: provenanceFor('Windows'), macOS: provenanceFor('macOS') }
  for (const row of catalog.rows) {
    assert.ok(row.id && row.platform && row.owner && row.state)
    if (row.required) assert.notEqual(row.owner, 'unowned')
    const expectedState = localMacRows.has(row.id) ? 'local-verified' : hostedRows.has(row.id) ? 'hosted-verified' : partialRows.has(row.id) ? 'partially-verified' : 'workflow-required'
    assert.equal(row.state, expectedState)
    if (expectedState === 'workflow-required') assert.equal(row.evidence, null)
    else assert.deepEqual({ platform: row.evidence?.platform, commit: row.evidence?.commit, reportSha256: row.evidence?.reportSha256, reference: row.evidence?.reference }, provenance[row.platform as keyof typeof provenance])
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

test('installed evidence freshness rejects runtime drift after a report commit', () => {
  const runGit = (args: readonly string[]) => args[0] === 'merge-base'
    ? { status: 0, stdout: '' }
    : { status: 0, stdout: '.beads/reports/report.json\nscripts/ueli/installed-evidence-catalog.json\nsrc/main.ts\n' }
  const commit = catalog.rows.find(row => row.evidence?.commit)?.evidence?.commit
  assert.ok(commit)
  assert.deepEqual(inspectInstalledEvidenceFreshness(catalog, { head: 'HEAD', repoRoot: root, runGit }).failures, [`installed evidence commit has later runtime changes: ${commit}: src/main.ts`])
  const allowedRunGit = (args: readonly string[]) => args[0] === 'merge-base'
    ? { status: 0, stdout: '' }
    : { status: 0, stdout: '.agents/references/usage.md\n.beads/reports/report.json\nscripts/ueli/installed-evidence-catalog.json\ntests/launcher-installed.test.ts\n' }
  assert.equal(inspectInstalledEvidenceFreshness(catalog, { head: 'HEAD', repoRoot: root, runGit: allowedRunGit }).failures.length, 0)
})

test('installed report validation requires complete platform lifecycle evidence', () => {
  const appPath = '/tmp/install/win-unpacked/resources/app.asar'
  const roots = ['dsh-runtime', 'node-runtime', 'tockteam-desktop.png', 'lib/tockteam/cli.js', 'lib/tockteam/package.json', 'bin/tockteam', 'bin/tockteam.cmd']
  const packageInventory = { version: '0.1.14', appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', assetCount: 65, assetsVerified: true, noticesVerified: true, appPathUsesAsar: true, appPath, extraResources: { roots }, vendorScan: { scope: 'bounded-no-follow', maxDepth: 2, maxEntries: 4096, checkedEntries: 114, forbiddenSourceFound: false, launcherSourceAbsent: true } }
  const rendererFor = (rendererAppPath: string) => ({
    launcher: { apiKeys: ['cancelAction', 'dismiss', 'getLocalExtensionSettings', 'getSurfaceSettings', 'getTheme', 'invokeAction', 'onLocale', 'onTheme', 'openSettings', 'recordSearch', 'rescan', 'search'], csp: "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'", hasNodeProcess: false, hasRequire: false, notificationPermission: 'denied', ready: 'true', title: 'TockLauncher' },
    runtimeArchitecture: 'x64',
    search: { sourceExtension: 'Base64Conversion' },
    security: { appPath: rendererAppPath, appPathUsesAsar: true, launcherSessionPartition: 'persist:tockteam-launcher', sessionMatches: true },
    settingsRoundTrip: { changed: 0.6, restored: 0.5 },
    workbench: { href: 'http://127.0.0.1:12345/tockcoder', marker: 'workbench-before-dismiss', title: 'TockCoder' },
  })
  const renderer = rendererFor(appPath)
  const report = {
    result: 'passed', sourceCommit: 'a'.repeat(40), version: '0.1.14', appId: 'ai.deepseek.tockteam-desktop', productName: 'TockTeam Desktop', platform: 'win32',
    cleanup: { temporaryInstallRemoved: true, processTreesGone: true },
    installed: {
      portableArchive: { path: '/tmp/TockTeam-Desktop-0.1.14-x64.tar.gz', format: 'tar.gz', version: '0.1.14', sha256: 'a'.repeat(64) }, installRoot: '/tmp/install', package: packageInventory, renderer,
      provider: { controlPanel: 'ready', destructiveEffects: 'not-invoked', elevation: 'confirmation-required-not-invoked', providerCount: 24, terminal: 'ready' },
      reinstall: { package: packageInventory, settings: { restored: 0.6, runtimeReady: 'ready' } }, secondInstance: { singleInstance: true, permissions: 'renderer-permission-denied' }, rollback: { preservedAsarSha256: 'b'.repeat(64), validationFailureRecovered: true }, cleanup: { installRootRemoved: true },
    },
  }
  const expected = { appId: 'ai.deepseek.tockteam-desktop', platform: 'win32', productName: 'TockTeam Desktop', version: '0.1.14' }
  assert.equal(inspectInstalledReport(report, expected).failures.length, 0)
  const windowsRoots = roots.map(root => root.replaceAll('/', '\\'))
  const windowsAppPath = 'D:\\a\\_temp\\installed\\TockTeam Desktop\\resources\\app.asar'
  const windowsPackage = { ...packageInventory, appPath: windowsAppPath, extraResources: { roots: windowsRoots } }
  const windowsSeparatorReport = { ...report, installed: { ...report.installed, installRoot: 'D:\\a\\_temp\\installed\\TockTeam Desktop', package: windowsPackage, renderer: { ...renderer, security: { ...renderer.security, appPath: windowsAppPath } }, reinstall: { ...report.installed.reinstall, package: windowsPackage } } }
  assert.equal(inspectInstalledReport(windowsSeparatorReport, expected).failures.length, 0)
  const unavailableControlPanel = { ...report, installed: { ...report.installed, provider: { ...report.installed.provider, controlPanel: 'unavailable' } } }
  assert.equal(inspectInstalledReport(unavailableControlPanel, expected).failures.length, 0)
  assert.ok(inspectInstalledReport({ ...report, result: 'failed' }, expected).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, portableArchive: { ...report.installed.portableArchive, sha256: 'bad' } } }, expected).failures.some(failure => failure.includes('hash')))
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, provider: undefined } }, expected).failures.some(failure => failure.includes('provider')))
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, provider: { ...report.installed.provider, elevation: 'invoked' } } }, expected).failures.some(failure => failure.includes('provider')))
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, provider: { ...report.installed.provider, extra: true } } }, expected).failures.some(failure => failure.includes('shape')))
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, reinstall: undefined } }, expected).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, package: { ...packageInventory, vendorScan: undefined } } }, expected).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...report, installed: { ...report.installed, renderer: { ...renderer, launcher: { ...renderer.launcher, hasRequire: true } } } }, expected).failures.some(failure => failure.includes('renderer security')))
  const linuxProvider = { customBrowser: 'system-browser-only', fileSearch: 'unsupported', providerCount: 24, terminal: 'unsupported' }
  const linuxPackage = { ...packageInventory, appPath: '/opt/TockTeam Desktop/resources/app.asar' }
  const linuxRenderer = rendererFor(linuxPackage.appPath)
  const appImagePath = '/tmp/appimage-root/resources/app.asar'
  const linuxReport: any = { ...report, platform: 'linux', installed: { deb: { artifact: '/tmp/TockTeam-Desktop.deb', installRoot: '/opt/TockTeam Desktop', package: linuxPackage, provider: linuxProvider, renderer: linuxRenderer, reinstall: { package: linuxPackage, settings: { restored: 0.6, runtimeReady: 'ready' } }, secondInstance: { singleInstance: true, permissions: 'renderer-permission-denied' }, rollback: { state: 'workflow-required' }, uninstall: 'dpkg-purge-passed' }, appImage: { artifact: '/tmp/TockTeam-Desktop.AppImage', installRoot: '/tmp/appimage-root', package: { ...linuxPackage, appPath: appImagePath }, provider: linuxProvider, renderer: rendererFor(appImagePath), runtime: { runtimeReady: true }, secondInstance: { singleInstance: true, permissions: 'renderer-permission-denied' } } } }
  assert.equal(inspectInstalledReport(linuxReport, { ...expected, platform: 'linux' }).failures.length, 0)
  const recoveredLinuxReport = structuredClone(linuxReport)
  recoveredLinuxReport.installed.deb.rollback = {
    atomic: false,
    mechanism: 'reinstall-preserved-prior-deb',
    validationFailureRecovered: true,
    prior: { artifact: '/tmp/prior/TockTeam-Desktop.deb', packageName: 'tockteam-desktop', sha256: 'd'.repeat(64), sourceRun: '33301125258', version: expected.version },
    recovered: { package: linuxPackage, settings: { restored: 0.6, runtimeReady: 'ready' }, version: expected.version },
  }
  assert.equal(inspectInstalledReport(recoveredLinuxReport, { ...expected, platform: 'linux' }).failures.length, 0)
  const falseAtomicRollback = structuredClone(recoveredLinuxReport)
  falseAtomicRollback.installed.deb.rollback.atomic = true
  assert.ok(inspectInstalledReport(falseAtomicRollback, { ...expected, platform: 'linux' }).failures.some(failure => failure.includes('non-atomic')))
  assert.ok(inspectInstalledReport({ ...linuxReport, installed: { ...linuxReport.installed, appImage: undefined } }, { ...expected, platform: 'linux' }).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...linuxReport, installed: { ...linuxReport.installed, deb: { ...linuxReport.installed.deb, provider: undefined } } }, { ...expected, platform: 'linux' }).failures.some(failure => failure.includes('Linux provider')))
  const macRoot = '/tmp/Applications/TockTeam Desktop.app'
  const macPackage = { ...packageInventory, appPath: `${macRoot}/Contents/Resources/app.asar` }
  const macReport = {
    ...report,
    platform: 'darwin',
    installed: {
      installRoot: macRoot,
      package: macPackage,
      renderer: rendererFor(macPackage.appPath),
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
  const aliasedMacPath = '/private/var/folders/test/Applications/TockTeam Desktop.app/Contents/Resources/app.asar'
  const aliasedMacPackage = { ...macPackage, appPath: aliasedMacPath }
  const aliasedMacReport = { ...macReport, installed: { ...macReport.installed, installRoot: '/var/folders/test/Applications/TockTeam Desktop.app', package: aliasedMacPackage, renderer: rendererFor(aliasedMacPath), identity: { ...macReport.installed.identity, asarPath: aliasedMacPath }, reinstallSettings: { ...macReport.installed.reinstallSettings, package: aliasedMacPackage, identity: { ...macReport.installed.reinstallSettings.identity, asarPath: aliasedMacPath } } } }
  assert.equal(inspectInstalledReport(aliasedMacReport, { ...expected, platform: 'darwin' }).failures.length, 0)
  assert.ok(inspectInstalledReport({ ...macReport, installed: { ...macReport.installed, package: { ...macPackage, vendorScan: undefined } } }, { ...expected, platform: 'darwin' }).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...macReport, installed: { ...macReport.installed, provider: undefined } }, { ...expected, platform: 'darwin' }).failures.length > 0)
  assert.ok(inspectInstalledReport({ ...macReport, installed: { ...macReport.installed, reinstallSettings: { ...macReport.installed.reinstallSettings, package: { ...macPackage, version: '0.0.0' } } } }, { ...expected, platform: 'darwin' }).failures.length > 0)
})

test('release and platform workflows retain ordered package and installed gates', () => {
  assert.match(releaseWorkflow, /launcher-package-smoke:/u)
  assert.match(releaseWorkflow, /needs: validate/u)
  assert.match(releaseWorkflow, /publish:[\s\S]*needs:\s*\[?package,?\s*launcher-package-smoke/u)
  assert.match(installedWorkflow, /workflow_dispatch:/u)
  assert.match(installedWorkflow, /linux_prior_run_id:/u)
  assert.match(installedWorkflow, /TOCKTEAM_LINUX_ROLLBACK_DEB/u)
  assert.doesNotMatch(installedWorkflow, /pull_request:/u)
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
    assert.match(section, /if: always\(\) && steps\.installed-smoke\.outcome == 'failure'/u)
    if (job === 'windows-x64') assert.match(section, /tockteam-installed-launcher-smoke-\*\/installer\/\*\.tar\.gz/u)
    else {
      assert.match(section, /tockteam-installed-launcher-smoke-\*\/installer\/\*\.deb/u)
      assert.match(section, /tockteam-installed-launcher-smoke-\*\/installer\/\*\.AppImage/u)
      assert.match(section, /kernel\.core_pattern[\s\S]*trap restore_core_pattern EXIT[\s\S]*ulimit -c 0[\s\S]*xvfb-run -a pnpm test:launcher:installed/u)
      assert.match(section, /tockteam-installed-kernel-diagnostics-\$\{\{ github\.run_id \}\}\.txt/u)
      assert.match(section, /sudo -n \/usr\/bin\/dmesg/u)
      assert.match(section, /sudo -n \/usr\/bin\/journalctl/u)
      assert.match(section, /tail -n 200/u)
    }
    assert.match(section, /tockteam-installed-launcher-smoke-\$\{\{ github\.run_id \}\}\.json/u)
    assert.match(section, /tockteam-installed-launcher-gate-\$\{\{ github\.run_id \}\}\.json/u)
    assert.match(section, /tockteam-installed-launcher-diagnostics-\$\{\{ github\.run_id \}\}\.json/u)
    assert.doesNotMatch(section, /installer\/\*\*/u)
    assert.doesNotMatch(section, /report\/\*\*/u)
    assert.doesNotMatch(section, /tockteam-installed-launcher-smoke-\*\.json/u)
  }
  assert.match(installedWorkflow, /id: ueli-gates/u)
  assert.match(installedWorkflow, /id: installed-smoke/u)
  assert.match(installedWorkflow, /id: report-check/u)
  assert.match(installedWorkflow, /Record installed gate outcomes/u)
  assert.match(installedWorkflow, /tockteam-installed-launcher-gate-\$\{\{ github\.run_id \}\}\.json/u)
  assert.match(installedWorkflow, /test:launcher:installed/u)
  assert.match(installedWorkflow, /check-installed-report\.mjs/u)
  assert.match(installedWorkflow, /portable archive \(tar\.gz\)/u)
  assert.doesNotMatch(installedWorkflow, /NSIS artifact/u)
  assert.match(installedWorkflow, /test:ueli-baseline/u)
  assert.match(installedWorkflow, /audit:ueli-baseline/u)
  assert.match(installedWorkflow, /test:ueli-launcher-parity/u)
  assert.match(installedWorkflow, /audit:ueli-launcher-parity/u)
  assert.match(installedWorkflow, /test:ueli-package-feasibility/u)
  assert.match(installedWorkflow, /audit:ueli-package-feasibility/u)
  assert.match(installedWorkflow, /upload-artifact/u)
  assert.equal(inspectInstalledEvidenceWorkflow(installedWorkflow).failures.length, 0)
  const pullRequestWorkflow = installedWorkflow.replace('  workflow_dispatch:', '  workflow_dispatch:\n  pull_request:')
  assert.ok(inspectInstalledEvidenceWorkflow(pullRequestWorkflow).failures.some(failure => failure.includes('every pull request')))
  const mutatedWorkflow = installedWorkflow.replaceAll('pnpm test:launcher:installed', 'pnpm test:launcher:packaged')
  assert.ok(inspectInstalledEvidenceWorkflow(mutatedWorkflow).failures.some(failure => failure.includes('execute installed smoke')))
  const missingHistory = installedWorkflow.replaceAll('fetch-depth: 0', 'fetch-depth: 1')
  assert.ok(inspectInstalledEvidenceWorkflow(missingHistory).failures.some(failure => failure.includes('full checkout history')))
  const missingSubmodules = installedWorkflow.replaceAll('submodules: recursive', 'submodules: false')
  assert.ok(inspectInstalledEvidenceWorkflow(missingSubmodules).failures.some(failure => failure.includes('recursive submodules')))
  const compressedUpload = installedWorkflow.replaceAll('compression-level: 0', 'compression-level: 6')
  assert.ok(inspectInstalledEvidenceWorkflow(compressedUpload).failures.some(failure => failure.includes('disable artifact compression')))
  const unpackedUpload = installedWorkflow.replaceAll('/installer/*.tar.gz', '/installer/**').replaceAll('/installer/*.deb', '/installer/**').replaceAll('/installer/*.AppImage', '/installer/**')
  assert.ok(inspectInstalledEvidenceWorkflow(unpackedUpload).failures.some(failure => failure.includes('only distributable files')))
})
