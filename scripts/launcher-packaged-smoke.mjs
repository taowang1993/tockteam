#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { spawn as spawnProcess, spawnSync } from 'node:child_process'
import { cp, open, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Arch, DIR_TARGET, Platform, build } from 'electron-builder'
import { stopChildProcess } from './process-cleanup.mjs'
import { LAUNCHER_CSP, LAUNCHER_SESSION_PARTITION } from '../src/launcher-security.ts'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const contract = JSON.parse(await readFile(join(root, 'scripts/ueli/desktop-release-contract.json'), 'utf8'))
const mainSource = await readFile(join(root, 'src/main.ts'), 'utf8')
// The actual product gates every development fixture with app.isPackaged; this runner never enables one.
assert.match(mainSource, /\bapp\.isPackaged\b/u)
assert.match(mainSource, /launcherPackagedSmokeEnabled/u)
for (const securityFact of ['contextIsolation', 'nodeIntegration', 'sandbox', 'LAUNCHER_SESSION_PARTITION']) {
  assert.match(mainSource, new RegExp(securityFact, 'u'))
}
const electronPackage = require(join(root, 'node_modules/electron/package.json'))
const smokeFlag = '--tockteam-launcher-packaged-smoke'
const smokeMarker = 'TOCKTEAM_PACKAGED_SMOKE '
const smokeTimeoutMs = 120_000
const launcherApiKeys = Object.freeze([
  'cancelAction',
  'dismiss',
  'getLocalExtensionSettings',
  'getSurfaceSettings',
  'getTheme',
  'invokeAction',
  'onLocale',
  'onTheme',
  'openSettings',
  'recordSearch',
  'rescan',
  'search',
])

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}

async function freePort() {
  const server = createServer()
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise(resolvePromise => server.close(resolvePromise))
  return port
}

async function waitFor(fetcher, predicate, timeout = smokeTimeoutMs) {
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
  throw new Error(`Timed out waiting for packaged TockTeam state: ${last instanceof Error ? last.message : JSON.stringify(last)}`)
}

