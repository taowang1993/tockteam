// Preparation-only inert selector. CLI execution requires fresh exact-hash authorization.
// Source verifier and held-fd mechanics reused from reviewed generator f42b9935…5d2767.
// No archived JavaScript, package code, network, subprocess, or runtime wiring.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const MAX_OUTPUT = 64 * 1024 * 1024
export const MAX_CAPSULE = 16 * 1024 * 1024
export const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => { throw new Error(code) }
const demand = (condition, code) => { if (!condition) fail(code) }
export function canonicalJson(value) {
  const visit = (item, depth = 0) => {
    demand(depth <= 16, 'JSON_DEPTH')
    if (Array.isArray(item)) return item.map(child => visit(child, depth + 1))
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, visit(item[key], depth + 1)]))
    demand(item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)), 'JSON_VALUE')
    return item
  }
  return Buffer.from(JSON.stringify(visit(value), null, 2) + '\n')
}

export function validateData(data) {
  const number = '(?:0|[1-9][0-9]{0,3})(?:\\.(?:0|[1-9][0-9]{0,2})){0,2}'
  const target = new RegExp('^[a-z][a-z0-9_]* (?:' + number + '(?:-' + number + ')?|all|TP)$')
  demand(Array.isArray(data.catalog) && data.catalog.length === 581 && new Set(data.catalog.map(e => e.slug)).size === 581, 'CATALOG_BOUND')
  for (const [index, row] of data.catalog.entries()) demand(row.sourceIndex === index && /^[a-z0-9][a-z0-9-]*$/.test(row.slug) && typeof row.title === 'string' && row.title.length > 0 && Buffer.byteLength(row.title) <= 1024 && ['ls','rec','pr','cr','wd','other','unoff'].includes(row.status), 'CATALOG_ROW')
  demand(Array.isArray(data.canonicalTargets) && data.canonicalTargets.length <= 16384 && data.canonicalTargets.every(v => typeof v === 'string' && v.length <= 64 && target.test(v)), 'TARGET_BOUND')
  demand(data.canonicalTargets.join('\n') === [...new Set(data.canonicalTargets)].sort().join('\n'), 'TARGET_ORDER')
  demand(Array.isArray(data.defaults) && data.defaults.length > 0 && data.defaults.length <= 256 && data.defaults.every(v => data.canonicalTargets.includes(v)), 'DEFAULTS_BOUND')
  demand(data.defaults.join('\n') === [...new Set(data.defaults)].sort().join('\n'), 'DEFAULTS_ORDER')
  demand(Array.isArray(data.agents) && data.agents.length > 0 && data.agents.length <= 64 && new Set(data.agents.map(v => v.browser)).size === data.agents.length, 'AGENT_BOUND')
  for (const [index, agent] of data.agents.entries()) {
    demand(agent.sourceIndex === index && /^[a-z][a-z0-9_]*$/.test(agent.browser) && typeof agent.label === 'string' && Buffer.byteLength(agent.label) <= 1024 && Array.isArray(agent.versions) && agent.versions.length <= 512, 'AGENT_ROW')
    for (const value of Object.values(agent.release_date)) demand(value === null || (Number.isSafeInteger(value) && value >= 0), 'AGENT_DATE')
  }
  demand(Array.isArray(data.supportScope) && data.supportScope.length <= 64 && new Set(data.supportScope).size === data.supportScope.length && data.supportScope.every(browser => data.agents.some(agent => agent.browser === browser)), 'SUPPORT_SCOPE')
  const defaultScope = [...new Set(data.defaults.map(target => target.split(' ')[0]))].sort()
  demand(JSON.stringify([...data.supportScope].sort()) === JSON.stringify(defaultScope), 'SUPPORT_SCOPE')
  const slugs = data.catalog.map(row => row.slug).sort()
  demand(JSON.stringify(Object.keys(data.support).sort()) === JSON.stringify(slugs) && JSON.stringify(Object.keys(data.stats).sort()) === JSON.stringify(slugs), 'SUPPORT_KEYS')
  for (const row of data.catalog) {
    demand(data.support[row.slug] && data.stats[row.slug], 'SUPPORT_ROW')
    for (const [browser, table] of Object.entries(data.support[row.slug])) {
      demand(data.supportScope.includes(browser), 'SUPPORT_BROWSER')
      for (const [flag, number] of Object.entries(table)) demand(['y','a','x','u'].includes(flag) && Number.isFinite(number) && number >= 0, 'SUPPORT_FLAG')
    }
    for (const [browser, versions] of Object.entries(data.stats[row.slug])) {
      demand(data.agents.some(agent => agent.browser === browser) && Object.keys(versions).length <= 512, 'STATS_BROWSER')
      for (const [version, status] of Object.entries(versions)) demand(data.canonicalTargets.includes(browser + ' ' + version) && typeof status === 'string' && status.length <= 256 && /^[ynaupdx#0-9 ]+$/.test(status), 'STATS_VALUE')
    }
  }
  return data
}

const MAX_ENVELOPE = 3 * MAX_OUTPUT
const treeManifest = tree => tree.map(({path, bytes, sha256}) => ({path, bytes, sha256}))
const exactKeys = (value, keys) => demand(value && typeof value === 'object' && !Array.isArray(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'ENVELOPE_SCHEMA')

function validateTree(tree) {
  demand(Array.isArray(tree) && tree.length <= 2048, 'TREE_BOUND')
  const paths = new Set(); let total = 0, previous = ''
  for (const row of tree) {
    exactKeys(row, ['path', 'bytes', 'sha256', 'base64'])
    demand(typeof row.path === 'string' && row.path.length <= 256 && /^(extracted|output)\/[A-Za-z0-9_./-]+$/.test(row.path) && row.path.split('/').every(p => p && p !== '.' && p !== '..'), 'TREE_PATH')
    const key = row.path.toLowerCase()
    demand(!paths.has(key) && previous < row.path, 'TREE_DUPLICATE_OR_ORDER')
    paths.add(key); previous = row.path
    demand(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && (total += row.bytes) <= MAX_OUTPUT, 'TREE_BOUND')
    demand(typeof row.base64 === 'string' && row.base64.length <= 4 * Math.ceil(MAX_OUTPUT / 3) && typeof row.sha256 === 'string' && /^[0-9a-f]{64}$/.test(row.sha256), 'TREE_CONTENT')
    const bytes = Buffer.from(row.base64, 'base64')
    demand(bytes.length === row.bytes && bytes.toString('base64') === row.base64 && sha(bytes) === row.sha256, 'TREE_CONTENT')
  }
  for (const path of paths) {
    const parts = path.split('/')
    while (parts.length > 1) { parts.pop(); demand(!paths.has(parts.join('/')), 'TREE_PREFIX') }
  }
}

export function logicalTree(files) {
  const tree = [...files].map(([path, bytes]) => ({path, bytes: bytes.length, sha256: sha(bytes), base64: bytes.toString('base64')})).sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  validateTree(tree)
  return tree
}

function validateEnvelope(value) {
  demand(value?.status === 'complete' || value?.status === 'failed', 'ENVELOPE_STATUS')
  exactKeys(value, ['schemaVersion', 'generatorSha256', 'runtimeAdmitted', 'status', 'trees', value.status === 'complete' ? 'proof' : 'failure'])
  demand(value.schemaVersion === 2 && typeof value.generatorSha256 === 'string' && /^[0-9a-f]{64}$/.test(value.generatorSha256) && value.runtimeAdmitted === false, 'ENVELOPE_SCHEMA')
  demand(value.trees && typeof value.trees === 'object' && !Array.isArray(value.trees), 'ENVELOPE_TREES')
  const names = Reflect.ownKeys(value.trees)
  demand(names.length === 0 || (names.length === 1 && Object.hasOwn(value.trees, 'first')) || (names.length === 2 && Object.hasOwn(value.trees, 'first') && Object.hasOwn(value.trees, 'second')), 'ENVELOPE_TREES')
  for (const tree of Object.values(value.trees)) validateTree(tree)
  if (value.status === 'complete') {
    demand(names.length === 2 && Object.hasOwn(value.trees, 'first') && Object.hasOwn(value.trees, 'second'), 'ENVELOPE_TREES')
    demand(canonicalJson(value.trees.first).equals(canonicalJson(value.trees.second)), 'REPRODUCIBILITY')
    exactKeys(value.proof, ['twiceIdentical', 'treeManifest', 'treeSha256'])
    demand(value.proof.twiceIdentical === true && canonicalJson(value.proof.treeManifest).equals(canonicalJson(treeManifest(value.trees.first))) && value.proof.treeSha256 === sha(canonicalJson(value.trees.first)), 'ENVELOPE_PROOF')
  } else {
    exactKeys(value.failure, ['message', 'trace'])
    demand(typeof value.failure.message === 'string' && value.failure.message.length <= 512, 'ENVELOPE_FAILURE')
  }
}

export function evidenceEnvelope(generatorSha256, trees, failure) {
  const value = {schemaVersion: 2, generatorSha256, runtimeAdmitted: false, status: failure ? 'failed' : 'complete', trees}
  if (failure) value.failure = failure
  else value.proof = {twiceIdentical: true, treeManifest: treeManifest(trees.first), treeSha256: sha(canonicalJson(trees.first))}
  validateEnvelope(value)
  return value
}

export function verifyEnvelopeBytes(actual, expected) {
  demand(Buffer.isBuffer(actual) && Buffer.isBuffer(expected) && actual.length <= MAX_ENVELOPE && expected.length <= MAX_ENVELOPE, 'ENVELOPE_BOUND')
  const parsed = JSON.parse(actual.toString('utf8'))
  validateEnvelope(parsed)
  demand(canonicalJson(parsed).equals(actual) && actual.equals(expected) && sha(actual) === sha(expected), 'ENVELOPE_DIGEST')
  return sha(actual)
}

// No mutable intermediate output directories exist. These ancestors cannot be replaced by
// an unprivileged same-UID actor. This is not protection against root or later inode tampering.
function outputParents() {
  demand(typeof process.getuid === 'function' && process.getuid() !== 0, 'OUTPUT_USER')
  return ['/', '/private', '/private/tmp'].map((path, index) => {
    const stat = fs.lstatSync(path, {bigint: true})
    demand(stat.isDirectory() && stat.uid === 0n && (index < 2 ? (stat.mode & 0o022n) === 0n : (stat.mode & 0o022n) === 0n || (stat.mode & 0o1000n) !== 0n), 'OUTPUT_PARENT')
    return stat
  })
}
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid

/** Exactly one exclusive open. Every subsequent content operation uses this held descriptor. */
export function openEvidenceFile(path, validate = validateEnvelope, maxBytes = MAX_ENVELOPE) {
  demand(typeof path === 'string' && dirname(path) === '/private/tmp' && /^\/private\/tmp\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(path), 'OUTPUT_PATH')
  const parents = outputParents()
  const fd = fs.openSync(path, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_RDWR, 0o600)
  let closed = false, attempted = false, identity
  function fileIdentity() {
    const stat = fs.fstatSync(fd, {bigint: true})
    demand(stat.isFile() && stat.uid === BigInt(process.getuid()) && stat.nlink === 1n && (stat.mode & 0o7777n) === 0o600n && (!identity || sameIdentity(stat, identity)), 'OUTPUT_FILE')
    return stat
  }
  function attest() {
    const current = outputParents()
    demand(current.every((stat, i) => sameIdentity(stat, parents[i])), 'OUTPUT_PARENT_CHANGED')
    const stat = fileIdentity(), named = fs.lstatSync(path, {bigint: true})
    demand(named.isFile() && named.nlink === 1n && sameIdentity(stat, named) && named.size === stat.size && named.mtimeNs === stat.mtimeNs && named.ctimeNs === stat.ctimeNs, 'OUTPUT_CHANGED')
    return stat
  }
  try {
    fs.fchmodSync(fd, 0o600)
    identity = fileIdentity()
    demand(identity.size === 0n, 'OUTPUT_FILE')
    attest()
  } catch (error) { fs.closeSync(fd); throw error }
  return Object.freeze({
    publish(value) {
      demand(!closed, 'OUTPUT_CLOSED')
      demand(!attempted, 'OUTPUT_ONESHOT')
      attempted = true
      validate(value)
      const bytes = canonicalJson(value)
      demand(bytes.length <= maxBytes, 'ENVELOPE_BOUND')
      const untouched = attest()
      demand(untouched.size === 0n && untouched.mtimeNs === identity.mtimeNs && untouched.ctimeNs === identity.ctimeNs, 'OUTPUT_CHANGED')
      // No retry or failure-envelope replacement: preserve any partial candidate on this fd.
      fs.ftruncateSync(fd, 0)
      let offset = 0
      while (offset < bytes.length) {
        const count = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset)
        demand(Number.isInteger(count) && count > 0 && count <= bytes.length - offset, 'OUTPUT_WRITE')
        offset += count
      }
      fs.fsyncSync(fd)
      const before = fileIdentity()
      demand(before.size === BigInt(bytes.length), 'OUTPUT_SIZE')
      const actual = Buffer.alloc(bytes.length + 1); let used = 0
      while (used < actual.length) {
        const count = fs.readSync(fd, actual, used, actual.length - used, used)
        if (!count) break
        used += count
      }
      const after = fileIdentity()
      demand(used === bytes.length && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs, 'OUTPUT_CHANGED')
      const readback = actual.subarray(0, used)
      demand(readback.equals(bytes), 'OUTPUT_CONTENT')
      const parsed = JSON.parse(readback.toString('utf8'))
      validate(parsed)
      demand(canonicalJson(parsed).equals(readback), 'OUTPUT_CANONICAL')
      const digest = sha(readback)
      const final = attest()
      demand(final.size === after.size && final.mtimeNs === after.mtimeNs && final.ctimeNs === after.ctimeNs, 'OUTPUT_CHANGED')
      // Point-in-time attestation, not immutable storage; consumers must reverify the receipt digest.
      return digest
    },
    close() { if (!closed) { closed = true; fs.closeSync(fd) } },
  })
}

export const REAL_INPUT = '/private/tmp/tockteam-can-i-use-fixture-gate-r2.noindex'
export const REAL_OUTPUT = '/private/tmp/tockteam-can-i-use-inert-capsule-r1.noindex'
const SUPPLEMENT_ROOT = new URL('../.beads/reports/2026-09-09-can-i-use-attribution-supplement/', import.meta.url)
const EPOCH = 1777030995000
const SELECTORS = ['> 0.5%', 'last 2 versions', 'Firefox ESR', 'not dead']
export const PROVENANCE_ARCHIVES = Object.freeze([
  ['browserslist', '4.28.1', '2e3c9b9e665358cd2e9a8f1fa6a0475645ba63251b93c762d3064323a5451dd5'],
  ['caniuse-lite', '1.0.30001761', 'dad057386ae3d0178226ca938355312c16e94b6680627ec297ce1b1dcf55e2d1'],
  ['baseline-browser-mapping', '2.9.11', 'f50e29a47036f22f9895de65f75172010d6b886ba4c10059d118529188a178ca'],
  ['electron-to-chromium', '1.5.267', 'a8e9df057647f51b7a731177921184cee326f95108bf1904f4db6e30d3c9f61a'],
  ['node-releases', '2.0.27', '7ba0a43673e36ffb18211bea5dec9a5ba1356e39417d81fa5d7468f78d1b5a85'],
  ['caniuse-api', '3.0.0', 'b85f2ba18f0ea60eb433d075ff139674201e428d2658e1eaf2bcc63c817d674d'],
].map(([name, version, sha256]) => Object.freeze({name, version, sha256})))
const asset = (path, bytes, sha256) => Object.freeze({path, bytes, sha256})
const ASSETS = Object.freeze([
  asset('defaults.json', 806, 'a9fb212d0916d2741a2c21611d9d7765f6dffb94b4bd91a95ab8707f0081739f'),
  asset('canonical-targets.json', 10202, 'ff486a8af2f3d41d5cef835788cc82b4e2802757cd1c0aa3d93c0fc5e597bea9'),
  asset('catalog.json', 70845, '03c6c8d744d920a56585a8315f8f390a9205f97692f1afb4d78155c97f78e3bb'),
  asset('agents.json', 26939, '29dfea89783e681989119c42db3242672aeded5049afcd02a62fe909247771ca'),
  asset('support.json', 8325435, '92dd73ad9440c7814d300c820d4376eee91407e02640d6efc80df29a478f351c'),
  asset('licenses/browserslist.txt', 1118, 'f25bf9bf3ae8984bcd43bf7fb8f78e7eec8d577081fb8d0989cfa7c67ecebb8e'),
  asset('licenses/caniuse-lite.txt', 18651, 'fd3a263fe19ed8faa9068b43abaebafc02c77897b0c6fc09abc04bb592e5f16e'),
  asset('licenses/baseline-browser-mapping.txt', 11357, 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4'),
  asset('licenses/electron-to-chromium.txt', 728, '25ba5c59dad3e0dd8f9540beaa0f0a86a10e3aec35af5fdc8e88c5f6a5c0d8c6'),
  asset('licenses/node-releases.txt', 1107, '3706296ed611888111ceccc1dff4712844dea4bde0b185c82d718c3b69895abe'),
  asset('licenses/caniuse-api.txt', 1084, '6dba40acdc8df5c99941018d203bc5507edfb0d99ad0f13c1fe365f8b564be0f'),
  asset('licenses/raycast-extensions.txt', 1064, '7f727f8b20cdd0e65f84e70b9cac2fce337dcecee4dc88955eb012ea27f02755'),
  asset('THIRD_PARTY_NOTICES.md', 3365, '34a64c8a2e2f82bff781800a546ec78502b4a2aed40aea56e239a42c48b7c068'),
  asset('CAN_I_USE_ATTRIBUTION.md', 910, '791f9758d274b29ee450352421702dd1b855790f2b2fe3416d7b90e6a9f95bc1'),
])
export const ASSET_PATHS = Object.freeze(ASSETS.map(row => row.path))
export const PRODUCTION_PINS = Object.freeze({
  fixtureSha256: '3e2e16d1b9764f9df605f666c590e5ac86997259a5b480a75e7a59dc680e2d55', fixtureBytes: 27679242,
  generatorSha256: 'f42b9935b3e3b2dc6b43ed6c5fe7a1a27ca03578add9b219da5f85afb35d2767',
  moduleManifestSha256: '7b84bf4b8979c54f14e424522ec05cd0a2d98e11200611f03ce4c2a1534b375a',
  supplementSha256: '4afcc353b08ab365fb8464202aa58dd63653766fc7ffa03b5ae80475fe0bbe2a', supplementBytes: 4739,
  noticeSha256: '791f9758d274b29ee450352421702dd1b855790f2b2fe3416d7b90e6a9f95bc1', noticeBytes: 910,
  assets: ASSETS,
})
const sourceIdentity = pins => ({fixtureSha256: pins.fixtureSha256, generatorSha256: pins.generatorSha256, supplementSha256: pins.supplementSha256, noticeSha256: pins.noticeSha256})
function checkPins(pins) {
  for (const name of ['fixtureSha256', 'generatorSha256', 'moduleManifestSha256', 'supplementSha256', 'noticeSha256']) demand(typeof pins[name] === 'string' && /^[0-9a-f]{64}$/.test(pins[name]), 'PINS')
  demand(Array.isArray(pins.assets) && pins.assets.length === 14 && new Set(pins.assets.map(row => row.path)).size === 14 && pins.assets.every(row => ASSET_PATHS.includes(row.path) && Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= MAX_CAPSULE && /^[0-9a-f]{64}$/.test(row.sha256)), 'PINS')
}
function pinnedBytes(bytes, digest, size, code) {
  demand(Buffer.isBuffer(bytes) && bytes.length === size && sha(bytes) === digest, code)
}
function parseCanonical(bytes) {
  const value = JSON.parse(bytes.toString('utf8'))
  demand(canonicalJson(value).equals(bytes), 'CANONICAL_JSON')
  return value
}
function validateDataset(entries) {
  const json = path => parseCanonical(Buffer.from(entries.find(row => row.path === path).base64, 'base64'))
  const defaults = json('defaults.json'), support = json('support.json')
  exactKeys(defaults, ['epoch', 'selectors', 'targets']); exactKeys(support, ['scope', 'flags', 'stats'])
  demand(defaults.epoch === EPOCH && canonicalJson(defaults.selectors).equals(canonicalJson(SELECTORS)), 'DEFAULT_IDENTITY')
  const data = validateData({defaults: defaults.targets, canonicalTargets: json('canonical-targets.json'), catalog: json('catalog.json'), agents: json('agents.json'), supportScope: support.scope, support: support.flags, stats: support.stats})
  demand(data.defaults.length === 36 && data.canonicalTargets.length === 649 && data.agents.length === 19 && data.supportScope.length === 15, 'DATA_COUNTS')
  for (const row of data.catalog) exactKeys(row, ['slug', 'title', 'status', 'sourceIndex'])
  for (const row of data.agents) exactKeys(row, ['browser', 'label', 'sourceIndex', 'versions', 'release_date'])
}

/** Pins override is a pure synthetic-test seam, never a CLI/input-file option or admission authority. */
export function validateInertCapsule(value, pins = PRODUCTION_PINS) {
  checkPins(pins)
  exactKeys(value, ['schemaVersion', 'kind', 'status', 'source', 'runtimeAdmitted', 'entries'])
  demand(value.schemaVersion === 1 && value.kind === 'can-i-use-inert-assets' && value.status === 'complete' && value.runtimeAdmitted === false, 'CAPSULE_SCHEMA')
  exactKeys(value.source, ['fixtureSha256', 'generatorSha256', 'supplementSha256', 'noticeSha256'])
  demand(canonicalJson(value.source).equals(canonicalJson(sourceIdentity(pins))), 'CAPSULE_SOURCE')
  demand(Array.isArray(value.entries) && value.entries.length === 14, 'CAPSULE_ENTRIES')
  const sorted = [...pins.assets].sort((a,b) => a.path < b.path ? -1 : 1)
  for (const [index, row] of value.entries.entries()) {
    exactKeys(row, ['path', 'bytes', 'sha256', 'base64'])
    const expected = sorted[index]
    demand(row.path === expected.path && row.bytes === expected.bytes && row.sha256 === expected.sha256 && typeof row.base64 === 'string' && row.base64.length === 4 * Math.ceil(row.bytes / 3), 'CAPSULE_ENTRY')
    const bytes = Buffer.from(row.base64, 'base64')
    demand(bytes.toString('base64') === row.base64, 'CAPSULE_ENCODING')
    pinnedBytes(bytes, expected.sha256, expected.bytes, 'CAPSULE_DIGEST')
  }
  validateDataset(value.entries)
}
export function verifyInertCapsuleBytes(bytes, pins = PRODUCTION_PINS) {
  demand(Buffer.isBuffer(bytes) && bytes.length <= MAX_CAPSULE, 'CAPSULE_BOUND')
  validateInertCapsule(parseCanonical(bytes), pins)
  return sha(bytes)
}
export function selectInertAssets(envelopeBytes, supplementBytes, noticeBytes, pins = PRODUCTION_PINS) {
  checkPins(pins)
  demand(Buffer.isBuffer(envelopeBytes) && envelopeBytes.length <= MAX_ENVELOPE, 'SOURCE_BOUND')
  pinnedBytes(envelopeBytes, pins.fixtureSha256, pins.fixtureBytes, 'SOURCE_DIGEST')
  const envelope = parseCanonical(envelopeBytes)
  verifyEnvelopeBytes(envelopeBytes, canonicalJson(envelope))
  demand(envelope.status === 'complete' && envelope.generatorSha256 === pins.generatorSha256, 'SOURCE_IDENTITY')
  demand(envelope.trees.first.length === 615 && envelope.trees.second.length === 615, 'SOURCE_COUNT')
  const rows = new Map(envelope.trees.first.map(row => [row.path, row]))
  const content = path => { const row = rows.get(path); demand(row, 'SOURCE_PATH'); return Buffer.from(row.base64, 'base64') }
  const sourceOutputs = new Set([...ASSET_PATHS.filter(path => path !== 'CAN_I_USE_ATTRIBUTION.md').map(path => 'output/' + path), 'output/provenance.json', 'output/module-trace.json', 'output/adaptation-source/caniuse-api-utils.js.txt'])
  demand([...rows.keys()].filter(path => path.startsWith('output/')).length === 16 && [...sourceOutputs].every(path => rows.has(path)), 'SOURCE_PATHS')
  const provenance = parseCanonical(content('output/provenance.json'))
  exactKeys(provenance, ['schemaVersion', 'node', 'generatorSha256', 'epoch', 'sourceCommit', 'sourceArtifactSha256', 'archives', 'moduleManifest', 'graph', 'outputs', 'adaptation', 'runtimeAdmitted'])
  demand(provenance.schemaVersion === 1 && provenance.node === 'v24.20.0' && provenance.epoch === EPOCH && provenance.sourceCommit === '186d955eda64f9e956b25a3fdf5566b1d38f57f2' && provenance.sourceArtifactSha256 === 'cd79b55c49f36836970b56d9f7ecef39f89a4855bb5d20aca5576299edb2837c' && provenance.adaptation === 'caniuse-api UI support flags only; no candidate command execution' && provenance.runtimeAdmitted === false && canonicalJson(provenance.archives).equals(canonicalJson(PROVENANCE_ARCHIVES)), 'SOURCE_PROVENANCE')
  demand(provenance.generatorSha256 === pins.generatorSha256 && Array.isArray(provenance.moduleManifest) && provenance.moduleManifest.length === 599 && sha(canonicalJson(provenance.moduleManifest)) === pins.moduleManifestSha256, 'MODULE_MANIFEST')
  const ids = new Set()
  for (const module of provenance.moduleManifest) {
    exactKeys(module, ['id', 'bytes', 'sha256', 'kind'])
    const row = rows.get('extracted/' + module.id)
    demand(!ids.has(module.id) && row && row.bytes === module.bytes && row.sha256 === module.sha256 && ['json-data', 'executed-if-loaded-js'].includes(module.kind), 'MODULE_MANIFEST')
    ids.add(module.id)
  }
  exactKeys(provenance.graph, [...ids])
  for (const [id, edges] of Object.entries(provenance.graph)) {
    demand(edges && typeof edges === 'object' && !Array.isArray(edges), 'SOURCE_GRAPH')
    demand(!id.endsWith('.json') || Object.keys(edges).length === 0, 'SOURCE_GRAPH')
    for (const [spec, target] of Object.entries(edges)) {
      demand(/^[A-Za-z0-9@_./-]{1,256}$/.test(spec) && typeof target === 'string' && (ids.has(target) || (target === '@denied-path' && id === 'browserslist/index.js' && spec === 'path')), 'SOURCE_GRAPH')
    }
  }
  demand(Array.isArray(provenance.outputs) && provenance.outputs.length === 15, 'SOURCE_OUTPUTS')
  const outputNames = new Set()
  for (const output of provenance.outputs) {
    exactKeys(output, ['path', 'bytes', 'sha256'])
    demand(typeof output.path === 'string' && output.path !== 'provenance.json' && sourceOutputs.has('output/' + output.path) && !outputNames.has(output.path), 'SOURCE_OUTPUTS')
    const row = rows.get('output/' + output.path)
    demand(row.bytes === output.bytes && row.sha256 === output.sha256, 'SOURCE_OUTPUTS')
    outputNames.add(output.path)
  }
  const trace = parseCanonical(content('output/module-trace.json'))
  exactKeys(trace, ['loads', 'requests', 'denials', 'configCalls'])
  demand(Array.isArray(trace.loads) && trace.loads.length === 599 && new Set(trace.loads).size === 599 && trace.loads.every(id => ids.has(id)) && Array.isArray(trace.requests) && trace.requests.length === 600 && Array.isArray(trace.denials) && trace.denials.length === 0 && trace.configCalls === 0, 'SOURCE_TRACE')
  for (const request of trace.requests) {
    demand(Array.isArray(request) && request.length === 3 && request.every(value => typeof value === 'string'), 'SOURCE_REQUEST')
    const [from, spec, target] = request
    demand(ids.has(from) && Object.hasOwn(provenance.graph[from], spec) && provenance.graph[from][spec] === target && (ids.has(target) || (target === '@denied-path' && from === 'browserslist/index.js' && spec === 'path')), 'SOURCE_REQUEST')
  }
  demand(Buffer.isBuffer(supplementBytes) && supplementBytes.length <= 128 * 1024, 'SUPPLEMENT_BOUND')
  pinnedBytes(supplementBytes, pins.supplementSha256, pins.supplementBytes, 'SUPPLEMENT_DIGEST')
  pinnedBytes(noticeBytes, pins.noticeSha256, pins.noticeBytes, 'NOTICE_DIGEST')
  const supplement = JSON.parse(supplementBytes.toString('utf8'))
  demand(supplement.schemaVersion === 1 && supplement.evidenceOnly === true && supplement.runtimeAdmitted === false && supplement.fixtureRuntimeAdmitted === false && supplement.packageAdmissionAuthorized === false && supplement.fixture?.sha256 === pins.fixtureSha256 && supplement.approvedNotice?.sha256 === pins.noticeSha256, 'SUPPLEMENT_BINDING')
  const entries = ASSET_PATHS.map(path => {
    const bytes = path === 'CAN_I_USE_ATTRIBUTION.md' ? noticeBytes : content('output/' + path)
    return {path, bytes: bytes.length, sha256: sha(bytes), base64: bytes.toString('base64')}
  }).sort((a,b) => a.path < b.path ? -1 : 1)
  const bytes = canonicalJson({schemaVersion: 1, kind: 'can-i-use-inert-assets', status: 'complete', source: sourceIdentity(pins), runtimeAdmitted: false, entries})
  verifyInertCapsuleBytes(bytes, pins)
  return bytes
}

/** Bounded no-follow reads; no output path is ever opened for input by the selector. */
export function readPinnedFile(path, digest, exactBytes, maxBytes = MAX_ENVELOPE) {
  const namedBefore = fs.lstatSync(path, {bigint: true})
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  const same = (a,b) => sameIdentity(a,b) && a.nlink === b.nlink && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs
  try {
    const before = fs.fstatSync(fd, {bigint: true})
    demand(before.isFile() && before.nlink === 1n && before.uid === BigInt(process.getuid()) && (before.mode & 0o022n) === 0n && namedBefore.isFile() && same(namedBefore,before), 'INPUT_FILE')
    demand(before.size <= BigInt(maxBytes) && (exactBytes === undefined || before.size === BigInt(exactBytes)), 'INPUT_SIZE')
    const bytes = Buffer.alloc(Number(before.size) + 1); let used = 0
    while (used < bytes.length) { const count = fs.readSync(fd, bytes, used, bytes.length-used, used); if (!count) break; used += count }
    const after = fs.fstatSync(fd, {bigint: true}), namedAfter = fs.lstatSync(path, {bigint: true})
    demand(used === Number(before.size) && same(before,after) && namedAfter.isFile() && same(after,namedAfter), 'INPUT_CHANGED')
    const result = bytes.subarray(0,used)
    demand(sha(result) === digest, 'INPUT_DIGEST')
    return result
  } finally { fs.closeSync(fd) }
}
export function validateHostEnvironment(environment) {
  demand(JSON.stringify(Object.keys(environment).sort()) === JSON.stringify(['LANG','LC_ALL','PATH','TZ','__CF_USER_TEXT_ENCODING']) && environment.TZ === 'UTC' && environment.LANG === 'C' && environment.LC_ALL === 'C' && environment.PATH === '/usr/bin:/bin' && environment.__CF_USER_TEXT_ENCODING === '0x1F5:0x0:0x52', 'ENVIRONMENT')
}
/** Never invoke in preparation/synthetic tests. Flag/hash alone is not authorization. */
export function executeApprovedSelection(approvedHash, output) {
  demand(process.version === 'v24.20.0', 'NODE_VERSION')
  demand(output === REAL_OUTPUT, 'OUTPUT_PATH')
  validateHostEnvironment(process.env)
  demand(typeof approvedHash === 'string' && /^[0-9a-f]{64}$/.test(approvedHash), 'APPROVAL_DIGEST')
  readPinnedFile(fileURLToPath(import.meta.url), approvedHash, undefined, 1024*1024)
  const source = readPinnedFile(REAL_INPUT, PRODUCTION_PINS.fixtureSha256, PRODUCTION_PINS.fixtureBytes)
  const supplement = readPinnedFile(fileURLToPath(new URL('supplement.json', SUPPLEMENT_ROOT)), PRODUCTION_PINS.supplementSha256, PRODUCTION_PINS.supplementBytes, 128*1024)
  const notice = readPinnedFile(fileURLToPath(new URL('THIRD_PARTY_NOTICES.proposed.md', SUPPLEMENT_ROOT)), PRODUCTION_PINS.noticeSha256, PRODUCTION_PINS.noticeBytes, 128*1024)
  const bytes = selectInertAssets(source, supplement, notice)
  const held = openEvidenceFile(output, validateInertCapsule, MAX_CAPSULE)
  try {
    const capsuleSha256 = held.publish(JSON.parse(bytes.toString('utf8')))
    held.close()
    console.log(JSON.stringify({outputFile: output, capsuleSha256, selectorSha256: approvedHash, status: 'complete', runtimeAdmitted: false}))
  } finally { held.close() }
}
if (import.meta.main) {
  demand(process.argv.length === 5 && process.argv[2] === '--execute-approved', 'SELECTION_REQUIRES_FRESH_AUTHORIZATION')
  executeApprovedSelection(process.argv[3], process.argv[4])
}
