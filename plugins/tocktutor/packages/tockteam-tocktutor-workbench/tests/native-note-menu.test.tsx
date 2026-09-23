import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TockTutorNativeActions, type DesktopActionRemote, type DesktopCallerBridge } from '../../tockbot-note-desktop/src/client-actions.tsx'
import type { TockTutorNativeNoteActions } from '../src/native-actions.ts'

const vault = { generation: 7, id: `vault:${'a'.repeat(64)}` }
afterEach(cleanup)

function harness(saveCurrent = vi.fn(async () => true)) {
  const calls: string[] = []
  const bridge = {
    authorize: vi.fn(async (operation: string, expectedVault: unknown) => { calls.push(operation); expect(expectedVault).toEqual(vault); return { authorization: 'opaque-token' } }),
    nextDispatch: () => new Promise(() => {}),
    cancelDispatch: vi.fn(async () => {}),
  } as unknown as DesktopCallerBridge
  const result = async () => ({ ok: true as const, value: { status: 'opened' as const } })
  const remote = { tocktutorDesktop: { openInDefaultApp: vi.fn(result), copyAbsolutePath: vi.fn(result), openPopOut: vi.fn(result), exportNote: vi.fn(result), revealEntry: vi.fn(result) } } as unknown as DesktopActionRemote
  let actions: TockTutorNativeNoteActions | null = null
  const props = { activePath: 'Note.md', bridge, remote, vault, saveCurrent, handleDispatch: async () => 'handled' as const, publishNoteActions: (next: TockTutorNativeNoteActions | null) => { actions = next } }
  const view = render(<TockTutorNativeActions {...props} />)
  return { actions: () => actions!, bridge, calls, props, remote, saveCurrent, view }
}

it('opens the saved owner note with a distinct opaque authorization and reports failed saves', async () => {
  const h = harness()
  act(() => { h.actions().run('open-default') })
  await waitFor(() => expect(h.remote.tocktutorDesktop.openInDefaultApp).toHaveBeenCalledWith('opaque-token', 'Note.md', vault, expect.any(AbortSignal)))
  expect(h.calls).toEqual(['open-default-app'])
  await waitFor(() => expect(h.actions().message).toBe('Opened in the default app.'))
  expect(h.saveCurrent.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(h.bridge.authorize).mock.invocationCallOrder[0]!)
  h.saveCurrent.mockResolvedValue(false)
  await act(async () => { h.actions().run('open-default') })
  expect(h.calls).toHaveLength(1)
  expect(h.actions().message).toBe('The note could not be saved.')
})

it('cancels pending external opens after navigation away and back or a new draft', async () => {
  const h = harness()
  let finish!: (value: { authorization: string }) => void
  vi.mocked(h.bridge.authorize).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  act(() => { h.actions().run('open-default') })
  await waitFor(() => expect(h.calls.length === 0 && finish).toBeTruthy())
  h.view.rerender(<TockTutorNativeActions {...h.props} activePath="Other.md" />)
  h.view.rerender(<TockTutorNativeActions {...h.props} />)
  await act(async () => { finish({ authorization: 'late' }) })
  expect(h.remote.tocktutorDesktop.openInDefaultApp).not.toHaveBeenCalled()
  vi.mocked(h.bridge.authorize).mockResolvedValue({ authorization: 'fresh' })
  let signal: AbortSignal | undefined
  vi.mocked(h.remote.tocktutorDesktop.openInDefaultApp).mockImplementation(async (_auth, _path, _vault, ownerSignal) => {
    signal = ownerSignal
    return await new Promise(resolve => ownerSignal.addEventListener('abort', () => resolve({ ok: true, value: { status: 'cancelled' } }), { once: true }))
  })
  act(() => { h.actions().run('open-default') })
  await waitFor(() => expect(signal).toBeDefined())
  h.view.rerender(<TockTutorNativeActions {...h.props} noteSource="New unsaved draft" />)
  expect(signal?.aborted).toBe(true)
})

