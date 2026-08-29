#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'electron-builder'
import {
  freePort,
  launchPackaged,
  packagedBuilderConfig,
  preparePackagedArtifact,
  withSmokeEnvironment,
  runRendererSmoke,
  inspectPackage,
  findNsisInstaller,
  stopPackagedChild,
  smokeEnvironment as packagedSmokeEnvironment,
  waitFor,
} from './launcher-packaged-smoke.mjs'
import { replaceMacBundle, validateMacBundle } from './install-mac.mjs'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contract = JSON.parse(await readFile(join(root, 'scripts/ueli/desktop-release-contract.json'), 'utf8'))
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const electronPackage = JSON.parse(await readFile(join(root, 'node_modules/electron/package.json'), 'utf8'))
const smokeFlag = '--tockteam-launcher-installed-smoke'
const smokeMarker = 'TOCKTEAM_INSTALLED_SMOKE '
const smokeOverrideKeys = Object.freeze([
  'TOCKTEAM_RESOURCES_ROOT',
  'TOCKTEAM_WEB_ROOT',
  'TOCKTEAM_SOURCE_ROOT',
  'TOCKTEAM_SURFACES',
  'TOCKTEAM_MARKETPLACE_CATALOG',
  'TOCKTEAM_MARKETPLACE_AGENT_URL',
  'TOCKTEAM_MARKETPLACE_AGENT_TOKEN',
  'TOCKTEAM_DESKTOP_APP',
  'TOCKTEAM_TUI_ROOT',
  'TOCKTEAM_TUI_HOME',
  'TOCKTEAM_WEB_HOME',
  'TOCKTEAM_WEB_HOST',
  'TOCKTEAM_WEB_PORT',
  'TOCKTEAM_WEB_OPEN',
  'TOCKTEAM_TUI_CWD',
  'TOCKTEAM_TUI_SESSION_ID',
  'DSH_SOURCE',
  'DSH_HOME',
  'DSH_DESKTOP_GH_PATH',
  'DSH_DESKTOP_SIGN_IDENTITY',
  'DSH_DESKTOP_APP_DATA',
  'DSH_DESKTOP_PROFILE',
  'DSH_DESKTOP_VERSION',
  'DSH_DESKTOP_NODE_VERSION',
  'DSH_DESKTOP_NODE_PLATFORM',
  'DSH_DESKTOP_NODE_ARCH',
  'NODE_OPTIONS',
  'NODE_PATH',
])

function smokeEnvironment(overrides = {}, disposableRoot = undefined) {
  const environment = packagedSmokeEnvironment(overrides, disposableRoot)
  for (const key of smokeOverrideKeys) delete environment[key]
  delete environment.ELECTRON_RUN_AS_NODE
  return environment
}

function runProcess(command, args, options = {}) {
  const { disposableRoot, ...spawnOptions } = options
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      ...spawnOptions,
      env: smokeEnvironment(spawnOptions.env ?? {}, disposableRoot),
    })
    let stdout = ''
    let stderr = ''
    let finished = false
    const timeout = setTimeout(() => {
      if (finished) return
      finished = true
      void stopPackagedChild(child).finally(() => reject(new Error(`${command} timed out after 180000ms`)))
    }, 180_000)
    const finish = callback => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      callback()
    }
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.once('error', error => finish(() => reject(error)))
    child.once('close', code => finish(() => {
      void stopPackagedChild(child).then(() => {
        if (code !== 0) {
          reject(new Error(`${command} ${args.join(' ')} failed with status ${String(code)}.\n${stdout}\n${stderr}`))
          return
        }
        resolvePromise({ stdout, stderr })
      }).catch(reject)
    }))
  })
}

async function findFile(rootPath, predicate, depth = 0) {
  if (depth > 10) return undefined
  let entries
  try {
    entries = await readdir(rootPath, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    const absolutePath = join(rootPath, entry.name)
    if (entry.isFile() && predicate(entry)) return absolutePath
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const found = await findFile(absolutePath, predicate, depth + 1)
      if (found !== undefined) return found
    }
  }
  return undefined
}

