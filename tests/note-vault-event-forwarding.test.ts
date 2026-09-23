import assert from 'node:assert/strict'
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { applyNoteVaultEventForwarding } from '../scripts/note-vault-event-forwarding.mjs'

const require = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))
const installed = dirname(require.resolve('@deepseek-ai/dsh-api-remotes/package.json'))
const manifest = readFileSync(join(installed, 'package.json'), 'utf8')
const original = readFileSync(join(installed, 'lib/index.js'), 'utf8')
const addition = '\n\t{\n\t\tevent: "note-vault/change",\n\t\tmode: "emit"\n\t},'
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-note-vault-forwarding-'))
  const packageRoot = join(root, 'node_modules/@deepseek-ai/dsh-api-remotes')
  mkdirSync(join(packageRoot, 'lib/types'), { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), manifest)
  writeFileSync(join(packageRoot, 'lib/index.js'), original)
  writeFileSync(join(packageRoot, 'lib/types/remote-events.js'), 'unexported mirror must remain untouched')
  return { root, packageRoot }
}

test('patches only the pinned shipped Host export, preserves every other byte and is idempotent', () => {
  const { root, packageRoot } = fixture()
  try {
    applyNoteVaultEventForwarding(root)
    const changed = readFileSync(join(packageRoot, 'lib/index.js'), 'utf8')
    assert.equal(changed.replace(addition, ''), original)
    assert.equal(changed.split('note-vault/change').length - 1, 1)
    applyNoteVaultEventForwarding(root)
    assert.equal(readFileSync(join(packageRoot, 'lib/index.js'), 'utf8'), changed)
    assert.equal(readFileSync(join(packageRoot, 'lib/types/remote-events.js'), 'utf8'), 'unexported mirror must remain untouched')
    assert.equal(readFileSync(join(installed, 'lib/index.js'), 'utf8'), original)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('rejects version, export and source drift before modifying any staged copy', () => {
  for (const drift of ['version', 'export', 'shape', 'duplicate']) {
    const { root, packageRoot } = fixture()
    const second = join(root, 'node_modules/.pnpm/@deepseek-ai+dsh-api-remotes@0.1.2-rc.1/node_modules/@deepseek-ai/dsh-api-remotes')
    try {
      mkdirSync(join(second, 'lib'), { recursive: true })
      const altered = JSON.parse(manifest)
      if (drift === 'version') altered.version = '0.1.2-rc.2'
      if (drift === 'export') altered.exports['.'].default = './other.js'
      writeFileSync(join(second, 'package.json'), JSON.stringify(altered))
      writeFileSync(join(second, 'lib/index.js'), drift === 'shape' ? original + '\n// drift' : drift === 'duplicate' ? original + original : original)
      assert.throws(() => applyNoteVaultEventForwarding(root), /pinned|shape|export|version/u)
      assert.equal(readFileSync(join(packageRoot, 'lib/index.js'), 'utf8'), original)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})

test('refuses a staged alias pointing outside its runtime instead of editing installed dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-note-vault-alias-'))
  try {
    mkdirSync(join(root, 'node_modules/@deepseek-ai'), { recursive: true })
    symlinkSync(installed, join(root, 'node_modules/@deepseek-ai/dsh-api-remotes'), 'dir')
    assert.throws(() => applyNoteVaultEventForwarding(root), /outside/u)
    assert.equal(readFileSync(join(installed, 'lib/index.js'), 'utf8'), original)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('full, quick and Nix packaging install the same one-event adjustment', () => {
  const stage = readFileSync(new URL('../scripts/stage-dsh.mjs', import.meta.url), 'utf8')
  const nix = readFileSync(new URL('../nix/dsh-runtime-pinned.nix', import.meta.url), 'utf8')
  assert.equal(stage.split('applyNoteVaultEventForwarding(runtime)').length - 1, 2)
  assert.ok(nix.includes('node ${../scripts/note-vault-event-forwarding.mjs} "$PWD"'))
})


test('replaces staged hardlinks without mutating their original source inode', () => {
  const { root, packageRoot } = fixture()
  try {
    const originalCopy = join(root, 'original-source.js')
    const entry = join(packageRoot, 'lib/index.js')
    writeFileSync(originalCopy, original)
    rmSync(entry)
    linkSync(originalCopy, entry)
    applyNoteVaultEventForwarding(root)
    assert.equal(readFileSync(originalCopy, 'utf8'), original)
    assert.notEqual(readFileSync(entry, 'utf8'), original)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('patches all distinct staged pinned copies while deduplicating exposed aliases', () => {
  const { root, packageRoot } = fixture()
  const stored = join(root, 'node_modules/.pnpm/@deepseek-ai+dsh-api-remotes@0.1.2-rc.1/node_modules/@deepseek-ai/dsh-api-remotes')
  try {
    mkdirSync(join(stored, 'lib'), { recursive: true })
    writeFileSync(join(stored, 'package.json'), manifest)
    writeFileSync(join(stored, 'lib/index.js'), original)
    applyNoteVaultEventForwarding(root)
    for (const copy of [packageRoot, stored]) {
      const source = readFileSync(join(copy, 'lib/index.js'), 'utf8')
      assert.equal(source.replace(addition, ''), original)
      assert.equal(source.split('note-vault/change').length - 1, 1)
    }
    rmSync(packageRoot, { recursive: true })
    symlinkSync(stored, packageRoot, 'dir')
    applyNoteVaultEventForwarding(root)
    assert.equal(readFileSync(join(stored, 'lib/index.js'), 'utf8').split('note-vault/change').length - 1, 1)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
