import assert from 'node:assert/strict'
import test from 'node:test'
import { createLauncherTerminal, LAUNCHER_TERMINALS, type LauncherTerminalEffects } from '../src/launcher-terminal.ts'
import type { LauncherActionRecord, LauncherInternalResultItem } from '../src/launcher-actions.ts'

function record(item: LauncherInternalResultItem): LauncherActionRecord {
  return Object.freeze({
    actionId: 'launcher-action:test',
    argument: item.defaultAction.argument,
    expiresAt: Date.now() + 30_000,
    handlerKey: item.defaultAction.handlerKey,
    hideWindowAfterInvocation: item.defaultAction.hideWindowAfterInvocation === true,
    owner: Object.freeze({ role: 'launcher' as const, webContentsId: 7 }),
    requiresConfirmation: item.defaultAction.requiresConfirmation === true,
    resultSetId: 'launcher-results:1',
    sourceExtension: item.sourceExtension,
  })
}

function harness(settings: Record<string, unknown> = {}) {
  const calls: { audit: unknown[]; confirm: unknown[]; launch: unknown[] } = { audit: [], confirm: [], launch: [] }
  const effects: LauncherTerminalEffects = {
    auditLaunch: async value => { calls.audit.push(value) },
    confirmLaunch: async value => { calls.confirm.push(value); return true },
    launchTerminal: async value => { calls.launch.push(value) },
  }
  const provider = createLauncherTerminal({
    captureHomeIdentity: async () => ({ dev: '1', ino: '2' }),
    effects,
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(key: string, fallback: T): T => Object.hasOwn(settings, key) ? settings[key] as T : fallback,
    homeIdentity: { dev: '1', ino: '2' },
    homePath: '/Users/max',
    platform: 'macOS',
  })
  return { calls, provider }
}

test('Terminal Launcher rejects unknown platform authority instead of treating it as Linux', () => {
  assert.throws(() => createLauncherTerminal({
    effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => {} },
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(_key: string, fallback: T): T => fallback,
    homeIdentity: undefined,
    homePath: '/tmp',
    platform: 'Solaris' as never,
  }), /unsupported/iu)
})

test('Terminal Launcher preserves the finite catalog and platform defaults', () => {
  assert.deepEqual(LAUNCHER_TERMINALS.Linux, [])
  assert.deepEqual(LAUNCHER_TERMINALS.macOS.map(item => [item.id, item.name, item.isEnabledByDefault, item.assetKey]), [
    ['Terminal', 'Terminal', true, 'terminal-macos'], ['iTerm', 'iTerm', false, 'terminal-iterm'],
  ])
  assert.deepEqual(LAUNCHER_TERMINALS.Windows.map(item => [item.id, item.name, item.isEnabledByDefault, item.assetKey]), [
    ['Command Prompt', 'Command Prompt', true, 'terminal-command-prompt'],
    ['Powershell', 'Powershell', false, 'terminal-powershell'],
    ['Powershell Core', 'Powershell Core', false, 'terminal-powershell-core'],
    ['WSL', 'WSL', false, 'terminal-wsl'],
  ])
})

test('Terminal Launcher extracts with slice and trim, preserving no-separator commands and public details', async () => {
  const { provider } = harness({
    'extension[TerminalLauncher].prefix': 'run:',
    'extension[TerminalLauncher].terminalIds': ['iTerm'],
  })
  const result = await provider.searchInstant('run:printf "a b"')
  assert.equal(result.before.length, 0)
  assert.equal(result.after.length, 1)
  assert.deepEqual(result.after[0], {
    defaultAction: {
      argument: result.after[0]!.defaultAction.argument,
      description: 'Launch command in iTerm',
      handlerKey: 'launch-terminal-command',
      hideWindowAfterInvocation: true,
      requiresConfirmation: true,
    },
    description: 'Launch in iTerm',
    details: 'Terminal: iTerm\nWorking directory: /Users/max\nApproval: Always required',
    id: '[TerminalLauncher][instantSearchResultItem][iTerm]',
    imageKey: 'terminal-iterm',
    name: 'printf "a b"',
    sourceExtension: 'TerminalLauncher',
  })
  assert.deepEqual(JSON.parse(result.after[0]!.defaultAction.argument), {
    command: 'printf "a b"',
    kind: 'terminal-command',
    terminalId: 'iTerm',
    version: 1,
    workingDirectory: '/Users/max',
  })
})

test('Terminal Launcher never lazily replaces an unavailable startup home identity', async () => {
  let captures = 0
  const provider = createLauncherTerminal({
    captureHomeIdentity: async () => { captures += 1; return { dev: '9', ino: '9' } },
    effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => {} },
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(_key: string, fallback: T): T => fallback,
    homePath: '/Users/max',
    homeIdentity: undefined,
    platform: 'macOS',
  })
  assert.deepEqual(await provider.searchInstant('> replacement'), { after: [], before: [] })
  assert.equal(captures, 0)
  await provider.close()
})

