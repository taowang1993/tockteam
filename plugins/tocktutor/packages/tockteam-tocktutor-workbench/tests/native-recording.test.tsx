import { Blob as NodeBlob } from 'node:buffer'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { TockTutorNativeActions, type DesktopActionRemote, type DesktopCallerBridge } from '../../tockbot-note-desktop/dist/client-actions.js'

// The Workbench seat exercises its real Desktop contribution with browser media at the boundary.
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function mountRecording() {
  const stopTrack = vi.fn()
  const storeAudio = vi.fn(async () => true)
  let recorder!: FakeRecorder
  class FakeRecorder {
    mimeType: string
    state = 'inactive'
    listeners = new Map<string, (event?: { data: Blob }) => void>()
    constructor(_stream: unknown, options?: MediaRecorderOptions) { this.mimeType = options?.mimeType ?? ''; recorder = this }
    addEventListener(type: string, listener: (event?: { data: Blob }) => void) { this.listeners.set(type, listener) }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.listeners.get('stop')?.() }
    chunk(size: number) { this.listeners.get('dataavailable')?.({ data: { size } as Blob }) }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('navigator', { userAgent: navigator.userAgent, mediaDevices: { async getUserMedia() { return { getTracks: () => [{ stop: stopTrack }] } } } })
  const view = render(<TockTutorNativeActions
    activePath="Note.md"
    vault={{ generation: 7, id: `vault:${'a'.repeat(64)}` }}
    bridge={{ authorize: async () => ({ authorization: 'test' }), nextDispatch: async () => null, cancelDispatch: async () => {} } as unknown as DesktopCallerBridge}
    remote={{ tocktutorDesktop: { requestMicrophone: async () => ({ ok: true, value: { status: 'granted' } }) } } as unknown as DesktopActionRemote}
    storeAudio={storeAudio}
  />)
  return { ...view, get recorder() { return recorder }, stopTrack, storeAudio }
}

test('the Workbench shows overflow immediately without a manual Stop click', async () => {
  const view = mountRecording()
  fireEvent.click(screen.getByRole('button', { name: 'Start Recording' }))
  await screen.findByRole('button', { name: 'Stop Recording' })
  act(() => { view.recorder.chunk(25 * 1024 * 1024 + 1) })
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('The audio recording exceeded 25 MiB.'))
  expect(screen.getByRole('button', { name: 'Start Recording' })).toBeTruthy()
  expect(view.stopTrack).toHaveBeenCalledTimes(1)
  expect(view.storeAudio).not.toHaveBeenCalled()
})

test('manual Stop stores one recording through the same completion handler', async () => {
  const view = mountRecording()
  fireEvent.click(screen.getByRole('button', { name: 'Start Recording' }))
  await screen.findByRole('button', { name: 'Stop Recording' })
  act(() => { view.recorder.listeners.get('dataavailable')?.({ data: new Blob(['voice']) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Audio recording added to the note.'))
  expect(view.storeAudio).toHaveBeenCalledTimes(1)
  expect(view.stopTrack).toHaveBeenCalledTimes(1)
})

test('late recording completion after the Workbench unmounts never stores audio', async () => {
  const view = mountRecording()
  fireEvent.click(screen.getByRole('button', { name: 'Start Recording' }))
  await screen.findByRole('button', { name: 'Stop Recording' })
  view.unmount()
  act(() => { view.recorder.chunk(25 * 1024 * 1024 + 1); view.recorder.listeners.get('stop')?.() })
  await Promise.resolve()
  expect(view.stopTrack).toHaveBeenCalledTimes(1)
  expect(view.storeAudio).not.toHaveBeenCalled()
})
