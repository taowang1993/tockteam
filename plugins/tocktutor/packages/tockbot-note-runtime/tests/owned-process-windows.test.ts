import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { OwnedProcess } from '../src/owned-process.ts'
import { adoptSearchIndex, retireSearchIndex, awaitSearchIndexSettlement } from '../src/search-index-ownership.ts'
import { encodeWindowsInvocation, spawnWindowsOwnedProcess, type NativePtr, type WindowsOwnedBindings } from '../src/owned-process-windows.ts'

test('Windows owner preserves Unicode argv and creates an explicit sorted double-NUL environment', () => {
  const encoded = encodeWindowsInvocation({ executable: 'C:\\Program Files\\node.exe', args: ['', 'plain', 'a"b', 'a b\\', '中文'], env: { z: 'last', PATH: 'C:\\bin', Alpha: '中文', omitted: undefined } })
  assert.equal(encoded.commandLine.toString('utf16le'), '"C:\\Program Files\\node.exe" "" plain "a\\"b" "a b\\\\" 中文\0')
  assert.equal(encoded.environment.toString('utf16le'), 'Alpha=中文\0PATH=C:\\bin\0z=last\0\0')
  assert.equal(encodeWindowsInvocation({ executable: 'C:\\node.exe', args: [], env: {} }).environment.toString('utf16le'), '\0\0')
  for (const env of [{ Path: 'one', PATH: 'two' }, { 'bad=key': 'x' }, { good: 'bad\0value' }]) {
    assert.throws(() => encodeWindowsInvocation({ executable: 'C:\\node.exe', args: [], env }), /Invalid/)
  }
  assert.throws(() => encodeWindowsInvocation({ executable: 'C:\\node.exe', args: ['x'.repeat(32767)], env: {} }), /limit/)
})

test('Windows explicit verbatim arguments preserve cmd shell quoting without CRT escaping', () => {
  const command = '""C:\\Program Files\\node.exe" "C:\\work\\a b.cjs" "a b" & echo done"'
  const encoded = encodeWindowsInvocation({ executable: 'C:\\Windows\\System32\\cmd.exe', args: ['/D', '/S', '/C', command], env: {}, windowsVerbatimArguments: true })
  assert.equal(encoded.commandLine.toString('utf16le'), `C:\\Windows\\System32\\cmd.exe /D /S /C ${command}\0`)
})

