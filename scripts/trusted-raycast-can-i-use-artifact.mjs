#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
  writeSync,
  constants as fsConstants,
} from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TAR = '/usr/bin/tar'
const ARTIFACT_ROOT = 'tockteam-raycast-can-i-use-artifact'
const SOURCE_REVISION = '186d955eda64f9e956b25a3fdf5566b1d38f57f2'
const DATA_CAPSULE_SHA256 = '09a21a4f83e27fe07d4b71ac5b8e531ac1fb8f4713ca0f7305b8cf07d5d49035'
const DATA_CAPSULE_BYTES = 11_301_166
const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_ARCHIVE_LIST_BYTES = 4 * 1024 * 1024
const EPOCH_SECONDS = 0
const EPOCH_DATE = new Date(EPOCH_SECONDS * 1000)

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultInputs = Object.freeze({
  sourceArchive: join(repository, 'plugins/trusted-raycast/vendor/can-i-use-source.tar'),
  translateArchive: join(repository, 'plugins/trusted-raycast/vendor/google-translate.tar'),
  dataAsset: join(repository, 'plugins/trusted-raycast/vendor/can-i-use-data.json.gz'),
})

export const TRUSTED_RAYCAST_CAN_I_USE_ARTIFACT_PINS = Object.freeze({
  artifactRoot: ARTIFACT_ROOT,
  sourceArchive: Object.freeze({ bytes: 3_246_080, sha256: 'cd79b55c49f36836970b56d9f7ecef39f89a4855bb5d20aca5576299edb2837c' }),
  translateArchive: Object.freeze({ bytes: 9_031_680, sha256: '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac' }),
  dataAsset: Object.freeze({ bytes: 793_106, sha256: '6e919a283fcb9d940b129cf2796b6e2b1355630c24309db70177dde45d55a7bb' }),
  dataCapsule: Object.freeze({ bytes: DATA_CAPSULE_BYTES, sha256: DATA_CAPSULE_SHA256 }),
})

const sourceArchiveMembers = Object.freeze([
  'can-i-use/',
  'can-i-use/assets/',
  'can-i-use/metadata/',
  'can-i-use/src/',
  'can-i-use/src/components/',
  'can-i-use/.gitignore',
  'can-i-use/.prettierrc',
  'can-i-use/CHANGELOG.md',
  'can-i-use/README.md',
  'can-i-use/assets/icon.png',
  'can-i-use/eslint.config.js',
  'can-i-use/metadata/can-i-use-1.png',
  'can-i-use/metadata/can-i-use-2.png',
  'can-i-use/package-lock.json',
  'can-i-use/package.json',
  'can-i-use/src/components/FeatureDetail.tsx',
  'can-i-use/src/index.tsx',
  'can-i-use/src/utils.ts',
  'can-i-use/tsconfig.json',
])

