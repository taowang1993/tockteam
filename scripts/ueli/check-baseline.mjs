#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, readFile, readlink } from 'node:fs/promises'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '../..')
const DEFAULT_MANIFEST_PATH = path.join(SCRIPT_DIR, 'baseline.json')
const EXPECTED = Object.freeze({
  schemaVersion: 1,
  implementationOracle: Object.freeze({
    repository: 'https://github.com/taowang1993/tockbot.git',
    revision: '7655149224cb989b66dc382c4e0f157ae4c4b312',
    role: 'read-only behavior and security implementation oracle',
  }),
  vendorPath: 'vendor/ueli',
  upstreamUrl: 'https://github.com/oliverschwendener/ueli.git',
  tag: 'v9.29.0',
  tagObject: '065cd29600a6c2834e75f67f4962e1e975ceeace',
  commit: 'c9670d61cb2576802adf99d95622c58538d265f3',
  tree: '10af7c99825bc4a16804660e162a891e3515fe93',
  sourceArchiveSha256: 'e5efc669abee255f07244bc17eab3f38bfeca12610ca6d7640154feee300bc0d',
  trackedFileCount: 1165,
  releaseObjects: 'scripts/ueli/release-objects.json',
  packageLock: Object.freeze({
    path: 'package-lock.json',
    sha256: '26cbf6c04170b2df0981575e2b1d55da56489690a7b39df81939e06b9530a4e1',
  }),
  notices: Object.freeze([
    Object.freeze({
      path: 'LICENSE',
      sha256: '8da6c1a79d367a41aadf313019833f4bb3f2ff55f0da5b522fd058183d2f9106',
    }),
    Object.freeze({
      path: 'assets/Extensions/ApplicationSearch/LICENSE',
      sha256: 'ed29c8f605a1a27368c832b47816405bc6bb18f1d3ec53372cc5c40e64ae680d',
    }),
  ]),
})

function fail(message) {
  throw new Error(`Ueli baseline check failed: ${message}`)
}

function runGit(args, { cwd, input, binary = false } = {}) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd,
    encoding: binary ? undefined : 'utf8',
    env: {
      ...process.env,
      GIT_NO_LAZY_FETCH: '1',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_CONFIG_NOSYSTEM: '1',
    },
    input,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error) fail(`git ${args.join(' ')} failed: ${result.error.message}`)
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout
    fail(`git ${args.join(' ')} exited ${result.status}: ${(stderr || stdout || '').trim()}`)
  }
  if (binary) return Buffer.from(result.stdout ?? [])
  return String(result.stdout ?? '').trim()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function sha256File(filePath) {
  return sha256(await readFile(filePath))
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`)
}

function parseArgs(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) continue
    const name = argument.slice(2)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) fail(`missing value for --${name}`)
    values.set(name, value)
    index += 1
  }
  return values
}

function loadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(`could not read JSON ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertManifest(manifest) {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (key === 'packageLock' || key === 'notices' || key === 'implementationOracle') continue
    assertEqual(manifest[key], expected, `manifest ${key}`)
  }
  assertEqual(JSON.stringify(manifest.implementationOracle), JSON.stringify(EXPECTED.implementationOracle), 'manifest implementationOracle')
  assertEqual(JSON.stringify(manifest.packageLock), JSON.stringify(EXPECTED.packageLock), 'manifest packageLock')
  assertEqual(JSON.stringify(manifest.notices), JSON.stringify(EXPECTED.notices), 'manifest notices')
}

function decodeObject(objects, key) {
  const encoded = objects[key]
  if (typeof encoded !== 'string' || !encoded) fail(`release object ${key} is missing`)
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
    fail(`release object ${key} is not canonical base64`)
  }
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.toString('base64') !== encoded) fail(`release object ${key} is not canonical base64`)
  return decoded
}

