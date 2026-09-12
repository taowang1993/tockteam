import type { DesktopAppUpdateBridge } from '../../../../src/contracts.ts'
import type { DesktopAppUpdateState } from '../../../../src/desktop-app-update.ts'

export type DesktopUpdateAction = 'download' | 'install'

export type DesktopUpdateIndicatorState = Readonly<{
  status: 'available' | 'downloading' | 'downloaded'
  action: DesktopUpdateAction | null
  disabled: boolean
  progress: number | null
}>

export function desktopUpdateIndicatorState(
  state: DesktopAppUpdateState | null | undefined,
): DesktopUpdateIndicatorState | null {
  if (state === null || state === undefined || !state.enabled) return null
  switch (state.status) {
    case 'available':
      return { status: 'available', action: 'download', disabled: false, progress: null }
    case 'downloading':
      return { status: 'downloading', action: null, disabled: true, progress: state.downloadPercent }
    case 'downloaded':
      return { status: 'downloaded', action: 'install', disabled: false, progress: null }
    default:
      return null
  }
}

export function observeDesktopAppUpdate(
  appUpdate: DesktopAppUpdateBridge | undefined,
  onState: (state: DesktopAppUpdateState) => void,
): () => void {
  if (appUpdate === undefined) return () => {}
  let disposed = false
  let receivedChange = false
  const remove = appUpdate.onStateChange(state => {
    receivedChange = true
    if (!disposed) onState(state)
  })
  void appUpdate.getState().then(state => {
    if (!disposed && !receivedChange) onState(state)
  }).catch(() => {})
  return () => {
    disposed = true
    remove()
  }
}

export async function runDesktopUpdateAction(
  appUpdate: DesktopAppUpdateBridge | undefined,
  action: DesktopUpdateAction | null,
): Promise<void> {
  if (appUpdate === undefined || action === null) return
  try {
    await (action === 'download' ? appUpdate.download() : appUpdate.install())
  } catch {
    // The updater state owner publishes its bounded error state.
  }
}
