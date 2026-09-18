import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { encodeWindowsInvocation } from '../plugins/tocktutor/packages/tockbot-note-runtime/src/owned-process-windows.ts'
// @ts-expect-error JavaScript diagnostic helper.
import { HISTORICAL_COMMIT, HISTORICAL_TEST, JOURNAL_SOURCE, historicalArgs, instrumentHistoricalTest, parseJournal, classifyPair } from '../scripts/historical-runner-fixture.mjs'
// @ts-expect-error JavaScript diagnostic helper.
import { buildHistoricalEnvironment, probeHistoricalPnpm, executeOwned, assertPassingArm, validateDependencies, runHistoricalDiagnostic, runArm, runSqlitePathProbe, METADATA_SOURCE } from '../scripts/historical-runner.mjs'

// @ts-expect-error JavaScript diagnostic reporter.
import startupReporter, { parseStartupEvidence, STARTUP_EVIDENCE_BYTES } from '../scripts/historical-runner-reporter.mjs'

// @ts-expect-error JavaScript diagnostic probe.
import { sqlitePathLayout, validateSqlitePathEvidence } from '../scripts/historical-sqlite-path-probe.mjs'

const original = execFileSync('git', ['show', `${HISTORICAL_COMMIT}:${HISTORICAL_TEST}`], { encoding: 'utf8' })

test('historical runner pins exact source and changes only runner isolation between arms', () => {
  assert.throws(() => instrumentHistoricalTest(original + '\n'), /source hash/)
  const instrumented = instrumentHistoricalTest(original)
  assert.ok(instrumented.includes('Date.now() + 5_000'))
  assert.ok(instrumented.includes("historicalBegin('schema-mutation')"))
  assert.ok(instrumented.includes("historicalBegin('reopen-2')"))
  assert.equal((instrumented.match(/historicalBegin\('indexed-readiness'\)/g) ?? []).length, 2)
  const isolated = historicalArgs('default'), inline = historicalArgs('none')
  assert.deepEqual(inline, [isolated[0], '--test-isolation=none', ...isolated.slice(1)])
  assert.equal(isolated.at(-1), 'tests/loader-composition.test.ts')
  assert.throws(() => historicalArgs('other'))
})

test('historical journals fail closed on missing, malformed, fake, oversized or unpaired records', () => {
  const record = { test: 'keyword', phase: 'load', state: 'start', pid: 123, elapsedMs: 1 }
  assert.deepEqual(parseJournal(JSON.stringify(record) + '\n', 123), [record])
  for (const text of ['', '{}\n', 'broken', JSON.stringify({ ...record, pid: 2 }) + '\n', JSON.stringify({ ...record, state: 'pass' }) + '\n', ' '.repeat(32769), (JSON.stringify(record) + '\n').repeat(65)]) {
    assert.throws(() => parseJournal(text, 123))
  }
  assert.throws(() => parseJournal(JSON.stringify({ ...record, state: 'end' }) + '\n', 123))
  assert.throws(() => parseJournal([record, { ...record, phase: 'dispose', state: 'end', elapsedMs: 2 }].map(row => JSON.stringify(row)).join('\n') + '\n'))
})

test('completed passing historical arms remain inconclusive, differences only leads', () => {
  const pass = { status: 'passed', cleanupVerified: true }
  assert.equal(classifyPair([pass, pass]), 'INCONCLUSIVE')
  assert.equal(classifyPair([pass, { ...pass, status: 'failed' }]), 'LEAD_NOT_CAUSAL_PROOF')
  assert.equal(classifyPair([pass]), 'INCONCLUSIVE')
  assert.equal(classifyPair([pass, { ...pass, cleanupVerified: false }]), 'INCONCLUSIVE')
})

test('historical acquisition deadline still awaits and terminates a late owner; uncertainty is sticky', async () => {
  const receipt: Record<string, any> = {}
  let terminated = false
  await executeOwned({}, receipt, 5, undefined, async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
    return { pid: 123, completion: Promise.resolve({ code: 0 }), terminate: async () => { terminated = true; throw new Error('unverified') } }
  })
  assert.equal(terminated, true)
  assert.equal(receipt.deadline, true)
  assert.equal(receipt.cleanupVerified, false)
  assert.equal(receipt.failure, 'ownership cleanup uncertain')
  assert.throws(() => assertPassingArm(receipt))
})

test('historical dependency evidence rejects invented, extra and missing fields', () => {
  for (const value of [undefined, {}, { pid: 1 }, { pid: 1, token: 'must not publish' }]) assert.throws(() => validateDependencies(value, 1))
})

