#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXPECTED_ROOTS = Object.freeze(['dsh-runtime', 'node-runtime', 'tockteam-desktop.png', 'lib/tockteam/cli.js', 'lib/tockteam/package.json', 'bin/tockteam', 'bin/tockteam.cmd'])

function failure(failures, condition, message) {
  if (!condition) failures.push(message)
}

function object(value) {
  return value !== null && typeof value === 'object'
}

function contained(rootPath, candidatePath) {
  if (typeof rootPath !== 'string' || typeof candidatePath !== 'string') return false
  const child = relative(resolve(rootPath), resolve(candidatePath))
  return child === '' || (!child.startsWith('..') && !isAbsolute(child) && !child.includes(':'))
}

function inspectPackageInventory(failures, packageInventory, installRoot, expected) {
  failure(failures, object(packageInventory), 'post-install package inventory is missing')
  if (!object(packageInventory)) return
  failure(failures, packageInventory.version === expected.version, 'post-install package version differs from the report')
  failure(failures, packageInventory.appId === expected.appId, 'post-install package identity is missing')
  failure(failures, packageInventory.productName === expected.productName, 'post-install package product identity is missing')
  failure(failures, packageInventory.assetCount === 65, 'post-install launcher asset inventory is incomplete')
  failure(failures, packageInventory.assetsVerified === true, 'post-install launcher asset hashes were not verified')
  failure(failures, packageInventory.noticesVerified === true, 'post-install notices were not verified')
  failure(failures, packageInventory.appPathUsesAsar === true && /(?:^|[\\/])app\.asar$/u.test(packageInventory.appPath ?? ''), 'post-install package ASAR identity is missing')
  failure(failures, contained(installRoot, packageInventory.appPath), 'post-install app.asar escaped its install root')
  failure(failures, JSON.stringify(packageInventory.extraResources?.roots) === JSON.stringify(EXPECTED_ROOTS), 'post-install extra-resource roots differ from the exact contract')
  const vendorScan = packageInventory.vendorScan
  failure(failures, object(vendorScan), 'post-install vendor scan is missing')
  failure(failures, vendorScan?.scope === 'bounded-no-follow', 'post-install vendor scan scope is not bounded-no-follow')
  failure(failures, Number.isSafeInteger(vendorScan?.maxEntries) && vendorScan.maxEntries === 4_096, 'post-install vendor scan maxEntries is invalid')
  failure(failures, Number.isSafeInteger(vendorScan?.checkedEntries) && vendorScan.checkedEntries >= 0 && vendorScan.checkedEntries <= (vendorScan.maxEntries ?? -1), 'post-install vendor scan entry count is invalid')
  failure(failures, Number.isSafeInteger(vendorScan?.maxDepth) && vendorScan.maxDepth === 2, 'post-install vendor scan maxDepth is invalid')
  failure(failures, vendorScan?.forbiddenSourceFound === false && vendorScan?.launcherSourceAbsent === true, 'post-install vendor scan did not prove its declared bounded scope')
}

function inspectPackage(failures, packageInventory, renderer, installRoot, expected) {
  inspectPackageInventory(failures, packageInventory, installRoot, expected)
  failure(failures, object(renderer), 'post-install renderer evidence is missing')
  failure(failures, renderer?.security?.appPath === packageInventory?.appPath, 'installed renderer security path does not match the inspected app.asar')
  failure(failures, renderer?.launcher?.notificationPermission === 'denied', 'installed renderer permission evidence is missing')
}

function inspectSettings(failures, settings, installRoot, expected) {
  failure(failures, object(settings), 'installed settings-reinstall evidence is missing')
  inspectPackageInventory(failures, settings?.package, installRoot, expected)
  failure(failures, settings?.settings?.restored !== undefined, 'installed settings-reinstall value is missing')
  failure(failures, settings?.settings?.runtimeReady === 'ready', 'installed settings-reinstall runtime was not ready')
}

function inspectSecondInstance(failures, secondInstance) {
  failure(failures, secondInstance?.singleInstance === true, 'installed second-instance evidence is missing')
  failure(failures, secondInstance?.permissions === 'renderer-permission-denied', 'installed permission evidence is missing')
}

