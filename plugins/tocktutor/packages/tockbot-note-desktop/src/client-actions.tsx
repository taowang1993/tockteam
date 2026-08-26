import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  DesktopCallerOperation,
  TockTutorDesktopCallerBridge,
  TockTutorDesktopDispatchEvent,
} from '@tockteam/desktop/client'
import type {
  TockTutorNativeActionsDispatchEvent,
  TockTutorNativeActionsDispatchResult,
  TockTutorNativeActionsOwnerProps,
  VaultReference,
} from '@tockteam/tocktutor-workbench/client'
import type { NativeActionResult } from './types.ts'

export type DesktopDispatchDelivery = TockTutorDesktopDispatchEvent
export type DesktopCallerBridge = TockTutorDesktopCallerBridge

export interface DesktopActionRemote {
  tocktutorDesktop: {
    activateVault(authorization: string, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>
    closeAllPopOuts(
      authorization: string,
      expectedVault: VaultReference,
      signal?: AbortSignal,
    ): Promise<RemoteResult<NativeActionResult>>
    closePopOut(
      authorization: string,
      path: string,
      expectedVault: VaultReference,
      signal?: AbortSignal,
    ): Promise<RemoteResult<NativeActionResult>>
    exportNote(
      authorization: string,
      format: 'html' | 'pdf',
      path: string,
      expectedVault: VaultReference,
      signal?: AbortSignal,
    ): Promise<RemoteResult<NativeActionResult>>
    openPopOut(
      authorization: string,
      path: string,
      expectedVault: VaultReference,
      signal?: AbortSignal,
    ): Promise<RemoteResult<NativeActionResult>>
    printNote(
      authorization: string,
      path: string,
      expectedVault: VaultReference,
      signal?: AbortSignal,
    ): Promise<RemoteResult<NativeActionResult>>
    requestMicrophone(
      authorization: string,
      expectedVault: VaultReference,
      signal?: AbortSignal,
    ): Promise<RemoteResult<NativeActionResult>>
    revealEntry(
      authorization: string,
      path: string,
      expectedVault: VaultReference,
      signal?: AbortSignal,
    ): Promise<RemoteResult<NativeActionResult>>
  }
}

export interface DesktopDispatchLoopOptions {
  active?: () => boolean
  bridge: DesktopCallerBridge
  owner: () => TockTutorNativeActionsOwnerProps | undefined
  remote: DesktopActionRemote
  signal?: AbortSignal
}

function responseWasLost(result: RemoteResult<NativeActionResult>): boolean {
  return !result.ok && result.error.code === 'transport'
}

function valueOf(result: RemoteResult<NativeActionResult>): NativeActionResult {
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

async function completeDispatch(
  bridge: DesktopCallerBridge,
  request: Parameters<DesktopCallerBridge['completeDispatch']>[0],
): Promise<void> {
  try {
    await bridge.completeDispatch(request)
  } catch {
    try {
      await bridge.completeDispatch(request)
    } catch (error) {
      try {
        await bridge.cancelDispatch()
      } catch (cancelError) {
        throw new AggregateError([error, cancelError], 'Desktop dispatch rollback failed.')
      }
      throw error
    }
  }
}

async function nativeCall(
  bridge: DesktopCallerBridge,
  operation: DesktopCallerOperation,
  signal: AbortSignal | undefined,
  call: (authorization: string, signal?: AbortSignal) => Promise<RemoteResult<NativeActionResult>>,
  expectedVault?: VaultReference,
): Promise<NativeActionResult> {
  const { authorization } = await bridge.authorize(operation, expectedVault)
  let result = await call(authorization, signal)
  if (responseWasLost(result)) result = await call(authorization, signal)
  return valueOf(result)
}

function dispatchStatus(result: NativeActionResult): TockTutorNativeActionsDispatchResult {
  if (result.status === 'stale') return 'stale'
  return result.status === 'activated' || result.status === 'focused' || result.status === 'opened'
    ? 'handled'
    : 'failed'
}

async function saveCurrent(owner: TockTutorNativeActionsOwnerProps): Promise<boolean> {
  return owner.saveCurrent === undefined ? true : await owner.saveCurrent()
}

function workbenchEvent(event: DesktopDispatchDelivery): TockTutorNativeActionsDispatchEvent {
  return event.kind === 'quick-action'
    ? { action: event.action, kind: 'quick-action', operationId: event.operationId }
    : { kind: 'protocol', operationId: event.operationId, request: event.request }
}

async function handleDesktopDispatch(
  event: DesktopDispatchDelivery,
  owner: TockTutorNativeActionsOwnerProps,
  bridge: DesktopCallerBridge,
  remote: DesktopActionRemote,
  signal?: AbortSignal,
): Promise<TockTutorNativeActionsDispatchResult> {
  if (event.kind !== 'protocol') return owner.handleDispatch(workbenchEvent(event))
  if (event.request.action === 'choose-vault') {
    if (!await saveCurrent(owner)) return 'failed'
    return dispatchStatus(await nativeCall(bridge, 'activate-vault', signal, (authorization, ownerSignal) => (
      remote.tocktutorDesktop.activateVault(authorization, ownerSignal)
    )))
  }
  if (event.request.action === 'open' && event.request.paneType === 'window') {
    if (owner.vault === null || event.request.file === undefined || !await saveCurrent(owner)) return 'failed'
    return dispatchStatus(await nativeCall(bridge, 'popout-open', signal, (authorization, ownerSignal) => (
      remote.tocktutorDesktop.openPopOut(authorization, event.request.file!, owner.vault!, ownerSignal)
    ), owner.vault))
  }
  return owner.handleDispatch(workbenchEvent(event))
}

export interface AudioMediaDevices {
  getUserMedia(constraints: { audio: true; video: false }): Promise<{
    getTracks(): Array<{ stop(): void }>
  }>
}

/** Complete permission only while the initiating note and vault remain current. */
export async function requestMicrophoneAccess(
  authorization: string,
  path: string,
  vault: VaultReference,
  current: () => Pick<TockTutorNativeActionsOwnerProps, 'activePath' | 'vault'>,
  request: (authorization: string, vault: VaultReference) => Promise<RemoteResult<NativeActionResult>>,
  mediaDevices: AudioMediaDevices,
): Promise<RemoteResult<NativeActionResult>> {
  const result = await request(authorization, vault)
  if (!result.ok || result.value.status !== 'granted') return result
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false })
  try {
    const owner = current()
    if (owner.activePath !== path || owner.vault?.id !== vault.id
      || owner.vault.generation !== vault.generation) {
      return { ok: true, value: { status: 'stale' } }
    }
    return result
  } finally {
    for (const track of stream.getTracks()) track.stop()
  }
}

