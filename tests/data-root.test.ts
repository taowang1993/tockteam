import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import {
  desktopLegacyDataRoot,
  migrateLegacyDesktopState,
} from '../src/data-root.ts'

const COMPLETE = { complete: true, migrated: true }
const NONE = { complete: true, migrated: false }
const INCOMPLETE = { complete: false, migrated: false }

function write(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function migrationInput(root: string, packaged = true) {
  return {
    appDataRoot: join(root, 'app-data'),
    destinationRoot: join(
      root,
      packaged ? 'TockTeam-Desktop' : 'TockTeam-Desktop-Dev',
    ),
    isPackaged: packaged,
  }
}

test('desktop migration keeps packaged and development legacy roots separate', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-desktop-migrate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const appDataRoot = join(root, 'app-data')
  assert.equal(
    desktopLegacyDataRoot(appDataRoot, true),
    join(appDataRoot, 'Oh-DSH-Desktop'),
  )
  assert.equal(
    desktopLegacyDataRoot(appDataRoot, false),
    join(appDataRoot, 'Oh-DSH-Desktop-Dev'),
  )
  write(
    join(appDataRoot, 'Oh-DSH-Desktop', 'dsh', 'sessions', 'packaged.json'),
    'packaged',
  )
  write(
    join(
      appDataRoot,
      'Oh-DSH-Desktop-Dev',
      'dsh',
      'sessions',
      'development.json',
    ),
    'development',
  )

  assert.deepEqual(
    migrateLegacyDesktopState(migrationInput(root, true)),
    COMPLETE,
  )
  assert.deepEqual(
    migrateLegacyDesktopState(migrationInput(root, false)),
    COMPLETE,
  )
  assert.equal(
    readFileSync(
      join(root, 'TockTeam-Desktop', 'dsh', 'sessions', 'packaged.json'),
      'utf8',
    ),
    'packaged',
  )
  assert.equal(
    readFileSync(
      join(root, 'TockTeam-Desktop-Dev', 'dsh', 'sessions', 'development.json'),
      'utf8',
    ),
    'development',
  )
  assert.equal(
    existsSync(
      join(root, 'TockTeam-Desktop', 'dsh', 'sessions', 'development.json'),
    ),
    false,
  )
  assert.equal(
    existsSync(
      join(root, 'TockTeam-Desktop-Dev', 'dsh', 'sessions', 'packaged.json'),
    ),
    false,
  )
})

test('legacy desktop state copies missing entries, keeps destination authority, and is retry-safe', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-desktop-migrate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const input = migrationInput(root)
  const legacyRoot = desktopLegacyDataRoot(input.appDataRoot, true)
  write(join(legacyRoot, 'dsh', 'sessions', 'legacy.json'), 'legacy')
  write(join(legacyRoot, 'dsh', 'sessions', 'shared.json'), 'legacy copy')
  write(join(legacyRoot, 'launcher', 'settings.json'), 'legacy settings')
  write(
    join(input.destinationRoot, 'dsh', 'sessions', 'shared.json'),
    'current',
  )

  assert.deepEqual(migrateLegacyDesktopState(input), COMPLETE)
  assert.equal(
    readFileSync(
      join(input.destinationRoot, 'dsh', 'sessions', 'legacy.json'),
      'utf8',
    ),
    'legacy',
  )
  assert.equal(
    readFileSync(
      join(input.destinationRoot, 'dsh', 'sessions', 'shared.json'),
      'utf8',
    ),
    'current',
  )
  assert.equal(
    readFileSync(
      join(input.destinationRoot, 'launcher', 'settings.json'),
      'utf8',
    ),
    'legacy settings',
  )
  assert.equal(
    existsSync(join(legacyRoot, 'dsh', 'sessions', 'legacy.json')),
    true,
  )
  assert.equal(
    existsSync(
      join(input.destinationRoot, '.migrations', 'desktop-state-v1.complete'),
    ),
    true,
  )

  write(join(legacyRoot, 'dsh', 'sessions', 'late.json'), 'late')
  assert.deepEqual(migrateLegacyDesktopState(input), NONE)
  assert.equal(
    existsSync(join(input.destinationRoot, 'dsh', 'sessions', 'late.json')),
    false,
  )
})

test('explicit user data roots skip default legacy import', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-desktop-migrate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const input = { ...migrationInput(root), skipDefaultImport: true }
  write(
    join(
      desktopLegacyDataRoot(input.appDataRoot, true),
      'dsh',
      'sessions',
      'legacy.json',
    ),
    'legacy',
  )

  assert.deepEqual(migrateLegacyDesktopState(input), NONE)
  assert.equal(existsSync(input.destinationRoot), false)
})

