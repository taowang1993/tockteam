import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLauncherWorkflows } from '../src/launcher-workflow-contract.ts'
import { launcherWorkflowDigest, parseLauncherWorkflowToken, serializeLauncherWorkflowToken } from '../src/launcher-workflow.ts'

const WORKFLOW = {
  id: 'release-check',
  name: 'Release check',
  requiresConfirmation: false,
  actions: [
    { id: 'file', handlerId: 'OpenFile', name: 'Open report', args: { filePath: '/tmp/report.txt' } },
    { id: 'url', handlerId: 'OpenUrl', name: 'Open status', args: { url: 'https://example.com/status' } },
    { id: 'terminal', handlerId: 'OpenTerminal', name: 'Open terminal', args: { terminalId: 'Terminal', command: 'pnpm test' } },
    { id: 'command', handlerId: 'ExecuteCommand', name: 'Run command', args: { command: 'printf ok' } },
  ],
} as const

test('Workflow parser accepts the four exact action records and freezes the graph', () => {
  const parsed = parseLauncherWorkflows([WORKFLOW], 'macOS')
  assert.deepEqual(parsed, [WORKFLOW])
  assert.equal(Object.isFrozen(parsed), true)
  assert.equal(Object.isFrozen(parsed[0]), true)
  assert.equal(Object.isFrozen(parsed[0]!.actions), true)
  assert.equal(Object.isFrozen(parsed[0]!.actions[0]!.args), true)
})

test('Workflow parser rejects whole graphs with extra keys, unknown handlers, duplicates, bounds, or foreign terminals', () => {
  const invalid = [
    [{ ...WORKFLOW, extra: true }],
    [{ ...WORKFLOW, actions: [{ ...WORKFLOW.actions[0], handlerId: 'Commandline' }] }],
    [{ ...WORKFLOW, actions: [{ ...WORKFLOW.actions[0], args: { filePath: 'relative.txt' } }] }],
    [{ ...WORKFLOW, actions: [{ ...WORKFLOW.actions[1], args: { url: 'file:///etc/passwd' } }] }],
    [{ ...WORKFLOW, actions: [{ ...WORKFLOW.actions[2], args: { terminalId: 'Powershell', command: 'ok' } }] }],
    [{ ...WORKFLOW, actions: [{ ...WORKFLOW.actions[3], args: { command: 'ok\nwhoami' } }] }],
    [{ ...WORKFLOW, actions: [WORKFLOW.actions[0], WORKFLOW.actions[0]] }],
    [{ ...WORKFLOW, actions: [] }],
    [{ ...WORKFLOW, id: 'bad id' }],
    [{ ...WORKFLOW, actions: [{ ...WORKFLOW.actions[0], id: 'bad\n-id' }] }],
  ]
  for (const value of invalid) assert.throws(() => parseLauncherWorkflows(value, 'macOS'), /workflow/i)
  assert.throws(() => parseLauncherWorkflows([WORKFLOW], 'Linux'), /workflow/i)
})

test('Workflow digest and public token have canonical field order and no nested authority', () => {
  const [workflow] = parseLauncherWorkflows([WORKFLOW], 'macOS')
  const digest = launcherWorkflowDigest(workflow!)
  assert.match(digest, /^[a-f0-9]{64}$/u)
  const token = serializeLauncherWorkflowToken(workflow!)
  assert.deepEqual(JSON.parse(token), {
    kind: 'workflow',
    version: 1,
    workflowId: WORKFLOW.id,
    workflowSha256: digest,
  })
  assert.deepEqual(parseLauncherWorkflowToken(token), {
    kind: 'workflow',
    version: 1,
    workflowId: WORKFLOW.id,
    workflowSha256: digest,
  })
  assert.throws(() => parseLauncherWorkflowToken(JSON.stringify({ ...JSON.parse(token), command: 'rm -rf /' })), /token/i)
})
