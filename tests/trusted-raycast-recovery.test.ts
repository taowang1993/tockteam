import test from 'node:test'
import assert from 'node:assert/strict'
import { createTockTeamDestinationResults } from '../src/launcher-specialists.ts'
import { existsSync } from 'node:fs'

test('only real workspaces are workspace destinations', async () => {
  const { before } = await createTockTeamDestinationResults('')
  assert.deepEqual(before.map(item => item.id), ['tockteam-route:tockcoder', 'tockteam-route:tocktutor'])
})
test('replacement translator is not shipped as unchanged extension execution', () => {
  assert.equal(existsSync(new URL('../scripts/trusted-raycast-translate-child.mjs', import.meta.url)), false)
})
