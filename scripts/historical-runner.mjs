import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { spawnOwnedProcess } from '../plugins/tocktutor/packages/tockbot-note-runtime/src/owned-process.ts'
import { windowsProofProcessFilter } from './owned-process-windows-proof.mjs'
import { HISTORICAL_COMMIT, HISTORICAL_TREE, HISTORICAL_TEST, HISTORICAL_TEST_SHA256, JOURNAL_SOURCE, sha256, historicalArgs, instrumentHistoricalTest, parseJournal, classifyPair } from './historical-runner-fixture.mjs'
import { parseStartupEvidence, STARTUP_EVIDENCE_BYTES } from './historical-runner-reporter.mjs'
import { sqlitePathLayout, validateSqlitePathEvidence, SQLITE_PATH_EVIDENCE_BYTES } from './historical-sqlite-path-probe.mjs'

const execFile = promisify(execFileCallback)
const repository = fileURLToPath(new URL('../', import.meta.url))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const controllers = new Set()
let interrupted = false
const interrupt = () => { interrupted = true; for (const controller of controllers) controller.abort() }
const contained = (root, path) => { const part = relative(root, path); assert.ok(part && !part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part), 'path escaped fixture'); return part.split(sep).join('/') }

// A timer covers acquisition as well as execution. Even a late owner must be
// acquired and verified terminated before callers may remove its fixture.
export async function executeOwned(options, receipt, milliseconds, during = async () => {}, spawn = spawnOwnedProcess) {
  const controller = new AbortController()
  controllers.add(controller)
  const timer = setTimeout(() => { receipt.deadline = true; controller.abort() }, milliseconds)
  receipt.cleanupVerified = false; receipt.deadline = false; receipt.deadlineMs = milliseconds
  let acquisition, owner, observation
  try {
    if (interrupted) controller.abort()
    acquisition = spawn({ ...options, signal: controller.signal, maxOutputBytes: 1024 * 1024 })
    owner = await acquisition
    receipt.rootPid = owner.pid
    if (process.platform !== 'win32') receipt.processGroup = owner.pid
    void owner.completion.catch(() => {})
    observation = during(owner, controller.signal)
    await Promise.race([observation, owner.completion])
    receipt.completion = await owner.completion
  } catch (error) {
    receipt.failure = receipt.deadline ? 'absolute deadline' : 'owned operation failed'
    // Keep raw errors private; stdout/stderr are byte counts, not evidence text.
    receipt.privateError = String(error.message).slice(0, 4096)
  } finally {
    try {
      owner ??= await acquisition
      if (owner) { await owner.terminate(); receipt.cleanupVerified = true }
      else receipt.cleanupVerified = !acquisition // No attempt was made.
    } catch (error) {
      receipt.failure = 'ownership cleanup uncertain'
      receipt.privateError = String(error.message).slice(0, 4096)
    } finally {
      clearTimeout(timer); controller.abort(); controllers.delete(controller)
      await observation?.catch(() => {})
    }
  }
  return receipt
}

export async function readJournals(folder) {
  const files = await readdir(folder)
  assert.ok(files.length > 0 && files.length <= 4, 'missing or excessive journal files')
  let bytes = 0
  const result = []
  for (const file of files.sort()) {
    assert.match(file, /^[1-9][0-9]*\.jsonl$/)
    const path = join(folder, file), stat = await lstat(path)
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'invalid journal file')
    bytes += stat.size; assert.ok(bytes <= 32768, 'total journal byte bound')
    const text = await readFile(path, 'utf8')
    result.push(...parseJournal(text, Number(file.split('.')[0])))
  }
  return result
}

