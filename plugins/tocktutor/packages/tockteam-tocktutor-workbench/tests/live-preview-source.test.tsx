import { act, render, waitFor } from '@testing-library/react'
import { undo, redo } from '@codemirror/commands'
import { useSyncExternalStore } from 'react'
import { EditorView } from '@codemirror/view'
import { WorkbenchRouteController, TockTutorRouteView } from '../src/route.tsx'
import { describe, expect, it } from 'vitest'

describe('Source Mode', () => {
  it('keeps local command and typing undoable in Source Mode', async () => {
    const mode = 'source' as const
    const vault = { generation: 1, id: `vault:${'a'.repeat(64)}` }
    const controller = new WorkbenchRouteController({ $on: () => () => {}, tocktutorWorkbench: {
      currentVault: async () => ({ ok: true, value: { vault, generation: 1, name: 'Test', displayPath: '/test' } }),
      listTree: async () => ({ ok: true, value: { generation: 1, entries: [{ kind: 'document', path: 'Note.md', size: 5, modifiedAt: 1, createdAt: 1 }], warnings: [], complete: true, cursor: null, truncated: false, truncationReason: null, scan: { entries: 1 } } }),
      readDraft: async () => ({ ok: true, value: { draft: null, generation: 1 } }),
      saveDraft: async () => ({ ok: true, value: { generation: 1 } }),
      openDocument: async () => ({ ok: true, value: { content: 'Hello', digest: `sha256:${'c'.repeat(64)}`, generation: 1, path: 'Note.md', revision: `file:${'b'.repeat(64)}` } }),
    } } as never, () => {})
    await controller.syncLocation('/tocktutor/Note.md')
    expect(controller.getSnapshot().source, JSON.stringify(controller.getSnapshot())).toBe('Hello')
    controller.setMode(mode)
    function Note() {
      const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
      return <TockTutorRouteView snapshot={snapshot} onEdit={source => controller.edit(source)} onSelectionChange={(from, to) => controller.setSourceEditorSelection(from, to)} onMode={() => {}} onSave={() => {}} onSelect={() => {}} onActivateTab={() => {}} onAddPane={() => {}} onFocusPane={() => {}} onMoveCanvas={() => {}} onToggleTask={() => {}} />
    }
    const { container, unmount } = render(<Note />)
    try {
      await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
      const view = EditorView.findFromDOM(container.querySelector('.cm-content')!)!
      act(() => view.dispatch({ changes: { from: 5, insert: ' World' }, selection: { anchor: 6, head: 11 } }))
      await waitFor(() => expect(controller.getSnapshot().source).toBe('Hello World'))
      act(() => controller.runEditorCommand('bold'))
      await waitFor(() => expect(view.state.doc.toString()).toBe('Hello **World**'))
      act(() => { expect(undo(view)).toBe(true) })
      await waitFor(() => expect(controller.getSnapshot().source).toBe('Hello World'))
      act(() => { expect(undo(view)).toBe(true) })
      await waitFor(() => expect(controller.getSnapshot().source).toBe('Hello'))
      act(() => { expect(redo(view)).toBe(true); expect(redo(view)).toBe(true) })
      await waitFor(() => expect(controller.getSnapshot().source).toBe('Hello **World**'))
      act(() => { expect(controller.setProperty('tags', ['keep'])).toBe(true) })
      await waitFor(() => expect(view.state.doc.toString()).toContain('tags:'))
      act(() => { expect(undo(view)).toBe(true) })
      await waitFor(() => expect(controller.getSnapshot().source).toBe('Hello **World**'))
      act(() => { expect(controller.insertCurrentDateTime('date')).toBe(true) })
      await waitFor(() => expect(view.state.doc.toString()).not.toBe('Hello **World**'))
      act(() => { expect(undo(view)).toBe(true) })
      await waitFor(() => expect(controller.getSnapshot().source).toBe('Hello **World**'))
    } finally { unmount(); await controller.dispose() }
  })
})
