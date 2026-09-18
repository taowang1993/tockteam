import assert from 'node:assert/strict'
import { spawn, execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { stopChildProcess } from './process-cleanup.mjs'
import { verifyWindowsWorkflows } from './owned-process-windows-workflow.mjs'

const execFile = promisify(execFileCallback)
const script = fileURLToPath(import.meta.url)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function bounded(promise, milliseconds, label) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds) })]) }
  finally { clearTimeout(timer) }
}
async function waitFile(file) {
  const deadline = performance.now() + 5000
  while (performance.now() < deadline) {
    try { return await readFile(file, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
    await delay(20)
  }
  throw new Error(`Fixture did not become ready: ${file}`)
}
async function writeExclusive(file, value) { await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }) }

export async function writeWindowsWorkerCheckpoint(root, receipt) {
  const serialized = JSON.stringify(receipt, null, 2) + '\n'
  assert.ok(Buffer.byteLength(serialized) <= 64 * 1024, 'worker receipt exceeds its bound')
  const file = join(root, 'worker-proof.json'), pending = file + '.pending'
  await writeFile(pending, serialized, { flag: 'wx' })
  try { await rename(pending, file) } finally { await rm(pending, { force: true }) }
}

export function createWindowsNativeLedger(nativeApi, maxEntries = 128) {
  assert.ok(Number.isSafeInteger(maxEntries) && maxEntries > 0, 'native ledger bound must be positive')
  const entries = [], addressMappings = [], buffers = new Map(), wrappers = new Map()
  const ledger = { maxEntries, entries, addressMappings, truncated: false, dropped: 0 }
  const pointer = value => value === null || value === undefined ? value : String(value)
  const markDropped = () => { ledger.truncated = true; ledger.dropped += 1 }
  const record = (operation, fields = {}) => {
    if (entries.length < maxEntries) entries.push({ operation, ...fields })
    else markDropped()
  }
  const rememberAddress = (value, buffer) => {
    if (!Buffer.isBuffer(buffer)) return
    if (!buffers.has(value) && buffers.size >= maxEntries) { markDropped(); return }
    buffers.set(value, buffer)
    if (addressMappings.length < maxEntries) addressMappings.push({ pointer: pointer(value), bytes: buffer.byteLength })
    else markDropped()
  }
  const readPointer = (value, offset = 0) => {
    const buffer = buffers.get(value)
    return buffer && buffer.byteLength >= offset + 8 ? pointer(buffer.readBigUInt64LE(offset)) : undefined
  }
  let proxy
  proxy = new Proxy(nativeApi, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      if (wrappers.has(property)) return wrappers.get(property)
      const operation = String(property)
      const wrapped = function (...args) {
        const result = Reflect.apply(value, this === proxy ? target : this, args)
        if (operation === 'address') {
          rememberAddress(result, args[0])
          record(operation, { pointer: pointer(result), bytes: Buffer.isBuffer(args[0]) ? args[0].byteLength : undefined })
        } else if (operation === 'createJobObjectW' || operation === 'createIoCompletionPort') {
          record(operation, { result: pointer(result), handle: pointer(result), acquired: Boolean(result) })
        } else if (operation === 'createPipe') {
          record(operation, {
            read: pointer(args[0]), write: pointer(args[1]), result, acquired: Boolean(result),
            readHandle: readPointer(args[0]), writeHandle: readPointer(args[1]),
          })
        } else if (operation === 'initializeProcThreadAttributeList') {
          record(operation, { list: pointer(args[0]), count: args[1], flags: args[2], size: pointer(args[3]), result })
        } else if (operation === 'updateProcThreadAttribute') {
          record(operation, { list: pointer(args[0]), attribute: args[2], value: pointer(args[3]), size: args[4], result })
        } else if (operation === 'deleteProcThreadAttributeList') {
          record(operation, { list: pointer(args[0]) })
        } else if (operation === 'createProcessW') {
          const information = readPointer(args[9])
          record(operation, {
            application: args[0], command: pointer(args[1]), processAttributes: pointer(args[2]), threadAttributes: pointer(args[3]),
            inherit: args[4], flags: args[5], environment: pointer(args[6]), cwd: args[7], startup: pointer(args[8]), information: pointer(args[9]), result, succeeded: Boolean(result),
            processHandle: information === undefined ? undefined : readPointer(args[9], 0),
            threadHandle: information === undefined ? undefined : readPointer(args[9], 8),
            pid: buffers.get(args[9])?.byteLength >= 20 ? buffers.get(args[9]).readUInt32LE(16) : undefined,
          })
        } else if (operation === 'getLastError') {
          record(operation, { result })
        } else if (operation === 'closeHandle') {
          record(operation, { handle: pointer(args[0]), result })
        } else if (operation === 'setInformationJobObject') {
          record(operation, { handle: pointer(args[0]), class: args[1], length: args[3], result, ...(args[1] === 7 ? { completionKey: pointer(args[2].readBigUInt64LE()), completionPort: pointer(args[2].readBigUInt64LE(8)) } : {}) })
        } else if (operation === 'setHandleInformation') {
          record(operation, { handle: pointer(args[0]), mask: args[1], flags: args[2], result })
        }
        return result
      }
      wrappers.set(property, wrapped)
      return wrapped
    },
  })
  return { api: proxy, ledger }
}

