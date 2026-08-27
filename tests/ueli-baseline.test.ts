import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/u, '')
const checker = join(repoRoot, 'scripts/ueli/check-baseline.mjs')

function runBaseline(args: string[] = []) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

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

test('the baseline guard leaves vendor/ueli clean', () => {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', 'vendor/ueli'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(result.stdout.trim(), '')
})
