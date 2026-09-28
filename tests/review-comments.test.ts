import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ReviewCommentsService,
  type ReviewAgentContext,
  type ReviewInputTriggersService,
  type ReviewSessionsService,
} from '../plugins/sidebar/src/client/review-comments.ts'
import type { GitReviewCommit } from '../plugins/sidebar/src/client/review-types.ts'
import type { ComposerHistoryEventWindow } from '../plugins/sidebar/src/client/composer-input-history.ts'

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

function fixture(options: { legacyValue?: string; failCurrentWrite?: boolean } = {}) {
  type Occurrence = { source: string; ref: string; offset: number; length: number; label: string; clipboardText: string }
  const state = observable({ draft: '', draftRev: 0, occurrences: [] as Occurrence[] })
  const input = {
    state,
    setDraft(draft: string) {
      state.set({ draft, draftRev: state.getSnapshot().draftRev + 1, occurrences: [] })
    },
  }
  const context: ReviewAgentContext = {
    get: () => ({ input: { for: () => input } }),
    bail: (_context, event, request) => {
      const { reference, span, guard } = request as {
        reference: Omit<Occurrence, 'offset' | 'length'>
        span: { start: number; end: number; draftRev: number }
        guard?: { span: typeof span }
      }
      const edit = guard?.span ?? span
      const previous = state.getSnapshot()
      assert.equal(edit.draftRev, previous.draftRev)
      const clipboardOffset = (offset: number) => {
        let extra = 0
        for (const item of previous.occurrences) {
          if (item.offset - extra >= offset) break
          extra += item.length - 1
        }
        return offset + extra
      }
      const start = clipboardOffset(edit.start)
      const end = clipboardOffset(edit.end)
      assert.ok(start <= previous.draft.length && end <= previous.draft.length, 'spans use detect coordinates')
      const inserted = event === 'slash/input-insert-reference' ? reference.clipboardText : ''
      const occurrences = previous.occurrences.filter(item => item.offset < start || item.offset >= end)
        .map(item => item.offset >= end ? { ...item, offset: item.offset + inserted.length - (end - start) } : item)
      if (inserted !== '') occurrences.push({ ...reference, offset: start, length: inserted.length })
      state.set({
        draft: previous.draft.slice(0, start) + inserted + previous.draft.slice(end),
        draftRev: previous.draftRev + 1,
        occurrences: occurrences.sort((a, b) => a.offset - b.offset),
      })
      return true
    },
  }
  const list = observable({ current: 'first' as 'first' | 'second', byId: {
    first: { cwd: '/first' }, second: { cwd: '/second' },
  } })
  const events = {
    first: observable<ComposerHistoryEventWindow>({ entries: [] }),
    second: observable<ComposerHistoryEventWindow>({ entries: [] }),
  }
  const sessions = { list, scope: () => context, binding: (id: string) =>
    id === 'first' || id === 'second' ? { eventSource: events[id] } : undefined } satisfies ReviewSessionsService
  let source: Parameters<ReviewInputTriggersService['registerSource']>[0] | undefined
  const data = new Map<string, string>(options.legacyValue === undefined
    ? [] : [['tockteam.desktop-sidebar.review-comments.v1', options.legacyValue]])
  const storage: Storage = {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: key => { data.delete(key) },
    setItem: (key, value) => {
      if (options.failCurrentWrite && key === 'tockteam.sidebar.review-comments.v1') throw new Error('quota exceeded')
      data.set(key, value)
    },
  }
  const service = new ReviewCommentsService(sessions, {
    registerSource(value) { source = value; return () => { source = undefined } },
  }, storage)
  service.activate('first', '/first', 'main')
  return {
    service,
    state,
    storage,
    events: events.first,
    clearDraft: () => { input.setDraft('') },
    setDraft: input.setDraft,
    receive(text: string, kind = 'user') {
      this.receiveFor(list.getSnapshot().current, text, kind)
    },
    receiveFor(sessionId: 'first' | 'second', text: string, kind = 'user') {
      const source = events[sessionId]
      const entries = source.getSnapshot().entries
      source.set({ entries: [...entries, { type: 'event', event: {
        type: 'user/message', seq: entries.length + 1,
        data: { source: { kind }, content: [{ type: 'text', text }] },
      } }] })
    },
    insertOtherReference() {
      const clipboardText = '/workspace/README.md'
      state.set({ draft: clipboardText, draftRev: state.getSnapshot().draftRev + 1,
        occurrences: [{ source: 'files', ref: 'readme', offset: 0, length: clipboardText.length, label: 'README', clipboardText }] })
    },
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

test('review comments retire only after their request arrives in the pinned event window', async () => {
  const f = fixture()
  try {
    f.add('sent')
    const sent = await f.payload()
    f.clearDraft()
    assert.equal(f.service.getSnapshot().length, 1, 'optimistic clearing is not delivery')
    f.receive('unrelated message')
    f.receive(sent, 'agent')
    assert.equal(f.service.getSnapshot().length, 1, 'unrelated events cannot acknowledge review comments')
    f.setDraft('My next question')
    assert.equal(f.state.getSnapshot().occurrences.length, 0)
    f.receive(`Please fix these:\n${sent}`)
    assert.equal(f.state.getSnapshot().draft, 'My next question')
    assert.equal(f.service.getSnapshot().length, 0)
    assert.equal(await f.payload(), '')
    assert.equal(f.storage.getItem('tockteam.sidebar.review-comments.v1'), '[]')
    f.add('next')
    assert.doesNotMatch(await f.payload(), /Comment sent/)
  } finally {
    f.service.dispose()
  }
})

test('review request is not reinserted after delivery while another session is selected', async () => {
  const f = fixture()
  try {
    f.add('switched')
    const sent = await f.payload()
    f.clearDraft()
    f.select('second')
    f.receiveFor('first', sent)
    f.select('first')
    assert.equal(f.service.getSnapshot().length, 0)
    assert.equal(f.state.getSnapshot().draft, '')
    assert.equal(await f.payload(), '')
  } finally {
    f.service.dispose()
  }
})

test('review delivery remains pending independently in two sessions', async () => {
  const f = fixture()
  try {
    f.add('first')
    const firstRequest = await f.payload()
    f.clearDraft()
    f.select('second')
    f.add('second')
    const secondRequest = await f.payload()
    f.clearDraft()
    f.receiveFor('first', firstRequest)
    f.select('first')
    assert.equal(await f.payload(), '')
    assert.equal(f.service.getSnapshot().length, 1)
    f.select('second')
    assert.equal(f.state.getSnapshot().draft, '', 'the second request remains pending')
    f.receiveFor('second', secondRequest)
    assert.equal(f.service.getSnapshot().length, 0)
  } finally {
    f.service.dispose()
  }
})

test('legacy review comments survive a failed migration write in memory', async () => {
  const previous = fixture()
  previous.add('legacy')
  const legacyValue = previous.storage.getItem('tockteam.sidebar.review-comments.v1')!
  previous.service.dispose()
  const f = fixture({ legacyValue, failCurrentWrite: true })
  try {
    assert.equal(f.service.getSnapshot().length, 1)
    assert.match(await f.payload(), /Comment legacy/)
    assert.equal(f.storage.getItem('tockteam.sidebar.review-comments.v1'), null)
  } finally {
    f.service.dispose()
  }
})

test('a failed review submission retains its restored comment chip for retry', async () => {
  const f = fixture()
  try {
    f.add('retry')
    const before = f.state.getSnapshot()
    const sent = await f.payload()
    f.clearDraft()
    f.state.set({ ...before, draftRev: before.draftRev + 2 })
    assert.equal(f.service.getSnapshot().length, 1)
    assert.equal(f.state.getSnapshot().occurrences[0]?.label, '1 comment')
    f.clearDraft()
    f.receive(sent)
    assert.equal(f.service.getSnapshot().length, 0)
  } finally {
    f.service.dispose()
  }
})

test('review chips use pinned-runtime spans without duplicating text or destroying other references', async () => {
  const f = fixture()
  try {
    f.insertOtherReference()
    f.add('one')
    f.add('two')
    assert.equal(f.state.getSnapshot().occurrences.length, 2)
    assert.equal(f.state.getSnapshot().draft, `/workspace/README.md${await f.payload()}`)
    f.service.remove('one')
    assert.equal(f.state.getSnapshot().draft, `/workspace/README.md${await f.payload()}`)
    assert.doesNotMatch(f.state.getSnapshot().draft, /Comment one/)
    f.service.remove('two')
    assert.equal(f.state.getSnapshot().draft, '/workspace/README.md')
    assert.equal(f.state.getSnapshot().occurrences[0]?.source, 'files')
  } finally {
    f.service.dispose()
  }
})

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
