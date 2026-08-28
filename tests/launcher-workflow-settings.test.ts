import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/launcher-workflow-settings.tsx', import.meta.url), 'utf8')
const mainSettings = readFileSync(new URL('../src/launcher-settings.tsx', import.meta.url), 'utf8')

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
