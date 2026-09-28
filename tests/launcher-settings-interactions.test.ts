import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { buildSync } from 'esbuild'

const { JSDOM } = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))('jsdom')
const bundle = buildSync({ stdin: { contents: `
  export { createElement } from 'react'
  export { createRoot } from 'react-dom/client'
  export { flushSync } from 'react-dom'
  export { LauncherDraftContext, createLauncherDraftTracker } from '../../src/launcher-settings-dirty.ts'
  export { LauncherTerminalSettings } from '../../src/launcher-terminal-settings.tsx'
  export { LauncherLocalSettings } from '../../src/launcher-local-settings.tsx'
  export { LauncherNetworkSettings } from '../../src/launcher-network-settings.tsx'
  export { LauncherWorkflowSettings } from '../../src/launcher-workflow-settings.tsx'
`, resolveDir: new URL('../plugins/ui', import.meta.url).pathname, loader: 'tsx' }, bundle: true, nodePaths: [new URL('../plugins/ui/node_modules', import.meta.url).pathname], format: 'iife', globalName: 'SettingsTest', platform: 'browser', jsx: 'automatic', write: false }).outputFiles[0]!.text

async function mount(component: string, values: Record<string, unknown>, platform = 'MacIntel') {
  const dom = new JSDOM('<!doctype html><body><main></main></body>', { pretendToBeVisual: true, runScripts: 'outside-only' })
  Object.defineProperty(dom.window.navigator, 'platform', { value: platform })
  Object.defineProperty(dom.window.navigator, 'userAgent', { value: platform === 'MacIntel' ? 'Macintosh' : platform })
  dom.window.eval(bundle)
  const api = dom.window.SettingsTest
  const tracker = api.createLauncherDraftTracker()
  const root = api.createRoot(dom.window.document.querySelector('main'))
  const writes: Array<{ key: string; value: unknown }> = []
  let accepted = true
  let pending: Promise<void> | undefined
  let release: (() => void) | undefined
  let snapshot = { values, settingsSource: 'managed', externalGrantStatus: 'none', recoveredSettings: false, missingSensitiveKeys: [], logs: [], recoveredArtifacts: [] }
  const drain = async () => { await new Promise(resolve => setTimeout(resolve, 20)) }
  const render = () => api.flushSync(() => root.render(api.createElement(api.LauncherDraftContext.Provider, { value: tracker }, api.createElement(api[component], { busy: false, snapshot: dom.window.JSON.parse(JSON.stringify(snapshot)), save: async (key: string, value: unknown) => {
    writes.push({ key, value })
    await pending
    if (accepted) { snapshot = { ...snapshot, values: { ...snapshot.values, [key]: value } }; render() }
    return accepted
  } }))))
  render(); await drain()
  const document = dom.window.document as Document
  return {
    document, writes, tracker, drain,
    rejectSaves: () => { accepted = false },
    holdSaves: () => { pending = new Promise<void>(resolve => { release = resolve }) },
    releaseSaves: async () => { release?.(); pending = undefined; await drain() },
    refresh: async (next: Record<string, unknown>) => { snapshot = { ...snapshot, values: { ...snapshot.values, ...next } }; render(); await drain() },
    click: async (element: Element) => { api.flushSync(() => (element as HTMLElement).click()); await drain() },
    edit: async (element: HTMLInputElement | HTMLTextAreaElement, value: string, blur = false) => {
      const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
      api.flushSync(() => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
      if (blur) api.flushSync(() => element.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })))
      await drain()
    },
    close: () => { api.flushSync(() => root.unmount()); dom.window.close() },
  }
}

