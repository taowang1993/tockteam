import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { captureLauncherWorkflowPath, createLauncherWorkflow, type LauncherWorkflow, type LauncherWorkflowEffects } from '../src/launcher-workflow.ts'
import type { LauncherActionRecord } from '../src/launcher-actions.ts'

const OWNER = Object.freeze({ role: 'launcher' as const, webContentsId: 41 })
const HOME = Object.freeze({ dev: '1', ino: '2' })
const FILE = Object.freeze({ canonicalPath: '/Users/max/report.txt', identity: Object.freeze({ dev: '3', ino: '4' }), kind: 'file' as const })
const WORKFLOW: LauncherWorkflow = Object.freeze({
  actions: Object.freeze([
    Object.freeze({ args: Object.freeze({ filePath: '/Users/max/report.txt' }), handlerId: 'OpenFile' as const, id: 'file', name: 'Open report' }),
    Object.freeze({ args: Object.freeze({ url: 'https://example.com/status' }), handlerId: 'OpenUrl' as const, id: 'url', name: 'Open status' }),
    Object.freeze({ args: Object.freeze({ command: 'printf ok', terminalId: 'Terminal' as const }), handlerId: 'OpenTerminal' as const, id: 'terminal', name: 'Open terminal' }),
    Object.freeze({ args: Object.freeze({ command: 'printf secret-token' }), handlerId: 'ExecuteCommand' as const, id: 'command', name: 'Run command' }),
  ]),
  id: 'release-check',
  name: 'Release check',
  requiresConfirmation: false,
})

function record(argument: string, actionId = 'launcher-action:workflow'): LauncherActionRecord {
  return Object.freeze({ actionId, argument, expiresAt: 10_000, handlerKey: 'invoke-workflow', hideWindowAfterInvocation: true, owner: OWNER, requiresConfirmation: true, resultSetId: 'launcher-results:1', sourceExtension: 'Workflow' })
}

function harness(workflows: unknown = [WORKFLOW]) {
  const events: string[] = []
  const effects: LauncherWorkflowEffects = {
    auditWorkflow: async audit => { events.push(`audit:${audit.outcome}`) },
    confirmAction: async request => { events.push(`confirm:${request.actionType}`); return true },
    executeCommand: async () => { events.push('execute-command'); return { stderrBytes: 0, stdoutBytes: 3 } },
    openFile: async target => { events.push(`file:${target}`) },
    openTerminal: async request => { events.push(`terminal:${request.command}`) },
    openUrl: async target => { events.push(`url:${target}`) },
  }
  const provider = createLauncherWorkflow({
    captureHomeIdentity: async () => HOME,
    capturePath: async () => FILE,
    effects,
    enabledExtensionIds: () => ['Workflow'],
    getSetting: (_key, fallback) => workflows as unknown as typeof fallback,
    homeIdentity: HOME,
    homePath: '/Users/max',
    platform: 'macOS',
    revalidatePath: async (_target, expected) => expected.canonicalPath === FILE.canonicalPath && expected.identity.dev === FILE.identity.dev && expected.identity.ino === FILE.identity.ino && expected.kind === FILE.kind,
  })
  return { effects, events, provider }
}

