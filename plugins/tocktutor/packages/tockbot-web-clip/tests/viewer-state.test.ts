import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_VIEWER_STORAGE_CHARS,
  MAX_VIEWER_TABS,
  ViewerResultGuard,
  createViewerState,
  navigateViewerTab,
  restoreViewerState,
  serializeViewerState,
} from '../src/viewer.ts'

test('restores only bounded validated tabs, bookmarks, and Reader preferences', () => {
  const raw = JSON.stringify({
    version: 1,
    activeIndex: 99,
    tabs: [
      { url: 'https://example.com/one', title: 'One' },
      { url: 'file:///etc/passwd', title: 'Local' },
      { url: 'http://127.0.0.1/', title: 'Private IPv4' },
      { url: 'http://[::1]/', title: 'Private IPv6' },
      ...Array.from({ length: 30 }, (_, index) => ({ url: `https://example.com/${String(index)}`, title: `Tab ${String(index)}` })),
    ],
    bookmarks: [
      { url: 'https://example.com/saved', title: 'Saved' },
      { url: 'https://user:secret@example.com/', title: 'Credential' },
      { url: 'https://example.com/saved', title: 'Duplicate' },
    ],
    readerPreferences: {
      appearance: 'dark',
      spacing: 'relaxed',
      textSize: 'lg',
      width: 'wide',
    },
  })
  const state = restoreViewerState(raw)
  assert.equal(state.tabs.length, MAX_VIEWER_TABS)
  assert.equal(state.tabs.some(tab => ['Local', 'Private IPv4', 'Private IPv6'].includes(tab.title)), false)
  assert.equal(state.activeId, state.tabs.at(-1)?.id)
  assert.deepEqual(state.bookmarks.map(bookmark => bookmark.title), ['Saved'])
  assert.deepEqual(state.readerPreferences, {
    appearance: 'dark',
    spacing: 'relaxed',
    textSize: 'lg',
    width: 'wide',
  })
  assert.deepEqual(restoreViewerState(serializeViewerState(state)), state)
})

test('never serializes more state than the restore envelope accepts', () => {
  const base = createViewerState()
  const state = {
    ...base,
    bookmarks: Array.from({ length: 20 }, (_, index) => ({
      id: `bookmark-${String(index + 1)}`,
      title: 'x'.repeat(240),
      url: `https://example.net/${'b'.repeat(4000)}${String(index)}`,
    })),
    tabs: Array.from({ length: 20 }, (_, index) => ({
      id: `tab-${String(index + 1)}`,
      title: 'x'.repeat(240),
      url: `https://example.com/${'a'.repeat(4000)}${String(index)}`,
    })),
  }
  assert.ok(serializeViewerState(state).length <= MAX_VIEWER_STORAGE_CHARS)
})

test('uses safe defaults for absent, malformed, excessive, or invalid persisted state', () => {
  const expected = createViewerState()
  for (const raw of [null, '', '{', 'x'.repeat(65_537), JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, tabs: [] })]) {
    assert.deepEqual(restoreViewerState(raw), expected)
  }
  const malformedPreferences = restoreViewerState(JSON.stringify({
    version: 1,
    tabs: [null],
    readerPreferences: { appearance: 'sepia', spacing: 1, textSize: null, width: 'huge' },
  }))
  assert.deepEqual(malformedPreferences.readerPreferences, expected.readerPreferences)
})

test('accepts results only for the originating session, request, active tab, and URL', () => {
  let state = navigateViewerTab(createViewerState(), 'tab-1', {
    title: 'One',
    url: 'https://example.com/one',
  })
  const guard = new ViewerResultGuard('session-a')
  const first = guard.start('tab-1', 'https://example.com/one')
  assert.equal(guard.accepts(first, state), true)

  const replacement = guard.start('tab-1', 'https://example.com/one')
  assert.equal(guard.accepts(first, state), false)
  assert.equal(guard.accepts(replacement, state), true)

  state = navigateViewerTab(state, 'tab-1', { title: 'Two', url: 'https://example.com/two' })
  assert.equal(guard.accepts(replacement, state), false)
  assert.equal(new ViewerResultGuard('session-b').accepts(replacement, state), false)

  guard.invalidate()
  assert.equal(guard.accepts(replacement, state), false)
})
