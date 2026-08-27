#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { ensureElectronInstalled } from './electron-runtime.mjs'
import { stopChildProcess } from './process-cleanup.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const launcherCsp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'"

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise(resolve => server.close(resolve))
  return port
}

async function waitFor(fetcher, predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      last = await fetcher()
      if (predicate(last)) return last
    } catch (error) {
      last = error
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for Electron state: ${last instanceof Error ? last.message : JSON.stringify(last)}`)
}

async function listPages(port) {
  const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`)
  if (!response.ok) throw new Error(`DevTools page listing failed: ${response.status}`)
  return await response.json()
}

class CdpPage {
  #nextId = 1
  #pending = new Map()
  #socket

  static async connect(url) {
    const page = new CdpPage()
    const socket = new WebSocket(url)
    page.#socket = socket
    socket.addEventListener('message', event => {
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (message.id === undefined) return
      const pending = page.#pending.get(message.id)
      if (pending === undefined) return
      page.#pending.delete(message.id)
      if (message.error !== undefined) pending.reject(new Error(message.error.message ?? 'CDP request failed'))
      else pending.resolve(message.result)
    })
    socket.addEventListener('close', () => {
      for (const pending of page.#pending.values()) pending.reject(new Error('CDP connection closed'))
      page.#pending.clear()
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return page
  }

  call(method, params = {}) {
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.exceptionDetails !== undefined) {
      throw new Error(response.exceptionDetails.text ?? 'renderer evaluation failed')
    }
    return response.result?.value
  }

  close() {
    this.#socket.close()
  }
}

async function electronPages(port) {
  return await listPages(port)
}

async function clickWorkbenchFallback(page) {
  await page.call('Page.bringToFront')
  const clicked = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(node =>
      node.textContent?.includes('TockLauncher')
    )
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  assert.equal(clicked, true, 'TockLauncher workbench fallback button must be present')
}

async function showLauncherFromWorkbench(page) {
  await page.call('Page.bringToFront')
  return await page.evaluate('window.dshDesktop?.launcher?.show()')
}

async function clearStartupDialogs(page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const clicked = await page.evaluate(`(() => {
      const labels = ['Continue', 'Configure later']
      const button = [...document.querySelectorAll('button')].find(node =>
        labels.includes(node.textContent?.trim() ?? '')
      )
      if (!(button instanceof HTMLButtonElement)) return false
      button.click()
      return true
    })`)
    if (!clicked) return
    await sleep(250)
  }
}

const port = await freePort()
const userData = await mkdtemp(join(tmpdir(), 'tockteam-launcher-electron-'))
const electron = ensureElectronInstalled(root)
const child = spawn(electron, [
  '.',
  `--remote-debugging-port=${String(port)}`,
  `--user-data-dir=${userData}`,
  '--toggle',
], {
  cwd: root,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout?.on('data', chunk => { output = `${output}${String(chunk)}`.slice(-8_000) })
child.stderr?.on('data', chunk => { output = `${output}${String(chunk)}`.slice(-8_000) })
let workbench
let launcher
let workbenchConnection
let launcherConnection
let restartedChild
let restartedWorkbenchConnection
let restartedLauncherConnection
try {
  await waitFor(
    () => electronPages(port),
    pages => pages.some(page => page.title === 'TockCoder'),
  )
  let pages = await electronPages(port)
  workbench = pages.find(page => page.title === 'TockCoder')
  assert.ok(workbench)
  workbenchConnection = await CdpPage.connect(workbench.webSocketDebuggerUrl)
  await clearStartupDialogs(workbenchConnection)
  pages = await waitFor(
    () => electronPages(port),
    current => current.filter(page => page.title === 'TockLauncher').length === 1,
  )
  launcher = pages.find(page => page.title === 'TockLauncher')
  assert.ok(launcher)
  launcherConnection = await CdpPage.connect(launcher.webSocketDebuggerUrl)
  await waitFor(
    () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
    visible => visible === true,
  )
  await launcherConnection.evaluate('(async () => { await window.tockteamLauncher?.dismiss() })()')
  await waitFor(
    () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
    visible => visible === false,
  )
  await clickWorkbenchFallback(workbenchConnection)
  await waitFor(
    () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
    visible => visible === true,
  )
  const workbenchUrl = await workbenchConnection.evaluate('location.href')
  const workbenchMarker = await workbenchConnection.evaluate(`(() => {
    window.__tockteamLauncherSmokeMarker = 'same-workbench-renderer'
    return window.__tockteamLauncherSmokeMarker
  })()`)
  const firstLauncherId = launcher.id
  await waitFor(
    () => launcherConnection.evaluate('document.documentElement.dataset.launcherReady'),
    ready => ready === 'true',
  )
  const facts = await launcherConnection.evaluate(`({
    ready: document.documentElement.dataset.launcherReady,
    width: innerWidth,
    height: innerHeight,
    focused: document.activeElement?.id,
    process: typeof window.process,
    require: typeof window.require,
    dshDesktop: typeof window.dshDesktop,
    electronAPI: typeof window.electronAPI,
    launcherApiKeys: Object.keys(window.tockteamLauncher ?? {}).sort(),
    launcherApiFrozen: Object.isFrozen(window.tockteamLauncher),
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
    fitsViewport: document.documentElement.scrollWidth === innerWidth
      && document.documentElement.scrollHeight === innerHeight,
  })`)
  assert.deepEqual(facts, {
    ready: 'true',
    width: 750,
    height: 475,
    focused: 'launcher-search',
    process: 'undefined',
    require: 'undefined',
    dshDesktop: 'undefined',
    electronAPI: 'undefined',
    launcherApiKeys: ['dismiss', 'getLocalExtensionSettings', 'getSurfaceSettings', 'getTheme', 'invokeAction', 'onTheme', 'openSettings', 'recordSearch', 'rescan', 'search'],
    launcherApiFrozen: true,
    csp: launcherCsp,
    fitsViewport: true,
  })
  const attackFacts = await launcherConnection.evaluate(`({
    notification: typeof Notification === 'undefined' ? 'unavailable' : Notification.permission,
    popupDenied: window.open('https://example.com') === null,
  })`)
  assert.equal(attackFacts.notification, 'denied')
  assert.equal(attackFacts.popupDenied, true)
  try {
    await launcherConnection.evaluate("location.assign('https://example.com')")
  } catch {
    // Chromium may report a client-side navigation cancellation through CDP.
  }
  await sleep(250)
  assert.equal(await launcherConnection.evaluate('location.href'), launcher.url)
  assert.equal(workbenchConnection ? await workbenchConnection.evaluate('location.href') : '', workbenchUrl)

  const iconFacts = await launcherConnection.evaluate(`({
    selected: document.querySelector('[data-result-id][aria-selected="true"]')?.className.includes('aria-selected:'),
    searchIconSize: document.querySelector('#launcher-search-icon svg')?.getAttribute('width'),
    historyIconSize: document.querySelector('#launcher-history-toggle svg')?.getAttribute('width'),
  })`)
  assert.deepEqual(iconFacts, { selected: true, searchIconSize: '18', historyIconSize: '18' })
  const updateState = await workbenchConnection.evaluate('(async () => await window.dshDesktop?.appUpdate?.getState())()')
  assert.equal(updateState?.enabled, false)
  assert.equal(updateState?.status, 'disabled')
  const initialTheme = await launcherConnection.evaluate('window.tockteamLauncher?.getTheme()')
  assert.ok(initialTheme?.mode === 'light' || initialTheme?.mode === 'dark')
  assert.ok(initialTheme?.skinId === null || /^tockteam-skin-/u.test(initialTheme.skinId))
  await workbenchConnection.evaluate(`(async () => {
    await window.dshDesktop?.syncLauncherTheme({ mode: 'dark', skinId: 'tockteam-skin-deep-current' })
  })()`)
  await waitFor(
    () => launcherConnection.evaluate(`({
      colorScheme: document.documentElement.style.colorScheme,
      skin: document.documentElement.dataset.tockteamSkin,
    })`),
    theme => theme.colorScheme === 'dark' && theme.skin === 'tockteam-skin-deep-current',
  )
  const darkThemeFacts = await launcherConnection.evaluate(`({
    colorScheme: document.documentElement.style.colorScheme,
    skin: document.documentElement.dataset.tockteamSkin,
    brand: getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-brand-primary').trim(),
  })`)
  assert.equal(darkThemeFacts.colorScheme, 'dark')
  assert.equal(darkThemeFacts.skin, 'tockteam-skin-deep-current')
  assert.equal(darkThemeFacts.brand, '#49c8eb')
  await workbenchConnection.evaluate(`(async () => {
    await window.dshDesktop?.syncLauncherTheme({ mode: 'light', skinId: null })
  })()`)
  await waitFor(
    () => launcherConnection.evaluate(`({
      colorScheme: document.documentElement.style.colorScheme,
      skin: document.documentElement.dataset.tockteamSkin ?? null,
    })`),
    theme => theme.colorScheme === 'light' && theme.skin === null,
  )
  const lightThemeFacts = await launcherConnection.evaluate(`({
    colorScheme: document.documentElement.style.colorScheme,
    skin: document.documentElement.dataset.tockteamSkin ?? null,
  })`)
  assert.deepEqual(lightThemeFacts, { colorScheme: 'light', skin: null })

  await launcherConnection.evaluate(`(() => {
    const input = document.getElementById('launcher-search')
    if (!(input instanceof HTMLInputElement)) return false
    input.value = 'tutor'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await waitFor(
    () => launcherConnection.evaluate(`([...document.querySelectorAll('[data-result-id]')].some(node => node.textContent?.includes('TockTutor')))`) ,
    found => found === true,
  )
  await launcherConnection.evaluate(`(() => {
    const button = [...document.querySelectorAll('#launcher-details button')]
      .find(node => node.textContent?.includes('Open TockTutor'))
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  await waitFor(
    () => workbenchConnection.evaluate('location.pathname'),
    pathname => pathname === '/tocktutor',
  )
  assert.equal(await workbenchConnection.evaluate('window.__tockteamLauncherSmokeMarker'), workbenchMarker)
  const tutorFacts = await workbenchConnection.evaluate(`({
    launcherButtons: document.querySelectorAll('button[aria-label="Open TockLauncher"]').length,
    titlebars: document.querySelectorAll('[aria-label="TockTutor Title Bar"]').length,
  })`)
  assert.deepEqual(tutorFacts, { launcherButtons: 1, titlebars: 1 })
  const tutorLauncherButton = await workbenchConnection.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open TockLauncher"]')
    return button instanceof HTMLButtonElement && !button.disabled
  })()`)
  assert.equal(tutorLauncherButton, true)
  await workbenchConnection.evaluate(`(() => {
    window.history.pushState(window.history.state, '', '/tocktutor?smoke-session=1')
    window.dispatchEvent(new PopStateEvent('popstate'))
    sessionStorage.setItem('tockteam-smoke-session', 'preserved')
  })()`)
  await waitFor(
    () => workbenchConnection.evaluate('location.search'),
    search => search === '?smoke-session=1',
  )
  await showLauncherFromWorkbench(workbenchConnection)
  await launcherConnection.evaluate(`(() => {
    const input = document.getElementById('launcher-search')
    if (!(input instanceof HTMLInputElement)) return false
    input.value = 'coder'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await waitFor(
    () => launcherConnection.evaluate(`([...document.querySelectorAll('[data-result-id]')].some(node => node.textContent?.includes('TockCoder')))`) ,
    found => found === true,
  )
  await launcherConnection.evaluate(`(() => {
    const button = [...document.querySelectorAll('#launcher-details button')]
      .find(node => node.textContent?.includes('Open TockCoder'))
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  await waitFor(
    () => workbenchConnection.evaluate('location.pathname'),
    pathname => pathname === '/tockcoder',
  )
  const coderFacts = await workbenchConnection.evaluate(`({
    tutorTitlebars: [...document.querySelectorAll('[aria-label="TockTutor Title Bar"]')].filter(node => node.closest('[hidden]') === null).length,
    launcherFallbacks: [...document.querySelectorAll('button')].filter(node => node.textContent?.includes('TockLauncher')).length,
  })`)
  assert.deepEqual(coderFacts, { tutorTitlebars: 0, launcherFallbacks: 1 })
  await showLauncherFromWorkbench(workbenchConnection)
  await launcherConnection.evaluate(`(() => {
    const input = document.getElementById('launcher-search')
    if (!(input instanceof HTMLInputElement)) return false
    input.value = 'tutor'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await waitFor(
    () => launcherConnection.evaluate(`([...document.querySelectorAll('[data-result-id]')].some(node => node.textContent?.includes('TockTutor')))`) ,
    found => found === true,
  )
  await launcherConnection.evaluate(`(() => {
    const button = [...document.querySelectorAll('#launcher-details button')]
      .find(node => node.textContent?.includes('Open TockTutor'))
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  await waitFor(
    () => workbenchConnection.evaluate('location.href'),
    href => typeof href === 'string' && href.endsWith('/tocktutor?smoke-session=1'),
  )
  const tutorAfterSwitch = await workbenchConnection.evaluate(`({
    marker: window.__tockteamLauncherSmokeMarker,
    titlebars: document.querySelectorAll('[aria-label="TockTutor Title Bar"]').length,
  })`)
  assert.deepEqual(tutorAfterSwitch, { marker: workbenchMarker, titlebars: 1 })
  await workbenchConnection.evaluate(`(() => {
    window.history.replaceState(window.history.state, '', '/')
  })()`)
  await workbenchConnection.call('Page.reload')
  await waitFor(
    () => workbenchConnection.evaluate('location.pathname'),
    pathname => pathname === '/tocktutor',
  )
  await waitFor(
    () => workbenchConnection.evaluate(`({
      marker: sessionStorage.getItem('tockteam-smoke-session'),
      location: location.href,
      titlebars: document.querySelectorAll('[aria-label="TockTutor Title Bar"]').length,
      routeHidden: document.querySelector('[data-tockteam-tocktutor-route]')?.matches('[hidden]') ?? null,
      active: document.documentElement.dataset.tockteamTocktutorActive ?? null,
    })`),
    state => state.marker === 'preserved' && state.titlebars === 1,
  )
  await clearStartupDialogs(workbenchConnection)
  await showLauncherFromWorkbench(workbenchConnection)
  const settingsClicked = await launcherConnection.evaluate(`(() => {
    const button = document.getElementById('launcher-settings')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  assert.equal(settingsClicked, true)
  await waitFor(
    () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
    visible => visible === false,
  )
  await waitFor(
    () => workbenchConnection.evaluate('location.pathname'),
    pathname => pathname === '/tockcoder',
  )
  await waitFor(
    () => workbenchConnection.evaluate(`document.querySelectorAll('[role="dialog"]').length`),
    count => count > 0,
  )
  await waitFor(
    () => workbenchConnection.evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(node => node.textContent?.trim() === 'TockLauncher')?.getAttribute('aria-current') ?? null)`),
    current => current === 'true',
  )
  const settingsFacts = await workbenchConnection.evaluate(`(async () => {
    const snapshot = await window.dshDesktop?.launcher?.settings?.getSnapshot()
    return {
      bridgeFrozen: Object.isFrozen(window.dshDesktop?.launcher?.settings),
      catalog: document.body.textContent?.includes('100 rows · 102 runtime keys') ?? false,
      hasSecret: Object.hasOwn(snapshot?.values ?? {}, 'extension[DeeplTranslator].apiKey'),
      hasBrowserPath: Object.hasOwn(snapshot?.values ?? {}, 'general.browser.customWebBrowser.executableFilePath'),
      hasBrowserName: Object.hasOwn(snapshot?.values ?? {}, 'general.browser.customWebBrowserName'),
      hasHistorySwitch: document.querySelector('[aria-label="Enable search history"]') !== null,
      hasReset: [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Reset'),
      liveStatus: document.querySelector('[aria-live="polite"]') !== null,
      extensionSwitches: document.querySelectorAll('[data-testid="tocklauncher-extension-toggles"] button[role="switch"]').length,
    }
  })()`)
  assert.deepEqual(settingsFacts, { bridgeFrozen: true, catalog: true, hasSecret: false, hasBrowserPath: false, hasBrowserName: false, hasHistorySwitch: true, hasReset: true, liveStatus: true, extensionSwitches: 24 })
  await workbenchConnection.evaluate(`(async () => {
    await window.dshDesktop?.launcher?.settings?.updateSetting('general.searchHistory.enabled', true)
    await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.fuzziness', 0.6)
    await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.id', 'Fuse.js')
    await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.maxResultLength', 50)
    await window.dshDesktop?.launcher?.settings?.updateSetting('extensions.enabledExtensionIds', ['AppearanceSwitcher', 'ApplicationSearch', 'Base64Conversion', 'BrowserBookmarks', 'Calculator', 'ColorConverter', 'CurrencyConversion', 'CustomWebSearch', 'DeeplTranslator', 'FileSearch', 'JetBrainsToolbox', 'PasswordGenerator', 'QuickFormatter', 'RowlandTextEditor', 'SimpleFileSearch', 'SystemCommands', 'SystemSettings', 'TerminalLauncher', 'UeliCommand', 'UuidGenerator', 'VSCode', 'WebSearch', 'WindowsControlPanel', 'Workflow'])
  })()`)
  await showLauncherFromWorkbench(workbenchConnection)

  const localSearch = async (term, expected) => {
    await launcherConnection.evaluate(`(() => {
      const input = document.getElementById('launcher-search')
      if (!(input instanceof HTMLInputElement)) return false
      input.value = ${JSON.stringify(term)}
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    await waitFor(
      () => launcherConnection.evaluate(`document.body.textContent?.includes(${JSON.stringify(expected)}) ?? false`),
      found => found === true,
    )
    await sleep(500)
  }
  await localSearch('b64e TockTeam', 'VG9ja1RlYW0=')
  await localSearch('2 + 2', '4')
  await localSearch('rebeccapurple', '#663399')
  await localSearch('pw', 'Generated password')
  const passwordLengths = await launcherConnection.evaluate(`([...document.querySelectorAll('[data-result-id]')].filter(node => node.textContent?.includes('Generated password')).map(node => node.querySelector('strong')?.textContent?.length ?? 0))`)
  assert.equal(passwordLengths.length >= 5, true)
  assert.equal(passwordLengths.every(length => length === 24), true)
  await localSearch('qfj {"answer":42}', '"answer": 42')

  const copyClicked = await launcherConnection.evaluate(`(() => {
    const button = [...document.querySelectorAll('#launcher-details button')].find(node => node.textContent?.includes('Copy result to clipboard'))
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  assert.equal(copyClicked, true)
  await waitFor(() => launcherConnection.evaluate('document.activeElement?.id'), id => id === 'launcher-search')

  const openLocalTool = async (term, label, input, output, check) => {
    await localSearch(term, label)
    const selectedLocalItem = await launcherConnection.evaluate('document.querySelector(\'[data-result-id][aria-selected="true"]\')?.getAttribute(\'data-result-id\') ?? null')
    assert.equal(selectedLocalItem, `ueli-local:${label === 'Base64 Conversion' ? 'Base64Conversion' : label === 'Rowland Text Editor' ? 'RowlandTextEditor' : 'UuidGenerator'}`)
    const clicked = await launcherConnection.evaluate(`(() => {
      const button = [...document.querySelectorAll('#launcher-details button')].find(node => node.textContent?.includes(${JSON.stringify(`Open ${label}`)}))
      if (!(button instanceof HTMLButtonElement)) return false
      button.click()
      return true
    })()`)
    assert.equal(clicked, true)
    await waitFor(() => launcherConnection.evaluate(`document.querySelector('[aria-label=${JSON.stringify(`${label} tool`)}]') !== null`), found => found === true)
    const inputs = input === undefined ? [] : Array.isArray(input) ? input : [input]
    for (const controlInput of inputs) await launcherConnection.evaluate(`(() => {
      const control = document.querySelector(${JSON.stringify(controlInput.selector)})
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return false
      control.value = ${JSON.stringify(controlInput.value)}
      control.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    if (output !== undefined) await waitFor(() => launcherConnection.evaluate(`document.querySelector(${JSON.stringify(output.selector)})?.value ?? ''`), value => value === output.value)
    if (check !== undefined) assert.equal(await launcherConnection.evaluate(check), true)
    const closed = await launcherConnection.evaluate(`(() => {
      const button = document.querySelector('[aria-label=${JSON.stringify(`Close ${label} Tool`)}]')
      if (!(button instanceof HTMLButtonElement)) return false
      button.click()
      return true
    })()`)
    assert.equal(closed, true)
    await waitFor(() => launcherConnection.evaluate(`document.querySelector('[aria-label=${JSON.stringify(`${label} tool`)}]') === null && document.activeElement?.id === 'launcher-search'`), restored => restored === true)
  }
  await openLocalTool('Base64 Conversion', 'Base64 Conversion', { selector: '[aria-label="Base64 Input"]', value: 'TockTeam' }, { selector: '[aria-label="Base64 Output"]', value: 'VG9ja1RlYW0=' })
  await openLocalTool('Rowland Text Editor', 'Rowland Text Editor', [
    { selector: '[aria-label="Rowland Input"]', value: 'Hello\tWorld' },
    { selector: '[aria-label="Rowland Pattern"]', value: '$0 $1' },
  ], { selector: '[aria-label="Rowland Output"]', value: 'Hello World' })
  await openLocalTool('UUID / GUID Generator', 'UUID / GUID Generator', undefined, undefined, `(() => {
    const output = document.querySelector('[aria-label="Generated UUIDs"]')
    const lines = output instanceof HTMLTextAreaElement ? output.value.split(String.fromCharCode(10)) : []
    return lines.length === 10 && lines.every(value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value))
  })()`)

  await workbenchConnection.evaluate(`(async () => {
    await window.dshDesktop?.launcher?.settings?.updateSetting('general.searchHistory.enabled', false)
    await window.dshDesktop?.launcher?.settings?.updateSetting('general.searchHistory.enabled', true)
    await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.maxResultLength', 1)
  })()`)
  await showLauncherFromWorkbench(workbenchConnection)

  const effectiveSearchCount = await launcherConnection.evaluate(`(async () => {
    const result = await window.tockteamLauncher?.search('', {
      fuzziness: 0,
      maxSearchResultItems: 200,
      searchEngineId: 'fuzzysort',
    })
    return (result?.before.length ?? 0) + (result?.after.length ?? 0)
  })()`)
  assert.equal(effectiveSearchCount, 1)

  const emptyHistoryOpened = await launcherConnection.evaluate(`(() => {
    const button = document.getElementById('launcher-history-toggle')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  assert.equal(emptyHistoryOpened, true)
  const emptyHistory = await launcherConnection.evaluate(`(() => {
    const item = document.querySelector('#launcher-history [role="menuitem"]')
    return {
      disabled: item instanceof HTMLButtonElement && item.disabled,
      label: item?.textContent,
    }
  })()`)
  assert.deepEqual(emptyHistory, { disabled: true, label: 'No Recent Searches' })
  await launcherConnection.evaluate(`(() => {
    document.getElementById('launcher-history')?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    }))
  })()`)
  await waitFor(
    () => launcherConnection.evaluate(`({
      historyHidden: document.getElementById('launcher-history')?.hidden,
      focused: document.activeElement?.id,
    })`),
    state => state.historyHidden === true && state.focused === 'launcher-search',
  )
  assert.equal((await workbenchConnection.evaluate('window.dshDesktop?.launcher?.getState()'))?.visible, true)

  await launcherConnection.evaluate(`(() => {
    const input = document.getElementById('launcher-search')
    if (!(input instanceof HTMLInputElement)) return false
    input.value = 'coder'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await waitFor(
    () => launcherConnection.evaluate(`([...document.querySelectorAll('[data-result-id]')].some(node => node.textContent?.includes('TockCoder')))`) ,
    found => found === true,
  )
  const selectedAfterSearch = await launcherConnection.evaluate(`(() => {
    const selected = document.querySelector('[data-result-id][aria-selected="true"]')
    return {
      selected: selected?.textContent?.includes('TockCoder'),
      styled: selected?.className.includes('aria-selected:'),
    }
  })()`)
  assert.deepEqual(selectedAfterSearch, { selected: true, styled: true })

  const actionMenuOpened = await launcherConnection.evaluate(`(() => {
    const toggle = document.querySelector('#launcher-details button[aria-haspopup="menu"]')
    if (!(toggle instanceof HTMLButtonElement)) return false
    toggle.click()
    return document.querySelector('#launcher-actions-menu') !== null
      && document.activeElement?.getAttribute('role') === 'menuitem'
  })()`)
  assert.equal(actionMenuOpened, true)
  await launcherConnection.evaluate(`(() => {
    document.querySelector('#launcher-actions-menu [role="menuitem"]')?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    }))
  })()`)
  await waitFor(
    () => launcherConnection.evaluate(`({
      menuOpen: document.querySelector('#launcher-actions-menu') !== null,
      focused: document.activeElement?.id,
    })`),
    state => state.menuOpen === false && state.focused === 'launcher-search',
  )
  assert.equal((await workbenchConnection.evaluate('window.dshDesktop?.launcher?.getState()'))?.visible, true)

  const rowFocusRestored = await launcherConnection.evaluate(`(() => {
    document.querySelector('#launcher-details button[aria-haspopup="menu"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const row = document.querySelector('[data-result-id]')
    if (!(row instanceof HTMLButtonElement)) return false
    row.click()
    return document.activeElement?.id === 'launcher-search'
      && document.querySelector('#launcher-actions-menu') === null
  })()`)
  assert.equal(rowFocusRestored, true)

  const favoriteInvoked = await launcherConnection.evaluate(`(() => {
    document.querySelector('#launcher-details button[aria-haspopup="menu"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const action = [...document.querySelectorAll('#launcher-actions-menu [role="menuitem"]')]
      .find(node => node.textContent?.includes('Add to Favorites'))
    if (!(action instanceof HTMLButtonElement)) return false
    action.click()
    return true
  })()`)
  assert.equal(favoriteInvoked, true)
  await waitFor(
    () => launcherConnection.evaluate('document.activeElement?.id'),
    id => id === 'launcher-search',
  )

  const rescanClicked = await launcherConnection.evaluate(`(() => {
    const button = document.getElementById('launcher-rescan')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  assert.equal(rescanClicked, true)
  await waitFor(
    () => launcherConnection.evaluate(`({
      busy: document.getElementById('launcher-rescan')?.getAttribute('aria-busy'),
      disabled: document.getElementById('launcher-rescan')?.matches(':disabled'),
      status: document.getElementById('launcher-status')?.textContent,
    })`),
    state => state.busy === null && state.disabled === false && !state.status?.toLowerCase().includes('failed'),
  )

  const popupState = await launcherConnection.evaluate(`(() => {
    document.getElementById('launcher-history-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    document.querySelector('#launcher-details button[aria-haspopup="menu"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return {
      historyOpen: document.getElementById('launcher-history')?.hidden === false,
      actionMenuOpen: document.querySelector('#launcher-actions-menu') !== null,
    }
  })()`)
  assert.deepEqual(popupState, { historyOpen: true, actionMenuOpen: true })
  await launcherConnection.evaluate('window.tockteamLauncher?.dismiss()')
  await waitFor(
    () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
    visible => visible === false,
  )

  const resetShow = await showLauncherFromWorkbench(workbenchConnection)
  assert.equal(resetShow?.visible, true)
  await waitFor(
    () => launcherConnection.evaluate(`({
      focused: document.activeElement?.id,
      historyHidden: document.getElementById('launcher-history')?.hidden,
      actionMenuOpen: document.querySelector('#launcher-actions-menu') !== null,
    })`),
    state => state.focused === 'launcher-search' && state.historyHidden === true && state.actionMenuOpen === false,
  )
  const ordinaryEscape = await launcherConnection.evaluate(`(() => {
    const search = document.getElementById('launcher-search')
    if (!(search instanceof HTMLInputElement)) return false
    search.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }))
    return true
  })()`)
  assert.equal(ordinaryEscape, true)
  await waitFor(
    () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
    visible => visible === false,
  )

  const invokedShow = await showLauncherFromWorkbench(workbenchConnection)
  assert.equal(invokedShow?.visible, true)
  pages = await waitFor(
    () => electronPages(port),
    current => current.filter(page => page.title === 'TockLauncher').length === 1,
  )
  launcher = pages.find(page => page.title === 'TockLauncher')
  assert.equal(launcher?.id, firstLauncherId)
  await waitFor(
    () => launcherConnection.evaluate('document.activeElement?.id'),
    id => id === 'launcher-search',
  )
  const invoked = await launcherConnection.evaluate(`(() => {
    const button = document.querySelector('#launcher-details button')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  assert.equal(invoked, true)
  await waitFor(
    () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
    visible => visible === false,
  )
  assert.equal(await workbenchConnection.evaluate('location.href'), workbenchUrl)
  assert.equal(await workbenchConnection.evaluate('sessionStorage.getItem("tockteam-smoke-session")'), 'preserved')

  const closeReopen = await showLauncherFromWorkbench(workbenchConnection)
  assert.equal(closeReopen?.visible, true)
  pages = await waitFor(
    () => electronPages(port),
    current => current.filter(page => page.title === 'TockLauncher').length === 1,
  )
  launcher = pages.find(page => page.title === 'TockLauncher')
  assert.equal(launcher?.id, firstLauncherId)
  await waitFor(
    () => launcherConnection.evaluate('document.activeElement?.id'),
    id => id === 'launcher-search',
  )
  const historyOpened = await launcherConnection.evaluate(`(() => {
    const button = document.getElementById('launcher-history-toggle')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  assert.equal(historyOpened, true)
  await waitFor(
    () => launcherConnection.evaluate(`([...document.querySelectorAll('#launcher-history [role="menuitem"]')].some(node => node.textContent?.includes('coder')))`),
    found => found === true,
  )
  await launcherConnection.evaluate('window.tockteamLauncher?.dismiss()')
  await waitFor(
    () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
    visible => visible === false,
  )
  const invokeSecondInstanceToggle = async (visible, extraArguments = []) => {
    const toggle = spawn(electron, ['.', '--toggle', ...extraArguments, `--user-data-dir=${userData}`], {
      cwd: root,
      stdio: 'ignore',
    })
    try {
      await waitFor(
        () => workbenchConnection.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'),
        state => state === visible,
        10_000,
      )
    } finally {
      if (toggle.exitCode === null && toggle.pid !== undefined) {
        await stopChildProcess(toggle, 1_000, 1_000).catch(() => {})
      }
    }
  }
  const queuedWorkspace = await mkdtemp(join(userData, 'queued-workspace-'))
  await invokeSecondInstanceToggle(true, [queuedWorkspace])
  // The second-instance path is delivered to the workbench session; its
  // destination UI need not echo an absolute path. The launcher remains the
  // only recipient of --toggle and never receives this path as a query.
  assert.equal(await launcherConnection.evaluate(`document.body.textContent?.includes(${JSON.stringify(queuedWorkspace)}) ?? false`), false)
  await invokeSecondInstanceToggle(false)
  await workbenchConnection.evaluate(`(async () => {
    await window.dshDesktop?.launcher?.settings?.updateSetting('general.searchHistory.enabled', false)
    await window.dshDesktop?.launcher?.settings?.updateSetting('general.language', 'en-US')
  })()`)
  await showLauncherFromWorkbench(workbenchConnection)
  await waitFor(
    () => launcherConnection.evaluate(`(async () => ({
      hidden: document.getElementById('launcher-history-toggle')?.hidden,
      history: (await window.tockteamLauncher?.getSurfaceSettings())?.history,
    }))()`),
    state => state.hidden === true && Array.isArray(state.history) && state.history.length === 0,
  )
  await launcherConnection.evaluate('window.tockteamLauncher?.dismiss()')
  await workbenchConnection.call('Browser.close').catch(() => {})
  await waitFor(
    () => Promise.resolve(child.exitCode),
    exitCode => exitCode !== null,
    5_000,
  )

  await writeFile(join(userData, 'launcher', 'settings.json'), '{corrupt-primary', 'utf8')
  const restartPort = await freePort()
  restartedChild = spawn(electron, ['.', `--remote-debugging-port=${String(restartPort)}`, `--user-data-dir=${userData}`], {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  await waitFor(() => electronPages(restartPort), pages => pages.some(page => page.title === 'TockCoder'))
  const restartedPages = await electronPages(restartPort)
  const restartedWorkbench = restartedPages.find(page => page.title === 'TockCoder')
  assert.ok(restartedWorkbench)
  restartedWorkbenchConnection = await CdpPage.connect(restartedWorkbench.webSocketDebuggerUrl)
  const persistedSettings = await waitFor(
    () => restartedWorkbenchConnection.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.getSnapshot())()`),
    snapshot => snapshot?.values?.['searchEngine.fuzziness'] === 0.6
      && snapshot?.values?.['searchEngine.id'] === 'Fuse.js'
      && snapshot?.values?.['searchEngine.maxResultLength'] === 1
      && snapshot?.values?.['general.searchHistory.enabled'] === false
      && snapshot?.recoveredSettings === true
      && snapshot?.recoveredArtifacts?.includes('settings') === true,
  )
  assert.equal(persistedSettings.values['extension[DeeplTranslator].apiKey'], undefined)
  await restartedWorkbenchConnection.evaluate('window.dshDesktop?.launcher?.show()')
  const restartedLauncherPages = await waitFor(
    () => electronPages(restartPort),
    pages => pages.filter(page => page.title === 'TockLauncher').length === 1,
  )
  const restartedLauncher = restartedLauncherPages.find(page => page.title === 'TockLauncher')
  assert.ok(restartedLauncher)
  restartedLauncherConnection = await CdpPage.connect(restartedLauncher.webSocketDebuggerUrl)
  await waitFor(() => restartedLauncherConnection.evaluate('document.documentElement.dataset.launcherReady'), ready => ready === 'true')
  const disabledHistory = await restartedLauncherConnection.evaluate(`(async () => ({
    history: (await window.tockteamLauncher?.getSurfaceSettings())?.history,
    hidden: document.getElementById('launcher-history-toggle')?.hidden,
  }))()`)
  assert.deepEqual(disabledHistory, { history: [], hidden: true })
  await restartedWorkbenchConnection.call('Browser.close').catch(() => {})
  await waitFor(() => Promise.resolve(restartedChild.exitCode), exitCode => exitCode !== null, 5_000)
  console.log('launcher Electron smoke passed: fresh-toggle/sandbox/preload/CSP/geometry/focus/reuse/search/invoke/history/routes/reload/session/theme/skin/settings/updater/second-instance-intents/restart-persistence/graceful-quit')
} catch (error) {
  throw new Error(`${error instanceof Error ? error.stack ?? error.message : String(error)}\nElectron output:\n${output}`)
} finally {
  launcherConnection?.close()
  workbenchConnection?.close()
  restartedLauncherConnection?.close()
  restartedWorkbenchConnection?.close()
  if (child.pid !== undefined && child.exitCode === null) {
    if (process.platform === 'win32') {
      await stopChildProcess(child, 1_000, 1_000).catch(() => {})
    } else {
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
      const deadline = Date.now() + 3_000
      while (child.exitCode === null && Date.now() < deadline) await sleep(100)
      if (child.exitCode === null) {
        try { process.kill(-child.pid, 'SIGKILL') } catch {}
      }
    }
  }
  if (restartedChild?.pid !== undefined && restartedChild.exitCode === null) {
    if (process.platform === 'win32') {
      await stopChildProcess(restartedChild, 1_000, 1_000).catch(() => {})
    } else {
      try { process.kill(-restartedChild.pid, 'SIGTERM') } catch {}
      const deadline = Date.now() + 3_000
      while (restartedChild.exitCode === null && Date.now() < deadline) await sleep(100)
      if (restartedChild.exitCode === null) {
        try { process.kill(-restartedChild.pid, 'SIGKILL') } catch {}
      }
    }
  }
  await rm(userData, { recursive: true, force: true })
}
