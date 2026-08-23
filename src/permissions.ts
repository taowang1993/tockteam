export function originOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

export function allowsTrustedMainIpc(input: {
  isMainFrame: boolean
  mainWindowId: number | undefined
  runtimeOrigin: string | undefined
  senderDestroyed: boolean
  senderId: number
  senderOrigin: string | undefined
}): boolean {
  return !input.senderDestroyed && input.isMainFrame
    && input.mainWindowId !== undefined && input.senderId === input.mainWindowId
    && input.runtimeOrigin !== undefined && input.senderOrigin === input.runtimeOrigin
}

export function allowsRuntimeMicrophone(input: {
  isMainFrame: boolean
  mediaTypes: readonly string[]
  requestingOrigin: string | undefined
  runtimeOrigin: string | undefined
  webContentsIsMainWindow: boolean
}): boolean {
  return input.mediaTypes.length === 1 && input.mediaTypes[0] === 'audio'
    && input.webContentsIsMainWindow && input.isMainFrame
    && input.runtimeOrigin !== undefined && input.requestingOrigin === input.runtimeOrigin
}

/** Allow only clipboard writes from the live DSH document in the main window. */
export function allowsRuntimeClipboardWrite(input: {
  isMainFrame: boolean
  permission: string
  requestingOrigin: string | undefined
  requestingUrl?: string
  runtimeOrigin: string | undefined
  webContentsIsMainWindow: boolean
}): boolean {
  if (input.permission !== 'clipboard-sanitized-write') return false
  if (!input.webContentsIsMainWindow || !input.isMainFrame) return false
  if (input.runtimeOrigin === undefined || originOf(input.requestingOrigin) !== input.runtimeOrigin) return false

  const requestingUrlOrigin = originOf(input.requestingUrl)
  return input.requestingUrl === undefined || requestingUrlOrigin === input.runtimeOrigin
}