it('keeps microphone startup single-flight across draft edits and stops every acquired track', async () => {
  const stop = vi.fn()
  let release!: (value: { getTracks(): Array<{ stop(): void }> }) => void
  const getUserMedia = vi.fn(() => new Promise<{ getTracks(): Array<{ stop(): void }> }>(resolve => { release = resolve }))
  class Recorder extends EventTarget {
    state = 'inactive'
    mimeType = 'audio/webm'
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.dispatchEvent(new Event('stop')) }
  }
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const h = harness()
  h.remote.tocktutorDesktop.requestMicrophone = vi.fn(async () => ({ ok: true, value: { status: 'granted' } }))
  const storeAudio = vi.fn(async () => true)
  try {
    h.view.rerender(<TockTutorNativeActions {...h.props} storeAudio={storeAudio} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Recording', exact: true }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    h.view.rerender(<TockTutorNativeActions {...h.props} storeAudio={storeAudio} noteSource="New draft" />)
    const start = screen.getByRole('button', { name: 'Start Recording', exact: true }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    fireEvent.click(start)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    await act(async () => { release({ getTracks: () => [{ stop }] }) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Recording', exact: true })).toBeTruthy())
    h.view.unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  } finally { h.view.unmount(); vi.unstubAllGlobals() }
})

it('publishes the same note actions with save-before-authorization and opaque identity', async () => {
  const h = harness()
  for (const action of ['open-window', 'export-pdf', 'reveal', 'copy-absolute'] as const) {
    act(() => { h.actions().run(action) })
    await waitFor(() => expect(h.actions().disabled).toBe(false))
  }
  expect(h.calls).toEqual(['popout-open', 'export-pdf', 'reveal-entry', 'copy-absolute-path'])
  expect(h.saveCurrent).toHaveBeenCalledTimes(2)
  expect(h.saveCurrent.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(h.bridge.authorize).mock.invocationCallOrder[0]!)
  expect(h.remote.tocktutorDesktop.openPopOut).toHaveBeenCalledWith('opaque-token', 'Note.md', vault, expect.any(AbortSignal))
  expect(h.remote.tocktutorDesktop.exportNote).toHaveBeenCalledWith('opaque-token', 'pdf', 'Note.md', vault, expect.any(AbortSignal))
  expect(h.remote.tocktutorDesktop.revealEntry).toHaveBeenCalledWith('opaque-token', 'Note.md', vault, expect.any(AbortSignal))
  expect(h.remote.tocktutorDesktop.copyAbsolutePath).toHaveBeenCalledWith('opaque-token', 'Note.md', vault, expect.any(AbortSignal))
  const savedActions = h.actions()
  h.view.unmount()
  expect(h.actions()).toBeNull()
  savedActions.run('reveal')
  savedActions.run('open-window')
  expect(h.saveCurrent).toHaveBeenCalledTimes(2)
  expect(h.calls).toHaveLength(4)
})

it('never authorizes a shortcut after a failed save or a note change during save', async () => {
  const h = harness(vi.fn(async () => false))
  await act(async () => { h.actions().run('export-pdf') })
  expect(h.bridge.authorize).not.toHaveBeenCalled()
  let finish!: (value: boolean) => void
  const saveCurrent = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
  h.view.rerender(<TockTutorNativeActions {...h.props} saveCurrent={saveCurrent} />)
  act(() => { h.actions().run('open-window') })
  h.view.rerender(<TockTutorNativeActions {...h.props} activePath="Other.md" saveCurrent={saveCurrent} />)
  await act(async () => { finish(true) })
  expect(h.bridge.authorize).not.toHaveBeenCalled()
})

it('does not authorize when a pending save completes after contribution unload', async () => {
  let finish!: (value: boolean) => void
  const h = harness(vi.fn(() => new Promise<boolean>(resolve => { finish = resolve })))
  act(() => { h.actions().run('open-window') })
  h.view.unmount()
  await act(async () => { finish(true) })
  expect(h.bridge.authorize).not.toHaveBeenCalled()
})

it('drops authorization that arrives after navigation or contribution unload', async () => {
  const h = harness()
  let finish!: (value: { authorization: string }) => void
  vi.mocked(h.bridge.authorize).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  act(() => { h.actions().run('reveal') })
  h.view.rerender(<TockTutorNativeActions {...h.props} vault={{ ...vault, generation: 8 }} />)
  await act(async () => { finish({ authorization: 'late' }) })
  expect(h.remote.tocktutorDesktop.revealEntry).not.toHaveBeenCalled()
  act(() => { h.actions().run('reveal') })
  h.view.unmount()
  await act(async () => { finish({ authorization: 'later' }) })
  expect(h.remote.tocktutorDesktop.revealEntry).not.toHaveBeenCalled()
})
