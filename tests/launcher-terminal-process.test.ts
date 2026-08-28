import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { launchDetachedTerminalInvocation, resolveTerminalInvocation } from '../src/launcher-terminal-process.ts'

test('Terminal Launcher keeps macOS scripts static and sends command then fixed home as argv data', () => {
  const command = `printf '"'; touch /tmp/should-not-run`
  const invocation = resolveTerminalInvocation('macOS', { command, terminalId: 'Terminal', workingDirectory: '/Users/max' })
  assert.equal(invocation.executable, '/usr/bin/osascript')
  assert.deepEqual(invocation.args.slice(0, 3), ['-e', invocation.args[1], '--'])
  assert.equal(invocation.args.at(-2), command)
  assert.equal(invocation.args.at(-1), '/Users/max')
  assert.ok(!invocation.args[1]!.includes(command))
  assert.match(invocation.args[1]!, /on run argv/u)
  const iterm = resolveTerminalInvocation('macOS', { command: 'echo hi', terminalId: 'iTerm', workingDirectory: '/Users/max' })
  assert.match(iterm.args[1]!, /write text "cd /u)
})

test('Terminal Launcher uses exact fixed Windows logical executables and argv', () => {
  assert.deepEqual(resolveTerminalInvocation('Windows', { command: 'echo hello & whoami', terminalId: 'Command Prompt', workingDirectory: 'C:\\Users\\max' }), {
    args: ['/D', '/K', 'echo hello & whoami'], cwd: 'C:\\Users\\max', executable: 'cmd.exe', waitForExit: false,
  })
  assert.deepEqual(resolveTerminalInvocation('Windows', { command: 'Get-Location', terminalId: 'Powershell', workingDirectory: 'C:\\Users\\max' }).args, ['-NoLogo', '-NoProfile', '-NoExit', '-Command', 'Get-Location'])
  assert.deepEqual(resolveTerminalInvocation('Windows', { command: 'Get-Location', terminalId: 'Powershell Core', workingDirectory: 'C:\\Users\\max' }).args, ['-NoLogo', '-NoProfile', '-NoExit', '-Command', 'Get-Location'])
  assert.deepEqual(resolveTerminalInvocation('Windows', { command: 'echo hi', terminalId: 'WSL', workingDirectory: 'C:\\Users\\max' }).args, ['--cd', 'C:\\Users\\max', 'sh', '-lc', 'echo hi; exec "$SHELL"'])
  assert.throws(() => resolveTerminalInvocation('Windows', { command: 'echo hi', terminalId: 'Terminal', workingDirectory: 'C:\\Users\\max' }), /terminal/u)
  assert.throws(() => resolveTerminalInvocation('Linux', { command: 'echo hi', terminalId: 'Terminal', workingDirectory: '/home/max' }), /unsupported/u)
})

test('Terminal Launcher detached process startup is bounded, shell-free, and unrefs after spawn', async () => {
  const child = new EventEmitter() as EventEmitter & { kill: () => void; unref: () => void }
  child.kill = () => { /* test child */ }
  let unref = false
  child.unref = () => { unref = true }
  const calls: unknown[] = []
  const pending = launchDetachedTerminalInvocation({ args: ['/D', '/K', 'echo hi'], cwd: 'C:\\Users\\max', executable: 'cmd.exe', waitForExit: false }, {
    spawnProcess: (executable, args, options) => { calls.push([executable, args, options]); return child },
  })
  child.emit('spawn')
  await pending
  assert.deepEqual(calls, [['cmd.exe', ['/D', '/K', 'echo hi'], { cwd: 'C:\\Users\\max', detached: true, shell: false, stdio: 'ignore', windowsHide: false }]])
  assert.equal(unref, true)
})

test('Terminal Launcher rejects malformed request bounds', () => {
  assert.throws(() => resolveTerminalInvocation('macOS', { command: 'x'.repeat(513), terminalId: 'Terminal', workingDirectory: '/Users/max' }), /invalid/i)
  assert.throws(() => resolveTerminalInvocation('macOS', { command: 'x\n', terminalId: 'Terminal', workingDirectory: '/Users/max' }), /invalid/i)
  assert.throws(() => resolveTerminalInvocation('macOS', { command: 'x', terminalId: 'Terminal', workingDirectory: 'relative' }), /invalid/i)
})