function nativeModel() {
  const buffers = new Map<NativePtr, Buffer>()
  const addresses = new WeakMap<Buffer, NativePtr>()
  const handles = new Set<NativePtr>()
  const attributes = new Map<number, Buffer>()
  const inherited: NativePtr[] = []
  const closeAttempts: NativePtr[] = []
  const births = [42, 43]
  let nextAddress = 1000n
  let nextHandle = 10n
  const ptr = (value: bigint) => value as NativePtr
  const buffer = (address: NativePtr) => { const value = buffers.get(address); assert.ok(value); return value }
  const state = { rootExited: true, descendantExited: true, holdDescendant: false, total: 2, active: 1, created: 0, terminated: 0, deletedAttributes: 0, lastError: 0, output: 5, continuousOutput: false, fail: '', holdJob: false, holdPipes: false, reads: 0 }
  const check = (operation: string) => { if (state.fail !== operation) return 1; state.lastError = 5; return 0 }
  const api: WindowsOwnedBindings = {
    address(value) { let address = addresses.get(value); if (!address) { address = ptr(nextAddress++); addresses.set(value, address); buffers.set(address, value) }; return address },
    getLastError: () => state.lastError,
    closeHandle(handle) {
      assert.equal(closeAttempts.includes(handle), false, `double close attempt ${handle}`); closeAttempts.push(handle)
      assert.equal(handles.has(handle), true, `unknown handle ${handle}`)
      if (!check('closeHandle') || (state.fail === 'threadClose' && handle === 3n)) { state.lastError = 5; return 0 }
      handles.delete(handle); return 1
    },
    createJobObjectW() { handles.add(ptr(1n)); return ptr(1n) },
    setInformationJobObject(job, cls, value, size) { assert.equal(job, 1n); if (cls === 7) { assert.equal(size, 16); assert.equal(value.readBigUInt64LE(), 1n); assert.equal(value.readBigUInt64LE(8), 4n); return check('associatePort') }; assert.equal(cls, 9); assert.equal(size, 144); assert.equal(value.readUInt32LE(16), 0x2000); return check('setInformationJobObject') },
    createIoCompletionPort() { if (!check('createPort')) return 0n; handles.add(4n); return 4n },
    getQueuedCompletionStatus(_port, code, key, pid, timeout) { assert.equal(timeout, 0); if (!check('completionPort')) return 0; const birth = births.shift(); if (birth === undefined) { state.lastError = 258; return 0 }; buffer(code).writeUInt32LE(6); buffer(key).writeBigUInt64LE(1n); buffer(pid).writeBigUInt64LE(BigInt(birth)); return 1 },
    openProcess(access, inherit, pid) { assert.equal(access, 0x100000); assert.equal(inherit, 0); assert.equal(pid, 43); if (state.fail === 'openMissing') { state.lastError = 87; return 0n }; if (!check('openProcess')) return 0n; handles.add(5n); return 5n },
    createPipe(read, write) { if (!check('createPipe')) return 0; for (const slot of [read, write]) { const handle = ptr(nextHandle++); handles.add(handle); buffer(slot).writeBigUInt64LE(handle) }; return 1 },
    setHandleInformation(handle, mask, flags) { assert.equal(mask, 1); assert.equal(flags, 1); inherited.push(handle); return check('setHandleInformation') },
    initializeProcThreadAttributeList(list, count, flags, size) { assert.equal(count, 2); assert.equal(flags, 0); if (!list) { state.lastError = 122; buffer(size).writeBigUInt64LE(128n); return 0 }; return check('initialize') },
    updateProcThreadAttribute(_list, flags, attribute, value, size) { assert.equal(flags, 0); attributes.set(attribute, buffer(value).subarray(0, size)); return check('update') },
    deleteProcThreadAttributeList() { state.deletedAttributes++ },
    createProcessW(executable, command, _pa, _ta, inherit, flags, env, cwd, startup, info) {
      if (!check('createProcessW')) return 0
      assert.equal(executable, 'C:\\node.exe'); assert.equal(cwd, 'C:\\work'); assert.equal(inherit, 1)
      assert.equal(flags, 0x08080400, 'ordinary process with Unicode, extended startup and no visible window')
      assert.equal(buffer(command).toString('utf16le'), 'C:\\node.exe child.js\0')
      assert.equal(buffer(env).toString('utf16le'), 'SystemRoot=C:\\Windows\0\0')
      assert.equal(buffer(startup).readUInt32LE(0), 112); assert.equal(buffer(startup).readUInt32LE(60), 0x100)
      assert.equal(attributes.get(0x2000d)?.readBigUInt64LE(0), 1n, 'creation-time job attachment')
      const list = attributes.get(0x20002)!; assert.equal(list.length, 24)
      assert.deepEqual([0, 8, 16].map(offset => list.readBigUInt64LE(offset)), inherited)
      assert.deepEqual([80, 88, 96].map(offset => buffer(startup).readBigUInt64LE(offset)), inherited)
      assert.equal(inherited.includes(ptr(1n)), false, 'job handle is not inherited')
      buffer(info).writeBigUInt64LE(2n, 0); buffer(info).writeBigUInt64LE(3n, 8); buffer(info).writeUInt32LE(42, 16)
      handles.add(ptr(2n)); handles.add(ptr(3n)); state.created++; return 1
    },
    peekNamedPipe(pipe, _a, _b, _c, available) { assert.ok(available); if (!check('peek')) return 0; if (pipe === 12n && (state.output || state.continuousOutput)) { buffer(available).writeUInt32LE(state.continuousOutput ? 1000000 : state.output); return 1 }; if (state.rootExited && !state.holdPipes) { state.lastError = 109; return 0 }; buffer(available).writeUInt32LE(0); return 1 },
    readFile(_pipe, target, count, read) { assert.ok(count <= target.length); state.reads++; buffer(read).writeUInt32LE(count); if (!state.continuousOutput) state.output = Math.max(0, state.output - count); return check('read') },
    waitForSingleObject(process, timeout) { assert.equal(timeout, 0); return check('wait') ? ((process === 5n ? state.descendantExited : state.rootExited) ? 0 : 258) : 0xffffffff },
    getExitCodeProcess(_process, code) { buffer(code).writeUInt32LE(0); return check('exitCode') },
    queryInformationJobObject(_job, cls, value, size) { assert.equal(cls, 1); assert.equal(size, 48); value.writeUInt32LE(state.total, 36); value.writeUInt32LE(state.active, 40); return check('query') },
    terminateJobObject() { state.terminated++; if (!check('terminate')) return 0; state.rootExited = true; if (!state.holdDescendant) state.descendantExited = true; state.continuousOutput = false; if (!state.holdJob) state.active = 0; return 1 },
  }
  return { api, state, handles, closeAttempts, births, buffers }
}
const invocation = () => ({ executable: 'C:\\node.exe', args: ['child.js'], cwd: 'C:\\work', env: { SystemRoot: 'C:\\Windows' }, signal: new AbortController().signal })

