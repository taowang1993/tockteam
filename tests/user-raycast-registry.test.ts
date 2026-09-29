import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { UserRaycastRegistry } from '../src/user-raycast-registry.ts'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'

const sha = (bytes: Buffer): string => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const revisionOne = 'a'.repeat(40)
const revisionTwo = 'e'.repeat(40)
const lock = Buffer.from(JSON.stringify({ name: 'uuid-generator', lockfileVersion: 3, packages: { '': { name: 'uuid-generator' } } }))

// An inert local HTTP fixture mirrors only the GitHub Git endpoints this adapter owns.
test('one selected public source is pinned; offline, drift and cancellation leave the approved version recoverable', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-raycast-registry-'))
  let revision = revisionOne
  let selectedMode = 'no-view'
  let failure: 'none' | 'offline' | 'drift' | 'path' | 'link' | 'large' | 'config' = 'none'
  const source = () => new Map([['package.json', Buffer.from(JSON.stringify({ name: 'uuid-generator', title: 'UUID Generator', license: 'MIT', commands: [{ name: 'generate', title: 'Generate UUIDs', mode: selectedMode }] }))], ['package-lock.json', lock], ['src/generate.tsx', Buffer.from(`export default () => { throw Error('not executed ${revision}') }`) ], ...(failure === 'config' ? [['.npmrc', Buffer.from('registry=https://unreviewed.invalid')] as const] : [])])
  const server = createServer((request, response) => {
    const path = request.url ?? ''
    if (failure === 'offline') { response.writeHead(503).end(); return }
    const rootTree = revision === revisionOne ? 'b'.repeat(40) : 'f'.repeat(40)
    const extensionsTree = revision === revisionOne ? 'c'.repeat(40) : '0'.repeat(40)
    const selectedTree = revision === revisionOne ? 'd'.repeat(40) : '1'.repeat(40)
    const blobs = source()
    const entries = [...blobs].map(([name, bytes]) => ({ path: name, type: 'blob', mode: '100644', size: bytes.length, sha: sha(bytes) }))
    if (failure === 'path') entries[0]!.path = '../escape'
    if (failure === 'link') entries[0]!.mode = '120000'
    if (failure === 'large') entries[0]!.size = 16 * 1024 * 1024 + 1
    const json = (body: unknown) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(body)) }
    if (path.endsWith('/git/ref/heads/main')) json({ object: { sha: revision } })
    else if (path.endsWith(`/git/commits/${revision}`)) json({ tree: { sha: rootTree } })
    else if (path.endsWith(`/git/trees/${rootTree}`)) json({ sha: rootTree, tree: [{ path: 'extensions', type: 'tree', sha: extensionsTree }] })
    else if (path.endsWith(`/git/trees/${extensionsTree}`)) json({ sha: extensionsTree, tree: [{ path: 'uuid-generator', type: 'tree', sha: selectedTree }] })
    else if (path.endsWith(`/git/trees/${selectedTree}?recursive=1`)) json({ sha: selectedTree, truncated: false, tree: entries })
    else if (path.includes('/git/blobs/')) {
      const entry = entries.find(item => path.endsWith(`/${item.sha}`))
      const bytes = entry && blobs.get(entry.path)
      if (!entry || !bytes) { response.writeHead(404).end(); return }
      json({ sha: entry.sha, size: bytes.length, encoding: 'base64', content: (failure === 'drift' ? Buffer.from('changed') : bytes).toString('base64') })
    } else response.writeHead(404).end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }) })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const registry = new UserRaycastRegistry(join(root, 'registry'), { baseUrl: `http://127.0.0.1:${address.port}` })
  const install = new UserRaycastInstall(join(root, 'installed'))
  const first = await registry.prepare('uuid-generator', 'generate')
  assert.equal(first.revision, revisionOne)
  assert.equal(first.license, 'MIT')
  assert.equal(first.files, 3)
  assert.match(readFileSync(join(registry.sourceDirectory(first.digest), 'src/generate.tsx'), 'utf8'), /not executed a{40}/)
  const receipt = join(root, 'registry', 'stage', 'candidate.json')
  renameSync(receipt, `${receipt}.saved`)
  symlinkSync('candidate.json.saved', receipt)
  assert.equal(registry.inspect(), undefined, 'metadata links must not be followed')
  rmSync(receipt); renameSync(`${receipt}.saved`, receipt)
  const built = (name: string, digest: string) => {
    const folder = join(root, name); mkdirSync(folder)
    writeFileSync(join(folder, 'package.json'), readFileSync(join(registry.sourceDirectory(digest), 'package.json')))
    writeFileSync(join(folder, 'generate.js'), `exports.default=()=>${JSON.stringify(name)}`)
    return folder
  }
  const versionOne = install.prepare(built('one', first.digest), 'generate')
  install.approve(versionOne.digest); install.enable()
  failure = 'offline'
  await assert.rejects(registry.prepare('uuid-generator', 'generate'), /503|offline/i)
  assert.equal(registry.inspect()?.digest, first.digest)
  failure = 'drift'; revision = revisionTwo
  await assert.rejects(registry.prepare('uuid-generator', 'generate'), /digest|blob|size/i)
  assert.equal(registry.inspect()?.digest, first.digest)
  for (const [kind, reason] of [['path', /path/i], ['link', /unsupported file/i], ['large', /bound/i], ['config', /config|unsupported/i]] as const) {
    failure = kind
    await assert.rejects(registry.prepare('uuid-generator', 'generate'), reason)
    assert.equal(registry.inspect()?.digest, first.digest)
  }
  failure = 'none'
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(registry.prepare('uuid-generator', 'generate', aborted.signal), /abort/i)
  assert.equal(registry.inspect()?.digest, first.digest)
  const second = await registry.prepare('uuid-generator', 'generate')
  assert.equal(second.revision, revisionTwo)
  assert.notEqual(second.digest, first.digest)
  assert.equal(install.status().digest, versionOne.digest)
  const versionTwo = install.prepare(built('two', second.digest), 'generate')
  install.approve(versionTwo.digest)
  assert.equal(install.status().hasPrevious, true)
  install.recoverPrevious()
  assert.equal(install.status().digest, versionOne.digest)
  assert.equal(install.status().enabled, false)
  selectedMode = 'menu-bar'
  const menu = await registry.prepare('uuid-generator', 'generate')
  assert.equal(menu.mode, 'menu-bar')
  assert.notEqual(menu.digest, second.digest)
})