async function listPages(port) {
  const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`)
  if (!response.ok) throw new Error(`Packaged DevTools page listing failed: ${response.status}`)
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
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener('open', resolvePromise, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return page
  }

  call(method, params = {}) {
    const id = this.#nextId++
    return new Promise((resolvePromise, reject) => {
      this.#pending.set(id, { resolve: resolvePromise, reject })
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
      throw new Error(response.exceptionDetails.text ?? 'packaged renderer evaluation failed')
    }
    return response.result?.value
  }

  async pressKey(key) {
    const virtualKeyCodes = { Escape: 27, Enter: 13, ArrowDown: 40, ArrowUp: 38 }
    const virtualKeyCode = virtualKeyCodes[key]
    const payload = virtualKeyCode === undefined
      ? { key, code: key }
      : { key, code: key, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode }
    await this.call('Input.dispatchKeyEvent', { type: 'keyDown', ...payload })
    if (key === 'Enter' || key === ' ') await this.call('Input.dispatchKeyEvent', { type: 'char', ...payload, text: key === 'Enter' ? '\r' : ' ' })
    await this.call('Input.dispatchKeyEvent', { type: 'keyUp', ...payload })
  }

  async clickSelector(selector) {
    await this.call('Page.bringToFront')
    const box = await this.evaluate(`(() => {
      const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(candidate => candidate instanceof HTMLElement && !candidate.hidden && candidate.getClientRects().length > 0 && getComputedStyle(candidate).display !== 'none' && getComputedStyle(candidate).visibility !== 'hidden' && !candidate.matches(':disabled'))
      if (!(element instanceof HTMLElement)) return null
      element.scrollIntoView({ block: 'center', inline: 'nearest' })
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return { keyboardFallback: hit !== element && !(hit instanceof Node && element.contains(hit)), x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    if (box === null) return false
    if (box.keyboardFallback) {
      const focused = await this.evaluate(`(() => {
        const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(candidate => candidate instanceof HTMLElement && !candidate.hidden && candidate.getClientRects().length > 0 && !candidate.matches(':disabled'))
        if (!(element instanceof HTMLElement)) return false
        element.focus()
        return document.activeElement === element
      })()`)
      if (!focused) return false
      await this.pressKey('Enter')
      return true
    }
    await this.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
    await this.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await this.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    return true
  }

  async clickText(text) {
    return await this.clickSelector(`button, summary`)
      .then(async clicked => {
        if (!clicked) return false
        const selected = await this.evaluate(`(() => [...document.querySelectorAll('button, summary')].some(candidate => candidate instanceof HTMLElement && candidate.textContent?.trim() === ${JSON.stringify(text)} && document.activeElement === candidate))()`)
        return selected
      })
  }

  close() {
    this.#socket.close()
  }
}

async function clickExactText(page, text) {
  await page.call('Page.bringToFront')
  const box = await page.evaluate(`(() => {
    const element = [...document.querySelectorAll('button, summary')].find(candidate => candidate instanceof HTMLElement && candidate.textContent?.trim() === ${JSON.stringify(text)} && !candidate.hidden && candidate.getClientRects().length > 0 && !candidate.matches(':disabled'))
    if (!(element instanceof HTMLElement)) return null
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  if (box === null) return false
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  return true
}

async function clearStartupDialogs(page) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await clickExactText(page, 'Configure later') || await clickExactText(page, 'Continue')
    if (clicked) {
      await sleep(250)
      continue
    }
    const pending = await page.evaluate(`([...document.querySelectorAll('button')].some(button => ['Configure later', 'Continue'].includes(button.textContent?.trim() ?? '') && !button.matches(':disabled')))`)
    if (!pending && attempt >= 10) return
    await sleep(150)
  }
}

function run(command, args, options = {}) {
  const spawnOptions = { cwd: root, stdio: 'inherit', ...options }
  // Windows exposes pnpm through a .cmd shim; the fixed build arguments are safe for cmd.exe.
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) spawnOptions.shell = true
  const result = spawnSync(command, args, spawnOptions)
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${String(result.status)}`)
}

function currentTarget() {
  const platform = process.platform === 'darwin'
    ? { builder: Platform.MAC, key: 'mac', label: 'macOS' }
    : process.platform === 'win32'
      ? { builder: Platform.WINDOWS, key: 'win', label: 'Windows' }
      : process.platform === 'linux'
        ? { builder: Platform.LINUX, key: 'linux', label: 'Linux' }
        : undefined
  if (platform === undefined) throw new Error(`Unsupported packaged TockLauncher smoke platform: ${process.platform}`)
  const architecture = process.arch === 'arm64' ? Arch.arm64 : process.arch === 'x64' ? Arch.x64 : undefined
  if (architecture === undefined) throw new Error(`Unsupported packaged TockLauncher smoke architecture: ${process.arch}`)
  return Object.freeze({ ...platform, architecture })
}

function packagedBuilderConfig(outputDir, target, appDir) {
  const platformConfig = packageJson.build?.[target.key] ?? {}
  const extraResources = (packageJson.build?.extraResources ?? []).map(resource => ({
    ...resource,
    from: resolve(root, resource.from),
  }))
  return {
    ...packageJson.build,
    asar: true,
    directories: { ...packageJson.build?.directories, app: appDir, output: outputDir },
    extraResources,
    [target.key]: {
      ...platformConfig,
      ...(platformConfig.icon === undefined ? {} : { icon: resolve(root, platformConfig.icon) }),
      target: ['dir'],
      ...(target.key === 'mac' ? { identity: null } : {}),
    },
    ...(packageJson.build?.afterPack === undefined ? {} : { afterPack: resolve(root, packageJson.build.afterPack) }),
    publish: 'never',
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
  }
}

async function createPackageInput(appDir) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const deploySource = join(dirname(appDir), 'deploy-source')
  await mkdir(deploySource, { recursive: true })
  await cp(join(root, 'dist'), join(deploySource, 'dist'), { recursive: true })
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    await cp(join(root, file), join(deploySource, file))
  }
  const appManifest = { ...packageJson }
  delete appManifest.build
  delete appManifest.devDependencies
  delete appManifest.peerDependencies
  appManifest.packageManager = 'pnpm@11.21.0'
  await writeFile(join(deploySource, 'package.json'), `${JSON.stringify(appManifest, null, 2)}\n`, 'utf8')
  await cp(join(root, 'pnpm-lock.yaml'), join(deploySource, 'pnpm-lock.yaml'))
  await writeFile(join(deploySource, 'pnpm-workspace.yaml'), 'packages:\n  - .\n', 'utf8')
  run(pnpm, ['--filter', '.', 'deploy', '--prod', '--legacy', appDir], { cwd: deploySource })
  for (const file of ['preload.cjs', 'splash.html']) {
    await cp(join(root, 'dist', file), join(appDir, 'dist', file))
  }
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    await cp(join(root, file), join(appDir, file))
  }
}

