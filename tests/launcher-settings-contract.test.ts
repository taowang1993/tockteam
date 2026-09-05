import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { LAUNCHER_SETTINGS_CATALOG } from '../src/launcher-setting-catalog.ts'
import { resolveLauncherSettingDefault } from '../src/launcher-settings-defaults.ts'
import {
  LAUNCHER_MAIN_OWNED_SETTING_KEYS,
  LAUNCHER_RUNTIME_SETTING_KEYS,
  LAUNCHER_SENSITIVE_SETTING_KEYS,
  isLauncherRendererSettingValue,
  parseLauncherSettingUpdateArgs,
  parseLauncherSettingsSnapshot,
} from '../src/launcher-settings-contract.ts'

const valid: Readonly<Record<string, unknown>> = {
  'extension[ApplicationSearch].includeWindowsStoreApps': true,
  'extension[ApplicationSearch].linuxFolders': ['/usr/share/applications'],
  'extension[ApplicationSearch].macOsFolders': ['/Applications'],
  'extension[ApplicationSearch].mdfindFilterOption': "kMDItemKind=='Application'",
  'extension[ApplicationSearch].windowsFileExtensions': ['lnk'],
  'extension[ApplicationSearch].windowsFolders': ['C:\\ProgramData\\Microsoft\\Windows\\Start Menu'],
  'extension[Base64Conversion].decodePrefix': 'b64d',
  'extension[Base64Conversion].encodeDecodePrefix': 'b64',
  'extension[Base64Conversion].encodePrefix': 'b64e',
  'extension[BrowserBookmarks].browsers': [],
  'extension[BrowserBookmarks].iconType': 'favicon',
  'extension[BrowserBookmarks].searchResultStyle': 'nameOnly',
  'extension[Calculator].argumentSeparator': ',',
  'extension[Calculator].decimalSeparator': '.',
  'extension[Calculator].precision': 8,
  'extension[ColorConverter].formats': ['HEX', 'HSL', 'RGB'],
  'extension[CurrencyConversion].currencies': ['usd', 'eur'],
  'extension[CurrencyConversion].defaultTargetCurrency': 'eur',
  'extension[CustomWebSearch].customSearchEngines': [{ encodeSearchTerm: true, id: 'wiki', name: 'Wikipedia', prefix: 'wiki', url: 'https://example.com/search/{{query}}' }],
  'extension[DeeplTranslator].apiKey': 'secret-token',
  'extension[DeeplTranslator].defaultSourceLanguage': 'Auto',
  'extension[DeeplTranslator].defaultTargetLanguage': 'EN-US',
  'extension[FileSearch].everythingCliFilePath': '',
  'extension[FileSearch].maxSearchResultCount': 20,
  'extension[PasswordGenerator].beginWithALetter': false,
  'extension[PasswordGenerator].command': 'pw',
  'extension[PasswordGenerator].includeLowercaseCharacters': true,
  'extension[PasswordGenerator].includeNumbers': true,
  'extension[PasswordGenerator].includeSymbols': true,
  'extension[PasswordGenerator].includeUppercaseCharacters': true,
  'extension[PasswordGenerator].noDuplicateCharacters': false,
  'extension[PasswordGenerator].noSequentialCharacters': false,
  'extension[PasswordGenerator].noSimilarCharacters': false,
  'extension[PasswordGenerator].passwordLength': 24,
  'extension[PasswordGenerator].quantity': 5,
  'extension[PasswordGenerator].symbols': '!@#',
  'extension[QuickFormatter].command': 'qf',
  'extension[QuickFormatter].enableDeepFormatting': true,
  'extension[QuickFormatter].enableJson': true,
  'extension[QuickFormatter].enableStackTrace': true,
  'extension[QuickFormatter].enableXml': true,
  'extension[RowlandTextEditor].columnSeparator': '\\t',
  'extension[RowlandTextEditor].rowSeparator': '\\n',
  'extension[SimpleFileSearch].folders': [],
  'extension[TerminalLauncher].prefix': '>',
  'extension[TerminalLauncher].terminalIds': [],
  'extension[UuidGenerator].braces': false,
  'extension[UuidGenerator].generatorFormat': { braces: false, hyphens: true, quotes: false, uppercase: false },
  'extension[UuidGenerator].hyphens': true,
  'extension[UuidGenerator].numberOfUuids': 10,
  'extension[UuidGenerator].quotes': false,
  'extension[UuidGenerator].searchResultFormats': [],
  'extension[UuidGenerator].uppercase': false,
  'extension[UuidGenerator].uuidVersion': 'v4',
  'extension[UuidGenerator].validateStrictly': true,
  'extension[VSCode].command': 'code %s',
  'extension[VSCode].prefix': 'vscode',
  'extension[VSCode].showPath': false,
  'extension[WebSearch].locale': 'en-US',
  'extension[WebSearch].searchEngine': 'Google',
  'extension[WebSearch].showInstantSearchResult': false,
  'extension[Workflow].workflows': [],
  'appearance.searchBarAppearance': 'auto',
  'appearance.searchBarPlaceholderText': 'Search',
  'appearance.searchBarSize': 'large',
  'appearance.searchResultListLayout': 'compact',
  'appearance.showAppIconInDock': false,
  'appearance.showSearchIcon': true,
  'appearance.themeName': 'Fluent UI Web',
  'appearance.themeSource': 'system',
  'extensions.enabledExtensionIds': ['ApplicationSearch', 'UeliCommand'],
  'general.browser.customWebBrowser.commandlineArguments': '{{url}}',
  'general.browser.customWebBrowser.executableFilePath': '',
  'general.browser.customWebBrowserName': '',
  'general.browser.useDefaultWebBrowser': true,
  'general.hotkey.enabled': true,
  'general.hotkey': 'Alt+Space',
  'general.language': 'en-US',
  'general.preserveUserInput': true,
  'general.searchHistory.enabled': false,
  'general.searchHistory.history': [],
  'general.searchHistory.limit': 10,
  'general.tray.showIcon': true,
  'imageGenerator.faviconApiProvider': 'Google',
  'keyboardAndMouse.doubleClickBehavior': 'invokeSearchResultItem',
  'keyboardAndMouse.dragAndDropEnabled': false,
  'keyboardAndMouse.singleClickBehavior': 'selectSearchResultItem',
  'searchEngine.automaticRescan': true,
  'searchEngine.fuzziness': 0.5,
  'searchEngine.id': 'fuzzysort',
  'searchEngine.maxResultLength': 50,
  'searchEngine.rescanIntervalInSeconds': 300,
  'window.acrylicOpacity': 0.6,
  'window.alwaysOnTop': true,
  'window.backgroundMaterial': 'Mica',
  'window.hideWindowOn': ['blur', 'afterInvocation', 'escapePressed'],
  'window.scrollBehavior': 'smooth',
  'window.showOnStartup': false,
  'window.vibrancy': 'None',
  'window.visibleOnAllWorkspaces': true,
  favorites: [],
  'searchEngine.excludedItems': [],
}