export function assertPassingArm(arm) {
  assert.notEqual(arm.evidenceIncomplete, true)
  assert.equal(arm.cleanupVerified, true)
  assert.equal(arm.deadline, false)
  assert.equal(arm.failure, undefined)
  assert.equal(arm.completion?.code, 0)
  assert.equal(arm.completion?.signal, null)
  assert.ok(Array.isArray(arm.journal) && arm.journal.length > 0)
  assert.equal(new Set(arm.journal.map(row => row.pid)).size, 1)
  const worker = arm.journal[0].pid
  assert.equal(worker === arm.rootPid, arm.arm === 'none', 'file-worker topology mismatch')
  assert.ok(arm.journal.every(row => row.state !== 'error'))
  parseJournal(arm.journal.map(row => JSON.stringify(row)).join('\n') + '\n', worker)
  assert.equal(arm.journal.filter(row => row.state === 'start').length, arm.journal.filter(row => row.state === 'end').length, 'passing journal has a pending phase')
  const ends = arm.journal.filter(row => row.phase === 'test' && row.state === 'end')
  assert.deepEqual(ends.map(row => row.test), ['keyword', 'persistent'])
  for (const [identity, loads, readiness, disposals] of [['keyword', 1, 4, 1], ['persistent', 3, 3, 3]]) {
    const phases = arm.journal.filter(row => row.test === identity && row.state === 'end').map(row => row.phase)
    assert.equal(phases.filter(phase => ['load', 'reopen-1', 'reopen-2'].includes(phase)).length, loads)
    assert.equal(phases.filter(phase => phase === 'indexed-readiness').length, readiness)
    assert.equal(phases.filter(phase => phase === 'dispose').length, disposals)
    assert.equal(phases.filter(phase => phase === 'cleanup').length, 1)
  }
  assert.equal(arm.journal.filter(row => row.phase === 'schema-mutation' && row.state === 'end').length, 1)
}

export function validateDependencies(value, pid) {
  assert.deepEqual(Object.keys(value).sort(), ['architecture', 'available', 'native', 'node', 'packages', 'pid', 'threadpool', 'unavailable'])
  assert.equal(typeof value.available, 'boolean')
  assert.ok(Array.isArray(value.unavailable) && value.unavailable.length <= 4 && value.unavailable.every(name => ['sqlite3', 'flexsearch', 'tockbot-note-runtime', 'sqlite-native', 'inspection-failed'].includes(name)))
  assert.equal(value.available, value.unavailable.length === 0)
  assert.equal(value.pid, pid)
  assert.equal(value.node, process.version)
  assert.equal(value.architecture, process.arch)
  assert.equal(value.threadpool, 'default:4')
  const path = value => { assert.equal(typeof value, 'string'); assert.ok(!isAbsolute(value) && !value.includes('\\') && !value.split('/').includes('..') && !value.includes(':') && value.length <= 1024) }
  const hash = value => assert.match(value, /^[a-f0-9]{64}$/)
  assert.ok(Array.isArray(value.packages) && value.packages.length <= 3)
  if (value.available) assert.equal(value.packages.length, 3)
  const versions = { sqlite3: '5.1.7', flexsearch: '0.8.212', 'tockbot-note-runtime': '0.1.2' }
  assert.equal(new Set(value.packages.map(entry => entry.name)).size, value.packages.length)
  for (const entry of value.packages) {
    assert.deepEqual(Object.keys(entry).sort(), ['entry', 'name', 'sha256', 'version'])
    assert.ok(Object.hasOwn(versions, entry.name)); assert.equal(entry.version, versions[entry.name]); path(entry.entry); hash(entry.sha256)
  }
  if (value.native !== null) {
    assert.deepEqual(Object.keys(value.native).sort(), ['path', 'sha256'])
    path(value.native.path); hash(value.native.sha256)
  } else assert.equal(value.available, false)
  return value
}

async function inventory(executable) {
  if (process.platform === 'win32') {
    const filter = windowsProofProcessFilter(executable, join(process.env.SystemRoot, 'System32', 'cmd.exe'))
    const command = `$ErrorActionPreference='Stop'; $rows=@(Get-CimInstance Win32_Process | Where-Object { $process=$_; ${filter} } | Select-Object ProcessId,ParentProcessId); ConvertTo-Json -InputObject $rows -Compress`
    const { stdout } = await execFile(join(process.env.ProgramFiles, 'PowerShell/7/pwsh.exe'), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 5000, maxBuffer: 65536 })
    const rows = JSON.parse(stdout)
    assert.ok(Array.isArray(rows) && rows.every(row => Number.isSafeInteger(row.ProcessId) && row.ProcessId > 0 && Number.isSafeInteger(row.ParentProcessId)), 'invalid independent CIM inventory')
    return rows
  }
  const { stdout } = await execFile('/bin/ps', ['-axo', 'pid=,ppid=,command='], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 })
  return stdout.split('\n').flatMap(line => {
    const row = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    return row && row[3].startsWith(executable) ? [{ ProcessId: Number(row[1]), ParentProcessId: Number(row[2]) }] : []
  })
}

