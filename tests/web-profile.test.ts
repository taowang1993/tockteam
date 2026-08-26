import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  DESKTOP_PROFILE,
  ensureWebProfile,
  WEB_BUNDLES,
  WEB_PROFILE,
} from '../src/profile.ts'
import {
  DshRuntimeSupervisor,
  type DshRuntimeOptions,
} from '../src/runtime.ts'
import {
  DEFAULT_DATA_DIR_NAME,
  DEFAULT_WEB_HOST,
  DEFAULT_WEB_PORT,
  main,
  parseLaunchArgs,
  resolveWebVersion,
  UsageError,
} from '../src/web.ts'

test('Web shutdown shares one in-flight runtime stop across signals', () => {
  const source = readFileSync(new URL('../src/web.ts', import.meta.url), 'utf8')
  assert.match(source, /stopping \?\?= runtime\.stop\(\)/u)
  assert.match(source, /TockTeam Web shutdown failed/u)
  assert.doesNotMatch(source, /if \(stopping\) return/u)
})

test('web profile initializes required bundles and preserves user plugins', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-web-profile-'))
  try {
    const first = ensureWebProfile(join(root, 'home'))
    const manifestPath = join(first.profileDir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.name, 'dsh-profile-web')
    assert.deepEqual(manifest.dsh.profile.bundles, WEB_BUNDLES)
    assert.equal(manifest.dsh.profile.bundles.includes('@tockteam/desktop'), false)

    manifest.dependencies['example-plugin'] = '1.0.0'
    manifest.dsh.profile.bundles = ['example-plugin', '@tockteam/web']
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
    writeFileSync(join(first.profileDir, 'cordis.patch.yml'), '- id: custom\n  disabled: true\n')

    const second = ensureWebProfile(join(root, 'home'))
    const upgraded = JSON.parse(readFileSync(join(second.profileDir, 'package.json'), 'utf8'))
    assert.deepEqual(upgraded.dsh.profile.bundles, [...WEB_BUNDLES, 'example-plugin'])
    assert.equal(upgraded.dependencies['example-plugin'], '1.0.0')
    assert.match(readFileSync(join(second.profileDir, 'cordis.patch.yml'), 'utf8'), /custom/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('web profile is a separate surface from the desktop profile', () => {
  assert.notEqual(WEB_PROFILE, DESKTOP_PROFILE)
  assert.deepEqual(WEB_BUNDLES, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@tockteam/web'])
  assert.equal(WEB_BUNDLES.includes('@tockteam/desktop'), false)
  assert.equal(WEB_BUNDLES.includes('tockbot-note-vault'), false)
  assert.equal(WEB_BUNDLES.includes('tockbot-note-runtime'), false)
})

test('web client uses the TockTeam Web surface name', () => {
  const client = readFileSync(new URL('../web/src/client.ts', import.meta.url), 'utf8')
  assert.match(client, /if \(document\.title !== 'TockTeam Web'\) document\.title = 'TockTeam Web'/)
  assert.match(client, /observer\.observe\(document\.head/)
  assert.match(client, /observer\.disconnect\(\)/)
  assert.match(client, /element\.textContent = 'TockTeam Web'/)
  assert.doesNotMatch(client, /TockTeam-Web/)
})

test('packaged web distribution exposes the unified tockteam command', () => {
  const build = readFileSync(new URL('../scripts/build-web.mjs', import.meta.url), 'utf8')
  assert.match(build, /join\(packageDir, 'bin', 'tockteam'\)/)
  assert.match(build, /join\(packageDir, 'lib', 'tockteam', 'cli\.js'\)/)
  assert.match(build, /export TOCKTEAM_SURFACES=web/)
  assert.match(build, /SET "TOCKTEAM_SURFACES=web"/)
  assert.match(build, /exec "\$ROOT\/bin\/tockteam" web "\$@"/)
})

test('full and web-only distributions expose the same release version', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-web-version-'))
  try {
    writeFileSync(join(root, 'package.json'), '{"version":"1.2.3"}\n')
    assert.equal(resolveWebVersion(root), '1.2.3')
    rmSync(join(root, 'package.json'))

    mkdirSync(join(root, 'lib', 'tockteam'), { recursive: true })
    writeFileSync(
      join(root, 'lib', 'tockteam', 'package.json'),
      '{"version":"4.5.6"}\n',
    )
    assert.equal(resolveWebVersion(root), '4.5.6')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('full distribution keeps app and release manifests distinct', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const releaseManifest = manifest.build.extraResources.find(
    (resource: { to?: string }) => resource.to === 'lib/tockteam/package.json',
  )
  assert.equal(releaseManifest.from, 'dist/release-package.json')
})

test('web bundle patch mounts the web-capable TockTeam plugins', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const patch = readFileSync(join(root, 'web', 'cordis.patch.yml'), 'utf8')
  for (const row of [
    'tockteam-web',
    'tockteam-better-sidebar-runtime',
    'tockteam-skins',
    'tockteam-pinned-summary',
    'tockteam-sidebar',
    'tockteam-panel-controls',
  ]) {
    assert.match(patch, new RegExp(`- id: ${row}`))
  }
  // Electron-bound surfaces stay out of the web composition.
  for (const desktopRow of ['tockteam-desktop', 'tockteam-plugin-marketplace']) {
    assert.doesNotMatch(patch, new RegExp(`- id: ${desktopRow}\\b`))
  }
})

test('web launcher defaults match the dsh-web-app bundle surface', () => {
  const options = parseLaunchArgs([], {}, false, `/home/user/${DEFAULT_DATA_DIR_NAME}`)
  assert.equal(options.host, DEFAULT_WEB_HOST)
  assert.equal(options.port, DEFAULT_WEB_PORT)
  assert.equal(options.open, false)
  assert.equal(options.dataRoot, `/home/user/${DEFAULT_DATA_DIR_NAME}`)
  assert.deepEqual(options.trustedHosts, [])
  assert.equal(options.help, false)
})

test('web launcher honors environment and flag precedence', () => {
  const base = parseLaunchArgs([], {
    TOCKTEAM_WEB_HOST: '0.0.0.0',
    TOCKTEAM_WEB_PORT: '9090',
    TOCKTEAM_WEB_HOME: '/data/web',
    TOCKTEAM_WEB_OPEN: '0',
  }, true, '/default')
  assert.equal(base.host, '0.0.0.0')
  assert.equal(base.port, 9090)
  assert.equal(base.dataRoot, '/data/web')
  assert.equal(base.open, false)

  const flags = parseLaunchArgs([
    '--host', '127.0.0.1',
    '--port=8080',
    '--data', '/flags',
    '--open',
    '--trusted-host', 'lab.internal:3080',
    '--trusted-host=10.0.0.9',
  ], {
    TOCKTEAM_WEB_HOST: '0.0.0.0',
    TOCKTEAM_WEB_PORT: '9090',
  }, false, '/default')
  assert.equal(flags.host, '127.0.0.1')
  assert.equal(flags.port, 8080)
  assert.equal(flags.dataRoot, '/flags')
  assert.equal(flags.open, true)
  assert.deepEqual(flags.trustedHosts, ['lab.internal:3080', '10.0.0.9'])

  const noOpen = parseLaunchArgs(['--no-open'], { TOCKTEAM_WEB_OPEN: '1' }, true, '/default')
  assert.equal(noOpen.open, false)
})

test('web launcher rejects invalid arguments', () => {
  assert.throws(() => parseLaunchArgs(['--port', 'not-a-port'], {}, false, '/d'), UsageError)
  assert.throws(() => parseLaunchArgs(['--port', '70000'], {}, false, '/d'), UsageError)
  assert.throws(() => parseLaunchArgs(['--host'], {}, false, '/d'), UsageError)
  assert.throws(() => parseLaunchArgs(['--unknown'], {}, false, '/d'), UsageError)
  assert.throws(() => parseLaunchArgs([], { TOCKTEAM_WEB_PORT: 'abc' }, false, '/d'), UsageError)
})

test('web launcher requires trusted hosts for non-loopback exposure', async () => {
  await assert.rejects(
    main(['--host', '0.0.0.0'], {}, { isTTY: false } as NodeJS.WriteStream),
    UsageError,
  )
})

test('web launcher --help short-circuits', () => {
  const options = parseLaunchArgs(['--help'], {}, false, '/d')
  assert.equal(options.help, true)
})

test('web launcher resolves a relative data root before spawning the runtime', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsh-web-main-'))
  const dataRoot = realpathSync(temp)
  const packaged = join(dataRoot, 'package')
  const nodeBinary = process.platform === 'win32'
    ? join(packaged, 'node-runtime', 'node.exe')
    : join(packaged, 'node-runtime', 'bin', 'node')
  mkdirSync(dirname(nodeBinary), { recursive: true })
  mkdirSync(join(packaged, 'dsh-runtime', 'lib'), { recursive: true })
  writeFileSync(nodeBinary, '')
  writeFileSync(join(packaged, 'dsh-runtime', 'lib', 'bin.js'), '')

  class FailingRuntime extends DshRuntimeSupervisor {
    readonly plan: DshRuntimeOptions

    constructor(plan: DshRuntimeOptions) {
      super(plan)
      this.plan = plan
    }

    async start(): Promise<URL> {
      throw new Error('test runtime never becomes ready')
    }
  }

  const previous = process.cwd()
  let runtime: FailingRuntime | undefined
  process.chdir(dataRoot)
  try {
    const code = await main(
      ['--data', './state'],
      { TOCKTEAM_WEB_ROOT: packaged, PATH: process.env.PATH },
      { isTTY: false } as NodeJS.WriteStream,
      plan => {
        runtime = new FailingRuntime(plan)
        return runtime
      },
    )
    assert.equal(code, 1)
    assert.ok(runtime)
    assert.equal(runtime.plan.cwd, join(dataRoot, 'state'))
    assert.equal(runtime.plan.env.DSH_HOME, join(dataRoot, 'state', 'dsh'))
    assert.equal(runtime.plan.env.TOCKTEAM_WEB_DATA, join(dataRoot, 'state'))
  } finally {
    process.chdir(previous)
    rmSync(temp, { recursive: true, force: true })
  }
})