export function assertWindowsFailureLedger(ledger) {
  assert.equal(ledger.truncated, false); assert.equal(ledger.dropped, 0)
  const entries = ledger.entries
  const jobs = entries.filter(entry => entry.operation === 'createJobObjectW')
  const ports = entries.filter(entry => entry.operation === 'createIoCompletionPort')
  const pipes = entries.filter(entry => entry.operation === 'createPipe')
  assert.equal(jobs.length, 1); assert.equal(ports.length, 1); assert.equal(pipes.length, 3)
  assert.ok(jobs[0].acquired); assert.ok(ports[0].acquired); assert.ok(pipes.every(entry => entry.result === 1))
  const associations = entries.filter(entry => entry.operation === 'setInformationJobObject' && entry.class === 7)
  assert.equal(associations.length, 1); assert.equal(associations[0].result, 1)
  assert.equal(associations[0].handle, jobs[0].handle)
  assert.equal(associations[0].completionKey, jobs[0].handle); assert.equal(associations[0].completionPort, ports[0].handle)
  assert.ok(entries.indexOf(associations[0]) < entries.findIndex(entry => entry.operation === 'createProcessW'))
  const acquired = [jobs[0].handle, ports[0].handle, ...pipes.flatMap(entry => [entry.readHandle, entry.writeHandle])]
  assert.ok(acquired.every(handle => typeof handle === 'string' && BigInt(handle) > 0n))
  assert.equal(new Set(acquired).size, 8)
  const closed = entries.filter(entry => entry.operation === 'closeHandle')
  assert.equal(closed.length, 8); assert.ok(closed.every(entry => entry.result === 1))
  assert.deepEqual(closed.map(entry => entry.handle).sort(), acquired.sort())
  const creates = entries.filter(entry => entry.operation === 'createProcessW')
  assert.equal(creates.length, 1)
  assert.equal(creates[0].result, 0); assert.equal(creates[0].processHandle, '0'); assert.equal(creates[0].threadHandle, '0'); assert.equal(creates[0].pid, 0)
  const lastError = entries[entries.indexOf(creates[0]) + 1]
  assert.equal(lastError?.operation, 'getLastError'); assert.equal(lastError.result, 2)
  assert.equal(entries.filter(entry => entry.operation === 'deleteProcThreadAttributeList').length, 1)
}

// Independent raw-API fixture: it never invokes the owner under test. Retain
// Windows' cold first-use growth rather than attributing it to owned handles.
export function calibrateWindowsCreation(bindings, encoded, options, handleCount, receipt) {
  const { api, ledger } = createWindowsNativeLedger(bindings)
  receipt.ledger = ledger; receipt.counts = {}; receipt.failures = []; receipt.passed = false
  const handles = [], held = [encoded.commandLine, encoded.environment]
  const allocate = size => { const buffer = Buffer.alloc(size); held.push(buffer); return buffer }
  const check = (ok, operation) => { if (!ok) throw new Error(`${operation} failed (Win32 ${api.getLastError()})`) }
  let attributes, failure
  const retain = error => { failure ??= error; receipt.failures.push(String(error.message).slice(0, 1024)) }
  try {
    receipt.counts.before = handleCount()
    const job = api.createJobObjectW(null, null)
    check(job, 'Calibration Job'); handles.push(job)
    const limits = allocate(144); limits.writeUInt32LE(0x2000, 16)
    check(api.setInformationJobObject(job, 9, limits, 144), 'Calibration Job limits')
    const port = api.createIoCompletionPort(0xffffffffffffffffn, null, 0n, 1)
    check(port, 'Calibration completion port'); handles.push(port)
    const association = allocate(16); association.writeBigUInt64LE(job); association.writeBigUInt64LE(port, 8)
    check(api.setInformationJobObject(job, 7, association, 16), 'Calibration port association')
    const pipes = []
    for (let index = 0; index < 3; index++) {
      const read = allocate(8), write = allocate(8)
      const ok = api.createPipe(api.address(read), api.address(write), null, 0)
      const pair = [read.readBigUInt64LE(), write.readBigUInt64LE()]
      handles.push(...pair.filter(Boolean)); pipes.push(pair)
      check(ok, 'Calibration pipe'); assert.ok(pair.every(Boolean))
    }
    const inherited = [pipes[0][0], pipes[1][1], pipes[2][1]]
    for (const handle of inherited) check(api.setHandleInformation(handle, 1, 1), 'Calibration inheritance')
    const size = allocate(8)
    assert.equal(api.initializeProcThreadAttributeList(null, 2, 0, api.address(size)), 0)
    assert.equal(api.getLastError(), 122)
    const bytes = Number(size.readBigUInt64LE()); assert.ok(bytes > 0 && bytes <= 1024 * 1024)
    const storage = allocate(bytes)
    check(api.initializeProcThreadAttributeList(api.address(storage), 2, 0, api.address(size)), 'Calibration attributes')
    attributes = api.address(storage)
    const jobList = allocate(8); jobList.writeBigUInt64LE(job)
    const handleList = allocate(24); inherited.forEach((handle, index) => handleList.writeBigUInt64LE(handle, index * 8))
    check(api.updateProcThreadAttribute(attributes, 0, 0x2000d, api.address(jobList), 8, null, null), 'Calibration Job list')
    check(api.updateProcThreadAttribute(attributes, 0, 0x20002, api.address(handleList), 24, null, null), 'Calibration handle list')
    const startup = allocate(112), information = allocate(24)
    startup.writeUInt32LE(112); startup.writeUInt32LE(0x100, 60); startup.writeBigUInt64LE(attributes, 104)
    inherited.forEach((handle, index) => startup.writeBigUInt64LE(handle, 80 + index * 8))
    receipt.counts.beforeCreate = handleCount()
    const created = api.createProcessW(options.executable, api.address(encoded.commandLine), null, null, 1, 0x08080400, api.address(encoded.environment), options.cwd, api.address(startup), api.address(information))
    receipt.createError = created ? null : api.getLastError()
    for (const offset of [0, 8]) { const handle = information.readBigUInt64LE(offset); if (handle) handles.push(handle) }
    if (created) { check(api.terminateJobObject(job, 1), 'Unexpected calibration process termination'); assert.equal(api.waitForSingleObject(information.readBigUInt64LE(), 5000), 0) }
    receipt.counts.afterCreate = handleCount()
    assert.equal(created, 0); assert.equal(receipt.createError, 2)
    assert.equal(information.readBigUInt64LE(0), 0n); assert.equal(information.readBigUInt64LE(8), 0n); assert.equal(information.readUInt32LE(16), 0)
  } catch (error) { retain(error) } finally {
    if (attributes) { try { api.deleteProcThreadAttributeList(attributes) } catch (error) { retain(error) } }
    for (const handle of handles.reverse()) { try { check(api.closeHandle(handle), 'Calibration close') } catch (error) { retain(error) } }
    for (const buffer of held) buffer.fill(0)
    try { receipt.counts.afterCleanup = handleCount() } catch (error) { retain(error) }
  }
  try { assertWindowsFailureLedger(ledger) } catch (error) { retain(error) }
  if (failure) throw failure
  receipt.passed = true
}

