import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'
import { adaptBetterSidebarGit } from '../scripts/better-sidebar-upstream-adapter.mjs'

test('Git output preserves Unicode across stream chunks', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'tockteam-sidebar-unicode-'))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url))
  const git = (...args) => execFileSync('git', args, { cwd: temporary, encoding: 'utf8' })
  try {
    const bundle = join(temporary, 'git.mjs')
    await build({
      stdin: { contents: adaptBetterSidebarGit(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    })
    const sidebarGit = await import(pathToFileURL(bundle).href)
    git('init', '-q', '-b', 'main')
    const content = '中文🙂é\n'.repeat(100_000)
    await writeFile(join(temporary, 'unicode.txt'), content)
    git('add', '--', 'unicode.txt')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'Unicode content')
    await t.test('historical content and patches', async () => {
      const actual = await sidebarGit.show(temporary, 'HEAD', 'unicode.txt')
      assert.equal(actual?.includes('\uFFFD'), false, 'valid UTF-8 must not gain replacement characters')
      assert.equal(actual === content, true, 'historical content must match the committed file exactly')
      const diff = await sidebarGit.commitDiff(temporary, 'HEAD')
      assert.equal(diff.includes('\uFFFD'), false, 'commit patches must preserve Unicode too')
      assert.equal(diff.split('\n').filter(line => line === '+中文🙂é').length, 100_000)
    })
    await t.test('Git hook errors', async () => {
      await writeFile(join(temporary, '.git/hooks/pre-commit'), '#!/bin/sh\ncat unicode.txt >&2\nexit 1\n', { mode: 0o755 })
      await writeFile(join(temporary, 'pending.txt'), 'pending\n')
      git('add', '--', 'pending.txt')
      await assert.rejects(sidebarGit.commit(temporary, 'rejected'), error => {
        assert.equal(error.message.includes('\uFFFD'), false, 'hook errors must preserve Unicode')
        assert.equal(error.message === content.trim(), true)
        return true
      })
      assert.equal(git('log', '-1', '--format=%s').trim(), 'Unicode content')
      assert.equal(git('diff', '--cached', '--name-only').trim(), 'pending.txt')
    })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('an unavailable repository selection cannot mutate the default repository', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tockteam-sidebar-repository-'))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url))
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  try {
    const bundle = join(temporary, 'git.mjs')
    await build({
      stdin: { contents: adaptBetterSidebarGit(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    })
    const sidebarGit = await import(pathToFileURL(bundle).href)
    const container = join(temporary, 'projects')
    const first = join(container, 'a-first')
    const second = join(container, 'b-second')
    for (const workspace of [first, second]) {
      await mkdir(workspace, { recursive: true })
      git(workspace, 'init', '-q', '-b', 'main')
      git(workspace, '-c', 'user.name=Test', '-c', 'user.email=test@example.test',
        'commit', '--allow-empty', '-qm', 'initial')
      await writeFile(join(workspace, 'pending.txt'), 'pending work\n')
    }
    // An explicit root may be stale after removal, or belong to another session.
    const result = await sidebarGit.stage(container, undefined, join(container, 'removed'))
      .then(() => 'accepted', () => 'rejected')
    assert.equal(git(first, 'diff', '--cached', '--name-only'), '')
    assert.equal(git(second, 'diff', '--cached', '--name-only'), '')
    assert.equal(result, 'rejected')
    await assert.rejects(sidebarGit.status(container, temporary))
    // The default remains available only when the caller made no selection.
    assert.equal((await sidebarGit.status(container)).root, await realpath(first))
    await sidebarGit.stage(container, undefined, await realpath(second))
    assert.equal(git(second, 'diff', '--cached', '--name-only'), 'pending.txt')
    assert.equal(git(first, 'diff', '--cached', '--name-only'), '')
    await sidebarGit.unstage(container, undefined, await realpath(second))
    assert.equal(git(second, 'diff', '--cached', '--name-only'), '')
    await sidebarGit.stage(container, undefined)
    assert.equal(git(first, 'diff', '--cached', '--name-only'), 'pending.txt')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('commit actions cannot abort an ongoing conflict through a revision option', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'tockteam-sidebar-commit-'))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url))
  try {
    const bundle = join(temporary, 'git.mjs')
    await build({
      stdin: { contents: adaptBetterSidebarGit(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    })
    const sidebarGit = await import(pathToFileURL(bundle).href)
    for (const [method, command, marker] of [
      ['revert', 'revert', 'REVERT_HEAD'], ['cherryPick', 'cherry-pick', 'CHERRY_PICK_HEAD'],
    ]) {
      await t.test(method, async () => {
        const workspace = join(temporary, method)
        await mkdir(workspace)
        const git = (...args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
        git('init', '-q', '-b', 'main')
        git('config', 'user.name', 'Test')
        git('config', 'user.email', 'test@example.test')
        const commit = async content => {
          await writeFile(join(workspace, 'tracked.txt'), `${content}\n`)
          git('add', '--', 'tracked.txt')
          git('commit', '-qm', content)
          return git('rev-parse', 'HEAD')
        }
        await commit('base')
        const target = await commit('change')
        await commit('later')
        assert.throws(() => git(command, '--no-edit', target))
        const conflict = await readFile(join(workspace, 'tracked.txt'), 'utf8')
        const index = git('ls-files', '-u')
        const head = git('rev-parse', 'HEAD')
        const result = await sidebarGit[method](workspace, '--abort').then(() => 'accepted', () => 'rejected')
        assert.equal(await readFile(join(workspace, 'tracked.txt'), 'utf8'), conflict)
        assert.equal(git('ls-files', '-u'), index)
        assert.equal(git('rev-parse', marker), target)
        assert.equal(git('rev-parse', 'HEAD'), head)
        assert.equal(result, 'rejected')
        git(command, '--abort')
        // Ordinary history actions still work when the workspace is clean.
        if (method === 'revert') {
          await sidebarGit.revert(workspace, head)
          assert.equal(await readFile(join(workspace, 'tracked.txt'), 'utf8'), 'change\n')
        } else {
          git('switch', '-q', '-c', 'clean', `${target}^`)
          await sidebarGit.cherryPick(workspace, target)
          assert.equal(await readFile(join(workspace, 'tracked.txt'), 'utf8'), 'change\n')
        }
      })
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('commit previews cannot interpret revisions as file-writing options', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tockteam-sidebar-revision-'))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url))
  const git = (...args) => execFileSync('git', args, { cwd: temporary, encoding: 'utf8' }).trim()
  try {
    const bundle = join(temporary, 'git.mjs')
    await build({
      stdin: { contents: adaptBetterSidebarGit(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    })
    const sidebarGit = await import(pathToFileURL(bundle).href)
    git('init', '-q', '-b', 'main')
    await writeFile(join(temporary, 'tracked.txt'), 'committed\n')
    git('add', '--', 'tracked.txt')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'initial')
    const sentinel = join(temporary, 'protected.txt')
    await writeFile(sentinel, 'preserve me\n')
    const result = await sidebarGit.commitDiff(temporary, `--output=${sentinel}`).then(() => 'accepted', () => 'rejected')
    assert.equal(await readFile(sentinel, 'utf8'), 'preserve me\n')
    assert.equal(result, 'rejected')
    for (const revision of ['HEAD', git('rev-parse', 'HEAD'), git('rev-parse', '--short', 'HEAD')]) {
      assert.match(await sidebarGit.commitDiff(temporary, revision), /\+committed/)
    }
    if (process.platform !== 'win32') {
      const contentSentinel = `${sentinel}:tracked.txt`
      await writeFile(contentSentinel, 'preserve content\n')
      assert.equal(await sidebarGit.show(temporary, `--output=${sentinel}`, 'tracked.txt'), null)
      assert.equal(await readFile(contentSentinel, 'utf8'), 'preserve content\n')
    }
    assert.equal(await sidebarGit.show(temporary, 'HEAD', 'tracked.txt'), 'committed\n')
    assert.equal(await sidebarGit.show(temporary, 'HEAD', join(temporary, 'tracked.txt')), 'committed\n')
    assert.equal(await sidebarGit.show(temporary, 'HEAD', join(temporary, '..', 'outside.txt')), null)
    assert.equal(await sidebarGit.show(temporary, 'HEAD', 'missing.txt'), null)
    const directory = join(temporary, 'nested')
    await mkdir(directory)
    await writeFile(join(directory, 'deleted.txt'), 'historical\n')
    git('add', '--', 'nested/deleted.txt')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'nested file')
    assert.equal(await sidebarGit.show(directory, 'HEAD', join(directory, 'deleted.txt')), 'historical\n')
    await rm(directory, { recursive: true })
    assert.equal(await sidebarGit.show(temporary, 'HEAD', join(directory, 'deleted.txt')), 'historical\n')
    if (process.platform !== 'win32') {
      const alias = join(temporary, 'alias')
      await symlink(temporary, alias)
      assert.equal(await sidebarGit.show(alias, 'HEAD', join(alias, 'nested/deleted.txt')), 'historical\n')
      assert.equal(await sidebarGit.show(alias, 'HEAD', join(await realpath(temporary), 'nested/deleted.txt')), 'historical\n')
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('branch selection cannot restore files or interpret options', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'tockteam-sidebar-branch-'))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url))
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  try {
    const bundle = join(temporary, 'git.mjs')
    await build({
      stdin: { contents: adaptBetterSidebarGit(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    })
    const sidebarGit = await import(pathToFileURL(bundle).href)
    for (const selection of ['retired', '--detach', 'feature']) {
      await t.test(selection, async () => {
        const workspace = join(temporary, selection)
        await mkdir(workspace)
        git(workspace, 'init', '-q', '-b', 'main')
        await writeFile(join(workspace, 'retired'), 'committed\n')
        git(workspace, 'add', '-A')
        git(workspace, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'initial')
        git(workspace, 'branch', 'feature')
        // A branch list can become stale before its selection reaches the Host.
        git(workspace, 'branch', 'retired')
        git(workspace, 'branch', '-D', 'retired')
        await writeFile(join(workspace, 'retired'), 'unsaved work\n')
        const result = await sidebarGit.checkout(workspace, selection).then(() => 'switched', () => 'rejected')
        assert.equal(await readFile(join(workspace, 'retired'), 'utf8'), 'unsaved work\n')
        assert.equal(git(workspace, 'branch', '--show-current'), selection === 'feature' ? 'feature' : 'main')
        assert.equal(result, selection === 'feature' ? 'switched' : 'rejected')
        assert.equal(git(workspace, 'diff', '--cached'), '')
      })
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
