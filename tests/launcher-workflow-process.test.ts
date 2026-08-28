import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import {
  resolveWorkflowCommandInvocation,
  resolveWorkflowTerminationInvocation,
  runBoundedWorkflowCommand,
} from '../src/launcher-workflow-process.ts'

function childProcess() {
  const child = new EventEmitter() as EventEmitter & {
    kill: (signal?: NodeJS.Signals) => boolean
    pid: number
    stderr: PassThrough
    stdout: PassThrough
  }
  child.kill = () => { queueMicrotask(() => child.emit('close', null, 'SIGKILL')); return true }
  child.pid = 4242
  child.stderr = new PassThrough()
  child.stdout = new PassThrough()
  return child
}

test('Workflow command maps text to fixed shell executable and argv', () => {
  assert.deepEqual(resolveWorkflowCommandInvocation('macOS', "printf '%s' ok", '/Users/max'), {
    args: ['-lc', "printf '%s' ok"], cwd: '/Users/max', executable: '/bin/sh',
  })
  assert.deepEqual(resolveWorkflowCommandInvocation('Linux', 'printf ok', '/home/max'), {
    args: ['-lc', 'printf ok'], cwd: '/home/max', executable: '/bin/sh',
  })
  assert.deepEqual(resolveWorkflowCommandInvocation('Windows', 'echo ok & whoami', 'C:\\Users\\max'), {
    args: ['/D', '/S', '/C', 'echo ok & whoami'], cwd: 'C:\\Users\\max', executable: 'cmd.exe',
  })
  assert.deepEqual(resolveWorkflowTerminationInvocation(4242), { args: ['/PID', '4242', '/T', '/F'], executable: 'taskkill.exe' })
  assert.throws(() => resolveWorkflowCommandInvocation('macOS', 'echo ok\nwhoami', '/Users/max'), /command/i)
})

test('Workflow process uses shell:false, scrubbed environment, fixed cwd, and counts output only', async () => {
  const child = childProcess()
  let received: unknown
  const signal = new AbortController().signal
  const pending = runBoundedWorkflowCommand({
    command: 'printf secret-token', platform: 'macOS', signal, workingDirectory: '/Users/max',
  }, {
    environment: { AGENT_SERVICE_TOKEN: 'secret', CODEX_API_KEY: 'secret', LANG: 'en_US.UTF-8', PATH: '/untrusted' },
    spawnProcess: (executable, args, options) => { received = { executable, args, options }; return child },
  })
  child.stdout.end('secret-token')
  child.stderr.end('warning')
  child.emit('close', 0, null)
  await assert.doesNotReject(pending)
  assert.deepEqual(await pending, { stdoutBytes: 12, stderrBytes: 7 })
  assert.deepEqual(received, {
    executable: '/bin/sh', args: ['-lc', 'printf secret-token'], options: {
      cwd: '/Users/max', detached: true, env: { HOME: '/Users/max', LANG: 'en_US.UTF-8', PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' }, shell: false, signal,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    },
  })
  assert.doesNotMatch(JSON.stringify(await pending), /secret-token/u)
})

test('Workflow process terminates on cancellation, timeout, and output overflow', async () => {
  for (const kind of ['cancel', 'timeout', 'overflow'] as const) {
    const child = childProcess()
    const controller = new AbortController()
    const pending = runBoundedWorkflowCommand({ command: 'sleep 60', platform: 'Linux', signal: controller.signal, workingDirectory: '/home/max' }, {
      maxOutputBytes: 8, spawnProcess: () => child, timeoutMs: kind === 'timeout' ? 1 : 10_000,
    })
    if (kind === 'cancel') controller.abort(new Error('cancelled'))
    if (kind === 'overflow') child.stdout.write('123456789')
    await assert.rejects(pending, kind === 'overflow' ? /output limit/i : /cancel|timed out/i)
  }
})

test('Windows process-tree termination is awaited before reporting failure', async () => {
  const child = childProcess()
  const killer = new EventEmitter() as EventEmitter & { unref: () => void }
  killer.unref = () => undefined
  let called = false
  const pending = runBoundedWorkflowCommand({ command: 'echo lots', platform: 'Windows', signal: new AbortController().signal, workingDirectory: 'C:\\Users\\max' }, {
    maxOutputBytes: 4, spawnProcess: () => child, spawnTerminationProcess: (executable, args, options) => { called = executable === 'taskkill.exe' && args.join(' ') === '/PID 4242 /T /F' && options.shell === false; return killer },
  })
  child.stdout.write('12345')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(called, true)
  killer.emit('close', 0)
  await assert.rejects(pending, /output limit/i)
})

test('Workflow process closes abort race after spawn/listener registration', async () => {
  const child = childProcess()
  const controller = new AbortController()
  const pending = runBoundedWorkflowCommand({ command: 'sleep 60', platform: 'Linux', signal: controller.signal, workingDirectory: '/home/max' }, {
    spawnProcess: () => { controller.abort(new Error('cancelled')); return child },
  })
  await assert.rejects(pending, /cancel/i)
})
