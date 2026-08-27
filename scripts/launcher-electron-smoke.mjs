#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
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
  await clickWorkbenchFallback(workbenchConnection)

  pages = await waitFor(
    () => electronPages(port),
    current => current.filter(page => page.title === 'TockLauncher').length === 1,
  )
  launcher = pages.find(page => page.title === 'TockLauncher')
  assert.ok(launcher)
  const workbenchUrl = await workbenchConnection.evaluate('location.href')
  const workbenchMarker = await workbenchConnection.evaluate(`(() => {
    window.__tockteamLauncherSmokeMarker = 'same-workbench-renderer'
    return window.__tockteamLauncherSmokeMarker
  })()`)
  launcherConnection = await CdpPage.connect(launcher.webSocketDebuggerUrl)
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
    launcherApiKeys: ['dismiss', 'getTheme', 'invokeAction', 'onTheme', 'openSettings', 'rescan', 'search'],
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
  const tutorLauncherButton = await workbenchConnection.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open TockLauncher"]')
    return button instanceof HTMLButtonElement && !button.disabled
  })()`)
  assert.equal(tutorLauncherButton, true)
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
  await showLauncherFromWorkbench(workbenchConnection)

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
  assert.deepEqual(emptyHistory, { disabled: false, label: 'coder' })
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
  assert.equal(await workbenchConnection.evaluate('window.__tockteamLauncherSmokeMarker'), workbenchMarker)

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
  const invokeSecondInstanceToggle = async (visible) => {
    const toggle = spawn(electron, ['.', '--toggle', `--user-data-dir=${userData}`], {
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
  await invokeSecondInstanceToggle(true)
  await invokeSecondInstanceToggle(false)
  console.log('launcher Electron smoke passed: sandbox/preload/CSP/geometry/focus/reuse/search/invoke/history/routes/theme/updater/second-instance-toggle')
} catch (error) {
  throw new Error(`${error instanceof Error ? error.stack ?? error.message : String(error)}\nElectron output:\n${output}`)
} finally {
  launcherConnection?.close()
  workbenchConnection?.close()
  if (child.pid !== undefined) {
    if (process.platform === 'win32') {
      await stopChildProcess(child, 1_000, 1_000).catch(() => {})
    } else {
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
      await sleep(1_000)
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    }
  }
  await rm(userData, { recursive: true, force: true })
}