test('Windows model gates creation after binding resolution and can cancel before acquiring handles', async () => {
  for (const cancel of [false, true]) {
    const model = nativeModel(), controller = new AbortController(), held = Promise.withResolvers<void>()
    const blocker = { close: () => held.promise }
    adoptSearchIndex(blocker)
    const blocked = retireSearchIndex(blocker)
    const pending = spawnWindowsOwnedProcess({ ...invocation(), signal: controller.signal,
      admit: async (launch: () => Promise<OwnedProcess>) => {
        let child: Promise<OwnedProcess> | undefined
        await awaitSearchIndexSettlement(() => { child = launch() }, controller.signal)
        return child!
      },
    }, model.api)
    void pending.catch(() => {})
    try {
      assert.equal(model.state.created, 0)
      assert.equal(model.handles.size, 0)
      if (cancel) {
        controller.abort()
        await assert.rejects(pending, { name: 'AbortError' })
        assert.equal(model.state.created, 0)
      } else {
        held.resolve()
        const child = await pending
        await child.terminate()
        assert.equal(model.state.created, 1)
      }
    } finally {
      held.resolve(); await blocked
      const child = await pending.catch(() => undefined)
      await child?.terminate()
    }
    assert.equal(model.handles.size, 0)
  }
})

test('Windows model attaches the job at creation and settles descendants and pipes before releasing handles', async () => {
  const model = nativeModel()
  const child = await spawnWindowsOwnedProcess(invocation(), model.api)
  try {
    assert.deepEqual(await child.completion, { code: 0, signal: null, stdoutBytes: 5, stderrBytes: 0 })
    assert.equal(model.state.created, 1); assert.equal(model.state.terminated, 1)
    assert.equal(model.state.deletedAttributes, 1); assert.equal(model.handles.size, 0)
    await Promise.all([child.terminate(), child.terminate()])
  } finally { await child.terminate() }
})

test('Windows Job accounting zero cannot settle while a retained descendant remains unsignaled', async () => {
  const model = nativeModel(); model.state.descendantExited = false; model.state.holdDescendant = true
  const child = await spawnWindowsOwnedProcess(invocation(), model.api)
  let settled = false
  void child.completion.then(() => { settled = true }, () => { settled = true })
  try {
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(model.state.active, 0)
    assert.equal(settled, false, 'accounting zero is not process-handle settlement')
    model.state.descendantExited = true
    await child.completion
  } finally { model.state.descendantExited = true; await child.terminate() }
  assert.equal(model.handles.size, 0)
})

