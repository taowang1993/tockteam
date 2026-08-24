import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  acquireDshLucideIconLock,
  adaptDshLucideIcons,
  dshLucideIconMappings,
  dshLucideSourcePaths,
  generateDshLucideIconSource,
} from '../scripts/dsh-lucide-icons.mjs'
import { resolveDshSource } from '../scripts/dsh-source.mjs'

const dshSource = resolveDshSource()
const upstreamIconPath = join(dshSource, 'packages/client/ui-primitives/src/icons/index.tsx')

test('the downstream DSH adapter maps every upstream interface icon to Lucide', () => {
  const upstream = readFileSync(upstreamIconPath, 'utf8')
  const upstreamExports = [...upstream.matchAll(/export const (Icon\w+)/gu)].map(match => match[1]).sort()
  const mappedExports = dshLucideIconMappings
    .filter(mapping => mapping.exportName.startsWith('Icon'))
    .map(mapping => mapping.exportName)
    .sort()

  assert.deepEqual(mappedExports, upstreamExports)
  const generated = generateDshLucideIconSource()
  assert.match(generated, /className: \['lucide',/u)
  assert.doesNotMatch(generated, /<svg\b/u)
  for (const { exportName, lucideName } of dshLucideIconMappings) {
    assert.match(generated, new RegExp(`export const ${exportName} = glyph\\('${lucideName}'`, 'u'))
  }
})

test('the DSH adapter prevents concurrent source swaps', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-dsh-icons-lock-'))
  try {
    const release = acquireDshLucideIconLock(root)
    assert.throws(() => acquireDshLucideIconLock(root), /another DSH Lucide build is active/u)
    release()
    acquireDshLucideIconLock(root)()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the adapter restores the pinned DSH source after a build', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-dsh-icons-'))
  const originals = dshLucideSourcePaths.map(path => {
    const source = readFileSync(join(dshSource, path), 'utf8')
    const destination = join(root, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, source)
    return { destination, source }
  })

  try {
    const restore = adaptDshLucideIcons(root)
    for (const { destination, source } of originals) {
      const adapted = readFileSync(destination, 'utf8')
      assert.notEqual(adapted, source)
      assert.doesNotMatch(adapted, /<svg\b/u)
    }
    restore()
    for (const { destination, source } of originals) {
      assert.equal(readFileSync(destination, 'utf8'), source)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
