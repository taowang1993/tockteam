import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'

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