export interface AudioMediaRecorder {
  readonly mimeType: string
  readonly state: string
  addEventListener(type: 'dataavailable' | 'error' | 'stop', listener: (event?: { data: Blob }) => void): void
  start(): void
  stop(): void
}

export interface AudioRecording {
  cancel(): void
  stop(): Promise<
    | { dataBase64: string; fileName: string; status: 'recorded' }
    | { status: 'failed' | 'stale' | 'too-large' }
  >
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

function sameRecordingOwner(
  path: string,
  vault: VaultReference,
  current: Pick<TockTutorNativeActionsOwnerProps, 'activePath' | 'vault'>,
): boolean {
  return current.activePath === path && current.vault?.id === vault.id
    && current.vault.generation === vault.generation
}

function recordingExtension(mimeType: string): string | null {
  switch (mimeType.toLowerCase().split(';', 1)[0]) {
    case 'audio/mp4': return '.m4a'
    case 'audio/ogg': return '.ogg'
    case 'audio/wav': return '.wav'
    case 'audio/webm': return '.weba'
    default: return null
  }
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}

/** Record only after Desktop grants the exact live note, then re-check it before returning bytes. */
export async function startAudioRecording(
  authorization: string,
  path: string,
  vault: VaultReference,
  current: () => Pick<TockTutorNativeActionsOwnerProps, 'activePath' | 'vault'>,
  request: (authorization: string, vault: VaultReference) => Promise<RemoteResult<NativeActionResult>>,
  mediaDevices: AudioMediaDevices,
  createRecorder: (stream: Awaited<ReturnType<AudioMediaDevices['getUserMedia']>>) => AudioMediaRecorder,
  now: () => Date = () => new Date(),
  readBlob: (blob: Blob) => Promise<ArrayBuffer> = blob => blob.arrayBuffer(),
): Promise<
  | { result: RemoteResult<NativeActionResult>; status: 'not-started' }
  | { recording: AudioRecording; status: 'recording' }
> {
  const result = await request(authorization, vault)
  if (!result.ok || result.value.status !== 'granted') return { result, status: 'not-started' }
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false })
  const tracks = stream.getTracks()
  const cleanup = (): void => { for (const track of tracks) track.stop() }
  if (!sameRecordingOwner(path, vault, current())) {
    cleanup()
    return { result: { ok: true, value: { status: 'stale' } }, status: 'not-started' }
  }

  let recorder: AudioMediaRecorder
  try {
    recorder = createRecorder(stream)
  } catch (error) {
    cleanup()
    throw error
  }
  const extension = recordingExtension(recorder.mimeType)
  if (extension === null) {
    cleanup()
    return { result: { ok: true, value: { status: 'unavailable' } }, status: 'not-started' }
  }
  const chunks: Blob[] = []
  let bytes = 0
  let cancelled = false
  let settled = false
  let resolve!: (result: Awaited<ReturnType<AudioRecording['stop']>>) => void
  const completed = new Promise<Awaited<ReturnType<AudioRecording['stop']>>>(finish => { resolve = finish })
  const finish = (value: Awaited<ReturnType<AudioRecording['stop']>>): void => {
    if (settled) return
    settled = true
    cleanup()
    resolve(value)
  }
  recorder.addEventListener('dataavailable', event => {
    if (event === undefined || event.data.size === 0 || settled) return
    bytes += event.data.size
    if (bytes <= MAX_AUDIO_BYTES) chunks.push(event.data)
  })
  recorder.addEventListener('error', () => { finish({ status: 'failed' }) })
  recorder.addEventListener('stop', () => {
    if (cancelled) {
      finish({ status: 'stale' })
      return
    }
    if (bytes > MAX_AUDIO_BYTES) {
      finish({ status: 'too-large' })
      return
    }
    if (!sameRecordingOwner(path, vault, current())) {
      finish({ status: 'stale' })
      return
    }
    void readBlob(new Blob(chunks, { type: recorder.mimeType }))
      .then(buffer => {
        if (!sameRecordingOwner(path, vault, current())) {
          finish({ status: 'stale' })
          return
        }
        const timestamp = now().toISOString().slice(0, 19).replace('T', ' ').replaceAll(':', '-')
        finish({ dataBase64: base64(new Uint8Array(buffer)), fileName: `Recording ${timestamp}${extension}`, status: 'recorded' })
      })
      .catch(() => { finish({ status: 'failed' }) })
  })
  try {
    recorder.start()
  } catch (error) {
    cleanup()
    throw error
  }
  return {
    status: 'recording',
    recording: {
      cancel() {
        cancelled = true
        if (recorder.state === 'recording') recorder.stop()
        else finish({ status: 'stale' })
      },
      async stop() {
        if (recorder.state === 'recording') recorder.stop()
        return completed
      },
    },
  }
}