test('Terminal Launcher publishes only the latest concurrent query action map', async () => {
  const identity = { dev: '1', ino: '2' }
  const provider = createLauncherTerminal({
    captureHomeIdentity: async () => identity,
    effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => {} },
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(_key: string, fallback: T): T => fallback,
    homePath: '/Users/max',
    homeIdentity: identity,
    platform: 'macOS',
  })
  const [first, latest] = await Promise.all([provider.searchInstant('> first'), provider.searchInstant('> latest')])
  assert.equal(first.after[0]?.name, 'first')
  assert.equal(latest.after[0]?.name, 'latest')
  await assert.rejects(provider.executeAction(record(first.after[0]!)), /current|stale/u)
  assert.equal(await provider.executeAction(record(latest.after[0]!)), true)
  await provider.close()
})

test('Terminal Launcher rejects malformed or oversized commands and unsupported Linux', async () => {
  const { provider } = harness()
  for (const value of ['>', '>   ', `>${'x'.repeat(513)}`, '>bad\0value', '>bad\rvalue', '>bad\nvalue']) {
    assert.deepEqual(await provider.searchInstant(value), { after: [], before: [] })
  }
  const linux = createLauncherTerminal({
    effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => {} },
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(_key: string, fallback: T): T => fallback,
    homeIdentity: undefined,
    homePath: '/home/max',
    platform: 'Linux',
  })
  assert.deepEqual(await linux.searchInstant('> echo nope'), { after: [], before: [] })
})

test('Terminal Launcher validates persisted terminal IDs as a complete array before platform filtering', async () => {
  for (const configured of [['iTerm', 'iTerm'], ['iTerm', 'Unknown Terminal']]) {
    const provider = createLauncherTerminal({
      effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => {} },
      enabledExtensionIds: () => ['TerminalLauncher'],
      getSetting: <T>(key: string, fallback: T): T => key.endsWith('terminalIds') ? configured as T : fallback,
      homePath: '/Users/max',
      homeIdentity: { dev: '1', ino: '2' },
      platform: 'macOS',
    })
    assert.deepEqual((await provider.searchInstant('> defaults')).after.map(item => item.imageKey), ['terminal-macos'])
    await provider.close()
  }
  const valid = createLauncherTerminal({
    effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => {} },
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(key: string, fallback: T): T => key.endsWith('terminalIds') ? ['iTerm'] as T : fallback,
    homePath: '/Users/max',
    homeIdentity: { dev: '1', ino: '2' },
    platform: 'macOS',
  })
  assert.deepEqual((await valid.searchInstant('> valid')).after.map(item => item.imageKey), ['terminal-iterm'])
  await valid.close()
})

test('Terminal Launcher filters cross-platform settings without granting foreign terminal IDs', async () => {
  const provider = createLauncherTerminal({
    effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => {} },
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(key: string, fallback: T): T => key.endsWith('terminalIds') ? ['Terminal', 'Command Prompt'] as T : fallback,
    homeIdentity: { dev: '1', ino: '2' },
    homePath: 'C:\\Users\\max',
    platform: 'Windows',
  })
  const result = await provider.searchInstant('> whoami')
  assert.deepEqual(result.after.map(item => item.name), ['whoami'])
  assert.deepEqual(result.after.map(item => item.imageKey), ['terminal-command-prompt'])
})

test('Terminal Launcher requires native confirmation and audits without losing command data to process authority', async () => {
  const { calls, provider } = harness({ 'extension[TerminalLauncher].terminalIds': ['Terminal'] })
  const item = (await provider.searchInstant('> echo secret & whoami')).after[0]!
  assert.equal(await provider.executeAction(record(item)), true)
  assert.deepEqual(calls.confirm, [{ command: 'echo secret & whoami', terminalId: 'Terminal', terminalName: 'Terminal', workingDirectory: '/Users/max' }])
  assert.deepEqual(calls.launch, [{ command: 'echo secret & whoami', terminalId: 'Terminal', workingDirectory: '/Users/max' }])
  assert.equal(calls.audit.length, 1)
  assert.deepEqual(calls.audit[0], {
    commandLength: 'echo secret & whoami'.length,
    commandSha256: (calls.audit[0] as { commandSha256: string }).commandSha256,
    outcome: 'launched',
    terminalId: 'Terminal',
    workingDirectory: '/Users/max',
  })
  assert.match((calls.audit[0] as { commandSha256: string }).commandSha256, /^[a-f0-9]{64}$/u)
  assert.doesNotMatch(JSON.stringify(calls.audit), /secret/u)
})

