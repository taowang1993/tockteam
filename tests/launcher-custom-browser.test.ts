import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { LauncherCustomBrowserController, parseLauncherCustomBrowserArgumentTemplate, readLauncherBoundedUtf8 } from '../src/launcher-custom-browser.ts'

async function root(): Promise<string> { return await mkdtemp(path.join(tmpdir(), 'tockteam-browser-')) }

function harness(platform: 'Linux' | 'macOS' | 'Windows', userDataPath: string, settings: Record<string, unknown> = {}, launchOverride?: (executable: string, args: readonly string[]) => Promise<void>, afterGrantMutation?: (operation: 'select' | 'revoke') => void) {
  const launches: Array<{ executable: string; args: readonly string[] }> = []
  const defaults: string[] = []
  const options = {
    ...(afterGrantMutation === undefined ? {} : { afterGrantMutation }),
    getSetting: <T>(key: string, fallback: T): T => Object.hasOwn(settings, key) ? settings[key] as T : fallback,
    launch: launchOverride ?? (async (executable: string, args: readonly string[]) => { launches.push({ executable, args }) }),
    openDefault: async (url: string) => { defaults.push(url) },
    platform,
    userDataPath,
  }
  return { defaults, launches, open: async () => await LauncherCustomBrowserController.open(options) }
}

test('custom browser accepts only inert HTTP(S) URL arguments', () => {
  assert.deepEqual(parseLauncherCustomBrowserArgumentTemplate('{{url}}', 'https://example.com/a?q=1'), ['https://example.com/a?q=1'])
  for (const template of ['--private {{url}}', '{{url}} {{url}}', '{{url}} && calc.exe']) {
    assert.throws(() => parseLauncherCustomBrowserArgumentTemplate(template, 'https://example.com'), /template/i)
  }
  assert.throws(() => parseLauncherCustomBrowserArgumentTemplate('{{url}}', 'file:///etc/passwd'), /HTTP/i)
})

