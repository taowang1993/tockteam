import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
