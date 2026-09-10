import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleTrustedRaycastCanIUseArtifact } from '../scripts/trusted-raycast-can-i-use-artifact.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendor = join(root, 'plugins', 'trusted-raycast', 'vendor')
const pinned = Object.freeze({
  sourceArchive: join(vendor, 'can-i-use-source.tar'),
  translateArchive: join(vendor, 'google-translate.tar'),
  dataAsset: join(vendor, 'can-i-use-data.json.gz'),
})
const capsuleLegal = Object.freeze([
  'CAN_I_USE_ATTRIBUTION.md',
  'THIRD_PARTY_NOTICES.md',
  'licenses/baseline-browser-mapping.txt',
  'licenses/browserslist.txt',
  'licenses/caniuse-api.txt',
  'licenses/caniuse-lite.txt',
  'licenses/electron-to-chromium.txt',
  'licenses/node-releases.txt',
  'licenses/raycast-extensions.txt',
])
const runtimePackages = Object.freeze({
  react: '19.0.0',
  'react-reconciler': '0.31.0',
  scheduler: '0.25.0',
})

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const temp = prefix => mkdtempSync(join(tmpdir(), prefix))
const tarMembers = archive => execFileSync('/usr/bin/tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trimEnd().split('\n').filter(Boolean)
const extract = (archive, destination) => execFileSync('/usr/bin/tar', ['-xf', archive, '-C', destination], { timeout: 15000 })
const walk = (directory, base = directory) => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name)
  const name = relative(base, path)
  if (entry.isSymbolicLink()) throw new Error(`unexpected symlink: ${name}`)
  return entry.isDirectory() ? [`${name}/`, ...walk(path, base)] : [name]
}).sort()
const capsuleFiles = () => {
  const capsule = JSON.parse(gunzipSync(readFileSync(pinned.dataAsset)).toString('utf8'))
  return new Map(capsule.entries.map(entry => [entry.path, Buffer.from(entry.base64, 'base64')]))
}
const outputTree = archive => {
  const destination = temp('can-i-use-output-extract-')
  extract(archive, destination)
  const artifact = join(destination, 'tockteam-raycast-can-i-use-artifact')
  return { destination, artifact, members: walk(artifact).map(name => `tockteam-raycast-can-i-use-artifact/${name}`) }
}
const copyPinned = (directory, names = Object.keys(pinned)) => {
  const paths = {}
  for (const name of names) {
    paths[name] = join(directory, basename(pinned[name]))
    cpSync(pinned[name], paths[name])
  }
  return paths
}

