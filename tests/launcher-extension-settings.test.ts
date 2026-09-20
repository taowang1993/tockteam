import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { LAUNCHER_COMPOSITION } from '../src/launcher-contract.ts'
import { TRUSTED_RAYCAST_EXTENSION_IDS } from '../src/trusted-raycast-descriptors.ts'
import { LAUNCHER_SETTINGS_CATALOG } from '../src/launcher-setting-catalog.ts'
import { launcherExtensionPages, isLauncherExtensionId, launcherExtensionSupported, findLauncherExtensionPages, launcherExtensionSettingOwner, launcherSettingsPlatform } from '../src/launcher-extension-settings.ts'

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
  const translate = (label: string, locale = 'zh') => locale === 'zh' ? translated[label] ?? label : label
  assert.deepEqual(findLauncherExtensionPages('计算器', translate).map(page => page.id), ['Calculator'])
  assert.deepEqual(findLauncherExtensionPages('精度', translate).map(page => page.id), ['Calculator'])
  assert.deepEqual(findLauncherExtensionPages('代理', translate).map(page => page.id), ['google-translate'])
  assert.deepEqual(findLauncherExtensionPages('precision', translate).map(page => page.id), ['Calculator'])
})

test('sidebar shows only installed extensions and platform-supported built-in tools', () => {
  const mac = findLauncherExtensionPages('', undefined, { platform: 'macOS', installedExtensionIds: ['google-translate'] })
  assert.equal(mac.some(page => page.id === 'WindowsControlPanel'), false)
  assert.deepEqual(mac.filter(page => page.editor === 'compatibility').map(page => page.id), ['google-translate'])
  assert.equal(mac.filter(page => page.editor !== 'compatibility').length, 23)
  assert.equal(findLauncherExtensionPages('proxy', undefined, { platform: 'macOS', installedExtensionIds: [] }).length, 0)
  for (const platform of ['Linux', 'Windows'] as const) {
    const pages = findLauncherExtensionPages('', undefined, { platform, installedExtensionIds: TRUSTED_RAYCAST_EXTENSION_IDS })
    assert.equal(pages.some(page => page.editor === 'compatibility'), false)
    assert.ok(pages.every(page => launcherExtensionSupported(page.id, platform)))
    assert.equal(pages.some(page => page.id === 'WindowsControlPanel'), platform === 'Windows')
  }
  assert.equal(launcherExtensionPages.length, 27, 'hidden destinations and their saved settings remain registered')
})

test('inert settings choices match the admitted artifact and pinned data bytes', () => {
  execFileSync(process.execPath, ['scripts/trusted-raycast-settings-catalog.mjs', '--check'], { timeout: 15000 })
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

test('sidebar and page use the same renderer platform detection', () => {
  for (const [platform, userAgent, expected] of [
    ['MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'macOS'],
    ['Win32', 'Mozilla/5.0 (Windows NT 10.0)', 'Windows'],
    ['Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)', 'Linux'],
  ]) assert.equal(launcherSettingsPlatform({ platform: platform!, userAgent: userAgent! }), expected)
})

test('unavailable providers retain destinations but do not claim platform support', () => {
  assert.equal(launcherExtensionSupported('WindowsControlPanel', 'macOS'), false)
  assert.equal(launcherExtensionSupported('WindowsControlPanel', 'Windows'), true)
  for (const id of ['AppearanceSwitcher', 'BrowserBookmarks', 'FileSearch', 'SystemSettings', 'TerminalLauncher']) assert.equal(launcherExtensionSupported(id, 'Linux'), false)
  assert.equal(launcherExtensionSupported('SimpleFileSearch', 'Linux'), true)
  assert.equal(launcherExtensionSupported('google-translate', 'Windows'), false)
})