test('normalized saves reconcile but rejected and newer edits remain dirty', async () => {
  const mounted = await mount('LauncherNetworkSettings', { 'extension[CurrencyConversion].currencies': ['usd'] })
  const currencies = mounted.document.querySelector('[aria-label="Currency Codes"]') as HTMLInputElement
  const json = mounted.document.querySelector('[aria-label="Custom Web Search Engines JSON"]') as HTMLTextAreaElement
  try {
    await mounted.edit(currencies, 'USD,EUR', true)
    assert.equal(currencies.value, 'usd, eur')
    assert.equal(mounted.tracker.hasChanges(), false)
    await mounted.edit(json, '[] ', true)
    assert.equal(json.value, '[]')
    assert.equal(mounted.tracker.hasChanges(), false)
    mounted.holdSaves()
    await mounted.edit(currencies, 'EUR,GBP', true)
    await mounted.edit(currencies, 'JPY,GBP')
    await mounted.releaseSaves()
    assert.equal(currencies.value, 'JPY,GBP')
    assert.equal(mounted.tracker.hasChanges(), true)
    mounted.rejectSaves()
    await mounted.edit(currencies, 'JPY,GBP', true)
    assert.equal(currencies.value, 'JPY,GBP')
    assert.equal(mounted.tracker.hasChanges(), true)
    await mounted.edit(json, '{broken', true)
    assert.equal(json.value, '{broken')
  } finally { mounted.close() }
})

test('workflow switches and creation ask before dropping a dirty or rejected draft', async () => {
  const flow = (id: string) => ({ id, name: id, actions: [{ id: 'url', handlerId: 'OpenUrl', name: 'Open', args: { url: 'https://example.com' } }] })
  const mounted = await mount('LauncherWorkflowSettings', { 'extension[Workflow].workflows': [flow('first'), flow('second')] })
  const name = () => mounted.document.querySelector('#tocklauncher-workflow-name') as HTMLInputElement
  const button = (text: string) => Array.from(mounted.document.querySelectorAll('button')).find(item => item.textContent === text || item.getAttribute('aria-label') === text || item.querySelector('span')?.textContent === text)!
  try {
    await mounted.edit(name(), 'unsaved')
    await mounted.click(button('first'))
    assert.equal(name().value, 'unsaved', 'reselecting the current workflow is harmless')
    await mounted.click(button('second'))
    assert.equal(name().value, 'unsaved')
    assert.ok(mounted.document.querySelector('[role="alertdialog"]'))
    await mounted.click(button('Keep Editing'))
    assert.equal(name().value, 'unsaved')
    mounted.rejectSaves()
    await mounted.click(button('Save Workflow'))
    await mounted.click(button('Add Workflow'))
    assert.equal(name().value, 'unsaved')
    assert.ok(mounted.document.querySelector('[role="alertdialog"]'), `dirty=${mounted.tracker.hasChanges()} buttons=${Array.from(mounted.document.querySelectorAll('button')).map(button => button.textContent).join('|')}`)
    await mounted.click(button('Discard Changes'))
    assert.equal(name().value, '')
  } finally { mounted.close() }
})

test('UUID switches reflect the nested format unless a scalar override exists', async () => {
  const mounted = await mount('LauncherLocalSettings', { 'extension[UuidGenerator].generatorFormat': { uppercase: true, hyphens: false, braces: true, quotes: true } })
  try {
    for (const [label, expected] of [['Uppercase', 'true'], ['Hyphens', 'false'], ['Braces', 'true'], ['Quotes', 'true']]) {
      assert.equal(mounted.document.querySelector(`[aria-label="UUID ${label}"]`)!.getAttribute('aria-checked'), expected)
    }
    await mounted.refresh({ 'extension[UuidGenerator].uppercase': false })
    assert.equal(mounted.document.querySelector('[aria-label="UUID Uppercase"]')!.getAttribute('aria-checked'), 'false')
  } finally { mounted.close() }
})

test('terminal toggles preserve saved selections from other platforms', async () => {
  for (const platform of ['MacIntel', 'Windows']) {
    const mounted = await mount('LauncherTerminalSettings', { 'extension[TerminalLauncher].terminalIds': ['Command Prompt', 'Terminal'] }, platform)
    try {
      const name = platform === 'MacIntel' ? 'iTerm' : 'Powershell'
      await mounted.click(mounted.document.querySelector(`[aria-label="Enable Terminal Launcher ${name}"]`)!)
      assert.deepEqual(Array.from(mounted.writes.at(-1)!.value as string[]).sort(), ['Command Prompt', 'Terminal', name].sort())
    } finally { mounted.close() }
  }
})
