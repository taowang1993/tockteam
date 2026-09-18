import assert from 'node:assert/strict'
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HISTORICAL_TEST, sha256 } from './historical-runner-fixture.mjs'
import { allowedCode } from './historical-runner-reporter.mjs'

export const SQLITE_PATH_EVIDENCE_BYTES = 8192
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), expected.split(' ').sort())

// Same 136-character ASCII basename at both locations. No new volume, external
// temp root, permission changes, or changes to the historical tests are needed.
export function sqlitePathLayout(root) {
  assert.ok(isAbsolute(root))
  const folder = join(root, 'sqlite-path'), leaf = 'a'.repeat(64) + '-' + 'b'.repeat(64) + '.sqlite'
  const historical = (mode, prefix) => join(root, mode, 'data', prefix + 'XXXXXX', 'state', 'search-index', 'tocktutor-search-v2', leaf).length
  const lengths = {
    keywordDefault: historical('default', 'note-vault-indexed-search-'),
    keywordNone: historical('none', 'note-vault-indexed-search-'),
    persistentDefault: historical('default', 'note-vault-search-index-'),
    persistentNone: historical('none', 'note-vault-search-index-'),
  }
  const short = join(folder, 's', leaf), target = Math.max(280, lengths.keywordDefault)
  const padding = target - join(folder, 'd', leaf).length - 1
  assert.ok(short.length <= 240 && padding > 0 && padding <= 200, 'unsafe path-probe geometry')
  const deep = join(folder, 'd', 'x'.repeat(padding), leaf)
  return { folder, short, deep, 'missing-parent': join(folder, 'm', leaf), lengths: { ...lengths, short: short.length, deep: deep.length } }
}

export function validateSqlitePathEvidence(value, pid, lengths) {
  assert.ok(Buffer.byteLength(JSON.stringify(value)) <= SQLITE_PATH_EVIDENCE_BYTES)
  keys(value, 'version scope pid node architecture packageVersion sqliteVersion entry native lengths cases')
  assert.equal(value.version, 1); assert.equal(value.scope, 'SQLITE_PATH_PROBE_NOT_HISTORICAL_TESTS')
  assert.equal(value.pid, pid); assert.equal(value.node, process.version); assert.equal(value.architecture, process.arch)
  assert.equal(value.packageVersion, '5.1.7'); assert.match(value.sqliteVersion, /^\d{1,3}\.\d{1,3}\.\d{1,3}$/)
  for (const identity of [value.entry, value.native]) {
    keys(identity, 'path sha256')
    assert.equal(typeof identity.path, 'string')
    assert.ok(identity.path.length > 0 && identity.path.length <= 1024 && !isAbsolute(identity.path) && !/[\\:]/.test(identity.path) && !identity.path.split('/').some(part => part === '..' || part === '.' || !part))
    assert.match(identity.sha256, /^[a-f0-9]{64}$/)
  }
  assert.ok(value.native.path.endsWith('.node'))
  assert.deepEqual(value.lengths, lengths)
  assert.ok(Array.isArray(value.cases) && value.cases.length === 5)
  for (const [i, row] of value.cases.entries()) {
    keys(row, 'pathKind fsRoundTrip fsCode open write close fileRemoved')
    assert.equal(row.pathKind, ['missing-parent', 'short', 'deep', 'deep', 'short'][i])
    assert.equal(row.fsRoundTrip, i !== 0); assert.equal(row.fsCode, i === 0 ? 'ENOENT' : null)
    assert.equal(row.fileRemoved, true)
    if (i === 0) assert.deepEqual(row.open, { ok: false, code: 'SQLITE_CANTOPEN' })
    for (const stage of ['open', 'write', 'close']) {
      const result = row[stage]
      if (stage !== 'open' && !row.open.ok) { assert.equal(result, null); continue }
      keys(result, 'ok code'); assert.equal(typeof result.ok, 'boolean')
      assert.ok(result.code === null || (typeof result.code === 'string' && allowedCode(result.code) === result.code))
      if (result.ok) assert.equal(result.code, null)
    }
  }
  return value
}

