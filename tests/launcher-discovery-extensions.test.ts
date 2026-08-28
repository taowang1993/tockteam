import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  LAUNCHER_DISCOVERY_DEFAULTS,
  LAUNCHER_DISCOVERY_EXTENSION_IDS,
  createLauncherDiscoveryExtensions,
  type LauncherDiscoveryScanners,
} from '../src/launcher-discovery-extensions.ts'
import type { LauncherActionRecord, LauncherInternalResultItem } from '../src/launcher-actions.ts'

const entries = {
  ApplicationSearch: async () => [{ id: 'applications:/Applications/Notes.app', kind: 'application' as const, name: 'Notes', path: '/Applications/Notes.app' }],
  BrowserBookmarks: async () => [{ browserName: 'Google Chrome', id: 'bookmarks:Google Chrome:docs', kind: 'bookmark' as const, name: 'Docs', url: 'https://docs.example.test/start' }],
  JetBrainsToolbox: async () => [{ executable: '/Applications/IntelliJ IDEA.app/Contents/MacOS/idea', id: 'jetbrains-toolbox-/work/tockteam', kind: 'jetbrains' as const, name: 'tockteam', projectPath: '/work/tockteam', toolName: 'IntelliJ IDEA' }],
  VSCode: async () => [{ commandArg: '--folder-uri' as const, fileType: 'Folder', id: 'vscode:file:///work/tockteam', kind: 'vscode' as const, label: 'tockteam', path: '/work/tockteam', uri: 'file:///work/tockteam' }],
} satisfies LauncherDiscoveryScanners

const baseOptions = {
  appDataPath: '/Users/max/Library/Application Support',
  enabledExtensionIds: () => LAUNCHER_DISCOVERY_EXTENSION_IDS,
  getSetting: <T>(_key: string, fallback: T) => fallback,
  homePath: '/Users/max',
  platform: 'macOS' as const,
  capturePathIdentity: async (_target: string) => ({ dev: '1', ino: '1' }),
  resolveExecutable: async (executable: string) => executable === 'code' ? '/usr/local/bin/code' : executable,
  scanners: entries,
}

function record(item: LauncherInternalResultItem, overrides: Partial<LauncherActionRecord> = {}): LauncherActionRecord {
  return Object.freeze({
    actionId: 'launcher-action:test', argument: item.defaultAction.argument, expiresAt: 2_000,
    handlerKey: item.defaultAction.handlerKey, hideWindowAfterInvocation: true,
    owner: { role: 'launcher' as const, webContentsId: 1 }, requiresConfirmation: item.defaultAction.requiresConfirmation === true,
    resultSetId: 'launcher-results:1', sourceExtension: item.sourceExtension, ...overrides,
  })
}

test('retains discovery inventory, platform matrix, and defaults', () => {
  assert.deepEqual(LAUNCHER_DISCOVERY_EXTENSION_IDS, ['ApplicationSearch', 'BrowserBookmarks', 'JetBrainsToolbox', 'VSCode'])
  assert.deepEqual(LAUNCHER_DISCOVERY_DEFAULTS('macOS', '/Users/max', '/Users/max/Library/Application Support').ApplicationSearch.macOsFolders, [
    '/System/Applications', '/System/Library/CoreServices', '/Applications', '/Users/max/Applications',
  ])
  assert.deepEqual(LAUNCHER_DISCOVERY_DEFAULTS('Linux', '/home/max', '/home/max/.config', { XDG_DATA_DIRS: '/opt/share:/usr/share' }).ApplicationSearch.linuxFolders, ['/opt/share/applications', '/usr/share/applications'])
  assert.equal(LAUNCHER_DISCOVERY_DEFAULTS('Windows', 'C:\\Users\\max', 'C:\\Users\\max\\AppData\\Roaming').VSCode.command, 'code %s')
})