async function findAsar(rootPath, depth = 0) {
  if (depth > 8) return undefined
  let entries
  try {
    entries = await readdir(rootPath, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    const path = join(rootPath, entry.name)
    if (entry.isFile() && entry.name === 'app.asar') return path
    if (entry.isDirectory()) {
      const result = await findAsar(path, depth + 1)
      if (result !== undefined) return result
    }
  }
  return undefined
}

async function findPackagedExecutable(outputDir, target) {
  if (target.key === 'mac') {
    const appRoot = await findDirectory(outputDir, entry => entry.name.endsWith('.app'))
    if (appRoot === undefined) throw new Error(`Packaged macOS app was not found below ${outputDir}`)
    const binaries = await readdir(join(appRoot, 'Contents', 'MacOS'), { withFileTypes: true })
    const binary = binaries.find(entry => entry.isFile())
    if (binary === undefined) throw new Error('Packaged macOS executable was not found')
    return join(appRoot, 'Contents', 'MacOS', binary.name)
  }
  const executableName = target.key === 'win' ? `${contract.identity.executableName}.exe` : contract.identity.executableName
  const executable = await findFile(outputDir, entry => entry.name.toLowerCase() === executableName.toLowerCase())
  if (executable === undefined) throw new Error(`Packaged executable ${executableName} was not found below ${outputDir}`)
  return executable
}

async function findDirectory(rootPath, predicate, depth = 0) {
  if (depth > 8) return undefined
  let entries
  try { entries = await readdir(rootPath, { withFileTypes: true }) } catch { return undefined }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(rootPath, entry.name)
    if (predicate(entry)) return path
    const result = await findDirectory(path, predicate, depth + 1)
    if (result !== undefined) return result
  }
  return undefined
}

async function findFile(rootPath, predicate, depth = 0) {
  if (depth > 8) return undefined
  let entries
  try { entries = await readdir(rootPath, { withFileTypes: true }) } catch { return undefined }
  for (const entry of entries) {
    const path = join(rootPath, entry.name)
    if (entry.isFile() && predicate(entry)) return path
    if (entry.isDirectory()) {
      const result = await findFile(path, predicate, depth + 1)
      if (result !== undefined) return result
    }
  }
  return undefined
}