const reviewedRuntimeFiles = Object.freeze({
  react: Object.freeze([
    'LICENSE',
    'README.md',
    'compiler-runtime.js',
    'index.js',
    'jsx-dev-runtime.js',
    'jsx-dev-runtime.react-server.js',
    'jsx-runtime.js',
    'jsx-runtime.react-server.js',
    'package.json',
    'react.react-server.js',
    'cjs/react-compiler-runtime.development.js',
    'cjs/react-compiler-runtime.production.js',
    'cjs/react-compiler-runtime.profiling.js',
    'cjs/react-jsx-dev-runtime.development.js',
    'cjs/react-jsx-dev-runtime.production.js',
    'cjs/react-jsx-dev-runtime.profiling.js',
    'cjs/react-jsx-dev-runtime.react-server.development.js',
    'cjs/react-jsx-dev-runtime.react-server.production.js',
    'cjs/react-jsx-runtime.development.js',
    'cjs/react-jsx-runtime.production.js',
    'cjs/react-jsx-runtime.profiling.js',
    'cjs/react-jsx-runtime.react-server.development.js',
    'cjs/react-jsx-runtime.react-server.production.js',
    'cjs/react.development.js',
    'cjs/react.production.js',
    'cjs/react.react-server.development.js',
    'cjs/react.react-server.production.js',
  ]),
  'react-reconciler': Object.freeze([
    'LICENSE',
    'README.md',
    'constants.js',
    'index.js',
    'package.json',
    'reflection.js',
    'cjs/react-reconciler-constants.development.js',
    'cjs/react-reconciler-constants.production.js',
    'cjs/react-reconciler-reflection.development.js',
    'cjs/react-reconciler-reflection.production.js',
    'cjs/react-reconciler.development.js',
    'cjs/react-reconciler.production.js',
    'cjs/react-reconciler.profiling.js',
  ]),
  scheduler: Object.freeze([
    'LICENSE',
    'README.md',
    'index.js',
    'index.native.js',
    'package.json',
    'unstable_mock.js',
    'unstable_post_task.js',
    'cjs/scheduler-unstable_mock.development.js',
    'cjs/scheduler-unstable_mock.production.js',
    'cjs/scheduler-unstable_post_task.development.js',
    'cjs/scheduler-unstable_post_task.production.js',
    'cjs/scheduler.development.js',
    'cjs/scheduler.native.development.js',
    'cjs/scheduler.native.production.js',
    'cjs/scheduler.production.js',
  ]),
})

const runtimePackageVersions = Object.freeze({
  react: '19.0.0',
  'react-reconciler': '0.31.0',
  scheduler: '0.25.0',
})
const runtimePackageNames = Object.freeze(Object.keys(runtimePackageVersions).sort())
const capsuleEntries = Object.freeze([
  Object.freeze({ path: 'CAN_I_USE_ATTRIBUTION.md', bytes: 910, sha256: '791f9758d274b29ee450352421702dd1b855790f2b2fe3416d7b90e6a9f95bc1' }),
  Object.freeze({ path: 'THIRD_PARTY_NOTICES.md', bytes: 3365, sha256: '34a64c8a2e2f82bff781800a546ec78502b4a2aed40aea56e239a42c48b7c068' }),
  Object.freeze({ path: 'agents.json', bytes: 26939, sha256: '29dfea89783e681989119c42db3242672aeded5049afcd02a62fe909247771ca' }),
  Object.freeze({ path: 'canonical-targets.json', bytes: 10202, sha256: 'ff486a8af2f3d41d5cef835788cc82b4e2802757cd1c0aa3d93c0fc5e597bea9' }),
  Object.freeze({ path: 'catalog.json', bytes: 70845, sha256: '03c6c8d744d920a56585a8315f8f390a9205f97692f1afb4d78155c97f78e3bb' }),
  Object.freeze({ path: 'defaults.json', bytes: 806, sha256: 'a9fb212d0916d2741a2c21611d9d7765f6dffb94b4bd91a95ab8707f0081739f' }),
  Object.freeze({ path: 'licenses/baseline-browser-mapping.txt', bytes: 11357, sha256: 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4' }),
  Object.freeze({ path: 'licenses/browserslist.txt', bytes: 1118, sha256: 'f25bf9bf3ae8984bcd43bf7fb8f78e7eec8d577081fb8d0989cfa7c67ecebb8e' }),
  Object.freeze({ path: 'licenses/caniuse-api.txt', bytes: 1084, sha256: '6dba40acdc8df5c99941018d203bc5507edfb0d99ad0f13c1fe365f8b564be0f' }),
  Object.freeze({ path: 'licenses/caniuse-lite.txt', bytes: 18651, sha256: 'fd3a263fe19ed8faa9068b43abaebafc02c77897b0c6fc09abc04bb592e5f16e' }),
  Object.freeze({ path: 'licenses/electron-to-chromium.txt', bytes: 728, sha256: '25ba5c59dad3e0dd8f9540beaa0f0a86a10e3aec35af5fdc8e88c5f6a5c0d8c6' }),
  Object.freeze({ path: 'licenses/node-releases.txt', bytes: 1107, sha256: '3706296ed611888111ceccc1dff4712844dea4bde0b185c82d718c3b69895abe' }),
  Object.freeze({ path: 'licenses/raycast-extensions.txt', bytes: 1064, sha256: '7f727f8b20cdd0e65f84e70b9cac2fce337dcecee4dc88955eb012ea27f02755' }),
  Object.freeze({ path: 'support.json', bytes: 8325435, sha256: '92dd73ad9440c7814d300c820d4376eee91407e02640d6efc80df29a478f351c' }),
])
const capsuleLegalPaths = Object.freeze(capsuleEntries.filter(entry => entry.path.endsWith('.md') || entry.path.startsWith('licenses/')).map(entry => entry.path))
const capsuleEntryPaths = Object.freeze(capsuleEntries.map(entry => entry.path))

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => { throw new Error(message) }
const equalArrays = (left, right) => left.length === right.length && left.every((value, index) => value === right[index])
const sorted = values => [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)

function assertSafeArchivePath(name, label) {
  if (typeof name !== 'string' || name === '' || name.includes('\0') || name.includes('\n') || name.startsWith('/') || name.includes('\\')) fail(`${label} has unsafe archive path: ${JSON.stringify(name)}`)
  const parts = name.split('/').filter(Boolean)
  if (parts.some(part => part === '.' || part === '..')) fail(`${label} has traversal archive path: ${JSON.stringify(name)}`)
}

function readHeldRegularFile(path, expected, label) {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0)
  let file
  try { file = openSync(path, flags) } catch (error) { throw new Error(`${label} cannot be opened: ${error instanceof Error ? error.message : String(error)}`) }
  try {
    const before = fstatSync(file)
    if (!before.isFile()) fail(`${label} is not a regular file`)
    if (before.nlink !== 1) fail(`${label} must have one link`)
    if (before.size > MAX_FILE_BYTES) fail(`${label} exceeds bounded read size`)
    if (expected?.bytes !== undefined && before.size !== expected.bytes) fail(`${label} size pin mismatch: ${before.size}`)
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(file, bytes, offset, bytes.length - offset, null)
      if (count <= 0) fail(`${label} truncated while held open`)
      offset += count
    }
    const after = fstatSync(file)
    if (!after.isFile() || after.size !== before.size) fail(`${label} changed while held open`)
    if (expected?.sha256 !== undefined && sha256(bytes) !== expected.sha256) fail(`${label} SHA-256 pin mismatch: ${sha256(bytes)}`)
    return bytes
  } finally { closeSync(file) }
}

