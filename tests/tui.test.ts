import assert from 'node:assert/strict'
import { spawn, type SpawnOptions } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ensureTuiProfile, TUI_BUNDLES, TUI_PROFILE } from '../src/profile.ts'
import { adaptTuiRendererPackage } from '../scripts/tui-upstream-adapter.mjs'
import {
  DEFAULT_TUI_HOME,
  main,
  parseTuiArgs,
  type TuiSpawner,
} from '../src/tui.ts'

test('pins the dsh-TUI v0.10.0-beta.5 renderer and bundled auth workspace', () => {
  const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
  const renderer = JSON.parse(readFileSync(join(repository, 'upstream', 'dsh-TUI', 'package.json'), 'utf8'))
  const auth = JSON.parse(readFileSync(join(repository, 'upstream', 'dsh-TUI', 'dsh-auth', 'package.json'), 'utf8'))
  assert.equal(renderer.version, '0.10.0-beta.5')
  assert.equal(renderer.dependencies['@deepseek-harness-tui/dsh-auth'], 'link:./dsh-auth')
  assert.equal(auth.name, '@deepseek-harness-tui/dsh-auth')

  const workspace = readFileSync(join(repository, 'pnpm-workspace.yaml'), 'utf8')
  const sqlite = '@deepseek-ai/dsh-session-persistence-sqlite'
  for (const dependency of Object.keys(renderer.devDependencies)) {
    if (dependency.startsWith('@deepseek-ai/dsh-') && dependency !== sqlite) {
      assert.match(workspace, new RegExp(`'${dependency}': 0\\.1\\.2-rc\\.1`))
    }
  }
  assert.equal(renderer.devDependencies[sqlite], '0.1.1-rc.2')

  const notices = readFileSync(join(repository, 'THIRD_PARTY_NOTICES.md'), 'utf8')
  assert.match(notices, /@deepseek-harness-tui\/dsh-tui@0\.10\.0-beta\.5/)
  assert.match(notices, /8f1444a2627fab01682e679a0e44de8989b66f77/)
})

test('packaged TUI launchers expose only the TUI surface', () => {
  const build = readFileSync(new URL('../scripts/build-tui.mjs', import.meta.url), 'utf8')
  const staging = readFileSync(new URL('../scripts/stage-dsh.mjs', import.meta.url), 'utf8')
  assert.match(build, /export TOCKTEAM_SURFACES=tui/)
  assert.match(build, /SET "TOCKTEAM_SURFACES=tui"/)
  assert.doesNotMatch(staging, /'upstream', 'dsh-TUI', 'skills'/)
})

test('Nix assembly pins and packages the renderer auth workspace', () => {
  const source = readFileSync(new URL('../nix/tockteam.nix', import.meta.url), 'utf8')
  assert.match(source, /8f1444a2627fab01682e679a0e44de8989b66f77/)
  assert.match(source, /94fdf81e775e8d884af4dfb64a94b617c3751936/)
  assert.match(source, /d28c267fe7fd775428ec2dccd65b0b7efd4dacee/)
  assert.match(source, /tsc -p upstream\/dsh-TUI\/dsh-auth\/tsconfig\.json/)
  assert.match(source, /package-deps\/tui-renderer\/@deepseek-harness-tui\/dsh-auth/)
})

function output(isTTY = false): { stream: NodeJS.WriteStream; text: () => string } {
  let value = ''
  return {
    stream: {
      isTTY,
      write: (chunk: string) => {
        value += chunk
        return true
      },
    } as unknown as NodeJS.WriteStream,
    text: () => value,
  }
}

test('TUI arguments keep environment defaults behind explicit flags', () => {
  assert.equal(DEFAULT_TUI_HOME, join(homedir(), '.tockteam'))

  const defaults = parseTuiArgs([], {
    TOCKTEAM_TUI_CWD: '/env/workspace',
    TOCKTEAM_TUI_FULLSCREEN: '0',
    TOCKTEAM_TUI_HOME: '/env/home',
    TOCKTEAM_TUI_LANG: 'en',
    TOCKTEAM_TUI_PRESET: 'code',
    TOCKTEAM_TUI_SESSION_ID: 'session-from-env',
  }, '/default/workspace', '/default/home')
  assert.deepEqual(defaults, {
    cwd: '/env/workspace',
    dataRoot: '/env/home',
    fullscreen: false,
    help: false,
    lang: 'en',
    preset: 'code',
    sessionId: 'session-from-env',
  })

  const flags = parseTuiArgs([
    '--cwd', '/flag/workspace',
    '--data=/flag/home',
    '--resume', 'session-from-flag',
    '--lang', 'zh',
    '--preset=minimal',
    '--fullscreen',
  ], {
    TOCKTEAM_TUI_FULLSCREEN: '0',
  }, '/default/workspace', '/default/home')
  assert.deepEqual(flags, {
    cwd: '/flag/workspace',
    dataRoot: '/flag/home',
    fullscreen: true,
    help: false,
    lang: 'zh',
    preset: 'minimal',
    sessionId: 'session-from-flag',
  })
})