test('broken links fail closed without writing a completion marker', (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows link creation requires platform-specific privileges')
    return
  }

  const root = mkdtempSync(join(tmpdir(), 'tockteam-desktop-migrate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const input = migrationInput(root)
  const broken = join(
    desktopLegacyDataRoot(input.appDataRoot, true),
    'dsh',
    'sessions',
    'broken',
  )
  mkdirSync(dirname(broken), { recursive: true })
  symlinkSync('missing-session', broken)

  assert.deepEqual(migrateLegacyDesktopState(input), INCOMPLETE)
  assert.equal(
    existsSync(
      join(input.destinationRoot, '.migrations', 'desktop-state-v1.complete'),
    ),
    false,
  )

  write(
    join(
      desktopLegacyDataRoot(input.appDataRoot, true),
      'dsh',
      'sessions',
      'valid.json',
    ),
    'valid',
  )
  rmSync(broken)
  assert.deepEqual(migrateLegacyDesktopState(input), COMPLETE)
  assert.equal(
    readFileSync(
      join(input.destinationRoot, 'dsh', 'sessions', 'valid.json'),
      'utf8',
    ),
    'valid',
  )
})

test('valid directory links remain usable after migration', (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows junction layout differs')
    return
  }

  const root = mkdtempSync(join(tmpdir(), 'tockteam-desktop-migrate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const input = migrationInput(root)
  const legacyRoot = desktopLegacyDataRoot(input.appDataRoot, true)
  const linkedTarget = join(root, 'linked-sessions')
  write(join(linkedTarget, 'session.json'), 'linked')
  const link = join(legacyRoot, 'dsh', 'sessions', 'linked')
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(relative(dirname(link), linkedTarget), link, 'dir')

  assert.deepEqual(migrateLegacyDesktopState(input), COMPLETE)
  const migratedLink = join(input.destinationRoot, 'dsh', 'sessions', 'linked')
  assert.equal(lstatSync(migratedLink).isSymbolicLink(), true)
  assert.equal(
    readFileSync(join(migratedLink, 'session.json'), 'utf8'),
    'linked',
  )
  assert.equal(
    readlinkSync(migratedLink),
    relative(dirname(migratedLink), linkedTarget),
  )
})

test('overlapping source and destination roots fail closed', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-desktop-migrate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const appDataRoot = root
  const legacyRoot = desktopLegacyDataRoot(appDataRoot, true)
  const destinationRoot = join(legacyRoot, 'new-destination')
  write(join(legacyRoot, 'dsh', 'sessions', 'legacy.json'), 'legacy')

  assert.deepEqual(
    migrateLegacyDesktopState({
      appDataRoot,
      destinationRoot,
      isPackaged: true,
    }),
    INCOMPLETE,
  )
  assert.equal(existsSync(join(destinationRoot, 'dsh')), false)
})

test('destination aliases into the source fail closed before creating a recursive copy', t => {
  if (process.platform === 'win32') {
    t.skip('Windows junction layout differs')
    return
  }

  const root = mkdtempSync(join(tmpdir(), 'tockteam-desktop-migrate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const appDataRoot = root
  const legacyRoot = desktopLegacyDataRoot(appDataRoot, true)
  const destinationAlias = join(root, 'destination-alias')
  write(join(legacyRoot, 'dsh', 'sessions', 'legacy.json'), 'legacy')
  symlinkSync(legacyRoot, destinationAlias, 'dir')

  assert.deepEqual(
    migrateLegacyDesktopState({
      appDataRoot,
      destinationRoot: join(destinationAlias, 'new-destination'),
      isPackaged: true,
    }),
    INCOMPLETE,
  )
  assert.equal(existsSync(join(legacyRoot, 'new-destination')), false)
})

test('a rebased link with a destination conflict cannot mark migration complete', t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-link-conflict-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const input = migrationInput(root)
  const legacy = desktopLegacyDataRoot(input.appDataRoot, true)
  write(join(legacy, 'target', 'session.json'), 'legacy')
  symlinkSync(join(legacy, 'target'), join(legacy, 'link'), 'junction')
  write(join(input.destinationRoot, 'target'), 'current file wins')
  assert.deepEqual(migrateLegacyDesktopState(input), INCOMPLETE)
  assert.equal(existsSync(join(input.destinationRoot, '.migrations', 'desktop-state-v1.complete')), false)
  assert.equal(readFileSync(join(input.destinationRoot, 'target'), 'utf8'), 'current file wins')
})

test('Desktop bootstrap migrates before picker, runtime, or persistence writes', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  const bootstrap = main.indexOf('async function bootstrap(): Promise<void>')
  const migration = main.indexOf('migrateLegacyDesktopState({', bootstrap)
  assert.ok(bootstrap >= 0)
  assert.ok(migration > bootstrap)
  assert.ok(migration < main.indexOf('  initializeDesktopPicker()', bootstrap))
  assert.ok(migration < main.indexOf('  await app.whenReady()', bootstrap))
  assert.match(
    main.slice(bootstrap, migration),
    /!app\.commandLine\.hasSwitch\('user-data-dir'\)/u,
  )
})