async function readAsarHeader(asarPath) {
  const handle = await open(asarPath, 'r')
  try {
    const prefix = Buffer.alloc(8)
    const prefixRead = await handle.read(prefix, 0, prefix.length, 0)
    if (prefixRead.bytesRead !== prefix.length) throw new Error('Unable to read ASAR header size')
    const headerSize = prefix.readUInt32LE(4)
    if (!Number.isSafeInteger(headerSize) || headerSize < 8 || headerSize > 64 * 1024 * 1024) throw new Error(`Invalid ASAR header size: ${headerSize}`)
    const headerBuffer = Buffer.alloc(headerSize)
    const headerRead = await handle.read(headerBuffer, 0, headerBuffer.length, 8)
    if (headerRead.bytesRead !== headerBuffer.length) throw new Error('Unable to read ASAR header')
    const jsonLength = headerBuffer.readUInt32LE(4)
    if (!Number.isSafeInteger(jsonLength) || jsonLength < 2 || jsonLength > headerSize - 8) throw new Error('Invalid ASAR header JSON length')
    return Object.freeze({ header: JSON.parse(headerBuffer.subarray(8, 8 + jsonLength).toString('utf8')), headerSize })
  } finally {
    await handle.close()
  }
}

function listAsarFiles(header, prefix = '', result = []) {
  for (const [name, entry] of Object.entries(header.files ?? {})) {
    const path = prefix === '' ? name : `${prefix}/${name}`
    if (entry !== null && typeof entry === 'object' && entry.files !== undefined) listAsarFiles(entry, path, result)
    else result.push(path)
  }
  return result
}