function listArchive(bytes, label) {
  let names
  let verbose
  try {
    names = execFileSync(TAR, ['-tf', '-'], { input: bytes, timeout: 15_000, maxBuffer: MAX_ARCHIVE_LIST_BYTES }).toString('utf8').split('\n').filter(Boolean)
    verbose = execFileSync(TAR, ['-tvf', '-'], { input: bytes, timeout: 15_000, maxBuffer: MAX_ARCHIVE_LIST_BYTES }).toString('utf8').split('\n').filter(Boolean)
  } catch (error) { throw new Error(`${label} cannot be listed safely: ${error instanceof Error ? error.message : String(error)}`) }
  if (names.length === 0 || names.length !== verbose.length) fail(`${label} has an invalid member listing`)
  const seen = new Set()
  names.forEach((name, index) => {
    assertSafeArchivePath(name, label)
    if (seen.has(name)) fail(`${label} has duplicate member: ${name}`)
    seen.add(name)
    const type = verbose[index]?.[0]
    if (type !== 'd' && type !== '-') fail(`${label} has a non-regular member: ${name}`)
    if (type === 'd' && !name.endsWith('/')) fail(`${label} directory member lacks slash: ${name}`)
    if (type === '-' && name.endsWith('/')) fail(`${label} regular member has directory slash: ${name}`)
  })
  return names
}

function validateSourceArchive(bytes) {
  const names = listArchive(bytes, 'Can I Use source archive')
  if (!equalArrays(sorted(names), sorted(sourceArchiveMembers))) fail('Can I Use source archive membership pin mismatch')
}

