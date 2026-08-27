import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  createLauncherDiscoveryScanners,
  launcherNodeSqliteAvailable,
  parseChromiumBookmarks,
  parseJetBrainsRecentProjectPaths,
  parseLinuxDesktopEntry,
  parseVSCodeRecentEntries,
  windowsApplicationScanInvocation,
} from '../src/launcher-discovery-scanners.ts'
import type { LauncherDiscoveryScanContext } from '../src/launcher-discovery-extensions.ts'

function context(overrides: Partial<LauncherDiscoveryScanContext> = {}): LauncherDiscoveryScanContext {
  return {
    appDataPath: '/tmp/tockteam-app-data',
    defaults: {
      ApplicationSearch: {
        includeWindowsStoreApps: true,
        linuxFolders: [],
        macOsFolders: [],
        mdfindFilterOption: "kMDItemKind=='Application'",
        windowsFileExtensions: ['lnk'],
        windowsFolders: [],
      },
      BrowserBookmarks: { browsers: [], iconType: 'favicon', searchResultStyle: 'nameOnly' },
      VSCode: { command: 'code %s', prefix: 'vscode', showPath: false },
    },
    environment: {},
    getSetting: <T>(_key: string, fallback: T) => fallback,
    homePath: '/tmp/tockteam-home',
    platform: 'Linux',
    signal: new AbortController().signal,
    ...overrides,
  }
}

test('built-in node sqlite is available before provider implementation', () => {
  assert.equal(launcherNodeSqliteAvailable(), true)
})

test('parses bounded Linux desktop entries with visibility rules', () => {
  assert.deepEqual(parseLinuxDesktopEntry('[Desktop Entry]\nType=Application\nName=TockTeam\nOnlyShowIn=GNOME;KDE;', ['GNOME']), { name: 'TockTeam' })
  assert.equal(parseLinuxDesktopEntry('[Desktop Entry]\nName=Hidden\nNoDisplay=true', ['GNOME']), undefined)
  assert.equal(parseLinuxDesktopEntry('[Desktop Entry]\nName=Wrong\nOnlyShowIn=KDE;', ['GNOME']), undefined)
  assert.equal(parseLinuxDesktopEntry('[Desktop Entry]\nName=Wrong\nNotShowIn=GNOME;', ['GNOME']), undefined)
})

test('recurses bounded Chromium bookmarks and keeps only HTTP(S)', () => {
  assert.deepEqual(parseChromiumBookmarks(JSON.stringify({ roots: { bookmark_bar: { children: [
    { guid: 'folder', type: 'folder', children: [
      { guid: 'docs', type: 'url', name: 'Docs', url: 'https://docs.example.test/start' },
      { guid: 'local', type: 'url', name: 'Local', url: 'file:///etc/passwd' },
    ] },
  ] } } })), [{ id: 'docs', name: 'Docs', url: 'https://docs.example.test/start' }])
  assert.deepEqual(parseChromiumBookmarks('{bad'), [])
})

test('parses JetBrains projects without evaluating XML entities', () => {
  assert.deepEqual(parseJetBrainsRecentProjectPaths('<entry key="$USER_HOME$/work/tockteam" value="{}" /><entry key="/work/other&amp;safe" value="{}" />', '/Users/max'), [
    '/Users/max/work/tockteam', '/work/other&safe',
  ])
  assert.deepEqual(parseJetBrainsRecentProjectPaths('<!DOCTYPE foo><entry key="/unsafe" />', '/Users/max'), [])
})

test('merges VS Code storage values by first URI and classifies remote workspaces', () => {
  const entries = parseVSCodeRecentEntries([
    JSON.stringify({ entries: [{ folderUri: 'file:///work/one', label: 'One' }] }),
    JSON.stringify({ entries: [{ fileUri: 'file:///work/two.txt' }] }),
    JSON.stringify({ entries: [{ folderUri: 'file:///work/one' }, { workspace: { configPath: 'vscode-remote://ssh/work.code-workspace', id: 'id' } }] }),
  ])
  assert.deepEqual(entries.map(entry => [entry.uri, entry.commandArg, entry.fileType]), [
    ['file:///work/one', '--folder-uri', 'Folder'],
    ['file:///work/two.txt', '--file-uri', 'File'],
    ['vscode-remote://ssh/work.code-workspace', '--file-uri', 'Remote Workspace'],
  ])
})

test('uses one fixed PowerShell script and data-only settings arguments', () => {
  const safe = windowsApplicationScanInvocation({ fileExtensions: ['lnk'], folders: ['C:\\ProgramData\\Start Menu'], includeStoreApps: true })
  const hostile = windowsApplicationScanInvocation({ fileExtensions: ['lnk; Write-Host pwned'], folders: ["C:\\safe'; Write-Host pwned; '"], includeStoreApps: false })
  assert.equal(safe.executable, 'powershell.exe')
  assert.equal(safe.args[3], hostile.args[3])
  assert.ok(!String(hostile.args[3]).includes('pwned'))
  assert.ok(String(hostile.args.at(-2)).includes('pwned'))
  assert.match(String(safe.args[3]), /maxVisits|Select-Object -First/iu)
  assert.doesNotMatch(String(safe.args[3]), /Get-ChildItem[^\n]+-Recurse/iu)
  assert.ok(String(safe.args[3]).includes("'shell:AppsFolder\\' + $appId"))
  assert.ok(!String(safe.args[3]).includes("'shell:AppsFolder\\\\' + $appId"))
})

test('scans Linux applications sequentially with limits and cancellation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-discovery-'))
  try {
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, 'good.desktop'), '[Desktop Entry]\nType=Application\nName=Good\n', 'utf8')
    await writeFile(join(root, 'hidden.desktop'), '[Desktop Entry]\nType=Application\nName=Hidden\nNoDisplay=true\n', 'utf8')
    await writeFile(join(root, 'nested', 'nested.desktop'), '[Desktop Entry]\nType=Application\nName=Nested\n', 'utf8')
    const scanner = createLauncherDiscoveryScanners()
    const entries = await scanner.ApplicationSearch(context({
      defaults: { ...context().defaults, ApplicationSearch: { ...context().defaults.ApplicationSearch, linuxFolders: [root] } },
    }))
    assert.deepEqual(entries.map(entry => 'name' in entry ? entry.name : ''), ['Good'])
    const controller = new AbortController(); controller.abort(new Error('canceled'))
    await assert.rejects(scanner.ApplicationSearch(context({
      signal: controller.signal,
      defaults: { ...context().defaults, ApplicationSearch: { ...context().defaults.ApplicationSearch, linuxFolders: [root] } },
    })), /canceled/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('isolates broken browser profiles while preserving valid browser order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-browser-'))
  try {
    const profile = join(root, 'Google', 'Chrome', 'User Data', 'Default')
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'Bookmarks'), JSON.stringify({ roots: { bookmark_bar: { children: [{ type: 'url', guid: 'one', name: 'One', url: 'https://one.example.test' }] } } }), 'utf8')
    const scanner = createLauncherDiscoveryScanners()
    const entries = await scanner.BrowserBookmarks(context({
      appDataPath: root,
      platform: 'macOS',
      getSetting: <T>(key: string, fallback: T) => key.endsWith('.browsers') ? ['Google Chrome', 'Firefox'] as T : fallback,
    }))
    assert.deepEqual(entries.map(entry => 'browserName' in entry ? entry.browserName : ''), ['Google Chrome'])
  } finally { await rm(root, { recursive: true, force: true }) }
})