function verifyRawReleaseObjects(repoRoot, manifest, releaseObjectsPath) {
  const objects = loadJson(releaseObjectsPath)
  assertEqual(objects.schemaVersion, 1, 'release objects schemaVersion')
  const tagObject = decodeObject(objects, 'tagObject')
  const commitObject = decodeObject(objects, 'commitObject')
  const tagHash = sha1GitObject('tag', tagObject)
  const commitHash = sha1GitObject('commit', commitObject)
  assertEqual(tagHash, manifest.tagObject, 'tag raw object hash')
  assertEqual(commitHash, manifest.commit, 'commit raw object hash')

  const objectRoot = mkdtempSync(path.join(tmpdir(), 'tockteam-ueli-baseline-'))
  try {
    runGit(['init', '--bare', '--quiet', objectRoot], { cwd: repoRoot })
    const sourceObjects = runGit(['rev-parse', '--git-path', 'objects'], { cwd: repoRoot })
    const alternatesPath = path.join(objectRoot, 'objects', 'info', 'alternates')
    writeFileSync(alternatesPath, `${sourceObjects}\n`)
    const actualTagHash = runGit(['--git-dir', objectRoot, 'hash-object', '-t', 'tag', '-w', '--stdin'], {
      cwd: repoRoot,
      input: tagObject,
    })
    const actualCommitHash = runGit(['--git-dir', objectRoot, 'hash-object', '-t', 'commit', '-w', '--stdin'], {
      cwd: repoRoot,
      input: commitObject,
    })
    assertEqual(actualTagHash, manifest.tagObject, 'written tag object hash')
    assertEqual(actualCommitHash, manifest.commit, 'written commit object hash')
    assertEqual(runGit(['--git-dir', objectRoot, 'cat-file', '-t', manifest.tagObject], { cwd: repoRoot }), 'tag', 'tag object type')
    assertEqual(runGit(['--git-dir', objectRoot, 'cat-file', '-t', manifest.commit], { cwd: repoRoot }), 'commit', 'commit object type')

    const tagText = runGit(['--git-dir', objectRoot, 'cat-file', '-p', manifest.tagObject], { cwd: repoRoot })
    assertEqual(tagText.match(/^object ([0-9a-f]{40})$/mu)?.[1], manifest.commit, 'tag peeled object')
    assertEqual(tagText.match(/^type (\w+)$/mu)?.[1], 'commit', 'tag target type')
    assertEqual(tagText.match(/^tag (.+)$/mu)?.[1], manifest.tag, 'tag name')

    const commitText = runGit(['--git-dir', objectRoot, 'cat-file', '-p', manifest.commit], { cwd: repoRoot })
    assertEqual(commitText.match(/^tree ([0-9a-f]{40})$/mu)?.[1], manifest.tree, 'commit tree')
    const archive = runGit(['-c', 'tar.umask=0002', '--git-dir', objectRoot, 'archive', '--format=tar', manifest.commit], {
      cwd: repoRoot,
      binary: true,
    })
    assertEqual(sha256(archive), manifest.sourceArchiveSha256, 'reconstructed source archive sha256')
    return {
      tagObject: manifest.tagObject,
      commit: manifest.commit,
      tree: manifest.tree,
      archiveSha256: sha256(archive),
    }
  } finally {
    rmSync(objectRoot, { recursive: true, force: true })
  }
}

function parseTreeEntries(output) {
  return output.toString('utf8').split('\0').filter(Boolean).map((entry) => {
    const separator = entry.indexOf('\t')
    const [mode, type, object] = entry.slice(0, separator).split(' ')
    return { mode, type, object, path: entry.slice(separator + 1) }
  })
}

export async function verifyVendorTree({
  repoRoot = DEFAULT_REPO_ROOT,
  vendorPath = 'vendor/ueli',
  revision = 'HEAD',
} = {}) {
  const output = runGit(['ls-tree', '-r', '-z', revision, '--', vendorPath], {
    cwd: repoRoot,
    binary: true,
  })
  const entries = parseTreeEntries(output)
  if (entries.length === 0) fail(`committed vendor tree is empty: ${vendorPath}`)

  for (const entry of entries) {
    const physicalPath = path.join(repoRoot, entry.path)
    let stats
    try {
      stats = await lstat(physicalPath)
    } catch (error) {
      fail(`tracked vendor path is missing: ${entry.path} (${error instanceof Error ? error.message : String(error)})`)
    }
    if (entry.type !== 'blob') fail(`tracked vendor path is not a blob: ${entry.path}`)
    let content
    if (entry.mode === '120000') {
      if (!stats.isSymbolicLink()) fail(`tracked vendor symlink is not a symlink: ${entry.path}`)
      content = Buffer.from(await readlink(physicalPath), 'utf8')
    } else {
      if (!stats.isFile()) fail(`tracked vendor file is not a regular file: ${entry.path}`)
      content = await readFile(physicalPath)
    }
    const actualObject = sha1GitObject('blob', content)
    if (actualObject !== entry.object) {
      fail(`tracked vendor blob differs from committed tree: ${entry.path}`)
    }
  }

  return { trackedFileCount: entries.length }
}

