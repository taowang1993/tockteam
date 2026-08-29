import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { launcherCountText, launcherFixedText } from '../src/launcher-i18n.ts'

const settingsPage = readFileSync(new URL('../src/launcher-settings.tsx', import.meta.url), 'utf8')

const SETTINGS_STRINGS = [
  'Saved searches',
  'The DSH locale service owns launcher language selection.',
  'Unsupported platforms stay readable and revocable but reject writes before touching the file.',
  'Sensitive values are encrypted in Electron main and are never hydrated into this renderer.',
  'Clears overrides, favorites, exclusions, history, and the custom-browser grant, then securely relaunches Desktop.',
  'Enter a new key to encrypt it with the operating system secure-storage backend.',
  'The settings catalog is generated from the pinned Ueli parity manifest.',
  'Custom-browser identity is status-only here; selection and revocation are native operations.',
  'Bounded launcher diagnostics are retained without secret or path material.',
  'Reset',
  'Custom browser grant',
  'Use the native Choose/Revoke controls in Storage and Privacy; executable paths and arguments are never editable here.',
  'Global shortcut',
  'Electron main owns registration and conflict handling.',
  'Drag and drop',
  'Disabled: launcher payloads never contain paths, URLs, commands, or executable records.',
  'Search Bar Placeholder Text',
  'Use Default Web Browser',
  'Preserve User Input',
  'Enabled',
  'JSON records are validated as a whole; only one query placeholder and HTTPS public-host templates are accepted.',
  'The write-only key field remains in the Security section and is encrypted in Electron main.',
  'Compatibility mode is',
  'active mode and skin follow the DSH TockTeam Appearance owner.',
  'Follows TockTeam Appearance',
  'Save key',
  'Current version',
  'Value is invalid.',
] as const

test('settings strings have Chinese translations instead of English fallback text', () => {
  for (const string of SETTINGS_STRINGS) assert.notEqual(launcherFixedText(string, 'zh-CN'), string, string)
  assert.equal(launcherCountText('zh-CN', 'savedSearches', 3, '3 saved searches currently visible to TockLauncher.'), 'TockLauncher 当前可见 3 条已保存搜索。')
  assert.equal(launcherCountText('zh-CN', 'catalogRows', 100, '100 rows · 102 runtime keys'), '100 行 · 102 个运行时键')
  assert.match(settingsPage, /launcherCountText\(localeTag\(locale\), 'savedSearches'/u)
  assert.match(settingsPage, /launcherFixedText\('Current version'\)/u)
  assert.equal(settingsPage.includes('>Save key<'), false)
  assert.equal(settingsPage.includes('>Follows TockTeam Appearance<'), false)
})