export async function verifyWindowsLeakSensitivity(invoke, bindings, handleCount, receipt) {
  const actual = createWindowsNativeLedger(bindings)
  receipt.ledger = actual.ledger; receipt.counts = {}; receipt.passed = false; receipt.failures = []
  let withheld, failure
  const retain = error => { failure ??= error; receipt.failures.push(String(error.message).slice(0, 1024)) }
  const suppress = handle => {
    if (withheld === undefined) { withheld = handle; receipt.suppressedHandle = String(handle); return 1 }
    return actual.api.closeHandle(handle)
  }
  const fault = new Proxy(actual.api, { get(target, key) {
    if (key === 'closeHandle') return suppress
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value
  } })
  try {
    receipt.counts.before = handleCount()
    await assert.rejects(bounded(invoke(fault), 5000, 'leak sensitivity'), /CreateProcessW failed/)
    receipt.counts.withheld = handleCount()
    receipt.actualClosesBeforeCleanup = actual.ledger.entries.filter(entry => entry.operation === 'closeHandle').map(entry => ({ handle: entry.handle, result: entry.result }))
    assert.equal(receipt.actualClosesBeforeCleanup.length, 7)
    assert.ok(receipt.actualClosesBeforeCleanup.every(entry => entry.result === 1))
    assert.equal(receipt.counts.withheld, receipt.counts.before + 1)
    assert.throws(() => assert.equal(receipt.counts.withheld, receipt.counts.before, 'failed creation must not leak Host handles'), error => {
      receipt.expectedEqualityFailure = error.message; return error.code === 'ERR_ASSERTION'
    })
  } catch (error) { retain(error) } finally {
    if (withheld !== undefined) {
      try { receipt.releaseResult = actual.api.closeHandle(withheld); assert.equal(receipt.releaseResult, 1) } catch (error) { retain(error) }
    }
    try { receipt.counts.afterRecovery = handleCount(); assert.equal(receipt.counts.afterRecovery, receipt.counts.before) } catch (error) { retain(error) }
  }
  try { assertWindowsFailureLedger(actual.ledger) } catch (error) { retain(error) }
  if (failure) throw failure
  receipt.passed = true
}

export async function sampleWindowsHandleCounts(handleCount, invoke) {
  const samples = []
  const sample = phase => { samples.push({ phase, count: handleCount() }) }
  let firstMismatch
  const retain = error => { firstMismatch ??= error instanceof Error ? error : new Error(String(error)) }
  let promise, samplingFailure
  try {
    sample('before')
    promise = invoke()
    sample('after-returned')
    try { await assert.rejects(bounded(promise, 5000, 'failed creation'), /CreateProcessW failed/) } catch (error) { retain(error) }
    sample('after-rejected')
    const handlesBefore = samples[0].count, handlesAfter = samples[2].count
    try { assert.equal(handlesAfter, handlesBefore, 'failed creation must not leak Host handles') } catch (error) { retain(error) }
    await Promise.resolve()
    sample('after-microtask')
    await new Promise(resolve => setImmediate(resolve))
    sample('after-immediate')
  } catch (error) {
    samplingFailure = error
    retain(error)
    // A failed immediate probe must not leave the already-returned rejection unobserved.
    void promise?.catch(() => {})
  }
  return { samples, firstMismatch, samplingFailure }
}

