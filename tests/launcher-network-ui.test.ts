import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createLauncherNetworkExtensionTool } from '../src/launcher-network-extension-tool.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { LauncherPublicResultItem } from '../src/launcher-actions.ts'

const tool = readFileSync(new URL('../src/launcher-network-extension-tool.ts', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/launcher-network-settings.tsx', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../src/launcher.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/launcher-settings.tsx', import.meta.url), 'utf8')

class FakeDocument {
  activeElement: FakeElement | null = null
  createElement(tagName: string): FakeElement { return new FakeElement(this, tagName) }
}

class FakeElement {
  readonly attributes = new Map<string, string>()
  readonly children: FakeElement[] = []
  readonly listeners = new Map<string, Array<(event: unknown) => void>>()
  className = ''
  readonly dataset: Record<string, string> = {}
  hidden = false
  maxLength = 0
  textContent: string | null = null
  type = ''
  value = ''
  readonly document: FakeDocument
  readonly tagName: string
  constructor(document: FakeDocument, tagName: string) { this.document = document; this.tagName = tagName }
  addEventListener(type: string, listener: (event: unknown) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  append(...children: FakeElement[]): void { this.children.push(...children) }
  dispatch(type: string, event: unknown = {}): void { for (const listener of this.listeners.get(type) ?? []) listener(event) }
  focus(): void { this.document.activeElement = this }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  replaceChildren(...children: FakeElement[]): void { this.children.splice(0, this.children.length, ...children) }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value) }
}

function find(root: FakeElement, tagName: string): FakeElement | undefined {
  if (root.tagName === tagName) return root
  for (const child of root.children) {
    const match = find(child, tagName)
    if (match !== undefined) return match
  }
  return undefined
}

function findAll(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement[] {
  return [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => findAll(child, predicate))]
}

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
  assert.match(tool, /data-\[tone=error\]/u)
  assert.doesNotMatch(tool, /window\.open|fetch\(|shell\.|node:/u)
})

test('network tools debounce partial input before crossing the IPC boundary', async () => {
  const queries: string[] = []
  const bridge = {
    search: async (query: string) => {
      queries.push(query)
      return { after: [], before: [], resultSetId: 'launcher-results:1', status: { indexedItemCount: 0, rescanStatus: 'idle' as const } }
    },
  } as unknown as LauncherPreloadBridge
  const document = new FakeDocument()
  const rendered = createLauncherNetworkExtensionTool({
    bridge,
    document: document as unknown as Document,
    extensionId: 'WebSearch',
    onClose: () => undefined,
    searchOptions: { fuzziness: 0.5, maxSearchResultItems: 20, searchEngineId: 'fuzzysort' },
  }) as unknown as FakeElement
  const input = find(rendered, 'input')!
  for (const value of ['t', 'to', 'tock']) { input.value = value; input.dispatch('input') }
  assert.deepEqual(queries, [])
  await new Promise(resolve => setTimeout(resolve, 250))
  assert.deepEqual(queries, ['tockteam:web-search:tock'])
})

test('network result buttons support roving arrow-key focus', async () => {
  const items = ['First', 'Second'].map((name, index): LauncherPublicResultItem => ({
    defaultAction: { actionId: `launcher-action:${index}`, description: 'Open result', hideWindowAfterInvocation: true },
    description: 'Suggestion',
    id: `network-result:${index}`,
    name,
    sourceExtension: 'WebSearch',
  }))
  const bridge = {
    search: async () => ({ after: items, before: [], resultSetId: 'launcher-results:1', status: { indexedItemCount: 2, rescanStatus: 'idle' as const } }),
  } as unknown as LauncherPreloadBridge
  const document = new FakeDocument()
  const rendered = createLauncherNetworkExtensionTool({
    bridge,
    document: document as unknown as Document,
    extensionId: 'WebSearch',
    onClose: () => undefined,
    searchOptions: { fuzziness: 0.5, maxSearchResultItems: 20, searchEngineId: 'fuzzysort' },
  }) as unknown as FakeElement
  const input = find(rendered, 'input')!
  input.value = 'query'
  input.dispatch('input')
  await new Promise(resolve => setTimeout(resolve, 250))
  const buttons = findAll(rendered, element => element.getAttribute('aria-label')?.endsWith('— Open result') === true)
  buttons[0]!.focus()
  buttons[0]!.dispatch('keydown', { key: 'ArrowDown', preventDefault() {} })
  assert.equal(document.activeElement, buttons[1])
  buttons[1]!.dispatch('keydown', { key: 'ArrowUp', preventDefault() {} })
  assert.equal(document.activeElement, buttons[0])
})

test('network tools consume Escape at the menu and tool-input layers', () => {
  assert.match(tool, /if \(event\.key === 'Escape' \|\| event\.key === 'Tab'\) \{[\s\S]{0,110}event\.stopPropagation\(\)/u)
  assert.match(tool, /if \(keyboardEvent\.key === 'Escape'\) \{[\s\S]{0,80}keyboardEvent\.stopPropagation\(\)[\s\S]{0,80}closeTool\(\)/u)
})

test('network settings expose all nine settings without hydrating the DeepL key', () => {
  for (const key of [
    'extension[CurrencyConversion].currencies', 'extension[CurrencyConversion].defaultTargetCurrency',
    'extension[CustomWebSearch].customSearchEngines', 'extension[DeeplTranslator].defaultSourceLanguage',
    'extension[DeeplTranslator].defaultTargetLanguage', 'extension[WebSearch].locale',
    'extension[WebSearch].searchEngine', 'extension[WebSearch].showInstantSearchResult',
  ]) assert.match(settings, new RegExp(key.replace(/[.[\]]/gu, '\\$&'), 'u'), key)
  assert.match(page, /extension\[DeeplTranslator\]\.apiKey/u)
  assert.match(page, /write-only|write only|encrypted/u)
  assert.match(settings, /aria-invalid/u)
  assert.match(settings, /aria-describedby/u)
  assert.match(settings, /<FieldError/u)
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