async function journalControl(root, executable, env, receipt) {
  const folder = join(root, 'control'); await mkdir(folder)
  const journals = join(folder, 'journals'); await mkdir(journals)
  const childFile = join(folder, 'descendant.mjs'), testFile = join(folder, 'control.test.mjs')
  await writeFile(childFile, JOURNAL_SOURCE + "\nhistoricalBegin('pending-descendant'); setInterval(() => {}, 1000)\n")
  await writeFile(testFile, JOURNAL_SOURCE + `\nimport test from 'node:test'; import { spawn } from 'node:child_process'\ntest('stalled descendant control', async () => { historicalBegin('test'); historicalBegin('pending-descendant'); spawn(process.execPath, [${JSON.stringify(childFile)}], { stdio: 'ignore' }); await new Promise(() => {}) })\n`)
  await executeOwned({ executable, args: ['--test', testFile], cwd: folder, env: { ...env, HISTORICAL_JOURNAL: journals } }, receipt, 5000, async (_owner, signal) => {
    while (!signal.aborted) {
      if ((await readdir(journals)).length === 2) {
        receipt.initialInventory = await inventory(executable)
        if (receipt.initialInventory.length >= 3) return
      }
      await delay(25)
    }
  })
  receipt.journal = await readJournals(journals)
  receipt.finalInventory = await inventory(executable)
  receipt.status = 'deadline'
  assert.equal(receipt.deadline, true, 'negative control must actually exceed its deadline')
  assert.equal(receipt.cleanupVerified, true)
  assert.ok(receipt.initialInventory?.length >= 3, 'independent inventory must see root, default worker and descendant')
  assert.ok(receipt.initialInventory.some(row => row.ProcessId === receipt.rootPid))
  const pids = new Set(receipt.journal.map(row => row.pid))
  assert.equal(pids.size, 2)
  assert.ok(!pids.has(receipt.rootPid), 'control must use default file isolation')
  for (const pid of pids) assert.ok(receipt.initialInventory.some(row => row.ProcessId === pid))
  assert.ok(receipt.journal.every(row => row.state === 'start'), 'control phase must remain pending')
  assert.deepEqual(receipt.finalInventory, [])
  assert.throws(() => assertPassingArm(receipt), 'stalled control must not be accepted as passing tests')
  receipt.controlPassed = true
}

async function git(cwd, args) {
  return (await execFile('git', ['-C', cwd, ...args], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim()
}

async function archiveTree(sourceRepo, commit, destination, pins, path = '.') {
  const tree = await git(sourceRepo, ['rev-parse', `${commit}^{tree}`])
  if (path === '.') assert.equal(tree, HISTORICAL_TREE, 'historical tree hash mismatch')
  const archive = destination + '.tar'
  await mkdir(destination, { recursive: true })
  await git(sourceRepo, ['archive', '--format=tar', `--output=${archive}`, commit])
  pins.push({ path, commit, tree, archiveSha256: sha256(await readFile(archive)) })
  await execFile('tar', ['-xf', archive, '-C', destination], { timeout: 30000, maxBuffer: 65536 })
  await rm(archive)
  const links = (await git(sourceRepo, ['ls-tree', '-r', commit])).split('\n').filter(line => line.startsWith('160000 '))
  for (const link of links) {
    const [, sha, subpath] = /^160000 commit ([a-f0-9]{40})\t(.+)$/.exec(link)
    await archiveTree(join(sourceRepo, subpath), sha, join(destination, subpath), pins, path === '.' ? subpath : `${path}/${subpath}`)
  }
}

const sourceFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'plugins/tocktutor/package.json', 'plugins/tocktutor/pnpm-lock.yaml', 'plugins/tocktutor/pnpm-workspace.yaml', 'plugins/tocktutor/packages/tockbot-note-runtime/src/index.ts', HISTORICAL_TEST]
async function sourceHashes(fixture) {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha256(await readFile(join(fixture, file)))])))
}