test('maps applications, bookmarks, JetBrains projects, and VS Code to opaque bounded actions', async () => {
  const effects = {
    confirmOpenApplicationAsAdministrator: async () => true,
    copyText: async (_text: string) => {},
    launchExecutable: async (_executable: string, _args: readonly string[]) => {},
    openApplication: async (_target: string) => {},
    openApplicationAsAdministrator: async (_target: string) => {},
    openExternal: async (_url: string) => {},
    revealPath: async (_target: string) => {},
  }
  const provider = createLauncherDiscoveryExtensions({ ...baseOptions, effects, getApplicationIcon: async () => 'data:image/png;base64,aWNvbg==' })
  const indexed = await provider.loadIndexedItems(new AbortController().signal)
  assert.deepEqual(indexed.map(item => item.sourceExtension), ['ApplicationSearch', 'BrowserBookmarks', 'JetBrainsToolbox'])
  assert.equal(indexed[0]?.imageKey, 'application-macos')
  assert.equal(indexed[0]?.imageUrl, 'data:image/png;base64,aWNvbg==')
  assert.equal(indexed[1]?.imageKey, 'browser-bookmarks')
  assert.equal(indexed[2]?.imageKey, 'jetbrains-toolbox')
  assert.ok(indexed.every(item => item.defaultAction.argument.includes('version')))
  const instant = await provider.searchInstant('vscode tock')
  assert.equal(instant.after[0]?.sourceExtension, 'VSCode')
  assert.equal(instant.after[0]?.defaultAction.argument.includes('file:///work/tockteam'), true)
})

test('bounds application icon mapping by the scan deadline', async () => {
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    scanTimeoutMs: 20,
    getApplicationIcon: async () => await new Promise<string | undefined>(() => {}),
    effects: { confirmOpenApplicationAsAdministrator: async () => false, copyText: () => {}, launchExecutable: () => {}, openApplication: () => {}, openApplicationAsAdministrator: () => {}, openExternal: () => {}, revealPath: () => {} },
  })
  const indexed = await provider.loadIndexedItems(new AbortController().signal)
  assert.equal(indexed.some(item => item.sourceExtension === 'ApplicationSearch'), true)
})

test('caps public bookmark labels after adding URL details', async () => {
  const longUrl = `https://docs.example.test/${'x'.repeat(4_096)}`
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    getSetting: <T>(key: string, fallback: T) => key === 'extension[BrowserBookmarks].searchResultStyle' ? 'nameAndUrl' as T : fallback,
    scanners: { ...entries, BrowserBookmarks: async () => [{ browserName: 'Google Chrome', id: 'long', kind: 'bookmark' as const, name: 'Docs', url: longUrl }] },
    effects: { confirmOpenApplicationAsAdministrator: async () => false, copyText: () => {}, launchExecutable: () => {}, openApplication: () => {}, openApplicationAsAdministrator: () => {}, openExternal: () => {}, revealPath: () => {} },
  })
  const [item] = (await provider.loadIndexedItems(new AbortController().signal)).filter(result => result.sourceExtension === 'BrowserBookmarks')
  assert.equal(item?.name.length, 512)
})

test('does not publish local targets without captured identities', async () => {
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    capturePathIdentity: async () => undefined,
    enabledExtensionIds: () => LAUNCHER_DISCOVERY_EXTENSION_IDS,
    effects: { confirmOpenApplicationAsAdministrator: async () => false, copyText: () => {}, launchExecutable: () => {}, openApplication: () => {}, openApplicationAsAdministrator: () => {}, openExternal: () => {}, revealPath: () => {} },
  })
  const indexed = await provider.loadIndexedItems(new AbortController().signal)
  assert.deepEqual(indexed.map(item => item.sourceExtension), ['BrowserBookmarks'])
  const instant = await provider.searchInstant('vscode tock')
  assert.deepEqual(instant.after, [])
})

