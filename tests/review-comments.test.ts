import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ReviewCommentsService,
  type ReviewAgentContext,
  type ReviewInputTriggersService,
  type ReviewSessionsService,
} from '../plugins/sidebar/src/client/review-comments.ts'
import type { GitReviewCommit } from '../plugins/sidebar/src/client/review-types.ts'

function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next: T) {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

const commit: GitReviewCommit = {
  id: 'abcdef', shortId: 'abc', subject: 'Change', author: 'Test',
  authoredAt: '2026-09-19', message: 'Change', files: [],
}

function fixture() {
  type Occurrence = { source: string; ref: string; offset: number; label: string }
  const state = observable({ draft: '', draftRev: 0, occurrences: [] as Occurrence[] })
  const input = {
    state,
    setDraft(draft: string) {
      state.set({ draft, draftRev: state.getSnapshot().draftRev + 1, occurrences: [] })
    },
  }
  const context: ReviewAgentContext = {
    get: () => ({ input: { for: () => input } }),
    bail: (_context, _event, request) => {
      const { reference, span } = request as {
        reference: Omit<Occurrence, 'offset'>
        span: { start: number }
      }
      const previous = state.getSnapshot()
      state.set({
        draft: `${previous.draft.slice(0, span.start)}\uFFFC${previous.draft.slice(span.start)}`,
        draftRev: previous.draftRev + 1,
        occurrences: [{ ...reference, offset: span.start }],
      })
      return true
    },
  }
  const list = observable({ current: 'first', byId: {
    first: { cwd: '/first' }, second: { cwd: '/second' },
  } })
  const sessions: ReviewSessionsService = { list, scope: () => context }
  let source: Parameters<ReviewInputTriggersService['registerSource']>[0] | undefined
  const data = new Map<string, string>()
  const storage: Storage = {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: key => { data.delete(key) },
    setItem: (key, value) => { data.set(key, value) },
  }
  const service = new ReviewCommentsService(sessions, {
    registerSource(value) { source = value; return () => { source = undefined } },
  }, storage)
  service.activate('first', '/first', 'main')
  return {
    service,
    state,
    storage,
    payload: async () => await source!.codec.serialize(),
    select(sessionId: 'first' | 'second') {
      list.set({ ...list.getSnapshot(), current: sessionId })
      service.activate(sessionId, `/${sessionId}`, 'main')
    },
    add(id: string) {
      const sessionId = list.getSnapshot().current
      return service.add(commit, {
        id, sessionId, workspacePath: `/${sessionId}`, branch: 'main',
        commitId: commit.id, filePath: null, line: null, side: null,
        body: `Comment ${id}`, createdAt: '2026-09-19',
      })
    },
  }
}

test('review comment retention keeps visible, persisted, and outgoing comments in agreement', async () => {
  const f = fixture()
  try {
    f.add('evicted')
    for (let index = 0; index < 200; index += 1) f.add(`kept-${index}`)
    assert.equal(f.service.getSnapshot().length, 200)
    assert.equal(f.service.getSnapshot().some(comment => comment.id === 'evicted'), false)
    assert.doesNotMatch(f.storage.getItem('tockteam.sidebar.review-comments.v1')!, /Comment evicted/)
    assert.doesNotMatch(await f.payload(), /Comment evicted/)
    assert.equal(f.state.getSnapshot().occurrences[0]?.label, '200 comments')
    assert.match(await f.payload(), /Comment kept-199/)
    for (const comment of f.service.getSnapshot()) f.service.remove(comment.id)
    assert.equal(await f.payload(), '')
    assert.equal(f.state.getSnapshot().draft, '')
  } finally {
    f.service.dispose()
  }
})

test('review comment eviction also removes requests parked in another session', async () => {
  const f = fixture()
  try {
    f.add('evicted')
    f.select('second')
    for (let index = 0; index < 200; index += 1) f.add(`kept-${index}`)
    f.select('first')
    assert.equal(await f.payload(), '')
    assert.equal(f.state.getSnapshot().draft, '')
    f.select('second')
    assert.equal(f.state.getSnapshot().occurrences[0]?.label, '200 comments')
    assert.match(await f.payload(), /Comment kept-199/)
  } finally {
    f.service.dispose()
  }
})