async function buildInstallerTargets(artifact, target, formats) {
  const outputDir = join(artifact.rootPath, 'installer')
  await mkdir(outputDir, { recursive: true })
  const baseConfig = packagedBuilderConfig(outputDir, target, artifact.appDir)
  for (const format of formats) {
    await withSmokeEnvironment(async () => await build({
      projectDir: artifact.appDir,
      targets: target.builder.createTarget(format, target.architecture),
      config: {
        ...baseConfig,
        electronVersion: electronPackage.version,
        [target.key]: { ...baseConfig[target.key], target: [format] },
      },
    }))
  }
  return outputDir
}

async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function inspectMacBundle(appPath) {
  await validateMacBundle(appPath)
  const executable = join(appPath, 'Contents', 'MacOS', contract.identity.productName)
  assert.equal((await stat(executable)).isFile(), true)
  const asarPath = join(appPath, 'Contents', 'Resources', 'app.asar')
  assert.equal((await stat(asarPath)).isFile(), true)
  const plistPath = join(appPath, 'Contents', 'Info.plist')
  const plist = await execFileAsync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath])
  const metadata = JSON.parse(plist.stdout)
  assert.equal(metadata.CFBundleIdentifier, contract.identity.appId)
  assert.equal(metadata.CFBundleName, contract.identity.productName)
  const signature = await execFileAsync('/usr/bin/codesign', ['-dv', '--verbose=4', appPath]).catch(error => ({ stdout: error.stdout ?? '', stderr: error.stderr ?? '' }))
  const signatureText = `${signature.stdout}\n${signature.stderr}`
  assert.match(signatureText, /Signature=adhoc/u, 'local installed evidence must be ad-hoc, not public signing evidence')
  return Object.freeze({
    appId: metadata.CFBundleIdentifier,
    asarPath,
    executable,
    signature: 'adhoc',
    resources: true,
  })
}

async function installedSession(executable, userData, inventory, target, options = {}) {
  const port = await freePort()
  const launched = await launchPackaged(
    executable,
    userData,
    port,
    options.args ?? [],
    { flag: smokeFlag, env: { TOCKTEAM_INSTALLED_SMOKE: '1' } },
  )
  try {
    const renderer = await runRendererSmoke(launched.workbench, launched.launcher, inventory, userData, options.installRoot)
    const platform = await runPlatformOutcomeSmoke(launched.workbench, launched.launcher, target)
    const secondInstance = await runSecondInstanceSmoke(executable, userData, launched.workbench, launched.launcher)
    return Object.freeze({ platform, renderer, secondInstance, launched })
  } catch (error) {
    await stopPackagedChild(launched.child)
    throw error
  }
}

async function closeInstalledSession(session) {
  session.launched.launcher.close()
  session.launched.workbench.close()
  await stopPackagedChild(session.launched.child)
}

async function runSecondInstanceSmoke(executable, userData, workbench, launcher) {
  const second = spawn(executable, [
    `--user-data-dir=${userData}`,
    '--toggle',
    smokeFlag,
  ], {
    cwd: root,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    env: smokeEnvironment({ TOCKTEAM_INSTALLED_SMOKE: '1' }, userData),
  })
  try {
    await waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'), visible => visible === true, 10_000)
    await launcher.evaluate('(async () => await window.tockteamLauncher?.dismiss())()')
    await waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'), visible => visible === false, 10_000)
    return Object.freeze({ singleInstance: true, permissions: 'renderer-permission-denied' })
  } finally {
    await stopPackagedChild(second)
  }
}

function assertPackageParity(expected, actual) {
  assert.equal(actual.appId, expected.appId, 'installed app identity drifted')
  assert.equal(actual.productName, expected.productName, 'installed product name drifted')
  assert.equal(actual.version, expected.version, 'installed package version drifted')
  assert.equal(actual.assetCount, expected.assetCount, 'installed launcher asset count drifted')
  assert.equal(actual.vendorSourceShipped, expected.vendorSourceShipped, 'installed vendor-source contract drifted')
  assert.deepEqual(actual.extraResources.roots, expected.extraResources.roots, 'installed extra-resource roots drifted')
}