test('isolates provider failures and enforces latest scan cancellation', async () => {
  const errors: string[] = []
  const controller = new AbortController()
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    enabledExtensionIds: () => LAUNCHER_DISCOVERY_EXTENSION_IDS,
    effects: { confirmOpenApplicationAsAdministrator: async () => false, copyText: () => {}, launchExecutable: () => {}, openApplication: () => {}, openApplicationAsAdministrator: () => {}, openExternal: () => {}, revealPath: () => {} },
    onProviderError: (extensionId, error) => errors.push(`${extensionId}:${error.message}`),
    scanners: {
      ...entries,
      ApplicationSearch: async () => { throw new Error('permission denied') },
      BrowserBookmarks: async () => { throw new Error('bookmarks unavailable') },
      JetBrainsToolbox: async ({ signal }) => await new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    },
  })
  const pending = provider.loadIndexedItems(controller.signal)
  controller.abort(new Error('superseded'))
  await assert.rejects(pending, /superseded/u)
  assert.equal(errors.some(error => error.startsWith('ApplicationSearch:')), true)
  assert.equal(errors.some(error => error.startsWith('BrowserBookmarks:')), true)
})

test('clears VS Code actions after a failed rescan', async () => {
  let failed = false
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    enabledExtensionIds: () => ['VSCode'],
    scanners: { ...entries, VSCode: async () => { if (failed) throw new Error('database unavailable'); return entries.VSCode() } },
    effects: { confirmOpenApplicationAsAdministrator: async () => false, copyText: () => {}, launchExecutable: async () => {}, openApplication: () => {}, openApplicationAsAdministrator: () => {}, openExternal: () => {}, revealPath: () => {} },
  })
  await provider.loadIndexedItems(new AbortController().signal)
  const previous = (await provider.searchInstant('vscode tock')).after[0]!
  failed = true
  await provider.loadIndexedItems(new AbortController().signal)
  await assert.rejects(provider.executeAction(record(previous)), /current main-owned scan/u)
})

test('does not let an older instant search overwrite the current VS Code action map', async () => {
  let executableCalls = 0
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    enabledExtensionIds: () => ['VSCode'],
    scanners: { ...entries, VSCode: async () => [
      { commandArg: '--folder-uri' as const, fileType: 'Folder', id: 'alpha', kind: 'vscode' as const, label: 'alpha', path: '/work/alpha', uri: 'vscode-remote://ssh/alpha' },
      { commandArg: '--folder-uri' as const, fileType: 'Folder', id: 'beta', kind: 'vscode' as const, label: 'beta', path: '/work/beta', uri: 'vscode-remote://ssh/beta' },
    ] },
    resolveExecutable: async () => '/usr/local/bin/code',
    capturePathIdentity: async () => { executableCalls++; if (executableCalls === 1) await new Promise(resolve => setTimeout(resolve, 30)); return { dev: '1', ino: '1' } },
    effects: { confirmOpenApplicationAsAdministrator: async () => false, copyText: () => {}, launchExecutable: async () => {}, openApplication: () => {}, openApplicationAsAdministrator: () => {}, openExternal: () => {}, revealPath: () => {} },
  })
  await provider.loadIndexedItems(new AbortController().signal)
  const oldSearch = provider.searchInstant('vscode alpha')
  const currentSearch = provider.searchInstant('vscode beta')
  const current = (await currentSearch).after[0]!
  await oldSearch
  await provider.executeAction(record(current))
})

