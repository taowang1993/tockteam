#!/usr/bin/env node

import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { spawn as spawnProcess, spawnSync } from 'node:child_process'
import { cp, lstat, open, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Arch, DIR_TARGET, Platform, build } from 'electron-builder'
import { stopChildProcess } from './process-cleanup.mjs'
import { LAUNCHER_CSP, LAUNCHER_SESSION_PARTITION } from '../src/launcher-security.ts'
import { canonicalPath, pathContained } from './path-identity.mjs'

export { canonicalPath, pathContained }

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

/** Parse only absolute Windows paths emitted by `where.exe`; this is pure so it can be regression-tested off-host. */
export function parseWindowsGitPaths(output) {
  return Object.freeze([...new Set(String(output ?? '').split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => win32.isAbsolute(line)))])
}

export function selectWindowsGitPath({ whereOutput = '', fallbackPaths = [], isFile = candidate => {
  try { return statSync(candidate).isFile() } catch { return false }
} } = {}) {
  const candidates = [
    ...parseWindowsGitPaths(whereOutput),
    ...(Array.isArray(fallbackPaths) ? fallbackPaths : []),
  ]
  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : ''
    if (!win32.isAbsolute(normalized)) continue
    try {
      if (isFile(normalized)) return normalized
    } catch {
      // An unreadable candidate is not trusted.
    }
  }
  return undefined
}

function githubGitToolPaths(environment) {
  const roots = [environment.ProgramW6432, environment.ProgramFiles, environment['ProgramFiles(x86)']]
    .filter(rootPath => typeof rootPath === 'string' && win32.isAbsolute(rootPath))
  const localAppData = environment.LOCALAPPDATA
  if (typeof localAppData === 'string' && win32.isAbsolute(localAppData)) roots.push(win32.join(localAppData, 'Programs'))
  return roots.flatMap(rootPath => [
    win32.join(rootPath, 'Git', 'cmd', 'git.exe'),
    win32.join(rootPath, 'Git', 'bin', 'git.exe'),
  ])
}

function resolveWindowsGitExecutable(environment = process.env) {
  const configuredRoot = typeof environment.SystemRoot === 'string' ? environment.SystemRoot.trim() : ''
  const systemRoot = win32.isAbsolute(configuredRoot) ? configuredRoot : 'C:\\Windows'
  const where = win32.join(systemRoot, 'System32', 'where.exe')
  const result = spawnSync(where, ['git'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...environment },
    windowsHide: true,
  })
  const selected = selectWindowsGitPath({
    whereOutput: result.error === undefined ? result.stdout : '',
    fallbackPaths: githubGitToolPaths(environment),
  })
  if (selected === undefined) throw new Error('Windows packaged smoke could not resolve a validated git executable')
  return selected
}

const trustedWindowsGitPath = process.platform === 'win32' ? resolveWindowsGitExecutable() : undefined
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

const smokeOverrideKeys = Object.freeze([
  'TOCKTEAM_RESOURCES_ROOT',
  'TOCKTEAM_WEB_ROOT',
  'TOCKTEAM_SOURCE_ROOT',
  'TOCKTEAM_SURFACES',
  'TOCKTEAM_MARKETPLACE_CATALOG',
  'TOCKTEAM_MARKETPLACE_AGENT_URL',
  'TOCKTEAM_MARKETPLACE_AGENT_TOKEN',
  'TOCKTEAM_DESKTOP_APP',
  'TOCKTEAM_TUI_ROOT',
  'TOCKTEAM_TUI_HOME',
  'TOCKTEAM_WEB_HOME',
  'TOCKTEAM_WEB_HOST',
  'TOCKTEAM_WEB_PORT',
  'TOCKTEAM_WEB_OPEN',
  'TOCKTEAM_TUI_CWD',
  'TOCKTEAM_TUI_SESSION_ID',
  'DSH_SOURCE',
  'DSH_HOME',
  'DSH_DESKTOP_GH_PATH',
  'DSH_DESKTOP_SIGN_IDENTITY',
  'DSH_DESKTOP_APP_DATA',
  'DSH_DESKTOP_PROFILE',
  'DSH_DESKTOP_VERSION',
  'DSH_DESKTOP_NODE_VERSION',
  'DSH_DESKTOP_NODE_PLATFORM',
  'DSH_DESKTOP_NODE_ARCH',
  'NODE_OPTIONS',
  'NODE_PATH',
])
const disposableEnvironmentKeys = Object.freeze(['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_DATA_DIRS', 'XDG_STATE_HOME', 'TMPDIR', 'TEMP', 'TMP', 'PATH'])

