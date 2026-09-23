import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'
import { adaptBetterSidebarGit } from '../scripts/better-sidebar-upstream-adapter.mjs'

test('repository selection distinguishes literal POSIX backslashes', {
  skip: process.platform === 'win32',
}, async () => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-sidebar-backslash-')))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url))
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  try {
    const bundle = join(temporary, 'git.mjs')
    await build({
      stdin: { contents: adaptBetterSidebarGit(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    })
    const sidebarGit = await import(pathToFileURL(bundle).href)
    const sibling = join(temporary, 'project')
    const selected = `${sibling}\\`
    for (const cwd of [sibling, selected]) {
      await mkdir(cwd)
      git(cwd, 'init', '-q', '-b', 'main')
      git(cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.test',
        'commit', '--allow-empty', '-qm', 'initial')
      await writeFile(join(cwd, 'pending.txt'), 'pending\n')
    }
    await sidebarGit.stage(temporary, undefined, selected)
    assert.equal(git(sibling, 'diff', '--cached', '--name-only'), '', 'the sibling index must stay untouched')
    assert.equal(git(selected, 'diff', '--cached', '--name-only'), 'pending.txt\n')
    const status = await sidebarGit.status(temporary, selected)
    assert.equal(status.root, selected)
    assert.deepEqual(new Set(status.repositories), new Set([sibling, selected]))
    await sidebarGit.unstage(temporary, undefined, `${selected}/`)
    assert.equal(git(selected, 'diff', '--cached', '--name-only'), '')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('individual Git file actions treat pattern characters as literal filenames', async t => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-sidebar-git-literal-')))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url))
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  try {
    const bundle = join(temporary, 'git.mjs')
    await build({
      stdin: { contents: adaptBetterSidebarGit(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    })
    const sidebarGit = await import(pathToFileURL(bundle).href)
    const names = process.platform === 'win32' ? ['[ab].txt'] : ['[ab].txt', '*.txt', ':(glob)*.txt']
    for (const [index, target] of names.entries()) {
      for (const action of ['diff', 'stage', 'unstage', 'discard']) {
        await t.test(`${action}: ${target}`, async () => {
          const workspace = join(temporary, `${index}-${action}`)
          await mkdir(workspace)
          git(workspace, 'init', '-q', '-b', 'main')
          const files = [target, 'a.txt', 'b.txt']
          for (const name of files) await writeFile(join(workspace, name), 'before\n')
          git(workspace, 'add', '-A')
          git(workspace, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'initial')
          for (const name of files) await writeFile(join(workspace, name), `after ${name}\n`)
          if (action === 'diff') {
            const diff = await sidebarGit.diff(workspace, target, false)
            assert.ok(diff.includes(`+after ${target}`))
            assert.ok(!diff.includes('+after a.txt'))
            assert.ok(!diff.includes('+after b.txt'))
          } else if (action === 'discard') {
            await sidebarGit.discard(workspace, target)
            assert.equal(await readFile(join(workspace, target), 'utf8'), 'before\n')
            for (const name of ['a.txt', 'b.txt']) {
              assert.equal(await readFile(join(workspace, name), 'utf8'), `after ${name}\n`)
            }
          } else {
            if (action === 'unstage') await sidebarGit.stage(workspace)
            await sidebarGit[action](workspace, target)
            const staged = git(workspace, 'diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean)
            assert.deepEqual(staged.sort(), action === 'stage' ? [target] : ['a.txt', 'b.txt'])
            // Omitting a filename must still act on the whole repository.
            await sidebarGit.unstage(workspace)
            assert.equal(git(workspace, 'diff', '--cached', '--name-only'), '')
          }
        })
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('bundled sidebar Git reads and stages only the exact workspace path', {
  skip: process.platform === 'win32' ? 'Windows normalizes trailing whitespace in directory names' : false,
}, async () => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-sidebar-git-path-')))
  const source = fileURLToPath(new URL('../upstream/DSH-better-sidebar/src/git.ts', import.meta.url))
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  try {
    const bundle = join(temporary, 'git.mjs')
    await build({
      stdin: { contents: adaptBetterSidebarGit(await readFile(source, 'utf8')), loader: 'ts', resolveDir: dirname(source) },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    })
    const sidebarGit = await import(pathToFileURL(bundle).href)
    for (const [index, ending] of [' ', '\t', '\n', '\r'].entries()) {
      const sibling = join(temporary, `project-${index}`)
      const workspace = `${sibling}${ending}`
      for (const path of [sibling, workspace]) {
        await mkdir(path)
        git(path, 'init', '-q', '-b', 'main')
        git(path, '-c', 'user.name=Test', '-c', 'user.email=test@example.test',
          'commit', '--allow-empty', '-qm', 'initial')
      }
      await writeFile(join(sibling, 'sibling.txt'), 'must stay untracked\n')
      await writeFile(join(workspace, 'workspace.txt'), 'must be staged\n')
      const status = await sidebarGit.status(workspace)
      assert.equal(status.root, workspace, `root with ending ${JSON.stringify(ending)}`)
      assert.deepEqual(status.entries, [{ path: 'workspace.txt', xy: '??' }])
      await sidebarGit.stage(workspace)
      assert.deepEqual((await sidebarGit.status(workspace)).entries, [{ path: 'workspace.txt', xy: 'A ' }])
      assert.equal(git(sibling, 'diff', '--cached', '--name-only'), '')
      assert.equal(git(sibling, 'status', '--porcelain'), '?? sibling.txt\n')
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