async function probe(root, fixture) {
  root = await realpath(root); fixture = await realpath(fixture)
  const layout = sqlitePathLayout(root)
  await mkdir(layout.folder, { mode: 0o700 }) // Exclusive creation; never reuse a prior probe.
  const require = createRequire(join(fixture, HISTORICAL_TEST))
  const sqlite3 = require('sqlite3')
  assert.equal(require('sqlite3/package.json').version, '5.1.7')
  const identity = async path => {
    const actual = await realpath(path), part = relative(fixture, actual)
    assert.ok(part && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part))
    return { path: part.split(sep).join('/'), sha256: sha256(await readFile(actual)) }
  }
  const native = Object.keys(require.cache).filter(path => path.endsWith('.node') && path.includes('sqlite'))
  assert.equal(native.length, 1)
  const evidence = {
    version: 1, scope: 'SQLITE_PATH_PROBE_NOT_HISTORICAL_TESTS', pid: process.pid,
    node: process.version, architecture: process.arch, packageVersion: '5.1.7', sqliteVersion: sqlite3.VERSION,
    entry: await identity(require.resolve('sqlite3')), native: await identity(native[0]), lengths: layout.lengths, cases: [],
  }
  for (const path of [layout.short, layout.deep]) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    assert.equal(await realpath(dirname(path)), dirname(path), 'aliased probe parent')
    assert.equal((await lstat(dirname(path))).dev, (await lstat(root)).dev, 'probe changed volume')
  }
  const outcome = error => ({ ok: !error, code: allowedCode(error?.code) })
  for (const pathKind of ['missing-parent', 'short', 'deep', 'deep', 'short']) {
    const path = layout[pathKind], missing = pathKind === 'missing-parent'
    // Test the exact filename through Node first, then remove it. SQLite still
    // opens a nonexistent file, as the historical constructor does on first use.
    if (missing) {
      await assert.rejects(writeFile(path, 'owned-path-control', { flag: 'wx' }), { code: 'ENOENT' })
    } else {
      await writeFile(path, 'owned-path-control', { flag: 'wx', mode: 0o600 })
      assert.equal(await readFile(path, 'utf8'), 'owned-path-control')
      await rm(path)
    }
    const row = { pathKind, fsRoundTrip: !missing, fsCode: missing ? 'ENOENT' : null, open: null, write: null, close: null, fileRemoved: false }
    // Explicit native callbacks are ONLY in this separate controlled probe;
    // there are no global exception handlers or wrappers of historical code.
    const opened = await new Promise(resolve => {
      new sqlite3.Database(path, function (error) { resolve({ database: this, result: outcome(error) }) })
    })
    row.open = opened.result
    if (row.open.ok) {
      try {
        row.write = await new Promise(resolve => opened.database.exec("CREATE TABLE probe(value TEXT); INSERT INTO probe VALUES ('ok');", error => resolve(outcome(error))))
      } finally {
        row.close = await new Promise(resolve => opened.database.close(error => resolve(outcome(error))))
      }
    }
    // sqlite3 5.1.7 closes a failed-open handle before invoking its callback.
    // Successful opens must close before any subsequent case touches the file.
    assert.ok(row.close === null || row.close.ok, 'SQLite close failed')
    await rm(path, { force: true })
    if (missing) await assert.rejects(lstat(dirname(path)), { code: 'ENOENT' })
    else assert.deepEqual(await readdir(dirname(path)), [], 'database sidecars remain')
    row.fileRemoved = true
    evidence.cases.push(row)
  }
  validateSqlitePathEvidence(evidence, process.pid, layout.lengths)
  await writeFile(join(layout.folder, 'evidence.json'), JSON.stringify(evidence), { flag: 'wx', mode: 0o600 })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assert.equal(process.argv.length, 4); await probe(process.argv[2], process.argv[3]) }
  catch { console.error('SQLite path probe incomplete; no raw errors published.'); process.exitCode = 1 }
}
