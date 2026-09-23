import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import {
  parseGitReviewDiff,
  reviewCommitFromBetterSidebar,
} from '../plugins/sidebar/src/client/review-diff.ts'
import {
  formatReviewComment,
  formatReviewRequest,
} from '../plugins/sidebar/src/client/review-comments.ts'

test('Git review preserves filenames with spaces and escaped characters from real patches', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tockcoder-review-paths-'))
  const names = ['with space.md', '测试 file.md']
  if (process.platform !== 'win32') names.push('trailing .md ', 'with\ttab.md')
  try {
    execFileSync('git', ['init', '-q', directory])
    for (const name of names) writeFileSync(join(directory, name), 'before\n')
    execFileSync('git', ['add', '.'], { cwd: directory })
    for (const name of names) writeFileSync(join(directory, name), 'after\n')
    const patch = execFileSync('git', ['diff', '--no-ext-diff', '--no-color'], { cwd: directory, encoding: 'utf8' })
    const files = parseGitReviewDiff(patch)
    assert.deepEqual(files.map(file => file.path).sort(), [...names].sort())
    assert.deepEqual(files.map(file => file.oldPath).sort(), [...names].sort())
    for (const file of files) assert.equal(file.lines.at(-1)?.content, 'after')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Git review preserves POSIX-only filenames on every parser platform', () => {
  for (const path of ['trailing .md ', 'with\ttab.md']) {
    const [file] = parseGitReviewDiff([
      `diff --git ${JSON.stringify(`a/${path}`)} ${JSON.stringify(`b/${path}`)}`,
      `--- ${JSON.stringify(`a/${path}`)}`,
      `+++ ${JSON.stringify(`b/${path}`)}`,
      '@@ -1 +1 @@', '-before', '+after',
    ].join('\n'))
    assert.equal(file?.path, path)
    assert.equal(file?.oldPath, path)
    assert.equal(file?.lines.at(-1)?.content, 'after')
  }
})

