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

export {
  isTockTutorPath,
  readTockTutorRouteLocation,
  resolveTockTutorNavigation,
  TOCKTUTOR_ROUTE_PREFIX,
  TOCKTUTOR_ROUTE_SLOT,
} from '../plugins/sidebar/src/client/tocktutor-route.ts'
export type {
  TockTutorNavigationMode,
  TockTutorRouteLocation,
  TockTutorRouteOwnerProps,
} from '../plugins/sidebar/src/client/tocktutor-route.ts'

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

html[data-tockteam-desktop='true'] [data-tockteam-sidebar-fish] {
  display: none !important;
}

html[data-tockteam-desktop='true'] [data-tockteam-sidebar-brand] {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: inherit;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}

html[data-tockteam-desktop='true'] [data-tockteam-sidebar-brand] svg,
html[data-tockteam-desktop='true'] [data-tockteam-sidebar-logo] {
  flex: none;
  width: 20px;
  height: 20px;
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

// Mirrors Tockbot's inline LogoMark component, with currentColor for theme-aware UI use.
const TOCKTEAM_LOGO_MARK = `
  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M10 5.5C6.96243 5.5 4.5 7.96243 4.5 11C4.5 14.0376 6.96243 16.5 10 16.5C13.0376 16.5 15.5 14.0376 15.5 11C15.5 7.96243 13.0376 5.5 10 5.5ZM2.5 11C2.5 6.85786 5.85786 3.5 10 3.5C14.1421 3.5 17.5 6.85786 17.5 11C17.5 15.1421 14.1421 18.5 10 18.5C5.85786 18.5 2.5 15.1421 2.5 11Z" fill="currentColor" />
    <path fill-rule="evenodd" clip-rule="evenodd" d="M2.79289 18.2071C3.18342 18.5976 3.81658 18.5976 4.20711 18.2071L5.70711 16.7071C6.09763 16.3166 6.09763 15.6834 5.70711 15.2929C5.31658 14.9023 4.68342 14.9023 4.29289 15.2929L2.79289 16.7929C2.40237 17.1834 2.40237 17.8166 2.79289 18.2071Z" fill="currentColor" />
    <path fill-rule="evenodd" clip-rule="evenodd" d="M14.2929 15.2929C14.6834 14.9024 15.3166 14.9024 15.7071 15.2929L17.2071 16.7929C17.5976 17.1834 17.5976 17.8166 17.2071 18.2071C16.8166 18.5977 16.1834 18.5977 15.7929 18.2071L14.2929 16.7071C13.9024 16.3166 13.9024 15.6834 14.2929 15.2929Z" fill="currentColor" />
    <path d="M7.5 10.5 L9.5 13 L13 8.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <path fill-rule="evenodd" clip-rule="evenodd" d="M6.33196 3.17163L2.57422 6.76042C2.57422 6.76042 2.49689 6.6895 2.38431 6.56157C2.12745 6.26968 1.68708 5.68098 1.56299 4.9606C1.45034 4.30659 1.59837 3.54403 2.3811 2.79649C3.16383 2.04896 3.93239 1.93613 4.58053 2.07874C5.29445 2.23581 5.86228 2.70277 6.14205 2.97278C6.26467 3.09112 6.33196 3.17163 6.33196 3.17163Z" fill="currentColor" />
    <path fill-rule="evenodd" clip-rule="evenodd" d="M13.668 3.17163L17.4258 6.76042C17.4258 6.76042 17.5031 6.6895 17.6157 6.56157C17.8726 6.26968 18.3129 5.68098 18.437 4.9606C18.5497 4.30659 18.4016 3.54403 17.6189 2.79649C16.8362 2.04896 16.0676 1.93613 15.4195 2.07874C14.7055 2.23581 14.1377 2.70277 13.8579 2.97278C13.7353 3.09112 13.668 3.17163 13.668 3.17163Z" fill="currentColor" />
  </svg>
`

function installBranding(): () => void {
  const headlineCopy = new Set(['Into the Unknown', '探索未知之境', '探索未至之境'])
  const originalHeadlines = new Map<HTMLElement, string>()
  const originalSidebarBrands = new Map<HTMLElement, SVGSVGElement>()
  const originalHeroLogos = new Map<HTMLSpanElement, SVGSVGElement>()
  const synchronize = (): void => {
    for (const element of document.querySelectorAll<HTMLElement>('span')) {
      const text = element.textContent?.trim() ?? ''
      if (!headlineCopy.has(text)) continue
      if (!originalHeadlines.has(element)) originalHeadlines.set(element, text)
      element.textContent = 'TockTeam Desktop'
      element.dataset.tockteamHeroHeadline = 'true'
    }
    for (const headline of document.querySelectorAll<HTMLElement>('[data-tockteam-hero-headline]')) {
      const fish = headline.parentElement?.querySelector<SVGSVGElement>(':scope > span > svg')
      if (fish === null || fish === undefined || fish.dataset.tockteamHeroLogo !== undefined) continue
      const logo = document.createElement('span')
      logo.innerHTML = TOCKTEAM_LOGO_MARK
      const mark = logo.querySelector<SVGSVGElement>('svg')
      if (mark === null) continue
      mark.dataset.tockteamHeroLogo = 'true'
      mark.setAttribute('width', '34')
      mark.setAttribute('height', '34')
      originalHeroLogos.set(logo, fish)
      fish.replaceWith(logo)
    }
    for (const wordmark of document.querySelectorAll<SVGSVGElement>(
      "[data-slot='sidebar'] button > svg[viewBox='0 0 182 24']",
    )) {
      const brand = document.createElement('span')
      brand.dataset.tockteamSidebarBrand = 'true'
      brand.innerHTML = `${TOCKTEAM_LOGO_MARK}<span>TockTeam</span>`
      originalSidebarBrands.set(brand, wordmark)
      wordmark.replaceWith(brand)
    }
    for (const fish of document.querySelectorAll<SVGSVGElement>(
      "[data-slot='sidebar'] button:is([aria-label='Open sidebar'],[aria-label='打开侧边栏']) > svg[viewBox='0 0 23.16 17.04']:not([data-tockteam-sidebar-fish])",
    )) {
      fish.dataset.tockteamSidebarFish = 'true'
      if (fish.parentElement?.querySelector<SVGSVGElement>(
        ':scope > [data-tockteam-sidebar-logo]',
      ) !== null) continue
      const logo = document.createElement('span')
      logo.innerHTML = TOCKTEAM_LOGO_MARK
      const mark = logo.querySelector<SVGSVGElement>('svg')
      if (mark === null) continue
      mark.dataset.tockteamSidebarLogo = 'true'
      fish.before(mark)
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
    for (const [brand, original] of originalSidebarBrands) {
      if (brand.isConnected) brand.replaceWith(original)
    }
    for (const [logo, original] of originalHeroLogos) {
      if (logo.isConnected) logo.replaceWith(original)
    }
    for (const logo of document.querySelectorAll('[data-tockteam-sidebar-logo]')) logo.remove()
    for (const fish of document.querySelectorAll<SVGSVGElement>('[data-tockteam-sidebar-fish]')) {
      delete fish.dataset.tockteamSidebarFish
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
    const removeBranding = installBranding()
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
      removeBranding()
      removeDesktopChrome()
      delete document.documentElement.dataset.tockteamPreview
      delete document.body.dataset.tockteamPreviewLabel
    }
  }, 'tockteam-desktop: native command bridge')
}
