/** Browser face for the native TockTeam Desktop bridge. */

import type { DesktopBridge, DesktopCommand } from './contracts.ts'
import type { DesktopPanels } from '../plugins/panel-controls/src/client.ts'
import type { PinnedSummary } from '../plugins/pinned-summary/src/client.ts'
import type { WorkspaceTools } from '../plugins/sidebar/src/client.ts'
import type {
  LocaleMessages,
  LocaleService,
  Translate,
} from '../plugins/shared/i18n.ts'
import {
  TOCKTEAM_SURFACE_VIEW_SERVICE,
  type TockTeamSurfaceView,
} from '../plugins/shared/surface.ts'

interface WorkspaceView {
  workspaceId: string
}

interface WorkspacesService {
  create(input: { path: string }): Promise<WorkspaceView>
  startSession(workspaceId?: string): void
}

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
  reflect: { provide(name: string, value: unknown, options?: unknown): void }
}

declare global {
  interface Window {
    dshDesktop?: DesktopBridge
  }
}

const DESKTOP_TITLEBAR_HEIGHT = 40

const DESKTOP_CHROME_CSS = `
html[data-tockteam-desktop='true'] {
  --tockteam-titlebar-height: ${DESKTOP_TITLEBAR_HEIGHT}px;
}

html[data-tockteam-desktop='true'] body {
  box-sizing: border-box;
  padding-top: var(--tockteam-titlebar-height);
}

html[data-tockteam-desktop='true'] [data-slot='sidebar'] button:is(
  [aria-label='Collapse sidebar'],
  [aria-label='收起侧边栏']
) {
  display: none !important;
}

html[data-tockteam-desktop='true'] [data-slot='sidebar'] button:is(
  [aria-label='Open sidebar'],
  [aria-label='打开侧边栏']
) > svg:last-child {
  display: none !important;
}

html[data-tockteam-desktop='true'] body::before {
  content: '';
  position: fixed;
  z-index: 2147483647;
  top: 0;
  right: 0;
  left: 0;
  height: var(--tockteam-titlebar-height);
  background: var(--dsw-alias-bg-base);
  -webkit-app-region: drag;
  user-select: none;
}

html[data-tockteam-preview='true'] body::after {
  content: attr(data-tockteam-preview-label);
  position: fixed;
  z-index: 2147483647;
  top: 7px;
  left: 50%;
  max-width: 52vw;
  padding: 4px 11px;
  overflow: hidden;
  border: 1px solid #a9c2f5;
  border-radius: 999px;
  background: #edf3ff;
  color: #28549f;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  pointer-events: none;
  text-overflow: ellipsis;
  transform: translateX(-50%);
  white-space: nowrap;
}

html[data-tockteam-desktop='true'] #root:has(
  [role='presentation'] > [role='dialog']
) {
  z-index: 1000 !important;
  overflow: visible !important;
}

html[data-tockteam-desktop='true'] #root [role='presentation']:has(
  > [role='dialog']
) {
  z-index: 1000 !important;
  background: rgb(0 0 0 / 22%) !important;
  -webkit-backdrop-filter: blur(6px) saturate(0.9);
  backdrop-filter: blur(6px) saturate(0.9);
}

html[data-tockteam-desktop='true']:has(
  #root [role='presentation'] > [role='dialog']
) body::before,
html[data-tockteam-desktop='true']:has(
  #root [role='presentation'] > [role='dialog']
) body::after,
html[data-tockteam-desktop='true']:has(
  #root [role='presentation'] > [role='dialog']
) .tockteam-panel-toolbar,
html[data-tockteam-desktop='true']:has(
  #root [role='presentation'] > [role='dialog']
) #tockteam-sidebar-root,
html[data-tockteam-desktop='true']:has(
  #root [role='presentation'] > [role='dialog']
) #tockteam-rail-root,
html[data-tockteam-desktop='true']:has(
  #root [role='presentation'] > [role='dialog']
) [data-tockteam-pinned-summary],
html[data-tockteam-desktop='true']:has(
  #root [role='presentation'] > [role='dialog']
) #tockteam-plugin-marketplace-root {
  z-index: 999 !important;
}

html[data-tockteam-desktop='true']:has(
  #root [role='presentation'] > [role='dialog']
) #tockteam-plugin-marketplace-root {
  position: relative;
}

`

/** Wait for the DSH services used by native menu commands. */
export const inject = ['locale', 'workspaces', 'desktopPanels', 'pinnedSummary']

type DesktopShellMessage = 'preview.label'

const DESKTOP_SHELL_MESSAGES: LocaleMessages<DesktopShellMessage> = {
  en: {
    'preview.label': 'Isolated plugin preview · {plugin}',
  },
  zh: {
    'preview.label': '隔离插件预览 · {plugin}',
  },
}

function installDesktopChrome(): () => void {
  const originalTitle = document.title
  const style = document.createElement('style')
  style.dataset.tockteamDesktopChrome = 'true'
  style.textContent = DESKTOP_CHROME_CSS
  document.head.append(style)
  document.documentElement.dataset.tockteamDesktop = 'true'
  document.title = 'TockTeam Desktop'
  return () => {
    style.remove()
    delete document.documentElement.dataset.tockteamDesktop
    document.title = originalTitle
  }
}

