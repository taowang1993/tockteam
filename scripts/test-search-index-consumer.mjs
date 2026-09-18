import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { stopChildProcess } from './process-cleanup.mjs'

// Verification only: fresh installed packages, real model/tools, no user profile changes.
assert.equal(process.platform, 'darwin', 'This consumer cleanup proof currently requires macOS')
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(repo, '.stage/dsh-runtime/lib/bin.js')
const pin = JSON.parse(await readFile(join(repo, 'dsh-source.json'), 'utf8')).version
const interruptControl = process.argv[3] === '--interrupt-control'
if (!interruptControl) assert.equal(JSON.parse(await readFile(join(repo, '.stage/dsh-runtime/package.json'), 'utf8')).version, pin)
const credentials = join(process.env.DSH_HOME || join(process.env.HOME, '.dsh'), '.env')
const credentialStat = await lstat(credentials)
assert.ok(credentialStat.isFile() && credentialStat.uid === process.getuid() && (credentialStat.mode & 0o077) === 0, 'Credential file must be owner-only')
const root = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-index-consumer-')))
const home = join(root, 'home'), vault = join(root, 'vault'), packs = join(root, 'packs')
const resultsFile = join(root, 'tool-results.jsonl'), patch = join(root, 'patch.yml')
const output = process.argv[2] && resolve(process.argv[2])
const env = { ...process.env, DSH_HOME: home, DSH_TOOLS_MODE: 'native', DSH_TELEMETRY_DISABLED: '1' }
delete env.NODE_OPTIONS
const receipt = { version: 1, accepted: false, platform: process.platform, arch: process.arch, dsh: pin, roots: [], children: [], packages: {}, modules: {}, calls: [], emergencyCleanup: false }
let bodyPassed = false, cleanupVerified = false, interrupted = false, rejectActive
const interrupt = () => {
  interrupted = true
  receipt.accepted = false
  process.exitCode = 1
  receipt.failure ??= 'Consumer interrupted'
  rejectActive?.(new Error('Consumer interrupted'))
}
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
const deadline = performance.now() + 300000
const execute = promisify(execFile)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function inventory() {
  const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,pgid=,args='], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 })
  return stdout.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/u)
    return match && match[3].includes(root) ? [{ pid: Number(match[1]), group: Number(match[2]) }] : []
  })
}
async function run(label, command, args, cwd = repo, timeout = 120000) {
  assert.equal(interrupted, false, 'Consumer interrupted before launch')
  timeout = Math.min(timeout, deadline - performance.now())
  assert.ok(timeout > 0, 'Consumer exceeded its total execution budget')
  const outcome = Promise.withResolvers()
  rejectActive = outcome.reject
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.once('error', outcome.reject); child.once('close', outcome.resolve)
  if (child.pid) {
    receipt.roots.push({ label, pid: child.pid })
    console.log(JSON.stringify({ phase: label, pid: child.pid, fixture: root }))
  }
  let bytes = 0, exceeded = false, timedOut = false
  const stdout = [], stderr = []
  for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on('data', chunk => {
    bytes += chunk.length
    if (bytes <= 4 * 1024 * 1024) chunks.push(chunk)
    else { exceeded = true; outcome.reject(new Error(`${label} exceeded its output bound`)) }
  })
  const timer = setTimeout(() => { timedOut = true; outcome.reject(new Error(`${label} timed out`)) }, timeout)
  try {
    const code = await outcome.promise
    await writeFile(join(root, label + '.stdout'), Buffer.concat(stdout), { mode: 0o600 })
    await writeFile(join(root, label + '.stderr'), Buffer.concat(stderr), { mode: 0o600 })
    assert.ok(!exceeded && !timedOut, `${label} exceeded its output/time bound`)
    assert.equal(code, 0, `${label} failed; private logs: ${root}`)
    return Buffer.concat(stdout).toString('utf8')
  } finally { clearTimeout(timer); rejectActive = undefined; await stopChildProcess(child) }
}
try {
  for (const dir of [home, vault, packs]) await mkdir(dir, { mode: 0o700 })
  await copyFile(credentials, join(home, '.env')); await chmod(join(home, '.env'), 0o600)
  // Signal regression uses a harmless child, never package builds, installs, or the model.
  if (interruptControl) {
    await run('interrupt-control', process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    throw new Error('Interruption control unexpectedly completed')
  }
  const canary = randomBytes(16).toString('hex'), tag = 'indexproof' + randomBytes(8).toString('hex')
  await writeFile(join(vault, 'Result.md'), `# Result\n#${tag}\nReceipt: ${canary}\n`)
  await writeFile(join(vault, 'FalsePositive.md'), `${tag} is plain text, not a tag.\n`)
  await writeFile(join(vault, 'Other.md'), 'unrelated\n')
  for (const name of ['tockbot-note-vault', 'tockbot-note-runtime', 'tockteam-note-vault-tools']) {
    await run('pack-' + name, 'pnpm', ['pack', '--pack-destination', packs], join(repo, 'plugins/tocktutor/packages', name))
  }
  const archives = await readdir(packs)
  assert.equal(archives.length, 3)
  for (const file of archives) receipt.packages[file] = hash(await readFile(join(packs, file)))
  await run('install', process.execPath, [cli, 'plugin', '--profile', 'headless', 'add', '--allow-build=sqlite3', ...archives.map(file => join(packs, file))], vault)
  const require = createRequire(join(home, 'profiles/headless/package.json'))
  const installed = dirname(require.resolve('tockbot-note-runtime/package.json'))
  assert.ok((await realpath(installed)).startsWith(root + '/'), 'Runtime must resolve inside the fresh profile')
  for (const file of (await readdir(join(repo, 'plugins/tocktutor/packages/tockbot-note-runtime/lib'))).filter(file => file.endsWith('.js'))) {
    const expected = hash(await readFile(join(repo, 'plugins/tocktutor/packages/tockbot-note-runtime/lib', file)))
    assert.equal(hash(await readFile(join(installed, 'lib', file))), expected, file)
    receipt.modules[file] = expected
  }
  assert.ok(receipt.modules['search-index-child.js'] && receipt.modules['search-index-ownership.js'])
  const audit = join(root, 'audit.mjs')
  await writeFile(audit, `
import { appendFileSync } from 'node:fs'
export const inject = ['tools', 'noteVault']
export async function apply(ctx) {
  await ctx.noteVault.searchIndexReplacement
  const index = ctx.noteVault.searchIndex?.index
  if (!index) throw new Error('No isolated index generation')
  let timer
  try { await Promise.race([index.whenReady, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fixture index readiness timed out')), 15000) })]) }
  finally { clearTimeout(timer) }
  ctx.on('tools/result', (exec, result) => {
    appendFileSync(${JSON.stringify(resultsFile)}, JSON.stringify({ name: exec.name, hostPid: process.pid, childPid: ctx.noteVault.searchIndex?.index.pid, result }) + '\\n')
  })
  ctx.provide('indexConsumerReady', true)
}
`)
  await writeFile(patch, `- id: headless-runner\n  inject: [headlessStartup, indexConsumerReady]\n- id: tockbot-note-vault\n  disabled: true\n- id: note-vault-runtime\n  config:\n    stateRoot: ${JSON.stringify(join(root, 'state'))}\n    vaultRoot: ${JSON.stringify(vault)}\n- insert:\n    - id: index-consumer-proof\n      name: ${JSON.stringify(audit)}\n`)
  const composition = await run('composition', process.execPath, [cli, '--profile', 'headless', '--patch', patch, '--dump-config'], vault)
  assert.ok(composition.includes('note-vault-runtime') && composition.includes('index-consumer-proof'))
  // Repeat once in a fresh Host against the same v3 cache to cover persistent reopen.
  for (let attempt = 0; attempt < 2; attempt++) {
    await writeFile(resultsFile, '')
    const answer = await run('agent-' + attempt, process.execPath, [cli, '--profile', 'headless', '--patch', patch,
      `Use only vault_search (mode query, query tag:${tag}) and vault_read to find the Receipt value from the matching note. Do not use shell or filesystem tools. Return the exact Receipt value.`], vault)
    const calls = (await readFile(resultsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    assert.ok(answer.includes(canary), 'Model must return the undisclosed fixture receipt')
    assert.ok(calls.every(call => ['vault_search', 'vault_read'].includes(call.name) && !call.result.isError))
    assert.ok(calls.some(call => call.name === 'vault_search' && call.result.value?.scan?.entries === 2 && call.result.value?.matches?.length === 1 && call.result.value.matches[0].path === 'Result.md'), 'Require indexed narrowing and exact false-positive filtering')
    assert.ok(calls.some(call => call.name === 'vault_read' && call.result.value?.content?.includes(canary)), 'Require a successful validated read')
    const pids = [...new Set(calls.map(call => call.childPid))]
    assert.equal(pids.length, 1); assert.ok(Number.isSafeInteger(pids[0]) && pids[0] > 0 && pids[0] !== calls[0].hostPid)
    receipt.children.push(pids[0])
    // EOF starts exit, but disappearance of the actual child/group is the proof.
    for (let check = 0; check < 50; check++) {
      try { process.kill(-pids[0], 0) } catch (error) { if (error.code === 'ESRCH') break; throw error }
      await delay(100)
    }
    assert.throws(() => process.kill(pids[0], 0), { code: 'ESRCH' })
    assert.throws(() => process.kill(-pids[0], 0), { code: 'ESRCH' })
    receipt.calls.push({ attempt, hostPid: calls[0].hostPid, childPid: pids[0], tools: calls.map(call => call.name), indexed: true, exactReceipt: true, stopped: true })
  }
  await run('uninstall', process.execPath, [cli, 'plugin', '--profile', 'headless', 'remove', 'tockbot-note-runtime', 'tockbot-note-vault', '@tockteam/note-vault-tools'], vault)
  assert.deepEqual(await inventory(), [], 'No process may retain the isolated profile')
  bodyPassed = true
} catch (error) {
  receipt.failure ??= error instanceof assert.AssertionError ? error.message : 'Consumer verification failed; inspect private logs'
  throw error
} finally {
  try {
    const survivors = await inventory()
    if (survivors.length) receipt.emergencyCleanup = true
    for (const { pid, group } of survivors) {
      try { process.kill(pid === group ? -pid : pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    for (let check = 0; check < 50 && (await inventory()).length; check++) await delay(100)
    assert.deepEqual(await inventory(), [], 'Full isolated process tree must be stopped')
    assert.equal(receipt.emergencyCleanup, false, 'Emergency cleanup is not successful normal disposal')
    cleanupVerified = true
  } finally {
    await rm(home, { recursive: true, force: true })
    receipt.credentialCopyRemoved = true
    if (bodyPassed && cleanupVerified) { await rm(root, { recursive: true, force: true }); receipt.fixtureRemoved = true }
    // Commit only after cleanup; signals cannot interleave this final synchronous publication.
    receipt.accepted = bodyPassed && cleanupVerified && !interrupted
    if (output) writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ accepted: receipt.accepted && !receipt.emergencyCleanup, roots: receipt.roots, children: receipt.children, credentialCopyRemoved: true, fixtureRemoved: receipt.fixtureRemoved === true }))
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt)
  }
}