function translateRuntimeMembers() {
  return Object.entries(reviewedRuntimeFiles).flatMap(([name, files]) => [
    `tockteam-raycast-artifact/runtime/node_modules/${name}/`,
    ...files.map(file => `tockteam-raycast-artifact/runtime/node_modules/${name}/${file}`),
    ...sorted(new Set(files.map(file => file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : undefined).filter(Boolean)).values()).map(directory => `tockteam-raycast-artifact/runtime/node_modules/${name}/${directory}`),
  ])
}
const expectedTranslateRuntimeMembers = Object.freeze(translateRuntimeMembers())

function validateTranslateArchive(bytes) {
  const names = listArchive(bytes, 'Translate archive')
  if (names.length !== 824 || !names.every(name => name === 'tockteam-raycast-artifact/' || name.startsWith('tockteam-raycast-artifact/'))) fail('Translate archive root or member count mismatch')
  const selected = names.filter(name => name.startsWith('tockteam-raycast-artifact/runtime/node_modules/react/') || name.startsWith('tockteam-raycast-artifact/runtime/node_modules/react-reconciler/') || name.startsWith('tockteam-raycast-artifact/runtime/node_modules/scheduler/'))
  if (!equalArrays(sorted(selected), sorted(expectedTranslateRuntimeMembers))) fail('Translate archive reviewed React closure membership mismatch')
}

function parseCapsule(bytes) {
  let capsuleBytes
  try { capsuleBytes = gunzipSync(bytes, { maxOutputLength: DATA_CAPSULE_BYTES }) } catch (error) { throw new Error(`Can I Use data capsule cannot be decoded: ${error instanceof Error ? error.message : String(error)}`) }
  if (capsuleBytes.length !== DATA_CAPSULE_BYTES || sha256(capsuleBytes) !== DATA_CAPSULE_SHA256) fail('Can I Use data capsule digest pin mismatch')
  let capsule
  try { capsule = JSON.parse(capsuleBytes.toString('utf8')) } catch (error) { throw new Error(`Can I Use data capsule is not JSON: ${error instanceof Error ? error.message : String(error)}`) }
  if (capsule?.kind !== 'can-i-use-inert-assets' || capsule?.schemaVersion !== 1 || capsule?.status !== 'complete' || capsule?.runtimeAdmitted !== false) fail('Can I Use data capsule metadata mismatch')
  if (!Array.isArray(capsule.entries) || capsule.entries.length !== capsuleEntries.length) fail(`Can I Use data capsule must contain ${capsuleEntries.length} entries`)
  if (!equalArrays(capsule.entries.map(entry => entry?.path), capsuleEntryPaths)) fail('Can I Use data capsule entry order or membership mismatch')
  const entries = new Map()
  for (const expected of capsuleEntries) {
    const entry = capsule.entries.find(candidate => candidate?.path === expected.path)
    if (!entry) fail(`legal custody missing capsule entry: ${expected.path}`)
    if (entry.bytes !== expected.bytes || entry.sha256 !== expected.sha256 || typeof entry.base64 !== 'string') fail(`Can I Use capsule entry pin mismatch: ${expected.path}`)
    const entryBytes = Buffer.from(entry.base64, 'base64')
    if (entryBytes.length !== expected.bytes || sha256(entryBytes) !== expected.sha256) fail(`Can I Use capsule entry digest mismatch: ${expected.path}`)
    entries.set(expected.path, entryBytes)
  }
  return entries
}

function extractArchive(bytes, destination, label) {
  mkdirSync(destination)
  try { execFileSync(TAR, ['-xf', '-', '-C', destination], { input: bytes, timeout: 15_000 }) } catch (error) { throw new Error(`${label} extraction failed: ${error instanceof Error ? error.message : String(error)}`) }
}

function treeMembers(root, base = root) {
  const stat = lstatSync(root)
  if (stat.isSymbolicLink()) fail(`unexpected symlink in temporary tree: ${relative(base, root)}`)
  if (!stat.isDirectory() && !stat.isFile()) fail(`unexpected non-regular temporary tree member: ${relative(base, root)}`)
  if (stat.isFile()) return [relative(base, root)]
  return [`${relative(base, root)}/`, ...sorted(readdirSync(root)).flatMap(name => treeMembers(join(root, name), base))]
}