function asarEntry(header, path) {
  let current = header.files
  for (const part of path.split('/')) {
    if (current === null || typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

async function readAsarText(asarPath, asar, path) {
  const entry = asarEntry(asar.header, path)
  if (entry === undefined || typeof entry !== 'object' || entry.files !== undefined || entry.link !== undefined) throw new Error(`ASAR file is missing: ${path}`)
  const offset = Number(entry.offset)
  const size = Number(entry.size)
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || size > 64 * 1024 * 1024) throw new Error(`Invalid ASAR entry: ${path}`)
  const handle = await open(asarPath, 'r')
  try {
    const content = Buffer.alloc(size)
    const read = await handle.read(content, 0, size, 8 + asar.headerSize + offset)
    if (read.bytesRead !== size) throw new Error(`Unable to read ASAR file: ${path}`)
    return content.toString('utf8')
  } finally {
    await handle.close()
  }
}

function assertArchiveInventory(files, asarText, asarPath) {
  const fileSet = new Set(files)
  for (const expected of contract.resources.builderFiles) {
    if (expected.endsWith('/**')) {
      const prefix = expected.slice(0, -3)
      assert.ok(files.some(file => file.startsWith(prefix)), `ASAR is missing ${expected}`)
    } else assert.ok(fileSet.has(expected), `ASAR is missing ${expected}`)
  }
  const launcherAssets = files.filter(file => file.startsWith('dist/launcher-assets/'))
  const expectedAssets = contract.foundation.launcherAssets.map(asset => asset.path)
  assert.equal(launcherAssets.length, expectedAssets.length, 'ASAR launcher asset count drifted')
  assert.deepEqual([...launcherAssets].sort(), [...expectedAssets].sort(), 'ASAR launcher asset inventory drifted')
  assert.equal(expectedAssets.length, 65, 'launcher asset contract must remain exactly 65 assets')
  assert.ok(asarText.includes('Ueli'), 'ASAR third-party notice does not contain Ueli attribution')
  assert.ok(asarText.includes('OpenMoji'), 'ASAR third-party notice does not contain OpenMoji attribution')
  assert.doesNotMatch(files.join('\n'), /vendor[/\\]ueli/iu, 'ASAR contains vendor/ueli source')
  assert.doesNotMatch(asarText, /vendor[/\\]ueli/iu, 'ASAR metadata contains vendor/ueli source')
  return Object.freeze({ assetCount: launcherAssets.length, asarPath, fileCount: files.length, vendorSourceShipped: false })
}

async function inspectPackage(outputDir, target) {
  const executable = await findPackagedExecutable(outputDir, target)
  assert.equal((await stat(executable)).isFile(), true)
  const asarPath = await findAsar(outputDir)
  assert.ok(asarPath, 'packaged app.asar was not found')
  const asar = await readAsarHeader(asarPath)
  const files = listAsarFiles(asar.header).sort()
  const packageText = await readAsarText(asarPath, asar, 'package.json')
  const packedManifest = JSON.parse(packageText)
  assert.equal(packedManifest.name, contract.identity.packageName)
  assert.equal(packedManifest.productName, contract.identity.productName)
  assert.equal(packedManifest.desktopName, contract.identity.desktopName)
  assert.equal(packageJson.build?.appId, contract.identity.appId)
  assert.equal(packageJson.build?.productName, contract.identity.productName)
  assert.equal(packageJson.build?.asar, true)
  assert.equal(packageJson.build?.linux?.executableName, contract.identity.executableName)
  assert.equal(packedManifest.build, undefined)
  assertArchiveInventory(files, await readAsarText(asarPath, asar, 'THIRD_PARTY_NOTICES.md'), asarPath)
  if (target.key === 'mac') {
    const appRoot = asarPath.slice(0, asarPath.indexOf('.app/') + 4)
    const infoPlist = await readFile(join(appRoot, 'Contents', 'Info.plist'), 'utf8')
    assert.match(infoPlist, new RegExp(contract.identity.appId.replaceAll('.', '\\.'), 'u'))
    assert.match(infoPlist, new RegExp(contract.identity.productName.replaceAll(' ', '\\s+'), 'u'))
  }
  const stagedNode = join(root, '.stage', 'node-runtime', process.platform === 'win32' ? 'node.exe' : join('bin', 'node'))
  const nodeVersion = spawnSync(stagedNode, ['--version'], { encoding: 'utf8' })
  assert.equal(nodeVersion.status, 0, `staged Node runtime must execute for ${process.platform}-${process.arch}`)
  assert.match(nodeVersion.stdout.trim(), /^v(?:2[4-9]|[3-9][0-9])\./u, 'staged Node runtime does not satisfy Node >=24')
  return Object.freeze({
    appId: contract.identity.appId,
    appPath: asarPath,
    appPathUsesAsar: true,
    assetCount: files.filter(file => file.startsWith('dist/launcher-assets/')).length,
    executable,
    electron: { architecture: process.arch, version: electronPackage.version },
    node: { architecture: process.arch, version: nodeVersion.stdout.trim() },
    productName: contract.identity.productName,
    vendorSourceShipped: false,
  })
}

function smokeEnvironment() {
  const environment = { ...process.env, TOCKTEAM_PACKAGED_SMOKE: '1' }
  delete environment.ELECTRON_RUN_AS_NODE
  for (const key of Object.keys(environment)) if (/^TOCKTEAM_.*(?:FIXTURE|SMOKE_USER_DATA|SMOKE_OUTPUT)/u.test(key)) delete environment[key]
  environment.TOCKTEAM_PACKAGED_SMOKE = '1'
  return environment
}

async function launchPackaged(executable, userData, port) {
  const child = spawnProcess(executable, [`--remote-debugging-port=${String(port)}`, `--user-data-dir=${userData}`, smokeFlag, '--toggle'], {
    cwd: root,
    detached: true,
    env: smokeEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const debug = process.env.TOCKTEAM_VERBOSE_PACKAGED_SMOKE === '1'
  child.stdout?.on('data', chunk => {
    const value = String(chunk)
    output = `${output}${value}`.slice(-16_000)
    if (debug) process.stderr.write(`[packaged-app stdout] ${value}`)
  })
  child.stderr?.on('data', chunk => {
    const value = String(chunk)
    output = `${output}${value}`.slice(-16_000)
    if (debug) process.stderr.write(`[packaged-app stderr] ${value}`)
  })
  try {
    const debug = process.env.TOCKTEAM_VERBOSE_PACKAGED_SMOKE === '1'
    const step = async (name, operation) => {
      if (debug) console.error(`[packaged-smoke] ${name}`)
      return await operation()
    }
    const workbenchPages = await step('wait for TockCoder', () => waitFor(() => listPages(port), pages => pages.some(page => page.title === 'TockCoder')))
    const workbenchDescriptor = workbenchPages.find(page => page.title === 'TockCoder')
    assert.ok(workbenchDescriptor?.webSocketDebuggerUrl, 'TockCoder CDP page is missing its debugger endpoint')
    const workbench = await step('connect to TockCoder', () => CdpPage.connect(workbenchDescriptor.webSocketDebuggerUrl))
    await step('clear startup dialogs', () => clearStartupDialogs(workbench))
    await step('wait for runtime ready', () => waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.getRuntimeSnapshot())?.status)()'), status => status === 'ready', 120_000))
    await step('mark and show launcher', () => workbench.evaluate(`(async () => { window.__tockteamPackagedSmoke = { href: location.href, marker: 'workbench-alive' }; return await window.dshDesktop?.launcher?.show() })()`))
    const launcherPages = await step('wait for TockLauncher', () => waitFor(() => listPages(port), pages => pages.some(page => page.title === 'TockLauncher')))
    const launcherDescriptor = launcherPages.find(page => page.title === 'TockLauncher')
    assert.ok(launcherDescriptor?.webSocketDebuggerUrl, 'TockLauncher CDP page is missing its debugger endpoint')
    const launcher = await step('connect to TockLauncher', () => CdpPage.connect(launcherDescriptor.webSocketDebuggerUrl))
    await step('wait for launcher ready', () => waitFor(() => launcher.evaluate('document.documentElement.dataset.launcherReady'), ready => ready === 'true'))
    await step('wait for launcher visible', () => waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'), visible => visible === true))
    return Object.freeze({ child, launcher, workbench, output: () => output })
  } catch (error) {
    await stopPackagedChild(child)
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`)
  }
}

async function stopPackagedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* process already exited */ }
  }
  await stopChildProcess(child)
}

async function runRendererSmoke(workbench, launcher, inventory, userData) {
  const securityEvidence = await waitFor(
    () => readFile(join(userData, 'launcher', 'packaged-smoke-security.json'), 'utf8').then(value => JSON.parse(value)).catch(() => null),
    value => value?.sessionMatches === true && value?.launcherSessionPartition === LAUNCHER_SESSION_PARTITION,
  )
  assert.equal(securityEvidence.appPathUsesAsar, true)
  const launcherFacts = await launcher.evaluate(`(async () => {
    const permission = await navigator.permissions.query({ name: 'notifications' })
    return {
      apiKeys: Object.keys(globalThis.tockteamLauncher ?? {}).sort(),
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null,
      href: location.href,
      hasNodeProcess: typeof globalThis.process !== 'undefined',
      hasRequire: typeof globalThis.require !== 'undefined',
      notificationPermission: permission.state,
      ready: document.documentElement.dataset.launcherReady,
      title: document.title,
    }
  })()`)
  assert.equal(launcherFacts.ready, 'true')
  assert.equal(launcherFacts.title, 'TockLauncher')
  assert.match(launcherFacts.href, /\.asar[/\\]dist[/\\]launcher\.html(?:$|[?#])/u)
  assert.equal(launcherFacts.csp, LAUNCHER_CSP)
  assert.deepEqual(launcherFacts.apiKeys, [...launcherApiKeys].sort())
  assert.equal(launcherFacts.hasNodeProcess, false)
  assert.equal(launcherFacts.hasRequire, false)
  assert.equal(launcherFacts.notificationPermission, 'denied')
  assert.equal(inventory.appPathUsesAsar, true)
  assert.equal(securityEvidence.sessionMatches, true)
  assert.equal(securityEvidence.launcherSessionPartition, LAUNCHER_SESSION_PARTITION)

  const workbenchFacts = await workbench.evaluate(`(async () => {
    const info = await window.dshDesktop?.getInfo()
    return { href: location.href, marker: window.__tockteamPackagedSmoke?.marker, profile: info?.profile, version: info?.version }
  })()`)
  assert.equal(workbenchFacts.marker, 'workbench-alive')
  assert.equal(typeof workbenchFacts.href, 'string')
  assert.equal(typeof workbenchFacts.version, 'string')

  const beforeSettings = await workbench.evaluate('(async () => await window.dshDesktop?.launcher?.settings?.getSnapshot())()')
  assert.ok(beforeSettings?.values !== undefined)
  assert.equal(beforeSettings.secureStorageAvailable, false, 'packaged smoke must exercise fail-closed secure storage mode')
  const originalEnabled = Array.isArray(beforeSettings.values['extensions.enabledExtensionIds'])
    ? beforeSettings.values['extensions.enabledExtensionIds']
    : ['ApplicationSearch', 'UeliCommand']
  const enabled = [...new Set([...originalEnabled, 'Base64Conversion'])]
  await workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('extensions.enabledExtensionIds', ${JSON.stringify(enabled)}))()`)
  const enabledSnapshot = await waitFor(
    () => workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.settings?.getSnapshot())?.values?.["extensions.enabledExtensionIds"] ?? null)()'),
    value => Array.isArray(value) && value.includes('Base64Conversion'),
  )
  assert.ok(Array.isArray(enabledSnapshot) && enabledSnapshot.includes('Base64Conversion'))

  const searchResult = await launcher.evaluate(`(async () => {
    const response = await window.tockteamLauncher?.search('Base64 Conversion', { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' })
    const item = [...(response?.before ?? []), ...(response?.after ?? [])].find(candidate => candidate.sourceExtension === 'Base64Conversion')
    return item === undefined ? null : { actionId: item.defaultAction.actionId, id: item.id, sourceExtension: item.sourceExtension }
  })()`)
  assert.ok(searchResult)
  assert.equal(searchResult.sourceExtension, 'Base64Conversion')
  assert.match(searchResult.actionId, /^launcher-action:/u)
  await launcher.evaluate(`(() => { const input = document.getElementById('launcher-search'); if (!(input instanceof HTMLInputElement)) throw new Error('launcher search input is missing'); input.value = 'Base64 Conversion'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await waitFor(() => launcher.evaluate('document.querySelector(\'[data-result-id="ueli-local:Base64Conversion"]\') !== null'), found => found === true)
  assert.equal(await launcher.clickSelector('[data-result-id="ueli-local:Base64Conversion"]'), true)
  await waitFor(() => launcher.evaluate('document.querySelector(\'#launcher-details button[aria-label^="Open "]\') !== null'), found => found === true)
  assert.equal(await launcher.clickSelector('#launcher-details button[aria-label^="Open "]'), true)
  await waitFor(() => launcher.evaluate('document.querySelector("[aria-label=\\"Base64 Conversion Tool\\"]") !== null'), found => found === true)
  await launcher.pressKey('Escape')
  await waitFor(() => launcher.evaluate('document.querySelector("[aria-label=\\"Base64 Conversion Tool\\"]") === null'), closed => closed === true)

  const originalFuzziness = typeof beforeSettings.values['searchEngine.fuzziness'] === 'number'
    ? beforeSettings.values['searchEngine.fuzziness']
    : 0.5
  const roundTripValue = originalFuzziness === 0.6 ? 0.5 : 0.6
  await workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.fuzziness', ${String(roundTripValue)}))()`)
  assert.equal(await waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.settings?.getSnapshot())?.values?.["searchEngine.fuzziness"] ?? null)()'), value => value === roundTripValue), roundTripValue)
  await workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('searchEngine.fuzziness', ${JSON.stringify(originalFuzziness)}))()`)
  assert.equal(await waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.settings?.getSnapshot())?.values?.["searchEngine.fuzziness"] ?? null)()'), value => value === originalFuzziness), originalFuzziness)

  const workbenchHref = workbenchFacts.href
  const workbenchMarker = await workbench.evaluate(`(() => { window.__tockteamPackagedSmoke.marker = 'workbench-before-dismiss'; return window.__tockteamPackagedSmoke.marker })()`)
  assert.equal(workbenchMarker, 'workbench-before-dismiss')
  await launcher.evaluate('(async () => await window.tockteamLauncher?.dismiss())()')
  await waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'), visible => visible === false)
  const survivingWorkbench = await workbench.evaluate('({ href: location.href, marker: window.__tockteamPackagedSmoke?.marker, title: document.title })')
  assert.equal(survivingWorkbench.href, workbenchHref)
  assert.equal(survivingWorkbench.marker, 'workbench-before-dismiss')
  assert.equal(survivingWorkbench.title, 'TockCoder')
  const desktopLog = await waitFor(
    () => readFile(join(userData, 'logs', 'desktop.log'), 'utf8').catch(() => ''),
    value => value.includes(`starting (${process.arch})`),
  )
  const runtimeArchitecture = desktopLog.match(/starting \((arm64|x64)\)/u)?.[1]
  assert.equal(runtimeArchitecture, process.arch)
  return Object.freeze({
    launcher: launcherFacts,
    runtimeArchitecture,
    security: securityEvidence,
    search: searchResult,
    settingsRoundTrip: { restored: originalFuzziness, changed: roundTripValue },
    workbench: survivingWorkbench,
  })
}

async function main() {
  const target = currentTarget()
  const smokeRoot = await mkdtemp(join(tmpdir(), 'tockteam-launcher-packaged-'))
  const appDir = join(smokeRoot, 'app-input')
  const outputDir = join(smokeRoot, 'package')
  const userData = join(smokeRoot, 'user-data')
  let child
  let launcher
  let workbench
  try {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    run(pnpm, ['run', 'build:tocktutor'])
    run(pnpm, ['run', 'build'])
    run(pnpm, ['run', 'build:dsh'])
    run(pnpm, ['run', 'stage:dsh'])
    run(process.execPath, [join(root, 'scripts/ueli/check-package-feasibility.mjs')])
    await createPackageInput(appDir)
    await mkdir(outputDir, { recursive: true })
    await build({
      projectDir: appDir,
      targets: target.builder.createTarget(DIR_TARGET, target.architecture),
      config: { ...packagedBuilderConfig(outputDir, target, appDir), electronVersion: electronPackage.version },
    })
    const inventory = await inspectPackage(outputDir, target)
    const port = await freePort()
    const launched = await launchPackaged(inventory.executable, userData, port)
    child = launched.child
    launcher = launched.launcher
    workbench = launched.workbench
    const renderer = await runRendererSmoke(workbench, launcher, inventory, userData)
    const evidence = Object.freeze({
      appId: inventory.appId,
      appPath: inventory.appPath,
      appPathUsesAsar: inventory.appPathUsesAsar,
      assetCount: inventory.assetCount,
      electron: inventory.electron,
      launcher: renderer.launcher,
      node: inventory.node,
      productName: inventory.productName,
      runtimeArchitecture: renderer.runtimeArchitecture,
      security: renderer.security,
      settingsRoundTrip: renderer.settingsRoundTrip,
      search: renderer.search,
      vendorSourceShipped: inventory.vendorSourceShipped,
      workbench: renderer.workbench,
    })
    console.log(`${smokeMarker}${JSON.stringify(evidence)}`)
    console.log(`Packaged TockLauncher smoke passed on ${target.label}-${process.arch}: ${contract.identity.appId}.`)
  } finally {
    launcher?.close()
    workbench?.close()
    if (child !== undefined) await stopPackagedChild(child)
    if (process.env.TOCKTEAM_KEEP_LAUNCHER_PACKAGE_SMOKE !== '1') await rm(smokeRoot, { recursive: true, force: true })
    else console.log(`TockTeam packaged launcher smoke retained at ${smokeRoot}`)
  }
}

if (process.argv.includes(smokeFlag)) await main()
else {
  console.error(`This package smoke requires ${smokeFlag}`)
  process.exitCode = 2
}