/** Consume the trusted-main dispatch facade until Desktop closes the consumer. */
export async function runDesktopDispatchLoop(options: DesktopDispatchLoopOptions): Promise<void> {
  const active = options.active ?? (() => true)
  while (active() && !options.signal?.aborted) {
    const event = await options.bridge.nextDispatch()
    if (event === null) return
    if (!active()) {
      await completeDispatch(options.bridge, {
        deliveryId: event.deliveryId,
        operationId: event.operationId,
        status: 'stale',
      })
      return
    }
    let status: TockTutorNativeActionsDispatchResult = 'stale'
    const owner = options.owner()
    if (owner !== undefined) {
      try {
        status = await handleDesktopDispatch(
          event,
          owner,
          options.bridge,
          options.remote,
          options.signal,
        )
      } catch {
        status = 'failed'
      }
    }
    if (!active()) status = 'stale'
    await completeDispatch(options.bridge, {
      deliveryId: event.deliveryId,
      operationId: event.operationId,
      status,
    })
  }
}

export function replaceActionController(
  current?: AbortController,
  reset: () => void = () => {},
): AbortController {
  current?.abort()
  reset()
  return new AbortController()
}

export type TockTutorNativeActionsProps = TockTutorNativeActionsOwnerProps & {
  bridge: DesktopCallerBridge
  remote: DesktopActionRemote
}