export function inspectInstalledReport(report, expected) {
  const failures = []
  failure(failures, object(report), 'installed report is not an object')
  failure(failures, report?.result === 'passed', 'installed report did not pass')
  failure(failures, /^[0-9a-f]{40}$/u.test(report?.sourceCommit ?? ''), 'installed report source commit is not immutable')
  if (expected.commit !== undefined) failure(failures, report?.sourceCommit === expected.commit, 'installed report source commit differs from the workflow commit')
  failure(failures, report?.version === expected.version, `installed report version differs from ${expected.version}`)
  failure(failures, report?.appId === expected.appId, 'installed report app identity is missing')
  failure(failures, report?.productName === expected.productName, 'installed report product identity is missing')
  failure(failures, report?.platform === expected.platform, `installed report platform differs from ${expected.platform}`)
  failure(failures, report?.cleanup?.temporaryInstallRemoved === true, 'installed temporary artifact cleanup did not pass')
  failure(failures, report?.cleanup?.processTreesGone === true, 'installed process-tree cleanup did not pass')
  if (expected.platform === 'win32') {
    const installed = report?.installed
    failure(failures, object(installed), 'Windows installed lifecycle evidence is missing')
    if (object(installed)) {
      failure(failures, installed.portableArchive?.format === 'zip' && /\.zip$/iu.test(installed.portableArchive?.path ?? ''), 'Windows portable archive evidence is missing')
      failure(failures, installed.portableArchive?.version === expected.version, 'Windows portable archive version differs')
      inspectPackage(failures, installed.package, installed.renderer, installed.installRoot, expected)
      inspectSettings(failures, installed.reinstall, installed.installRoot, expected)
      inspectSecondInstance(failures, installed.secondInstance)
      failure(failures, installed.rollback?.validationFailureRecovered === true && /^[0-9a-f]{64}$/u.test(installed.rollback?.preservedAsarSha256 ?? ''), 'Windows portable rollback evidence is missing')
      failure(failures, installed.cleanup?.installRootRemoved === true, 'Windows portable install cleanup did not pass')
    }
  } else if (expected.platform === 'darwin') {
    const installed = report?.installed
    failure(failures, object(installed), 'macOS installed lifecycle evidence is missing')
    if (object(installed)) {
      inspectPackage(failures, installed.package, installed.renderer, installed.installRoot, expected)
      const identity = installed.identity
      failure(failures, object(identity), 'macOS installed identity evidence is missing')
      failure(failures, identity?.appId === expected.appId && identity?.productName === expected.productName && identity?.version === expected.version, 'macOS installed identity differs from the report')
      failure(failures, identity?.asarPath === installed.package?.appPath && identity?.signature === 'adhoc' && identity?.resources === true, 'macOS installed signature/resource evidence is missing')
      inspectSettings(failures, installed.reinstallSettings, installed.installRoot, expected)
      const reinstallIdentity = installed.reinstallSettings?.identity
      failure(failures, object(reinstallIdentity), 'macOS reinstall identity evidence is missing')
      failure(failures, reinstallIdentity?.appId === expected.appId && reinstallIdentity?.productName === expected.productName && reinstallIdentity?.version === expected.version && reinstallIdentity?.asarPath === installed.reinstallSettings?.package?.appPath && reinstallIdentity?.signature === 'adhoc' && reinstallIdentity?.resources === true, 'macOS reinstall identity differs from the report')
      failure(failures, installed.rollback?.validationFailureRecovered === true && /^[0-9a-f]{64}$/u.test(installed.rollback?.preservedAsarSha256 ?? ''), 'macOS rollback evidence is missing')
      failure(failures, installed.provider?.providerCount === 24 && installed.provider?.controlPanel === 'unsupported' && installed.provider?.terminal === 'unsupported' && installed.provider?.destructiveEffects === 'not-invoked', 'macOS provider evidence is incomplete')
      inspectSecondInstance(failures, installed.secondInstance)
      failure(failures, installed.processTreesGone === true, 'macOS process-tree cleanup did not pass')
      failure(failures, installed.temporaryInstallRemoved === true, 'macOS temporary install cleanup did not pass')
    }
  } else if (expected.platform === 'linux') {
    const installed = report?.installed
    failure(failures, object(installed), 'Linux installed lifecycle evidence is missing')
    if (object(installed)) {
      const deb = installed.deb
      const appImage = installed.appImage
      failure(failures, object(deb), 'Linux deb lifecycle evidence is missing')
      if (object(deb)) {
        failure(failures, /\.deb$/iu.test(deb.artifact ?? ''), 'Linux deb artifact evidence is missing')
        inspectPackage(failures, deb.package, deb.renderer, deb.installRoot, expected)
        inspectSettings(failures, deb.reinstall, deb.installRoot, expected)
        inspectSecondInstance(failures, deb.secondInstance)
        failure(failures, deb.uninstall === 'dpkg-purge-passed', 'Linux deb purge evidence is missing')
        failure(failures, deb.rollback?.state === 'workflow-required', 'Linux deb rollback must remain explicitly workflow-required')
      }
      failure(failures, object(appImage), 'Linux AppImage lifecycle evidence is missing')
      if (object(appImage)) {
        failure(failures, /\.AppImage$/u.test(appImage.artifact ?? ''), 'Linux AppImage artifact evidence is missing')
        inspectPackage(failures, appImage.package, appImage.renderer, appImage.installRoot, expected)
        failure(failures, appImage.runtime?.runtimeReady === true, 'Linux AppImage runtime evidence is missing')
        inspectSecondInstance(failures, appImage.secondInstance)
      }
    }
  }
  return Object.freeze({ failures: Object.freeze(failures) })
}

export async function main() {
  const reportPath = process.argv[2]
  if (reportPath === undefined) throw new Error('usage: check-installed-report.mjs <report.json>')
  const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'))
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const configuredCommit = process.env.GITHUB_SHA?.trim()
  const result = inspectInstalledReport(report, {
    appId: 'ai.deepseek.tockteam-desktop',
    commit: /^[0-9a-f]{40}$/u.test(configuredCommit ?? '') ? configuredCommit : undefined,
    platform: process.platform,
    productName: 'TockTeam Desktop',
    version: packageJson.version,
  })
  if (result.failures.length > 0) {
    for (const message of result.failures) console.error(`- ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`Installed report contract passed: ${report.platform} ${report.version} ${report.appId}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    assert(error instanceof Error)
    console.error(error.message)
    process.exitCode = 1
  })
}