test('Terminal Launcher rejects stale actions after a newer query and denied confirmation does not launch', async () => {
  let approved = false
  const launches: string[] = []
  const effects: LauncherTerminalEffects = {
    auditLaunch: () => {},
    confirmLaunch: async () => approved,
    launchTerminal: request => { launches.push(request.command) },
  }
  const provider = createLauncherTerminal({
    captureHomeIdentity: async () => ({ dev: '1', ino: '2' }),
    effects,
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(_key: string, fallback: T): T => fallback,
    homeIdentity: { dev: '1', ino: '2' },
    homePath: '/Users/max',
    platform: 'macOS',
  })
  const first = (await provider.searchInstant('> first')).after[0]!
  await provider.searchInstant('> second')
  await assert.rejects(provider.executeAction(record(first)), /current|stale/u)
  const second = (await provider.searchInstant('> second')).after[0]!
  assert.equal(await provider.executeAction(record(second)), true)
  assert.deepEqual(launches, [])
  approved = true
  const third = (await provider.searchInstant('> third')).after[0]!
  assert.equal(await provider.executeAction(record(third)), true)
  assert.deepEqual(launches, ['third'])
})

test('Terminal Launcher revalidates the fixed main-owned home before confirmation and effect', async () => {
  let currentHome = '/Users/max'
  let currentIdentity = { dev: '1', ino: '2' }
  let validations = 0
  let launches = 0
  const provider = createLauncherTerminal({
    effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => { launches += 1 } },
    enabledExtensionIds: () => ['TerminalLauncher'],
    captureHomeIdentity: async () => currentIdentity,
    getHomePath: () => currentHome,
    getSetting: <T>(_key: string, fallback: T): T => fallback,
    homeIdentity: currentIdentity,
    homePath: '/Users/max',
    validateWorkingDirectory: async () => { validations += 1; return true },
    platform: 'macOS',
  })
  const item = (await provider.searchInstant('> gated')).after[0]!
  currentIdentity = { dev: '3', ino: '4' }
  await assert.rejects(provider.executeAction(record(item)), /stale|canceled/u)
  assert.equal(validations, 0)
  assert.equal(launches, 0)
  await provider.close()
})

test('Terminal Launcher rechecks extension enablement before an approved effect', async () => {
  let enabled = true
  let launches = 0
  const provider = createLauncherTerminal({
    captureHomeIdentity: async () => ({ dev: '1', ino: '2' }),
    effects: { auditLaunch: () => {}, confirmLaunch: async () => true, launchTerminal: () => { launches += 1 } },
    enabledExtensionIds: () => enabled ? ['TerminalLauncher'] : [],
    getSetting: <T>(_key: string, fallback: T): T => fallback,
    homeIdentity: { dev: '1', ino: '2' },
    homePath: '/Users/max',
    platform: 'macOS',
  })
  const item = (await provider.searchInstant('> gated')).after[0]!
  enabled = false
  await assert.rejects(provider.executeAction(record(item)), /stale|current/u)
  assert.equal(launches, 0)
  await provider.close()
})

test('Terminal Launcher cancels a pending confirmation on invalidation', async () => {
  let release!: (value: boolean) => void
  let confirmationSignal: AbortSignal | undefined
  const provider = createLauncherTerminal({
    effects: {
      auditLaunch: () => {},
      confirmLaunch: async (_request, signal) => {
        confirmationSignal = signal
        return await new Promise<boolean>(resolve => { release = resolve })
      },
      launchTerminal: () => {},
    },
    captureHomeIdentity: async () => ({ dev: '1', ino: '2' }),
    enabledExtensionIds: () => ['TerminalLauncher'],
    getSetting: <T>(_key: string, fallback: T): T => fallback,
    homeIdentity: { dev: '1', ino: '2' },
    homePath: '/Users/max',
    platform: 'macOS',
  })
  const item = (await provider.searchInstant('> delayed')).after[0]!
  const pending = provider.executeAction(record(item))
  await new Promise<void>(resolve => setImmediate(resolve))
  provider.invalidate('owner-cleared')
  assert.equal(confirmationSignal?.aborted, true)
  release(true)
  await assert.rejects(pending, /canceled|stale/u)
  await provider.close()
})

test('Terminal Launcher rejects action argument tampering and honors close', async () => {
  const { provider } = harness()
  const item = (await provider.searchInstant('> pwd')).after[0]!
  await assert.rejects(provider.executeAction({ ...record(item), argument: JSON.stringify({ command: 'rm -rf /', kind: 'terminal-command', terminalId: 'Terminal', version: 1, workingDirectory: '/Users/max' }) }), /current|catalog/u)
  await provider.close()
  assert.deepEqual(await provider.searchInstant('> after close'), { after: [], before: [] })
  await assert.rejects(provider.executeAction(record(item)), /closed/u)
})
