import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_VIEWER_BOOKMARKS,
  MAX_VIEWER_TABS,
  SUPPORTED_TOCKTEAM_DESKTOP_VERSION,
  addViewerBookmark,
  addViewerTab,
  closeViewerTab,
  createViewerState,
  moveViewerTab,
  navigateViewerTab,
  removeViewerBookmark,
  selectViewerTab,
} from '../src/viewer.ts'

test('pins the isolated frame bridge to the retained Desktop release', () => {
  assert.equal(SUPPORTED_TOCKTEAM_DESKTOP_VERSION, '0.1.6')
})

test('owns a bounded tab session with normalized Host-validated navigation', () => {
  let state = createViewerState()
  state = navigateViewerTab(state, state.activeId, {
    title: ' Example '.repeat(40),
    url: 'HTTPS://Example.COM:443/article#fragment',
  })
  assert.equal(state.tabs[0]?.url, 'https://example.com/article')
  assert.equal(state.tabs[0]?.title.length, 240)

  for (let index = 1; index < MAX_VIEWER_TABS + 5; index += 1) state = addViewerTab(state)
  assert.equal(state.tabs.length, MAX_VIEWER_TABS)
  assert.equal(state.activeId, state.tabs.at(-1)?.id)
  for (const url of [
    'file:///etc/passwd',
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://[::1]/',
    'https://93.184.216.34/',
  ]) assert.throws(() => navigateViewerTab(state, state.activeId, { title: 'Unsafe', url }))
})

test('selects, reorders, and closes tabs with a stable successor', () => {
  let state = createViewerState()
  state = addViewerTab(state)
  state = addViewerTab(state)
  const [first, second, third] = state.tabs
  if (!first || !second || !third) throw new Error('missing tabs')

  state = selectViewerTab(state, second.id)
  state = moveViewerTab(state, second.id, 0)
  assert.deepEqual(state.tabs.map(tab => tab.id), [second.id, first.id, third.id])
  state = closeViewerTab(state, second.id)
  assert.equal(state.activeId, first.id)
  state = closeViewerTab(closeViewerTab(state, first.id), third.id)
  assert.equal(state.tabs.length, 1)
  assert.equal(state.tabs[0]?.url, null)
})

test('keeps bounded deduplicated bookmarks and removes them by identity', () => {
  let state = navigateViewerTab(createViewerState(), 'tab-1', {
    title: 'Article',
    url: 'https://example.com/article',
  })
  state = addViewerBookmark(state)
  state = addViewerBookmark(state)
  assert.equal(state.bookmarks.length, 1)

  for (let index = 0; index < MAX_VIEWER_BOOKMARKS + 5; index += 1) {
    state = addViewerTab(state)
    state = navigateViewerTab(state, state.activeId, {
      title: `Article ${String(index)}`,
      url: `https://example.com/${String(index)}`,
    })
    state = addViewerBookmark(state)
  }
  assert.equal(state.bookmarks.length, MAX_VIEWER_BOOKMARKS)
  const removed = state.bookmarks[0]
  if (!removed) throw new Error('missing bookmark')
  state = removeViewerBookmark(state, removed.id)
  assert.equal(state.bookmarks.some(bookmark => bookmark.id === removed.id), false)
})
