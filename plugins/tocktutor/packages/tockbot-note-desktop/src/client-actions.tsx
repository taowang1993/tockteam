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
): Promise<NativeActionResult> {
  const { authorization } = await bridge.authorize(operation)
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
    return dispatchStatus(await nativeCall(bridge, 'activate-vault', signal, (authorization, ownerSignal) => (
      remote.tocktutorDesktop.activateVault(authorization, ownerSignal)
    )))
  }
  if (event.request.action === 'open' && event.request.paneType === 'window') {
    if (owner.vault === null || event.request.file === undefined) return 'failed'
    return dispatchStatus(await nativeCall(bridge, 'popout-open', signal, (authorization, ownerSignal) => (
      remote.tocktutorDesktop.openPopOut(authorization, event.request.file!, owner.vault!, ownerSignal)
    )))
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
  const [busy, setBusy] = useState<string | null>(null)
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
      controller.abort()
      if (lifetime.current === controller) lifetime.current = undefined
      void props.bridge.cancelDispatch().catch(() => {})
    }
  }, [props.bridge, props.remote])

  const run = async (
    label: string,
    operation: DesktopCallerOperation,
    call: (authorization: string, signal: AbortSignal) => Promise<RemoteResult<NativeActionResult>>,
  ): Promise<NativeActionResult | undefined> => {
    const signal = lifetime.current?.signal
    if (signal === undefined || signal.aborted) return undefined
    setBusy(label)
    setMessage(`${label}…`)
    try {
      const { authorization } = await props.bridge.authorize(operation)
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
  ) => async (): Promise<void> => {
    if (props.activePath === null || props.vault === null) return
    await run(label, operation, (authorization, signal) => (
      call(authorization, props.activePath!, props.vault!, signal)
    ))
  }

  const button = (label: string, action: () => Promise<void>, enabled = true): ReactNode => (
    <button disabled={!enabled || busy !== null} key={label} onClick={() => { void action() }} type="button">
      {busy === label ? `${label}…` : label}
    </button>
  )

  return (
    <div aria-label="Desktop Note Actions" className="tocktutor-desktop-actions tocktutor-native-actions-styles" role="group">
      <div className="tocktutor-desktop-actions-grid">
        {button('Choose Vault', async () => {
          await run('Choosing Vault', 'activate-vault', (authorization, signal) => (
            props.remote.tocktutorDesktop.activateVault(authorization, signal)
          ))
        })}
        {button('Reveal Entry', withNote('Revealing Entry', 'reveal-entry', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.revealEntry(authorization, path, vault, signal)
        )), hasNote)}
        {button('Open Pop-Out', withNote('Opening Pop-Out', 'popout-open', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.openPopOut(authorization, path, vault, signal)
        )), hasNote)}
        {button('Close Pop-Out', withNote('Closing Pop-Out', 'popout-close', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.closePopOut(authorization, path, vault, signal)
        )), hasNote)}
        {button('Close All Pop-Outs', async () => {
          if (props.vault === null) return
          await run('Closing Pop-Outs', 'popout-close-all', (authorization, signal) => (
            props.remote.tocktutorDesktop.closeAllPopOuts(authorization, props.vault!, signal)
          ))
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
        {button('Print Note', withNote('Printing Note', 'print', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.printNote(authorization, path, vault, signal)
        )), hasNote)}
        {button('Export HTML', withNote('Exporting HTML', 'export-html', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.exportNote(authorization, 'html', path, vault, signal)
        )), hasNote)}
        {button('Export PDF', withNote('Exporting PDF', 'export-pdf', (authorization, path, vault, signal) => (
          props.remote.tocktutorDesktop.exportNote(authorization, 'pdf', path, vault, signal)
        )), hasNote)}
      </div>
      <p aria-live="polite" role="status">{message}</p>
    </div>
  )
}