function copyHeldFile(source, destination, label) {
  const bytes = readHeldRegularFile(source, undefined, label)
  writeFileSync(destination, bytes, { flag: 'wx', mode: 0o644 })
}

function copyExpectedTree(sourceRoot, destinationRoot, members, stripPrefix, label) {
  for (const member of members) {
    if (!member.startsWith(stripPrefix)) fail(`${label} member is outside expected root: ${member}`)
    const relativeName = member.slice(stripPrefix.length)
    const destination = join(destinationRoot, relativeName)
    if (member.endsWith('/')) {
      mkdirSync(destination, { recursive: false, mode: 0o755 })
    } else {
      mkdirSync(dirname(destination), { recursive: true, mode: 0o755 })
      copyHeldFile(join(sourceRoot, relativeName), destination, `${label} ${member}`)
    }
  }
}

function inspectRuntimePackage(packageRoot, name) {
  const bytes = readHeldRegularFile(join(packageRoot, 'package.json'), undefined, `${name} package.json`)
  let packageJson
  try { packageJson = JSON.parse(bytes.toString('utf8')) } catch (error) { throw new Error(`${name} package.json is not JSON: ${error instanceof Error ? error.message : String(error)}`) }
  if (packageJson?.name !== name || packageJson?.version !== runtimePackageVersions[name] || packageJson?.license !== 'MIT') fail(`${name} package metadata pin mismatch`)
  if (Object.hasOwn(packageJson, 'scripts') || Object.hasOwn(packageJson, 'bin')) fail(`${name} package metadata exposes executable lifecycle fields`)
  if (name === 'react-reconciler') {
    if (JSON.stringify(packageJson.dependencies) !== JSON.stringify({ scheduler: '^0.25.0' }) || JSON.stringify(packageJson.peerDependencies) !== JSON.stringify({ react: '^19.0.0' })) fail('react-reconciler dependency closure mismatch')
  } else if (name === 'react' || name === 'scheduler') {
    if (packageJson.dependencies !== undefined || packageJson.peerDependencies !== undefined || packageJson.optionalDependencies !== undefined) fail(`${name} unexpectedly declares dependencies`)
  }
  return packageJson
}

function writeTextExclusive(path, text) {
  writeFileSync(path, text, { encoding: 'utf8', flag: 'wx', mode: 0o644 })
}

function outputFiles(root, prefix) {
  return treeMembers(join(root, prefix), root).filter(name => !name.endsWith('/')).map(name => name)
}

function checksumLines(root, paths) {
  return sorted(paths).map(path => `${sha256(readHeldRegularFile(join(root, path), undefined, `generated ${path}`))}  ${path}`).join('\n') + '\n'
}

function runtimeManifest(root, translateSha256) {
  const paths = outputFiles(root, 'runtime')
  const packageRows = runtimePackageNames.map(name => `${name}@${runtimePackageVersions[name]}`)
  return [
    `translate-archive-sha256 ${translateSha256}`,
    'reviewed-packages ' + packageRows.join(', '),
    ...checksumLines(root, paths).trimEnd().split('\n'),
    '',
  ].join('\n')
}

function sourceManifest(root, sourceSha256) {
  const paths = outputFiles(root, 'source')
  return [
    `source-archive-sha256 ${sourceSha256}`,
    `source-revision ${SOURCE_REVISION}`,
    ...checksumLines(root, paths).trimEnd().split('\n'),
    '',
  ].join('\n')
}

function allRegularFiles(root) {
  return treeMembers(root, root).filter(name => !name.endsWith('/')).filter(name => name !== 'SHA256SUMS')
}

