import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
  version?: string
  exports?: Record<string, unknown>
  dsh?: {
    bundle?: { patch?: string }
    client?: { platform?: string; inject?: string[]; immediately?: boolean }
  }
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

test('publishes one independently installable Host and browser-client bundle', async () => {
  assert.equal(packageJson.version, '0.1.7')
  assert.deepEqual(packageJson.exports?.['./client'], {
    types: './dist/client.d.ts',
    node: './dist/client-api.js',
    browser: './dist/client.js',
    default: './dist/client.js',
  })
  assert.deepEqual(packageJson.dsh?.bundle, { patch: './cordis.patch.yml' })
  assert.equal(packageJson.dsh?.client?.platform, 'web')
  assert.equal(packageJson.dsh?.client?.immediately, true)
  assert.deepEqual(packageJson.dsh?.client?.inject, [
    '@deepseek-ai/dsh-api-remotes',
    '@tockteam/desktop',
  ])
  assert.equal(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), [
    '- insert:',
    '    - id: tocktutor-workbench',
    "      name: '@tockteam/tocktutor-workbench'",
    '',
  ].join('\n'))
})

test('binds the shared Desktop and runtime workspace identities without local artifact paths', async () => {
  const lockfile = await readFile(new URL('../../../pnpm-lock.yaml', import.meta.url), 'utf8')
  assert.equal(packageJson.peerDependencies?.['tockbot-note-runtime'], '0.1.2')
  assert.equal(packageJson.peerDependencies?.['@tockteam/desktop'], '>=0.1.6 <0.2.0')
  assert.equal(packageJson.peerDependencies?.['react-dom'], '^18.2.0')
  assert.equal(packageJson.devDependencies?.['tockbot-note-runtime'], 'workspace:0.1.2')
  assert.equal(packageJson.devDependencies?.['@tockteam/desktop'], 'workspace:*')
  assert.match(lockfile, /packages\/tockteam-tocktutor-workbench:/u)
  assert.match(lockfile, /specifier: workspace:0\.1\.2/u)
  assert.match(lockfile, /version: link:\.\.\/tockbot-note-runtime/u)
  assert.doesNotMatch(lockfile, /tockteam-desktop-.*\.tgz|tockbot-note-runtime-.*\.tgz|\/Users\//u)
  assert.equal(JSON.stringify(packageJson).includes('file:'), false)
  assert.equal(JSON.stringify(packageJson).includes('link:'), false)
})

async function installPeerFixture(desktopVersion: string): Promise<boolean> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tocktutor-peer-')))
  const desktopRoot = join(root, 'desktop')
  const workbenchRoot = join(root, 'workbench')
  const consumerRoot = join(root, 'consumer')
  try {
    await Promise.all([
      mkdir(desktopRoot),
      mkdir(workbenchRoot),
      mkdir(consumerRoot),
    ])
    await Promise.all([
      writeFile(join(desktopRoot, 'package.json'), JSON.stringify({
        name: '@tockteam/desktop',
        version: desktopVersion,
      }) + '\n'),
      writeFile(join(workbenchRoot, 'package.json'), JSON.stringify({
        name: '@tockteam/tocktutor-workbench',
        version: packageJson.version,
        peerDependencies: {
          '@tockteam/desktop': packageJson.peerDependencies?.['@tockteam/desktop'],
        },
      }) + '\n'),
      writeFile(join(consumerRoot, 'package.json'), JSON.stringify({
        name: 'tocktutor-peer-consumer',
        private: true,
        dependencies: {
          '@tockteam/desktop': `file:${desktopRoot}`,
          '@tockteam/tocktutor-workbench': `file:${workbenchRoot}`,
        },
      }) + '\n'),
      writeFile(join(consumerRoot, 'pnpm-workspace.yaml'), [
        'packages:',
        '  - .',
        '',
        'autoInstallPeers: false',
        '',
      ].join('\n')),
    ])
    try {
      await execFileAsync('pnpm', [
        'install',
        '--lockfile-only',
        '--prefer-offline',
        '--ignore-scripts',
        '--strict-peer-dependencies',
        '--no-frozen-lockfile',
      ], { cwd: consumerRoot, env: process.env })
      return true
    } catch {
      return false
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('allows compatible Desktop patches but rejects the next minor line', async () => {
  assert.equal(await installPeerFixture('0.1.7'), true)
  assert.equal(await installPeerFixture('0.2.0'), false)
})

test('keeps the browser route free of Host-only authority imports', async () => {
  const sources = await Promise.all([
    readFile(new URL('../src/client.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/client-api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/native-actions.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/review-panel.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/route.tsx', import.meta.url), 'utf8'),
  ])
  for (const source of sources) {
    assert.doesNotMatch(source, /node:|electron|(?:^|[/'" ])fs(?:['"/])|child_process|window\.electronAPI/u)
    assert.doesNotMatch(source, /from ['"]tockbot-note-runtime/u)
  }
})
