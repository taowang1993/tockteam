import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnWindowsOwnedProcess } from '../plugins/tocktutor/packages/tockbot-note-runtime/src/owned-process-windows.ts'
// @ts-expect-error JavaScript verification helper.
import { assertWindowsFailureLedger, calibrateWindowsCreation, cleanupWindowsProof, createWindowsNativeLedger, sampleWindowsHandleCounts, verifyWindowsLeakSensitivity, windowsProofProcessFilter, writeWindowsWorkerCheckpoint } from '../scripts/owned-process-windows-proof.mjs'
// @ts-expect-error JavaScript verification helper.
import { assertWindowsIndexRecoveryReceipt, assertWindowsIndexRecoveryReopenProof, terminateWindowsIndexHost } from '../scripts/search-index-native-proof.mjs'

// @ts-expect-error Shared JavaScript verification fixture.
import { runNativeClockCase } from '../plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-native-clock-harness.mjs'

test('native clock cleanup observes an owner acquired while close settles a pending spawn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clock-close-race-'))
  const observed: number[] = [], released: number[] = [], stopped: number[] = []
  const childEntry = join(root, 'child.mjs')
  class Index {
    whenReady = Promise.reject(new Error('fixture setup failed'))
    closing?: Promise<void>
    async spawn(_options: unknown) { throw Error('must use fixture spawn') }
    close() { return this.closing ??= this.spawn({ args: [childEntry] }).then(() => {}) }
  }
  class Clock { observe() {} }
  try {
    await assert.rejects(runNativeClockCase('progress', {
      SearchIndexProcess: Index, NativeProgressClock: Clock, spawnOwnedProcess: async () => ({ pid: 42 }),
    }, { root, childEntry, fixture: join(root, 'fixture.mjs'),
      observe: (pid: number) => { observed.push(pid); return pid },
      assertStopped: (handle: number) => { stopped.push(handle) },
      release: (handle: number) => { released.push(handle) },
    }), /fixture setup failed/)
    assert.deepEqual(observed, [42])
    assert.deepEqual(stopped, [42])
    assert.deepEqual(released, [42])
    assert.deepEqual(await readdir(root), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Windows proof inventory includes only the copied executable or its explicitly quoted workflow shell', () => {
  assert.equal(windowsProofProcessFilter("C:\\temp\\owner's root\\owned node.exe", 'C:\\Windows\\System32\\cmd.exe'), `($process.ExecutablePath -eq 'C:\\temp\\owner''s root\\owned node.exe') -or ($process.ExecutablePath -eq 'C:\\Windows\\System32\\cmd.exe' -and $null -ne $process.CommandLine -and $process.CommandLine.Contains('"C:\\temp\\owner''s root\\owned node.exe"'))`)
})

test('Windows recovery refuses Host termination if either retained process has already stopped', () => {
  for (const waits of [[0, 258], [258, 0], [258, 0xffffffff]]) {
    assert.throws(() => terminateWindowsIndexHost({ waitForSingleObject: () => waits.shift() }, {
      terminateProcess: () => assert.fail('do not terminate after a failed live check'),
    }, 1, 2, {}), /before Host-only termination/)
  }
  const calls: string[] = [], recovery: Record<string, unknown> = {}
  terminateWindowsIndexHost({ waitForSingleObject: (handle: number) => { calls.push(`wait:${handle}`); return 258 } }, {
    terminateProcess: (handle: number) => { calls.push(`terminate:${handle}`); return 1 },
  }, 1, 2, recovery)
  assert.deepEqual(calls, ['wait:1', 'wait:2', 'terminate:1'])
  assert.equal(recovery.hostTerminated, true)
})

test('Windows index recovery requires an observed dead Host and child plus exact proof before reopen', () => {
  const proof = {
    hostPid: 101, childPid: 202, hostExecPath: 'node', childExecPath: 'node', hostWait: 0, childWait: 0, contenderWait: 0,
    contenderBusyCode: 'SQLITE_BUSY', contenderClosed: true, hostTerminated: true,
    terminateResult: 1, mainUnchanged: true, identityUnchanged: true, observerHandleFlags: { host: 0, child: 0 },
    blockExpired: false, blockDurationMs: 60000, blockedToChildSignalMs: 10,
  }
  assert.doesNotThrow(() => assertWindowsIndexRecoveryReopenProof(proof))
  assert.throws(() => assertWindowsIndexRecoveryReopenProof({ ...proof, blockExpired: true }), /expired/i)
  assert.throws(() => assertWindowsIndexRecoveryReopenProof({ ...proof, blockedToChildSignalMs: 55000 }), /finite block/i)
  assert.throws(() => assertWindowsIndexRecoveryReopenProof({ ...proof, childWait: 258 }), /child/i)
  for (const field of Object.keys(proof)) {
    const missing = { ...proof }; delete missing[field as keyof typeof missing]
    assert.throws(() => assertWindowsIndexRecoveryReopenProof(missing), new RegExp(field))
  }
})