// Installed identities are read in the historical test process after actual load,
// never inferred from a lockfile or the current checkout's module resolution.
export const METADATA_SOURCE = `
import { createRequire as historicalRequire } from 'node:module'
import { readFileSync as historicalRead, realpathSync as historicalRealpath } from 'node:fs'
import { dirname as historicalDirname, relative as historicalRelative, isAbsolute as historicalAbsolute, sep as historicalSep } from 'node:path'
import { createHash as historicalHash } from 'node:crypto'
import { fileURLToPath as historicalFilePath } from 'node:url'
const historicalDependencies = historicalRequire(import.meta.url)
let historicalMetadataComplete = false
function historicalMetadata() {
  if (historicalMetadataComplete) return
  const receipt = { pid: process.pid, node: process.version, architecture: process.arch, threadpool: process.env.UV_THREADPOOL_SIZE ?? 'default:4', available: false, unavailable: [], packages: [], native: null }
  try {
  const root = historicalRealpath(process.env.HISTORICAL_SOURCE)
  const local = path => { const part = historicalRelative(root, historicalRealpath(path)); if (!part || part === '..' || part.startsWith('..' + historicalSep) || historicalAbsolute(part)) throw new Error('dependency escaped historical fixture'); return part.split(historicalSep).join('/') }
  const hash = path => historicalHash('sha256').update(historicalRead(path)).digest('hex')
  for (const name of ['sqlite3', 'flexsearch', 'tockbot-note-runtime']) {
    let entry
    try { entry = name === 'tockbot-note-runtime' ? historicalJoin(historicalDirname(historicalFilePath(import.meta.url)), '../src/index.ts') : historicalDependencies.resolve(name) } catch { receipt.unavailable.push(name); continue }
    if (name !== 'tockbot-note-runtime' && !historicalDependencies.cache[entry]) { receipt.unavailable.push(name); continue }
    let directory = historicalDirname(entry)
    while (true) { let info; try { info = JSON.parse(historicalRead(historicalJoin(directory, 'package.json'), 'utf8')) } catch {} if (info?.name === name) { receipt.packages.push({ name, version: info.version, entry: local(entry), sha256: hash(entry) }); break } const parent = historicalDirname(directory); if (parent === directory) throw new Error('missing dependency identity'); directory = parent }
  }
  const native = Object.keys(historicalDependencies.cache).filter(path => path.endsWith('.node') && path.includes('sqlite'))
  if (native.length === 1) receipt.native = { path: local(native[0]), sha256: hash(native[0]) }
  else receipt.unavailable.push('sqlite-native')
  receipt.available = receipt.unavailable.length === 0
  } catch { receipt.available = false; receipt.unavailable = ['inspection-failed'] }
  // Evidence failure never replaces the original readiness error or forces a load.
  try { historicalWrite(historicalJoin(process.env.HISTORICAL_METADATA, process.pid + '.json'), JSON.stringify(receipt)); historicalMetadataComplete = receipt.available } catch {}
}
`

export function buildHistoricalEnvironment(root, inherited = process.env) {
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TMP', 'TEMP', 'TMPDIR', 'ProgramFiles'].filter(key => inherited[key] !== undefined).map(key => [key, inherited[key]]))
  env.PATH = [root, join(root, 'data/pnpm/bin'), env.PATH ?? ''].join(delimiter)
  Object.assign(env, {
    PNPM_CONFIG_STORE_DIR: join(root, 'store'),
    XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'), XDG_CACHE_HOME: join(root, 'cache'),
    PNPM_HOME: join(root, 'data/pnpm'),
    // pnpm config get hides derived defaults; explicit equivalent destinations
    // let the public CLI verify cache/state without private APIs or FS tracing.
    PNPM_CONFIG_CACHE_DIR: join(root, 'cache/pnpm'), PNPM_CONFIG_STATE_DIR: join(root, 'state/pnpm'),
    electron_config_cache: join(root, 'electron-cache'), npm_config_cache: join(root, 'npm-cache'),
    npm_config_devdir: join(root, 'node-gyp'),
    NPM_CONFIG_USERCONFIG: join(root, 'empty-user.npmrc'), NPM_CONFIG_GLOBALCONFIG: join(root, 'empty-global.npmrc'),
  })
  return env
}