test('custom-browser grants keep identity private and revoke replacement', async () => {
  const userDataPath = await root()
  try {
    const executable = path.join(userDataPath, 'browser.exe')
    await writeFile(executable, 'approved', { mode: 0o700 })
    const fixture = harness('Windows', userDataPath, { 'general.browser.useDefaultWebBrowser': false })
    const controller = await fixture.open()
    assert.deepEqual(controller.snapshot(), { platform: 'Windows', status: 'none' })
    await controller.select(executable)
    assert.deepEqual(controller.snapshot(), { platform: 'Windows', status: 'active' })
    await controller.openUrl('https://example.com/docs')
    assert.deepEqual(fixture.launches, [{ executable: await realpath(executable), args: ['https://example.com/docs'] }])

    const moved = `${executable}.old`
    await rename(executable, moved)
    await writeFile(executable, 'replacement', { mode: 0o700 })
    await assert.rejects(controller.openUrl('https://example.com'), /changed|revoked/i)
    assert.equal(controller.snapshot().status, 'revoked')
    assert.equal(fixture.launches.length, 1)
    assert.equal(await readFile(executable, 'utf8'), 'replacement')
    await controller.revoke()
    assert.equal(controller.snapshot().status, 'none')
    await controller.close()
    await assert.rejects(controller.select(executable), /disposed/u)
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('serializes custom-browser revocation behind an in-flight launch', async () => {
  const userDataPath = await root()
  try {
    const executable = path.join(userDataPath, 'browser.exe')
    await writeFile(executable, 'approved', { mode: 0o700 })
    let startedResolve: (() => void) | undefined
    let releaseResolve: (() => void) | undefined
    const started = new Promise<void>(resolve => { startedResolve = resolve })
    const release = new Promise<void>(resolve => { releaseResolve = resolve })
    const fixture = harness('Windows', userDataPath, { 'general.browser.useDefaultWebBrowser': false }, async () => {
      startedResolve?.()
      await release
    })
    const controller = await fixture.open()
    await controller.select(executable)
    const opening = controller.openUrl('https://example.com')
    await started
    const revoking = controller.revoke()
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(controller.snapshot().status, 'active')
    releaseResolve?.()
    await opening
    await revoking
    assert.equal(controller.snapshot().status, 'none')
    await controller.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('custom browser select commits disk and memory before an abort-after-write', async () => {
  const userDataPath = await root()
  try {
    const executable = path.join(userDataPath, 'browser.exe')
    await writeFile(executable, 'approved', { mode: 0o700 })
    const abort = new AbortController()
    const fixture = harness('Windows', userDataPath, { 'general.browser.useDefaultWebBrowser': false }, undefined, operation => {
      if (operation === 'select') abort.abort(new Error('owner cleared'))
    })
    const controller = await fixture.open()
    await assert.rejects(controller.select(executable, abort.signal), /owner cleared|canceled/u)
    assert.deepEqual(controller.snapshot(), { platform: 'Windows', status: 'active' })
    const restarted = await fixture.open()
    assert.deepEqual(restarted.snapshot(), { platform: 'Windows', status: 'active' })
    await restarted.openUrl('https://example.com')
    assert.equal(fixture.launches.length, 1)
    await Promise.all([controller.close(), restarted.close()])
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('custom browser revoke commits disk and memory before an abort-after-remove', async () => {
  const userDataPath = await root()
  try {
    const executable = path.join(userDataPath, 'browser.exe')
    await writeFile(executable, 'approved', { mode: 0o700 })
    const abort = new AbortController()
    let abortOperation: 'select' | 'revoke' | undefined
    const fixture = harness('Windows', userDataPath, { 'general.browser.useDefaultWebBrowser': false }, undefined, operation => {
      if (operation === abortOperation) abort.abort(new Error('owner cleared'))
    })
    const controller = await fixture.open()
    await controller.select(executable)
    abortOperation = 'revoke'
    await assert.rejects(controller.revoke(abort.signal), /owner cleared|canceled/u)
    assert.deepEqual(controller.snapshot(), { platform: 'Windows', status: 'none' })
    const restarted = await fixture.open()
    assert.deepEqual(restarted.snapshot(), { platform: 'Windows', status: 'none' })
    await assert.rejects(restarted.openUrl('https://example.com'), /No custom browser grant/u)
    await Promise.all([controller.close(), restarted.close()])
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('macOS app grants and Linux default-browser fallback remain finite', async () => {
  const macRoot = await root(); const linuxRoot = await root()
  try {
    const app = path.join(macRoot, 'Browser.app'); await mkdir(app)
    const mac = harness('macOS', macRoot, { 'general.browser.useDefaultWebBrowser': false })
    const controller = await mac.open(); await controller.select(app); await controller.openUrl('http://example.com')
    assert.deepEqual(mac.launches, [{ executable: '/usr/bin/open', args: ['-a', await realpath(app), 'http://example.com/'] }])

    const linux = harness('Linux', linuxRoot, { 'general.browser.useDefaultWebBrowser': false })
    await (await linux.open()).openUrl('https://example.com')
    assert.deepEqual(linux.defaults, ['https://example.com/'])
  } finally {
    await Promise.all([rm(macRoot, { recursive: true, force: true }), rm(linuxRoot, { recursive: true, force: true })])
  }
})

test('custom-browser tolerates unsupported Windows directory fsync only after file commit', async () => {
  const userDataPath = await root()
  try {
    const executable = path.join(userDataPath, 'browser.exe')
    await writeFile(executable, 'approved', { mode: 0o700 })
    let syncs = 0
    const controller = await LauncherCustomBrowserController.open({
      getSetting: <T>(_key: string, fallback: T): T => fallback,
      launch: async () => {},
      openDefault: async () => {},
      platform: 'Windows',
      syncDirectory: async () => { syncs += 1; const error = new Error('unsupported') as NodeJS.ErrnoException; error.code = 'ENOTSUP'; throw error },
      userDataPath,
    })
    await controller.select(executable)
    assert.ok(syncs > 0)
    await controller.revoke()
    assert.deepEqual(controller.snapshot(), { platform: 'Windows', status: 'none' })
    await controller.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('custom-browser default open timeout lets close settle after a never-settling native promise', async () => {
  const userDataPath = await root()
  try {
    const controller = await LauncherCustomBrowserController.open({
      effectTimeoutMs: 20,
      getSetting: <T>(_key: string, fallback: T): T => fallback,
      launch: async () => {},
      openDefault: async () => await new Promise<void>(() => {}),
      platform: 'Linux',
      userDataPath,
    })
    await assert.rejects(controller.openUrl('https://example.com'), /timed out|canceled/u)
    await controller.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('custom-browser bounded descriptor reads reject same-handle growth', async () => {
  let index = 0
  const handle = { read: async (buffer: Buffer) => {
    if (index++ === 0) {
      const chunk = Buffer.from('{"ok":true}')
      chunk.copy(buffer)
      return { buffer, bytesRead: chunk.length }
    }
    buffer.fill(120)
    return { buffer, bytesRead: buffer.length }
  } }
  await assert.rejects(readLauncherBoundedUtf8(handle), /size|large|bound/i)
})

test('custom-browser grant writes harden the fixed parent and never chmod the replaced target path', async () => {
  const userDataPath = await root()
  try {
    const executable = path.join(userDataPath, 'browser.exe')
    await writeFile(executable, 'approved', { mode: 0o700 })
    const controller = await LauncherCustomBrowserController.open({
      getSetting: <T>(_key: string, fallback: T): T => fallback,
      launch: async () => {},
      openDefault: async () => {},
      platform: 'Windows',
      userDataPath,
    })
    await controller.select(executable)
    const grant = await stat(path.join(userDataPath, 'launcher', 'custom-browser-grant.json'))
    assert.equal(grant.mode & 0o777, 0o600)
    await controller.close()

    const replaced = path.join(userDataPath, 'launcher-real')
    await mkdir(replaced)
    await rm(path.join(userDataPath, 'launcher'), { recursive: true, force: true })
    await symlink(replaced, path.join(userDataPath, 'launcher'), 'junction')
    const rejected = await LauncherCustomBrowserController.open({
      getSetting: <T>(_key: string, fallback: T): T => fallback,
      launch: async () => {},
      openDefault: async () => {},
      platform: 'Windows',
      userDataPath,
    })
    await assert.rejects(rejected.select(executable), /directory|symbolic|unavailable|invalid/i)
    await rejected.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})