test('Windows index recovery receipt requires final waits, identity, and zero rereads', () => {
  const recovery = {
    passed: true, emergencyCleanup: false,
    hostPid: 101, childPid: 202, hostExecPath: 'node', childExecPath: 'node', hostInitialWait: 258, childInitialWait: 258, hostWait: 0, childWait: 0, contenderWait: 0,
    contenderBusyCode: 'SQLITE_BUSY', contenderClosed: true, hostTerminated: true,
    terminateResult: 1, mainUnchanged: true, identityUnchanged: true, observerHandleFlags: { host: 0, child: 0 },
    blockExpired: false, blockDurationMs: 60000, blockedToChildSignalMs: 10,
    blockedAt: 1, terminateAt: 2, hostPreTerminateWait: 258, childPreTerminateWait: 258,
    hostWaitReceipt: { label: 'nested Host', initialWait: 0, finalWait: 0, waitValues: [0], polls: 1, startedAt: 1, signaledAt: 2 }, childWaitReceipt: { label: 'nested index child', initialWait: 258, finalWait: 0, waitValues: [258, 0], polls: 2, startedAt: 1, signaledAt: 2 },
    mainIdentityBefore: { dev: '1', ino: '2' }, mainIdentityAfter: { dev: '1', ino: '2' },
    mainBytesBeforeSha256: 'bytes', mainBytesAfterSha256: 'bytes', reopenReads: 0,
    reopenedIdentity: { dev: '1', ino: '2' }, reopenedWait: 0, reopenedClosed: true, reopenedAlphaPath: 'Alpha.md',
  }
  const receipt = { passed: true, installedResolution: true,
    clockCases: [{ mode: 'progress', passed: true }, { mode: 'stall', passed: true }, { mode: 'tail', passed: true }], recovery }
  assert.doesNotThrow(() => assertWindowsIndexRecoveryReceipt(receipt))
  assert.throws(() => assertWindowsIndexRecoveryReceipt({ ...receipt, recovery: { ...recovery, childWait: 258 } }), /child/i)
  assert.throws(() => assertWindowsIndexRecoveryReceipt({ ...receipt, recovery: { ...recovery, emergencyCleanup: true } }), /emergency/i)
  const missing = { ...recovery }; delete (missing as Record<string, unknown>).reopenReads
  assert.throws(() => assertWindowsIndexRecoveryReceipt({ ...receipt, recovery: missing }), /reopenReads/)
})

test('Windows proof inventory failure cannot bypass known-worker termination or final verification', async () => {
  const actions: string[] = []
  let samples = 0
  const child = { pid: 42, exitCode: null, signalCode: null, kill: () => { actions.push('fallback'); return true } }
  const cleanup = await cleanupWindowsProof({
    child, closed: Promise.resolve(1),
    snapshot: async () => { actions.push('snapshot'); if (++samples === 1) throw Error('CIM unavailable'); return [] },
    terminate: async (pid: number) => { actions.push(`terminate:${pid}`); throw Error('termination helper unavailable') },
    removeRoot: async () => { actions.push('remove') },
  }).catch((error: Error) => ({ errors: [error.message] }))
  assert.ok(actions.includes('terminate:42'), 'known worker termination must not depend on inventory')
  assert.ok(actions.includes('fallback'), 'native child handle termination remains available if helper fails')
  assert.equal(samples, 2)
  assert.equal(actions.at(-1), 'remove')
  assert.ok(cleanup.errors.some((message: string) => message.includes('CIM unavailable')))
  assert.ok(cleanup.errors.some((message: string) => message.includes('termination helper unavailable')))
})

test('Windows proof retains uncertain scratch roots and does not report an unavailable final inventory as empty', async () => {
  const cleanup = await cleanupWindowsProof({
    child: { pid: 42, exitCode: 0, signalCode: null }, closed: Promise.resolve(0),
    snapshot: async () => { throw Error('CIM unavailable') },
    terminate: async () => { assert.fail('exited worker must not be killed by stale PID') },
    removeRoot: async () => { assert.fail('do not erase unresolved process ownership') },
  })
  assert.equal(cleanup.residue, undefined)
  assert.equal(cleanup.errors.length, 2)
})