test('Windows missing births, failed opens, duplicate births and over-budget accounting reject cleanup', async () => {
  for (const fault of ['missing-birth', 'missing-root', 'openMissing', 'openProcess', 'duplicate', 'completionPort', 'over-budget', 'bad-key', 'bad-pid']) {
    const model = nativeModel(); model.state.fail = fault
    if (fault === 'missing-birth') model.births.pop()
    if (fault === 'missing-root') model.births.shift()
    if (fault === 'bad-key' || fault === 'bad-pid') {
      const dequeue = model.api.getQueuedCompletionStatus
      model.api.getQueuedCompletionStatus = (...args) => {
        const result = dequeue(...args)
        if (result) model.buffers.get(args[fault === 'bad-key' ? 2 : 3])!.writeBigUInt64LE(0n)
        return result
      }
    }
    if (fault === 'duplicate') model.births.splice(1, 0, 42)
    if (fault === 'over-budget') model.state.total = 1025
    const child = await spawnWindowsOwnedProcess(invocation(), model.api)
    const expired = performance.now() + 6000
    const clock = mock.method(performance, 'now', () => expired)
    try {
      await assert.rejects(child.completion, /cleanup could not be verified/, fault)
      await assert.rejects(child.terminate(), /cleanup could not be verified/, fault)
      assert.equal(model.handles.size, 0, fault)
    } finally { clock.mock.restore(); await child.terminate().catch(() => {}) }
  }
})

test('Windows completion queue saturation yields after 64 messages and preserves all births', async () => {
  const model = nativeModel(), dequeue = model.api.getQueuedCompletionStatus
  let calls = 0
  model.api.getQueuedCompletionStatus = (port, code, key, pid, timeout) => {
    calls++
    if (calls <= 129) { model.buffers.get(code)!.writeUInt32LE(7); model.buffers.get(key)!.writeBigUInt64LE(1n); return 1 }
    return dequeue(port, code, key, pid, timeout)
  }
  const child = await spawnWindowsOwnedProcess(invocation(), model.api)
  try { assert.equal(calls, 64); await child.completion; assert.ok(calls >= 132) }
  finally { await child.terminate() }
  assert.equal(model.handles.size, 0)
})

test('Windows creation failures release partial ownership and initialize/delete attributes exactly once', async () => {
  for (const fault of ['setInformationJobObject', 'createPort', 'associatePort', 'createPipe', 'setHandleInformation', 'initialize', 'update', 'createProcessW']) {
    const model = nativeModel(); model.state.fail = fault
    await assert.rejects(spawnWindowsOwnedProcess(invocation(), model.api), /failed/)
    assert.equal(model.state.created, 0, fault)
    assert.equal(model.handles.size, 0, fault)
    assert.equal(model.state.deletedAttributes, ['update', 'createProcessW'].includes(fault) ? 1 : 0, fault)
  }
})

test('Windows cancellation and output overflow settle the owner without publishing success', async () => {
  for (const reason of ['cancel', 'overflow']) {
    const model = nativeModel(); model.state.rootExited = false
    const controller = new AbortController()
    const child = await spawnWindowsOwnedProcess({ ...invocation(), signal: controller.signal, maxOutputBytes: reason === 'overflow' ? 1 : 100 }, model.api)
    try {
      if (reason === 'cancel') controller.abort()
      await assert.rejects(child.completion, reason === 'cancel' ? /cancelled/ : /output limit/)
      await child.terminate(); assert.equal(model.handles.size, 0)
    } finally { await child.terminate() }
  }
})

test('Windows continuous output yields after one bounded read instead of starving cancellation', async () => {
  const model = nativeModel(); model.state.rootExited = false; model.state.continuousOutput = true; model.state.output = 0
  const controller = new AbortController()
  const child = await spawnWindowsOwnedProcess({ ...invocation(), signal: controller.signal }, model.api)
  try {
    assert.equal(model.state.reads, 1, 'initial poll must yield while more bytes remain available')
    controller.abort()
    await assert.rejects(child.completion, /cancelled/)
    await child.terminate(); assert.equal(model.handles.size, 0)
  } finally { await child.terminate() }
})

