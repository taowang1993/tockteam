import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { UserRaycastRegistry } from '../src/user-raycast-registry.ts'

test('a rate-limited GitHub API falls back to one pinned public Git tree without running source', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-raycast-git-fixture-'))
  const repo = join(root, 'repo'), selected = join(repo, 'extensions', 'uuid-generator')
  mkdirSync(join(selected, 'src'), { recursive: true })
  const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }
  const git = (...args: string[]): string => execFileSync('/opt/homebrew/bin/git', ['-C', repo, '-c', 'user.name=TockTeam Test', '-c', 'user.email=test@example.invalid', ...args], { env, encoding: 'utf8', timeout: 15000 }).trim()
  execFileSync('/opt/homebrew/bin/git', ['init', '-b', 'main', repo], { env, timeout: 15000 })
  writeFileSync(join(selected, 'package.json'), JSON.stringify({ name: 'uuid-generator', title: 'UUID Generator', license: 'MIT', commands: [{ name: 'generate', mode: 'no-view' }] }))
  writeFileSync(join(selected, 'package-lock.json'), JSON.stringify({ name: 'uuid-generator', lockfileVersion: 3, packages: { '': { name: 'uuid-generator' } } }))
  writeFileSync(join(selected, 'src/generate.tsx'), `export default () => { throw Error('unapproved source was executed') }`)
  git('add', 'extensions/uuid-generator'); git('commit', '-m', 'first source')
  const originalRevision = git('rev-parse', 'HEAD')
  const originalTree = git('rev-parse', 'HEAD:extensions/uuid-generator')
  const server = createServer((_request, response) => response.writeHead(403, { 'x-ratelimit-remaining': '0' }).end())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }) })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const registry = new UserRaycastRegistry(join(root, 'registry'), { baseUrl: `http://127.0.0.1:${address.port}`, repositoryUrl: pathToFileURL(repo).href, gitPath: '/opt/homebrew/bin/git' })
  const first = await registry.prepare('uuid-generator', 'generate')
  assert.equal(first.revision, originalRevision)
  assert.equal(first.tree, originalTree)
  assert.equal(first.files, 3)
  assert.match(readFileSync(join(registry.sourceDirectory(first.digest), 'src/generate.tsx'), 'utf8'), /unapproved source/)
  symlinkSync('../package.json', join(selected, 'src/link'))
  git('add', 'extensions/uuid-generator'); git('commit', '-m', 'unsupported link')
  await assert.rejects(registry.prepare('uuid-generator', 'generate'), /unsupported|link|mode/i)
  assert.equal(registry.inspect()?.digest, first.digest)
  rmSync(join(selected, 'src/link'))
  writeFileSync(join(selected, 'src/generate.tsx'), 'export default () => 2')
  git('add', 'extensions/uuid-generator'); git('commit', '-m', 'updated source')
  const second = await registry.prepare('uuid-generator', 'generate')
  assert.equal(second.revision, git('rev-parse', 'HEAD'))
  assert.notEqual(second.digest, first.digest)
})
