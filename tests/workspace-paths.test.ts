import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { authorizedSessionWorkspace } from '../plugins/sidebar/src/index.ts'
import { mutateWorkspace, readWorkspaceFacts } from '../plugins/sidebar/src/git-workspace.ts'

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

function initRepository(cwd: string): void {
  mkdirSync(cwd)
  git(cwd, ['init', '-b', 'main'])
  git(cwd, ['-c', 'user.name=TockTeam Test', '-c', 'user.email=test@example.test',
    'commit', '--allow-empty', '-m', 'initial'])
}

test('workspace authorization and Git actions preserve trailing spaces in directory names', {
  skip: process.platform === 'win32' ? 'Windows normalizes trailing spaces in directory names' : false,
}, async () => {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'tockteam-workspace-path-')))
  const sibling = join(temporary, 'project')
  const workspace = join(temporary, 'project ')
  try {
    initRepository(sibling)
    initRepository(workspace)
    const sessions = { get: () => ({ header: { cwd: workspace } }) }
    assert.equal(authorizedSessionWorkspace(sessions, 'session', sibling), undefined)
    assert.equal(authorizedSessionWorkspace(sessions, 'session', workspace), workspace)
    const facts = await readWorkspaceFacts(workspace)
    assert.equal(facts.cwd, workspace)
    assert.equal(facts.root, workspace)
    await mutateWorkspace(workspace, { action: 'create-branch', branch: 'exact-workspace' })
    assert.equal(git(workspace, ['branch', '--show-current']), 'exact-workspace')
    assert.equal(git(sibling, ['branch', '--show-current']), 'main')
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('first push honors the configured push remote instead of assuming origin', async () => {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'tockteam-workspace-push-')))
  const workspace = join(temporary, 'project')
  const remote = join(temporary, 'published.git')
  const origin = join(temporary, 'origin.git')
  try {
    initRepository(workspace)
    git(temporary, ['init', '--bare', remote])
    git(temporary, ['init', '--bare', origin])
    git(workspace, ['remote', 'add', 'origin', origin])
    git(workspace, ['remote', 'add', 'publish', remote])
    git(workspace, ['config', 'remote.pushDefault', 'publish'])
    const result = await mutateWorkspace(workspace, { action: 'push' })
    assert.equal(result.facts.ahead, 0)
    assert.equal(git(workspace, ['rev-parse', '--abbrev-ref', '@{upstream}']), 'publish/main')
    assert.equal(git(remote, ['rev-parse', 'refs/heads/main']), git(workspace, ['rev-parse', 'HEAD']))
    assert.equal(git(origin, ['for-each-ref', '--format=%(refname)', 'refs/heads/']), '')
    git(workspace, ['switch', '-c', 'topic'])
    git(workspace, ['config', 'branch.topic.pushRemote', 'origin'])
    await mutateWorkspace(workspace, { action: 'push' })
    assert.equal(git(workspace, ['rev-parse', '--abbrev-ref', '@{upstream}']), 'origin/topic')
    assert.equal(git(origin, ['rev-parse', 'refs/heads/topic']), git(workspace, ['rev-parse', 'HEAD']))
    assert.equal(git(remote, ['for-each-ref', '--format=%(refname)', 'refs/heads/topic']), '')
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('Git root parsing removes only its output newline', { skip: process.platform === 'win32' }, async () => {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'tockteam-workspace-path-')))
  try {
    for (const ending of ['\t', '\n', '\r']) {
      const workspace = join(temporary, `project${ending}`)
      initRepository(workspace)
      assert.equal((await readWorkspaceFacts(workspace)).root, workspace)
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('push establishes a sole named remote, reuses its upstream, and rejects detached HEAD', async () => {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'tockteam-workspace-push-')))
  const workspace = join(temporary, 'project')
  const remote = join(temporary, 'published.git')
  try {
    initRepository(workspace)
    await assert.rejects(mutateWorkspace(workspace, { action: 'push' }), /no Git remote/)
    git(temporary, ['init', '--bare', remote])
    git(workspace, ['remote', 'add', 'publish', remote])
    git(workspace, ['config', 'push.default', 'simple'])
    await mutateWorkspace(workspace, { action: 'push' })
    assert.equal(git(workspace, ['config', 'push.default']), 'simple')
    assert.equal(git(workspace, ['rev-parse', '--abbrev-ref', '@{upstream}']), 'publish/main')
    git(workspace, ['-c', 'user.name=TockTeam Test', '-c', 'user.email=test@example.test',
      'commit', '--allow-empty', '-m', 'second'])
    assert.equal((await readWorkspaceFacts(workspace)).ahead, 1)
    assert.equal((await mutateWorkspace(workspace, { action: 'push' })).facts.ahead, 0)
    const pushed = git(remote, ['rev-parse', 'refs/heads/main'])
    assert.equal(pushed, git(workspace, ['rev-parse', 'HEAD']))
    git(workspace, ['checkout', '--detach'])
    await assert.rejects(mutateWorkspace(workspace, { action: 'push' }), /detached HEAD/)
    assert.equal(git(remote, ['rev-parse', 'refs/heads/main']), pushed)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
