#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function failure(failures, condition, message) {
  if (!condition) failures.push(message)
}

export function inspectInstalledReport(report, expected) {
  const failures = []
  failure(failures, report !== null && typeof report === 'object', 'installed report is not an object')
  failure(failures, report?.version === expected.version, `installed report version differs from ${expected.version}`)
  failure(failures, report?.appId === 'ai.deepseek.tockteam-desktop', 'installed report app identity is missing')
  failure(failures, report?.productName === 'TockTeam Desktop', 'installed report product identity is missing')
  failure(failures, report?.platform === expected.platform, `installed report platform differs from ${expected.platform}`)
  if (expected.platform === 'win32' || expected.platform === 'linux') {
    const packages = [report?.installed?.package, report?.installed?.deb?.package, report?.installed?.appImage?.package]
      .filter(value => value !== null && typeof value === 'object')
    failure(failures, packages.length > 0, 'installed report has no post-install package inventory')
    for (const packageInventory of packages) {
      failure(failures, packageInventory.version === expected.version, 'post-install package version differs from the report')
      failure(failures, packageInventory.appId === 'ai.deepseek.tockteam-desktop', 'post-install package identity is missing')
      failure(failures, packageInventory.productName === 'TockTeam Desktop', 'post-install package product identity is missing')
      failure(failures, packageInventory.assetCount === 65, 'post-install launcher asset inventory is incomplete')
      failure(failures, packageInventory.vendorSourceShipped === false, 'post-install package vendor-source contract is not closed')
    }
  }
  return Object.freeze({ failures: Object.freeze(failures) })
}

export async function main() {
  const reportPath = process.argv[2]
  if (reportPath === undefined) throw new Error('usage: check-installed-report.mjs <report.json>')
  const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'))
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const result = inspectInstalledReport(report, { platform: process.platform, version: packageJson.version })
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