test('TUI launcher initializes its profile and attaches the packaged runtime', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-tui-'))
  const packaged = join(root, 'package')
  const workspace = join(root, 'workspace')
  const dataRoot = join(root, 'data')
  const nodeBinary = process.platform === 'win32'
    ? join(packaged, 'node-runtime', 'node.exe')
    : join(packaged, 'node-runtime', 'bin', 'node')
  const cliEntry = join(packaged, 'dsh-runtime', 'lib', 'bin.js')
  mkdirSync(dirname(nodeBinary), { recursive: true })
  mkdirSync(dirname(cliEntry), { recursive: true })
  mkdirSync(workspace, { recursive: true })
  writeFileSync(nodeBinary, '')
  writeFileSync(cliEntry, '')
  writeFileSync(join(packaged, 'package.json'), '{"version":"1.2.3"}\n')

  let launch: { args: readonly string[]; command: string; options: SpawnOptions } | undefined
  const spawnTui = ((
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => {
    launch = { args, command, options }
    const child = new EventEmitter()
    queueMicrotask(() => { child.emit('exit', 0, null) })
    return child as ReturnType<typeof spawn>
  }) as TuiSpawner

  const stdout = output(true)
  const stderr = output(true)
  try {
    assert.equal(await main(
      ['--cwd', workspace, '--data', dataRoot, '--inline', '--lang', 'en', '--preset', 'code', '--resume', 'session-123'],
      { TOCKTEAM_TUI_ROOT: packaged, PATH: process.env.PATH },
      stdout.stream,
      stderr.stream,
      spawnTui,
      { isTTY: true } as Readable & { isTTY?: boolean },
    ), 0)
    assert.ok(launch)
    assert.equal(launch.command, nodeBinary)
    assert.deepEqual(launch.args, [cliEntry, '--profile', TUI_PROFILE])
    assert.equal(launch.options.cwd, workspace)
    assert.equal(launch.options.stdio, 'inherit')
    const childEnv = launch.options.env
    assert.equal(childEnv?.DSH_HOME, dataRoot)
    assert.equal(childEnv?.DSH_TUI_LANG, 'en')
    assert.equal(childEnv?.DSH_TUI_PRESET, 'code')
    assert.equal(childEnv?.DSH_TUI_RESUME_SESSION, 'session-123')
    assert.equal(childEnv?.CC_TUI_LANG, undefined)
    assert.equal(childEnv?.CC_TUI_PRESET, undefined)
    assert.equal(childEnv?.DSH_CC_RESUME_SESSION, undefined)
    assert.equal(childEnv?.TOCKTEAM_TUI_FULLSCREEN, '0')
    assert.equal(childEnv?.TOCKTEAM_TUI_LANG, 'en')
    assert.equal(childEnv?.TOCKTEAM_TUI_VERSION, '1.2.3')
    assert.equal(childEnv?.TOCKTEAM_TUI_CONFIG_HOME, join(dataRoot, 'tui'))
    assert.equal(childEnv?.TOCKTEAM_TUI_TITLE, 'TockTeam TUI')

    const manifest = JSON.parse(readFileSync(
      join(dataRoot, 'profiles', TUI_PROFILE, 'package.json'),
      'utf8',
    ))
    assert.equal(manifest.name, 'dsh-profile-tui')
    assert.deepEqual(manifest.dsh.profile.bundles, TUI_BUNDLES)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('TUI profile retires the legacy renderer bundle without removing user bundles', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-tui-profile-'))
  const profile = join(root, 'profiles', TUI_PROFILE)
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: {
      'dsh-cc-tui': '0.4.1',
      '@example/user-bundle': '1.0.0',
    },
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', 'dsh-cc-tui', '@tockteam/tui', '@example/user-bundle'],
      },
    },
  }))
  try {
    ensureTuiProfile(root)
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, [...TUI_BUNDLES, '@example/user-bundle'])
    assert.deepEqual(manifest.dependencies, { '@example/user-bundle': '1.0.0' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('TUI bundle mounts its surface and skins before the upstream renderer', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const patch = readFileSync(
    join(root, 'plugins', 'tui', 'cordis.patch.yml'),
    'utf8',
  ).replace(/\r\n?/g, '\n')
  assert.match(patch, /- id: cc-tui\n  disabled: true/)
  assert.match(patch, /- id: dsh-tui\n  disabled: true/)
  assert.match(patch, /process\.env\.DSH_TUI_RESUME_SESSION \?\? process\.env\.TOCKTEAM_TUI_SESSION_ID/)
  const surface = patch.indexOf("name: '@tockteam/tui'")
  const skins = patch.indexOf("name: '@tockteam/skins'")
  const renderer = patch.indexOf("name: '@deepseek-harness-tui/dsh-tui'")
  assert.ok(surface >= 0 && surface < skins && skins < renderer)
  assert.equal((TUI_BUNDLES as readonly string[]).includes('tockbot-note-vault'), false)
  assert.equal((TUI_BUNDLES as readonly string[]).includes('tockbot-note-runtime'), false)
})

test('pinned TUI hardens terminal output, plugin authority, and private data files', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'upstream', 'dsh-TUI', 'src')
  const osc = readFileSync(join(root, 'ink', 'termio', 'osc.ts'), 'utf8')
  assert.match(osc, /OSC_PAYLOAD_UNSAFE/u)
  assert.match(osc, /parts\.map\(sanitizeOscPart\)/u)
  const providerGuard = readFileSync(join(root, 'dsh-adapter', 'providerGuard.ts'), 'utf8')
  assert.match(providerGuard, /verified && whitelisted/u)
  assert.match(providerGuard, /alert-unverified/u)
  const credentialGuard = readFileSync(join(root, 'dsh-adapter', 'credentialRefGuard.ts'), 'utf8')
  assert.match(credentialGuard, /DEEPSEEK_API_KEY/u)
  assert.match(credentialGuard, /DSH_/u)
  const history = readFileSync(join(root, 'history.ts'), 'utf8')
  assert.match(history, /mode: 0o700/u)
  assert.match(history, /mode: 0o600/u)
})