export async function verifyVendorIntegrity({
  repoRoot = DEFAULT_REPO_ROOT,
  vendorPath = 'vendor/ueli',
  revision = 'HEAD',
} = {}) {
  const indexEntries = runGit(['ls-files', '-v', '-z', '--', vendorPath], { cwd: repoRoot })
    .split('\0')
    .filter(Boolean)
  const flagged = indexEntries.filter((entry) => entry[0] === 'S' || entry[0] === 'h')
  if (flagged.length > 0) {
    fail(`vendor index contains skip-worktree or assume-unchanged flag: ${flagged.join(', ')}`)
  }

  const status = runGit([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignored=matching',
    '--',
    vendorPath,
  ], { cwd: repoRoot })
  if (status) fail(`ignored or untracked vendor path (or modified tracked path): ${status}`)

  return verifyVendorTree({ repoRoot, vendorPath, revision })
}

function assertSubtreeMetadata(metadata, vendorPath, commit) {
  const lines = metadata.split(/\r?\n/u)
  const directoryLine = `git-subtree-dir: ${vendorPath}`
  const splitLine = `git-subtree-split: ${commit}`
  assertEqual(lines.filter((line) => line === directoryLine).length, 1, 'subtree directory metadata lines')
  assertEqual(lines.filter((line) => line === splitLine).length, 1, 'subtree split metadata lines')
}

function sha1GitObject(type, content) {
  return createHash('sha1')
    .update(`${type} ${content.length}\0`)
    .update(content)
    .digest('hex')
}

export async function checkBaseline({
  repoRoot = DEFAULT_REPO_ROOT,
  manifestPath = DEFAULT_MANIFEST_PATH,
  releaseObjectsPath,
} = {}) {
  const manifest = loadJson(manifestPath)
  assertManifest(manifest)
  const objectsPath = releaseObjectsPath ?? path.resolve(repoRoot, manifest.releaseObjects)
  const vendorRoot = path.resolve(repoRoot, manifest.vendorPath)

  const trackedTree = runGit(['rev-parse', `HEAD:${manifest.vendorPath}`], { cwd: repoRoot })
  assertEqual(trackedTree, manifest.tree, 'tracked vendor tree')

  const subtreeMetadata = runGit([
    'log',
    'HEAD',
    '--format=%B',
    '--grep=^git-subtree-dir: vendor/ueli$',
    '-1',
  ], { cwd: repoRoot })
  assertSubtreeMetadata(subtreeMetadata, manifest.vendorPath, manifest.commit)

  const { trackedFileCount } = await verifyVendorIntegrity({
    repoRoot,
    vendorPath: manifest.vendorPath,
    revision: 'HEAD',
  })
  assertEqual(trackedFileCount, manifest.trackedFileCount, 'tracked vendor file count')

  for (const entry of [manifest.packageLock, ...manifest.notices]) {
    const digest = await sha256File(path.join(vendorRoot, entry.path))
    assertEqual(digest, entry.sha256, `vendor ${entry.path} sha256`)
  }

  const packageJson = loadJson(path.join(vendorRoot, 'package.json'))
  assertEqual(`${packageJson.name}@${packageJson.version}`, 'ueli@9.29.0', 'vendor package identity')
  assertEqual(packageJson.license, 'MIT', 'vendor package license')

  const release = verifyRawReleaseObjects(repoRoot, manifest, objectsPath)
  return { manifest, trackedFileCount, release }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoRoot = path.resolve(args.get('repo-root') ?? DEFAULT_REPO_ROOT)
  const manifestPath = path.resolve(args.get('manifest') ?? path.join(repoRoot, 'scripts/ueli/baseline.json'))
  const manifest = loadJson(manifestPath)
  const releaseObjectsPath = path.resolve(args.get('release-objects') ?? path.resolve(repoRoot, manifest.releaseObjects))
  const result = await checkBaseline({ repoRoot, manifestPath, releaseObjectsPath })
  console.log(
    `Ueli baseline verified: ${result.manifest.tag} ${result.manifest.commit} (${result.manifest.tree}, ${result.trackedFileCount} files; archive ${result.release.archiveSha256})`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