async function readPersistedSetting(executable, userData, target, key, expected) {
  const port = await freePort()
  const launched = await launchPackaged(
    executable,
    userData,
    port,
    target.key === 'linux' ? ['--no-sandbox'] : [],
    { flag: smokeFlag, env: { TOCKTEAM_INSTALLED_SMOKE: '1' } },
  )
  try {
    const value = await launched.workbench.evaluate(`(async () => (await window.dshDesktop?.launcher?.settings?.getSnapshot())?.values?.[${JSON.stringify(key)}] ?? null)()`)
    assert.deepEqual(value, expected)
    await launched.launcher.evaluate('(async () => await window.tockteamLauncher?.dismiss())()')
    return Object.freeze({ restored: value, runtimeReady: await launched.workbench.evaluate('(async () => (await window.dshDesktop?.getRuntimeSnapshot())?.status)()') })
  } finally {
    launched.launcher.close()
    launched.workbench.close()
    await stopPackagedChild(launched.child)
  }
}

async function runPlatformOutcomeSmoke(workbench, launcher, target) {
  const extraIds = target.key === 'win'
    ? ['WindowsControlPanel', 'TerminalLauncher']
    : target.key === 'linux'
      ? ['BrowserBookmarks', 'FileSearch', 'TerminalLauncher']
      : ['WindowsControlPanel', 'TerminalLauncher']
  const snapshot = await workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.getSnapshot())()`)
  const original = Array.isArray(snapshot?.values?.['extensions.enabledExtensionIds'])
    ? snapshot.values['extensions.enabledExtensionIds']
    : []
  const enabled = [...new Set([...original, ...extraIds])]
  await workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('extensions.enabledExtensionIds', ${JSON.stringify(enabled)}))()`)
  const expectedStates = target.key === 'win'
    ? { WindowsControlPanel: 'ready', TerminalLauncher: 'ready' }
    : target.key === 'linux'
      ? { BrowserBookmarks: 'unsupported', FileSearch: 'unsupported', TerminalLauncher: 'unsupported' }
      : { WindowsControlPanel: 'unsupported' }
  const settings = await waitFor(
    () => launcher.evaluate('(async () => await window.tockteamLauncher?.getSurfaceSettings())()'),
    value => Array.isArray(value?.providerStatuses)
      && value.providerStatuses.length === 24
      && Object.entries(expectedStates).every(([id, state]) => value.providerStatuses.some(status => status.extensionId === id && status.state === state)),
    10_000,
  )
  const statuses = Object.fromEntries(settings.providerStatuses.map(status => [status.extensionId, status.state]))
  assert.equal(settings.providerStatuses.length, 24, 'installed launcher provider catalog is incomplete')
  if (target.key === 'linux') {
    assert.equal(statuses.FileSearch, 'unsupported')
    assert.equal(statuses.TerminalLauncher, 'unsupported')
    assert.equal(statuses.BrowserBookmarks, 'unsupported')
    assert.equal(snapshot.customBrowserStatus ?? 'none', 'none')
    return Object.freeze({ customBrowser: 'system-browser-only', fileSearch: statuses.FileSearch, providerCount: settings.providerStatuses.length, terminal: statuses.TerminalLauncher })
  }
  if (target.key === 'mac') {
    assert.equal(statuses.WindowsControlPanel, 'unsupported')
    return Object.freeze({ controlPanel: statuses.WindowsControlPanel, destructiveEffects: 'not-invoked', providerCount: settings.providerStatuses.length, terminal: statuses.TerminalLauncher })
  }
  assert.equal(statuses.WindowsControlPanel, 'ready')
  assert.equal(statuses.TerminalLauncher, 'ready')
  const terminalAction = await launcher.evaluate(`(async () => {
    const response = await window.tockteamLauncher?.search('>', { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' })
    return [...(response?.before ?? []), ...(response?.after ?? [])].find(item => item.sourceExtension === 'TerminalLauncher')?.defaultAction ?? null
  })()`)
  assert.equal(terminalAction?.requiresConfirmation, true, 'Windows terminal actions must require elevation confirmation')
  return Object.freeze({ controlPanel: statuses.WindowsControlPanel, destructiveEffects: 'not-invoked', elevation: 'confirmation-required-not-invoked', providerCount: settings.providerStatuses.length, terminal: statuses.TerminalLauncher })
}

