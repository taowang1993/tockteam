import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { LAUNCHER_COMPOSITION } from '../src/launcher-contract.ts'
import { LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS } from '../src/launcher-local-extension-assets.ts'
import { LAUNCHER_DISCOVERY_ASSETS } from '../src/launcher-discovery-assets.ts'
import { LAUNCHER_FILE_SEARCH_ASSETS } from '../src/launcher-file-search-assets.ts'
import { LAUNCHER_NETWORK_ASSETS } from '../src/launcher-network-assets.ts'
import { LAUNCHER_OS_ASSETS } from '../src/launcher-os-assets.ts'
import { LAUNCHER_TERMINAL_ASSETS } from '../src/launcher-terminal-assets.ts'
import { LAUNCHER_WORKFLOW_ASSETS } from '../src/launcher-workflow-assets.ts'
import { LAUNCHER_CSP } from '../src/launcher-security.ts'

const root = join(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  build?: { asar?: boolean; files?: unknown; extraResources?: unknown }
}
const mainSource = readFileSync(join(root, 'src/main.ts'), 'utf8')
const contract = JSON.parse(readFileSync(join(root, 'scripts/ueli/desktop-release-contract.json'), 'utf8')) as {
  identity: { appId: string; executableName: string; packageName: string; productName: string }
  foundation: { launcherAssets: readonly { key: string; path: string; sha256: string }[]; launcherNotices: readonly unknown[] }
  resources: { asar: boolean; builderFiles: readonly string[]; builderExtraResources: readonly unknown[] }
}

const packagedSmoke = readFileSync(join(root, 'scripts/launcher-packaged-smoke.mjs'), 'utf8')

test('package contract admits the complete launcher resource inventory', () => {
  assert.equal(packageJson.build?.asar, true)
  assert.equal(contract.resources.asar, true)
  assert.deepEqual(packageJson.build?.files, contract.resources.builderFiles)
  assert.deepEqual(packageJson.build?.extraResources, contract.resources.builderExtraResources)
  assert.ok(contract.resources.builderFiles.includes('dist/main.js'))
  assert.ok(contract.resources.builderFiles.includes('dist/preload.cjs'))
  assert.ok(contract.resources.builderFiles.includes('dist/launcher.html'))
  assert.ok(contract.resources.builderFiles.includes('dist/launcher.js'))
  assert.ok(contract.resources.builderFiles.includes('dist/launcher.css'))
  assert.ok(contract.resources.builderFiles.includes('dist/launcher-preload.cjs'))
  assert.ok(contract.resources.builderFiles.includes('dist/launcher-assets/**'))
  assert.ok(contract.resources.builderFiles.includes('THIRD_PARTY_NOTICES.md'))
  assert.equal(contract.foundation.launcherAssets.length, 65)
  assert.equal(
    new Set([
      ...Object.values(LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS).map(imageKey => `${imageKey}.png`),
      ...LAUNCHER_DISCOVERY_ASSETS.map(asset => asset.fileName),
      ...LAUNCHER_FILE_SEARCH_ASSETS.map(asset => asset.fileName),
      ...LAUNCHER_NETWORK_ASSETS.map(asset => asset.fileName),
      ...LAUNCHER_OS_ASSETS.map(asset => asset.fileName),
      ...LAUNCHER_TERMINAL_ASSETS.map(asset => asset.fileName),
      ...LAUNCHER_WORKFLOW_ASSETS.map(asset => asset.fileName),
    ]).size,
    65,
  )
  assert.equal(contract.foundation.launcherNotices.length, 4)
})

test('packaged smoke is actual TockTeam ASAR execution, not a source fixture', () => {
  assert.match(packagedSmoke, /electron-builder/u)
  assert.match(packagedSmoke, /app\.asar/u)
  assert.match(packagedSmoke, /app\.isPackaged/u)
  assert.match(packagedSmoke, /TOCKTEAM_PACKAGED_SMOKE/u)
  assert.match(packagedSmoke, /tockteam-launcher-packaged-smoke/u)
  assert.match(packagedSmoke, /contextIsolation/u)
  assert.match(packagedSmoke, /nodeIntegration/u)
  assert.match(packagedSmoke, /sandbox/u)
  assert.match(packagedSmoke, /notificationPermission/u)
  assert.match(packagedSmoke, /LAUNCHER_CSP|default-src 'none'/u)
  assert.match(packagedSmoke, /vendor/u)
  assert.match(packagedSmoke, /ueli/u)
  assert.match(packagedSmoke, /TockLauncher/u)
  assert.match(packagedSmoke, /TockTeam/u)
  assert.match(packagedSmoke, /Base64 Conversion/u)
  assert.match(packagedSmoke, /getSnapshot/u)
  assert.match(packagedSmoke, /updateSetting/u)
  assert.match(packagedSmoke, /clean|finally/u)
  assert.doesNotMatch(packagedSmoke, /TOCKTEAM_SKIP_LAUNCHER_PACKAGE_BUILD/u)
  assert.match(packagedSmoke, /build:tocktutor/u)
  assert.match(packagedSmoke, /build:dsh/u)
  assert.match(packagedSmoke, /stage:dsh/u)
  assert.match(mainSource, /launcherPackagedSmokeEnabled/u)
  assert.match(mainSource, /app\.isPackaged[\s\S]+TOCKTEAM_PACKAGED_SMOKE/u)
  assert.match(mainSource, /packaged-smoke-security\.json/u)
  assert.match(mainSource, /LAUNCHER_SESSION_PARTITION/u)
  assert.match(readFileSync(join(root, 'src/launcher-security.ts'), 'utf8'), /persist:tockteam-launcher/u)
  assert.deepEqual(LAUNCHER_COMPOSITION.extensionIds.length, 24)
  assert.equal(contract.identity.packageName, '@tockteam/desktop')
  assert.equal(contract.identity.productName, 'TockTeam Desktop')
  assert.equal(contract.identity.appId, 'ai.deepseek.tockteam-desktop')
  assert.equal(contract.identity.executableName, 'tockteam-desktop')
  assert.equal(LAUNCHER_CSP, "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'")
})

test('packaged dependency contract has no unreviewed Ueli runtime closure', () => {
  assert.equal(packageJson.dependencies?.['fuse.js'], '7.1.0')
  assert.equal(packageJson.dependencies?.fuzzysort, '3.1.0')
  assert.equal(packageJson.dependencies?.color, '4.2.3')
  assert.equal(packageJson.dependencies?.mathjs, '15.2.0')
  assert.equal(packageJson.dependencies?.uuid, '14.0.0')
  assert.equal(Object.keys(packageJson.dependencies ?? {}).includes('ueli'), false)
  assert.equal(JSON.stringify(packageJson).includes('vendor/ueli'), false)
})