test('Windows proof clean completion needs no emergency termination', async () => {
  let removed = false
  const cleanup = await cleanupWindowsProof({
    child: { pid: 42, exitCode: 0, signalCode: null }, closed: Promise.resolve(0),
    snapshot: async () => [],
    terminate: async () => { assert.fail('no emergency cleanup after verified completion') },
    removeRoot: async () => { removed = true },
  })
  assert.deepEqual(cleanup, { emergencyCleanup: false, residue: [], errors: [] })
  assert.equal(removed, true)
})

test('Windows proof preserves unsuccessful partial receipts before scratch removal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'windows-proof-checkpoint-'))
  const receipt = { passed: false, phase: 'failed-creation', cases: [{ name: 'prior case', passed: true }] }
  try {
    await writeWindowsWorkerCheckpoint(root, receipt)
    const failed = { ...receipt, failure: 'handle mismatch', counts: { before: 197, after: 212 } }
    await writeWindowsWorkerCheckpoint(root, failed)
    let collected: unknown
    await cleanupWindowsProof({
      child: { pid: 42, exitCode: 1, signalCode: null }, closed: Promise.resolve(1), snapshot: async () => [], terminate: async () => {},
      collectEvidence: async () => { collected = JSON.parse(await readFile(join(root, 'worker-proof.json'), 'utf8')) },
      removeRoot: async () => { assert.deepEqual(collected, failed); assert.deepEqual(await readdir(root), ['worker-proof.json']); await rm(root, { recursive: true }) },
    })
    assert.deepEqual(collected, failed)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Windows proof evidence collection failure does not skip verified scratch cleanup', async () => {
  let removed = false
  const cleanup = await cleanupWindowsProof({
    child: { pid: 42, exitCode: 1, signalCode: null }, closed: Promise.resolve(1), snapshot: async () => [], terminate: async () => {},
    collectEvidence: async () => { throw Error('receipt unreadable') }, removeRoot: async () => { removed = true },
  })
  assert.equal(removed, true)
  assert.match(cleanup.errors.join(';'), /receipt unreadable/)
})

test('Windows native ledger forwards receivers and preserves failed-call/getLastError order', () => {
  const calls: string[] = []
  const native = {
    address(buffer: Buffer) { assert.equal(this, native); return buffer === command ? 101n : 102n },
    createProcessW(...args: unknown[]) { assert.equal(this, native); calls.push('CreateProcessW'); forwarded = args; return 0 },
    getLastError() { assert.equal(this, native); calls.push('getLastError'); return 2 },
  }
  const command = Buffer.alloc(8), information = Buffer.alloc(24)
  let forwarded: unknown[] | undefined
  const { api, ledger } = createWindowsNativeLedger(native)
  const commandAddress = api.address(command), informationAddress = api.address(information)
  assert.equal(api.createProcessW('missing.exe', commandAddress, null, null, 1, 0, 0n, 'C:\\work', 0n, informationAddress), 0)
  assert.equal(api.getLastError(), 2)
  assert.deepEqual(calls, ['CreateProcessW', 'getLastError'])
  assert.deepEqual(forwarded, ['missing.exe', commandAddress, null, null, 1, 0, 0n, 'C:\\work', 0n, informationAddress])
  assert.deepEqual(ledger.entries.slice(-2).map((entry: { operation: string }) => entry.operation), ['createProcessW', 'getLastError'])
})

test('Windows native ledger records distinct Job/pipe handles, releases, and bounded entries', () => {
  const buffers = new Map<bigint, Buffer>(), closed: bigint[] = []
  const native = {
    address(buffer: Buffer) { const pointer = BigInt(buffers.size + 1); buffers.set(pointer, buffer); return pointer },
    createJobObjectW() { return 7n },
    createPipe(read: bigint, write: bigint) { buffers.get(read)?.writeBigUInt64LE(11n); buffers.get(write)?.writeBigUInt64LE(12n); return 1 },
    closeHandle(handle: bigint) { closed.push(handle); return handle === 11n ? 1 : 0 },
  }
  const { api, ledger } = createWindowsNativeLedger(native)
  const read = Buffer.alloc(8), write = Buffer.alloc(8)
  const readAddress = api.address(read), writeAddress = api.address(write)
  assert.equal(api.createJobObjectW(null, null), 7n)
  assert.equal(api.createPipe(readAddress, writeAddress, null, 0), 1)
  assert.equal(api.closeHandle(read.readBigUInt64LE()), 1)
  assert.equal(api.closeHandle(write.readBigUInt64LE()), 0)
  const pipe = ledger.entries.find((entry: { operation: string }) => entry.operation === 'createPipe') as { readHandle: string, writeHandle: string }
  assert.deepEqual([pipe.readHandle, pipe.writeHandle], ['11', '12'])
  assert.deepEqual(closed, [11n, 12n])
  assert.equal(ledger.entries.find((entry: { operation: string }) => entry.operation === 'createJobObjectW')?.handle, '7')

  const limited = createWindowsNativeLedger({ closeHandle: () => 1 }, 3)
  for (let index = 0; index < 8; index += 1) assert.equal(limited.api.closeHandle(BigInt(index)), 1)
  assert.equal(limited.ledger.entries.length, 3)
  assert.equal(limited.ledger.truncated, true)
  assert.ok(limited.ledger.dropped > 0)
})