async function runMacInstalledSmoke(artifact) {
  // electron-builder's package input and staged node_modules are large. They
  // are no longer needed once the actual app bundle exists, so remove them
  // before copying the bundle into the disposable Applications-like root.
  await rm(artifact.appDir, { recursive: true, force: true })
  await rm(join(dirname(artifact.appDir), 'deploy-source'), { recursive: true, force: true })
  const sourceApp = artifact.inventory.executable.split('/Contents/MacOS/')[0]
  const applicationsRoot = join(artifact.rootPath, 'Applications')
  await mkdir(applicationsRoot, { recursive: true })
  const destination = join(applicationsRoot, 'TockTeam Desktop.app')
  const backupDirectory = join(artifact.rootPath, 'Trash')
  const copyBundle = async (from, to) => {
    // APFS clone copy keeps the atomic pending-bundle replacement semantics
    // without requiring a second 2.5 GiB physical runtime copy. Fall back only
    // when the host filesystem cannot clone; never hide ENOSPC.
    try {
      await execFileAsync('/bin/cp', ['-cR', from, to])
    } catch (error) {
      const detail = `${error?.message ?? ''} ${error?.stderr ?? ''}`
      if (!/(?:clone|illegal option|operation not supported|not supported)/iu.test(detail)) throw error
      await execFileAsync('/usr/bin/ditto', [from, to])
    }
  }
  const install = async () => await replaceMacBundle({
    source: sourceApp,
    destination,
    backupDirectory,
    copyBundle,
  })
  await install()
  const identity = await inspectMacBundle(destination)
  const installedInventory = await inspectPackage(destination, artifact.target, { executable: identity.executable })
  assertPackageParity(artifact.inventory, installedInventory)
  const first = await installedSession(destination + '/Contents/MacOS/TockTeam Desktop', artifact.userData, installedInventory, artifact.target, { installRoot: destination })
  const persistedValue = first.renderer.settingsRoundTrip.changed
  await first.launched.workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.fuzziness', ${String(persistedValue)}))()`)
  await closeInstalledSession(first)

  const reinstall = await install()
  const reinstalledIdentity = await inspectMacBundle(destination)
  const reinstalledInventory = await inspectPackage(destination, artifact.target, { executable: reinstalledIdentity.executable })
  assertPackageParity(artifact.inventory, reinstalledInventory)
  const restored = await readPersistedSetting(
    destination + '/Contents/MacOS/TockTeam Desktop',
    artifact.userData,
    artifact.target,
    'searchEngine.fuzziness',
    persistedValue,
  )
  const beforeRollback = await hashFile(identity.asarPath)
  await assert.rejects(replaceMacBundle({
    source: sourceApp,
    destination,
    backupDirectory,
    copyBundle,
    validateBundle: async path => {
      await validateMacBundle(path)
      if (resolve(path) === resolve(destination)) throw new Error('installed smoke rollback validation failure')
    },
  }), /rollback validation failure/u)
  const afterRollback = await hashFile(join(destination, 'Contents', 'Resources', 'app.asar'))
  assert.equal(afterRollback, beforeRollback)
  assert.equal(existsSync(join(applicationsRoot, '.TockTeam Desktop.app.install.lock')), false)
  await rm(destination, { recursive: true, force: true })
  await rm(backupDirectory, { recursive: true, force: true })
  const temporaryInstallRemoved = !existsSync(destination)
  assert.equal(temporaryInstallRemoved, true)
  return Object.freeze({
    classification: 'unsigned/internal macOS evidence (ad-hoc signed for local execution); not notarized or public distribution',
    identity,
    package: {
      appPath: artifact.inventory.appPath,
      assetCount: artifact.inventory.assetCount,
      extraResources: artifact.inventory.extraResources,
      vendorSourceShipped: artifact.inventory.vendorSourceShipped,
    },
    renderer: {
      launcher: first.renderer.launcher,
      runtimeArchitecture: first.renderer.runtimeArchitecture,
      search: first.renderer.search,
      security: first.renderer.security,
      settingsRoundTrip: first.renderer.settingsRoundTrip,
      workbench: first.renderer.workbench,
    },
    reinstallSettings: { backup: reinstall.backup !== undefined, identity: reinstalledIdentity, settings: restored, version: reinstalledInventory.version },
    rollback: { preservedAsarSha256: afterRollback, validationFailureRecovered: true },
    provider: first.platform,
    secondInstance: first.secondInstance,
    temporaryInstallRemoved,
  })
}

async function runAppImageSmoke(appImage, userData) {
  const port = await freePort()
  const launched = await launchPackaged(
    appImage,
    userData,
    port,
    ['--appimage-extract-and-run', '--no-sandbox'],
    { flag: smokeFlag, env: { TOCKTEAM_INSTALLED_SMOKE: '1' } },
  )
  try {
    const title = await launched.launcher.evaluate('document.title')
    assert.equal(title, 'TockLauncher')
    return Object.freeze({ runtimeReady: await launched.workbench.evaluate('(async () => (await window.dshDesktop?.getRuntimeSnapshot())?.status)()'), launcherTitle: title })
  } finally {
    launched.launcher.close()
    launched.workbench.close()
    await stopPackagedChild(launched.child)
  }
}

