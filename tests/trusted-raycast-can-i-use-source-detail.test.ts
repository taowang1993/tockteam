import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTrustedRaycastCanIUseSourceDetail } from '../src/trusted-raycast-can-i-use-source-detail.ts'

const context = { extensionId: 'can-i-use', command: 'index', sessionId: 'session', workspaceId: 'no-workspace', snapshotIdentity: 'snapshot', snapshotGeneration: 0 }
const packet = () => ({ type: 'can-i-use-detail', revision: 3, context, feature: 'css-grid', agents: [
  { browser: 'chrome', label: 'Chrome', sourceIndex: 3, flags: { y: 57, a: null, x: 56, u: null }, release_date: { '57': 1489017600, '56': null } },
] })

test('selected detail supplies source-compatible flags and exact release dates, then revokes', () => {
  let live = true
  const detail = createTrustedRaycastCanIUseSourceDetail(JSON.stringify(packet()), context, revision => live && revision === 3, slug => slug === 'css-grid')
  assert.deepEqual(detail.getSupport('css-grid'), { chrome: { y: 57, x: 56 } })
  assert.equal(detail.agents.chrome!.browser, 'Chrome')
  assert.deepEqual(detail.agents.chrome!.release_date, { '57': 1489017600, '56': null })
  assert.ok(Object.isFrozen(detail.agents.chrome!.release_date))
  assert.throws(() => detail.getSupport('css-grid', 'extra'), { code: 'DATA_UNAVAILABLE' })
  assert.throws(() => detail.getSupport('other'), { code: 'DATA_UNAVAILABLE' })
  live = false
  assert.throws(() => detail.getSupport('css-grid'), { code: 'SNAPSHOT_STALE' })
})

test('detail rejects foreign, replayed, unselected, oversized and open-shaped input', () => {
  const decode = (value: unknown) => createTrustedRaycastCanIUseSourceDetail(JSON.stringify(value), context, revision => revision > 2, slug => slug === 'css-grid')
  assert.throws(() => decode({ ...packet(), revision: 2 }), { code: 'SNAPSHOT_STALE' })
  assert.throws(() => decode({ ...packet(), context: { ...context, sessionId: 'other' } }), { code: 'SNAPSHOT_STALE' })
  assert.throws(() => decode({ ...packet(), feature: 'not-selected' }), { code: 'ACTION_DENIED' })
  for (const bad of [
    { ...packet(), url: 'https://evil.test' },
    { ...packet(), type: 'action' },
    { ...packet(), agents: Array(65).fill(packet().agents[0]) },
    { ...packet(), agents: [packet().agents[0], packet().agents[0]] },
    { ...packet(), agents: [{ ...packet().agents[0], browser: 'op_mini' }] },
    { ...packet(), agents: [{ ...packet().agents[0], release_date: { '99': 123 } }] },
    { ...packet(), agents: [{ ...packet().agents[0], release_date: { '57': -1 } }] },
    { ...packet(), agents: [{ ...packet().agents[0], flags: { y: '57', a: null, x: null, u: null } }] },
  ]) assert.throws(() => decode(bad))
  assert.throws(() => createTrustedRaycastCanIUseSourceDetail(' '.repeat(32769), context, () => true, () => true), { code: 'LIMIT_EXCEEDED' })
})
