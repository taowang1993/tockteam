import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createVaultInspection } from 'tockbot-note-vault/inspection'
import { NoteMergeReview, MergeRecoveryDialog } from '../src/merge-review.tsx'
import { previewNoteMerge, type NoteMergeOptions } from '../src/merge-preview.ts'

afterEach(cleanup)

it('pages retained merge journals without accumulating an unbounded list', async () => {
  const merge = (id: string) => ({ id, generation: 1, status: 'applied' as const, sourcePath: `${id}.md`, destinationPath: 'Dest.md', sourceDisposition: 'keep' as const, paths: [], recoveryPath: 'Recovered' })
  const onList = vi.fn(async (_signal: AbortSignal, cursor?: string) => cursor
    ? { generation: 1, merges: [merge('second')] }
    : { generation: 1, merges: [merge('first')], cursor: 'first' })
  render(<MergeRecoveryDialog onList={onList} onRecover={async id => merge(id)} onClose={() => {}} />)
  await screen.findByText('first.md → Dest.md')
  fireEvent.click(screen.getByRole('button', { name: 'Next Page' }))
  await screen.findByText('second.md → Dest.md')
  expect(screen.queryByText('first.md → Dest.md')).toBeNull()
  expect(onList.mock.lastCall?.[1]).toBe('first')
  expect(screen.queryByRole('button', { name: 'Next Page' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'First Page' }))
  await screen.findByText('first.md → Dest.md')
})

function fixture() {
  const contents = new Map([
    ['Source.md', '---\nstatus: source\n---\n# Source\n'],
    ['A/Dest.md', '---\nstatus: destination\n---\n# Destination\n'],
    ['B/Dest.markdown', '# Another destination\n'],
    ['Ref.md', '[[Source]]\n[[Missing]]\n'],
  ])
  const entries = [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([path, content], index) => ({ path, kind: 'document' as const, createdMs: 1, modifiedMs: 1, size: content.length, revision: `file:${String(index + 1).repeat(64)}` }))
  const inspection = createVaultInspection({
    async list() { return { entries, cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [] } },
    async read(path) { return { path, content: contents.get(path)!, revision: entries.find(entry => entry.path === path)!.revision } },
  }, { maxReadBytes: 2_000_000, maxSearchFileBytes: 2_000_000, maxSearchBytes: 64 * 1024 * 1024, maxSearchEntries: 100, maxSearchResults: 10 })
  const document = (path: string) => ({ path, content: contents.get(path)!, revision: entries.find(entry => entry.path === path)!.revision, generation: 1, digest: `sha256:${'a'.repeat(64)}` })
  const owner = new AbortController()
  const preview = vi.fn(async (options: NoteMergeOptions, signal: AbortSignal) => previewNoteMerge({
    ...options, expectedVault: { id: `vault:${'a'.repeat(64)}`, generation: 1 }, source: document('Source.md'), destination: document('A/Dest.md'),
  }, async request => ({ ...await inspection.planMergeLinks(request, signal), generation: 1 }), signal))
  const prepare = vi.fn(async (_path: string, _signal: AbortSignal) => ({ source: document('Source.md'), destination: document('A/Dest.md'), signal: owner.signal, preview }))
  const close = vi.fn()
  const props = { sourcePath: 'Source.md', paths: [...contents.keys(), 'Picture.png', '../Escape.md', 'SOURCE.MD'], onPrepare: prepare, onClose: close }
  return { props, contents, owner, preview, prepare, close }
}

it('applies only after explicit confirmation of the latest safe preview', async () => {
  const state = fixture()
  const apply = vi.fn(async () => ({ id: 'merge-id', generation: 1, status: 'applied' as const, sourcePath: 'Source.md', destinationPath: 'A/Dest.md', sourceDisposition: 'keep' as const, paths: [], recoveryPath: 'Recovered Merge' }))
  render(<NoteMergeReview {...state.props} onPrepare={async (path, signal) => ({ ...await state.prepare(path, signal), apply })} />)
  expect(screen.queryByRole('button', { name: 'Confirm Merge' })).toBeNull()
  fireEvent.click(screen.getByRole('option', { name: 'A/Dest.md' }))
  fireEvent.change(await screen.findByRole('combobox', { name: 'Value for status' }), { target: { value: 'source' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Original Note' }), { target: { value: 'keep' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview Merge' }))
  await screen.findByRole('heading', { name: 'Merge Preview' })
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Merge' }))
  await waitFor(() => expect(apply).toHaveBeenCalledOnce())
  expect(state.close).toHaveBeenCalledOnce()
})