async function runNonMacInstalledSmoke(artifact) {
  const formats = artifact.target.key === 'win' ? ['nsis'] : ['deb', 'AppImage']
  const installerDir = await buildInstallerTargets(artifact, artifact.target, formats)
  const report = { installerDir, formats }
  if (artifact.target.key === 'win') {
    const installer = await findNsisInstaller(installerDir, artifact.target.architecture)
    const installDir = join(artifact.rootPath, 'installed')
    await runProcess(installer, ['/S', `/D=${installDir}`], { disposableRoot: artifact.rootPath })
    const executable = join(installDir, `${contract.identity.productName}.exe`)
    assert.equal((await stat(executable)).isFile(), true, 'installed Windows executable is missing')
    const installedInventory = await inspectPackage(installDir, artifact.target, { executable })
    assertPackageParity(artifact.inventory, installedInventory)
    const smoke = await installedSession(executable, artifact.userData, installedInventory, artifact.target, { installRoot: installDir })
    const persistedValue = smoke.renderer.settingsRoundTrip.changed
    await smoke.launched.workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.fuzziness', ${String(persistedValue)}))()`)
    await closeInstalledSession(smoke)
    await runProcess(installer, ['/S', `/D=${installDir}`], { disposableRoot: artifact.rootPath })
    const reinstalledInventory = await inspectPackage(installDir, artifact.target, { executable })
    assertPackageParity(artifact.inventory, reinstalledInventory)
    const reinstall = await readPersistedSetting(executable, artifact.userData, artifact.target, 'searchEngine.fuzziness', persistedValue)
    const uninstaller = join(installDir, 'Uninstall TockTeam Desktop.exe')
    assert.equal((await stat(uninstaller)).isFile(), true, 'installed Windows uninstaller is missing')
    await runProcess(uninstaller, ['/S'], { disposableRoot: artifact.rootPath })
    assert.equal(existsSync(installDir), false, 'Windows uninstaller did not remove the installed artifact')
    report.installed = {
      artifact: installer,
      executable,
      package: installedInventory,
      provider: smoke.platform,
      secondInstance: smoke.secondInstance,
      reinstall: { package: reinstalledInventory, settings: reinstall },
      rollback: { state: 'workflow-required', reason: 'NSIS has no atomic rollback transaction' },
      uninstall: 'nsis-uninstaller-passed',
    }
  } else {
    const deb = await findFile(installerDir, entry => entry.name.endsWith('.deb'))
    const appImage = await findFile(installerDir, entry => entry.name.endsWith('.AppImage'))
    assert.ok(deb && appImage)
    const packageName = (await runProcess('/usr/bin/dpkg-deb', ['-f', deb, 'Package'], { disposableRoot: artifact.rootPath })).stdout.trim()
    const packageVersion = (await runProcess('/usr/bin/dpkg-deb', ['-f', deb, 'Version'], { disposableRoot: artifact.rootPath })).stdout.trim()
    const installDir = join(artifact.rootPath, 'deb-root')
    const adminDir = join(installDir, 'var', 'lib', 'dpkg')
    await mkdir(adminDir, { recursive: true })
    await writeFile(join(adminDir, 'status'), '', 'utf8')
    const dpkg = async args => await runProcess('/usr/bin/sudo', ['-n', '/usr/bin/dpkg', `--root=${installDir}`, `--admindir=${adminDir}`, `--instdir=${installDir}`, ...args], { disposableRoot: artifact.rootPath })
    const dpkgQuery = async args => await runProcess('/usr/bin/sudo', ['-n', '/usr/bin/dpkg-query', `--admindir=${adminDir}`, ...args], { disposableRoot: artifact.rootPath })
    const installedVersion = async () => (await dpkgQuery(['--showformat=${Version}', '--show', packageName])).stdout.trim()
    await dpkg(['--unpack', deb])
    assert.equal(await installedVersion(), packageVersion, 'isolated dpkg registration/version mismatch')
    const installedInventory = await inspectPackage(installDir, artifact.target)
    assertPackageParity(artifact.inventory, installedInventory)
    const debSmoke = await installedSession(installedInventory.executable, artifact.userData, installedInventory, artifact.target, { args: ['--no-sandbox'], installRoot: installDir })
    const persistedValue = debSmoke.renderer.settingsRoundTrip.changed
    await debSmoke.launched.workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.fuzziness', ${String(persistedValue)}))()`)
    await closeInstalledSession(debSmoke)
    await dpkg(['--unpack', deb])
    assert.equal(await installedVersion(), packageVersion, 'isolated dpkg reinstall/version mismatch')
    const reinstalledInventory = await inspectPackage(installDir, artifact.target)
    assertPackageParity(artifact.inventory, reinstalledInventory)
    const debReinstall = await readPersistedSetting(reinstalledInventory.executable, artifact.userData, artifact.target, 'searchEngine.fuzziness', persistedValue)
    await dpkg(['--purge', packageName])
    await assert.rejects(installedVersion(), /failed with status/u)
    await rm(installDir, { recursive: true, force: true })
    assert.equal(existsSync(installDir), false, 'isolated dpkg cleanup did not remove its root')

    const appImageRoot = join(artifact.rootPath, 'appimage')
    await mkdir(appImageRoot, { recursive: true })
    await runProcess(appImage, ['--appimage-extract'], { cwd: appImageRoot, disposableRoot: artifact.rootPath })
    const extractedRoot = join(appImageRoot, 'squashfs-root')
    const appImageInventory = await inspectPackage(extractedRoot, artifact.target)
    assertPackageParity(artifact.inventory, appImageInventory)
    const appImageSmoke = await runAppImageSmoke(appImage, join(artifact.userData, 'appimage'))
    report.installed = {
      appImage: { package: appImageInventory, runtime: appImageSmoke },
      deb: { package: installedInventory, provider: debSmoke.platform, secondInstance: debSmoke.secondInstance, reinstall: { package: reinstalledInventory, settings: debReinstall }, rollback: { state: 'workflow-required', reason: 'dpkg has no atomic rollback transaction' }, uninstall: 'dpkg-purge-passed' },
    }
  }
  return Object.freeze(report)
}