test('Windows failed-create ledger rejects omitted, failed, duplicate and unknown releases', () => {
  const entries = [
    { operation: 'createJobObjectW', handle: '1', acquired: true },
    { operation: 'createIoCompletionPort', handle: '8', acquired: true },
    { operation: 'setInformationJobObject', handle: '1', class: 7, result: 1, completionKey: '1', completionPort: '8' },
    ...[2, 4, 6].map(n => ({ operation: 'createPipe', result: 1, readHandle: String(n), writeHandle: String(n + 1) })),
    { operation: 'createProcessW', result: 0, processHandle: '0', threadHandle: '0', pid: 0 },
    { operation: 'getLastError', result: 2 },
    { operation: 'deleteProcThreadAttributeList' },
    ...[7, 6, 5, 4, 3, 2, 8, 1].map(n => ({ operation: 'closeHandle', handle: String(n), result: 1 })),
  ]
  const ledger = { entries, truncated: false, dropped: 0 }
  assert.doesNotThrow(() => assertWindowsFailureLedger(ledger))
  assert.throws(() => assertWindowsFailureLedger({ ...ledger, entries: entries.slice(0, -1) }))
  for (const bad of [{ result: 0 }, { handle: '2' }, { handle: '99' }]) {
    assert.throws(() => assertWindowsFailureLedger({ ...ledger, entries: [...entries.slice(0, -1), { ...entries.at(-1), ...bad }] }))
  }
})

test('Windows raw calibration retains first-use growth and detects a real owner release withheld by the negative control', async () => {
  const buffers = new Map<bigint, Buffer>(), handles = new Set<bigint>()
  let pointer = 100n, handle = 1n, error = 0, internal = 0, creates = 0, deletes = 0
  const acquire = () => { const result = handle++; handles.add(result); return result }
  const api = {
    address(buffer: Buffer) { buffers.set(++pointer, buffer); return pointer },
    getLastError: () => error,
    createJobObjectW: acquire,
    createIoCompletionPort: acquire,
    setInformationJobObject: () => 1,
    createPipe(read: bigint, write: bigint) { buffers.get(read)!.writeBigUInt64LE(acquire()); buffers.get(write)!.writeBigUInt64LE(acquire()); return 1 },
    setHandleInformation: () => 1,
    initializeProcThreadAttributeList(list: bigint | null, _n: number, _flags: number, size: bigint) {
      buffers.get(size)!.writeBigUInt64LE(128n); error = list ? 0 : 122; return list ? 1 : 0
    },
    updateProcThreadAttribute: () => 1,
    deleteProcThreadAttributeList() { deletes++ },
    createProcessW() { if (++creates === 1) internal += 16; error = 2; return 0 },
    closeHandle(h: bigint) { assert.ok(handles.delete(h)); return 1 },
  }
  const receipt: any = {}
  calibrateWindowsCreation(api, { commandLine: Buffer.from('missing\0', 'utf16le'), environment: Buffer.alloc(4) }, { executable: 'missing', cwd: 'work' }, () => 100 + internal + handles.size, receipt)
  assert.equal(creates, 1); assert.equal(deletes, 1); assert.equal(handles.size, 0)
  assert.deepEqual(receipt.counts, { before: 100, beforeCreate: 108, afterCreate: 124, afterCleanup: 116 })
  assert.equal(receipt.passed, true)
  assertWindowsFailureLedger(receipt.ledger)
  const sensitivity: any = {}
  await verifyWindowsLeakSensitivity((bindings: any) => spawnWindowsOwnedProcess({ executable: 'missing', args: [], env: {}, cwd: 'work', signal: new AbortController().signal }, bindings), api, () => 100 + internal + handles.size, sensitivity)
  assert.equal(creates, 2); assert.equal(handles.size, 0)
  assert.deepEqual(sensitivity.counts, { before: 116, withheld: 117, afterRecovery: 116 })
  assert.equal(sensitivity.actualClosesBeforeCleanup.length, 7)
  assert.ok(sensitivity.actualClosesBeforeCleanup.every((entry: any) => entry.handle !== sensitivity.suppressedHandle))
  assert.match(sensitivity.expectedEqualityFailure, /failed creation must not leak Host handles/)
  assert.equal(sensitivity.releaseResult, 1); assert.equal(sensitivity.passed, true)
  assertWindowsFailureLedger(sensitivity.ledger)

  const failedCalibration: any = {}
  assert.throws(() => calibrateWindowsCreation({ ...api, getLastError: () => 5 }, { commandLine: Buffer.alloc(8), environment: Buffer.alloc(4) }, { executable: 'missing', cwd: 'work' }, () => 100 + internal + handles.size, failedCalibration))
  assert.equal(handles.size, 0); assert.equal(failedCalibration.passed, false)
  assert.equal(failedCalibration.ledger.entries.filter((entry: any) => entry.operation === 'closeHandle').length, 8)
  assert.match(failedCalibration.failures[0], /5 !== 122/)

  let closes = 0
  const failedSensitivity: any = {}
  await assert.rejects(verifyWindowsLeakSensitivity((bindings: any) => spawnWindowsOwnedProcess({ executable: 'missing', args: [], env: {}, cwd: 'work', signal: new AbortController().signal }, bindings), { ...api, closeHandle: (h: bigint) => ++closes === 8 ? 0 : api.closeHandle(h) }, () => 100 + internal + handles.size, failedSensitivity))
  assert.equal(failedSensitivity.passed, false); assert.equal(failedSensitivity.releaseResult, 0)
  assert.equal(closes, 8, 'uncertain close must not be retried')
  assert.equal(failedSensitivity.counts.afterRecovery, 117)
  assert.ok(failedSensitivity.failures.length > 0)
  api.closeHandle(BigInt(failedSensitivity.suppressedHandle))
  assert.equal(handles.size, 0)
})