export async function probeHistoricalPnpm(root, executable, env, pnpm, receipt) {
  receipt.operations = []; receipt.cleanupVerified = false
  try {
    // Gate before ANY pnpm invocation: a probe must not read real user settings.
    const expected = buildHistoricalEnvironment(root)
    for (const key of ['PNPM_CONFIG_STORE_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'PNPM_HOME', 'PNPM_CONFIG_CACHE_DIR', 'PNPM_CONFIG_STATE_DIR', 'NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_GLOBALCONFIG', 'npm_config_cache', 'npm_config_devdir', 'electron_config_cache']) {
      assert.equal(env[key], expected[key], `unsafe pnpm destination: ${key}`)
    }
    const installer = join(root, 'installer.mjs')
    await writeFile(installer, `import { spawn } from 'node:child_process'; import { appendFileSync } from 'node:fs';\nconst child = spawn(process.execPath, process.argv.slice(3), { stdio: ['ignore', 'pipe', 'pipe'] }); let bytes = 0;\nfor (const stream of [child.stdout, child.stderr]) stream.on('data', data => { bytes += data.length; if (bytes > 1024 * 1024) process.exit(1); appendFileSync(process.argv[2], data); process.stdout.write(data) });\nchild.on('error', () => { process.exitCode = 1 }); child.on('close', code => { process.exitCode = code ?? 1 });\n`)
    const query = async (name, args) => {
      const operation = { name }; receipt.operations.push(operation)
      const output = join(root, `pnpm-probe-${receipt.operations.length}.log`)
      await executeOwned({ executable, args: [installer, output, pnpm, ...args], cwd: root, env }, operation, 10000)
      assert.equal(operation.cleanupVerified, true, 'pnpm probe ownership uncertain')
      assert.equal(operation.completion?.code, 0, `pnpm ${name} probe failed`)
      assert.equal(operation.failure, undefined)
      assert.ok((await lstat(output)).size <= 4096, 'pnpm path probe output bound')
      return (await readFile(output, 'utf8')).trim()
    }
    assert.equal(await query('version', ['--version']), '11.21.0', 'must use historical pnpm version')
    const paths = {}
    for (const [name, args, expectedPath] of [
      ['store', ['store', 'path'], join(root, 'store/v11')],
      ['config', ['config', 'get', 'globalconfig'], join(root, 'config/pnpm/config.yaml')],
      ['globalPackages', ['root', '--global'], join(root, 'data/pnpm/global/v11')],
      ['cache', ['config', 'get', 'cache-dir'], join(root, 'cache/pnpm')],
      ['state', ['config', 'get', 'state-dir'], join(root, 'state/pnpm')],
    ]) {
      const value = await query(name, args)
      assert.ok(isAbsolute(value) && resolve(value) === resolve(expectedPath), `unexpected effective pnpm ${name} path`)
      paths[name] = contained(root, value)
    }
    // Only validated fixture-relative destinations are published, never config
    // dumps or auth. These are configured paths, not tracing of every install write.
    receipt.effectivePaths = paths
    return installer
  } finally { receipt.cleanupVerified = receipt.operations.every(operation => operation.cleanupVerified === true) }
}

async function installFixture(root, executable, env, pnpm, receipt) {
  const fixture = join(root, 'source')
  receipt.pins = []
  await archiveTree(repository, HISTORICAL_COMMIT, fixture, receipt.pins)
  receipt.originalHashes = await sourceHashes(fixture)
  assert.equal(receipt.originalHashes[HISTORICAL_TEST], HISTORICAL_TEST_SHA256)
  receipt.installs = []; receipt.pnpmProbe = {}
  const installer = await probeHistoricalPnpm(root, executable, env, pnpm, receipt.pnpmProbe)
  receipt.pnpm = '11.21.0'
  for (const cwd of [fixture, join(fixture, 'plugins/tocktutor')]) {
    const entry = { directory: contained(root, cwd) }; receipt.installs.push(entry)
    const log = join(root, `install-${receipt.installs.length}.log`)
    entry.args = ['install', '--frozen-lockfile']
    await executeOwned({ executable, args: [installer, log, pnpm, ...entry.args], cwd, env }, entry, 240000)
    if (entry.completion?.code !== 0) {
      const text = await readFile(log, 'utf8').catch(() => '')
      entry.installErrorCodes = [...new Set(text.match(/ERR_PNPM_[A-Z_]+/g) ?? [])].slice(0, 8)
      console.error(text.slice(-4096)) // Private local/CI log only, never artifact evidence.
    }
    assert.equal(entry.cleanupVerified, true, 'install ownership uncertain')
    assert.equal(entry.completion?.code, 0, 'frozen historical dependency installation failed')
    assert.equal(entry.failure, undefined)
  }
  assert.deepEqual(await sourceHashes(fixture), receipt.originalHashes, 'install changed historical source/lock/policy')
  const original = await readFile(join(fixture, HISTORICAL_TEST), 'utf8')
  const instrumented = instrumentHistoricalTest(original) + METADATA_SOURCE
  // Cordis load may return before lazy native initialization. Capture once after
  // actual indexed readiness, still inside the original test's cleanup scope.
  const text = instrumented
    .replaceAll("historicalEnd('indexed-readiness')", "historicalEnd('indexed-readiness'); historicalMetadata()")
    .replaceAll("historicalEnd('test')", "historicalMetadata(); historicalEnd('test')")
    .replaceAll("historicalRecord('test', 'error', error)", "historicalMetadata(); historicalRecord('test', 'error', error)")
  await writeFile(join(fixture, HISTORICAL_TEST), text)
  receipt.instrumentedTestSha256 = sha256(text)
  return fixture
}

export async function runSqlitePathProbe(root, executable, env, fixture, operation) {
  root = await realpath(root)
  const script = fileURLToPath(new URL('./historical-sqlite-path-probe.mjs', import.meta.url))
  operation.probeSha256 = sha256(await readFile(script))
  await executeOwned({ executable, args: [script, root, fixture], cwd: root, env }, operation, 20000)
  operation.finalInventory = await inventory(executable)
  assert.equal(operation.cleanupVerified, true, 'path probe ownership uncertain')
  assert.deepEqual(operation.finalInventory, [])
  assert.equal(operation.deadline, false)
  assert.equal(operation.failure, undefined)
  assert.equal(operation.completion?.code, 0, 'path probe incomplete')
  const layout = sqlitePathLayout(root), file = join(layout.folder, 'evidence.json'), info = await lstat(file)
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= SQLITE_PATH_EVIDENCE_BYTES)
  const evidence = validateSqlitePathEvidence(JSON.parse(await readFile(file, 'utf8')), operation.rootPid, layout.lengths)
  fixture = await realpath(fixture)
  for (const identity of [evidence.entry, evidence.native]) {
    const actual = await realpath(join(fixture, identity.path)); contained(fixture, actual)
    assert.equal(sha256(await readFile(actual)), identity.sha256, 'probe dependency bytes mismatch')
  }
  assert.equal(sha256(await readFile(script)), operation.probeSha256)
  operation.evidence = evidence
}