export function trustedPathEntries({
  platform = process.platform,
  nodeDirectory = dirname(resolve(process.execPath)),
  repositoryRoot = root,
  systemRoot = process.env.SystemRoot ?? 'C:\\Windows',
  gitExecutable = trustedWindowsGitPath,
} = {}) {
  const pathJoin = platform === 'win32' ? win32.join : join
  const localBin = pathJoin(repositoryRoot, 'node_modules', '.bin')
  if (platform === 'win32') {
    const gitDirectory = gitExecutable === undefined ? [] : [win32.dirname(gitExecutable)]
    return Object.freeze([...new Set([
      nodeDirectory,
      localBin,
      ...gitDirectory,
      win32.join(systemRoot, 'System32'),
      systemRoot,
      win32.join(systemRoot, 'System32', 'Wbem'),
      win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
    ])])
  }
  return Object.freeze([...new Set([nodeDirectory, localBin, '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])])
}

function trustedPath() {
  return trustedPathEntries().join(process.platform === 'win32' ? ';' : ':')
}

function disposableEnvironmentPaths(disposableRoot) {
  const rootPath = resolve(disposableRoot)
  return Object.freeze({
    HOME: join(rootPath, 'home'),
    USERPROFILE: join(rootPath, 'home'),
    APPDATA: join(rootPath, 'appdata', 'roaming'),
    LOCALAPPDATA: join(rootPath, 'appdata', 'local'),
    XDG_CONFIG_HOME: join(rootPath, 'xdg', 'config'),
    XDG_CACHE_HOME: join(rootPath, 'xdg', 'cache'),
    XDG_DATA_HOME: join(rootPath, 'xdg', 'data'),
    XDG_STATE_HOME: join(rootPath, 'xdg', 'state'),
    XDG_DATA_DIRS: join(rootPath, 'xdg', 'data-dirs'),
    TMPDIR: join(rootPath, 'tmp'),
    TEMP: join(rootPath, 'tmp'),
    TMP: join(rootPath, 'tmp'),
  })
}

export async function prepareSmokeEnvironmentRoots(disposableRoot) {
  const paths = disposableEnvironmentPaths(disposableRoot)
  const roots = Object.freeze([...new Set(Object.values(paths))])
  await Promise.all(roots.map(path => mkdir(path, { recursive: true })))
  return roots
}

export function smokeEnvironment(overrides = {}, disposableRoot = undefined) {
  const environment = { ...process.env, ...overrides }
  for (const key of smokeOverrideKeys) delete environment[key]
  delete environment.ELECTRON_RUN_AS_NODE
  if (disposableRoot !== undefined) {
    Object.assign(environment, disposableEnvironmentPaths(disposableRoot))
    environment.PATH = trustedPath()
  }
  return environment
}

export async function withSmokeEnvironment(operation, disposableRoot = undefined) {
  const keys = disposableRoot === undefined ? smokeOverrideKeys : [...smokeOverrideKeys, ...disposableEnvironmentKeys]
  const previous = new Map(keys.map(key => [key, process.env[key]]))
  const bounded = disposableRoot === undefined ? undefined : smokeEnvironment({}, disposableRoot)
  if (disposableRoot !== undefined) await prepareSmokeEnvironmentRoots(disposableRoot)
  for (const key of smokeOverrideKeys) delete process.env[key]
  if (bounded !== undefined) {
    for (const key of disposableEnvironmentKeys) {
      const value = bounded[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  try {
    return await operation()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}

export async function freePort() {
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

export async function waitFor(fetcher, predicate, timeout = smokeTimeoutMs) {
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
  throw new Error(`Timed out waiting for packaged TockTeam state: ${diagnosticText(last)}`)
}

const PACKAGED_DIAGNOSTICS_MAX_BYTES = 16_000
const DIAGNOSTIC_ERROR_MAX_DEPTH = 8
const DIAGNOSTIC_ERROR_MAX_NODES = 64
const DIAGNOSTIC_ERROR_MESSAGE_MAX_BYTES = 512
const DIAGNOSTIC_ROOT_MESSAGE_MAX_BYTES = 8_000
const DIAGNOSTIC_ERROR_STACK_MAX_BYTES = 4_000

function diagnosticValue(value, limit = DIAGNOSTIC_ERROR_MESSAGE_MAX_BYTES) {
  if (typeof value === 'string') return value.slice(0, limit)
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value).slice(0, limit)
  try {
    const encoded = JSON.stringify(value)
    if (encoded !== undefined) return encoded.slice(0, limit)
  } catch { /* use the bounded type label below */ }
  try { return Object.prototype.toString.call(value).slice(0, limit) } catch { return '[unavailable]' }
}

export function formatDiagnosticError(value) {
  const seen = new WeakSet()
  const chunks = []
  let length = 0
  let nodeCount = 0
  const append = text => {
    if (length >= PACKAGED_DIAGNOSTICS_MAX_BYTES) return
    const remaining = PACKAGED_DIAGNOSTICS_MAX_BYTES - length
    const chunk = String(text).slice(0, remaining)
    chunks.push(chunk)
    length += chunk.length
  }
  const visit = (current, label, depth) => {
    if (depth > DIAGNOSTIC_ERROR_MAX_DEPTH) {
      append(`${label}: [diagnostic depth limit reached]\n`)
      return
    }
    if (nodeCount >= DIAGNOSTIC_ERROR_MAX_NODES) {
      append(`${label}: [diagnostic node limit reached]\n`)
      return
    }
    nodeCount += 1
    if (current !== null && (typeof current === 'object' || typeof current === 'function')) {
      if (seen.has(current)) {
        append(`${label}: [diagnostic cycle]\n`)
        return
      }
      seen.add(current)
    }
    const isError = current instanceof Error
    const name = isError ? diagnosticValue(current.name || 'Error') : 'non-error'
    const messageLimit = isError && depth === 0
      ? DIAGNOSTIC_ROOT_MESSAGE_MAX_BYTES
      : depth === 0 ? PACKAGED_DIAGNOSTICS_MAX_BYTES : DIAGNOSTIC_ERROR_MESSAGE_MAX_BYTES
    const rawMessage = isError ? String(current.message ?? '') : diagnosticValue(current, messageLimit)
    const message = rawMessage.length > messageLimit ? `[truncated to tail]\n${rawMessage.slice(-messageLimit)}` : rawMessage
    append(`${label}: ${name}: ${message}\n`)
    if (isError && depth === 0) {
      const stack = diagnosticValue(current.stack, DIAGNOSTIC_ERROR_STACK_MAX_BYTES)
      if (stack !== 'undefined' && stack !== '') append(`${label}.stack:\n${stack}\n`)
    }
    if (current instanceof AggregateError) {
      const errors = Array.isArray(current.errors) ? current.errors : []
      for (const [index, error] of errors.entries()) {
        if (nodeCount >= DIAGNOSTIC_ERROR_MAX_NODES) {
          append(`${label}.errors: [diagnostic node limit reached]\n`)
          break
        }
        visit(error, `${label}.errors[${String(index)}]`, depth + 1)
      }
    }
    if (isError && 'cause' in current) visit(current.cause, `${label}.cause`, depth + 1)
  }
  visit(value, 'error', 0)
  return chunks.join('')
}

function diagnosticText(value) {
  if (value instanceof Error) return formatDiagnosticError(value)
  return diagnosticValue(value, PACKAGED_DIAGNOSTICS_MAX_BYTES)
}

function diagnosticTail(value) {
  const text = String(value ?? '')
  return text === '' ? '(empty)' : text.slice(-PACKAGED_DIAGNOSTICS_MAX_BYTES)
}

async function readDiagnosticFile(path, normalizeNul = false) {
  try {
    const value = await readFile(path, 'utf8')
    return diagnosticTail(normalizeNul ? value.replaceAll('\0', '\n') : value)
  } catch (error) {
    return `[unavailable: ${error?.code ?? diagnosticText(error)}]`
  }
}

function processIsAlive(child, pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || child?.exitCode !== null || child?.signalCode !== null) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

export async function collectPackagedProcessDiagnostics({ child, command, args = [], userData, stdout = '', stderr = '' } = {}) {
  const pid = Number.isSafeInteger(child?.pid) && child.pid > 0 ? child.pid : null
  const lines = [
    `[packaged process] command=${String(command ?? '')} args=${JSON.stringify(Array.isArray(args) ? args.map(value => String(value)) : [])}`,
    `[packaged process] pid=${String(pid)} alive=${String(processIsAlive(child, pid))} exitCode=${String(child?.exitCode ?? null)} signal=${String(child?.signalCode ?? null)}`,
    `[packaged stdout tail]\n${diagnosticTail(stdout)}`,
    `[packaged stderr tail]\n${diagnosticTail(stderr)}`,
  ]
  if (process.platform === 'linux' && pid !== null) {
    const procRoot = `/proc/${String(pid)}`
    const procStatus = await readDiagnosticFile(`${procRoot}/status`)
    const coreDumping = procStatus.split('\n').find(line => line.startsWith('CoreDumping:')) ?? 'CoreDumping: unavailable'
    lines.push(`[packaged /proc cmdline] ${procRoot}/cmdline\n${await readDiagnosticFile(`${procRoot}/cmdline`, true)}`)
    lines.push(`[packaged /proc CoreDumping] ${coreDumping}`)
    lines.push(`[packaged /proc status] ${procRoot}/status\n${procStatus}`)
    lines.push(`[packaged /proc wchan] ${procRoot}/wchan\n${await readDiagnosticFile(`${procRoot}/wchan`)}`)
  }
  if (typeof userData === 'string' && userData !== '') {
    const desktopLog = join(userData, 'logs', 'desktop.log')
    lines.push(`[packaged desktop.log tail] ${desktopLog}\n${await readDiagnosticFile(desktopLog)}`)
  }
  return lines.join('\n')
}

export function formatPackagedProcessFailure({ command, args = [], code = null, signal = null, error = undefined, stdout = '', stderr = '', lastFetchError = undefined }) {
  const processState = error === undefined ? `exit code=${String(code)}, signal=${String(signal)}` : `spawn error=${diagnosticText(error)}`
  return new Error([
    `Packaged TockTeam process failed: ${[command, ...args].join(' ')} (${processState})`,
    `Last CDP fetch: ${diagnosticText(lastFetchError)}`,
    `stdout (tail):\n${String(stdout).slice(-16_000)}`,
    `stderr (tail):\n${String(stderr).slice(-16_000)}`,
  ].join('\n'))
}

export async function waitForPackagedState(fetcher, predicate, child, { command, args = [], timeout = smokeTimeoutMs, output = () => ({}), diagnostics = undefined } = {}) {
  const lastFetchError = { value: undefined }
  let finished = false
  let onError
  let onExit
  const processFailure = new Promise((_, reject) => {
    const fail = details => {
      const captured = output() ?? {}
      reject(formatPackagedProcessFailure({
        command,
        args,
        ...details,
        stdout: captured.stdout,
        stderr: captured.stderr,
        lastFetchError: lastFetchError.value,
      }))
    }
    onError = error => fail({ error })
    onExit = (code, signal) => fail({ code, signal })
    child.once('error', onError)
    child.once('exit', onExit)
    if (child.exitCode !== null || child.signalCode !== null) queueMicrotask(() => onExit(child.exitCode, child.signalCode))
  })
  const polling = (async () => {
    const deadline = Date.now() + timeout
    while (!finished && Date.now() < deadline) {
      try {
        const value = await fetcher()
        if (predicate(value)) return value
      } catch (error) {
        lastFetchError.value = error
      }
      await sleep(250)
    }
    if (finished) return undefined
    const timeoutError = `Timed out waiting for packaged TockTeam state. Last CDP fetch: ${diagnosticText(lastFetchError.value)}`
    if (typeof diagnostics !== 'function') throw new Error(timeoutError)
    let processDiagnostics
    try {
      processDiagnostics = await diagnostics()
    } catch (error) {
      processDiagnostics = `[packaged diagnostics unavailable: ${diagnosticText(error)}]`
    }
    throw new Error(`${timeoutError}\n${processDiagnostics}`)
  })()
  try {
    return await Promise.race([polling, processFailure])
  } finally {
    finished = true
    child.removeListener('error', onError)
    child.removeListener('exit', onExit)
  }
}

async function listPages(port) {
  const url = `http://127.0.0.1:${String(port)}/json/list`
  let response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new Error(`CDP page listing fetch failed for ${url}: ${diagnosticText(error)}`, { cause: error })
  }
  if (!response.ok) throw new Error(`Packaged DevTools page listing failed: ${response.status} (${url})`)
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
  const { disposableRoot, ...spawnOptions } = options
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...spawnOptions,
    env: smokeEnvironment(spawnOptions.env ?? {}, disposableRoot),
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${String(result.status)}`)
}

function runPnpm(args, options = {}) {
  // Invoke the pinned JS CLI through Node on every host. In particular, do not
  // route a temporary path through cmd.exe on Windows.
  const cli = join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  run(process.execPath, [cli, ...args], options)
}

export const PACKAGED_PREPARATION_PLAN = Object.freeze([
  Object.freeze({ name: 'root-build', args: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: 'dsh-build', args: Object.freeze(['run', 'build:dsh']) }),
  Object.freeze({ name: 'tocktutor-install', args: Object.freeze(['-C', 'plugins/tocktutor', 'install', '--frozen-lockfile']) }),
  Object.freeze({ name: 'tocktutor-build', args: Object.freeze(['run', 'build:tocktutor']) }),
  Object.freeze({ name: 'runtime-stage', args: Object.freeze(['run', 'stage:dsh']) }),
])

export function currentTarget() {
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

export function packagedBuilderConfig(outputDir, target, appDir) {
  const buildConfig = structuredClone(packageJson.build ?? {})
  const platformConfig = buildConfig[target.key] ?? {}
  const builderExtraResources = buildConfig.extraResources ?? []
  const extraResources = builderExtraResources.map(resource => ({
    ...resource,
    from: resolve(root, resource.from),
  }))
  return {
    ...buildConfig,
    asar: true,
    directories: { ...buildConfig.directories, app: appDir, output: outputDir },
    extraResources,
    [target.key]: {
      ...platformConfig,
      ...(platformConfig.icon === undefined ? {} : { icon: resolve(root, platformConfig.icon) }),
      target: ['dir'],
      ...(target.key === 'mac' ? { identity: null } : {}),
    },
    ...(buildConfig.afterPack === undefined ? {} : { afterPack: resolve(root, buildConfig.afterPack) }),
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
  }
}

export async function createPackageInput(appDir) {
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
  runPnpm(['--filter', '.', 'deploy', '--prod', '--legacy', appDir], { cwd: deploySource, disposableRoot: dirname(appDir) })
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
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const result = await findAsar(path, depth + 1)
      if (result !== undefined) return result
    }
  }
  return undefined
}

export async function findPackagedExecutable(outputDir, target) {
  if (target.key === 'mac') {
    const appRoot = await findDirectory(outputDir, entry => entry.name.endsWith('.app'))
    if (appRoot === undefined) throw new Error(`Packaged macOS app was not found below ${outputDir}`)
    const binaries = await readdir(join(appRoot, 'Contents', 'MacOS'), { withFileTypes: true })
    const binary = binaries.find(entry => entry.isFile())
    if (binary === undefined) throw new Error('Packaged macOS executable was not found')
    return join(appRoot, 'Contents', 'MacOS', binary.name)
  }
  const executableNames = target.key === 'win'
    ? [`${contract.identity.executableName}.exe`, `${packageJson.productName}.exe`]
    : [contract.identity.executableName]
  const executable = await findFile(outputDir, entry => executableNames.some(name => entry.name.toLowerCase() === name.toLowerCase()))
  if (executable === undefined) throw new Error(`Packaged executable ${executableNames.join(' or ')} was not found below ${outputDir}`)
  return executable
}

async function findDirectory(rootPath, predicate, depth = 0) {
  if (depth > 8) return undefined
  let entries
  try { entries = await readdir(rootPath, { withFileTypes: true }) } catch { return undefined }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
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
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
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
    if (current !== null && typeof current === 'object' && current.files !== undefined && !(part in current)) current = current.files
    if (current === null || typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

async function readAsarBuffer(asarPath, asar, path) {
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
    return content
  } finally {
    await handle.close()
  }
}

async function readAsarText(asarPath, asar, path) {
  return (await readAsarBuffer(asarPath, asar, path)).toString('utf8')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assertNoticeRows(asarText) {
  for (const notice of contract.foundation.launcherNotices) {
    assert.ok(asarText.includes(notice.license), `ASAR notice is missing ${notice.id} license`)
    assert.ok(asarText.includes(notice.attribution), `ASAR notice is missing ${notice.id} attribution`)
  }
}

async function assertArchiveInventory(files, asar, asarText, asarPath) {
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
  assertNoticeRows(asarText)
  for (const asset of contract.foundation.launcherAssets) {
    const content = await readAsarBuffer(asarPath, asar, asset.path)
    assert.equal(sha256(content), asset.sha256, `ASAR launcher asset hash drifted: ${asset.path}`)
  }
  assert.doesNotMatch(files.join('\n'), /vendor[/\\]ueli/iu, 'ASAR contains vendor/ueli source')
  assert.doesNotMatch(asarText, /vendor[/\\]ueli/iu, 'ASAR metadata contains vendor/ueli source')
  return Object.freeze({
    assetCount: launcherAssets.length,
    asarPath,
    fileCount: files.length,
    assetsVerified: true,
    noticesVerified: true,
    launcherSourceScan: Object.freeze({ scope: 'exact-asar-files', forbiddenSourceFound: false }),
  })
}

export async function inspectExtraResources(asarPath) {
  const resourcesRoot = dirname(asarPath)
  const resourcePaths = []
  for (const resource of packageJson.build?.extraResources ?? []) {
    assert.equal(typeof resource.from, 'string')
    assert.doesNotMatch(resource.from, /vendor[/\\]ueli/iu, 'extra-resource source references vendor/ueli')
    const destination = typeof resource.to === 'string' ? resource.to : resource.from
    assert.doesNotMatch(destination, /vendor[/\\]ueli/iu, 'extra-resource destination references vendor/ueli')
    if (resource.from === '.stage') {
      for (const rootName of ['dsh-runtime', 'node-runtime']) resourcePaths.push(join(destination === '.' ? '' : destination, rootName))
    } else if (resource.from === 'bin') {
      for (const file of resource.filter ?? []) resourcePaths.push(join(destination, file))
    } else resourcePaths.push(destination)
  }
  for (const relativePath of resourcePaths) {
    const absolutePath = join(resourcesRoot, relativePath)
    const metadata = await lstat(absolutePath)
    assert.equal(metadata.isSymbolicLink(), false, `extra resource is a symlink: ${relativePath}`)
    assert.equal(metadata.isFile() || metadata.isDirectory(), true, `extra resource is missing: ${relativePath}`)
  }
  // The resource contract names the roots above. Check only a bounded path
  // prefix for a forbidden source segment; do not recursively hash or traverse
  // the generated DSH dependency graph.
  let checkedEntries = 0
  const visit = async (rootPath, relative = '', depth = 0) => {
    if (depth > 2 || checkedEntries >= 4_096) return
    let entries
    try { entries = await readdir(rootPath, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (checkedEntries >= 4_096) return
      checkedEntries += 1
      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`
      assert.doesNotMatch(childRelative, /vendor[/\\]ueli(?:[/\\]|$)/iu, 'extra resources contain vendor/ueli source')
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(join(rootPath, entry.name), childRelative, depth + 1)
    }
  }
  await visit(resourcesRoot)
  return Object.freeze({
    checkedEntries,
    roots: Object.freeze(resourcePaths),
    vendorScan: Object.freeze({ scope: 'bounded-no-follow', maxDepth: 2, maxEntries: 4_096, checkedEntries, forbiddenSourceFound: false }),
  })
}

export async function inspectPackage(outputDir, target, options = {}) {
  const executable = options.executable ?? await findPackagedExecutable(outputDir, target)
  assert.equal((await stat(executable)).isFile(), true)
  assert.equal(await pathContained(outputDir, executable), true, 'packaged executable escaped the selected artifact root')
  const asarPath = await findAsar(outputDir)
  assert.ok(asarPath, 'packaged app.asar was not found')
  assert.equal(await pathContained(outputDir, asarPath), true, 'packaged app.asar escaped the selected artifact root')
  const canonicalAsarPath = await canonicalPath(asarPath)
  assert.ok(canonicalAsarPath !== undefined, 'packaged app.asar could not be canonicalized')
  const asar = await readAsarHeader(asarPath)
  const files = listAsarFiles(asar.header).sort()
  const packageText = await readAsarText(asarPath, asar, 'package.json')
  const packedManifest = JSON.parse(packageText)
  assert.equal(packedManifest.name, contract.identity.packageName)
  assert.equal(packedManifest.productName, contract.identity.productName)
  assert.equal(packedManifest.desktopName, contract.identity.desktopName)
  assert.equal(packedManifest.version, packageJson.version, 'packed application version drifted')
  assert.equal(packageJson.build?.appId, contract.identity.appId)
  assert.equal(packageJson.build?.productName, contract.identity.productName)
  assert.equal(packageJson.build?.asar, true)
  assert.equal(packageJson.build?.linux?.executableName, contract.identity.executableName)
  assert.equal(packedManifest.build, undefined)
  const noticeText = await readAsarText(asarPath, asar, 'THIRD_PARTY_NOTICES.md')
  const archiveInventory = await assertArchiveInventory(files, asar, noticeText, asarPath)
  const extraResources = await inspectExtraResources(asarPath)
  if (target.key === 'mac') {
    const appRoot = asarPath.slice(0, asarPath.indexOf('.app/') + 4)
    const infoPlist = await readFile(join(appRoot, 'Contents', 'Info.plist'), 'utf8')
    assert.match(infoPlist, new RegExp(contract.identity.appId.replaceAll('.', '\\.'), 'u'))
    assert.match(infoPlist, new RegExp(contract.identity.productName.replaceAll(' ', '\\s+'), 'u'))
  }
  const bundledNode = join(dirname(asarPath), 'node-runtime', process.platform === 'win32' ? 'node.exe' : join('bin', 'node'))
  const nodeVersion = spawnSync(bundledNode, ['--version'], { encoding: 'utf8' })
  assert.equal(nodeVersion.status, 0, `bundled Node runtime must execute for ${process.platform}-${process.arch}`)
  assert.match(nodeVersion.stdout.trim(), /^v(?:2[4-9]|[3-9][0-9])\./u, 'staged Node runtime does not satisfy Node >=24')
  return Object.freeze({
    appId: contract.identity.appId,
    appPath: canonicalAsarPath,
    version: packedManifest.version,
    appPathUsesAsar: true,
    assetCount: files.filter(file => file.startsWith('dist/launcher-assets/')).length,
    executable,
    electron: { architecture: process.arch, version: electronPackage.version },
    node: { architecture: process.arch, version: nodeVersion.stdout.trim() },
    productName: contract.identity.productName,
    assetsVerified: archiveInventory.assetsVerified,
    noticesVerified: archiveInventory.noticesVerified,
    vendorScan: Object.freeze({
      ...extraResources.vendorScan,
      launcherSourceAbsent: archiveInventory.launcherSourceScan.forbiddenSourceFound === false,
    }),
    extraResources,
  })
}

const disableLinuxCoreDumpScript = `import ctypes, os, sys
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(4, 0, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), 'prctl(PR_SET_DUMPABLE) failed')
os.execv(sys.argv[1], sys.argv[1:])`

export function linuxNoCoreSpawnPlan(command, args, platform = process.platform) {
  if (platform !== 'linux') return Object.freeze({ command, args: [...args] })
  return Object.freeze({ command: '/usr/bin/python3', args: ['-c', disableLinuxCoreDumpScript, command, ...args] })
}

export async function launchPackaged(executable, userData, port, extraArgs = [], launchOptions = {}) {
  const childFlag = launchOptions.flag ?? smokeFlag
  const childEnvironment = launchOptions.env ?? { TOCKTEAM_PACKAGED_SMOKE: '1' }
  await prepareSmokeEnvironmentRoots(userData)
  const childArgs = [
    ...extraArgs,
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${String(port)}`,
    `--user-data-dir=${userData}`,
    childFlag,
    '--toggle',
  ]
  const spawnPlan = launchOptions.preventCoreDump === true
    ? linuxNoCoreSpawnPlan(executable, childArgs)
    : { command: executable, args: childArgs }
  const child = spawnProcess(spawnPlan.command, spawnPlan.args, {
    cwd: root,
    detached: true,
    env: smokeEnvironment(childEnvironment, userData),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  const debug = process.env.TOCKTEAM_VERBOSE_PACKAGED_SMOKE === '1'
  child.stdout?.on('data', chunk => {
    const value = String(chunk)
    stdout = `${stdout}${value}`.slice(-16_000)
    if (debug) process.stderr.write(`[packaged-app stdout] ${value}`)
  })
  child.stderr?.on('data', chunk => {
    const value = String(chunk)
    stderr = `${stderr}${value}`.slice(-16_000)
    if (debug) process.stderr.write(`[packaged-app stderr] ${value}`)
  })
  try {
    const debug = process.env.TOCKTEAM_VERBOSE_PACKAGED_SMOKE === '1'
    const step = async (name, operation) => {
      if (debug) console.error(`[packaged-smoke] ${name}`)
      return await operation()
    }
    const workbenchPages = await step('wait for TockCoder', () => waitForPackagedState(
      () => listPages(port),
      pages => selectCdpDescriptor(pages, 'TockCoder', port) !== undefined,
      child,
      {
        command: executable,
        args: childArgs,
        output: () => ({ stdout, stderr }),
        diagnostics: () => collectPackagedProcessDiagnostics({ child, command: executable, args: childArgs, userData, stdout, stderr }),
      },
    ))
    assertCdpProcess(child, port)
    const workbenchDescriptor = selectCdpDescriptor(workbenchPages, 'TockCoder', port)
    assert.ok(workbenchDescriptor?.webSocketDebuggerUrl, 'TockCoder CDP page is missing its loopback debugger endpoint')
    const workbench = await step('connect to TockCoder', () => CdpPage.connect(workbenchDescriptor.webSocketDebuggerUrl))
    await step('clear startup dialogs', () => clearStartupDialogs(workbench))
    await step('wait for runtime ready', () => waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.getRuntimeSnapshot())?.status)()'), status => status === 'ready', 120_000))
    await step('mark and show launcher', () => workbench.evaluate(`(async () => { window.__tockteamPackagedSmoke = { href: location.href, marker: 'workbench-alive' }; return await window.dshDesktop?.launcher?.show() })()`))
    const launcherPages = await step('wait for TockLauncher', () => waitFor(() => listPages(port), pages => selectCdpDescriptor(pages, 'TockLauncher', port) !== undefined))
    const launcherDescriptor = selectCdpDescriptor(launcherPages, 'TockLauncher', port)
    assert.ok(launcherDescriptor?.webSocketDebuggerUrl, 'TockLauncher CDP page is missing its loopback debugger endpoint')
    const launcher = await step('connect to TockLauncher', () => CdpPage.connect(launcherDescriptor.webSocketDebuggerUrl))
    await step('wait for launcher ready', () => waitFor(() => launcher.evaluate('document.documentElement.dataset.launcherReady'), ready => ready === 'true'))
    await step('wait for launcher visible', () => waitFor(() => workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.getState())?.visible)()'), visible => visible === true))
    return Object.freeze({
      child,
      diagnostics: () => collectPackagedProcessDiagnostics({ child, command: executable, args: childArgs, userData, stdout, stderr }),
      launcher,
      workbench,
      output: () => `${stdout}\n${stderr}`,
    })
  } catch (error) {
    // Capture process state and logs before termination; early Electron failures can leave no desktop log.
    let processDiagnostics
    try {
      processDiagnostics = await collectPackagedProcessDiagnostics({ child, command: executable, args: childArgs, userData, stdout, stderr })
    } catch (diagnosticsError) {
      processDiagnostics = `[packaged diagnostics unavailable: ${diagnosticText(diagnosticsError)}]`
    }
    const failure = new Error(`${error instanceof Error ? error.message : String(error)}\n${processDiagnostics}`)
    try {
      await stopPackagedChild(child)
    } catch (cleanupError) {
      throw new AggregateError([failure, cleanupError], 'packaged smoke failed and cleanup failed')
    }
    throw failure
  }
}

export function selectCdpDescriptor(pages, title, port) {
  const expectedPrefix = `ws://127.0.0.1:${String(port)}/devtools/`
  return pages.find(page => page?.title === title
    && typeof page.webSocketDebuggerUrl === 'string'
    && page.webSocketDebuggerUrl.startsWith(expectedPrefix))
}

function trustedWindowsTool(name) {
  const systemRoot = process.env.SystemRoot?.trim()
  assert.ok(typeof systemRoot === 'string' && isAbsolute(systemRoot), 'Windows SystemRoot must be an absolute path')
  return join(systemRoot, 'System32', name)
}

export function windowsCdpListenerOwned(output, pid, port) {
  return String(output).split(/\r?\n/u).some(line => {
    const fields = line.trim().split(/\s+/u)
    return fields[0] === 'TCP' && fields[1] === `127.0.0.1:${String(port)}` && fields[3] === 'LISTENING' && fields[4] === String(pid)
  })
}

function assertCdpProcess(child, port) {
  if (!Number.isSafeInteger(child.pid)) throw new Error('packaged smoke process has no observable PID')
  if (process.platform === 'win32') {
    const result = spawnSync(trustedWindowsTool('netstat.exe'), ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, 'Windows netstat could not inspect the packaged smoke listener')
    const listener = windowsCdpListenerOwned(result.stdout, child.pid, port)
    assert.equal(listener, true, 'packaged smoke CDP listener is not owned by the launched Windows process')
    return
  }
  const ps = process.platform === 'darwin' ? '/bin/ps' : '/usr/bin/ps'
  const result = spawnSync(ps, ['-p', String(child.pid), '-o', 'command='], { encoding: 'utf8' })
  assert.equal(result.status, 0, 'packaged smoke process is no longer observable')
  assert.match(result.stdout, /--remote-debugging-address=127\.0\.0\.1[ =]/u, 'packaged smoke did not bind CDP to loopback')
  assert.match(result.stdout, new RegExp(`--remote-debugging-port=${String(port)}(?:\\s|$)`), 'packaged smoke CDP port is not owned by the launched process')
}

export async function stopPackagedChild(child) {
  await stopChildProcess(child)
}

export async function runRendererSmoke(workbench, launcher, inventory, userData, expectedInstallRoot = undefined) {
  const securityEvidence = await waitFor(
    () => readFile(join(userData, 'launcher', 'packaged-smoke-security.json'), 'utf8').then(value => JSON.parse(value)).catch(() => null),
    value => value?.sessionMatches === true && value?.launcherSessionPartition === LAUNCHER_SESSION_PARTITION,
  )
  assert.equal(securityEvidence.appPathUsesAsar, true)
  const [securityAppPath, inventoryAppPath] = await Promise.all([canonicalPath(securityEvidence.appPath), canonicalPath(inventory.appPath)])
  assert.ok(securityAppPath !== undefined && inventoryAppPath !== undefined, 'security and inventory app.asar paths must be canonicalizable')
  assert.equal(securityAppPath, inventoryAppPath, 'security evidence must identify the inspected installed app.asar')
  const canonicalSecurityEvidence = Object.freeze({ ...securityEvidence, appPath: inventoryAppPath })
  if (expectedInstallRoot !== undefined) assert.equal(await pathContained(expectedInstallRoot, inventory.appPath), true, 'installed app.asar escaped the selected install root')
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
  try {
    await workbench.evaluate(`(async () => await window.dshDesktop?.launcher?.settings?.updateSetting('extensions.enabledExtensionIds', ${JSON.stringify(enabled)}))()`)
  } catch (error) {
    const actual = await workbench.evaluate('(async () => (await window.dshDesktop?.launcher?.settings?.getSnapshot())?.values?.["extensions.enabledExtensionIds"] ?? null)()').catch(() => 'unavailable')
    const providerStatuses = await launcher.evaluate('(async () => (await window.tockteamLauncher?.getSurfaceSettings())?.providerStatuses?.map(({ extensionId, state }) => ({ extensionId, state })) ?? null)()').catch(() => 'unavailable')
    throw new Error(`TockLauncher enabled-extension update failed: requested=${JSON.stringify(enabled)} actual=${JSON.stringify(actual)} providerStatuses=${JSON.stringify(providerStatuses)}`, { cause: error })
  }
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
    security: canonicalSecurityEvidence,
    search: searchResult,
    settingsRoundTrip: { restored: originalFuzziness, changed: roundTripValue },
    workbench: survivingWorkbench,
  })
}

export async function preparePackagedArtifact({ target = currentTarget(), smokeRoot = undefined } = {}) {
  const ownsRoot = smokeRoot === undefined
  const rootPath = smokeRoot ?? await mkdtemp(join(tmpdir(), 'tockteam-launcher-packaged-'))
  const appDir = join(rootPath, 'app-input')
  const outputDir = join(rootPath, 'package')
  try {
    for (const step of PACKAGED_PREPARATION_PLAN) {
      runPnpm(step.args, { disposableRoot: rootPath })
    }
    run(process.execPath, [join(root, 'scripts/ueli/check-package-feasibility.mjs')], { disposableRoot: rootPath })
    await createPackageInput(appDir)
    await mkdir(outputDir, { recursive: true })
    await withSmokeEnvironment(async () => await build({
      projectDir: appDir,
      targets: target.builder.createTarget(DIR_TARGET, target.architecture),
      config: { ...packagedBuilderConfig(outputDir, target, appDir), electronVersion: electronPackage.version },
    }), rootPath)
    const inventory = await inspectPackage(outputDir, target)
    return Object.freeze({ appDir, inventory, outputDir, rootPath, target, userData: join(rootPath, 'user-data') })
  } catch (error) {
    if (ownsRoot) await rm(rootPath, { recursive: true, force: true })
    throw error
  }
}

export async function main() {
  const artifact = await preparePackagedArtifact()
  const { inventory, rootPath: smokeRoot, target, userData } = artifact
  let child
  let launcher
  let workbench
  try {
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
      vendorScan: inventory.vendorScan,
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

const isDirectInvocation = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectInvocation) {
  if (process.argv.includes(smokeFlag)) {
    await main().catch(error => {
      console.error(formatDiagnosticError(error))
      process.exit(1)
    })
  } else {
    console.error(`This package smoke requires ${smokeFlag}`)
    process.exitCode = 2
  }
}