test('publishes canonical POSIX VS Code executable paths and identity-bound actions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-vscode-extension-'))
  try {
    const target = join(root, 'installed', 'bin', 'code')
    const link = join(root, 'code')
    const replacement = join(root, 'replacement', 'bin', 'code')
    await mkdir(join(root, 'installed', 'bin'), { recursive: true })
    await mkdir(join(root, 'replacement', 'bin'), { recursive: true })
    await writeFile(target, 'code', 'utf8')
    await writeFile(replacement, 'replacement', 'utf8')
    await symlink(target, link)
    const { resolveExecutable: _testResolver, ...defaultOptions } = baseOptions
    const provider = createLauncherDiscoveryExtensions({
      ...defaultOptions,
      environment: { PATH: root },
      getSetting: <T>(key: string, fallback: T) => key === 'extension[VSCode].command' ? 'code %s' as T : fallback,
      enabledExtensionIds: () => ['VSCode'],
      scanners: { ...entries, VSCode: async () => [{ commandArg: '--folder-uri' as const, fileType: 'Folder', id: 'canonical', kind: 'vscode' as const, label: 'canonical', path: '/work/canonical', uri: 'vscode-remote://ssh/canonical' }] },
      capturePathIdentity: async candidate => { const stats = await lstat(candidate, { bigint: true }); return { dev: String(stats.dev), ino: String(stats.ino) } },
      effects: { confirmOpenApplicationAsAdministrator: async () => false, copyText: () => {}, launchExecutable: () => {}, openApplication: () => {}, openApplicationAsAdministrator: () => {}, openExternal: () => {}, revealPath: () => {} },
    })
    await provider.loadIndexedItems(new AbortController().signal)
    const item = (await provider.searchInstant('vscode canonical')).after[0]!
    const argument = JSON.parse(item.defaultAction.argument) as { executable: string }
    assert.equal(argument.executable, await realpath(target))
    assert.equal(argument.executable.endsWith('/code'), true)
    await rm(link)
    await symlink(replacement, link)
    await assert.rejects(provider.executeAction(record(item)), /revalidation|current main-owned scan/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('passes hostile VS Code URI characters only as direct executable arguments', async () => {
  const hostileUri = 'vscode-remote://ssh/work & | < > ^ " %!'
  const launches: Array<{ executable: string; args: readonly string[] }> = []
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    enabledExtensionIds: () => ['VSCode'],
    scanners: { ...entries, VSCode: async () => [{ commandArg: '--folder-uri' as const, fileType: 'Folder', id: 'hostile', kind: 'vscode' as const, label: 'hostile', path: hostileUri, uri: hostileUri }] },
    resolveExecutable: async () => 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
    effects: { confirmOpenApplicationAsAdministrator: async () => false, copyText: () => {}, launchExecutable: async (executable, args) => { launches.push({ executable, args }) }, openApplication: () => {}, openApplicationAsAdministrator: () => {}, openExternal: () => {}, revealPath: () => {} },
  })
  await provider.loadIndexedItems(new AbortController().signal)
  const item = (await provider.searchInstant('vscode hostile')).after[0]!
  await provider.executeAction(record(item))
  assert.equal(launches.length, 1)
  assert.equal(launches[0]?.executable.toLocaleLowerCase('en-US').endsWith('.exe'), true)
  assert.equal(launches[0]?.executable.toLocaleLowerCase('en-US').endsWith('.cmd'), false)
  assert.deepEqual(launches[0]?.args, ['--folder-uri', hostileUri])
})

test('revalidates application, bookmark, reveal, IDE and VS Code targets immediately before effects', async () => {
  const calls: string[] = []
  const effects = {
    confirmOpenApplicationAsAdministrator: async () => true,
    copyText: async () => { calls.push('copy') },
    launchExecutable: async () => { calls.push('launch') },
    openApplication: async () => { calls.push('open') },
    openApplicationAsAdministrator: async () => { calls.push('admin') },
    openExternal: async () => { calls.push('url') },
    revealPath: async () => { calls.push('reveal') },
  }
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    effects,
    revalidate: {
      application: async () => false,
      bookmark: async () => false,
      reveal: async () => false,
      jetbrains: async () => false,
      vscode: async () => false,
    },
  })
  const indexed = await provider.loadIndexedItems(new AbortController().signal)
  await assert.rejects(provider.executeAction(record(indexed[0]!)), /revalidation/u)
  await assert.rejects(provider.executeAction(record(indexed[1]!)), /revalidation/u)
  await assert.rejects(provider.executeAction(record(indexed[2]!)), /revalidation/u)
  const instant = (await provider.searchInstant('vscode tock')).after[0]!
  await assert.rejects(provider.executeAction(record(instant)), /revalidation/u)
  const reveal = indexed[0]!.additionalActions!.find(action => action.description === 'Show in file explorer')!
  await assert.rejects(provider.executeAction(record(indexed[0]!, { argument: reveal.argument, handlerKey: reveal.handlerKey })), /revalidation/u)
  assert.deepEqual(calls, [])
})