function installHeroBranding(): () => void {
  const headlineCopy = new Set(['Into the Unknown', '探索未知之境', '探索未至之境'])
  const originalHeadlines = new Map<HTMLElement, string>()
  const synchronize = (): void => {
    for (const element of document.querySelectorAll<HTMLElement>('span')) {
      const text = element.textContent?.trim() ?? ''
      if (!headlineCopy.has(text)) continue
      if (!originalHeadlines.has(element)) originalHeadlines.set(element, text)
      element.textContent = 'TockTeam Desktop'
      element.dataset.tockteamHeroHeadline = 'true'
    }
  }
  const observer = new MutationObserver(synchronize)
  observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  synchronize()
  return () => {
    observer.disconnect()
    for (const [element, original] of originalHeadlines) {
      if (element.isConnected && element.textContent === 'TockTeam Desktop') element.textContent = original
      delete element.dataset.tockteamHeroHeadline
    }
  }
}

function focusComposer(): void {
  document.querySelector<HTMLTextAreaElement>('textarea')?.focus()
}

function findSettingsButton(): HTMLButtonElement | undefined {
  // rc.5 wraps the settings trigger content in a stable slot marker; the rail
  // trigger is the one inside the sidebar (the settings panel may render one).
  const slotted = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.querySelector('[data-slot="settings.trigger"]') !== null
      && button.closest('[data-slot="sidebar"]') !== null)
  if (slotted !== undefined) return slotted
  const labeled = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => /settings|设置/i.test([
      button.textContent,
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
    ].filter(Boolean).join(' ')))
  if (labeled !== undefined) return labeled
  // rc.5 collapsed rail: the settings trigger is an icon-only dialog opener.
  return [...document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')]
    .filter(button => button.closest('[data-slot="sidebar"]') !== null)
    .sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom)[0]
}

function showSettings(): void {
  findSettingsButton()?.click()
}

async function openPaths(workspaces: WorkspacesService, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    const workspace = await workspaces.create({ path })
    workspaces.startSession(workspace.workspaceId)
  }
}

function dispatch(
  command: DesktopCommand,
  workspaces: WorkspacesService,
  panels: DesktopPanels,
  pinnedSummary: PinnedSummary,
  workspaceTools: WorkspaceTools,
): void {
  switch (command.type) {
    case 'focus-composer':
      focusComposer()
      return
    case 'new-session':
      workspaces.startSession()
      return
    case 'open-paths':
      void openPaths(workspaces, command.paths).catch((error: unknown) => {
        console.error('tockteam-desktop: failed to open workspace', error)
      })
      return
    case 'show-settings':
      showSettings()
      return
    case 'toggle-sidebar':
      panels.toggleSidebar()
      return
    case 'toggle-bottom-panel':
      panels.toggleBottomPanel()
      return
    case 'toggle-panel-maximized':
      workspaceTools.togglePanelMaximized()
      return
    case 'toggle-pinned-summary':
      workspaceTools.setOpen(false)
      pinnedSummary.toggle()
      return
    case 'toggle-workspace-panel':
      workspaceTools.toggle()
      return
    case 'toggle-side-panel':
      workspaceTools.toggleSidePanel()
      return
    case 'open-browser':
      workspaceTools.openBrowser()
      return
    case 'open-files':
      workspaceTools.openFiles()
      return
    case 'open-review':
      workspaceTools.openReview()
      return
    case 'open-side-chat':
      void workspaceTools.openSideChat().catch((error: unknown) => {
        console.error('tockteam-desktop: failed to open side chat', error)
      })
      return
    case 'open-trajectory':
      workspaceTools.openTrajectory()
      return
    default:
      command satisfies never
  }
}

/** Enroll the isolated Electron bridge and map native actions to DSH services. */
export function apply(ctx: ClientContext): void {
  const bridge = window.dshDesktop
  if (bridge === undefined) {
    throw new Error('tockteam-desktop: preload bridge is unavailable outside TockTeam Desktop')
  }
  const workspaces = ctx.get('workspaces') as WorkspacesService
  const locale = ctx.get('locale') as LocaleService
  const t: Translate<DesktopShellMessage> = locale.bind('tockteam.desktop')
  const panels = ctx.get('desktopPanels') as DesktopPanels
  const pinnedSummary = ctx.get('pinnedSummary') as PinnedSummary
  ctx.effect(
    () => locale.register('tockteam.desktop', DESKTOP_SHELL_MESSAGES),
    'tockteam-desktop: shell dictionaries',
  )
  ctx.reflect.provide('desktopShell', bridge, undefined)
  // The unified three-surface contract, client plane: the desktop shell.
  ctx.reflect.provide(TOCKTEAM_SURFACE_VIEW_SERVICE, Object.freeze({
    kind: 'desktop',
  } satisfies TockTeamSurfaceView), undefined)
  ctx.effect(() => {
    let disposed = false
    let previewPluginId: string | null = null
    const renderPreviewLabel = (): void => {
      if (previewPluginId === null) return
      document.body.dataset.tockteamPreviewLabel = t('preview.label', {
        plugin: previewPluginId,
      })
    }
    const removeDesktopChrome = installDesktopChrome()
    const removeHeroBranding = installHeroBranding()
    const unsubscribeLocale = locale.subscribe(renderPreviewLabel)
    void bridge.getInfo().then(info => {
      if (disposed || info.preview === null) return
      previewPluginId = info.preview.pluginId
      document.documentElement.dataset.tockteamPreview = 'true'
      renderPreviewLabel()
    }).catch((error: unknown) => {
      console.error('tockteam-desktop: failed to read preview identity', error)
    })
    const unsubscribe = bridge.onCommand((command) => {
      dispatch(
        command,
        workspaces,
        panels,
        pinnedSummary,
        ctx.get('workspaceTools') as WorkspaceTools,
      )
    })
    return () => {
      disposed = true
      unsubscribe()
      unsubscribeLocale()
      removeHeroBranding()
      removeDesktopChrome()
      delete document.documentElement.dataset.tockteamPreview
      delete document.body.dataset.tockteamPreviewLabel
    }
  }, 'tockteam-desktop: native command bridge')
}