async function main() {
  if (process.platform === 'darwin' && process.arch !== 'arm64' && process.arch !== 'x64') throw new Error(`Unsupported macOS architecture: ${process.arch}`)
  const parent = process.env.TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT?.trim() || tmpdir()
  await mkdir(parent, { recursive: true })
  const smokeRoot = await mkdtemp(join(parent, 'tockteam-installed-launcher-smoke-'))
  const reportPath = process.env.TOCKTEAM_INSTALLED_SMOKE_REPORT?.trim() || join(parent, `tockteam-installed-smoke-${String(process.pid)}.json`)
  let evidence
  try {
    const artifact = await preparePackagedArtifact({ smokeRoot })
    evidence = process.platform === 'darwin'
      ? await runMacInstalledSmoke(artifact)
      : await runNonMacInstalledSmoke(artifact)
    evidence = Object.freeze({
      ...evidence,
      appId: contract.identity.appId,
      architecture: process.arch,
      version: packageJson.version,
      platform: process.platform,
      productName: contract.identity.productName,
    })
  } finally {
    const keepArtifacts = process.env.TOCKTEAM_KEEP_INSTALLED_SMOKE === '1'
    if (!keepArtifacts) await rm(smokeRoot, { recursive: true, force: true })
    else console.log(`TockTeam installed launcher smoke artifacts retained at ${smokeRoot}`)
  }
  const finalEvidence = Object.freeze({
    ...evidence,
    cleanup: {
      smokeRootRemoved: process.env.TOCKTEAM_KEEP_INSTALLED_SMOKE === '1' ? false : !existsSync(smokeRoot),
      temporaryInstallRemoved: evidence?.temporaryInstallRemoved ?? true,
    },
  })
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(finalEvidence, null, 2)}\n`, 'utf8')
  console.log(`${smokeMarker}${JSON.stringify(finalEvidence)}`)
  console.log(`Installed TockLauncher smoke passed on ${process.platform}-${process.arch}: ${contract.identity.appId}.`)
}

if (process.argv.includes(smokeFlag)) await main()
else {
  console.error(`This installed smoke requires ${smokeFlag}`)
  process.exitCode = 2
}
