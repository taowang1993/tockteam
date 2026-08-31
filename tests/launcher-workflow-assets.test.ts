import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { LAUNCHER_WORKFLOW_ASSETS, launcherWorkflowAssetUrl } from '../src/launcher-workflow-assets.ts'

test('Workflow admits exactly the pinned runtime asset', async () => {
  assert.deepEqual(LAUNCHER_WORKFLOW_ASSETS.map(asset => asset.key), ['workflow'])
  const asset = LAUNCHER_WORKFLOW_ASSETS[0]!
  const bytes = await readFile(new URL(`../${asset.source}`, import.meta.url))
  assert.equal(bytes.byteLength, 6_275)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash)
  assert.equal(launcherWorkflowAssetUrl('workflow'), './launcher-assets/workflow.png')
  assert.equal(launcherWorkflowAssetUrl('bolt'), undefined)
})