test('assembles the pinned candidate twice with exact source, legal bytes, and the three-package closure', () => {
  const directory = temp('can-i-use-artifact-test-')
  try {
    const first = join(directory, 'first.tar')
    const second = join(directory, 'second.tar')
    const firstResult = assembleTrustedRaycastCanIUseArtifact(first)
    const secondResult = assembleTrustedRaycastCanIUseArtifact(second)
    const firstBytes = readFileSync(first)
    const secondBytes = readFileSync(second)
    assert.deepEqual(firstBytes, secondBytes)
    assert.equal(firstResult.sha256, digest(firstBytes))
    assert.equal(secondResult.sha256, firstResult.sha256)
    assert.equal(firstResult.bytes, firstBytes.length)

    const firstTree = outputTree(first)
    const secondTree = outputTree(second)
    try {
      assert.deepEqual(firstTree.members, secondTree.members)
      const rootMembers = firstTree.members.map(name => name.slice('tockteam-raycast-can-i-use-artifact/'.length))
      assert.deepEqual(rootMembers.filter(name => !name.startsWith('source/') && !name.startsWith('runtime/') && !name.startsWith('licenses/')), [
        'CAN_I_USE_ATTRIBUTION.md',
        'LICENSE-FILES',
        'LICENSE-INVENTORY.json',
        'PROVENANCE.txt',
        'RUNTIME-CHECKS.sha256',
        'SHA256SUMS',
        'SOURCE-CHECKS.sha256',
        'THIRD_PARTY_NOTICES.md',
        'can-i-use-data.json.gz',
      ])
      assert.equal(rootMembers.includes('licenses/'), true)
      assert.deepEqual([...new Set(rootMembers.filter(name => name.startsWith('runtime/node_modules/') && name.endsWith('/')).map(name => name.split('/')[2]).filter(Boolean))].sort(), ['react', 'react-reconciler', 'scheduler'])
      assert.deepEqual([...new Set(rootMembers.filter(name => name.startsWith('runtime/node_modules/') && name.split('/').length > 3).map(name => name.split('/')[2]).filter(Boolean))].sort(), Object.keys(runtimePackages).sort())
      assert.deepEqual(rootMembers.filter(name => name.startsWith('source/')), tarMembers(pinned.sourceArchive).map(name => name.replace(/^can-i-use\//, 'source/')).sort().map(name => name === 'source/' ? 'source/' : name))
      assert.deepEqual(rootMembers.filter(name => name.startsWith('licenses/') && name !== 'licenses/').sort(), capsuleLegal.filter(name => name.startsWith('licenses/')).map(name => name).sort())
      assert.deepEqual(rootMembers.filter(name => name === 'CAN_I_USE_ATTRIBUTION.md' || name === 'THIRD_PARTY_NOTICES.md').sort(), capsuleLegal.filter(name => !name.startsWith('licenses/')).sort())

      const sourceExtract = temp('can-i-use-source-check-')
      const translateExtract = temp('can-i-use-translate-check-')
      try {
        extract(pinned.sourceArchive, sourceExtract)
        extract(pinned.translateArchive, translateExtract)
        const outputRoot = firstTree.artifact
        for (const name of walk(join(sourceExtract, 'can-i-use'))) {
          const sourceName = name.endsWith('/') ? name.slice(0, -1) : name
          if (name.endsWith('/')) continue
          assert.deepEqual(readFileSync(join(outputRoot, 'source', sourceName)), readFileSync(join(sourceExtract, 'can-i-use', sourceName)), `source/${sourceName}`)
        }
        assert.deepEqual(readFileSync(join(outputRoot, 'can-i-use-data.json.gz')), readFileSync(pinned.dataAsset))
        const capsule = capsuleFiles()
        for (const name of capsuleLegal) assert.deepEqual(readFileSync(join(outputRoot, name)), capsule.get(name), name)
        for (const [name, version] of Object.entries(runtimePackages)) {
          const sourcePackage = join(translateExtract, 'tockteam-raycast-artifact', 'runtime', 'node_modules', name)
          const outputPackage = join(outputRoot, 'runtime', 'node_modules', name)
          assert.equal(JSON.parse(readFileSync(join(outputPackage, 'package.json'), 'utf8')).name, name)
          assert.equal(JSON.parse(readFileSync(join(outputPackage, 'package.json'), 'utf8')).version, version)
          for (const member of walk(sourcePackage)) {
            if (member.endsWith('/')) continue
            assert.deepEqual(readFileSync(join(outputPackage, member)), readFileSync(join(sourcePackage, member)), `${name}/${member}`)
          }
        }
      } finally {
        rmSync(sourceExtract, { recursive: true, force: true })
        rmSync(translateExtract, { recursive: true, force: true })
      }
    } finally { rmSync(firstTree.destination, { recursive: true, force: true }); rmSync(secondTree.destination, { recursive: true, force: true }) }
  } finally { rmSync(directory, { recursive: true, force: true }) }
 })

test('rejects preexisting output, truncated input, and symlink input without publishing', () => {
  const directory = temp('can-i-use-artifact-boundary-')
  try {
    const output = join(directory, 'candidate.tar')
    writeFileSync(output, 'keep')
    assert.throws(() => assembleTrustedRaycastCanIUseArtifact(output), /pre-existing|already exists/)
    assert.equal(readFileSync(output, 'utf8'), 'keep')

    const copies = copyPinned(directory)
    const truncated = join(directory, 'truncated-source.tar')
    writeFileSync(truncated, readFileSync(copies.sourceArchive).subarray(0, 1024))
    const rejected = join(directory, 'rejected.tar')
    assert.throws(() => assembleTrustedRaycastCanIUseArtifact(rejected, { ...copies, sourceArchive: truncated }), /size|digest|pin/i)
    assert.equal(existsSync(rejected), false)

    const linked = join(directory, 'linked-source.tar')
    symlinkSync(copies.sourceArchive, linked)
    assert.throws(() => assembleTrustedRaycastCanIUseArtifact(join(directory, 'symlink-rejected.tar'), { ...copies, sourceArchive: linked }), /symbolic|regular|nofollow|ELOOP/i)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('rejects a FIFO input without waiting for a writer', { skip: process.platform === 'win32' }, () => {
  const directory = temp('can-i-use-artifact-fifo-')
  try {
    const copies = copyPinned(directory)
    const fifo = join(directory, 'source.tar')
    execFileSync('/usr/bin/mkfifo', [fifo])
    assert.throws(() => assembleTrustedRaycastCanIUseArtifact(join(directory, 'fifo-rejected.tar'), { ...copies, sourceArchive: fifo }), /regular|FIFO|pipe/i)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