test('Windows uncertain wait/query/termination/pipe settlement rejects cleanup and releases every owned handle', async () => {
  for (const fault of ['wait', 'exitCode', 'query', 'terminate', 'peek', 'live-job', 'live-pipes']) {
    const model = nativeModel()
    model.state.fail = fault; model.state.holdJob = fault === 'live-job'; model.state.holdPipes = fault === 'live-pipes'
    const child = await spawnWindowsOwnedProcess(invocation(), model.api)
    // A monotonic clock fault fixture advances only the already-started forced
    // cleanup interval. It does not claim that any native process was killed.
    const expired = performance.now() + 6000
    const clock = mock.method(performance, 'now', () => expired)
    try {
      await assert.rejects(child.completion, /cleanup could not be verified/, fault)
      await assert.rejects(child.terminate(), /cleanup could not be verified/, fault)
      assert.equal(model.handles.size, 0, fault)
    } finally { clock.mock.restore(); await child.terminate().catch(() => {}) }
  }
})

test('Windows pipe read failure preserves the operation error even when later settlement is verified', async () => {
  const model = nativeModel(); model.state.fail = 'read'
  const child = await spawnWindowsOwnedProcess(invocation(), model.api)
  try {
    await assert.rejects(child.completion, /ReadFile failed/)
    await child.terminate(); assert.equal(model.handles.size, 0)
  } finally { await child.terminate() }
})

test('Windows abort before and during creation cannot strand ownership', async () => {
  for (const before of [true, false]) {
    const model = nativeModel(); model.state.rootExited = false
    const controller = new AbortController()
    if (before) controller.abort()
    else {
      const create = model.api.createProcessW
      model.api.createProcessW = (...args) => { const result = create(...args); controller.abort(); return result }
    }
    if (before) await assert.rejects(spawnWindowsOwnedProcess({ ...invocation(), signal: controller.signal }, model.api), /cancelled/)
    else {
      const child = await spawnWindowsOwnedProcess({ ...invocation(), signal: controller.signal }, model.api)
      try { await assert.rejects(child.completion, /cancelled/) } finally { await child.terminate() }
    }
    assert.equal(model.state.created, before ? 0 : 1); assert.equal(model.handles.size, 0)
  }
  const model = nativeModel()
  await assert.rejects(spawnWindowsOwnedProcess({ ...invocation(), maxOutputBytes: Infinity }, model.api), /Invalid/)
  assert.equal(model.state.created, 0); assert.equal(model.handles.size, 0)
})

test('Windows cancellation while descendants drain cannot become normal-exit success', async () => {
  const model = nativeModel(); model.state.holdJob = true
  const controller = new AbortController()
  const child = await spawnWindowsOwnedProcess({ ...invocation(), signal: controller.signal }, model.api)
  try {
    controller.abort(); model.state.active = 0
    await assert.rejects(child.completion, /cancelled/)
    await child.terminate(); assert.equal(model.handles.size, 0)
  } finally { await child.terminate() }
})

test('Windows failed handle release cannot become a successful spawn or settlement', async () => {
  const model = nativeModel(); model.state.fail = 'closeHandle'
  await assert.rejects(spawnWindowsOwnedProcess(invocation(), model.api), /cleanup could not be verified/)
  assert.equal(model.closeAttempts.length, 11, 'Job, port, six pipes, root, thread and descendant each receive one release attempt')
  assert.equal(model.handles.size, 11, 'failed closes are not modeled as released handles')
})

test('Windows selective early thread-close failure remains cleanup-unverified after every other handle settles', async () => {
  const model = nativeModel(); model.state.fail = 'threadClose'
  await assert.rejects(spawnWindowsOwnedProcess(invocation(), model.api), /cleanup could not be verified/)
  assert.equal(model.closeAttempts.length, 11)
  assert.deepEqual([...model.handles], [3n], 'unreleased simulated thread handle remains uncertain, not successful cleanup')
  assert.equal(model.state.active, 0)
})
