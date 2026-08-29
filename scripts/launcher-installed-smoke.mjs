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
  currentTarget,
  freePort,
  launchPackaged,
  packagedBuilderConfig,
  preparePackagedArtifact,
  runRendererSmoke,
  stopPackagedChild,
} from './launcher-packaged-smoke.mjs'
import { replaceMacBundle, validateMacBundle } from './install-mac.mjs'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contract = JSON.parse(await readFile(join(root, 'scripts/ueli/desktop-release-contract.json'), 'utf8'))
const smokeFlag = '--tockteam-launcher-installed-smoke'
const smokeMarker = 'TOCKTEAM_INSTALLED_SMOKE '
const smokeTimeoutMs = 120_000

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}

function runProcess(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed with status ${String(code)}.\n${stdout}\n${stderr}`))
        return
      }
      resolvePromise({ stdout, stderr })
    })
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
    if (entry.isDirectory()) {
      const found = await findFile(absolutePath, predicate, depth + 1)
      if (found !== undefined) return found
    }
  }
  return undefined
}

async function buildInstallerTargets(artifact, target, formats) {
  const outputDir = join(artifact.rootPath, 'installer')
  await mkdir(outputDir, { recursive: true })
  for (const format of formats) {
    await build({
      projectDir: artifact.appDir,
      targets: target.builder.createTarget(format, target.architecture),
      config: {
        ...packagedBuilderConfig(outputDir, target, artifact.appDir),
        [target.key]: {
          ...packagedBuilderConfig(outputDir, target, artifact.appDir)[target.key],
          target: [format],
        },
      },
    })
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
  const launched = await launchPackaged(executable, userData, port, options.args ?? [])
  try {
    const renderer = await runRendererSmoke(launched.workbench, launched.launcher, inventory, userData)
    const platform = await runPlatformOutcomeSmoke(launched.workbench, launched.launcher, target)
    return Object.freeze({ platform, renderer, launched })
  } catch (error) {
    await stopPackagedChild(launched.child)
    throw error
  }
}

async function readPersistedSetting(executable, userData, target, key, expected) {
  const port = await freePort()
  const launched = await launchPackaged(executable, userData, port, target.key === 'linux' ? ['--no-sandbox'] : [])
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
    : ['BrowserBookmarks', 'FileSearch', 'TerminalLauncher']
  const snapshot = await workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.getSnapshot())()`)
  const original = Array.isArray(snapshot?.values?.['extensions.enabledExtensionIds'])
    ? snapshot.values['extensions.enabledExtensionIds']
    : []
  const enabled = [...new Set([...original, ...extraIds])]
  await workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('extensions.enabledExtensionIds', ${JSON.stringify(enabled)}))()`)
  const settings = await launcher.evaluate('(async () => await window.tockteamLauncher?.getSurfaceSettings())()')
  const statuses = Object.fromEntries(settings.providerStatuses.map(status => [status.extensionId, status.state]))
  if (target.key === 'linux') {
    assert.equal(statuses.FileSearch, 'unsupported')
    assert.equal(statuses.TerminalLauncher, 'unsupported')
    assert.equal(statuses.BrowserBookmarks, 'unsupported')
    assert.equal(snapshot.customBrowserStatus ?? 'none', 'none')
    return Object.freeze({ customBrowser: 'system-browser-only', fileSearch: statuses.FileSearch, terminal: statuses.TerminalLauncher })
  }
  assert.notEqual(statuses.WindowsControlPanel, 'unsupported')
  assert.notEqual(statuses.TerminalLauncher, 'unsupported')
  return Object.freeze({ controlPanel: statuses.WindowsControlPanel, terminal: statuses.TerminalLauncher, destructiveEffects: 'not-invoked' })
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
    await execFileAsync('/usr/bin/ditto', [from, to])
  }
  const install = async () => await replaceMacBundle({
    source: sourceApp,
    destination,
    backupDirectory,
    copyBundle,
  })
  await install()
  const identity = await inspectMacBundle(destination)
  const first = await installedSession(destination + '/Contents/MacOS/TockTeam Desktop', artifact.userData, artifact.inventory, artifact.target)
  const persistedValue = first.renderer.settingsRoundTrip.changed
  await first.launched.workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.fuzziness', ${String(persistedValue)}))()`)
  first.launched.launcher.close()
  first.launched.workbench.close()
  await stopPackagedChild(first.launched.child)

  const reinstall = await install()
  const reinstalledIdentity = await inspectMacBundle(destination)
  const restored = await readPersistedSetting(
    destination + '/Contents/MacOS/TockTeam Desktop',
    artifact.userData,
    artifact.target,
    'searchEngine.fuzziness',
    persistedValue,
  )
  const beforeRollback = await hashFile(identity.asarPath.replace(sourceApp, destination))
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
  return Object.freeze({
    classification: 'unsigned/internal macOS evidence; not signed, notarized, or public',
    identity,
    reinstall: { backup: reinstall.backup !== undefined, identity: reinstalledIdentity, settings: restored },
    rollback: { preservedAsarSha256: afterRollback, validationFailureRecovered: true },
    provider: first.platform,
  })
}

async function runNonMacInstalledSmoke(artifact) {
  const formats = artifact.target.key === 'win' ? ['nsis'] : ['deb', 'AppImage']
  const installerDir = await buildInstallerTargets(artifact, artifact.target, formats)
  const report = { installerDir, formats }
  if (artifact.target.key === 'win') {
    const installer = await findFile(installerDir, entry => entry.name.endsWith('.exe'))
    assert.ok(installer)
    const installDir = join(artifact.rootPath, 'installed')
    await runProcess(installer, ['/S', `/D=${installDir}`])
    const executable = await findFile(installDir, entry => entry.name.toLowerCase() === 'tockteam desktop.exe')
    assert.ok(executable, 'installed Windows executable is missing')
    const smoke = await installedSession(executable, artifact.userData, artifact.inventory, artifact.target)
    await runProcess(join(installDir, 'Uninstall TockTeam Desktop.exe'), ['/S']).catch(() => {})
    report.installed = { executable, provider: smoke.platform }
  } else {
    const deb = await findFile(installerDir, entry => entry.name.endsWith('.deb'))
    const appImage = await findFile(installerDir, entry => entry.name.endsWith('.AppImage'))
    assert.ok(deb && appImage)
    const installDir = join(artifact.rootPath, 'deb-root')
    await runProcess('dpkg-deb', ['--extract', deb, installDir])
    const debExecutable = await findFile(installDir, entry => entry.name === contract.identity.executableName)
    assert.ok(debExecutable, 'installed Linux deb executable is missing')
    const debSmoke = await installedSession(debExecutable, artifact.userData, artifact.inventory, artifact.target, { args: ['--no-sandbox'] })
    const appImageSmoke = await installedSession(appImage, artifact.userData, artifact.inventory, artifact.target, { args: ['--appimage-extract-and-run', '--no-sandbox'] })
    report.installed = {
      appImage: { provider: appImageSmoke.platform },
      deb: { executable: debExecutable, provider: debSmoke.platform },
      uninstall: 'disposable dpkg-deb extraction removed with smoke root',
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
      temporaryInstallRemoved: true,
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