async function loadInstalled(installation) {
  const require = createRequire(join(installation, 'package.json'))
  const packageFile = require.resolve('tockbot-note-runtime/package.json')
  assert.ok(!relative(installation, packageFile).startsWith('..') && !isAbsolute(relative(installation, packageFile)), 'owner must resolve within the fresh installation')
  const publicFile = require.resolve('tockbot-note-runtime/owned-process')
  assert.ok(!relative(installation, publicFile).startsWith('..') && !isAbsolute(relative(installation, publicFile)))
  const owner = await import(pathToFileURL(publicFile).href)
  const publicModuleSha256 = createHash('sha256').update(await readFile(publicFile)).digest('hex')
  const moduleFile = join(dirname(packageFile), 'lib/owned-process-windows.js')
  const module = await import(pathToFileURL(moduleFile).href)
  const api = await module.loadWindowsOwnedBindings()
  const entry = createRequire(moduleFile).resolve('@deepseek-ai/dsh-win32-process')
  assert.ok(!relative(installation, entry).startsWith('..') && !isAbsolute(relative(installation, entry)), 'native package must resolve within the fresh installation')
  const koffiVersion = createRequire(entry)('koffi').version
  assert.equal(koffiVersion, '3.1.6', 'fresh fixture must use its reviewed Koffi version')
  const publicApi = await import(pathToFileURL(entry).href)
  const probe = publicApi.extendWin32ProcessBindings(({ bind, kernel32 }) => ({
    openProcess: bind(kernel32, 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']),
    isProcessInJob: bind(kernel32, 'IsProcessInJob', 'int', ['void *', 'void *', 'void *']),
    getHandleInformation: bind(kernel32, 'GetHandleInformation', 'int', ['void *', 'void *']),
    getCurrentProcess: bind(kernel32, 'GetCurrentProcess', 'void *', []),
    getProcessHandleCount: bind(kernel32, 'GetProcessHandleCount', 'int', ['void *', 'void *']),
    terminateProcess: bind(kernel32, 'TerminateProcess', 'int', ['void *', 'uint32']),
  }))
  return { module, owner, publicModuleSha256, api, probe, koffiVersion, moduleSha256: createHash('sha256').update(await readFile(moduleFile)).digest('hex') }
}

const diagnosticModes = new Set(['control', 'missing-executable'])
const nativeIndexArms = new Set(['index', 'index-recovery'])

async function runWindowsCreateDiagnostic({ module, api, probe, moduleSha256, root, invocation, arm }) {
  assert.ok(diagnosticModes.has(arm), `unknown Windows diagnostic arm: ${arm}`)
  const receipt = {
    passed: false, moduleSha256, arm, completed: false, installedResolution: true,
    ownerCalls: 0, samples: [], counts: null, ledger: arm === 'control' ? null : undefined,
    phase: 'diagnostic', failure: null, firstMismatch: null,
  }
  const checkpoint = async phase => { receipt.phase = phase; await writeWindowsWorkerCheckpoint(root, receipt) }
  let firstFailure
  const retain = error => {
    const failure = error instanceof Error ? error : new Error(String(error))
    if (!firstFailure) { firstFailure = failure; receipt.failure = String(failure.message).slice(0, 8192) }
  }
  try {
    // Checkpoints are deliberately outside the count-sampling interval.
    await checkpoint('diagnostic-start')
    let ownerApi = api, ledger
    if (arm === 'missing-executable') {
      ({ api: ownerApi, ledger } = createWindowsNativeLedger(api))
      receipt.ledger = ledger
    }
    const addressApi = arm === 'missing-executable' ? ownerApi : api
    const handleCount = () => {
      const count = Buffer.alloc(4)
      assert.equal(probe.getProcessHandleCount(probe.getCurrentProcess(), addressApi.address(count)), 1)
      return count.readUInt32LE()
    }
    const sampled = await sampleWindowsHandleCounts(handleCount, () => {
      if (arm === 'control') return Promise.reject(new Error('CreateProcessW failed (Win32 2)'))
      receipt.ownerCalls += 1
      return module.spawnWindowsOwnedProcess({ ...invocation([]), executable: join(root, 'missing-owned-process.exe') }, ownerApi)
    })
    receipt.samples = sampled.samples
    receipt.counts = Object.fromEntries(sampled.samples.map(sample => [sample.phase, sample.count]))
    if (sampled.samplingFailure) receipt.samplingFailure = String(sampled.samplingFailure.message).slice(0, 8192)
    if (sampled.firstMismatch) {
      receipt.firstMismatch = String(sampled.firstMismatch.message).slice(0, 8192)
      retain(sampled.firstMismatch)
    }
    try { assert.equal(receipt.ownerCalls, arm === 'control' ? 0 : 1, 'diagnostic owner call count mismatch') } catch (error) { retain(error) }
    if (arm === 'missing-executable') {
      for (const operation of ['createJobObjectW', 'createPipe', 'initializeProcThreadAttributeList', 'updateProcThreadAttribute', 'deleteProcThreadAttributeList', 'createProcessW', 'getLastError', 'closeHandle']) {
        try { assert.ok(ledger.entries.some(entry => entry.operation === operation), `native ledger missing ${operation}`) } catch (error) { retain(error) }
      }
      try { assert.equal(ledger.entries.filter(entry => entry.operation === 'createPipe').length, 3, 'failed creation must create three pipes') } catch (error) { retain(error) }
      try { assert.equal(ledger.entries.find(entry => entry.operation === 'createProcessW')?.result, 0, 'CreateProcessW must fail in the missing arm') } catch (error) { retain(error) }
      try { assert.equal(ledger.truncated, false, 'native ledger was truncated') } catch (error) { retain(error) }
    }
    receipt.completed = sampled.samples.length === 5 && (arm === 'control' || ledger?.truncated === false)
    receipt.passed = !firstFailure
  } catch (error) {
    retain(error)
  } finally {
    receipt.phase = 'complete'
    await checkpoint('complete')
  }
  if (firstFailure) throw firstFailure
}

async function worker(installation, root, hostDeath = false, arm) {
  const { module, owner, publicModuleSha256, api, probe, koffiVersion, moduleSha256 } = await loadInstalled(installation)
  const environment = { SystemRoot: process.env.SystemRoot, PATH: dirname(process.execPath), OWNER_VALUE: '中文 value' }
  const invocation = (args, controller = new AbortController(), maxOutputBytes = 65536) => ({ executable: process.execPath, args, cwd: root, env: environment, signal: controller.signal, maxOutputBytes })
  const observe = (pid, access = 0x00101000) => {
    const handle = probe.openProcess(access, 0, pid)
    assert.ok(handle, `could not retain process identity for ${pid}`)
    return handle
  }
  const checkExited = async handle => {
    const deadline = performance.now() + 5000
    while (performance.now() < deadline) { const value = api.waitForSingleObject(handle, 0); if (value === 0) return; assert.equal(value, 258); await delay(20) }
    throw new Error('Retained process handle is still live')
  }
  const release = handle => assert.equal(api.closeHandle(handle), 1, 'observer handle release failed')
  if (hostDeath) {
    const ready = join(root, 'death-child.pid')
    await owner.spawnOwnedProcess(invocation(['-e', `require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000)`]))
    await waitFile(ready)
    await writeExclusive(join(root, 'death-host.ready'), String(process.pid))
    await waitFile(join(root, 'death-host.exit'))
    process.exit(0) // Deliberately abrupt: kernel kill-on-last-Job-close is the behavior under test.
  }
  await waitFile(join(root, 'gate.start'))
  if (nativeIndexArms.has(arm)) {
    const proof = await import('./search-index-native-proof.mjs')
    const receipt = arm === 'index'
      ? { passed: false, moduleSha256, publicModuleSha256, koffiVersion, installedResolution: true, cases: [], phase: 'index', failure: null }
      : { passed: false, moduleSha256, publicModuleSha256, koffiVersion, installedResolution: true, clockCases: [], recovery: { passed: false }, phase: 'index-recovery', failure: null }
    const verify = arm === 'index' ? proof.verifyInstalledSearchIndex : proof.verifyInstalledSearchIndexRecovery
    if (arm === 'index-recovery') await writeWindowsWorkerCheckpoint(root, receipt)
    await verify({ installation, root, receipt,
      checkpoint: () => writeWindowsWorkerCheckpoint(root, receipt), observe, release, api, probe,
      assertStopped: handle => assert.equal(api.waitForSingleObject(handle, 0), 0, 'index handle must already be signaled when close returns'),
    })
    return
  }
  if (arm !== undefined) {
    await runWindowsCreateDiagnostic({ module, api, probe, moduleSha256, root, invocation, arm })
    return
  }
  const cases = []
  const receipt = { passed: false, moduleSha256, publicModuleSha256, koffiVersion, installedResolution: true, cases, phase: 'calibration', failure: null, calibration: {}, failedCreation: {}, sensitivity: {} }
  const checkpoint = async phase => { receipt.phase = phase; await writeWindowsWorkerCheckpoint(root, receipt) }
  const handleCount = () => { const count = Buffer.alloc(4); assert.equal(probe.getProcessHandleCount(probe.getCurrentProcess(), api.address(count)), 1); return count.readUInt32LE() }
  const missing = { ...invocation([]), executable: join(root, 'nonexistent.exe') }
  await checkpoint('calibration')
  try {
  calibrateWindowsCreation(api, module.encodeWindowsInvocation(missing), missing, handleCount, receipt.calibration)
  await checkpoint('arguments')
  const argvFile = join(root, 'argv proof.cjs'), argvResult = join(root, 'argv.json')
  await writeExclusive(argvFile, `process.stdin.once('end',()=>{require('node:fs').writeFileSync(${JSON.stringify(argvResult)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),value:process.env.OWNER_VALUE,leak:process.env.OWNER_SHOULD_NOT_INHERIT??null,eof:true}));process.stdout.write('hello');process.stderr.write('error')});process.stdin.resume()`)
  process.env.OWNER_SHOULD_NOT_INHERIT = 'must not reach child'
  const args = ['', 'a"b', 'trailing space\\', '中文']
  const argvOwner = await owner.spawnOwnedProcess(invocation([argvFile, ...args]))
  try {
    assert.deepEqual(await bounded(argvOwner.completion, 10000, 'argv'), { code: 0, signal: null, stdoutBytes: 5, stderrBytes: 5 })
    assert.deepEqual(JSON.parse(await readFile(argvResult, 'utf8')), { args, cwd: root, value: '中文 value', leak: null, eof: true })
  } finally { await argvOwner.terminate() }
  cases.push({ name: 'Unicode Arguments, Explicit Environment, Stdin EOF, Output Counts', passed: true, rootPid: argvOwner.pid })

  for (const mode of ['normal-exit', 'cancel', 'overflow']) {
    await checkpoint(mode)
    const folder = join(root, mode); await mkdir(folder)
    const descendantFile = join(folder, 'descendant.pid'), ready = join(folder, 'ready'), exit = join(folder, 'exit')
    const descendant = `require('node:fs').writeFileSync(${JSON.stringify(descendantFile)},String(process.pid));process.send('ready');process.disconnect();setInterval(()=>{},1000)`
    const source = `const fs=require('node:fs');const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});c.once('message',()=>{fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{if(fs.existsSync(${JSON.stringify(exit)})){${mode === 'overflow' ? "process.stdout.write('x'.repeat(16384))" : 'process.exit(0)'}}},10)})`
    const controller = new AbortController()
    let job
    const tracking = { ...api, createJobObjectW(...args) { job = api.createJobObjectW(...args); return job } }
    const owner = await module.spawnWindowsOwnedProcess(invocation(['-e', source], controller, mode === 'overflow' ? 1024 : 65536), tracking)
    let rootHandle, descendantHandle, descendantPid
    try {
      await waitFile(ready)
      descendantPid = Number(await waitFile(descendantFile)); assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0)
      rootHandle = observe(owner.pid); descendantHandle = observe(descendantPid)
      const flags = Buffer.alloc(4)
      assert.equal(probe.getHandleInformation(job, api.address(flags)), 1); assert.equal(flags.readUInt32LE() & 1, 0, 'Job must not be inheritable')
      for (const handle of [rootHandle, descendantHandle]) {
        assert.equal(api.waitForSingleObject(handle, 0), 258, 'fixture must be live before release/cancellation')
        assert.equal(probe.isProcessInJob(handle, job, api.address(flags)), 1); assert.equal(flags.readUInt32LE(), 1, 'root and detached descendant must belong to this exact Job')
      }
      if (mode === 'cancel') controller.abort()
      else await writeExclusive(exit, 'release')
      if (mode === 'normal-exit') assert.equal((await bounded(owner.completion, 10000, mode)).code, 0)
      else await assert.rejects(bounded(owner.completion, 10000, mode), mode === 'cancel' ? /cancelled/ : /output limit/)
      await owner.terminate(); await checkExited(rootHandle); await checkExited(descendantHandle)
    } finally {
      try { await owner.terminate() } finally {
        try { if (rootHandle) release(rootHandle) } finally { if (descendantHandle) release(descendantHandle) }
      }
    }
    cases.push({ name: mode, passed: true, exactJobMembership: true, jobNotInheritable: true, rootPid: owner.pid, descendantPid, retainedHandlesSignaled: true })
  }

  // This Host is outside the Job it creates. Abrupt Host death must kill its child.
  await checkpoint('host-death')
  const death = spawn(process.execPath, [script, '--host-death', installation, root], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const deathClosed = new Promise((resolve, reject) => { death.once('close', code => resolve(code)); death.once('error', reject) })
  void deathClosed.catch(() => {})
  let deathOutput = ''; death.stdout.on('data', chunk => { deathOutput = (deathOutput + chunk).slice(-8192) }); death.stderr.on('data', chunk => { deathOutput = (deathOutput + chunk).slice(-8192) })
  let deathHandle, deathChild, childPid
  try {
    await waitFile(join(root, 'death-host.ready'))
    childPid = Number(await waitFile(join(root, 'death-child.pid')))
    deathHandle = observe(death.pid); deathChild = observe(childPid)
    assert.equal(api.waitForSingleObject(deathChild, 0), 258)
    await writeExclusive(join(root, 'death-host.exit'), 'release')
    assert.equal(await bounded(deathClosed, 10000, 'Host death'), 0, deathOutput)
    await checkExited(deathHandle); await checkExited(deathChild)
  } finally {
    try { if (death.exitCode === null && death.signalCode === null) await stopChildProcess(death, 1000) } finally {
      try { if (deathHandle) release(deathHandle) } finally { if (deathChild) release(deathChild) }
    }
  }
  cases.push({ name: 'Abrupt Host Death', passed: true, rootPid: death.pid, descendantPid: childPid, retainedHandlesSignaled: true })
  await checkpoint('failed-creation')
  const tracked = createWindowsNativeLedger(api)
  receipt.failedCreation.ledger = tracked.ledger
  const handlesBefore = handleCount()
  receipt.failedCreation.before = handlesBefore
  await assert.rejects(bounded(module.spawnWindowsOwnedProcess(missing, tracked.api), 5000, 'failed creation'), /CreateProcessW failed/)
  const handlesAfter = handleCount()
  // Retain the first mismatch, without introducing evidence I/O into the interval.
  receipt.counts = { before: handlesBefore, after: handlesAfter }
  receipt.failedCreation.after = handlesAfter
  assert.equal(handlesAfter, handlesBefore, 'failed creation must not leak Host handles')
  assertWindowsFailureLedger(tracked.ledger)
  cases.push({ name: 'Failed Creation Releases Handles', passed: true, handlesBefore, handlesAfter })
  await checkpoint('leak-sensitivity')
  await verifyWindowsLeakSensitivity(bindings => module.spawnWindowsOwnedProcess(missing, bindings), api, handleCount, receipt.sensitivity)
  receipt.workflowModuleSha256 = createHash('sha256').update(await readFile(join(installation, 'workflow-proof.mjs'))).digest('hex')
  await verifyWindowsWorkflows({ installation, root, observe, waitResult: handle => api.waitForSingleObject(handle, 0), release, waitFile, checkpoint, receipt })
  receipt.passed = true; receipt.phase = 'complete'
  } catch (error) { receipt.failure = String(error.message).slice(0, 8192); throw error }
  finally { await writeWindowsWorkerCheckpoint(root, receipt) }
}

export async function cleanupWindowsProof({ child, closed, snapshot, terminate, removeRoot, collectEvidence = async () => {} }) {
  const errors = []
  const pids = new Set()
  let residue
  try { for (const row of await snapshot()) pids.add(row.ProcessId) } catch (error) { errors.push(`inventory: ${error.message}`) }
  const liveWorker = () => Number.isSafeInteger(child.pid) && child.pid > 0 && child.exitCode === null && child.signalCode === null
  if (liveWorker()) pids.add(child.pid)
  // Inventory is evidence, never a prerequisite for attempting termination.
  for (const pid of pids) { try { await terminate(pid) } catch (error) { errors.push(`termination: ${error.message}`) } }
  if (liveWorker()) { try { child.kill('SIGKILL') } catch (error) { errors.push(`worker termination: ${error.message}`) } }
  try { await bounded(closed, 5000, 'worker exit after emergency cleanup') } catch (error) { errors.push(error.message) }
  try { await bounded(collectEvidence(), 5000, 'partial evidence collection') } catch (error) { errors.push(`evidence: ${error.message}`) }
  try { residue = await snapshot(); assert.deepEqual(residue, []) } catch (error) { errors.push(`final inventory: ${error.message}`) }
  if (residue?.length === 0) { try { await removeRoot() } catch (error) { errors.push(`scratch removal: ${error.message}`) } }
  return { emergencyCleanup: pids.size > 0, residue, errors }
}

export function windowsProofProcessFilter(executable, shell) {
  const literal = value => `'${value.replaceAll("'", "''")}'`
  return `($process.ExecutablePath -eq ${literal(executable)}) -or ($process.ExecutablePath -eq ${literal(shell)} -and $null -ne $process.CommandLine -and $process.CommandLine.Contains(${literal(`"${executable}"`)}))`
}

async function gate(installation, sdkFile, output, arm) {
  assert.ok(isAbsolute(installation) && isAbsolute(sdkFile) && isAbsolute(output))
  assert.ok(arm === undefined || nativeIndexArms.has(arm) || diagnosticModes.has(arm), `unknown Windows diagnostic arm: ${arm}`)
  const sdk = JSON.parse(await readFile(sdkFile, 'utf8'))
  assert.equal(sdk.architecture, process.arch); assert.equal(sdk.pointerSize, 8)
  assert.deepEqual(sdk.completionPort, { associationSize: 16, keyOffset: 0, portOffset: 8, accountingTotalOffset: 36, associationClass: 7, newProcess: 6, synchronize: 1048576 })
  assert.equal(sdk.layouts.STARTUPINFOEXW.size, 112); assert.equal(sdk.constants.PROC_THREAD_ATTRIBUTE_JOB_LIST, 0x2000d)
  const root = await mkdtemp(join(process.env.RUNNER_TEMP, 'owned-windows-'))
  const executable = join(root, 'owned node.exe')
  await copyFile(process.execPath, executable)
  const powershell = join(process.env.ProgramFiles, 'PowerShell/7/pwsh.exe')
  const processFilter = windowsProofProcessFilter(executable, join(process.env.SystemRoot, 'System32', 'cmd.exe'))
  const snapshot = async () => {
    const command = `$ErrorActionPreference='Stop'; $rows=@(Get-CimInstance Win32_Process | Where-Object { $process=$_; ${processFilter} } | Select-Object ProcessId,ParentProcessId); ConvertTo-Json -InputObject $rows -Compress`
    const { stdout } = await execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024 })
    const rows = JSON.parse(stdout); assert.ok(Array.isArray(rows))
    assert.ok(rows.every(row => Number.isSafeInteger(row.ProcessId) && row.ProcessId > 0)); return rows
  }
  const child = spawn(executable, [script, '--worker', installation, root, ...(arm === undefined ? [] : [arm])], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const closed = new Promise((resolve, reject) => { child.once('close', code => resolve(code)); child.once('error', reject) })
  void closed.catch(() => {})
  let logs = '', bytes = 0, failure, result, initial, shellInventory, emergencyCleanup = false, residue
  const shellReady = Promise.withResolvers()
  const overflow = Promise.withResolvers(); void overflow.promise.catch(() => {})
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { bytes += data.length; logs = (logs + data.toString()).slice(-16384); if (logs.includes('\nWORKFLOW_SHELL_READY\n')) shellReady.resolve(); if (bytes > 256 * 1024) overflow.reject(new Error('Native proof output exceeded its bound')) })
  try {
    await bounded((async () => {
      initial = await snapshot(); assert.ok(initial.some(row => row.ProcessId === child.pid), 'outer inventory must see the live worker before native testing')
      await writeExclusive(join(root, 'gate.start'), 'start')
      if (arm === undefined) {
        await Promise.race([shellReady.promise, overflow.promise, closed.then(() => { throw new Error(`Worker exited before the shell inventory check: ${logs}`) })])
        const shellPid = Number(await readFile(join(root, 'workflow-shell.ready'), 'utf8'))
        assert.ok(Number.isSafeInteger(shellPid) && shellPid > 0)
        shellInventory = await snapshot()
        assert.ok(shellInventory.some(row => row.ProcessId === shellPid), 'independent inventory must see the live workflow shell')
        await writeExclusive(join(root, 'workflow-shell.seen'), 'seen')
      }
      assert.equal(await Promise.race([closed, overflow.promise]), 0, logs)
    })(), arm === undefined || nativeIndexArms.has(arm) ? 90000 : 30000, 'Windows native owner proof')
  } catch (error) { failure = error.message } finally {
    const cleanup = await cleanupWindowsProof({
      child, closed, snapshot,
      collectEvidence: async () => {
        result = JSON.parse(await readFile(join(root, 'worker-proof.json'), 'utf8'))
        const expectedModule = await readFile(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/lib/owned-process-windows.js', import.meta.url))
        assert.equal(result.moduleSha256, createHash('sha256').update(expectedModule).digest('hex'), 'fresh installed artifact must match the tested source build')
        if (arm === 'index' || arm === 'index-recovery') {
          assert.equal(result.koffiVersion, '3.1.6')
          assert.equal(result.publicModuleSha256, createHash('sha256').update(await readFile(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/lib/owned-process.js', import.meta.url))).digest('hex'))
          if (!failure) {
            if (arm === 'index') {
              assert.equal(result.passed, true)
              assert.equal(result.installedResolution, true)
              assert.deepEqual(result.cases.map(entry => entry.name), ['public-runtime', 'paged-unicode-incremental', 'lease-contention-reopen', 'lease-first-creation', 'prepared-launch-cancellation', 'held-native-callback'])
              assert.ok(result.cases.every(entry => entry.passed))
              assert.equal(result.stoppedPids.length, 8)
              assert.equal(Object.keys(result.indexModules).length, 11)
            } else {
              assert.equal(Object.keys(result.indexModules).length, 11)
              const { assertWindowsIndexRecoveryReceipt } = await import('./search-index-native-proof.mjs')
              assertWindowsIndexRecoveryReceipt(result)
            }
          }
        } else if (arm !== undefined) {
          assert.equal(result.arm, arm)
          assert.equal(result.completed, true)
          assert.equal(result.installedResolution, true)
          assert.ok(result.counts && Object.keys(result.counts).length === 5, 'diagnostic count checkpoints are incomplete')
          assert.equal(result.ownerCalls, arm === 'control' ? 0 : 1)
          if (arm === 'control') assert.equal(result.ledger, null)
          else {
            assert.ok(result.ledger && Array.isArray(result.ledger.entries), 'missing arm ledger is absent')
            assert.ok(result.ledger.entries.length <= 128, 'native ledger exceeds its bound')
            assert.equal(result.ledger.truncated, false, 'native ledger was truncated')
            assert.equal(result.ledger.dropped, 0, 'native ledger dropped entries')
            assert.ok(result.ledger.entries.some(entry => entry.operation === 'createProcessW' && entry.result === 0), 'failed CreateProcessW is absent from ledger')
          }
          if (!failure) assert.equal(result.passed, true)
        } else if (!failure) {
          assert.equal(result.koffiVersion, '3.1.6')
          assert.equal(result.passed, true); assert.equal(result.cases.length, 6); assert.ok(result.cases.every(entry => entry.passed === true))
          assert.equal(result.publicModuleSha256, createHash('sha256').update(await readFile(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/lib/owned-process.js', import.meta.url))).digest('hex'))
          assert.equal(result.workflowModuleSha256, createHash('sha256').update(await readFile(join(installation, 'workflow-proof.mjs'))).digest('hex'))
          assert.deepEqual(result.workflows.map(entry => entry.mode), ['arguments', ...Array(8).fill('normal-exit'), 'cancel', 'timeout', 'overflow', 'exit-code'])
          assert.ok(result.workflows.every(entry => entry.passed && entry.publicInstalledOwner && entry.retainedHandlesSignaled))
          assert.equal(result.calibration.passed, true); assertWindowsFailureLedger(result.calibration.ledger)
          assertWindowsFailureLedger(result.failedCreation.ledger)
          assert.equal(result.sensitivity.passed, true); assertWindowsFailureLedger(result.sensitivity.ledger)
          assert.equal(result.sensitivity.actualClosesBeforeCleanup.length, 7)
          assert.equal(result.sensitivity.counts.withheld, result.sensitivity.counts.before + 1)
          assert.equal(result.sensitivity.counts.afterRecovery, result.sensitivity.counts.before)
          assert.equal(result.sensitivity.releaseResult, 1)
        }
      },
      terminate: async pid => {
        // Emergency test hygiene, not Job ownership evidence. Hold the process
        // identity before checking the executable, avoiding stale-PID kills.
        const command = `$ErrorActionPreference='Stop'; try { $p=[System.Diagnostics.Process]::GetProcessById(${pid}) } catch [System.ArgumentException] { exit 0 }; try { $held=$p.Handle; if ($p.HasExited) { exit 0 }; $process=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if (!$process -or $p.MainModule.FileName -ne $process.ExecutablePath -or -not (${processFilter})) { throw 'Process identity changed' }; $p.Kill($true); if (!$p.WaitForExit(5000)) { throw 'Emergency process tree remains' } } finally { $p.Dispose() }`
        await execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000, maxBuffer: 256 * 1024 })
      },
      removeRoot: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
    })
    emergencyCleanup = cleanup.emergencyCleanup; residue = cleanup.residue
    if (emergencyCleanup) failure ??= 'Owned processes remained after the native worker'
    if (cleanup.errors.length) failure = [failure, ...cleanup.errors].filter(Boolean).join('; ')
    await writeExclusive(output, { passed: !failure, sourceCommit: process.env.GITHUB_SHA ?? null, platform: process.platform, architecture: process.arch, node: process.version, sdk, workerPid: child.pid, initial, shellInventory, result, emergencyCleanup, residue, temporaryRootRemoved: await lstat(root).then(() => false, error => error.code === 'ENOENT'), failure: failure ?? null, diagnostics: failure ? logs : null })
  }
  if (failure) throw new Error(failure)
  if (arm === 'index') console.log('Windows native installed index proof passed; all copied-executable processes are gone.')
  else if (arm !== undefined) console.log(`Windows native ${arm} discriminator passed; diagnostic only.`)
  else console.log('Windows native Job owner proof passed; all copied-executable processes are gone.')
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  if (process.platform !== 'win32') throw new Error('Native Windows verification requires an explicitly authorized Windows host')
  const [mode, first, second, arm] = process.argv.slice(2)
  if (mode === '--worker' || mode === '--host-death') await worker(resolve(first), resolve(second), mode === '--host-death', arm)
  else await gate(resolve(mode), resolve(first), resolve(second), arm)
}