test('TockLauncher keeps the generated 100-row catalog and exact 102-key runtime manifest', () => {
  assert.equal(LAUNCHER_SETTINGS_CATALOG.length, 100)
  assert.equal(LAUNCHER_RUNTIME_SETTING_KEYS.length, 102)
  assert.equal(new Set(LAUNCHER_RUNTIME_SETTING_KEYS).size, 102)
  assert.deepEqual(LAUNCHER_RUNTIME_SETTING_KEYS.slice(-2), ['favorites', 'searchEngine.excludedItems'])
  for (const key of LAUNCHER_RUNTIME_SETTING_KEYS) assert.ok(Object.hasOwn(valid, key), key)
})

test('full generated catalog metadata stays locked to its reviewed golden digest', () => {
  assert.equal(
    createHash('sha256').update(JSON.stringify(LAUNCHER_SETTINGS_CATALOG)).digest('hex'),
    'ce79bfd724fe7853af69f8a40b5a90f99b905d12448212f95a994cc712be69b5',
  )
})

test('every catalog default resolves or remains absent across bounded platform contexts', () => {
  const contexts = [
    { appDataPath: '/home/test/.local/share/TockTeam', environment: { XDG_DATA_DIRS: `/usr/share:${'x'.repeat(10_000)}:/opt/share` }, homePath: '/home/test', locale: 'en-US', platform: 'Linux' as const },
    { appDataPath: '/Users/test/Library/Application Support/TockTeam', environment: {}, homePath: '/Users/test', locale: 'fr-FR', platform: 'macOS' as const },
    { appDataPath: 'C:\\Users\\test\\AppData\\Roaming\\TockTeam', environment: {}, homePath: 'C:\\Users\\test', locale: 'zh-CN', platform: 'Windows' as const },
  ]
  const divergences: Readonly<Record<string, unknown>> = {
    'appearance.showSearchIcon': false,
    'window.alwaysOnTop': true,
    'window.showOnStartup': false,
    'window.visibleOnAllWorkspaces': true,
  }
  for (const context of contexts) {
    for (const row of LAUNCHER_SETTINGS_CATALOG) {
      const resolved = resolveLauncherSettingDefault(row.key, context)
      if (row.defaultKind === 'absent') assert.equal(resolved, undefined, `${context.platform}:${row.key}`)
      else if (Object.hasOwn(divergences, row.key)) assert.deepEqual(resolved, divergences[row.key], `${context.platform}:${row.key}`)
      else if (row.defaultKind === 'literal') assert.deepEqual(resolved, row.defaultValue, `${context.platform}:${row.key}`)
      else assert.notEqual(resolved, undefined, `${context.platform}:${row.key}`)
    }
  }
  assert.equal(resolveLauncherSettingDefault('appearance.searchBarPlaceholderText', contexts[0]!), 'Type here...')
  const hostile = resolveLauncherSettingDefault('extension[ApplicationSearch].linuxFolders', contexts[0]!)
  assert.equal(Array.isArray(hostile) && hostile.every(folder => typeof folder === 'string' && folder.length <= 4_096), true)
})

