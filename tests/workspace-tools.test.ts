import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { authorizedSessionWorkspace } from '../plugins/sidebar/src/index.ts'
import {
  mutateWorkspace,
  readWorkspaceFacts,
} from '../plugins/sidebar/src/git-workspace.ts'
import {
  mapBetterSidebarFile,
  mapBetterSidebarTree,
  workspaceChangesFromBetterSidebar,
} from '../plugins/sidebar/src/client/better-sidebar-api.ts'

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}

test('workspace APIs bind paths to the owning Host session', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'tockteam-authorized-workspace-'))
  const other = mkdtempSync(join(tmpdir(), 'tockteam-other-workspace-'))
  const sessions = {
    get: (id: string) => id === 'session' ? { header: { cwd: workspace } } : undefined,
  }
  try {
    assert.equal(authorizedSessionWorkspace(sessions, 'session', workspace), realpathSync(workspace))
    assert.equal(authorizedSessionWorkspace(sessions, 'session', other), undefined)
    assert.equal(authorizedSessionWorkspace(sessions, 'missing', workspace), undefined)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
    rmSync(other, { recursive: true, force: true })
  }
})

test('workspace extension provides repository facts and branch creation', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'tockteam-workspace-tools-'))
  try {
    git(workspace, ['init', '-b', 'main'])
    git(workspace, ['config', 'user.name', 'TockTeam Test'])
    git(workspace, ['config', 'user.email', 'tockteam@example.test'])
    writeFileSync(join(workspace, 'README.md'), 'first\n')
    git(workspace, ['add', 'README.md'])
    git(workspace, ['commit', '-m', 'initial'])
    const facts = await readWorkspaceFacts(workspace)
    assert.equal(facts.kind, 'repository')
    assert.equal(facts.name, basename(workspace))
    assert.equal(facts.hasRemote, false)

    const branched = await mutateWorkspace(workspace, { action: 'create-branch', branch: 'panel-test' })
    assert.equal(branched.facts.kind, 'repository')
    assert.equal(git(workspace, ['branch', '--show-current']).trim(), 'panel-test')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('Better Sidebar status maps into the TockTeam workspace model', () => {
  assert.deepEqual(workspaceChangesFromBetterSidebar([
    { path: 'staged.ts', xy: 'M ' },
    { path: 'renamed.ts', xy: 'R ' },
    { path: 'loose.txt', xy: '??' },
  ]), [
    { path: 'loose.txt', oldPath: null, status: 'untracked', staged: false },
    { path: 'renamed.ts', oldPath: null, status: 'renamed', staged: true },
    { path: 'staged.ts', oldPath: null, status: 'modified', staged: true },
  ])
})

test('workspace files adapt Better Sidebar responses to the TockTeam UI', () => {
  const root = mapBetterSidebarTree('/workspace', {
    path: '/workspace/src',
    entries: [
      { name: 'nested', path: '/workspace/src/nested', isDir: true, hidden: false },
      { name: 'index.ts', path: '/workspace/src/index.ts', isDir: false, hidden: false },
    ],
    truncated: false,
  })
  assert.equal(root.kind, 'directory')
  if (root.kind !== 'directory') return
  assert.equal(root.parent, '/workspace')
  assert.deepEqual(root.entries.map(entry => [entry.name, entry.kind]), [
    ['nested', 'directory'],
    ['index.ts', 'file'],
  ])
  const preview = mapBetterSidebarFile('/workspace', '/workspace/src/index.ts', {
    kind: 'text',
    content: 'export const ready = true\n',
    truncated: false,
  })
  assert.equal(preview.kind, 'file')
  if (preview.kind === 'file') assert.match(preview.content ?? '', /ready = true/)
})

test('workspace changes keep both index and working-tree edits reviewable', () => {
  assert.deepEqual(workspaceChangesFromBetterSidebar([
    { path: 'partial.ts', xy: 'MM' },
    { path: 'removed.ts', xy: 'AD' },
    { path: 'conflict.ts', xy: 'UU' },
  ]), [
    { path: 'conflict.ts', oldPath: null, status: 'conflicted', staged: false },
    { path: 'partial.ts', oldPath: null, status: 'modified', staged: true },
    { path: 'partial.ts', oldPath: null, status: 'modified', staged: false },
    { path: 'removed.ts', oldPath: null, status: 'added', staged: true },
    { path: 'removed.ts', oldPath: null, status: 'deleted', staged: false },
  ])
})

test('workspace file navigation preserves POSIX path identity and filesystem roots', () => {
  for (const [cwd, path, parent] of [
    ['/workspace', '/workspace/folder\\name/child', '/workspace/folder\\name'],
    ['/workspace\\name', '/workspace\\name/child', '/workspace\\name'],
    ['/', '/child', '/'],
    ['/', '/', null],
    ['/workspace/', '/workspace/child/', '/workspace'],
    ['/workspace', '/workspace-sibling/child', null],
    ['/workspace', '/elsewhere/child', null],
  ] as const) {
    const listing = mapBetterSidebarTree(cwd, { path, entries: [], truncated: false })
    assert.equal(listing.parent, parent, `parent of ${path} in ${cwd}`)
    const file = mapBetterSidebarFile(cwd, path, { kind: 'text', content: '', truncated: false })
    assert.equal(file.parent, parent ?? cwd, `file parent of ${path} in ${cwd}`)
  }
})

test('workspace file navigation keeps Windows drive roots absolute and supports UNC paths', () => {
  for (const [cwd, path, parent] of [
    ['C:\\', 'C:\\child', 'C:/'],
    ['C:/', 'C:/child/', 'C:/'],
    ['C:\\', 'C:\\', null],
    ['C:\\workspace', 'C:\\workspace\\nested\\child', 'C:/workspace/nested'],
    ['C:\\workspace', 'C:\\workspace-sibling\\child', null],
    ['C:\\workspace', 'D:\\workspace\\child', null],
    ['\\\\server\\share\\', '\\\\server\\share\\child', '//server/share'],
    ['\\\\server\\share', '\\\\server\\share', null],
    ['//server/share/', '//server/share/child', '//server/share'],
  ] as const) {
    const listing = mapBetterSidebarTree(cwd, { path, entries: [], truncated: false })
    assert.equal(listing.parent, parent, `parent of ${path} in ${cwd}`)
    const file = mapBetterSidebarFile(cwd, path, { kind: 'binary', size: 0, truncated: false })
    assert.equal(file.parent, parent ?? cwd, `file parent of ${path} in ${cwd}`)
  }
})
