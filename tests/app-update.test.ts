import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import {
  createDesktopAppUpdater,
  type AutoUpdaterPort,
} from '../src/app-update.ts'

type Listener = (...args: any[]) => void

class FakeUpdater implements AutoUpdaterPort {
  autoDownload = true
  autoInstallOnAppQuit = true
  channel = ''
  allowPrerelease = false
  allowDowngrade = false
  checkCalls = 0
  downloadCalls = 0
  installCalls = 0
  failCheck = false
  failDownload = false
  failInstall = false
  private readonly listeners = new Map<string, Set<Listener>>()
  on(event: string, listener: Listener): void { (this.listeners.get(event) ?? new Set()).add(listener); this.listeners.set(event, this.listeners.get(event) ?? new Set([listener])) }
  removeListener(event: string, listener: Listener): void { this.listeners.get(event)?.delete(listener) }
  emit(event: string, ...args: unknown[]): void { for (const listener of this.listeners.get(event) ?? []) listener(...args) }
  async checkForUpdates(): Promise<void> { this.checkCalls += 1; if (this.failCheck) throw new Error('check failed') }
  async downloadUpdate(): Promise<void> { this.downloadCalls += 1; if (this.failDownload) throw new Error('download failed') }
  quitAndInstall(): void { this.installCalls += 1; if (this.failInstall) throw new Error('install failed') }
}

function fakeApp(root: string, packaged: boolean): { isPackaged: boolean; getVersion(): string; getPath(name: string): string } {
  return { isPackaged: packaged, getVersion: () => '1.2.3', getPath: name => name === 'userData' ? root : root }
}

test('development and missing metadata stay disabled without touching updater', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-update-'))
  const updater = new FakeUpdater()
  const disabled = createDesktopAppUpdater({ app: fakeApp(root, false), updater })
  assert.equal(disabled.getState().enabled, false)
  assert.equal(disabled.getState().status, 'disabled')
  assert.equal(updater.checkCalls, 0)
})

test('packaged builds without update metadata stay disabled and never load the adapter', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-update-'))
  let loaded = 0
  const owner = createDesktopAppUpdater({
    app: fakeApp(root, true),
    updaterFactory: async () => {
      loaded += 1
      throw new Error('adapter must not load')
    },
  })
  assert.equal(owner.getState().status, 'disabled')
  assert.equal((await owner.check()).accepted, false)
  owner.start()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(loaded, 0)
  owner.dispose()
})

test('enabled updater configures manual finite transitions and serializes actions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-update-'))
  mkdirSync(join(root, 'resources'))
  writeFileSync(join(root, 'resources', 'app-update.yml'), 'provider: generic\n')
  const updater = new FakeUpdater()
  const app = { ...fakeApp(root, true), resourcesPath: join(root, 'resources') }
  const owner = createDesktopAppUpdater({ app, updater })
  assert.equal(owner.getState().enabled, true)
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  const first = owner.check()
  const second = owner.check()
  assert.equal((await second).accepted, false)
  assert.equal((await first).completed, true)
  updater.emit('update-available', { version: '1.3.0' })
  assert.equal(owner.getState().status, 'available')
  await owner.download()
  updater.emit('download-progress', { percent: 47 })
  assert.equal(owner.getState().downloadPercent, 47)
  updater.emit('update-downloaded', { version: '1.3.0' })
  assert.equal(owner.getState().status, 'downloaded')
  await owner.install()
  assert.equal(updater.installCalls, 1)
})

test('async install errors recover once and retain the downloaded retry authority', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-update-'))
  mkdirSync(join(root, 'resources'))
  writeFileSync(join(root, 'resources', 'app-update.yml'), 'provider: generic\n')
  const updater = new FakeUpdater()
  let recovered = 0
  const owner = createDesktopAppUpdater({
    app: { ...fakeApp(root, true), resourcesPath: join(root, 'resources') },
    updater,
    recoverInstallFailure: async () => { recovered += 1 },
  })
  updater.emit('update-available', { version: '1.3.0' })
  updater.emit('update-downloaded', { version: '1.3.0' })
  assert.equal((await owner.install()).accepted, true)
  updater.emit('error', new Error('install failed after quitAndInstall returned'))
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.equal(recovered, 1)
  assert.equal(owner.getState().status, 'downloaded')
  assert.equal(owner.getState().downloadedVersion, '1.3.0')
  assert.equal(owner.getState().canRetry, true)
  updater.emit('update-available', { version: '1.4.0' })
  updater.emit('update-not-available')
  updater.emit('update-downloaded', { version: '1.4.0' })
  assert.equal(owner.getState().status, 'downloaded')
  assert.equal(owner.getState().downloadedVersion, '1.3.0')
  updater.emit('error', new Error('duplicate late error'))
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.equal(recovered, 1)
  assert.equal((await owner.check()).accepted, false)
  assert.equal((await owner.download()).accepted, false)
  owner.dispose()
})

test('failed check/download/install remain retryable and recovery runs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-update-'))
  mkdirSync(join(root, 'resources'))
  writeFileSync(join(root, 'resources', 'app-update.yml'), 'provider: generic\n')
  const updater = new FakeUpdater()
  let recovered = 0
  const owner = createDesktopAppUpdater({
    app: { ...fakeApp(root, true), resourcesPath: join(root, 'resources') },
    updater,
    recoverInstallFailure: async () => { recovered += 1 },
  })
  updater.failCheck = true
  assert.equal((await owner.check()).state.canRetry, true)
  updater.failCheck = false
  updater.emit('update-available', { version: '1.3.0' })
  updater.failDownload = true
  assert.equal((await owner.download()).state.canRetry, true)
  updater.failDownload = false
  updater.emit('update-downloaded', { version: '1.3.0' })
  updater.failInstall = true
  assert.equal((await owner.install()).state.canRetry, true)
  assert.equal(recovered, 1)
  owner.dispose()
})