test('Workflow path capture rejects symlink components, dot escapes, and special targets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tockteam-workflow-path-'))
  try {
    await mkdir(path.join(root, 'safe'))
    await writeFile(path.join(root, 'safe', 'file.txt'), 'fixture')
    assert.equal((await captureLauncherWorkflowPath(path.join(root, 'safe', 'file.txt'), 'macOS'))?.kind, 'file')
    assert.equal(await captureLauncherWorkflowPath(`${root}/safe/../safe/file.txt`, 'macOS'), undefined)
    await symlink(path.join(root, 'safe'), path.join(root, 'link'))
    assert.equal(await captureLauncherWorkflowPath(path.join(root, 'link', 'file.txt'), 'macOS'), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Workflow provider publishes ordered digest-token results without nested authority', async () => {
  const { provider } = harness()
  const items = await provider.loadIndexedItems()
  assert.equal(items.length, 1)
  assert.match(items[0]!.defaultAction.argument, /workflowSha256/u)
  assert.deepEqual(items[0], {
    defaultAction: {
      argument: items[0]!.defaultAction.argument,
      description: 'Invoke workflow', handlerKey: 'invoke-workflow', hideWindowAfterInvocation: true, requiresConfirmation: true,
    },
    description: 'Workflow', details: 'Open report, Open status, Open terminal, Run command', id: 'release-check', imageKey: 'workflow', name: 'Release check', sourceExtension: 'Workflow',
  })
  const serialized = JSON.stringify(items)
  assert.doesNotMatch(serialized, /report\.txt|example\.com|secret-token|printf ok/u)
  assert.match(items[0]!.defaultAction.argument, /^\{"kind":"workflow","version":1,"workflowId":"release-check","workflowSha256":"[a-f0-9]{64}"\}$/u)
})

test('Workflow approves all actions before effects and then executes sequentially', async () => {
  const { events, provider } = harness()
  const item = (await provider.loadIndexedItems())[0]!
  await assert.doesNotReject(provider.executeAction(record(item.defaultAction.argument)))
  assert.deepEqual(events, ['confirm:OpenFile', 'confirm:OpenUrl', 'confirm:OpenTerminal', 'confirm:ExecuteCommand', 'file:/Users/max/report.txt', 'url:https://example.com/status', 'terminal:printf ok', 'execute-command', 'audit:completed'])
})

test('Workflow stops sequential effects at the first failure and audits failed', async () => {
  const events: string[] = []
  const effects: LauncherWorkflowEffects = {
    auditWorkflow: async audit => { events.push(`audit:${audit.outcome}`) },
    confirmAction: async () => true,
    executeCommand: async () => { events.push('execute-command'); return { stderrBytes: 0, stdoutBytes: 0 } },
    openFile: async () => { events.push('file') },
    openTerminal: async () => { events.push('terminal') },
    openUrl: async () => { events.push('url'); throw new Error('fixture failure') },
  }
  const provider = createLauncherWorkflow({
    captureHomeIdentity: async () => HOME,
    capturePath: async () => FILE,
    effects,
    enabledExtensionIds: () => ['Workflow'],
    getSetting: (_key, fallback) => [WORKFLOW] as unknown as typeof fallback,
    homeIdentity: HOME,
    homePath: '/Users/max',
    platform: 'macOS',
    revalidatePath: async () => true,
  })
  const item = (await provider.loadIndexedItems())[0]!
  await assert.rejects(provider.executeAction(record(item.defaultAction.argument)), /fixture failure/u)
  assert.deepEqual(events, ['file', 'url', 'audit:failed'])
  assert.equal(events.includes('terminal'), false)
  assert.equal(events.includes('execute-command'), false)
})

test('Workflow denial leaves every effect untouched and audits denied', async () => {
  const events: string[] = []
  let deny = false
  const effects: LauncherWorkflowEffects = {
    auditWorkflow: async audit => { events.push(`audit:${audit.outcome}`) },
    confirmAction: async request => { events.push(`confirm:${request.actionType}`); return !deny && (deny = request.actionType === 'OpenUrl') === false },
    executeCommand: async () => { events.push('execute-command'); return { stderrBytes: 0, stdoutBytes: 3 } },
    openFile: async target => { events.push(`file:${target}`) },
    openTerminal: async request => { events.push(`terminal:${request.command}`) },
    openUrl: async target => { events.push(`url:${target}`) },
  }
  const provider = createLauncherWorkflow({
    captureHomeIdentity: async () => HOME,
    capturePath: async () => FILE,
    effects,
    enabledExtensionIds: () => ['Workflow'],
    getSetting: (_key, fallback) => [WORKFLOW] as unknown as typeof fallback,
    homeIdentity: HOME,
    homePath: '/Users/max',
    platform: 'macOS',
    revalidatePath: async () => true,
  })
  const item = (await provider.loadIndexedItems())[0]!
  await assert.doesNotReject(provider.executeAction(record(item.defaultAction.argument)))
  assert.equal(events.at(-1), 'audit:denied')
  assert.equal(events.some(event => /^(file|url|terminal|execute-command):?/u.test(event)), false)
})

