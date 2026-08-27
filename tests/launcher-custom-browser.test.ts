import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { LauncherCustomBrowserController, parseLauncherCustomBrowserArgumentTemplate } from '../src/launcher-custom-browser.ts'

async function root(): Promise<string> { return await mkdtemp(path.join(tmpdir(), 'tockteam-browser-')) }

function harness(platform: 'Linux' | 'macOS' | 'Windows', userDataPath: string, settings: Record<string, unknown> = {}) {
  const launches: Array<{ executable: string; args: readonly string[] }> = []
  const defaults: string[] = []
  const options = {
    getSetting: <T>(key: string, fallback: T): T => Object.hasOwn(settings, key) ? settings[key] as T : fallback,
    launch: async (executable: string, args: readonly string[]) => { launches.push({ executable, args }) },
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
