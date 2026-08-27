import assert from 'node:assert/strict'
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
