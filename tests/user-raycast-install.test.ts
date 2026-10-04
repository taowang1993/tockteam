import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readFiles, UserRaycastInstall } from '../src/user-raycast-install.ts'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-install-'))
  const source = join(root, 'chosen')
  const data = join(root, 'data')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'color-picker', title: 'Color Picker', version: '1.2.3', license: 'MIT', repository: 'https://github.com/example/color-picker', commands: [{ name: 'favorite-colors', title: 'Favorite Colors', mode: 'view' }] }))
  const module = join(source, 'favorite-colors.js')
  const marker = join(root, 'executed')
  writeFileSync(module, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'bad')`)
  return { root, source, data, module, marker, store: new UserRaycastInstall(data), close: () => rmSync(root, { recursive: true, force: true }) }
}

test('chosen built command is inert until separately approved and enabled', () => {
  const f = fixture()
  try {
    const candidate = f.store.prepare(f.source)
    assert.equal(candidate.extensionId, 'color-picker')
    assert.equal(candidate.command, 'favorite-colors')
    assert.equal(candidate.version, '1.2.3')
    assert.equal(candidate.license, 'MIT')
    assert.equal(candidate.source, 'https://github.com/example/color-picker')
    assert.match(candidate.digest, /^[a-f0-9]{64}$/)
    assert.equal(existsSync(f.marker), false)
    assert.equal(f.store.status().installed, false)
    assert.throws(() => f.store.approve('0'.repeat(64)), /digest/)
    assert.equal(f.store.status().installed, false)
    const stagedModule = join(f.data, 'stage/favorite-colors.js')
    const original = readFileSync(stagedModule)
    writeFileSync(stagedModule, 'tampered after review')
    assert.throws(() => f.store.approve(candidate.digest), /digest/)
    writeFileSync(stagedModule, original)
    f.store.approve(candidate.digest)
    assert.equal(f.store.status().enabled, false)
    assert.equal(f.store.runtimeDir(), undefined)
    f.store.enable()
    assert.ok(f.store.runtimeDir()?.endsWith('current'))
    assert.equal(existsSync(f.marker), false, 'approval must not import or execute user code')
    f.store.disable()
    assert.equal(f.store.runtimeDir(), undefined)
  } finally { f.close() }
})

test('candidate mutation or links fail closed and a previous installation can be recovered', () => {
  const f = fixture()
  try {
    const first = f.store.prepare(f.source)
    writeFileSync(f.module, 'changed after staging')
    f.store.approve(first.digest)
    f.store.enable()
    assert.equal(readFileSync(join(f.store.runtimeDir()!, 'favorite-colors.js'), 'utf8').includes('changed'), false)
    const next = f.store.prepare(f.source)
    assert.notEqual(next.digest, first.digest)
    f.store.approve(next.digest)
    assert.equal(f.store.status().hasPrevious, true)
    f.store.recoverPrevious()
    assert.equal(f.store.status().digest, first.digest)
    f.store.remove()
    assert.equal(f.store.status().installed, false)
    assert.equal(existsSync(f.marker), false)
    symlinkSync(f.module, join(f.source, 'link.js'))
    assert.throws(() => f.store.prepare(f.source), /link|regular/)
    assert.equal(f.store.status().installed, false)
  } finally { f.close() }
})

test('a selected menu-bar command stays inert until activation and preserves private state across rollback', () => {
  const f = fixture()
  try {
    writeFileSync(join(f.source, 'package.json'), JSON.stringify({ name: 'color-picker', title: 'Color Picker', license: 'MIT', commands: [{ name: 'menu-bar', mode: 'menu-bar' }] }))
    writeFileSync(join(f.source, 'menu-bar.js'), readFileSync(f.module))
    writeFileSync(join(f.source, 'icon.png'), readFileSync(resolve('assets/icon.png')))
    const first = f.store.prepare(f.source, 'menu-bar')
    assert.equal(first.mode, 'menu-bar')
    f.store.approve(first.digest)
    assert.equal(f.store.status().enabled, false)
    assert.equal(f.store.runtimeDir(), undefined)
    f.store.enable()
    assert.equal(f.store.status().mode, 'menu-bar')
    const state = f.store.statePath('color-picker')
    writeFileSync(state, '{"history":"saved"}')
    assert.equal(f.store.snapshotTo(join(f.root, 'snapshot')).mode, 'menu-bar')
    assert.equal(existsSync(f.marker), false)
    writeFileSync(join(f.source, 'menu-bar.js'), 'updated but not executed')
    const second = f.store.prepare(f.source, 'menu-bar')
    f.store.approve(second.digest)
    assert.equal(f.store.status().hasPrevious, true)
    assert.equal(f.store.status().enabled, false)
    f.store.recoverPrevious()
    assert.equal(f.store.status().mode, 'menu-bar')
    assert.equal(f.store.status().enabled, false)
    assert.equal(readFileSync(state, 'utf8'), '{"history":"saved"}')
    assert.equal(existsSync(f.marker), false)
    rmSync(join(f.source, 'icon.png'))
    assert.throws(() => f.store.prepare(f.source, 'menu-bar'), /icon/i)
    assert.equal(f.store.status().digest, first.digest)
  } finally { f.close() }
})

test('an interrupted or tampered current install is not discarded by a later update', () => {
  const f = fixture()
  try {
    const first = f.store.prepare(f.source)
    f.store.approve(first.digest)
    writeFileSync(join(f.data, 'current/favorite-colors.js'), 'user data, not an admitted candidate')
    writeFileSync(f.module, 'new candidate')
    const next = f.store.prepare(f.source)
    assert.throws(() => f.store.approve(next.digest), /recover|invalid/i)
    assert.equal(readFileSync(join(f.data, 'current/favorite-colors.js'), 'utf8'), 'user data, not an admitted candidate')
  } finally { f.close() }
})

for (const published of [false, true]) {
  test(`an interrupted update ${published ? 'after' : 'before'} publication preserves the approved previous install`, () => {
    const f = fixture()
    try {
      const first = f.store.prepare(f.source)
      f.store.approve(first.digest)
      f.store.enable()
      const approvedBytes = readFileSync(join(f.data, 'current/favorite-colors.js'))
      writeFileSync(f.module, 'interrupted version')
      f.store.prepare(f.source)
      // Crash points in approve(): current moved aside, then optionally stage published,
      // while trust.json still authorizes the old version.
      renameSync(join(f.data, 'current'), join(f.data, 'previous'))
      if (published) renameSync(join(f.data, 'stage'), join(f.data, 'current'))
      const resumed = new UserRaycastInstall(f.data)
      writeFileSync(f.module, 'later version')
      const next = resumed.prepare(f.source)
      assert.throws(() => resumed.approve(next.digest), /recover|interrupted/i)
      assert.deepEqual(readFileSync(join(f.data, 'previous/favorite-colors.js')), approvedBytes)
      assert.equal(resumed.status().hasPrevious, true)
      assert.equal(resumed.runtimeDir(), undefined)
      resumed.recoverPrevious()
      assert.equal(resumed.status().digest, first.digest)
      assert.equal(resumed.status().enabled, false)
      resumed.approve(next.digest)
      assert.equal(resumed.status().hasPrevious, true)
      assert.equal(resumed.status().installed, true)
      assert.equal(resumed.status().enabled, false)
      resumed.recoverPrevious()
      assert.equal(resumed.status().digest, first.digest)
    } finally { f.close() }
  })
}

test('too many empty extension folders are rejected without replacing an installed or staged version', () => {
  const f = fixture()
  try {
    const first = f.store.prepare(f.source)
    f.store.approve(first.digest)
    f.store.enable()
    writeFileSync(f.module, 'pending reviewed version')
    const staged = f.store.prepare(f.source)
    for (let index = 0; index < 1200; index++) mkdirSync(join(f.source, `empty-${index}`))
    assert.throws(() => f.store.prepare(f.source), /entry|directory.*bound/i)
    assert.equal(f.store.status().digest, first.digest)
    assert.equal(f.store.status().enabled, true)
    assert.equal(f.store.status().candidate?.digest, staged.digest)
    f.store.approve(staged.digest)
    f.store.recoverPrevious()
    assert.equal(f.store.status().digest, first.digest)
  } finally { f.close() }
})

test('support data and its mode survive reopen, version changes, rollback and identity isolation', () => {
  const f = fixture()
  try {
    const first = f.store.prepare(f.source); f.store.approve(first.digest); f.store.enable()
    const state = f.store.statePath(first.extensionId), old = Buffer.from('{"legacy":"unchanged bytes"}'); writeFileSync(state, old)
    const support = join(realpathSync(f.data), 'state/color-picker.support'); mkdirSync(support, { mode: 0o750 })
    const saved = Buffer.from('Existing user-owned support data'); writeFileSync(join(support, 'saved.txt'), saved)
    const mode = lstatSync(support).mode, identity = lstatSync(support).ino
    const check = (store: UserRaycastInstall, digest: string): void => {
      const receipt = store.prepareSupportDirectory('color-picker', digest)
      assert.equal(receipt.path, support); assert.equal(lstatSync(support).ino, identity); assert.equal(lstatSync(support).mode, mode)
      assert.deepEqual(readFileSync(join(support, 'saved.txt')), saved); assert.deepEqual(readFileSync(state), old)
      receipt.discardIfEmpty(); assert.equal(existsSync(support), true)
    }
    check(f.store, first.digest); check(new UserRaycastInstall(f.data), first.digest)
    writeFileSync(f.module, 'Updated owned fixture, never imported'); const second = f.store.prepare(f.source)
    f.store.approve(second.digest); f.store.enable(); check(f.store, second.digest)
    f.store.recoverPrevious(); f.store.enable(); check(f.store, first.digest)
    const manifest = JSON.parse(readFileSync(join(f.source, 'package.json'), 'utf8')); manifest.name = 'other-identity'
    writeFileSync(join(f.source, 'package.json'), JSON.stringify(manifest)); const other = f.store.prepare(f.source)
    f.store.approve(other.digest); f.store.enable(); const isolated = f.store.prepareSupportDirectory(other.extensionId, other.digest)
    assert.notEqual(isolated.path, support); assert.equal(existsSync(join(isolated.path, 'saved.txt')), false)
    assert.deepEqual(readFileSync(join(support, 'saved.txt')), saved); assert.deepEqual(readFileSync(state), old)
    const outside = join(f.data, 'untouched-user-file'); writeFileSync(outside, 'Outside existing owned state cleanup')
    f.store.remove(); assert.equal(existsSync(support), false); assert.equal(existsSync(isolated.path), false)
    assert.equal(readFileSync(outside, 'utf8'), 'Outside existing owned state cleanup'); assert.equal(existsSync(f.marker), false)
  } finally { f.close() }
})

test('failed-start receipts remove only their own unchanged new empty directory', () => {
  const f = fixture()
  try {
    const selected = f.store.prepare(f.source); f.store.approve(selected.digest); f.store.enable()
    const create = () => f.store.prepareSupportDirectory(selected.extensionId, selected.digest)
    const empty = create(); empty.discardIfEmpty(); assert.equal(existsSync(empty.path), false)
    mkdirSync(empty.path, { mode: 0o750 }); const existing = create(), existingMode = lstatSync(existing.path).mode
    existing.discardIfEmpty(); assert.equal(existsSync(existing.path), true); assert.equal(lstatSync(existing.path).mode, existingMode)
    rmSync(existing.path, { recursive: true }); const populated = create(); writeFileSync(join(populated.path, 'new-user-data'), 'Do not discard')
    populated.discardIfEmpty(); assert.equal(readFileSync(join(populated.path, 'new-user-data'), 'utf8'), 'Do not discard')
    rmSync(populated.path, { recursive: true }); const replaced = create(), moved = `${replaced.path}.moved`
    renameSync(replaced.path, moved); mkdirSync(replaced.path, { mode: 0o750 }); const replacement = lstatSync(replaced.path).ino
    replaced.discardIfEmpty(); assert.equal(lstatSync(replaced.path).ino, replacement); assert.equal(existsSync(moved), true)
    rmSync(replaced.path, { recursive: true }); const foreign = join(f.root, 'foreign'); mkdirSync(foreign); symlinkSync(foreign, replaced.path)
    replaced.discardIfEmpty(); assert.equal(lstatSync(replaced.path).isSymbolicLink(), true); assert.equal(existsSync(foreign), true)
    rmSync(replaced.path); const parentReplaced = create(), movedState = join(f.data, 'state-moved')
    renameSync(join(f.data, 'state'), movedState); mkdirSync(join(f.data, 'state')); mkdirSync(parentReplaced.path)
    parentReplaced.discardIfEmpty(); assert.equal(existsSync(parentReplaced.path), true); assert.equal(existsSync(join(movedState, 'color-picker.support')), true)
    rmSync(parentReplaced.path, { recursive: true }); const rootReplaced = create(), movedRoot = `${f.data}-moved`
    renameSync(f.data, movedRoot); mkdirSync(f.data); mkdirSync(join(f.data, 'state')); mkdirSync(rootReplaced.path)
    rootReplaced.discardIfEmpty(); assert.equal(existsSync(rootReplaced.path), true); assert.equal(existsSync(join(movedRoot, 'state/color-picker.support')), true)
    assert.equal(existsSync(f.marker), false)
  } finally { f.close() }
})

test('failed-start cleanup preserves its empty support directory after an ancestor is replaced', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-support-ancestor-'))
  try {
    const source = join(root, 'source'), parent = join(root, 'parent'), data = join(parent, 'install'); mkdirSync(source); mkdirSync(parent)
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'ancestor-probe', title: 'Offline Ancestor Probe', commands: [{ name: 'probe', mode: 'view' }] }))
    writeFileSync(join(source, 'probe.js'), 'export default function Probe() { return null }')
    const store = new UserRaycastInstall(data), selected = store.prepare(source); store.approve(selected.digest); store.enable()
    const receipt = store.prepareSupportDirectory(selected.extensionId, selected.digest), paths = [data, join(data, 'state'), receipt.path]
    const identity = (path: string) => ({ dev: lstatSync(path).dev, ino: lstatSync(path).ino }), before = paths.map(identity), oldParent = identity(parent), moved = join(root, 'parent-moved')
    renameSync(parent, moved); mkdirSync(parent); renameSync(join(moved, 'install'), data)
    assert.notDeepEqual(identity(parent), oldParent); assert.deepEqual(paths.map(identity), before)
    receipt.discardIfEmpty(); assert.equal(existsSync(receipt.path), true, 'Changed ancestor identity makes ownership unprovable; preserve the empty directory')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('support admission rejects final, state and arbitrary ancestor collisions without touching foreign data', () => {
  const f = fixture()
  try {
    const selected = f.store.prepare(f.source); f.store.approve(selected.digest); f.store.enable()
    const state = join(f.data, 'state'), support = join(state, 'color-picker.support'), foreign = join(f.root, 'foreign'); mkdirSync(foreign); writeFileSync(join(foreign, 'kept'), 'Foreign data')
    f.store.statePath(selected.extensionId)
    for (const kind of ['file', 'link', 'dangling'] as const) {
      if (kind === 'file') writeFileSync(support, 'Keep this collision')
      else symlinkSync(kind === 'link' ? foreign : join(foreign, 'missing'), support)
      assert.throws(() => f.store.prepareSupportDirectory(selected.extensionId, selected.digest), /directory|link|EEXIST|ENOENT/i)
      if (kind === 'file') assert.equal(readFileSync(support, 'utf8'), 'Keep this collision')
      else assert.equal(lstatSync(support).isSymbolicLink(), true)
      assert.equal(readFileSync(join(foreign, 'kept'), 'utf8'), 'Foreign data'); assert.equal(existsSync(join(foreign, 'missing')), false)
      rmSync(support)
    }
    rmSync(state, { recursive: true })
    for (const kind of ['file', 'link', 'dangling'] as const) {
      if (kind === 'file') writeFileSync(state, 'Keep this state collision')
      else symlinkSync(kind === 'link' ? foreign : join(foreign, 'missing'), state)
      assert.throws(() => f.store.prepareSupportDirectory(selected.extensionId, selected.digest), /directory|link|EEXIST|ENOENT/i)
      if (kind === 'file') assert.equal(readFileSync(state, 'utf8'), 'Keep this state collision')
      else assert.equal(lstatSync(state).isSymbolicLink(), true)
      assert.equal(readFileSync(join(foreign, 'kept'), 'utf8'), 'Foreign data'); assert.equal(existsSync(join(foreign, 'missing')), false)
      rmSync(state)
    }
    const alias = join(f.root, 'arbitrary-ancestor'); symlinkSync(f.root, alias)
    assert.throws(() => new UserRaycastInstall(join(alias, 'data')).prepareSupportDirectory(selected.extensionId, selected.digest), /ancestor link/i)
    assert.equal(existsSync(support), false); assert.equal(readFileSync(join(foreign, 'kept'), 'utf8'), 'Foreign data'); assert.equal(existsSync(f.marker), false)
  } finally { f.close() }
})

test('support folders require the approved enabled extension identity before any creation', () => {
  const f = fixture()
  try {
    const selected = f.store.prepare(f.source), support = join(f.data, 'state/color-picker.support')
    assert.throws(() => f.store.prepareSupportDirectory('color-picker', selected.digest), /approved.*enabled/i)
    assert.equal(existsSync(support), false)
    f.store.approve(selected.digest)
    assert.throws(() => f.store.prepareSupportDirectory('color-picker', selected.digest), /approved.*enabled/i)
    assert.equal(existsSync(support), false)
    f.store.enable()
    assert.throws(() => f.store.prepareSupportDirectory('another-extension', selected.digest), /identity|approved/i)
    assert.throws(() => f.store.prepareSupportDirectory('../color-picker', selected.digest), /identity/i)
    assert.throws(() => f.store.prepareSupportDirectory('color-picker', '0'.repeat(64)), /identity|approved/i)
    assert.equal(existsSync(join(f.data, 'state/another-extension.support')), false)
    const receipt = f.store.prepareSupportDirectory('color-picker', selected.digest)
    assert.equal(existsSync(receipt.path), true); assert.equal(existsSync(f.marker), false)
    receipt.discardIfEmpty(); assert.equal(existsSync(receipt.path), false)
  } finally { f.close() }
})

test('extension folder admission keeps the full file allowance at the deepest supported paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-deep-files-'))
  try {
    for (let index = 0; index < 128; index++) {
      const directory = join(root, `branch-${index}`, ...Array<string>(7).fill('child'))
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'data.json'), '{}')
    }
    assert.equal(readFiles(root).size, 128)
    mkdirSync(join(root, 'overflow'))
    assert.throws(() => readFiles(root), /entry.*bound/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
