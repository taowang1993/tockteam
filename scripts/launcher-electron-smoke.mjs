#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { ensureElectronInstalled } from './electron-runtime.mjs'

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
  launcherConnection = await CdpPage.connect(launcher.webSocketDebuggerUrl)
  const firstLauncherId = launcher.id
  const facts = await launcherConnection.evaluate(`({
    ready: document.documentElement.dataset.launcherReady,
    width: innerWidth,
    height: innerHeight,
    focused: document.activeElement?.id,
    process: typeof window.process,
    require: typeof window.require,
    dshDesktop: typeof window.dshDesktop,
    electronAPI: typeof window.electronAPI,
    launcherApiKeys: Object.keys(window.tockteamLauncher ?? {}),
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
    launcherApiKeys: ['dismiss'],
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

  await launcherConnection.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  })
  await waitFor(
    () => launcherConnection.evaluate('document.visibilityState'),
    visibility => visibility === 'hidden',
  )
  await clickWorkbenchFallback(workbenchConnection)
  pages = await waitFor(
    () => electronPages(port),
    current => current.filter(page => page.title === 'TockLauncher').length === 1,
  )
  launcher = pages.find(page => page.title === 'TockLauncher')
  assert.equal(launcher?.id, firstLauncherId)
  assert.equal(await launcherConnection.evaluate('document.visibilityState'), 'visible')
  assert.equal(await launcherConnection.evaluate('document.activeElement?.id'), 'launcher-search')
  console.log('launcher Electron smoke passed: sandbox/preload/CSP/geometry/focus/reuse/Escape/workbench preservation')
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : String(error)}\nElectron output:\n${output}`)
} finally {
  launcherConnection?.close()
  workbenchConnection?.close()
  if (child.pid !== undefined) {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
    await sleep(1_000)
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
  }
  await rm(userData, { recursive: true, force: true })
}