export async function runArm(root, executable, env, fixture, name, arm) {
  const folder = join(root, name); await mkdir(folder)
  const journals = join(folder, 'journals'), metadata = join(folder, 'metadata'), data = join(folder, 'data')
  for (const directory of [journals, metadata, data]) await mkdir(directory)
  arm.arm = name
  arm.args = historicalArgs(name)
  const reporter = join(folder, 'reporter.mjs'), startup = join(folder, 'startup.jsonl')
  await copyFile(new URL('./historical-runner-reporter.mjs', import.meta.url), reporter)
  arm.reporterSha256 = sha256(await readFile(reporter))
  await writeFile(startup, '', { flag: 'wx', mode: 0o600 })
  // Private instrumentation paths are not published in the original test args.
  const args = [...arm.args.slice(0, -1), '--test-reporter=spec', '--test-reporter-destination=stdout', `--test-reporter=${pathToFileURL(reporter).href}`, `--test-reporter-destination=${startup}`, arm.args.at(-1)]
  await executeOwned({ executable, args, cwd: join(fixture, dirname(HISTORICAL_TEST), '..'), env: { ...env, TMPDIR: data, TMP: data, TEMP: data, HISTORICAL_JOURNAL: journals, HISTORICAL_METADATA: metadata, HISTORICAL_SOURCE: fixture } }, arm, 60000)
  arm.status = arm.deadline ? 'deadline' : 'failed'
  try {
    const stat = await lstat(startup)
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= STARTUP_EVIDENCE_BYTES)
    arm.startupEvidence = parseStartupEvidence(await readFile(startup, 'utf8'))
    assert.equal(sha256(await readFile(reporter)), arm.reporterSha256)
    assert.equal(arm.startupEvidence.complete, true)
  } catch { arm.evidenceIncomplete = true; arm.startupEvidenceIncomplete = true }
  try {
    arm.journal = await readJournals(journals)
    const files = await readdir(metadata); assert.equal(files.length, 1)
    assert.equal(files[0], arm.journal[0].pid + '.json')
    const file = join(metadata, files[0]), stat = await lstat(file)
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 8192)
    const dependencies = validateDependencies(JSON.parse(await readFile(file, 'utf8')), arm.journal[0].pid)
    for (const item of [...dependencies.packages.map(entry => ({ path: entry.entry, sha256: entry.sha256 })), ...(dependencies.native ? [dependencies.native] : [])]) {
      const actual = await realpath(join(fixture, item.path)); contained(fixture, actual)
      assert.equal(sha256(await readFile(actual)), item.sha256, 'loaded dependency bytes mismatch')
    }
    arm.dependencies = dependencies
    if (!dependencies.available) arm.interpretationLimit = 'actual loaded identities unavailable; no historical attribution'
    if (!arm.deadline && arm.completion?.code === 0) {
      assertPassingArm(arm)
      assert.equal(dependencies.available, true, 'passing arm requires actual loaded identities')
      arm.status = 'passed'
    } else assert.ok(arm.deadline || arm.journal.some(row => row.phase === 'test' && row.state === 'error'), 'failure has no test result evidence')
  } catch { arm.evidenceIncomplete = true; arm.interpretationLimit = 'missing or invalid evidence; no historical attribution' }
  arm.finalInventory = await inventory(executable)
  assert.equal(arm.cleanupVerified, true, 'arm ownership uncertain')
  assert.deepEqual(arm.finalInventory, [])
}