it('searches exact Markdown destinations and reviews explicit property, placement and source choices without writes', async () => {
  const state = fixture(), before = [...state.contents]
  render(<NoteMergeReview {...state.props} />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Dest' } })
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['A/Dest.md', 'B/Dest.markdown'])
  fireEvent.click(screen.getByRole('option', { name: 'A/Dest.md' }))
  const property = await screen.findByRole('combobox', { name: 'Value for status' })
  expect((screen.getByRole('button', { name: 'Preview Merge' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(property, { target: { value: 'source' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Placement' }), { target: { value: 'prepend' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview Merge' }))
  await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
  expect(screen.queryByRole('alert')?.textContent).toBeUndefined()
  await screen.findByRole('heading', { name: 'Merge Preview' })
  expect(state.preview.mock.calls[0]![0]).toEqual({ placement: 'prepend', sourceDisposition: 'trash', propertyChoices: { status: 'source' } })
  expect(screen.getByLabelText('Destination Content').textContent).toContain('# Source\n\n# Destination')
  expect(screen.getByText('Ref.md')).toBeTruthy()
  expect(screen.getByText(/Choose Keep Original and preview again/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: 'Original Note' }), { target: { value: 'keep' } })
  expect(screen.queryByRole('heading', { name: 'Merge Preview' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Preview Merge' }))
  await screen.findByRole('heading', { name: 'Merge Preview' })
  expect(screen.queryByText(/Choose Keep Original and preview again/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(state.close).toHaveBeenCalledOnce()
  expect([...state.contents]).toEqual(before)
})

it('cancels late previews on decision changes and invalidates a finished review when its owner changes', async () => {
  const state = fixture()
  const result = await state.preview({ placement: 'append', sourceDisposition: 'trash', propertyChoices: { status: 'source' } }, new AbortController().signal)
  let finish!: (value: typeof result) => void
  state.preview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<NoteMergeReview {...state.props} />)
  fireEvent.click(screen.getByRole('option', { name: 'A/Dest.md' }))
  fireEvent.change(await screen.findByRole('combobox', { name: 'Value for status' }), { target: { value: 'source' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview Merge' }))
  const signal = state.preview.mock.calls.at(-1)![1]
  fireEvent.change(screen.getByRole('combobox', { name: 'Original Note' }), { target: { value: 'keep' } })
  expect(signal.aborted).toBe(true)
  await act(async () => { finish(result) })
  expect(screen.queryByRole('heading', { name: 'Merge Preview' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Preview Merge' }))
  await screen.findByRole('heading', { name: 'Merge Preview' })
  act(() => { state.owner.abort() })
  expect(screen.queryByRole('heading', { name: 'Merge Preview' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('Select a destination again')
})

it('supports Shift+Enter prepend and Escape cancellation, and ignores a late document reply after cancel', async () => {
  const state = fixture()
  const prepared = await state.prepare('A/Dest.md', new AbortController().signal)
  let finish!: (value: typeof prepared) => void
  state.prepare.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(<NoteMergeReview {...state.props} />)
  const input = screen.getByRole('combobox')
  await waitFor(() => { expect(screen.getByRole('option', { name: 'A/Dest.md' }).getAttribute('data-selected')).toBe('true') })
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
  const signal = state.prepare.mock.calls.at(-1)![1]
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(state.close).toHaveBeenCalledOnce()
  expect(signal.aborted).toBe(true)
  await act(async () => { finish(prepared) })
  expect(screen.queryByRole('combobox', { name: 'Placement' })).toBeNull()
  view.unmount()
  render(<NoteMergeReview {...state.props} />)
  await waitFor(() => { expect(screen.getByRole('option', { name: 'A/Dest.md' }).getAttribute('data-selected')).toBe('true') })
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', shiftKey: true })
  expect((await screen.findByRole('combobox', { name: 'Placement' }) as HTMLSelectElement).value).toBe('prepend')
})

it.each([[' Note.md'], [' Note.md', 'Note.md']])('prepends into the exact leading-space filename among %j', async (...paths) => {
  const state = fixture()
  const prepare = vi.fn(async (path: string, signal: AbortSignal) => {
    const result = await state.prepare(path, signal)
    return { ...result, destination: { ...result.destination, path } }
  })
  render(<NoteMergeReview {...state.props} paths={paths} onPrepare={prepare} />)
  await waitFor(() => { expect(screen.getAllByRole('option').find(option => option.textContent === ' Note.md')?.getAttribute('data-selected')).toBe('true') })
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', shiftKey: true })
  expect((await screen.findByRole('combobox', { name: 'Placement' }) as HTMLSelectElement).value).toBe('prepend')
  expect(prepare.mock.calls[0]![0]).toBe(' Note.md')
})

it('shows preparation errors, excludes unsupported and same-file candidates, and aborts on unmount', async () => {
  const state = fixture()
  state.prepare.mockRejectedValueOnce(new Error('Save conflict: reload the destination.'))
  const view = render(<NoteMergeReview {...state.props} />)
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['A/Dest.md', 'B/Dest.markdown', 'Ref.md'])
  fireEvent.click(screen.getByRole('option', { name: 'A/Dest.md' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Save conflict')
  fireEvent.click(screen.getByRole('option', { name: 'A/Dest.md' }))
  await screen.findByRole('combobox', { name: 'Placement' })
  view.unmount()
  expect(state.prepare.mock.calls.at(-1)![1].aborted).toBe(true)
})
