import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import {
  LAUNCHER_CSP,
  LAUNCHER_SESSION_PARTITION,
  applyLauncherSessionPolicy,
  createLauncherIpcGuard,
  createLauncherUrlPolicy,
  createLauncherWebPreferences,
} from '../src/launcher-security.ts'

const electronDir = resolve('/tmp/tockteam-dist')
const launcherPath = join(electronDir, 'launcher.html')
const entryUrl = pathToFileURL(launcherPath).href

function sender(overrides: Record<string, unknown> = {}) {
  const frame = { url: entryUrl }
  return {
    getURL: () => entryUrl,
    id: 41,
    mainFrame: frame,
    session: session,
    ...overrides,
  }
}

const session = {}

function event(overrides: Record<string, unknown> = {}) {
  const current = sender()
  return {
    sender: current,
    senderFrame: current.mainFrame,
    ...overrides,
  }
}

test('launcher preferences and permissions are isolated and deny all capabilities', () => {
  const preferences = createLauncherWebPreferences({
    electronDir,
    role: 'launcher',
  })
  assert.deepEqual(preferences, {
    contextIsolation: true,
    nodeIntegration: false,
    partition: LAUNCHER_SESSION_PARTITION,
    preload: join(electronDir, 'launcher-preload.cjs'),
    sandbox: true,
    webSecurity: true,
  })

  let requestHandler: ((...args: unknown[]) => void) | undefined
  let checkHandler: (() => boolean) | undefined
  applyLauncherSessionPolicy({
    setPermissionRequestHandler: handler => { requestHandler = handler },
    setPermissionCheckHandler: handler => { checkHandler = handler },
  })
  assert.equal(checkHandler?.(), false)
  for (const permission of ['notifications', 'media', 'clipboard-read', 'geolocation', 'camera', 'microphone', 'unknown']) {
    let granted: boolean | undefined
    requestHandler?.({}, permission, (value: boolean) => { granted = value })
    assert.equal(granted, false, permission)
  }
})

test('launcher URL policy accepts only the exact canonical generated file URL', () => {
  const policy = createLauncherUrlPolicy({ launcherHtmlPath: launcherPath })
  assert.equal(policy.entryUrl, entryUrl)
  assert.equal(policy.isAllowed('launcher', entryUrl), true)
  for (const blocked of [
    `${entryUrl}?query=1`,
    `${entryUrl}#fragment`,
    entryUrl.replace('file://', 'file://user:password@'),
    entryUrl.replace('launcher.html', 'other.html'),
    entryUrl.replace('file://', 'http://'),
    'data:text/html,<h1>launcher</h1>',
    'javascript:alert(1)',
    'about:blank',
  ]) {
    assert.equal(policy.isAllowed('launcher', blocked), false, blocked)
  }
})

test('launcher IPC guard rejects identity, frame, URL, role, and session drift before side effects', () => {
  const liveSender = sender()
  const liveWindow = { webContents: liveSender, isDestroyed: () => false }
  const guard = createLauncherIpcGuard({
    launcherSession: session,
    resolveWindow: candidate => candidate === liveSender ? liveWindow : null,
    roleOf: () => 'launcher',
    urlPolicy: createLauncherUrlPolicy({ launcherHtmlPath: launcherPath }),
  })

  assert.deepEqual(guard.assert({ sender: liveSender, senderFrame: liveSender.mainFrame }), { role: 'launcher', webContentsId: 41 })
  const cases = [
    event({ sender: { ...liveSender, id: 0 } }),
    event({ sender: { ...liveSender, id: 42 } }),
    event({ sender: { ...liveSender, getURL: undefined } }),
    event({ sender: { ...liveSender, session: {} } }),
    event({ senderFrame: { url: entryUrl } }),
    event({ sender: { ...liveSender, getURL: () => `${entryUrl}?query=1` } }),
    event({ sender: { ...liveSender, mainFrame: { url: entryUrl } } }),
  ]
  for (const candidate of cases) assert.throws(() => guard.assert(candidate), /Blocked launcher IPC/u)
})

test('launcher CSP is strict and contains no unsafe or network sources', () => {
  assert.equal(
    LAUNCHER_CSP,
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  )
  assert.doesNotMatch(LAUNCHER_CSP, /unsafe-|\*/u)
})