test('VSCode and JetBrains launch effects receive the provider signal before owner clear', async () => {
  for (const source of ['JetBrainsToolbox', 'VSCode'] as const) {
    let observedSignal: AbortSignal | undefined
    let release!: () => void
    const pendingEffect = new Promise<void>(resolve => { release = resolve })
    const provider = createLauncherDiscoveryExtensions({
      ...baseOptions,
      enabledExtensionIds: () => [source],
      effects: {
        confirmOpenApplicationAsAdministrator: async () => false,
        copyText: () => {},
        launchExecutable: async (_executable, _args, signal) => { observedSignal = signal; await pendingEffect },
        openApplication: () => {},
        openApplicationAsAdministrator: () => {},
        openExternal: () => {},
        revealPath: () => {},
      },
    })
    const indexed = await provider.loadIndexedItems(new AbortController().signal)
    const item = source === 'VSCode'
      ? (await provider.searchInstant('vscode tock')).after[0]
      : indexed.find(value => value.sourceExtension === source)
    assert.ok(item)
    const pending = provider.executeAction(record(item!))
    await new Promise<void>(resolve => setImmediate(resolve))
    provider.invalidate(`${source} owner-clear`)
    assert.equal(observedSignal?.aborted, true)
    release()
    await assert.rejects(pending, /canceled|current|invalidated|owner-clear/u)
    await provider.waitForIdle()
    await provider.close()
  }
})

test('Windows applications expose confirmed elevation and store IDs omit reveal', async () => {
  let confirmed = 0
  let elevated = 0
  const app = 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    appDataPath: 'C:\\Users\\max\\AppData\\Roaming',
    enabledExtensionIds: () => ['ApplicationSearch'],
    effects: {
      confirmOpenApplicationAsAdministrator: async () => { confirmed++; return true },
      copyText: () => {}, launchExecutable: () => {}, openApplication: () => {}, openApplicationAsAdministrator: async () => { elevated++ }, openExternal: () => {}, revealPath: () => {},
    },
    homePath: 'C:\\Users\\max', platform: 'Windows',
    scanners: { ...entries, ApplicationSearch: async () => [{ id: `applications:${app}`, kind: 'application' as const, name: 'Calculator', path: app }] },
  })
  const [item] = await provider.loadIndexedItems(new AbortController().signal)
  assert.deepEqual(item?.additionalActions?.map(action => action.description), ['Copy file path to clipboard'])
  assert.equal(confirmed, 0); assert.equal(elevated, 0)
})

test('discovery window-clear invalidation aborts a consumed external effect', async () => {
  let observedSignal: AbortSignal | undefined
  let release!: () => void
  const pendingEffect = new Promise<void>(resolve => { release = resolve })
  const provider = createLauncherDiscoveryExtensions({
    ...baseOptions,
    enabledExtensionIds: () => ['BrowserBookmarks'],
    effects: {
      confirmOpenApplicationAsAdministrator: async () => false,
      copyText: () => undefined,
      launchExecutable: () => undefined,
      openApplication: () => undefined,
      openApplicationAsAdministrator: () => undefined,
      openExternal: async (_url, signal) => { observedSignal = signal; await pendingEffect },
      revealPath: () => undefined,
    },
  })
  const [item] = await provider.loadIndexedItems(new AbortController().signal)
  const pending = provider.executeAction(record(item!))
  await new Promise<void>(resolve => setImmediate(resolve))
  provider.invalidate('launcher-owner-clear')
  assert.equal(observedSignal?.aborted, true)
  release()
  await assert.rejects(pending, /canceled|current|invalidated|owner-clear/u)
  await provider.waitForIdle()
  await provider.close()
})
