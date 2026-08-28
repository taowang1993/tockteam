import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const tool = readFileSync(new URL('../src/launcher-network-extension-tool.ts', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/launcher-network-settings.tsx', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../src/launcher.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/launcher-settings.tsx', import.meta.url), 'utf8')

test('network tools use only typed prefixes, bounded input, opaque actions, and accessible menus', () => {
  assert.match(tool, /LAUNCHER_DEEPL_QUERY_PREFIX/u)
  assert.match(tool, /LAUNCHER_WEB_SEARCH_QUERY_PREFIX/u)
  assert.match(tool, /LAUNCHER_NETWORK_TOOL_INPUT_LENGTH/u)
  assert.match(tool, /bridge\.search/u)
  assert.match(tool, /bridge\.invokeAction\(action\.actionId\)/u)
  assert.match(tool, /aria-haspopup.*menu/u)
  assert.match(tool, /role.*menuitem/u)
  assert.match(tool, /role', 'list'/u)
  assert.match(tool, /role', 'listitem'/u)
  assert.match(tool, /aria-describedby/u)
  assert.match(tool, /event\.key === 'Tab'/u)
  assert.doesNotMatch(tool, /window\.open|fetch\(|shell\.|node:/u)
})

test('network settings expose all nine settings without hydrating the DeepL key', () => {
  for (const key of [
    'extension[CurrencyConversion].currencies', 'extension[CurrencyConversion].defaultTargetCurrency',
    'extension[CustomWebSearch].customSearchEngines', 'extension[DeeplTranslator].defaultSourceLanguage',
    'extension[DeeplTranslator].defaultTargetLanguage', 'extension[WebSearch].locale',
    'extension[WebSearch].searchEngine', 'extension[WebSearch].showInstantSearchResult',
  ]) assert.match(settings, new RegExp(key.replace(/[.[\]]/gu, '\\$&'), 'u'), key)
  assert.match(page, /extension\[DeeplTranslator\]\.apiKey/u)
  assert.match(settings, /write-only|write only|encrypted/u)
  assert.match(settings, /aria-invalid/u)
  assert.match(settings, /aria-describedby/u)
  assert.match(settings, /role="alert"/u)
  assert.match(settings, /Currency codes could not be saved|currency.*invalid/iu)
  assert.match(settings, /Default target currency could not be saved|target currency.*invalid/iu)
  assert.match(settings, /Custom search engines could not be saved/u)
  assert.doesNotMatch(tool, /apiKey|DeepL-Auth-Key/u)
})

test('launcher composes finite network tools and packaged asset keys', () => {
  assert.match(launcher, /createLauncherNetworkExtensionTool/u)
  assert.match(launcher, /launcherNetworkAssetUrl/u)
  assert.match(page, /LauncherNetworkSettings/u)
})
