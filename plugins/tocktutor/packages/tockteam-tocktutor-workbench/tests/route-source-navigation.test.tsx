import { act, cleanup, render, waitFor } from '@testing-library/react'
import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it } from 'vitest'
import { TockTutorRouteView, WorkbenchRouteController, type WorkbenchRouteRemote } from '../src/route.tsx'

afterEach(cleanup)

it.each(['\n', '\r\n', '\r'])('navigates authored %j lines through the mounted Source route without selection feedback drift', async eol => {
  const source = ['a', 'b', 'c'].join(eol)
  const vault = { generation: 1, id: `vault:${'a'.repeat(64)}` }
  const remote = { $on: () => () => {}, tocktutorWorkbench: {
    currentVault: async () => ({ ok: true, value: { displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault } }),
    listTree: async () => ({ ok: true, value: { complete: true, cursor: null, entries: [], generation: 1, scan: { entries: 0 }, truncated: false, truncationReason: null, warnings: [] } }),
    openDocument: async (path: string) => ({ ok: true, value: { content: source, digest: `sha256:${'c'.repeat(64)}`, generation: 1, path, revision: `file:${'b'.repeat(64)}` } }),
    readDraft: async () => ({ ok: true, value: { draft: null, generation: 1 } }),
    saveDraft: async () => ({ ok: true, value: { generation: 1, status: 'saved' } }),
  } } as unknown as WorkbenchRouteRemote
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Note.md')
  controller.jumpToLine(2)
  function Route() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return <TockTutorRouteView snapshot={snapshot} onActivateTab={() => {}} onAddPane={() => {}} onEdit={source => controller.edit(source)} onFocusPane={() => {}} onMode={mode => controller.setMode(mode)} onMoveCanvas={() => {}} onSave={() => {}} onSelect={() => {}} onToggleTask={() => {}} onSelectionChange={(from, to) => controller.setSourceEditorSelection(from, to)} />
  }
  const rendered = render(<Route />)
  try {
    await waitFor(() => expect(rendered.container.querySelector('.cm-editor')).toBeTruthy(), { timeout: 5000 })
    const view = EditorView.findFromDOM(rendered.container.querySelector('.cm-editor') as HTMLElement)!
    await waitFor(() => expect(view.state.selection.main).toMatchObject({ from: 2, to: 3 }))
    expect(view.state.sliceDoc(2, 3)).toBe('b')
    expect(controller.getSnapshot().source).toBe(source)
    expect(source.slice(controller.getSnapshot().selectionStart, controller.getSnapshot().selectionEnd)).toBe('b')
    await act(async () => { view.dispatch({ selection: { anchor: 0 } }) })
    await act(async () => { controller.jumpToLine(2) })
    expect(view.state.selection.main).toMatchObject({ from: 2, to: 3 })
    await act(async () => { view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(4, 5)], 1) }) })
    expect(view.state.selection.ranges.map(({ from, to }) => ({ from, to }))).toEqual([{ from: 0, to: 1 }, { from: 4, to: 5 }])
    expect(source.slice(controller.getSnapshot().selectionStart, controller.getSnapshot().selectionEnd)).toBe('c')
    await act(async () => { view.dispatch({ changes: { from: view.state.doc.length, insert: '\n' }, selection: { anchor: view.state.doc.length + 1 } }) })
    expect(controller.getSnapshot().selectionStart).toBe(controller.getSnapshot().source.length)
  } finally {
    rendered.unmount()
    await controller.dispose()
  }
})