test('every manifest representative passes its bounded validator and malformed values fail', () => {
  for (const [key, value] of Object.entries(valid)) assert.equal(isLauncherRendererSettingValue(key, value), true, key)
  assert.throws(() => parseLauncherSettingUpdateArgs({ key: 'unknown', value: true }))
  assert.throws(() => parseLauncherSettingUpdateArgs({ key: 'window.alwaysOnTop', value: 'true' }))
  assert.throws(() => parseLauncherSettingUpdateArgs({ key: 'general.browser.customWebBrowser.executableFilePath', value: '/tmp/browser' }))
  assert.throws(() => parseLauncherSettingUpdateArgs({ key: 'favorites', value: ['forged:item'] }))
  assert.throws(() => parseLauncherSettingUpdateArgs({ key: 'searchEngine.excludedItems', value: ['forged:item'] }))
  assert.equal(LAUNCHER_SENSITIVE_SETTING_KEYS[0], 'extension[DeeplTranslator].apiKey')
  assert.deepEqual(LAUNCHER_MAIN_OWNED_SETTING_KEYS, ['general.browser.customWebBrowser.executableFilePath', 'general.browser.customWebBrowserName'])
  for (const url of ['https://[::1]/{{query}}', 'https://[fd00::1]/{{query}}', 'https://internal/{{query}}']) {
    assert.equal(isLauncherRendererSettingValue('extension[CustomWebSearch].customSearchEngines', [{ encodeSearchTerm: true, id: 'private', name: 'Private', prefix: 'p', url }]), false, url)
  }
})

test('snapshot parser rejects secret, browser identity, invalid values, and mutable output', () => {
  const snapshot = parseLauncherSettingsSnapshot({
    customBrowserStatus: 'none',
    externalGrantStatus: 'none',
    externalWriteAvailable: true,
    logs: [],
    missingSensitiveKeys: ['extension[DeeplTranslator].apiKey'],
    recoveredSettings: false,
    secureStorageAvailable: true,
    settingsSource: 'managed',
    values: { 'general.language': 'en-US' },
  })
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.values), true)
  assert.throws(() => parseLauncherSettingsSnapshot({ ...snapshot, values: { 'extension[DeeplTranslator].apiKey': 'secret' } }))
  assert.throws(() => parseLauncherSettingsSnapshot({ ...snapshot, values: { 'general.language': 42 } }))
  assert.throws(() => parseLauncherSettingsSnapshot({ ...snapshot, missingSensitiveKeys: ['extension[DeeplTranslator].apiKey', 'extension[DeeplTranslator].apiKey'] }))
})