function licenseInventory() {
  return [
    { name: 'can-i-use', license: 'MIT', source: `Raycast extensions commit ${SOURCE_REVISION}`, file: 'licenses/raycast-extensions.txt' },
    { name: 'caniuse-lite', version: '1.0.30001761', license: 'CC-BY-4.0', source: 'pinned Can I Use data capsule', file: 'licenses/caniuse-lite.txt' },
    ...runtimePackageNames.map(name => ({ name, version: runtimePackageVersions[name], license: 'MIT', source: 'pinned google-translate archive', file: `runtime/node_modules/${name}/LICENSE` })),
    ...capsuleLegalPaths.filter(path => path !== 'licenses/raycast-extensions.txt' && path !== 'licenses/caniuse-lite.txt').map(path => ({ name: path, source: 'pinned Can I Use data capsule legal custody', file: path })),
  ]
}

function expectedOutputMembers() {
  const source = sourceArchiveMembers.map(name => `${ARTIFACT_ROOT}/source/${name.slice('can-i-use/'.length)}`)
  const runtime = expectedTranslateRuntimeMembers.map(name => name.replace('tockteam-raycast-artifact/', `${ARTIFACT_ROOT}/`))
  const runtimeDirs = ['runtime/', 'runtime/node_modules/']
  for (const name of runtimePackageNames) {
    runtimeDirs.push(`runtime/node_modules/${name}/`)
    for (const file of reviewedRuntimeFiles[name]) {
      const directory = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : undefined
      if (directory) runtimeDirs.push(`runtime/node_modules/${name}/${directory}`)
    }
  }
  const direct = ['CAN_I_USE_ATTRIBUTION.md', 'LICENSE-FILES', 'LICENSE-INVENTORY.json', 'PROVENANCE.txt', 'RUNTIME-CHECKS.sha256', 'SHA256SUMS', 'SOURCE-CHECKS.sha256', 'THIRD_PARTY_NOTICES.md', 'can-i-use-data.json.gz'].map(name => `${ARTIFACT_ROOT}/${name}`)
  const legal = capsuleLegalPaths.map(name => `${ARTIFACT_ROOT}/${name}`)
  return sorted(new Set([
    `${ARTIFACT_ROOT}/`,
    `${ARTIFACT_ROOT}/source/`,
    ...source,
    ...runtimeDirs.map(name => `${ARTIFACT_ROOT}/${name}`),
    `${ARTIFACT_ROOT}/runtime/package.json`,
    ...runtime,
    `${ARTIFACT_ROOT}/licenses/`,
    ...legal,
    ...direct,
  ]))
}

function normalizeMetadata(path) {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) fail(`cannot normalize symlink: ${path}`)
  if (stat.isDirectory()) for (const child of readdirSync(path)) normalizeMetadata(join(path, child))
  if (stat.isDirectory()) chmodSync(path, 0o755)
  else if (stat.isFile()) chmodSync(path, 0o644)
  else fail(`cannot normalize non-regular path: ${path}`)
  utimesSync(path, EPOCH_DATE, EPOCH_DATE)
}

function createDeterministicTar(root, destination) {
  const entries = sorted(treeMembers(root, dirname(root)))
  const expected = expectedOutputMembers()
  if (!equalArrays(entries, expected)) {
    const missing = expected.filter(name => !entries.includes(name))
    const extra = entries.filter(name => !expected.includes(name))
    fail(`candidate manifest mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`)
  }
  normalizeMetadata(root)
  const relativeEntries = entries.map(name => name.slice(0, ARTIFACT_ROOT.length + 1) === `${ARTIFACT_ROOT}/` ? name : fail(`candidate entry outside root: ${name}`))
  try {
    execFileSync(TAR, [
      '-c', '--format=ustar', '--no-recursion', '--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'wheel',
      '-f', destination, '-C', dirname(root), ...relativeEntries,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 })
  } catch (error) { throw new Error(`deterministic candidate tar failed: ${error instanceof Error ? error.message : String(error)}`) }
  const bytes = readHeldRegularFile(destination, undefined, 'temporary candidate tar')
  const members = listArchive(bytes, 'temporary candidate tar')
  if (!equalArrays(members, expected)) fail('temporary candidate tar membership is not deterministic')
  return bytes
}