test('Git review preserves both paths in rename-only patches with ambiguous headers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tockcoder-review-renames-'))
  try {
    execFileSync('git', ['init', '-q', directory])
    mkdirSync(join(directory, 'old b'))
    mkdirSync(join(directory, 'new b'))
    writeFileSync(join(directory, 'old b/file.md'), 'unchanged\n')
    execFileSync('git', ['add', '.'], { cwd: directory })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test',
      'commit', '-qm', 'initial'], { cwd: directory })
    renameSync(join(directory, 'old b/file.md'), join(directory, 'new b/file.md'))
    execFileSync('git', ['add', '-A'], { cwd: directory })
    const patch = execFileSync('git', ['diff', '--cached', '--no-ext-diff', '--no-color', '-M'], {
      cwd: directory, encoding: 'utf8',
    })
    const [file] = parseGitReviewDiff(patch)
    assert.equal(file?.status, 'renamed')
    assert.equal(file?.path, 'new b/file.md')
    assert.equal(file?.oldPath, 'old b/file.md')
    assert.deepEqual(file?.lines, [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Git review preserves ambiguous filenames in binary patches without text headers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tockcoder-review-binary-'))
  try {
    execFileSync('git', ['init', '-q', directory])
    mkdirSync(join(directory, 'assets b'))
    const path = 'assets b/file.bin'
    writeFileSync(join(directory, path), Buffer.from([0, 1]))
    execFileSync('git', ['add', '.'], { cwd: directory })
    writeFileSync(join(directory, path), Buffer.from([0, 2]))
    const patch = execFileSync('git', ['diff', '--no-ext-diff', '--no-color'], {
      cwd: directory, encoding: 'utf8',
    })
    const [file] = parseGitReviewDiff(patch)
    assert.equal(file?.status, 'binary')
    assert.equal(file?.path, path)
    assert.equal(file?.oldPath, path)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Git review paths decode quoted UTF-8 names', () => {
  const files = parseGitReviewDiff([
    'diff --git "a/notes/\\346\\265\\213\\350\\257\\225 file.md" "b/notes/\\346\\265\\213\\350\\257\\225 file.md"',
    '--- "a/notes/\\346\\265\\213\\350\\257\\225 file.md"',
    '+++ "b/notes/\\346\\265\\213\\350\\257\\225 file.md"',
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n'))

  assert.equal(files.length, 1)
  assert.equal(files[0]?.oldPath, 'notes/测试 file.md')
  assert.equal(files[0]?.path, 'notes/测试 file.md')
})

test('Git review decodes quoted filenames without Node globals in the browser', () => {
  const source = stripTypeScriptTypes(readFileSync(new URL(
    '../plugins/sidebar/src/client/review-diff.ts', import.meta.url,
  ), 'utf8')).replaceAll('export function ', 'function ')
  const parse = runInNewContext(`${source}\nparseGitReviewDiff`, {
    TextEncoder, TextDecoder,
  }) as typeof parseGitReviewDiff
  const [file] = parse('diff --git "a/\\346\\265\\213.md" "b/\\346\\265\\213.md"')
  assert.equal(file?.path, '测.md')
})

test('Git review preserves header-like hunk content and its line numbers', () => {
  const [file] = parseGitReviewDiff([
    'diff --git a/note.md b/note.md',
    '--- a/note.md',
    '+++ b/note.md',
    '@@ -1,3 +1,3 @@',
    '--- old heading',
    '----',
    '+++ new heading',
    '++++',
    ' unchanged',
  ].join('\n'))
  assert.equal(file?.path, 'note.md')
  assert.equal(file?.oldPath, 'note.md')
  assert.equal(file?.additions, 2)
  assert.equal(file?.deletions, 2)
  assert.deepEqual(file?.lines.map(line => [line.content, line.oldLine, line.newLine]), [
    ['-- old heading', 1, null], ['---', 2, null],
    ['++ new heading', null, 1], ['+++', null, 2], ['unchanged', 3, 3],
  ])
})

test('Git review accepts renames with only one quoted filename', () => {
  for (const [from, to, oldPath, path] of [
    ['a/plain.md', '"b/\\346\\265\\213.md"', 'plain.md', '测.md'],
    ['"a/\\346\\265\\213.md"', 'b/plain.md', '测.md', 'plain.md'],
  ]) {
    const [file] = parseGitReviewDiff([
      `diff --git ${from} ${to}`, 'similarity index 100%',
      `rename from ${oldPath}`, `rename to ${path}`,
    ].join('\n'))
    assert.equal(file?.oldPath, oldPath)
    assert.equal(file?.path, path)
    assert.equal(file?.status, 'renamed')
  }
})

test('Better Sidebar commit patches become line-addressable reviews', () => {
  const diff = [
    'diff --git a/src/value.ts b/src/value.ts',
    '--- a/src/value.ts',
    '+++ b/src/value.ts',
    '@@ -1,2 +1,2 @@',
    '-export const value = 1',
    '+export const value = 2',
    ' export const stable = true',
  ].join('\n')
  const files = parseGitReviewDiff(diff)
  assert.equal(files.length, 1)
  assert.equal(files[0]?.additions, 1)
  assert.equal(files[0]?.deletions, 1)
  assert.deepEqual(files[0]?.lines.map(line => [
    line.type,
    line.oldLine,
    line.newLine,
  ]), [
    ['deletion', 1, null],
    ['addition', null, 1],
    ['context', 2, 2],
  ])
  const commit = reviewCommitFromBetterSidebar({
    hash: 'abc1234',
    hashFull: 'abc1234567890',
    subject: 'fix value',
    author: 'TockTeam Test',
    date: '2026-08-12 10:00:00 +0800',
    refs: 'HEAD -> main',
  }, diff)
  assert.equal(commit.shortId, 'abc1234')
  assert.equal(commit.files[0]?.path, 'src/value.ts')

  const comment = formatReviewComment(commit, {
    id: 'review-1',
    sessionId: 'session-1',
    workspacePath: '/workspace',
    branch: 'main',
    commitId: commit.id,
    filePath: 'src/value.ts',
    line: 1,
    side: 'new',
    body: 'Keep this value configurable.',
    createdAt: '2026-08-12T02:00:00.000Z',
    request: '',
  })
  assert.match(comment, /src\/value\.ts:R1/)
  assert.match(comment, /Code: export const value = 2/)
  assert.match(formatReviewRequest([comment]), /actionable code-change request/)
})