test('Windows discriminator retains fixed checkpoints when failed creation has no count delta', async () => {
  const values = [197, 197, 197, 197, 197]
  const result = await sampleWindowsHandleCounts(() => values.shift(), () => Promise.reject(new Error('CreateProcessW failed (Win32 2)')))
  assert.equal(result.firstMismatch, undefined)
  assert.deepEqual(result.samples.map((sample: { phase: string, count: number }) => [sample.phase, sample.count]), [
    ['before', 197], ['after-returned', 197], ['after-rejected', 197], ['after-microtask', 197], ['after-immediate', 197],
  ])
})

test('Windows discriminator retains earlier counts and mismatch when a later probe fails', async () => {
  const values = [197, 197, 212]
  const result = await sampleWindowsHandleCounts(() => {
    if (!values.length) throw new Error('later probe failed')
    return values.shift()
  }, () => Promise.reject(new Error('CreateProcessW failed (Win32 2)')))
  assert.deepEqual(result.samples.map((sample: { count: number }) => sample.count), [197, 197, 212])
  assert.match(result.firstMismatch?.message ?? '', /failed creation must not leak Host handles/)
  assert.match(result.samplingFailure?.message ?? '', /later probe failed/)
})

test('Windows discriminator observes owner rejection even when the immediate count probe fails', async () => {
  let probes = 0
  const result = await sampleWindowsHandleCounts(() => {
    if (++probes > 1) throw new Error('immediate probe failed')
    return 197
  }, () => Promise.reject(new Error('CreateProcessW failed (Win32 2)')))
  assert.equal(result.samples.length, 1)
  assert.match(result.firstMismatch?.message ?? '', /immediate probe failed/)
  await new Promise(resolve => setImmediate(resolve))
})

test('Windows discriminator preserves the first count mismatch while retaining fixed checkpoints', async () => {
  const events: string[] = [], values = [197, 198, 212, 212, 212]
  const result = await sampleWindowsHandleCounts(() => { events.push('count'); return values.shift() }, () => {
    events.push('owner')
    return Promise.reject(new Error('CreateProcessW failed (Win32 2)'))
  })
  assert.deepEqual(result.samples.map((sample: { phase: string }) => sample.phase), ['before', 'after-returned', 'after-rejected', 'after-microtask', 'after-immediate'])
  assert.deepEqual(events.slice(0, 3), ['count', 'owner', 'count'])
  assert.equal(events.filter(event => event === 'count').length, 5)
  assert.match(result.firstMismatch?.message ?? '', /failed creation must not leak Host handles/)
  assert.match(result.firstMismatch?.message ?? '', /212/)
})
