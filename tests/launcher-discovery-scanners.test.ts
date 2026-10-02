import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
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

const scannerSource = readFileSync(new URL('../src/launcher-discovery-scanners.ts', import.meta.url), 'utf8')

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

test('macOS discovery retains dot-prefixed applications while filtering outside folders', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-dot-apps-'))
  const ordinary = join(root, 'Visible.app')
  const dotted = join(root, '..Hidden.app')
  try {
    const scanner = createLauncherDiscoveryScanners({
      execFile: async () => ({ stdout: [ordinary, dotted, join(root, '..', 'Outside.app')].join('\n') }),
    })
    const apps = await scanner.ApplicationSearch(context({
      platform: 'macOS',
      getSetting: <T>(key: string, fallback: T): T => key.endsWith('.macOsFolders') ? [root] as T : fallback,
    }))
    assert.deepEqual(apps.map(app => 'path' in app ? app.path : undefined), [ordinary, dotted])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('bounded discovery reads reject links and do not block on special files', () => {
  assert.match(scannerSource, /constants\.O_NOFOLLOW/u)
  assert.match(scannerSource, /constants\.O_NONBLOCK/u)
})

test('SQLite discovery runs outside the main thread', () => {
  assert.match(scannerSource, /new Worker\(/u)
})

test('built-in node sqlite is available before provider implementation', () => {
  assert.equal(launcherNodeSqliteAvailable(), true)
})

test('parses bounded Linux desktop entries with visibility rules', () => {
  assert.deepEqual(parseLinuxDesktopEntry('[Desktop Entry]\nType=Application\nName=TockTeam\nOnlyShowIn=GNOME;KDE;', ['GNOME']), { name: 'TockTeam' })
  assert.equal(parseLinuxDesktopEntry('[Desktop Entry]\nName=Hidden\nNoDisplay=true', ['GNOME']), undefined)
  assert.equal(parseLinuxDesktopEntry('[Desktop Entry]\nName=Removed\nHidden=true', ['GNOME']), undefined)
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

test('parses JetBrains projects without evaluating XML entities', { skip: process.platform === 'win32' }, () => {
  assert.deepEqual(parseJetBrainsRecentProjectPaths('<entry key="$USER_HOME$/work/tockteam" value="{}" /><entry key="/work/other&amp;safe" value="{}" />', '/Users/max'), [
    '/Users/max/work/tockteam', '/work/other&safe',
  ])
  assert.deepEqual(parseJetBrainsRecentProjectPaths('<!DOCTYPE foo><entry key="/unsafe" />', '/Users/max'), [])
})

test('merges VS Code storage values by first URI and classifies remote workspaces', { skip: process.platform === 'win32' }, () => {
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
  assert.deepEqual(parseVSCodeRecentEntries([JSON.stringify({ entries: [{ fileUri: 'file://server/share/project' }] })]), [])
})

test('reads VS Code SQLite state through the discovery worker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-vscode-'))
  const databasePath = join(root, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb')
  try {
    await mkdir(join(databasePath, '..'), { recursive: true })
    const workspaceUri = pathToFileURL(join(root, 'workspace')).href
    const database = new DatabaseSync(databasePath)
    try {
      database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)')
      database.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(
        'history.recentlyOpenedPathsList',
        JSON.stringify({ entries: [{ folderUri: workspaceUri }] }),
      )
    } finally { database.close() }
    const entries = await createLauncherDiscoveryScanners().VSCode(context({ homePath: root }))
    assert.deepEqual(entries.map(entry => 'uri' in entry ? entry.uri : ''), [workspaceUri])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('uses one fixed PowerShell script and data-only settings arguments', () => {
  const safe = windowsApplicationScanInvocation({ fileExtensions: ['lnk'], folders: ['C:\\ProgramData\\Start Menu'], includeStoreApps: true })
  const hostile = windowsApplicationScanInvocation({ fileExtensions: ['lnk; Write-Host pwned'], folders: ["C:\\safe'; Write-Host pwned; '"], includeStoreApps: false })
  assert.equal(safe.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  assert.equal(safe.args.length, 4)
  assert.equal(hostile.args.length, 4)
  assert.equal(safe.args[3]!.slice(safe.args[3]!.indexOf('\n')), hostile.args[3]!.slice(hostile.args[3]!.indexOf('\n')))
  assert.ok(!String(hostile.args[3]).includes('pwned'))
  const encoded = hostile.args[3]!.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/u)?.[1]
  assert.ok(encoded)
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')), { folders: ["C:\\safe'; Write-Host pwned; '"], extensions: ['lnk; Write-Host pwned'], includeStore: false })
  assert.match(String(safe.args[3]), /maxVisits|Select-Object -First/iu)
  assert.doesNotMatch(String(safe.args[3]), /Get-ChildItem[^\n]+-Recurse/iu)
  assert.ok(String(safe.args[3]).includes("'shell:AppsFolder\\' + $appId"))
  assert.ok(!String(safe.args[3]).includes("'shell:AppsFolder\\\\' + $appId"))
})

test('falls back to bounded configured macOS application folders for unindexed fixtures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-macos-apps-'))
  try {
    await mkdir(join(root, 'Fixture.app'), { recursive: true })
    const scanner = createLauncherDiscoveryScanners({ execFile: async () => ({ stdout: '' }) })
    const entries = await scanner.ApplicationSearch(context({
      platform: 'macOS',
      getSetting: <T>(key: string, fallback: T) => key.endsWith('.macOsFolders') ? [root] as T : fallback,
    }))
    assert.deepEqual(entries.map(entry => 'path' in entry ? entry.path : ''), [join(root, 'Fixture.app')])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('keeps macOS applications with exact .app path-component filtering', async () => {
  const scanner = createLauncherDiscoveryScanners({ execFile: async () => ({ stdout: '/Applications/Foo.app-data/Bar.app\n/Applications/Foo.app/Bar.app\n/Applications/Good.app\n' }) })
  const entries = await scanner.ApplicationSearch(context({
    platform: 'macOS',
    getSetting: <T>(key: string, fallback: T) => key.endsWith('.macOsFolders') ? ['/Applications'] as T : fallback,
  }))
  assert.deepEqual(entries.map(entry => 'path' in entry ? entry.path : ''), ['/Applications/Foo.app-data/Bar.app', '/Applications/Good.app'])
})

test('macOS app scan finds English and Chinese bundle names without following metadata links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-localized-apps-'))
  try {
    const calendar = join(root, 'Calendar.app')
    const notes = join(root, 'Notes.app')
    const linked = join(root, 'Linked.app')
    await mkdir(join(calendar, 'Contents', 'Resources'), { recursive: true })
    await mkdir(join(notes, 'Contents', 'Resources', 'zh_CN.lproj'), { recursive: true })
    await mkdir(join(linked, 'Contents', 'Resources'), { recursive: true })
    await writeFile(join(calendar, 'Contents', 'Resources', 'InfoPlist.loctable'), JSON.stringify({ en: { CFBundleDisplayName: 'Calendar' }, zh_CN: { CFBundleDisplayName: '日历' } }))
    await writeFile(join(notes, 'Contents', 'Resources', 'zh_CN.lproj', 'InfoPlist.strings'), JSON.stringify({ CFBundleDisplayName: '备忘录' }))
    await symlink(join(calendar, 'Contents', 'Resources', 'InfoPlist.loctable'), join(linked, 'Contents', 'Resources', 'InfoPlist.loctable'))
    const files: string[] = []
    const scanner = createLauncherDiscoveryScanners({ execFile: async (executable, args) => {
      if (executable === '/usr/bin/mdfind') return { stdout: [calendar, notes, linked].join('\n') }
      assert.equal(executable, '/usr/bin/plutil')
      const target = args.at(-1)!
      files.push(target)
      return { stdout: readFileSync(target, 'utf8') }
    } })
    const entries = await scanner.ApplicationSearch(context({
      platform: 'macOS',
      getSetting: <T>(key: string, fallback: T) => key.endsWith('.macOsFolders') ? [root] as T : fallback,
    }))
    assert.deepEqual(entries.map(entry => entry.kind === 'application' ? [entry.name, entry.searchAliases] : []), [
      ['Calendar', ['日历']], ['Notes', ['备忘录']], ['Linked', undefined],
    ])
    assert.ok(!files.some(file => file.startsWith(join(linked, 'Contents'))))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('malformed and oversized macOS bundle metadata falls back to the app filename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-broken-apps-'))
  try {
    const broken = join(root, 'Broken.app')
    const large = join(root, 'Large.app')
    for (const app of [broken, large]) await mkdir(join(app, 'Contents', 'Resources'), { recursive: true })
    await writeFile(join(broken, 'Contents', 'Resources', 'InfoPlist.loctable'), '{bad')
    await writeFile(join(large, 'Contents', 'Resources', 'InfoPlist.loctable'), 'x'.repeat(1024 * 1024 + 1))
    const checked: string[] = []
    const scanner = createLauncherDiscoveryScanners({ execFile: async (executable, args) => {
      if (executable === '/usr/bin/mdfind') return { stdout: `${broken}\n${large}` }
      assert.equal(executable, '/usr/bin/plutil')
      checked.push(args.at(-1)!)
      return { stdout: readFileSync(args.at(-1)!, 'utf8') }
    } })
    const entries = await scanner.ApplicationSearch(context({ platform: 'macOS', getSetting: <T>(key: string, fallback: T) => key.endsWith('.macOsFolders') ? [root] as T : fallback }))
    assert.deepEqual(entries.map(entry => entry.kind === 'application' ? [entry.name, entry.searchAliases] : []), [['Broken', undefined], ['Large', undefined]])
    assert.deepEqual(checked, [join(broken, 'Contents', 'Resources', 'InfoPlist.loctable')])
    const canceled = new AbortController()
    const cancelScanner = createLauncherDiscoveryScanners({ execFile: async executable => {
      if (executable === '/usr/bin/mdfind') return { stdout: broken }
      canceled.abort(new Error('bundle scan canceled'))
      return { stdout: '{}' }
    } })
    await assert.rejects(cancelScanner.ApplicationSearch(context({ platform: 'macOS', signal: canceled.signal,
      getSetting: <T>(key: string, fallback: T) => key.endsWith('.macOsFolders') ? [root] as T : fallback,
    })), /bundle scan canceled/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('scans Linux applications sequentially with limits and cancellation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-discovery-'))
  try {
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, 'removed.desktop'), '[Desktop Entry]\nType=Application\nName=Removed\nHidden=true\n', 'utf8')
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

test('skips malformed JetBrains product metadata without losing other tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-jetbrains-'))
  try {
    const home = join(root, 'home')
    const toolbox = join(home, 'Library', 'Application Support', 'JetBrains', 'Toolbox')
    const config = join(home, 'Library', 'Application Support', 'JetBrains', 'IdeaIC2024.1', 'options')
    const broken = join(root, 'broken', 'Contents', 'Resources')
    const install = join(root, 'good')
    const resources = join(install, 'Contents', 'Resources')
    const executable = join(install, 'Contents', 'MacOS', 'idea')
    const project = join(root, 'project')
    await mkdir(toolbox, { recursive: true }); await mkdir(config, { recursive: true }); await mkdir(broken, { recursive: true }); await mkdir(resources, { recursive: true }); await mkdir(join(install, 'Contents', 'MacOS'), { recursive: true }); await mkdir(join(project, '.idea'), { recursive: true })
    await writeFile(join(toolbox, 'state.json'), JSON.stringify({ tools: [
      { displayName: 'Broken', installLocation: join(root, 'broken'), launchCommand: 'Contents/MacOS/idea' },
      { displayName: 'IntelliJ IDEA', installLocation: install, launchCommand: 'Contents/MacOS/idea' },
    ] }), 'utf8')
    await writeFile(join(broken, 'product-info.json'), 'null', 'utf8')
    await writeFile(join(resources, 'product-info.json'), JSON.stringify({ dataDirectoryName: 'IdeaIC2024.1' }), 'utf8')
    await writeFile(executable, 'idea', 'utf8')
    await writeFile(join(config, 'recentProjects.xml'), `<entry key="${project}" value="{}" />`, 'utf8')
    await writeFile(join(project, '.idea', 'TockTeam.iml'), '', 'utf8')
    const scanner = createLauncherDiscoveryScanners()
    const entries = await scanner.JetBrainsToolbox(context({ homePath: home, platform: 'macOS' }))
    assert.deepEqual(entries.map(entry => 'toolName' in entry ? entry.toolName : ''), ['IntelliJ IDEA'])
    assert.equal(entries[0]?.kind === 'jetbrains' ? entries[0].name : undefined, 'TockTeam')
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/launcher-discovery-scanners.ts', import.meta.url), 'utf8'))
    const fallback = source.slice(source.indexOf('async function scanJetBrains'), source.indexOf('async function scanVSCode'))
    assert.doesNotMatch(fallback, /readdir\(/u)
    assert.match(fallback, /opendir\(ideaPath\)/u)
    assert.match(fallback, /visits < MAX_DISCOVERY_DIRECTORY_VISITS/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('isolates broken browser profiles while preserving valid browser order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-browser-'))
  try {
    const profile = join(root, 'Google', 'Chrome', 'Default')
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