test('historical deterministic default-worker descendant control captures pending phases and cleans its entire tree', {
  skip: process.platform === 'win32' || process.execPath.includes('/Cellar/') ? 'requires standalone POSIX Node; native Windows control is workflow-only' : false,
}, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'historical-control-receipt-'))
  try {
    const output = join(folder, 'receipt.json')
    const result = await runHistoricalDiagnostic({ output, local: true, controlOnly: true })
    assert.equal(result.failed, undefined)
    assert.equal(result.control.controlPassed, true)
    assert.equal(result.control.deadline, true)
    assert.equal(result.rootRemoved, true)
    assert.deepEqual(result.finalInventory, [])
    assert.equal(result.classification, 'INCONCLUSIVE')
    assert.equal((JSON.parse(await readFile(output, 'utf8'))).control.privateError, undefined)
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('metadata on failure records not-yet-loaded identities without importing modules or replacing the test error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'historical-unloaded-'))
  try {
    const tests = join(root, 'tests'), journal = join(root, 'journals'), metadata = join(root, 'metadata')
    for (const folder of [tests, journal, metadata, join(root, 'src')]) await mkdir(folder)
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'tockbot-note-runtime', version: '0.1.2', type: 'module' }))
    await writeFile(join(root, 'src/index.ts'), 'export {}\n')
    for (const name of ['sqlite3', 'flexsearch']) {
      const directory = join(root, 'node_modules', name); await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'package.json'), JSON.stringify({ name, main: 'index.cjs' }))
      await writeFile(join(directory, 'index.cjs'), "throw new Error('MUST NOT FORCE LOAD')")
    }
    const entry = join(tests, 'metadata.mjs')
    await writeFile(entry, JOURNAL_SOURCE + METADATA_SOURCE + "\ntry { throw new Error('original readiness error') } catch (error) { historicalMetadata(); if(error.message !== 'original readiness error') process.exit(1) }\n")
    const receipt: Record<string, any> = {}
    await executeOwned({ executable: process.execPath, args: [entry], cwd: root, env: { ...process.env, HISTORICAL_SOURCE: root, HISTORICAL_JOURNAL: journal, HISTORICAL_METADATA: metadata } }, receipt, 5000)
    assert.equal(receipt.completion.code, 0)
    assert.equal(receipt.cleanupVerified, true)
    const files = await readdir(metadata)
    const record = validateDependencies(JSON.parse(await readFile(join(metadata, files[0]!), 'utf8')), receipt.rootPid)
    assert.equal(record.available, false)
    assert.deepEqual(record.unavailable, ['sqlite3', 'flexsearch', 'sqlite-native'])
    assert.equal(record.native, null)
    assert.deepEqual(record.packages.map((entry: { name: string }) => entry.name), ['tockbot-note-runtime'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('journal writer fails closed at 64 transitions without evicting the pending phases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'historical-journal-bound-'))
  try {
    const journal = join(root, 'journals'); await mkdir(journal)
    const entry = join(root, 'bound.mjs')
    await writeFile(entry, JOURNAL_SOURCE + "\nfor(let index=0;index<65;index++) historicalBegin('pending-descendant')\n")
    const receipt: Record<string, any> = {}
    await executeOwned({ executable: process.execPath, args: [entry], cwd: root, env: { ...process.env, HISTORICAL_JOURNAL: journal } }, receipt, 5000)
    assert.equal(receipt.completion.code, 1)
    assert.equal(receipt.cleanupVerified, true)
    const rows = parseJournal(await readFile(join(journal, receipt.rootPid + '.jsonl'), 'utf8'), receipt.rootPid)
    assert.equal(rows.length, 64)
    assert.ok(rows.every((row: { state: string }) => row.state === 'start'))
    assert.throws(() => assertPassingArm(receipt))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('passing evidence needs every phase, both test identities and the actual isolation topology', () => {
  let elapsedMs = 0
  const journal: Record<string, any>[] = []
  for (const [identity, phases] of [
    ['keyword', ['load', ...Array(4).fill('indexed-readiness'), 'dispose', 'cleanup']],
    ['persistent', ['load', 'indexed-readiness', 'dispose', 'reopen-1', 'indexed-readiness', 'dispose', 'schema-mutation', 'reopen-2', 'indexed-readiness', 'dispose', 'cleanup']],
  ] as const) {
    const record = (phase: string, state: string) => journal.push({ test: identity, phase, state, pid: 124, elapsedMs: elapsedMs++ })
    record('test', 'start')
    for (const phase of phases) { record(phase, 'start'); record(phase, 'end') }
    record('test', 'end')
  }
  const arm = { arm: 'default', rootPid: 123, deadline: false, cleanupVerified: true, completion: { code: 0, signal: null }, journal }
  assertPassingArm(arm)
  assert.throws(() => assertPassingArm({ ...arm, arm: 'none' }))
  assert.throws(() => assertPassingArm({ ...arm, evidenceIncomplete: true }))
  assert.throws(() => assertPassingArm({ ...arm, journal: [...journal, { test: 'persistent', phase: 'load', state: 'start', pid: 124, elapsedMs: elapsedMs++ }] }))
  assert.throws(() => assertPassingArm({ ...arm, journal: journal.filter(row => row.phase !== 'cleanup') }))
  assert.throws(() => assertPassingArm({ ...arm, journal: journal.filter(row => row.test !== 'persistent') }))
  assert.equal(classifyPair([{ ...arm, status: 'passed' }, { ...arm, status: 'failed', evidenceIncomplete: true }]), 'INCONCLUSIVE')
})

test('npm config files remain distinct through prefix initialization and a nested lifecycle', async t => {
  const owners: Record<string, any>[] = []
  const sandbox = await mkdtemp(join(tmpdir(), 'historical-npm-config-'))
  const root = join(sandbox, 'owned')
  try {
    await mkdir(root)
    const ownedHome = join(root, 'home'), ownedTemp = join(root, 'temp')
    const inherited = {
      ...process.env,
      HOME: ownedHome,
      USERPROFILE: ownedHome,
      LOCALAPPDATA: join(root, 'localappdata'),
      APPDATA: join(root, 'appdata'),
      TMP: ownedTemp,
      TEMP: ownedTemp,
      TMPDIR: ownedTemp,
      PATH: [dirname(process.execPath), process.env.PATH ?? ''].join(delimiter),
    }
    const env = buildHistoricalEnvironment(root, inherited)
    const legacyConfig = join(root, 'empty.npmrc')
    await writeFile(legacyConfig, '')
    await writeFile(env.NPM_CONFIG_USERCONFIG, '')
    await writeFile(env.NPM_CONFIG_GLOBALCONFIG, '')
    await mkdir(ownedHome, { recursive: true }); await mkdir(ownedTemp, { recursive: true })
    const capture = join(root, 'capture.mjs')
    await writeFile(capture, `import { appendFileSync } from 'node:fs'; import { spawn } from 'node:child_process'
const [output, ...args] = process.argv.slice(2)
const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let bytes = 0
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { bytes += data.length; if (bytes > 1024 * 1024) process.exit(1); appendFileSync(output, data) })
child.on('error', () => { process.exitCode = 1 }); child.on('close', code => { process.exitCode = code ?? 1 })
`)
    // Windows keeps npm beside node; POSIX installs (including Homebrew) use lib/node_modules.
    let npmBin: string | undefined
    for (const candidate of [
      join(dirname(process.execPath), 'node_modules/npm/bin'),
      join(dirname(process.execPath), 'lib/node_modules/npm/bin'),
      join(dirname(dirname(process.execPath)), 'node_modules/npm/bin'),
      join(dirname(dirname(process.execPath)), 'lib/node_modules/npm/bin'),
    ]) {
      const has = async (file: string) => stat(join(candidate, file)).then(info => info.isFile(), () => false)
      if (await has('npm-cli.js') && await has('npm-prefix.js')) { npmBin = candidate; break }
    }
    assert.ok(npmBin, 'bundled npm was not found beside the standalone Node runtime')
    const npmPrefix = join(npmBin, 'npm-prefix.js')
    const npmCli = join(npmBin, 'npm-cli.js')
    const npmLifecycleEnv = { ...env }
    // npm lifecycle aliases replace the original spelling; Windows forbids both.
    for (const key of ['NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_GLOBALCONFIG']) {
      npmLifecycleEnv[key.toLowerCase()] = npmLifecycleEnv[key]
      delete npmLifecycleEnv[key]
    }
    const legacy = { ...npmLifecycleEnv, npm_config_userconfig: legacyConfig, npm_config_globalconfig: legacyConfig }
    // Check actual Windows admission even when this regression runs on POSIX.
    for (const environment of [env, npmLifecycleEnv, legacy]) {
      assert.doesNotThrow(() => encodeWindowsInvocation({ executable: process.execPath, args: [], env: environment }))
    }
    const red: Record<string, any> = {}; owners.push(red)
    const redLog = join(root, 'npm-red.log')
    await executeOwned({ executable: process.execPath, args: [capture, redLog, npmPrefix], cwd: root, env: legacy }, red, 10000)
    assert.equal(red.cleanupVerified, true)
    assert.equal(red.deadline, false)
    assert.equal(red.failure, undefined)
    assert.equal(red.completion?.code, 1)
    assert.match(await readFile(redLog, 'utf8'), /double-loading config .* as "global"/)

    assert.notEqual(env.NPM_CONFIG_USERCONFIG, env.NPM_CONFIG_GLOBALCONFIG)
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'historical-npm-config', version: '1.0.0', scripts: { prepare: 'npm run compile', compile: 'node compile.mjs' } }))
    await writeFile(join(root, 'compile.mjs'), `import { writeFileSync } from 'node:fs'
writeFileSync('nested-lifecycle.json', JSON.stringify({ user: process.env.npm_config_userconfig ?? process.env.NPM_CONFIG_USERCONFIG, global: process.env.npm_config_globalconfig ?? process.env.NPM_CONFIG_GLOBALCONFIG, prefix: process.env.npm_config_global_prefix ?? process.env.NPM_CONFIG_GLOBAL_PREFIX }))
`)
    const green: Record<string, any> = {}; owners.push(green)
    await executeOwned({ executable: process.execPath, args: [npmCli, 'run', 'prepare'], cwd: root, env: npmLifecycleEnv }, green, 10000)
    assert.equal(green.cleanupVerified, true)
    assert.equal(green.deadline, false)
    assert.equal(green.failure, undefined)
    assert.equal(green.completion?.code, 0)
    const nested = JSON.parse(await readFile(join(root, 'nested-lifecycle.json'), 'utf8'))
    assert.equal(nested.user, env.NPM_CONFIG_USERCONFIG)
    assert.equal(nested.global, env.NPM_CONFIG_GLOBALCONFIG)
    assert.ok(nested.prefix)
    for (const owner of owners) {
      if (process.platform !== 'win32') {
        assert.throws(() => process.kill(owner.rootPid, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
        assert.throws(() => process.kill(-owner.processGroup, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
      }
    }
    t.diagnostic(JSON.stringify({ pids: owners.map(owner => owner.rootPid), cleanupVerified: true, distinctConfigs: true }))
  } finally {
    if (owners.every(owner => owner.cleanupVerified === true)) {
      await rm(sandbox, { recursive: true, force: true })
      await assert.rejects(lstat(sandbox), (error: NodeJS.ErrnoException) => error.code === 'ENOENT')
    } else console.error('Unverified npm test lifetime; retained scratch:', sandbox)
  }
})

test('pnpm 11 historical environment isolates store and XDG paths before any CLI can read configuration', async t => {
  const owners: Record<string, any>[] = []
  const sandbox = await mkdtemp(join(tmpdir(), 'historical-pnpm-isolation-'))
  try {
    const root = join(sandbox, 'owned'), outside = join(sandbox, 'synthetic-outside')
    await mkdir(root); await mkdir(join(outside, 'pnpm'), { recursive: true })
    await writeFile(join(outside, 'pnpm/config.yaml'), 'registry: https://historical-config.invalid/\n')
    await writeFile(join(outside, 'pnpm/auth.ini'), '@historical-sentinel:registry=https://historical-auth.invalid/\n')
    const env = buildHistoricalEnvironment(root, { ...process.env, XDG_CONFIG_HOME: outside, PNPM_HOME: outside, PNPM_CONFIG_STORE_DIR: outside })
    await writeFile(env.NPM_CONFIG_USERCONFIG, '')
    await writeFile(env.NPM_CONFIG_GLOBALCONFIG, '')
    // RED must stop here, before pnpm can inspect any real user configuration.
    for (const [key, part] of Object.entries({ PNPM_CONFIG_STORE_DIR: 'store', XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data', XDG_STATE_HOME: 'state', XDG_CACHE_HOME: 'cache', PNPM_HOME: 'data/pnpm', PNPM_CONFIG_CACHE_DIR: 'cache/pnpm', PNPM_CONFIG_STATE_DIR: 'state/pnpm' })) {
      assert.equal(env[key], join(root, part), `unsafe pnpm destination: ${key}`)
    }
    assert.equal(env.HOME, process.env.HOME); assert.equal(env.USERPROFILE, process.env.USERPROFILE)
    assert.equal(env.npm_config_store_dir, undefined)
    const pnpm = join(dirname(createRequire(import.meta.url).resolve('pnpm')), 'bin/pnpm.cjs')
    const rejected: Record<string, any> = {}
    await assert.rejects(probeHistoricalPnpm(root, process.execPath, { ...env, XDG_CONFIG_HOME: outside }, pnpm, rejected), /unsafe pnpm destination/)
    assert.deepEqual(rejected.operations, [])
    const probe: Record<string, any> = {}; owners.push(probe)
    const installer = await probeHistoricalPnpm(root, process.execPath, env, pnpm, probe)
    assert.equal(probe.cleanupVerified, true)
    assert.deepEqual(probe.effectivePaths, {
      store: 'store/v11', config: 'config/pnpm/config.yaml', globalPackages: 'data/pnpm/global/v11', cache: 'cache/pnpm', state: 'state/pnpm',
    })
    const query = async (environment: Record<string, string>, key: string) => {
      const operation: Record<string, any> = {}; owners.push(operation)
      const output = join(root, `sentinel-${owners.length}.log`)
      await executeOwned({ executable: process.execPath, args: [installer, output, pnpm, 'config', 'get', key], cwd: root, env: environment }, operation, 10000)
      assert.equal(operation.cleanupVerified, true); assert.equal(operation.completion?.code, 0)
      return (await readFile(output, 'utf8')).trim()
    }
    // Positive sensitivity control reads ONLY the synthetic outside files under
    // this test sandbox. HOME/USERPROFILE and npmrc isolation remain unchanged.
    const control = { ...env, XDG_CONFIG_HOME: outside }
    assert.equal(await query(control, 'registry'), 'https://historical-config.invalid/')
    assert.equal(await query(control, '@historical-sentinel:registry'), 'https://historical-auth.invalid/')
    assert.notEqual(await query(env, 'registry'), 'https://historical-config.invalid/')
    assert.equal(await query(env, '@historical-sentinel:registry'), 'undefined')
    assert.equal(await readFile(join(outside, 'pnpm/config.yaml'), 'utf8'), 'registry: https://historical-config.invalid/\n')
    assert.equal(await readFile(join(outside, 'pnpm/auth.ini'), 'utf8'), '@historical-sentinel:registry=https://historical-auth.invalid/\n')
    const escapingRoot = join(sandbox, 'escaping')
    await mkdir(join(escapingRoot, 'config/pnpm'), { recursive: true })
    const escapingEnv = buildHistoricalEnvironment(escapingRoot)
    await writeFile(escapingEnv.NPM_CONFIG_USERCONFIG, '')
    await writeFile(escapingEnv.NPM_CONFIG_GLOBALCONFIG, '')
    await writeFile(join(escapingRoot, 'config/pnpm/config.yaml'), `globalDir: ${JSON.stringify(join(outside, 'packages'))}\n`)
    const escaping: Record<string, any> = {}; owners.push(escaping)
    await assert.rejects(probeHistoricalPnpm(escapingRoot, process.execPath, escapingEnv, pnpm, escaping), /unexpected effective pnpm globalPackages path/)
    assert.equal(escaping.effectivePaths, undefined, 'never publish escaped effective settings')
    const operations = owners.flatMap(owner => owner.operations ?? [owner])
    if (process.platform !== 'win32') for (const operation of operations) {
      assert.throws(() => process.kill(operation.rootPid, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
      assert.throws(() => process.kill(-operation.processGroup, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
    }
    t.diagnostic(JSON.stringify({ pids: operations.map(operation => operation.rootPid), effectivePaths: probe.effectivePaths, cleanupVerified: true, sentinelExcluded: true }))
  } finally {
    if (owners.every(owner => owner.cleanupVerified === true)) await rm(sandbox, { recursive: true, force: true })
    else console.error('Unverified pnpm test lifetime; retained scratch:', sandbox)
  }
})

test('historical SQLite evidence rejects private data, invalid geometry, forged identities and incomplete cases', async () => {
  const { lengths } = sqlitePathLayout(resolve('owned-probe'))
  const ok = { ok: true, code: null }
  const value = {
    version: 1, scope: 'SQLITE_PATH_PROBE_NOT_HISTORICAL_TESTS', pid: 123, node: process.version, architecture: process.arch,
    packageVersion: '5.1.7', sqliteVersion: '3.44.2', lengths,
    entry: { path: 'node_modules/sqlite3/lib/sqlite3.js', sha256: 'a'.repeat(64) },
    native: { path: 'node_modules/sqlite3/build/Release/node_sqlite3.node', sha256: 'b'.repeat(64) },
    cases: ['missing-parent', 'short', 'deep', 'deep', 'short'].map((pathKind, i) => ({
      pathKind, fsRoundTrip: i !== 0, fsCode: i === 0 ? 'ENOENT' : null,
      open: i === 0 ? { ok: false, code: 'SQLITE_CANTOPEN' } : ok,
      write: i === 0 ? null : ok, close: i === 0 ? null : ok, fileRemoved: true,
    })),
  }
  assert.deepEqual(validateSqlitePathEvidence(value, 123, lengths), value)
  for (const mutate of [
    (v: any) => { v.secret = 'PRIVATE_TOKEN' },
    (v: any) => { v.cases[1].stack = 'PRIVATE_TOKEN' },
    (v: any) => { v.cases[1].open.message = 'PRIVATE_TOKEN' },
    (v: any) => { v.cases[1].open.code = 'SQLITE_CANTOPEN_PRIVATE_TOKEN' },
    (v: any) => { v.cases[1].open.code = 14 },
    (v: any) => { v.cases[1].open.code = { private: 'PRIVATE_TOKEN' } },
    (v: any) => { delete v.cases[1].open.code },
    (v: any) => { v.cases[1].open.ok = 'true' },
    (v: any) => { v.cases[1].fsRoundTrip = false },
    (v: any) => { v.cases[1].fileRemoved = false },
    (v: any) => { v.cases[1].pathKind = 'PRIVATE_TOKEN' },
    (v: any) => { v.native.path = '../private.node' },
    (v: any) => { v.native.path = 'C:\\private.node' },
    (v: any) => { v.entry.path = '/private/token' },
    (v: any) => { v.native.sha256 = 'PRIVATE_TOKEN' },
    (v: any) => { v.sqliteVersion = 'PRIVATE_TOKEN' },
    (v: any) => { v.packageVersion = '5.1.8' },
    (v: any) => { v.pid++ },
    (v: any) => { v.lengths.deep++ },
    (v: any) => { v.cases.pop() },
    (v: any) => { v.cases.push(v.cases[1]) },
    (v: any) => { v.scope = 'x'.repeat(8193) },
  ]) {
    const invalid = structuredClone(value); mutate(invalid)
    assert.throws(() => validateSqlitePathEvidence(invalid, 123, lengths))
  }
  const failed = structuredClone(value)
  failed.cases[2]!.open = { ok: false, code: 'SQLITE_CANTOPEN' }
  failed.cases[2]!.write = null; failed.cases[2]!.close = null
  assert.doesNotThrow(() => validateSqlitePathEvidence(failed, 123, lengths))
  failed.cases[2]!.open = { ok: false, code: null }
  assert.doesNotThrow(() => validateSqlitePathEvidence(failed, 123, lengths), 'unknown failure code stays null, not a fabricated success')
  assert.throws(() => sqlitePathLayout(resolve('x'.repeat(300))), /geometry/)
  await assert.rejects(runHistoricalDiagnostic({ output: resolve('unused.json'), controlOnly: true, sqlitePathsOnly: true, local: true }), /mutually exclusive/)
})

test('historical SQLite paths use real SQLite with bounded evidence and reject root reuse', {
  skip: process.execPath.includes('/Cellar/') ? 'requires standalone Node for copied-executable inventory' : false,
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'sqlpath-'))
  const operation: Record<string, any> = {}, repeat: Record<string, any> = {}
  const owners = [operation, repeat]
  const executable = join(root, process.platform === 'win32' ? 'node.exe' : 'node')
  try {
    await copyFile(process.execPath, executable); await chmod(executable, 0o700)
    await runSqlitePathProbe(root, executable, buildHistoricalEnvironment(root), resolve('.'), operation)
    assert.equal(operation.cleanupVerified, true)
    assert.deepEqual(operation.finalInventory, [])
    assert.equal(operation.deadline, false)
    assert.equal(operation.completion.code, 0)
    const evidence = operation.evidence
    assert.equal(evidence.pid, operation.rootPid)
    assert.equal(evidence.packageVersion, '5.1.7')
    assert.match(evidence.native.sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(evidence.cases.map((row: any) => row.pathKind), ['missing-parent', 'short', 'deep', 'deep', 'short'])
    assert.deepEqual(evidence.cases[0], { pathKind: 'missing-parent', fsRoundTrip: false, fsCode: 'ENOENT', open: { ok: false, code: 'SQLITE_CANTOPEN' }, write: null, close: null, fileRemoved: true })
    for (const row of evidence.cases.slice(1)) {
      assert.equal(row.fsRoundTrip, true)
      if (process.platform !== 'win32' || row.pathKind === 'short') {
        assert.deepEqual(row.open, { ok: true, code: null })
        assert.deepEqual(row.write, { ok: true, code: null })
        assert.deepEqual(row.close, { ok: true, code: null })
      }
    }
    assert.ok(!JSON.stringify(operation).includes(root))
    if (process.platform !== 'win32') {
      assert.throws(() => process.kill(operation.rootPid, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
      assert.throws(() => process.kill(-operation.processGroup, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
    }
    const saved = await readFile(join(root, 'sqlite-path/evidence.json'), 'utf8')
    await assert.rejects(runSqlitePathProbe(root, executable, buildHistoricalEnvironment(root), resolve('.'), repeat), /path probe incomplete/)
    assert.equal(repeat.cleanupVerified, true)
    assert.deepEqual(repeat.finalInventory, [])
    assert.equal(repeat.evidence, undefined, 'stale evidence must not be accepted after a failed probe')
    assert.equal(await readFile(join(root, 'sqlite-path/evidence.json'), 'utf8'), saved, 'existing probe files must not be overwritten')
    if (process.platform !== 'win32') {
      assert.throws(() => process.kill(repeat.rootPid, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
      assert.throws(() => process.kill(-repeat.processGroup, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
    }
    t.diagnostic(JSON.stringify({ sqlitePathPid: operation.rootPid, rejectedReusePid: repeat.rootPid, cleanupVerified: true, cases: 5, nativeSha256: evidence.native.sha256 }))
  } finally {
    if (owners.every(owner => !Object.hasOwn(owner, 'cleanupVerified') || (owner.cleanupVerified === true && owner.finalInventory?.length === 0))) {
      await rm(root, { recursive: true, force: true })
      await assert.rejects(lstat(root), { code: 'ENOENT' })
    } else console.error('Unverified SQLite probe lifetime; retained scratch:', root)
  }
})

test('historical startup evidence is bounded, allowlisted, and distinguishes missing or partial capture', async () => {
  const render = async (messages: string[]) => {
    async function* events() { for (const message of messages) yield { type: 'test:stderr', data: { message } } }
    let result = ''
    for await (const row of startupReporter(events())) result += row
    assert.ok(Buffer.byteLength(result) <= STARTUP_EVIDENCE_BYTES)
    return result
  }
  const secret = 'SECRET_WITH_PATH=/Users/private/.npmrc TOKEN=private'
  const output = await render([secret + ' ERR_MODULE_NOT_FOUND SyntaxError\n', 'ERR_MODULE_NOT_FOUND\n'.repeat(5000), 'ERR_DLOPEN_FAILED\n'])
  assert.ok(!output.includes(secret) && !output.includes('/Users/') && !output.includes('TOKEN'))
  const evidence = parseStartupEvidence(output)
  assert.deepEqual(evidence.observed, ['ERR_MODULE_NOT_FOUND', 'SyntaxError'])
  assert.equal(evidence.complete, true)
  assert.equal(evidence.truncated, true)
  assert.equal(evidence.scannedBytes, 65536)
  const clean = parseStartupEvidence(await render([secret]))
  assert.deepEqual(clean.observed, [])
  assert.equal(clean.truncated, false)
  const partial = '{"started":true}\n{"signal":"SyntaxError"}\n'
  assert.deepEqual(parseStartupEvidence(partial), { observed: ['SyntaxError'], failures: [], complete: false, scannedBytes: null, truncated: null, failuresTruncated: null })
  for (const invalid of ['', 'broken\n', '{}\n', partial.trimEnd(), ' '.repeat(STARTUP_EVIDENCE_BYTES + 1),
    '{"started":true,"secret":"private"}\n', '{"started":true}\n{"signal":"SECRET_UNKNOWN"}\n',
    partial + '{"signal":"SyntaxError"}\n', partial + '{"signal":"TypeError","secret":"private"}\n',
    partial + '{"complete":true,"scannedBytes":65537,"truncated":true,"failuresTruncated":false}\n',
    partial + '{"complete":true,"scannedBytes":0,"truncated":false,"failuresTruncated":false}\n{"signal":"TypeError"}\n',
  ]) assert.throws(() => parseStartupEvidence(invalid))
})

test('historical startup failure locations exclude arbitrary names and paths and remain bounded after output truncation', async () => {
  const secret = 'PRIVATE_TOKEN_DO_NOT_PUBLISH'
  const file = join(process.cwd(), 'tests/loader-composition.test.ts')
  const data = { name: 'persistent FlexSearch SQLite indexes reopen outside the user vault', file, line: 123, column: 7, nesting: 0, testNumber: 1, details: { error: Object.assign(new Error(secret), { failureType: 'hookFailed', code: 'SQLITE_BUSY', cause: Object.assign(new Error(secret), { code: 'ENOENT' }) }) } }
  async function* events() {
    yield { type: 'test:stdout', data: { message: 'x'.repeat(65537) } }
    for (const change of [
      {}, { name: file }, { name: 'Keyword search reconciles state-owned indexed candidates through the exact verifier' },
      { file: join(process.cwd(), secret, 'tests/loader-composition.test.ts') },
      { line: 1.5 }, { column: 1_000_001 }, { details: { error: Object.assign(new Error(secret), { failureType: secret }) } },
      { name: data.name + secret }, {},
    ]) yield { type: 'test:fail', data: { ...data, ...change } }
  }
  let output = ''
  for await (const row of startupReporter(events())) output += row
  assert.ok(Buffer.byteLength(output) < STARTUP_EVIDENCE_BYTES)
  assert.ok(!output.includes(secret) && !output.includes(process.cwd()) && !output.includes('loader-composition'))
  const result = parseStartupEvidence(output)
  assert.equal(result.complete, true)
  assert.equal(result.truncated, true)
  assert.equal(result.failuresTruncated, true)
  const known = { test: 'persistent', location: { line: 123, column: 7 }, type: 'hookFailed', code: 'SQLITE_BUSY', causeCode: 'ENOENT' }
  assert.deepEqual(result.failures, [known, { ...known, test: 'file' }, { ...known, test: 'keyword' },
    { ...known, test: 'other', location: null }, { ...known, location: null }, { ...known, location: null },
    { ...known, type: 'other', code: null, causeCode: null }, { ...known, test: 'other' }])
  const row = JSON.stringify({ failure: known }) + '\n', start = '{"started":true}\n'
  assert.deepEqual(parseStartupEvidence(start + row).failures, [known])
  assert.equal(parseStartupEvidence(start + row).complete, false)
  for (const failure of [null, { ...known, test: secret }, { ...known, type: secret }, { ...known, stack: secret },
    { ...known, location: { line: 0, column: 7 } }, { ...known, location: { line: -1, column: 7 } },
    { ...known, location: { line: 1.5, column: 7 } }, { ...known, location: { line: 1_000_001, column: 7 } },
    { ...known, location: { line: 1, column: null } }, { ...known, location: { line: 1, column: 7, file: secret } },
  ]) assert.throws(() => parseStartupEvidence(start + JSON.stringify({ failure }) + '\n'))
  assert.throws(() => parseStartupEvidence(start + row.repeat(9)))
  assert.throws(() => parseStartupEvidence(start + JSON.stringify({ failure: known, secret }) + '\n'))
  assert.throws(() => parseStartupEvidence(start + row + '{"complete":true,"scannedBytes":0,"truncated":false,"failuresTruncated":true}\n'))
  assert.throws(() => parseStartupEvidence(start + '{"complete":true,"scannedBytes":0,"truncated":false,"failuresTruncated":false}\n' + row))
})

test('historical startup error codes retain only exact allowlisted codes at two fixed levels', async () => {
  const secret = 'PRIVATE_TOKEN_DO_NOT_PUBLISH'
  for (const [error, code, causeCode] of [
    [{ code: 'ERR_TEST_FAILURE', cause: { code: 'SQLITE_CANTOPEN' } }, 'ERR_TEST_FAILURE', 'SQLITE_CANTOPEN'],
    [{ code: 'SQLITE_BUSY', cause: { code: 'EACCES' } }, 'SQLITE_BUSY', 'EACCES'],
    [{ code: secret, cause: { code: 'SQLITE_BUSY_' + secret } }, null, null],
    [{ code: 14, cause: { code: { value: 'SQLITE_CANTOPEN' } } }, null, null],
    [{ message: 'SQLITE_CANTOPEN', cause: 'SQLITE_BUSY' }, null, null],
    [{ cause: { cause: { code: 'SQLITE_BUSY' } } }, null, null],
    [null, null, null],
  ] as const) {
    async function* events() {
      yield { type: 'test:fail', data: { name: secret, nesting: 0, testNumber: 1, details: { error } } }
    }
    let output = ''
    for await (const row of startupReporter(events())) output += row
    assert.ok(Buffer.byteLength(output) <= STARTUP_EVIDENCE_BYTES && !output.includes(secret))
    const [failure] = parseStartupEvidence(output).failures
    assert.equal(failure.code, code); assert.equal(failure.causeCode, causeCode)
    for (const change of [{ code: secret }, { causeCode: 'SQLITE_BUSY_' + secret }, { code: 14 }, { causeCode: {} }, { code: undefined }, { causeCode: undefined }, { errno: 14 }]) {
      assert.throws(() => parseStartupEvidence('{"started":true}\n' + JSON.stringify({ failure: { ...failure, ...change } }) + '\n'))
    }
  }
})

test('historical startup errors survive missing journals without publishing private text or changing topology', {
  skip: process.execPath.includes('/Cellar/') ? 'requires standalone Node for copied-executable inventory' : false,
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'historical-startup-'))
  const owners: Record<string, any>[] = []
  const executable = join(root, process.platform === 'win32' ? 'node.exe' : 'node')
  try {
    await copyFile(process.execPath, executable); await chmod(executable, 0o700)
    for (const [scenario, source, signal] of [
      ['import', "import './PRIVATE_TOKEN_DO_NOT_PUBLISH.mjs'", 'ERR_MODULE_NOT_FOUND'],
      ['generic', "throw new Error('PRIVATE_TOKEN_DO_NOT_PUBLISH')", 'test-failure'],
      ['hook', JOURNAL_SOURCE + "\nimport test from 'node:test'; test.before(() => { throw new Error('PRIVATE_TOKEN_DO_NOT_PUBLISH') }); test('persistent FlexSearch SQLite indexes reopen outside the user vault', () => {})", 'test-failure'],
      // Synthetic SQLite-shaped error: exercises Node's uncaught error serialization,
      // not SQLite itself. No exception listener or native dependency is added.
      ['uncaught-code', "import test from 'node:test'; import { EventEmitter } from 'node:events'; test('Keyword search reconciles state-owned indexed candidates through the exact verifier', () => new Promise(() => setImmediate(() => new EventEmitter().emit('error', Object.assign(new Error('PRIVATE_TOKEN_DO_NOT_PUBLISH'), { code: 'SQLITE_CANTOPEN' })))))", 'test-failure'],
      ['uncaught-fs', "import test from 'node:test'; import { readFile } from 'node:fs'; test('Keyword search reconciles state-owned indexed candidates through the exact verifier', () => new Promise(() => readFile('./PRIVATE_TOKEN_DO_NOT_PUBLISH/missing', error => { throw error })))", 'test-failure'],
      ['syntax', 'const PRIVATE_TOKEN_DO_NOT_PUBLISH = ;', 'SyntaxError'],
      ['test', JOURNAL_SOURCE + `\nimport test from 'node:test'; test('Keyword search reconciles state-owned indexed candidates through the exact verifier', () => { historicalBegin('test'); historicalPending.pop(); historicalRecord('test', 'error', new Error('PRIVATE_TOKEN_DO_NOT_PUBLISH')); throw new Error('PRIVATE_TOKEN_DO_NOT_PUBLISH') })`, 'test-failure'],
      ['overflow', "for(let i=0;i<24;i++) await new Promise(resolve => process.stdout.write('x'.repeat(65536), resolve))", ''],
    ]) {
      const folder = join(root, scenario!), fixture = join(folder, 'source')
      const entry = join(fixture, HISTORICAL_TEST)
      await mkdir(dirname(entry), { recursive: true }); await writeFile(entry, source!)
      for (const mode of ['default', 'none']) {
        const arm: Record<string, any> = {}; owners.push(arm)
        await runArm(folder, executable, buildHistoricalEnvironment(root), fixture, mode, arm)
        if (scenario === 'overflow') {
          assert.equal(arm.failure, 'owned operation failed')
          assert.match(arm.privateError, /output limit exceeded/)
          assert.equal(arm.startupEvidence?.complete ?? false, false)
        } else {
          assert.equal(arm.completion?.code, 1)
          assert.ok(arm.startupEvidence.observed.includes(signal))
          assert.equal(arm.startupEvidence.complete, true)
          assert.equal(arm.startupEvidence.truncated, false)
          const [failure] = arm.startupEvidence.failures
          const uncaught = scenario!.startsWith('uncaught-')
          assert.equal(failure.test, scenario === 'test' || uncaught ? 'keyword' : scenario === 'hook' ? 'persistent' : 'file')
          assert.equal(failure.type, uncaught ? 'uncaughtException' : scenario === 'hook' ? 'hookFailed' : scenario === 'test' || mode === 'default' ? 'testCodeFailure' : 'other', `${scenario}/${mode}`)
          if (uncaught) {
            assert.equal(failure.code, 'ERR_TEST_FAILURE')
            assert.equal(failure.causeCode, scenario === 'uncaught-code' ? 'SQLITE_CANTOPEN' : 'ENOENT')
          }
          assert.equal(failure.location.line, ['test', 'hook'].includes(scenario!) ? source!.split('\n').findIndex(line => line.includes("test('")) + 1 : 1)
          assert.ok(failure.location.column > 0)
          assert.equal(arm.startupEvidence.failuresTruncated, false)
          assert.ok(arm.completion.stdoutBytes > 0, 'original spec output still counts toward the owned output ceiling')
        }
        assert.equal(arm.deadline, false)
        assert.equal(arm.cleanupVerified, true)
        assert.deepEqual(arm.finalInventory, [])
        assert.equal(arm.evidenceIncomplete, true)
        assert.equal(arm.status, 'failed')
        assert.equal(arm.reporterSha256.length, 64)
        assert.deepEqual(arm.args, historicalArgs(mode), 'base test arguments unchanged')
        if (scenario === 'test') assert.equal(arm.journal[0].pid === arm.rootPid, mode === 'none')
        else assert.equal(arm.journal, undefined, 'error is available even before journal initialization')
        const publicText = JSON.stringify(arm)
        assert.ok(!publicText.includes('PRIVATE_TOKEN') && !publicText.includes(root))
        if (process.platform !== 'win32') {
          assert.throws(() => process.kill(arm.rootPid, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
          assert.throws(() => process.kill(-arm.processGroup, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
        }
      }
    }
    t.diagnostic(JSON.stringify({ pids: owners.map(owner => owner.rootPid), cleanupVerified: true, cases: owners.length, topologyVerified: true }))
  } finally {
    if (owners.every(owner => owner.cleanupVerified === true)) {
      await rm(root, { recursive: true, force: true })
      await assert.rejects(lstat(root), (error: NodeJS.ErrnoException) => error.code === 'ENOENT')
    } else console.error('Unverified startup test lifetime; retained scratch:', root)
  }
})
