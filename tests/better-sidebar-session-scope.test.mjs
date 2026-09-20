import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'
import { adaptBetterSidebarFs, adaptBetterSidebarGit, adaptBetterSidebarHost } from '../scripts/better-sidebar-upstream-adapter.mjs'

test('filesystem containment uses platform separators and preserves root boundaries', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tockteam-containment-'))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/fs-tree.ts', import.meta.url))
  try {
    await build({
      stdin: { contents: adaptBetterSidebarFs(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: join(temporary, 'fs.mjs'), bundle: true, platform: 'node', format: 'esm',
    })
    const { isWithin } = await import(pathToFileURL(join(temporary, 'fs.mjs')).href)
    for (const [base, target, platform, expected] of [
      ['/workspace', '/workspace\\outside/file', 'darwin', false],
      ['/workspace', '/workspace/folder\\name/file', 'linux', true],
      ['/workspace\\name', '/workspace/name/file', 'linux', false],
      ['/workspace/', '/workspace/file', 'darwin', true],
      ['/workspace', '/workspace-sibling/file', 'linux', false],
      ['/', '/file', 'linux', true],
      ['C:\\Work', 'c:/work/file', 'win32', true],
      ['C:\\Work', 'c:/work-sibling/file', 'win32', false],
      ['C:\\', 'c:/file', 'win32', true],
      ['C:\\Work', 'D:/Work/file', 'win32', false],
      ['\\\\server\\share', '//SERVER/share/file', 'win32', true],
      ['\\\\server\\share', '//server/share-other/file', 'win32', false],
    ]) assert.equal(isWithin(base, target, platform), expected, `${platform}: ${base} -> ${target}`)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('adapted sidebar resolves workspace authority and Git paths without redirecting files', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-session-scope-')))
  const disposers = []
  try {
    await mkdir(join(temporary, 'bundle'))
    await symlink(join(root, '.stage/dsh-runtime/node_modules'), join(temporary, 'node_modules'), 'dir')
    await symlink(join(root, '.stage/dsh-runtime/node_modules/@tockteam/better-sidebar-runtime/node_modules'), join(temporary, 'bundle/node_modules'), 'dir')
    const entry = join(root, 'upstream/DSH-better-sidebar/src/index.ts')
    await build({
      stdin: { contents: adaptBetterSidebarHost(await readFile(entry, 'utf8')), loader: 'ts', resolveDir: dirname(entry) },
      outfile: join(temporary, 'bundle/host.mjs'), bundle: true, platform: 'node', format: 'esm',
      external: ['@deepseek-ai/*', 'cordis', 'node-pty', 'schemastery', 'ws'],
      plugins: [{
        name: 'tockteam-filesystem-adapter',
        setup(builder) {
          builder.onLoad({ filter: /[/\\]git\.ts$/ }, async args => ({
            contents: adaptBetterSidebarGit(await readFile(args.path, 'utf8')),
            loader: 'ts', resolveDir: dirname(args.path),
          }))
          builder.onLoad({ filter: /fs-tree\.ts$/ }, async args => ({
            contents: adaptBetterSidebarFs(await readFile(args.path, 'utf8')),
            loader: 'ts', resolveDir: dirname(args.path),
          }))
        },
      }],
    })
    const { apply } = await import(pathToFileURL(join(temporary, 'bundle/host.mjs')).href)
    const routes = []
    apply({
      webRuntime: { trustedHosts: [] },
      webServer: {
        register: route => { routes.push(route); return () => {} },
        registerUpgrade: () => () => {},
      },
      sessions: { get: id => id === 'live' ? { header: { cwd: temporary } }
        : id === 'nested' ? { header: { cwd: join(temporary, 'repository/nested') } } : undefined },
      get: key => key === 'sessionPersistence' ? {
        inspect: async id => {
          if (id === 'missing') throw new Error('session not found')
          return { meta: id === 'cold' ? { cwd: temporary } : {} }
        },
      } : undefined,
      tools: { register: () => () => {} },
      inject: () => () => {},
      effect: fn => { const dispose = fn(); if (dispose) disposers.push(dispose) },
      logger: { warn: () => {} },
    })
    const route = routes.find(route => route.path === '/sidebar/api')
    assert.ok(route)
    const invoke = async (method, payload) => {
      let status
      let result
      await route.handler({
        method: 'POST', url: `/sidebar/api/${method}`, headers: { host: '127.0.0.1:3080' },
        async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)) },
      }, {
        writeHead: code => { status = code },
        end: body => { result = JSON.parse(body) },
      })
      return { status, result }
    }
    await t.test('file saves can clear existing content and create an empty file', async () => {
      const existing = join(temporary, 'clear.txt')
      const created = join(temporary, 'empty/new.txt')
      await writeFile(existing, 'content to clear\n')
      for (const path of [existing, created]) {
        const response = await invoke('fs.write', { sessionId: 'live', path, content: '' })
        assert.equal(response.status, 200, JSON.stringify(response.result))
        assert.equal(await readFile(path, 'utf8'), '')
        const read = await invoke('fs.read', { sessionId: 'live', path })
        assert.equal(read.status, 200)
        assert.equal(read.result.value.content, '')
      }
      assert.deepEqual(await readdir(dirname(created)), ['new.txt'])
    })
    await t.test('invalid file content is rejected without modifying the destination', async () => {
      const path = join(temporary, 'invalid-content.txt')
      await writeFile(path, 'keep content\n')
      for (const content of [undefined, null, false, 0, [], {}]) {
        const response = await invoke('fs.write', { sessionId: 'live', path, content })
        assert.equal(response.status, 400)
        assert.equal(response.result.error.code, 'bad-request')
        assert.equal(await readFile(path, 'utf8'), 'keep content\n')
      }
    })
    await t.test('file saves never follow a pre-existing temporary symlink outside the workspace', {
      skip: process.platform === 'win32',
    }, async () => {
      const outside = await mkdtemp(join(tmpdir(), 'tockteam-save-outside-'))
      const target = join(temporary, 'saved.txt')
      const oldTemporary = `${target}.dsh-sidebar-tmp-${process.pid}`
      const sentinel = join(outside, 'private.txt')
      try {
        await writeFile(sentinel, 'private data\n')
        await symlink(sentinel, oldTemporary)
        const response = await invoke('fs.write', { sessionId: 'live', path: target, content: 'saved content\n' })
        assert.equal(await readFile(sentinel, 'utf8'), 'private data\n')
        assert.equal(response.status, 200)
        assert.equal(await readFile(target, 'utf8'), 'saved content\n')
        assert.equal(await readFile(oldTemporary, 'utf8'), 'private data\n')
      } finally {
        await rm(target, { force: true })
        await rm(oldTemporary, { force: true })
        await rm(outside, { recursive: true, force: true })
      }
    })
    await t.test('file saves preserve private and executable permissions', {
      skip: process.platform === 'win32',
    }, async () => {
      for (const mode of [0o600, 0o755, 0o640, 0o751]) {
        const path = join(temporary, `mode-${mode.toString(8)}.sh`)
        await writeFile(path, '#!/bin/sh\necho before\n')
        await chmod(path, mode)
        const response = await invoke('fs.write', { sessionId: 'live', path, content: '#!/bin/sh\necho after\n' })
        assert.equal(response.status, 200)
        assert.equal(await readFile(path, 'utf8'), '#!/bin/sh\necho after\n')
        assert.equal((await stat(path)).mode & 0o777, mode, 'saving must preserve access and executable bits')
      }
    })
    await t.test('concurrent saves publish whole files and clean up their own temporary paths', async () => {
      const directory = join(temporary, 'saves')
      const path = join(directory, 'concurrent.txt')
      const contents = Array.from({ length: 12 }, (_, index) => `${index}:中文\n`.repeat(10_000))
      const responses = await Promise.all(contents.map(content => invoke('fs.write', { sessionId: 'live', path, content })))
      assert.deepEqual(responses.map(response => response.status), contents.map(() => 200))
      assert.ok(contents.includes(await readFile(path, 'utf8')), 'the final file must be one complete submitted version')
      assert.deepEqual(await readdir(directory), ['concurrent.txt'])
      const next = await invoke('fs.write', { sessionId: 'live', path, content: 'subsequent save' })
      assert.equal(next.status, 200)
      assert.equal(await readFile(path, 'utf8'), 'subsequent save')
    })
    await t.test('failed file replacement preserves existing content and removes temporary directories', async () => {
      const directory = join(temporary, 'failed-save')
      const path = join(directory, 'existing-directory')
      await mkdir(path, { recursive: true })
      await writeFile(join(path, 'keep.txt'), 'preserve me')
      const response = await invoke('fs.write', { sessionId: 'live', path, content: 'cannot replace directory' })
      assert.equal(response.status, 400)
      assert.equal(await readFile(join(path, 'keep.txt'), 'utf8'), 'preserve me')
      assert.deepEqual(await readdir(directory), ['existing-directory'])
    })
    const repository = join(temporary, 'repository')
    const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' })
    await mkdir(join(repository, 'nested'), { recursive: true })
    git('init', '-q', '-b', 'main')
    await writeFile(join(repository, 'same.txt'), 'root before\n')
    await writeFile(join(repository, 'nested/same.txt'), 'nested before\n')
    git('add', '-A')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'initial')
    await writeFile(join(repository, 'same.txt'), 'root after\n')
    await writeFile(join(repository, 'nested/same.txt'), 'nested after\n')
    const selection = { sessionId: 'nested', path: 'same.txt' }
    await t.test('diff selects the repository-relative status entry', async () => {
      const response = await invoke('git.diff', selection)
      assert.equal(response.status, 200)
      assert.match(response.result.value.diff, /\+root after/)
      assert.doesNotMatch(response.result.value.diff, /nested after/)
    })
    await t.test('historical content selects the repository-relative status entry', async () => {
      const response = await invoke('git.show', { ...selection, rev: 'HEAD' })
      assert.equal(response.status, 200)
      assert.equal(response.result.value.content, 'root before\n')
    })
    await t.test('selected repositories ignore same-named files in the session container', async () => {
      await writeFile(join(temporary, 'same.txt'), 'container file\n')
      const selected = { sessionId: 'live', repoRoot: repository, path: 'same.txt' }
      const diff = await invoke('git.diff', selected)
      assert.equal(diff.status, 200)
      assert.match(diff.result.value.diff, /\+root after/)
      assert.equal((await invoke('git.show', { ...selected, rev: 'HEAD' })).result.value.content, 'root before\n')
      assert.equal((await invoke('git.discard', selected)).status, 200)
      assert.equal(await readFile(join(temporary, 'same.txt'), 'utf8'), 'container file\n')
      assert.equal(await readFile(join(repository, 'same.txt'), 'utf8'), 'root before\n')
      await writeFile(join(repository, 'same.txt'), 'root after\n')
    })
    await t.test('absolute paths and explicit nested paths retain exact identity', async () => {
      for (const path of [join(repository, 'nested/same.txt'), 'nested/same.txt']) {
        const selected = { sessionId: 'nested', path }
        const diff = await invoke('git.diff', selected)
        assert.equal(diff.status, 200)
        assert.match(diff.result.value.diff, /\+nested after/)
        assert.equal((await invoke('git.show', { ...selected, rev: 'HEAD' })).result.value.content, 'nested before\n')
      }
    })
    await t.test('deleted paths keep their repository-relative history', async () => {
      await rm(join(repository, 'same.txt'))
      assert.equal((await invoke('git.show', { ...selection, rev: 'HEAD' })).result.value.content, 'root before\n')
      const diff = await invoke('git.diff', selection)
      assert.equal(diff.status, 200)
      assert.match(diff.result.value.diff, /deleted file mode/)
      await writeFile(join(repository, 'same.txt'), 'root after\n')
    })
    await t.test('invalid selections and outside-repository paths cannot discard files', async () => {
      for (const path of ['same.txt', join(repository, 'same.txt')]) {
        assert.notEqual((await invoke('git.discard', { ...selection, path, repoRoot: temporary })).status, 200)
      }
      for (const path of ['../same.txt', join(temporary, 'same.txt')]) {
        assert.notEqual((await invoke('git.discard', { ...selection, path })).status, 200)
      }
      assert.equal(await readFile(join(temporary, 'same.txt'), 'utf8'), 'container file\n')
      assert.equal(await readFile(join(repository, 'same.txt'), 'utf8'), 'root after\n')
      // File reads retain the session boundary even though Git uses repo paths.
      assert.equal((await invoke('fs.read', { ...selection, path: join(repository, 'same.txt') })).status, 403)
    })
    await t.test('discard restores only the repository-relative status entry', async () => {
      const response = await invoke('git.discard', selection)
      assert.equal(response.status, 200)
      assert.equal(await readFile(join(repository, 'nested/same.txt'), 'utf8'), 'nested after\n')
      assert.equal(await readFile(join(repository, 'same.txt'), 'utf8'), 'root before\n')
      assert.equal((await invoke('git.discard', { ...selection, path: join(repository, 'nested/same.txt') })).status, 200)
      assert.equal(await readFile(join(repository, 'nested/same.txt'), 'utf8'), 'nested before\n')
    })
    for (const sessionId of ['live', 'cold']) {
      const { status, result } = await invoke('session.cwd', { sessionId, cwd: tmpdir() })
      assert.equal(status, 200)
      assert.equal(result.value.cwd, temporary, `${sessionId} must ignore browser workspace authority`)
    }
    for (const method of ['session.cwd', 'fs.tree', 'git.status']) {
      for (const cwd of [undefined, tmpdir()]) {
        const { status, result } = await invoke(method, { sessionId: 'unknown', cwd })
        assert.equal(status, 403, `${method} must reject sessions without an authoritative workspace`)
        assert.equal(result.ok, false)
        assert.equal(result.error.code, 'forbidden')
      }
    }
    assert.equal((await invoke('session.cwd', { sessionId: 'missing', cwd: tmpdir() })).status, 403)
    if (process.platform !== 'win32') {
      const sibling = `${temporary}\\outside`
      try {
        await mkdir(sibling)
        const secret = join(sibling, 'private.txt')
        await writeFile(secret, 'private sibling data\n')
        for (const [method, path] of [
          ['fs.read', secret], ['fs.tree', sibling],
          ['fs.write', secret], ['fs.write', join(sibling, 'new/note.txt')],
        ]) {
          const response = await invoke(method, { sessionId: 'live', path, content: 'overwrite' })
          assert.equal(response.status, 403, `${method} must reject a literal-backslash sibling`)
          assert.equal(response.result.error.code, 'forbidden')
        }
        assert.equal(await readFile(secret, 'utf8'), 'private sibling data\n')
        await assert.rejects(access(join(sibling, 'new')))
        const nested = join(temporary, 'folder\\name')
        await mkdir(nested)
        const inside = join(nested, 'note.txt')
        assert.equal((await invoke('fs.write', { sessionId: 'live', path: inside, content: 'inside' })).status, 200)
        assert.equal((await invoke('fs.read', { sessionId: 'live', path: inside })).result.value.content, 'inside')
      } finally {
        await rm(sibling, { recursive: true, force: true })
      }
    }
  } finally {
    for (const dispose of disposers.reverse()) await dispose()
    await rm(temporary, { recursive: true, force: true })
  }
})
