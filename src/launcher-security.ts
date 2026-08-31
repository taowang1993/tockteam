import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WebPreferences } from 'electron'
import type { LauncherRendererRole } from './launcher-window-contract.ts'

export const LAUNCHER_SESSION_PARTITION = 'persist:tockteam-launcher'

export const LAUNCHER_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'"

export const LAUNCHER_ROLE: LauncherRendererRole = 'launcher'

export type LauncherUrlPolicy = Readonly<{
  entryPath: string
  entryUrl: string
  isAllowed: (role: LauncherRendererRole, url: string) => boolean
}>

type PermissionSession = Readonly<{
  setPermissionCheckHandler: (handler: (...args: any[]) => boolean) => void
  setPermissionRequestHandler: (handler: (...args: any[]) => void) => void
}>

type LauncherWebContents = Readonly<{
  getURL: () => string
  id: number
  isDestroyed?: () => boolean
  mainFrame: unknown
  session: unknown
}>

type LauncherWindow = Readonly<{
  isDestroyed?: () => boolean
  webContents: LauncherWebContents
}>

type LauncherIpcEvent = Readonly<{
  sender?: LauncherWebContents
  senderFrame?: Readonly<{ url?: unknown }>
}>

export function createLauncherWebPreferences(args: Readonly<{
  electronDir: string
  role?: LauncherRendererRole
}>): WebPreferences {
  if (args.role !== undefined && args.role !== LAUNCHER_ROLE) {
    throw new Error(`Unsupported launcher renderer role: ${String(args.role)}`)
  }
  return {
    contextIsolation: true,
    nodeIntegration: false,
    partition: LAUNCHER_SESSION_PARTITION,
    preload: resolve(args.electronDir, 'launcher-preload.cjs'),
    sandbox: true,
    webSecurity: true,
  }
}

export function applyLauncherSessionPolicy(targetSession: PermissionSession): void {
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    if (typeof callback === 'function') callback(false)
  })
  targetSession.setPermissionCheckHandler(() => false)
}

export function createLauncherUrlPolicy(args: Readonly<{
  launcherHtmlPath?: string
  electronDir?: string
}>): LauncherUrlPolicy {
  const entryPath = resolve(args.launcherHtmlPath ?? resolve(args.electronDir ?? '.', 'launcher.html'))
  const entryUrl = pathToFileURL(entryPath).href
  return Object.freeze({
    entryPath,
    entryUrl,
    isAllowed(role: LauncherRendererRole, url: string): boolean {
      return role === LAUNCHER_ROLE && url === entryUrl
    },
  })
}

export type LauncherIpcIdentity = Readonly<{
  role: LauncherRendererRole
  webContentsId: number
}>

export function createLauncherIpcGuard(args: Readonly<{
  launcherSession: unknown
  resolveWindow: (webContents: LauncherWebContents) => LauncherWindow | null
  roleOf: (window: LauncherWindow) => unknown
  urlPolicy: LauncherUrlPolicy
}>): Readonly<{
  assert: (event: unknown, expectedRole?: LauncherRendererRole) => LauncherIpcIdentity
}> {
  return Object.freeze({
    assert(event: unknown, expectedRole: LauncherRendererRole = LAUNCHER_ROLE): LauncherIpcIdentity {
      const candidate = event as LauncherIpcEvent | null
      const sender = candidate?.sender
      if (sender === undefined
        || typeof sender.getURL !== 'function'
        || (typeof sender.isDestroyed === 'function' && sender.isDestroyed())
        || !Number.isSafeInteger(sender.id)
        || sender.id <= 0) {
        throw new Error('Blocked launcher IPC from an invalid webContents sender')
      }

      const window = args.resolveWindow(sender)
      if (window === null
        || (typeof window.isDestroyed === 'function' && window.isDestroyed())
        || window.webContents !== sender) {
        throw new Error('Blocked launcher IPC from an unregistered webContents')
      }

      const senderFrame = candidate?.senderFrame
      if (senderFrame === undefined || sender.mainFrame === null
        || sender.mainFrame === undefined || senderFrame !== sender.mainFrame) {
        throw new Error('Blocked launcher IPC outside the main frame')
      }

      let senderUrl: string
      try {
        senderUrl = sender.getURL()
      } catch {
        throw new Error(`Blocked launcher IPC from an unexpected ${expectedRole} URL`)
      }
      const frameUrl = senderFrame.url
      if (typeof frameUrl !== 'string'
        || frameUrl !== senderUrl
        || !args.urlPolicy.isAllowed(expectedRole, frameUrl)) {
        throw new Error(`Blocked launcher IPC from an unexpected ${expectedRole} URL`)
      }

      if (args.roleOf(window) !== expectedRole) {
        throw new Error('Blocked launcher IPC from an unexpected window role')
      }
      if (sender.session !== args.launcherSession) {
        throw new Error('Blocked launcher IPC from an unexpected session')
      }
      return Object.freeze({ role: expectedRole, webContentsId: sender.id })
    },
  })
}