function publishExclusive(path, bytes) {
  let file
  try { file = openSync(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o644) } catch (error) { throw new Error(`candidate output cannot be exclusively created: ${error instanceof Error ? error.message : String(error)}`) }
  try {
    let offset = 0
    while (offset < bytes.length) {
      const count = writeSync(file, bytes, offset, bytes.length - offset, offset)
      if (count <= 0) fail('candidate output write made no progress')
      offset += count
    }
    fsyncSync(file)
  } finally { closeSync(file) }
  const readback = readHeldRegularFile(path, { bytes: bytes.length, sha256: sha256(bytes) }, 'published candidate tar')
  if (!readback.equals(bytes)) fail('published candidate tar readback mismatch')
}

function resolveInputs(overrides) {
  if (overrides === undefined) return defaultInputs
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) fail('input overrides must be an object')
  const inputs = { ...defaultInputs }
  for (const name of Object.keys(defaultInputs)) if (Object.hasOwn(overrides, name)) inputs[name] = overrides[name]
  for (const [name, path] of Object.entries(inputs)) if (typeof path !== 'string' || path.length === 0) fail(`${name} input path is invalid`)
  return inputs
}

/** Assemble a candidate tar at a new caller-selected file path; this does not admit production execution. */
export function assembleTrustedRaycastCanIUseArtifact(outputTarPath, inputOverrides) {
  if (typeof outputTarPath !== 'string' || outputTarPath.trim() === '') fail('candidate output path is required')
  const output = resolve(outputTarPath)
  const parent = dirname(output)
  const parentStat = lstatSync(parent)
  if (!parentStat.isDirectory()) fail('candidate output parent is not a directory')
  try { lstatSync(output); fail(`candidate output path is pre-existing: ${output}`) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  const inputs = resolveInputs(inputOverrides)
  const sourceBytes = readHeldRegularFile(inputs.sourceArchive, TRUSTED_RAYCAST_CAN_I_USE_ARTIFACT_PINS.sourceArchive, 'Can I Use source archive')
  validateSourceArchive(sourceBytes)
  const translateBytes = readHeldRegularFile(inputs.translateArchive, TRUSTED_RAYCAST_CAN_I_USE_ARTIFACT_PINS.translateArchive, 'Translate archive')
  validateTranslateArchive(translateBytes)
  const dataBytes = readHeldRegularFile(inputs.dataAsset, TRUSTED_RAYCAST_CAN_I_USE_ARTIFACT_PINS.dataAsset, 'Can I Use data asset')
  const capsule = parseCapsule(dataBytes)
  const work = mkdtempSync(join(tmpdir(), 'tockteam-can-i-use-artifact-'))
  try {
    const sourceExtract = join(work, 'source-extract')
    const translateExtract = join(work, 'translate-extract')
    const payload = join(work, ARTIFACT_ROOT)
    extractArchive(sourceBytes, sourceExtract, 'Can I Use source archive')
    extractArchive(translateBytes, translateExtract, 'Translate archive')
    const sourceRoot = join(sourceExtract, 'can-i-use')
    const translateRoot = join(translateExtract, 'tockteam-raycast-artifact')
    if (!lstatSync(sourceRoot).isDirectory() || !lstatSync(translateRoot).isDirectory()) fail('validated archive roots were not extracted as directories')
    if (!equalArrays(sorted(treeMembers(sourceRoot, sourceExtract)), sorted(sourceArchiveMembers))) fail('extracted source tree membership mismatch')
    mkdirSync(join(payload, 'source'), { recursive: true, mode: 0o755 })
    copyExpectedTree(sourceRoot, join(payload, 'source'), sourceArchiveMembers.slice(1).map(name => name.slice('can-i-use/'.length)), '', 'Can I Use source')
    mkdirSync(join(payload, 'runtime', 'node_modules'), { recursive: true, mode: 0o755 })
    for (const name of runtimePackageNames) {
      const sourcePackage = join(translateRoot, 'runtime/node_modules', name)
      inspectRuntimePackage(sourcePackage, name)
      const destinationPackage = join(payload, 'runtime/node_modules', name)
      mkdirSync(destinationPackage, { recursive: true, mode: 0o755 })
      for (const file of reviewedRuntimeFiles[name]) {
        const destination = join(destinationPackage, file)
        mkdirSync(dirname(destination), { recursive: true, mode: 0o755 })
        copyHeldFile(join(sourcePackage, file), destination, `reviewed ${name}/${file}`)
      }
    }
    writeTextExclusive(join(payload, 'runtime/package.json'), `${JSON.stringify({
      name: 'tockteam-trusted-raycast-can-i-use-candidate-runtime',
      private: true,
      type: 'module',
      dependencies: { react: '19.0.0', 'react-reconciler': '0.31.0', scheduler: '0.25.0' },
    }, null, 2)}\n`)
    mkdirSync(join(payload, 'licenses'), { recursive: true, mode: 0o755 })
    for (const path of capsuleLegalPaths) writeFileSync(join(payload, path), capsule.get(path), { flag: 'wx', mode: 0o644 })
    writeFileSync(join(payload, 'can-i-use-data.json.gz'), dataBytes, { flag: 'wx', mode: 0o644 })
    writeTextExclusive(join(payload, 'LICENSE-FILES'), sorted([
      ...capsuleLegalPaths,
      ...runtimePackageNames.map(name => `runtime/node_modules/${name}/LICENSE`),
    ]).join('\n') + '\n')
    writeTextExclusive(join(payload, 'LICENSE-INVENTORY.json'), `${JSON.stringify(licenseInventory(), null, 2)}\n`)
    writeTextExclusive(join(payload, 'PROVENANCE.txt'), [
      'Candidate-only Can I Use artifact; not production or distribution admission.',
      `Source archive: can-i-use-source.tar (${sourceBytes.length} bytes, SHA-256 ${sha256(sourceBytes)}), Raycast extensions commit ${SOURCE_REVISION}.`,
      `Translate archive: google-translate.tar (${translateBytes.length} bytes, SHA-256 ${sha256(translateBytes)}); only the reviewed React closure is copied.`,
      'Runtime closure: react@19.0.0, react-reconciler@0.31.0, scheduler@0.25.0; package.json files were inspected as JSON and no package code or lifecycle was evaluated.',
      `Data asset: can-i-use-data.json.gz (${dataBytes.length} bytes, SHA-256 ${sha256(dataBytes)}); capsule SHA-256 ${DATA_CAPSULE_SHA256}. The gzip is retained unchanged at the artifact root.`,
      'Source bytes are copied unchanged under source/. Capsule legal custody is materialized unchanged under the root licenses/ directory and includes the exact Raycast MIT text because its attribution covers this source.',
      'All output tar members are fixed, regular files or directories with sorted names, mode 0644/0755, uid/gid 0, and epoch mtime. No package was installed, imported, executed, or downloaded.',
    ].join('\n') + '\n')
    writeTextExclusive(join(payload, 'SOURCE-CHECKS.sha256'), sourceManifest(payload, sha256(sourceBytes)))
    writeTextExclusive(join(payload, 'RUNTIME-CHECKS.sha256'), runtimeManifest(payload, sha256(translateBytes)))
    writeTextExclusive(join(payload, 'SHA256SUMS'), checksumLines(payload, allRegularFiles(payload)))
    normalizeMetadata(payload)
    const temporaryTar = join(work, 'candidate.tar')
    const archiveBytes = createDeterministicTar(payload, temporaryTar)
    publishExclusive(output, archiveBytes)
    return Object.freeze({ path: output, bytes: archiveBytes.length, sha256: sha256(archiveBytes), root: ARTIFACT_ROOT, entries: expectedOutputMembers() })
  } finally { rmSync(work, { recursive: true, force: true }) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2]
  if (!output) {
    console.error(`usage: ${process.argv[1]} OUTPUT_TAR`)
    process.exitCode = 2
  } else {
    try { console.log(JSON.stringify(assembleTrustedRaycastCanIUseArtifact(output))) } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
  }
}