test('TUI upstream adapter removes legacy terminal branding and scopes storage', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-tui-adapter-'))
  const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
  const lib = join(root, 'lib', 'types')
  cpSync(join(repository, 'upstream', 'dsh-TUI', 'lib', 'types'), lib, {
    recursive: true,
  })
  cpSync(
    join(repository, 'upstream', 'dsh-TUI', 'presets'),
    join(root, 'presets'),
    { recursive: true },
  )
  try {
    adaptTuiRendererPackage(root)
    assert.match(readFileSync(join(lib, 'components', 'LogoV2.js'), 'utf8'), /TockTeam TUI/)
    assert.match(readFileSync(join(lib, 'components', 'LogoV2.js'), 'utf8'), /TOCKTEAM_TUI_VERSION/)
    assert.match(readFileSync(join(lib, 'screens', 'Chat.js'), 'utf8'), /TockTeam TUI/)
    assert.match(readFileSync(join(lib, 'customTheme.js'), 'utf8'), /DATA_DIR/)
    assert.match(readFileSync(join(lib, 'themePrefs.js'), 'utf8'), /DATA_DIR/)
    const commands = readFileSync(join(lib, 'commands.js'), 'utf8')
    assert.match(commands, /Exit TockTeam TUI/)
    assert.match(commands, /Restart TockTeam TUI and resume this session/)
    assert.match(commands, /Use TockTeam updates for new releases/)
    assert.doesNotMatch(commands, /description: .*dsh-tui/)
    const plugin = readFileSync(join(lib, 'dsh-adapter', 'plugin.js'), 'utf8')
    assert.match(plugin, /process\.env\.TOCKTEAM_TUI !== '1'/)
    assert.match(plugin, /onUpdate: process\.env\.TOCKTEAM_TUI === '1' \? undefined/)
    assert.match(plugin, /tockteam tui --resume/)
    assert.doesNotMatch(plugin, /dsh-tui --resume/)
    const tips = readFileSync(join(lib, 'tips.js'), 'utf8')
    assert.match(tips, /~\/\.tockteam\/tui\/themes/)
    assert.doesNotMatch(tips, /~\/\.dsh-tui/)
    const messages = readFileSync(join(lib, 'i18n.js'), 'utf8')
    assert.match(messages, /TockTeam TUI session export/)
    assert.match(messages, /Updates are managed by TockTeam/)
    assert.match(messages, /Restarting TockTeam TUI/)
    assert.match(messages, /Launch      tockteam tui/)
    assert.doesNotMatch(messages, /dsh plugin --profile|Restarting dsh-tui|~\/\.dsh-tui|~\/\.dsh\/profiles\/dsh-tui/)
    const channel = readFileSync(join(lib, 'dsh-adapter', 'channel.js'), 'utf8')
    assert.match(channel, /tockteam-tui-export-/)
    assert.doesNotMatch(channel, /dsh-tui-export-|join\(userHome, '\.dsh-tui\//)
    const chat = readFileSync(join(lib, 'screens', 'Chat.js'), 'utf8')
    assert.match(chat, /TOCKTEAM_TUI_TITLE/)
    const themeProvider = readFileSync(
      join(lib, 'components', 'design-system', 'ThemeProvider.js'),
      'utf8',
    )
    assert.doesNotMatch(themeProvider, /\[dsh-tui\]|~\/\.dsh-tui/)
    const customTheme = readFileSync(join(lib, 'customTheme.js'), 'utf8')
    assert.doesNotMatch(customTheme, /\[dsh-tui\]|~\/\.dsh-tui/)
    const paths = readFileSync(join(lib, 'utils', 'paths.js'), 'utf8')
    assert.match(paths, /TOCKTEAM_TUI_CONFIG_HOME/)
    assert.match(paths, /join\(homeDir\(\), '\.tockteam', 'tui'\)/)
    assert.match(paths, /LEGACY_DATA_DIR = DATA_DIR/)
    for (const name of [
      'activityPrefs.js',
      'effortPrefs.js',
      'history.js',
      'modelPrefs.js',
      'presetPrefs.js',
      'sessionHistory.js',
      'themePrefs.js',
    ]) {
      const preferences = readFileSync(join(lib, name), 'utf8')
      assert.match(preferences, /DATA_DIR/)
    }
    assert.doesNotThrow(() => { adaptTuiRendererPackage(root) })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('adapted Liangshen presets consume a real DSH 0.1.2 Session snapshot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-tui-liangshen-'))
  const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
  cpSync(join(repository, 'upstream', 'dsh-TUI', 'lib'), join(root, 'lib'), { recursive: true })
  cpSync(join(repository, 'upstream', 'dsh-TUI', 'presets'), join(root, 'presets'), { recursive: true })
  try {
    adaptTuiRendererPackage(root)
    const dshSession = await import(pathToFileURL(join(
      repository,
      'upstream',
      'dsh-TUI',
      'node_modules',
      '@deepseek-ai',
      'dsh-session',
      'lib',
      'index.js',
    )).href)
    const promotionModule = await import(pathToFileURL(
      join(root, 'presets', 'liangshen', 'compaction-epoch.mjs'),
    ).href)
    const session = dshSession.Session.create('tockteam-liangshen-smoke')
    assert.deepEqual(
      promotionModule.createEpochPromotion(['tool/call']).status({ session }),
      { boundary: -1, promoted: false },
    )
    const instructionHint = readFileSync(
      join(root, 'presets', 'liangshen', 'instruction-hint.mjs'),
      'utf8',
    )
    assert.match(instructionHint, /session\.snapshotEvents\(\)\.some/u)
    assert.doesNotMatch(instructionHint, /session\.events/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('TUI refuses a non-interactive stream before touching the runtime', async () => {
  const stdout = output(false)
  const stderr = output(false)
  assert.equal(await main(
    [],
    {},
    stdout.stream,
    stderr.stream,
    undefined,
    { isTTY: false } as Readable & { isTTY?: boolean },
  ), 2)
  assert.match(stderr.text(), /requires an interactive terminal/)
})

test('TUI help is available without a terminal or staged runtime', async () => {
  const stdout = output(false)
  assert.equal(await main(['--help'], {}, stdout.stream), 0)
  assert.match(stdout.text(), /tockteam tui/)
  assert.match(stdout.text(), /--resume/)
})
