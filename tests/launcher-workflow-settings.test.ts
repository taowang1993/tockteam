import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createLauncherWorkflowSaveGate, initialLauncherWorkflowSettings, LAUNCHER_WORKFLOW_SETTING_KEY } from '../src/launcher-workflow-contract.ts'
import type { LauncherSettingsSnapshot } from '../src/launcher-settings-contract.ts'

const source = readFileSync(new URL('../src/launcher-workflow-settings.tsx', import.meta.url), 'utf8')
const mainSettings = readFileSync(new URL('../src/launcher-settings.tsx', import.meta.url), 'utf8')

test('Workflow settings editor preserves foreign-platform entries', () => {
  const snapshot = {
    externalGrantStatus: 'none', logs: [], missingSensitiveKeys: [], recoveredSettings: false, settingsSource: 'managed',
    values: { [LAUNCHER_WORKFLOW_SETTING_KEY]: [
      { id: 'windows-only', name: 'Windows only', actions: [{ id: 'terminal', handlerId: 'OpenTerminal', name: 'Prompt', args: { terminalId: 'Command Prompt', command: 'echo ok' } }] },
    ] },
  } as unknown as LauncherSettingsSnapshot
  assert.deepEqual(initialLauncherWorkflowSettings(snapshot).map(workflow => workflow.id), ['windows-only'])
})

test('Workflow settings save gate rejects stale concurrent full-array writes and reopens after failure', async () => {
  const calls: unknown[] = []
  let release!: (value: boolean) => void
  const gate = createLauncherWorkflowSaveGate(async (_key, value) => {
    calls.push(value)
    return await new Promise<boolean>(resolve => { release = resolve })
  })
  const first = gate([])
  assert.equal(await gate([{ id: 'second' } as never]), false)
  release(true)
  assert.equal(await first, true)
  let failed = true
  const retryGate = createLauncherWorkflowSaveGate(async (_key, value) => {
    calls.push(value)
    if (failed) { failed = false; return false }
    return true
  })
  assert.equal(await retryGate([]), false)
  assert.equal(await retryGate([]), true)
  assert.equal(calls.length, 3)
})

test('Workflow settings editor is bounded, ordered, accessible, and main-owned', () => {
  assert.match(source, /Saved workflows/u)
  assert.match(source, /Selected workflow editor/u)
  assert.match(source, /<ol/u)
  assert.match(source, /index \+ 1/u)
  assert.match(source, /Open file/u)
  assert.match(source, /Open URL/u)
  assert.match(source, /Open terminal/u)
  assert.match(source, /Execute command/u)
  assert.match(source, /maxLength=\{4096\}/u)
  assert.match(source, /2048/u)
  assert.match(source, /maxLength=\{128\}/u)
  assert.match(source, /aria-invalid/u)
  assert.match(source, /Confirm workflow deletion/u)
  assert.match(source, /LAUNCHER_WORKFLOW_SETTING_KEY/u)
  assert.doesNotMatch(source, /node:fs|node:child_process|window\.open|fetch\s*\(/u)
  assert.match(mainSettings, /<LauncherWorkflowSettings key=\{snapshotRevision\}/u)
})