function publicReceipt(receipt) {
  // Only explicitly constructed fields are published; private operation errors,
  // environment, credentials, console output and absolute paths never leave root.
  return JSON.parse(JSON.stringify(receipt, (key, value) => key === 'privateError' ? undefined : value))
}

async function checkpoint(output, receipt) {
  const journalBytes = [receipt.control, ...receipt.arms].flatMap(arm => arm.journal ?? []).reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row) + '\n'), 0)
  assert.ok(journalBytes <= 32768, 'total diagnostic journal byte bound')
  const text = JSON.stringify(publicReceipt(receipt), null, 2) + '\n'
  assert.ok(Buffer.byteLength(text) <= 128 * 1024, 'receipt byte bound')
  await writeFile(output + '.pending', text, { mode: 0o600 })
  await rename(output + '.pending', output)
}

export async function runHistoricalDiagnostic({ output, pnpm, controlOnly = false, sqlitePathsOnly = false, local = false }) {
  assert.ok(!(controlOnly && sqlitePathsOnly), 'diagnostic modes are mutually exclusive')
  assert.ok(isAbsolute(output), 'receipt output must be absolute')
  if (!local) { assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64'); assert.equal(process.version, 'v24.20.0') }
  else assert.notEqual(process.platform, 'win32', 'local calibration is POSIX only')
  assert.equal(process.env.UV_THREADPOOL_SIZE, undefined, 'historical threadpool must retain default 4')
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-historical-')))
  const executable = join(root, process.platform === 'win32' ? 'node.exe' : 'node')
  const receipt = { version: 1, supervisorPid: process.pid, classification: 'INCONCLUSIVE', scope: local ? 'LOCAL_POSIX_CALIBRATION_NOT_WINDOWS_ACCEPTANCE' : 'WINDOWS_HISTORICAL_DIAGNOSTIC', node: process.version, architecture: process.arch, threadpool: 'default:4', osDefaultTempVolume: process.platform === 'win32' ? resolve(root).slice(0, 2) : 'local', instrumentationPerturbsIOAndScheduling: true, control: {}, arms: [], rootRemoved: false, emergencyCleanup: false }
  if (sqlitePathsOnly) receipt.scope = local ? 'LOCAL_SQLITE_PATH_PROBE_NOT_HISTORICAL_TESTS' : 'WINDOWS_SQLITE_PATH_PROBE_NOT_HISTORICAL_TESTS'
  let safeToRemove = true
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
  try {
    await writeFile(join(root, 'empty-user.npmrc'), '')
    await writeFile(join(root, 'empty-global.npmrc'), '')
    await copyFile(process.execPath, executable); await chmod(executable, 0o700)
    receipt.nodeSha256 = sha256(await readFile(executable))
    receipt.supervisorCommit = await git(repository, ['rev-parse', 'HEAD'])
    receipt.supervisorOwnerSha256 = sha256(await readFile(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/src/owned-process.ts', import.meta.url)))
    receipt.supervisorWindowsOwnerSha256 = sha256(await readFile(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/src/owned-process-windows.ts', import.meta.url)))
    if (process.platform === 'win32') {
      const require = createRequire(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/src/owned-process.ts', import.meta.url))
      const entry = require.resolve('@deepseek-ai/dsh-win32-process')
      const version = createRequire(entry)('koffi').version
      assert.equal(version, '3.1.6', 'supervisor must load reviewed Koffi')
      receipt.supervisorKoffi = version
    }
    const env = buildHistoricalEnvironment(root)
    safeToRemove = false
    await journalControl(root, executable, env, receipt.control)
    await checkpoint(output, receipt)
    if (!controlOnly) {
      assert.ok(isAbsolute(pnpm), 'pnpm JavaScript entry must be absolute')
      const fixture = await installFixture(root, executable, env, pnpm, receipt)
      await checkpoint(output, receipt)
      if (sqlitePathsOnly) {
        receipt.pathProbe = {}
        await runSqlitePathProbe(root, executable, env, fixture, receipt.pathProbe)
        assert.equal(sha256(await readFile(join(fixture, HISTORICAL_TEST))), receipt.instrumentedTestSha256)
      } else {
        for (const name of ['default', 'none']) {
          if (interrupted) throw new Error('diagnostic interrupted')
          const arm = {}; receipt.arms.push(arm)
          await runArm(root, executable, env, fixture, name, arm)
          assert.equal(sha256(await readFile(join(fixture, HISTORICAL_TEST))), receipt.instrumentedTestSha256)
          await checkpoint(output, receipt)
        }
        if (receipt.arms.every(arm => arm.dependencies)) {
          const identities = receipt.arms.map(arm => ({ ...arm.dependencies, pid: 0 }))
          assert.deepEqual(identities[0], identities[1], 'historical dependency bytes differ between arms')
        }
        receipt.classification = classifyPair(receipt.arms)
        if (receipt.arms.some(arm => arm.status !== 'passed' || arm.evidenceIncomplete)) receipt.failed = true
      }
    }
    safeToRemove = true
  } catch (error) {
    receipt.failed = true
    receipt.failure = 'diagnostic incomplete; partial bounded evidence retained'
    console.error(`Historical diagnostic blocked: ${String(error.message).slice(0, 1024)}`)
  } finally {
    try {
      receipt.finalInventory = await inventory(executable)
      const operations = [receipt.control, ...(receipt.pnpmProbe ? [receipt.pnpmProbe] : []), ...(receipt.installs ?? []), ...(receipt.pathProbe ? [receipt.pathProbe] : []), ...receipt.arms]
      safeToRemove = safeToRemove || (operations.every(operation => operation.cleanupVerified === true) && receipt.finalInventory.length === 0)
      if (safeToRemove && receipt.finalInventory.length === 0) {
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        receipt.rootRemoved = await lstat(root).then(() => false, error => error.code === 'ENOENT')
      }
      if (!receipt.rootRemoved) { receipt.failed = true; receipt.classification = 'INCONCLUSIVE'; console.error(`Retained private diagnostic root: ${root}`) }
    } catch { receipt.failed = true; receipt.classification = 'INCONCLUSIVE'; receipt.failure = 'independent cleanup verification failed'; console.error(`Retained private diagnostic root: ${root}`) }
    if (interrupted) { receipt.failed = true; receipt.classification = 'INCONCLUSIVE'; receipt.interrupted = true }
    await checkpoint(output, receipt)
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt)
  }
  return receipt
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
  assert.ok(args.includes('--run') || args.includes('--control-only'), 'explicit diagnostic mode required')
  const receipt = await runHistoricalDiagnostic({ output: value('--output'), pnpm: value('--pnpm'), controlOnly: args.includes('--control-only'), sqlitePathsOnly: args.includes('--sqlite-paths-only'), local: args.includes('--local') })
  console.log(`${receipt.scope}: ${receipt.classification}; rootRemoved=${receipt.rootRemoved}`)
  if (receipt.failed) process.exitCode = 1
}
