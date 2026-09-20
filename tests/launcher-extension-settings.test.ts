import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { trustedRaycastSettingsCatalogSource } from '../scripts/trusted-raycast-settings-catalog.mjs'
import { test } from 'node:test'
import { LAUNCHER_COMPOSITION } from '../src/launcher-contract.ts'
import { TRUSTED_RAYCAST_EXTENSION_IDS } from '../src/trusted-raycast-descriptors.ts'
import { LAUNCHER_SETTINGS_CATALOG } from '../src/launcher-setting-catalog.ts'
import { launcherExtensionPages, isLauncherExtensionId, launcherExtensionSupported, findLauncherExtensionPages, launcherExtensionSettingOwner } from '../src/launcher-extension-settings.ts'

test('every admitted extension has one settings destination, including no-options providers', () => {
  assert.deepEqual(launcherExtensionPages.map(page => page.id).sort(), [...LAUNCHER_COMPOSITION.extensionIds, ...TRUSTED_RAYCAST_EXTENSION_IDS].sort())
  assert.equal(new Set(launcherExtensionPages.map(page => page.id)).size, launcherExtensionPages.length)
  for (const page of launcherExtensionPages) assert.ok(page.label && page.editor && isLauncherExtensionId(page.id))
  for (const id of ['', '../Calculator', 'unknown', {}, null, 'toString']) assert.equal(isLauncherExtensionId(id), false)
})

test('search finds settings by labels as well as extension names', () => {
  assert.deepEqual(findLauncherExtensionPages('precision').map(page => page.id), ['Calculator'])
  assert.deepEqual(findLauncherExtensionPages('API Key').map(page => page.id), ['DeeplTranslator'])
  assert.deepEqual(findLauncherExtensionPages('proxy').map(page => page.id), ['google-translate'])
  assert.deepEqual(findLauncherExtensionPages('not-a-setting'), [])
})

test('search finds translated names and field labels without losing English search', () => {
  const translated: Record<string, string> = { Calculator: '计算器', 'Calculator Precision': '计算器精度', 'Proxy Override': '代理覆盖' }
  const translate = (label: string) => translated[label] ?? label
  assert.deepEqual(findLauncherExtensionPages('计算器', translate).map(page => page.id), ['Calculator'])
  assert.deepEqual(findLauncherExtensionPages('精度', translate).map(page => page.id), ['Calculator'])
  assert.deepEqual(findLauncherExtensionPages('代理', translate).map(page => page.id), ['google-translate'])
  assert.deepEqual(findLauncherExtensionPages('precision', translate).map(page => page.id), ['Calculator'])
})

test('inert settings choices match the admitted artifact and pinned data bytes', () => {
  assert.equal(readFileSync(new URL('../src/trusted-raycast-settings-catalog.ts', import.meta.url), 'utf8'), trustedRaycastSettingsCatalogSource())
})

test('every reviewed extension setting has exactly one finite page owner', () => {
  for (const { key } of LAUNCHER_SETTINGS_CATALOG) {
    const owner = launcherExtensionSettingOwner(key)
    if (key.startsWith('extension[')) {
      assert.ok(owner, key)
      assert.equal(launcherExtensionPages.filter(page => page.settingKeys.includes(key)).length, 1, key)
    } else assert.equal(owner, undefined, key)
  }
})

test('unavailable providers retain destinations but do not claim platform support', () => {
  assert.equal(launcherExtensionSupported('WindowsControlPanel', 'macOS'), false)
  assert.equal(launcherExtensionSupported('WindowsControlPanel', 'Windows'), true)
  for (const id of ['BrowserBookmarks', 'FileSearch', 'TerminalLauncher']) assert.equal(launcherExtensionSupported(id, 'Linux'), false)
  assert.equal(launcherExtensionSupported('SimpleFileSearch', 'Linux'), true)
  assert.equal(launcherExtensionSupported('google-translate', 'Windows'), false)
})
