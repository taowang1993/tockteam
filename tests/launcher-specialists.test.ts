import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LauncherActionStore } from '../src/launcher-actions.ts'
import {
  TOCKTEAM_WORKBENCH_HANDLER,
  createTockTeamDestinationResults,
  executeTockTeamDestination,
} from '../src/launcher-specialists.ts'

test('TockTeam launcher indexes only its finite product destinations', async () => {
  const result = await createTockTeamDestinationResults('code')
  assert.deepEqual(result.after, [])
  assert.deepEqual(result.before.map(item => item.id), ['tockteam-route:tockcoder'])
  assert.equal(result.before[0]?.defaultAction.handlerKey, TOCKTEAM_WORKBENCH_HANDLER)
  assert.deepEqual(
    (await createTockTeamDestinationResults('')).before.map(item => item.id),
    ['tockteam-route:tockcoder', 'tockteam-route:tocktutor'],
  )
  assert.deepEqual((await createTockTeamDestinationResults('tockdriver')).before, [])
})

test('TockTeam route action validates its destination before navigating the workbench', async () => {
  let focused = 0
  let destination = ''
  const store = new LauncherActionStore({ execute: async record => await executeTockTeamDestination(record, () => true, next => { destination = next; focused += 1 }) })
  const owner = { role: 'launcher' as const, webContentsId: 1 }
  const published = store.publish({ items: (await createTockTeamDestinationResults('')).before, owner })
  await store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner })
  assert.equal(focused, 1)
  assert.equal(destination, 'tockcoder')
})

test('TockCoder route action rejects the splash page before consuming success', async () => {
  let focused = 0
  const store = new LauncherActionStore({ execute: async record => await executeTockTeamDestination(record, () => false, () => { focused += 1 }) })
  const owner = { role: 'launcher' as const, webContentsId: 1 }
  const published = store.publish({ items: (await createTockTeamDestinationResults('')).before, owner })
  await assert.rejects(
    store.invoke({ actionId: published.items[0]!.defaultAction.actionId, owner }),
    /active runtime/u,
  )
  assert.equal(focused, 0)
})