test('Workflow revalidates an exact file target after approval before opening it', async () => {
  let validations = 0
  let opened = false
  const effects: LauncherWorkflowEffects = {
    auditWorkflow: async () => undefined,
    confirmAction: async () => true,
    openFile: async () => { opened = true },
    openTerminal: async () => undefined,
    openUrl: async () => undefined,
  }
  const fileWorkflow: LauncherWorkflow = { ...WORKFLOW, actions: [WORKFLOW.actions[0]!] }
  const provider = createLauncherWorkflow({
    capturePath: async () => FILE,
    effects,
    enabledExtensionIds: () => ['Workflow'],
    getSetting: (_key, fallback) => [fileWorkflow] as unknown as typeof fallback,
    homePath: '/Users/max',
    platform: 'macOS',
    revalidatePath: async () => { validations += 1; return validations === 1 },
  })
  const item = (await provider.loadIndexedItems())[0]!
  await assert.rejects(provider.executeAction(record(item.defaultAction.argument)), /file target changed/u)
  assert.equal(opened, false)
  assert.equal(validations >= 2, true)
})

test('Workflow rejects changed definitions and stale/replayed tokens', async () => {
  let workflows: unknown = [WORKFLOW]
  const effects: LauncherWorkflowEffects = {
    auditWorkflow: async () => undefined,
    confirmAction: async () => true,
    executeCommand: async () => ({ stderrBytes: 0, stdoutBytes: 0 }),
    openFile: async () => undefined,
    openTerminal: async () => undefined,
    openUrl: async () => undefined,
  }
  const provider = createLauncherWorkflow({
    captureHomeIdentity: async () => HOME,
    capturePath: async () => FILE,
    effects,
    enabledExtensionIds: () => ['Workflow'],
    getSetting: (_key, fallback) => workflows as unknown as typeof fallback,
    homeIdentity: HOME,
    homePath: '/Users/max',
    platform: 'macOS',
    revalidatePath: async () => true,
  })
  const item = (await provider.loadIndexedItems())[0]!
  workflows = [{ ...WORKFLOW, name: 'Changed' }]
  await assert.rejects(provider.executeAction(record(item.defaultAction.argument)), /stale|current main-owned/u)
  provider.invalidate('test')
  await assert.rejects(provider.executeAction(record(item.defaultAction.argument)), /current main-owned|stale/u)
})

test('Workflow cancellation waits for the command effect and records cancellation', async () => {
  let release: (() => void) | undefined
  const events: string[] = []
  const effects: LauncherWorkflowEffects = {
    auditWorkflow: async audit => { events.push(`audit:${audit.outcome}`) },
    confirmAction: async () => true,
    executeCommand: async ({ signal }) => await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => { release = () => reject(signal.reason) }, { once: true })
    }),
    openFile: async () => undefined,
    openTerminal: async () => undefined,
    openUrl: async () => undefined,
  }
  const workflow = { ...WORKFLOW, actions: [WORKFLOW.actions[3]!] }
  const provider = createLauncherWorkflow({
    captureHomeIdentity: async () => HOME,
    effects,
    enabledExtensionIds: () => ['Workflow'],
    getSetting: (_key, fallback) => [workflow] as unknown as typeof fallback,
    homeIdentity: HOME,
    homePath: '/Users/max',
    platform: 'macOS',
  })
  const item = (await provider.loadIndexedItems())[0]!
  const pending = provider.executeAction(record(item.defaultAction.argument))
  await new Promise(resolve => setImmediate(resolve))
  const cancellation = provider.cancelAction(record(item.defaultAction.argument))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(typeof release, 'function')
  release!()
  assert.equal(await cancellation, true)
  await assert.rejects(pending, /canceled/i)
  assert.deepEqual(events, ['audit:cancelled'])
})
