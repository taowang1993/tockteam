import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mock, test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnOwnedProcess, type OwnedProcess } from '../src/owned-process.ts'
import { adoptSearchIndex, retireSearchIndex, awaitSearchIndexSettlement } from '../src/search-index-ownership.ts'

const base = () => ({ executable: process.execPath, cwd: process.cwd(), env: { ...process.env }, signal: new AbortController().signal })

// Test diagnostics only: production deliberately does not infer group settlement
// from /proc. Containers with a non-reaping PID 1 can retain killed fixtures.
async function linuxFixtureStopped(pid: number): Promise<boolean> {
  if (process.platform !== 'linux') return false
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z ')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
}

test('POSIX launch admission waits or cancels before creating its owned child', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'owned-admission-'))
  try {
    for (const cancel of [false, true]) {
      const held = Promise.withResolvers<void>(), controller = new AbortController()
      const blocker = { close: () => held.promise }
      adoptSearchIndex(blocker)
      const blocked = retireSearchIndex(blocker)
      const marker = join(directory, String(cancel))
      let admitted = false, dispatched = false
      const pending = spawnOwnedProcess({ ...base(), signal: controller.signal,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'created')`],
        admit: async launch => {
          admitted = true
          let child: Promise<OwnedProcess> | undefined
          await awaitSearchIndexSettlement(() => { dispatched = true; child = launch() }, controller.signal)
          return child!
        },
      })
      void pending.catch(() => {})
      try {
        assert.equal(admitted, true)
        assert.equal(dispatched, false)
        await assert.rejects(readFile(marker), { code: 'ENOENT' })
        if (cancel) {
          controller.abort()
          await assert.rejects(pending, { name: 'AbortError' })
          assert.equal(dispatched, false)
        } else {
          held.resolve()
          const child = await pending
          await child.completion
          assert.equal(await readFile(marker, 'utf8'), 'created')
          assert.throws(() => process.kill(-child.pid, 0), { code: 'ESRCH' })
        }
      } finally { held.resolve(); await blocked; const child = await pending.catch(() => undefined); await child?.terminate() }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('owned child reports output and verifies exit before completion', { skip: process.platform === 'win32' }, async () => {
  const child = await spawnOwnedProcess({ ...base(), args: ['-e', 'process.stdout.write("hello");process.stderr.write("error");'] })
  try {
    assert.deepEqual(await child.completion, { code: 0, signal: null, stdoutBytes: 5, stderrBytes: 5 })
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
  } finally { await child.terminate() }
})

test('owned child cancellation is idempotent and verifies process exit', { skip: process.platform === 'win32' }, async () => {
  const controller = new AbortController()
  const child = await spawnOwnedProcess({ ...base(), signal: controller.signal, args: ['-e', 'setInterval(()=>{},1000)'] })
  try {
    controller.abort()
    await assert.rejects(child.completion, /cancelled/)
    await Promise.all([child.terminate(), child.terminate()])
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
  } finally { await child.terminate() }
})

test('owned child output overflow is bounded and still cleans up', { skip: process.platform === 'win32' }, async () => {
  const child = await spawnOwnedProcess({ ...base(), maxOutputBytes: 100, args: ['-e', 'setInterval(()=>process.stdout.write("x".repeat(1024)),1)'] })
  try {
    await assert.rejects(child.completion, /output limit/)
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
  } finally { await child.terminate() }
})

test('normal root exit drains its descendant or explicitly rejects unverifiable Linux settlement', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-owned-process-'))
  const pidFile = join(directory, 'descendant.pid')
  const descendant = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.send('ready');process.disconnect();setInterval(()=>{},1000)`
  const script = `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','ignore','ignore','ipc']});child.once('message',()=>process.exit(0))`
  const child = await spawnOwnedProcess({ ...base(), args: ['-e', script] })
  let pid: number | undefined
  let conservativeLinuxRejection = false
  try {
    const result = await child.completion.then(value => ({ value }), (error: Error) => ({ error }))
    pid = Number(await readFile(pidFile, 'utf8'))
    assert.ok(Number.isSafeInteger(pid) && pid > 0)
    if ('error' in result) {
      assert.equal(process.platform, 'linux')
      assert.match(result.error.message, /cleanup could not be verified/)
      assert.equal(await linuxFixtureStopped(pid), true, 'a live descendant is never an acceptable outcome')
      assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
      await assert.rejects(child.terminate(), /cleanup could not be verified/)
      conservativeLinuxRejection = true
      t.diagnostic('Conservative rejection: Linux group disappearance was not verified; this is not successful settlement.')
    } else {
      assert.equal(result.value.code, 0)
      assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' })
      assert.throws(() => process.kill(-child.pid, 0), { code: 'ESRCH' })
    }
  } finally {
    try { await child.terminate().catch(error => { if (!conservativeLinuxRejection) throw error }) } finally {
      pid ??= Number(await readFile(pidFile, 'utf8').catch(() => '0'))
      if (pid > 0) { try { process.kill(pid, 'SIGKILL') } catch {} }
      await rm(directory, { recursive: true, force: true })
    }
  }
})

test('owned child spawn failures release their handles', { skip: process.platform === 'win32' }, async () => {
  await assert.rejects(spawnOwnedProcess({ ...base(), executable: '/tockteam-nonexistent-owned-executable', args: [] }), { code: 'ENOENT' })
})

test('failed forced cleanup is not reported as successful cancellation', { skip: process.platform === 'win32', timeout: 15_000 }, async () => {
  const controller = new AbortController()
  const child = await spawnOwnedProcess({ ...base(), signal: controller.signal, args: ['-e', 'setInterval(()=>{},1000)'] })
  const kill = process.kill.bind(process)
  const mockedKill = mock.method(process, 'kill', (pid: number, signal?: number | NodeJS.Signals) => {
    if (pid === -child.pid && signal === 'SIGKILL') throw Object.assign(new Error('test denied termination'), { code: 'EPERM' })
    return kill(pid, signal)
  })
  try {
    controller.abort()
    await assert.rejects(child.completion, /cleanup could not be verified/)
    await assert.rejects(child.terminate(), /cleanup could not be verified/)
  } finally {
    mockedKill.mock.restore()
    kill(-child.pid, 'SIGKILL')
    const deadline = performance.now() + 5_000
    let gone = false
    while (performance.now() < deadline) {
      try { kill(-child.pid, 0) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { gone = true; break }; if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.equal(gone, true, 'test emergency cleanup stopped the full owned group')
  }
})

for (const fault of ['escaped-pipes', 'denied-termination']) {
  test(`failed verification releases Host resources: ${fault}`, { skip: process.platform === 'win32', timeout: 35_000 }, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'tockteam-owned-failure-'))
    const ownedPidFile = join(directory, 'owned.pid')
    const escapedPidFile = join(directory, 'escaped.pid')
    const escaped = `require('node:fs').writeFileSync(${JSON.stringify(escapedPidFile)},String(process.pid));process.send('ready');process.disconnect();setInterval(()=>{},1000)`
    const root = fault === 'escaped-pipes'
      ? `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(escaped)}],{detached:true,stdio:['ignore','inherit','inherit','ipc']});child.once('message',()=>process.exit(0))`
      : 'setInterval(()=>{},1000)'
    const script = `
      import { writeFileSync } from 'node:fs';
      import { spawnOwnedProcess } from ${JSON.stringify(new URL('../src/owned-process.ts', import.meta.url).href)};
      const controller = new AbortController();
      const child = await spawnOwnedProcess({ executable: process.execPath, args: ['-e', ${JSON.stringify(root)}], cwd: process.cwd(), env: process.env, signal: controller.signal });
      writeFileSync(${JSON.stringify(ownedPidFile)}, String(child.pid));
      if (${JSON.stringify(fault)} === 'denied-termination') {
        const kill = process.kill.bind(process);
        process.kill = (pid, signal) => {
          if (pid === -child.pid && signal === 'SIGKILL') throw Object.assign(new Error('test denied'), { code: 'EPERM' });
          return kill(pid, signal);
        };
        controller.abort();
      }
      try { await child.completion; process.exitCode = 2; }
      catch (error) {
        if (!/cleanup could not be verified/.test(error.message)) throw error;
        try { await child.terminate(); process.exitCode = 3; }
        catch (error) {
          if (!/cleanup could not be verified/.test(error.message)) throw error;
          console.log('cleanup remains unverified');
        }
      }
      // Deliberately no process.exit(): failed-owner handles must not keep this Host alive.
    `
    const host = spawn(process.execPath, ['--input-type=module', '-e', script], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    host.stdout.on('data', chunk => { output = (output + chunk).slice(-16_384) })
    host.stderr.on('data', chunk => { output = (output + chunk).slice(-16_384) })
    let timer: ReturnType<typeof setTimeout> | undefined
    const closed = new Promise<boolean>((resolve, reject) => { host.once('close', () => resolve(true)); host.once('error', reject) })
    try {
      const settled = await Promise.race([closed, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 8_500) })])
      assert.equal(settled, true, `Host retained handles after the forced-verification deadline: ${output}`)
      assert.equal(host.exitCode, 0, output)
      assert.match(output, /cleanup remains unverified/)
    } finally {
      clearTimeout(timer)
      const pids = [host.pid, ...await Promise.all([ownedPidFile, escapedPidFile].map(async file => Number(await readFile(file, 'utf8').catch(() => '0'))))]
      for (const pid of pids) if (pid && pid > 0) { try { process.kill(-pid, 'SIGKILL') } catch (error) { if (!['ESRCH', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error } }
      await closed
      for (const pid of pids) if (pid && pid > 0) {
        let gone = false
        const deadline = performance.now() + 5_000
        while (performance.now() < deadline) {
          try { process.kill(-pid, 0) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { gone = true; break }; if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error }
          await new Promise(resolve => setTimeout(resolve, 20))
        }
        if (!gone && await linuxFixtureStopped(pid)) t.diagnostic(`Fixture ${pid} is stopped, but Linux group disappearance remains unverified.`)
        else assert.equal(gone, true, `test emergency cleanup did not settle group ${pid}`)
      }
      await rm(directory, { recursive: true, force: true })
    }
  })
}

test('public Windows dispatch keeps unverified architectures fail-closed', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const arch = Object.getOwnPropertyDescriptor(process, 'arch')!
  try {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    Object.defineProperty(process, 'arch', { value: 'arm64' })
    await assert.rejects(spawnOwnedProcess({ ...base(), args: [] }), /verified x64 Windows host/)
  } finally {
    Object.defineProperty(process, 'platform', platform)
    Object.defineProperty(process, 'arch', arch)
  }
})

test('owned child rejects cancellation and malformed input before spawning', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(spawnOwnedProcess({ ...base(), args: [], signal: controller.signal }), /cancelled/)
  await assert.rejects(spawnOwnedProcess({ ...base(), args: ['bad\0argument'] }), /Invalid/)
  await assert.rejects(spawnOwnedProcess({ ...base(), args: [], executable: 'node' }), /Invalid/)
  await assert.rejects(spawnOwnedProcess({ ...base(), args: [], maxOutputBytes: Infinity }), /Invalid/)
})
