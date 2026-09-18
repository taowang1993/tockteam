import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ComposerInputHistory,
  submittedInputEntries,
  type ComposerHistoryEventLikeEntry,
  type ComposerHistoryEventWindow,
  type ComposerHistorySession,
} from '../plugins/sidebar/src/client/composer-input-history.ts'

function event(seq: number, type: string, data: unknown = {}): ComposerHistoryEventLikeEntry {
  return { type: 'event', event: { type, seq, data } }
}

function windowOf(...entries: ComposerHistoryEventLikeEntry[]): ComposerHistoryEventWindow {
  return { entries, hasMore: false, revision: entries.length }
}

function user(
  seq: number,
  value: string,
  source: unknown = { kind: 'user' },
): ComposerHistoryEventLikeEntry {
  return event(seq, 'user/message', {
    content: [{ type: 'text', text: value }],
    source,
  })
}

test('reads only durable user-source text messages in chronological order', () => {
  assert.deepEqual(
    submittedInputEntries([
      user(1, 'first'),
      event(2, 'assistant/message', {
        content: [{ type: 'text', text: 'answer' }],
      }),
      event(3, 'user/message', {
        content: [
          { type: 'image' },
          { type: 'text', text: 'second ' },
          { type: 'text', text: 'part' },
        ],
        source: { kind: 'user' },
      }),
      user(4, 'from plugin', { kind: 'plugin', plugin: 'context' }),
      {
        type: 'chunks',
        event: {
          type: 'user/message',
          seq: 5,
          data: {
            content: [{ type: 'text', text: 'compact row' }],
            source: { kind: 'user' },
          },
        },
      },
      user(6, '   '),
      user(7, 'repeat'),
      user(8, 'repeat'),
      user(9, 'steering', { kind: 'steering' }),
    ]),
    [
      { id: '1', value: 'first' },
      { id: '3', value: 'second part' },
      { id: '7', value: 'repeat' },
      { id: '8', value: 'repeat' },
    ],
  )
})

test('keeps histories isolated and bounds resident sessions with LRU eviction', () => {
  const histories = new ComposerInputHistory(100, 32)
  for (let index = 0; index < 33; index += 1) {
    const id = `session-${String(index)}`
    histories.synchronize(id, windowOf(user(index, id)))
  }
  assert.equal(histories.forSession('session-1').navigate('older', '').value, 'session-1')
  assert.equal(histories.forSession('session-32').navigate('older', '').value, 'session-32')
  assert.equal(histories.forSession('session-0').navigate('older', '').value, null)
})

test('synchronizes event windows while preserving a selected event identity', () => {
  const histories = new ComposerInputHistory()
  const latest = windowOf(user(2, 'newer'), user(3, 'newest'))
  assert.equal(histories.synchronize('session', latest), true)
  assert.equal(histories.forSession('session').navigate('older', 'draft').value, 'newest')
  assert.equal(
    histories.synchronize('session', {
      entries: [user(1, 'older'), ...latest.entries],
      hasMore: false,
      revision: 2,
    }),
    true,
  )
  assert.equal(histories.forSession('session').snapshot().cursor, 2)
  assert.equal(histories.forSession('session').navigate('older', 'newest').value, 'newer')
})

test('skips windows whose accepted event identities did not change', () => {
  const histories = new ComposerInputHistory()
  const first = user(1, 'first')
  assert.equal(histories.synchronize('session', windowOf(first)), true)
  assert.equal(
    histories.synchronize('session', {
      entries: [first, event(2, 'assistant/message')],
      hasMore: false,
      revision: 2,
    }),
    false,
  )
})

test('loads one older page at a time and stops at history capacity', async () => {
  let resolveLoad: (() => void) | undefined
  let loads = 0
  const session: ComposerHistorySession = {
    getSnapshot: () => ({ hasMore: true, loadingOlder: false }),
    loadOlder: async () => {
      loads += 1
      await new Promise<void>((resolve) => {
        resolveLoad = resolve
      })
    },
  }
  const histories = new ComposerInputHistory(2)
  assert.equal(histories.requestOlder('session', session), true)
  assert.equal(histories.requestOlder('session', session), false)
  assert.equal(loads, 1)
  resolveLoad?.()
  await new Promise((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(histories.requestOlder('session', session), true)
  histories.synchronize('session', windowOf(user(1, 'older'), user(2, 'newer')))
  assert.equal(histories.requestOlder('session', session), false)
})