function resultMessage(result: NativeActionResult): string {
  switch (result.status) {
    case 'activated': return 'Vault selected.'
    case 'closed': return 'Pop-out closed.'
    case 'exported': return 'Note exported.'
    case 'focused': return 'Pop-out focused.'
    case 'granted': return 'Microphone ready.'
    case 'opened': return 'Pop-out opened.'
    case 'printed': return 'Print request opened.'
    case 'revealed': return 'Entry revealed.'
    case 'cancelled': return 'Action cancelled.'
    case 'denied': return 'Action denied.'
    case 'stale': return 'The note or vault changed. Try again.'
    case 'unavailable': return 'This native action is unavailable.'
  }
}


/** Accessible contribution for Workbench's root-scoped Native Actions seat. */
export function TockTutorNativeActions(props: TockTutorNativeActionsProps): ReactNode {
  const owner = useRef<TockTutorNativeActionsOwnerProps>(props)
  const lifetime = useRef<AbortController>()
  const activeRecording = useRef<AudioRecording>()
  const [busy, setBusy] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState('Ready.')
  const hasNote = props.activePath !== null && props.vault !== null

  useEffect(() => {
    owner.current = props
  }, [props])

  useEffect(() => {
    let active = true
    const controller = replaceActionController(lifetime.current, () => { setBusy(null) })
    lifetime.current = controller
    void runDesktopDispatchLoop({
      active: () => active,
      bridge: props.bridge,
      owner: () => owner.current,
      remote: props.remote,
      signal: controller.signal,
    }).catch(() => { if (active) setMessage('Desktop dispatch is unavailable.') })
    return () => {
      active = false
      activeRecording.current?.cancel()
      activeRecording.current = undefined
      controller.abort()
      if (lifetime.current === controller) lifetime.current = undefined
      void props.bridge.cancelDispatch().catch(() => {})
    }
  }, [props.bridge, props.remote])

  const run = async (
    label: string,
    operation: DesktopCallerOperation,
    call: (authorization: string, signal: AbortSignal) => Promise<RemoteResult<NativeActionResult>>,
    expectedVault?: VaultReference,
  ): Promise<NativeActionResult | undefined> => {
    const signal = lifetime.current?.signal
    if (signal === undefined || signal.aborted) return undefined
    setBusy(label)
    setMessage(`${label}…`)
    try {
      const { authorization } = await props.bridge.authorize(operation, expectedVault)
      let response = await call(authorization, signal)
      if (responseWasLost(response) && !signal.aborted) response = await call(authorization, signal)
      const result = valueOf(response)
      if (!signal.aborted) setMessage(resultMessage(result))
      return result
    } catch {
      if (!signal.aborted) setMessage('The native action failed safely.')
      return undefined
    } finally {
      if (!signal.aborted) setBusy(null)
    }
  }

  const withNote = (
    label: string,
    operation: DesktopCallerOperation,
    call: (
      authorization: string,
      path: string,
      vault: VaultReference,
      signal: AbortSignal,
    ) => Promise<RemoteResult<NativeActionResult>>,
    saveFirst = false,
  ) => async (): Promise<void> => {
    if (props.activePath === null || props.vault === null || (saveFirst && !await saveCurrent(props))) return
    await run(label, operation, (authorization, signal) => (
      call(authorization, props.activePath!, props.vault!, signal)
    ), props.vault)
  }

  const startRecording = async (): Promise<void> => {
    const signal = lifetime.current?.signal
    if (signal === undefined || signal.aborted || props.activePath === null || props.vault === null || props.storeAudio === undefined) return
    setBusy('Starting Recording')
    setMessage('Starting Recording…')
    try {
      const path = props.activePath
      const vault = props.vault
      const { authorization } = await props.bridge.authorize('microphone', vault)
      const started = await startAudioRecording(
        authorization,
        path,
        vault,
        () => owner.current,
        async (token, expectedVault) => {
          let response = await props.remote.tocktutorDesktop.requestMicrophone(token, expectedVault, signal)
          if (responseWasLost(response) && !signal.aborted) response = await props.remote.tocktutorDesktop.requestMicrophone(token, expectedVault, signal)
          return response
        },
        navigator.mediaDevices,
        stream => new MediaRecorder(stream as MediaStream) as unknown as AudioMediaRecorder,
      )
      if (started.status !== 'recording') {
        if (!signal.aborted) setMessage(started.result.ok ? resultMessage(started.result.value) : 'Audio recording is unavailable.')
        return
      }
      activeRecording.current = started.recording
      setRecording(true)
      setMessage('Recording Audio…')
    } catch {
      if (!signal.aborted) setMessage('Audio recording could not start.')
    } finally {
      if (!signal.aborted) setBusy(null)
    }
  }

  const stopRecording = async (): Promise<void> => {
    const signal = lifetime.current?.signal
    const currentRecording = activeRecording.current
    if (signal === undefined || currentRecording === undefined) return
    setBusy('Stopping Recording')
    setMessage('Stopping Recording…')
    const result = await currentRecording.stop()
    if (activeRecording.current === currentRecording) activeRecording.current = undefined
    if (signal.aborted) return
    setRecording(false)
    if (result.status === 'recorded') {
      const stored = await owner.current.storeAudio?.(result.fileName, result.dataBase64)
      setMessage(stored === true ? 'Audio recording added to the note.' : 'The audio recording could not be added safely.')
    } else {
      setMessage(result.status === 'stale'
        ? 'The note or vault changed. The recording was discarded.'
        : result.status === 'too-large' ? 'The audio recording exceeded 25 MiB.' : 'Audio recording failed safely.')
    }
    setBusy(null)
  }

  const button = (label: string, action: () => Promise<void>, enabled = true): ReactNode => (
    <Button unstyled
      className="min-h-9 cursor-pointer rounded-lg border border-[var(--tt-border,#d9dde5)] bg-[var(--tt-bg,#f7f8fa)] px-2.5 py-[7px] text-left text-inherit enabled:hover:border-[var(--tt-accent,#2457d6)] focus-visible:border-[var(--tt-accent,#2457d6)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--tt-accent,#2457d6)_28%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!enabled || busy !== null}
      key={label}
      onClick={() => { void action() }}
      type="button"
    >
      {busy === label ? `${label}…` : label}
    </Button>
  )

  return (
    <div aria-label="Desktop Note Actions" className="tocktutor-desktop-actions grid gap-2 px-[18px] pt-3.5 pb-[18px]" role="group">
      <div className="tocktutor-desktop-actions-grid grid grid-cols-2 gap-2">
        {button('Choose Vault', async () => {
          if (!await saveCurrent(props)) return
          await run('Choosing Vault', 'activate-vault', (authorization, signal) => (
            props.remote.tocktutorDesktop.activateVault(authorization, signal)
          ))
        })}
        {button('Reveal Entry', withNote('Revealing Entry', 'reveal-entry', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.revealEntry(authorization, path, vault, signal)
        )), hasNote)}
        {button('Open Pop-Out', withNote('Opening Pop-Out', 'popout-open', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.openPopOut(authorization, path, vault, signal)
        ), true), hasNote)}
        {button('Close Pop-Out', withNote('Closing Pop-Out', 'popout-close', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.closePopOut(authorization, path, vault, signal)
        )), hasNote)}
        {button('Close All Pop-Outs', async () => {
          if (props.vault === null) return
          await run('Closing Pop-Outs', 'popout-close-all', (authorization, signal) => (
            props.remote.tocktutorDesktop.closeAllPopOuts(authorization, props.vault!, signal)
          ), props.vault)
        }, props.vault !== null)}
        {button('Request Microphone', withNote('Requesting Microphone', 'microphone', (
          authorization,
          path,
          vault,
          signal,
        ) => requestMicrophoneAccess(
          authorization,
          path,
          vault,
          () => owner.current,
          (token, expectedVault) => props.remote.tocktutorDesktop.requestMicrophone(
            token,
            expectedVault,
            signal,
          ),
          navigator.mediaDevices,
        )), hasNote)}
        {recording
          ? button('Stop Recording', stopRecording)
          : button('Start Recording', startRecording, hasNote && props.storeAudio !== undefined && typeof MediaRecorder !== 'undefined')}
        {button('Print Note', withNote('Printing Note', 'print', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.printNote(authorization, path, vault, signal)
        ), true), hasNote)}
        {button('Export HTML', withNote('Exporting HTML', 'export-html', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.exportNote(authorization, 'html', path, vault, signal)
        ), true), hasNote)}
        {button('Export PDF', withNote('Exporting PDF', 'export-pdf', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.exportNote(authorization, 'pdf', path, vault, signal)
        ), true), hasNote)}
      </div>
      <Alert unstyled aria-live="polite" className="mt-1 mb-0 text-[var(--tt-muted,#667085)]" role="status">{message}</Alert>
    </div>
  )
}
