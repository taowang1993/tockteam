import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compileTockTutorCssSnippet,
  createNamedWorkspace,
  loadTockTutorSettings,
  loadWorkbenchState,
  saveTockTutorSettings,
  saveWorkbenchState,
  type KeyValueStorage,
} from '../dist/settings.js'
import { createWorkbenchSession, openNoteTab } from '../dist/session.js'

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const vault = `vault:${'a'.repeat(64)}`

test('loads bounded vault-scoped settings and fails malformed state to defaults', () => {
  const storage = new MemoryStorage()
  assert.equal(loadTockTutorSettings(storage, vault).journalFolder, 'Journals')
  const saved = saveTockTutorSettings(storage, vault, {
    attachmentFolder: 'Assets',
    backlinksInDocument: true,
    defaultEditingMode: 'source',
    graphColorBy: 'folder',
    graphGroupBy: 'folder',
    graphQuery: 'Lessons/',
    journalFolder: 'Daily',
    pagePreview: false,
    templateFolder: 'Templates/Class',
  })
  assert.equal(saved.attachmentFolder, 'Assets')
  assert.equal(loadTockTutorSettings(storage, vault).journalFolder, 'Daily')
  assert.deepEqual(
    (({ graphColorBy, graphGroupBy, graphQuery }) => ({ graphColorBy, graphGroupBy, graphQuery }))(loadTockTutorSettings(storage, vault)),
    { graphColorBy: 'folder', graphGroupBy: 'folder', graphQuery: 'Lessons/' },
  )
  assert.equal(loadTockTutorSettings(storage, `vault:${'b'.repeat(64)}`).journalFolder, 'Journals')
  storage.setItem(`tocktutor.settings.v1.${vault}`, '{bad')
  assert.equal(loadTockTutorSettings(storage, vault).defaultEditingMode, 'live-preview')
  assert.equal(saveTockTutorSettings(storage, vault, { journalFolder: '../escape' }).journalFolder, 'Journals')
})

test('persists bounded session state and collision-safe named workspaces per vault', () => {
  const storage = new MemoryStorage()
  let session = createWorkbenchSession('/tocktutor', { generation: 1, id: vault }, 'pane-1')
  session = openNoteTab(session, 'pane-1', 'Notes/A.md', { pinned: true, mode: 'reading' })
  const first = createNamedWorkspace([], 'Class Layout', session, 10)
  const second = createNamedWorkspace(first, 'Class Layout', session, 10)
  assert.equal(first[0]?.id, 'class-layout')
  assert.equal(second[1]?.id, 'class-layout-2')
  saveWorkbenchState(storage, vault, { focusMode: true, session, workspaces: second })
  const restored = loadWorkbenchState(storage, vault)
  assert.equal(restored.focusMode, true)
  assert.equal(restored.session.groups[0]?.tabs[0]?.path, 'Notes/A.md')
  assert.equal(restored.session.groups[0]?.tabs[0]?.pinned, true)
  assert.deepEqual(restored.workspaces.map(workspace => workspace.id), ['class-layout', 'class-layout-2'])
})

test('scopes CSS snippets and rejects network, imports, unknown at-rules, and malformed input', () => {
  assert.equal(
    compileTockTutorCssSnippet('lesson', '.note, h1 { color: red; }'),
    '.tocktutor-editor-scope .note, .tocktutor-editor-scope h1 { color: red; }',
  )
  assert.equal(compileTockTutorCssSnippet('lesson', '@import "https://example.com/x.css";'), null)
  assert.equal(compileTockTutorCssSnippet('lesson', '.note { background: url(https://example.com/x); }'), null)
  assert.equal(compileTockTutorCssSnippet('lesson', '@font-face { src: local(x); }'), null)
  assert.equal(compileTockTutorCssSnippet('lesson', '.note { color: red;'), null)
})
