import assert from 'node:assert/strict'
import test from 'node:test'
import { createCachedStateStore } from '../src/trusted-raycast-cached-state.ts'

test('same-key cached-state consumers converge on the latest functional update', async () => {
  const persisted: number[] = []
  const store = createCachedStateStore({ initial: { recent: [] }, persist: async snapshot => { persisted.push((snapshot.recent as unknown[]).length) } })
  const first: number[] = []; const second: number[] = []; let unrelated = 0; let late = 0; let lateSubscribed = false
  const unsubscribeFirst = store.subscribe('recent', () => {
    first.push(store.get<unknown[]>('recent', []).length)
    if (!lateSubscribed) { lateSubscribed = true; store.subscribe('recent', () => { late++ }) }
  })
  store.subscribe('recent', () => second.push(store.get<unknown[]>('recent', []).length))
  store.subscribe('favorite', () => { unrelated++ })
  store.update<unknown[]>('recent', old => [...old, 'one'])
  store.update<unknown[]>('recent', old => [...old, 'two'])
  assert.deepEqual(store.get('recent', []), ['one', 'two'])
  assert.deepEqual(first, [1, 2]); assert.deepEqual(second, [1, 2]); assert.equal(late, 1, 'a listener added during notification waits until the next update'); assert.equal(unrelated, 0)
  unsubscribeFirst()
  store.update<unknown[]>('recent', old => [...old, 'three'])
  assert.deepEqual(first, [1, 2]); assert.deepEqual(second, [1, 2, 3]); assert.equal(late, 2)
  await store.flush()
  assert.deepEqual(persisted, [1, 2, 3])
})

test('Kaomoji-style mutating updaters deduplicate and cap recents without aliasing stored state', () => {
  const store = createCachedStateStore({
    initial: { recent: [] },
    validate: snapshot => Array.isArray(snapshot.recent) && snapshot.recent.length <= 16 && new Set((snapshot.recent as Array<{ name: string }>).map(item => item.name)).size === snapshot.recent.length,
  })
  for (let index = 0; index < 17; index++) store.update<Array<{ name: string }>>('recent', old => [{ name: `item-${index}` }, ...old].slice(0, 16))
  store.update<Array<{ name: string }>>('recent', old => {
    const existing = old.findIndex(item => item.name === 'item-5')
    old.splice(existing, 1)
    return [{ name: 'item-5' }, ...old].slice(0, 16)
  })
  const recent = store.get<Array<{ name: string }>>('recent', [])
  assert.equal(recent.length, 16); assert.equal(recent[0]!.name, 'item-5'); assert.equal(new Set(recent.map(item => item.name)).size, 16)
  assert.equal(Object.isFrozen(recent), true); assert.equal(Object.isFrozen(recent[0]), true)
})

test('invalid updates roll back and persistence stays ordered after storage failure', async () => {
  const writes: number[] = []
  const store = createCachedStateStore({
    initial: { count: 0, recent: [{ name: 'safe' }] },
    validate: snapshot => typeof snapshot.count === 'number' && snapshot.count >= 0 && Array.isArray(snapshot.recent) && snapshot.recent.length <= 1,
    persist: async snapshot => {
      const count = snapshot.count as number
      assert.equal(Object.isFrozen(snapshot), true)
      writes.push(count)
      if (count === 1) throw new Error('disk unavailable')
    },
  })
  assert.equal(store.update<number>('count', 1), true)
  assert.equal(store.update<number>('count', 2), true)
  assert.equal(store.update<Array<{ name: string }>>('recent', old => { old.push({ name: 'invalid' }); return old }), false)
  assert.deepEqual(store.get('recent', []), [{ name: 'safe' }])
  await assert.doesNotReject(store.flush())
  assert.deepEqual(writes, [1, 2])
})
