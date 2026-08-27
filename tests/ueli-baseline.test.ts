import assert from 'node:assert/strict'
import { copyFile, mkdtemp, mkdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { resolveGitPath, verifyVendorIntegrity, verifyVendorTree } from '../scripts/ueli/check-baseline.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const checker = join(repoRoot, 'scripts/ueli/check-baseline.mjs')

function runBaseline(args: string[] = []) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

function runGitFixture(root: string, args: string[]) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result
}

test('relative Git paths resolve against ordinary repository roots while absolute paths stay unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-ueli-git-path-'))
  try {
    runGitFixture(root, ['init', '--quiet'])
    const gitPath = runGitFixture(root, ['rev-parse', '--git-path', 'objects']).stdout.trim()
    assert.equal(isAbsolute(gitPath), false)
    assert.equal(resolveGitPath(root, gitPath), resolve(root, gitPath))

    const absoluteGitPath = resolve(root, 'linked-worktree', 'objects')
    assert.equal(resolveGitPath(root, absoluteGitPath), absoluteGitPath)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the tracked Ueli subtree matches the recorded v9.29.0 release offline', () => {
  const result = runBaseline()

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(
    result.stdout,
    /Ueli baseline verified: v9\.29\.0 c9670d61cb2576802adf99d95622c58538d265f3/u,
  )
  assert.match(result.stdout, /archive e5efc669abee255f07244bc17eab3f38bfeca12610ca6d7640154feee300bc0d/u)
})

test('the baseline guard rejects a changed manifest without editing pristine vendor source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-ueli-baseline-'))
  try {
    const manifestPath = join(root, 'baseline.json')
    const manifest = JSON.parse(await readFile(join(repoRoot, 'scripts/ueli/baseline.json'), 'utf8'))
    manifest.tree = '0000000000000000000000000000000000000000'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    const result = runBaseline(['--manifest', manifestPath])

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /manifest tree .* expected/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the baseline guard rejects changed raw release objects without editing vendor source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-ueli-objects-'))
  try {
    const objectsPath = join(root, 'release-objects.json')
    await copyFile(join(repoRoot, 'scripts/ueli/release-objects.json'), objectsPath)
    const objects = JSON.parse(await readFile(objectsPath, 'utf8'))
    objects.commitObject = `${objects.commitObject.slice(0, -4)}AAAA`
    await writeFile(objectsPath, `${JSON.stringify(objects, null, 2)}\n`)

    const result = runBaseline(['--release-objects', objectsPath])

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /commit raw object hash|commit object/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the baseline guard rejects non-canonical release object base64', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-ueli-base64-'))
  try {
    const objectsPath = join(root, 'release-objects.json')
    await copyFile(join(repoRoot, 'scripts/ueli/release-objects.json'), objectsPath)
    const objects = JSON.parse(await readFile(objectsPath, 'utf8'))
    objects.tagObject = objects.tagObject.replace(/=+$/u, '')
    await writeFile(objectsPath, `${JSON.stringify(objects, null, 2)}\n`)

    const result = runBaseline(['--release-objects', objectsPath])

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /canonical base64/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the baseline guard leaves vendor/ueli clean', () => {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching', '--', 'vendor/ueli'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(result.stdout.trim(), '')
})

test('the isolated vendor integrity seam rejects hidden drift and preserves symlink blobs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-ueli-fixture-'))
  const vendorPath = 'vendor/ueli'
  const vendorRoot = join(root, vendorPath)
  const trackedPath = join(vendorRoot, 'tracked.txt')
  const symlinkPath = join(vendorRoot, 'link.txt')
  try {
    await mkdir(vendorRoot, { recursive: true })
    await writeFile(trackedPath, 'tracked content\n')
    await symlink('tracked.txt', symlinkPath)
    await writeFile(join(root, '.gitignore'), 'vendor/ueli/ignored.txt\n')
    runGitFixture(root, ['init', '--quiet'])
    runGitFixture(root, ['config', 'user.name', 'TockTeam Test'])
    runGitFixture(root, ['config', 'user.email', 'tests@tockteam.invalid'])
    runGitFixture(root, ['add', vendorPath])
    runGitFixture(root, ['commit', '--quiet', '-m', 'fixture'])

    await verifyVendorIntegrity({ repoRoot: root, vendorPath })
    await verifyVendorTree({ repoRoot: root, vendorPath })

    await writeFile(join(vendorRoot, 'ignored.txt'), 'ignored\n')
    await assert.rejects(
      verifyVendorIntegrity({ repoRoot: root, vendorPath }),
      /ignored or untracked vendor path/u,
    )
    await rm(join(vendorRoot, 'ignored.txt'))

    await writeFile(join(vendorRoot, 'untracked.txt'), 'untracked\n')
    await assert.rejects(
      verifyVendorIntegrity({ repoRoot: root, vendorPath }),
      /ignored or untracked vendor path/u,
    )
    await rm(join(vendorRoot, 'untracked.txt'))

    runGitFixture(root, ['update-index', '--skip-worktree', `${vendorPath}/tracked.txt`])
    await assert.rejects(
      verifyVendorIntegrity({ repoRoot: root, vendorPath }),
      /skip-worktree/u,
    )
    runGitFixture(root, ['update-index', '--no-skip-worktree', `${vendorPath}/tracked.txt`])

    runGitFixture(root, ['update-index', '--assume-unchanged', `${vendorPath}/tracked.txt`])
    await assert.rejects(
      verifyVendorIntegrity({ repoRoot: root, vendorPath }),
      /assume-unchanged/u,
    )
    runGitFixture(root, ['update-index', '--no-assume-unchanged', `${vendorPath}/tracked.txt`])

    await writeFile(trackedPath, 'changed content\n')
    await assert.rejects(
      verifyVendorTree({ repoRoot: root, vendorPath }),
      /blob differs/u,
    )

    await writeFile(trackedPath, 'tracked content\n')
    await rm(symlinkPath)
    await symlink('missing-target.txt', symlinkPath)
    await assert.rejects(
      verifyVendorTree({ repoRoot: root, vendorPath }),
      /blob differs/u,
    )

    assert.equal(await readlink(symlinkPath), 'missing-target.txt')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
