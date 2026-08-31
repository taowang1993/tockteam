/** Browser face for the native TockTeam Desktop bridge. */

import type { DesktopBridge, DesktopCommand } from './contracts.ts'
import { localeTag, type LocaleService } from '../plugins/shared/i18n.ts'
import { apply as applyLauncherSettings, inject as launcherSettingsInject } from './launcher-settings.tsx'
import { projectLauncherThemeSource } from './launcher-theme.ts'
import { deferSettingsOpen } from './desktop-settings-navigation.ts'
import {
  resolveLauncherRoutePath,
  type LauncherWorkbenchRoute,
} from './launcher-navigation.ts'
import type { DesktopPanels } from '../plugins/panel-controls/src/client.ts'
import type { PinnedSummary } from '../plugins/pinned-summary/src/client.ts'
import type { WorkspaceTools } from '../plugins/sidebar/src/client.ts'
import {
  isTockCoderPath,
  isTockTutorPath,
  readLastTockTutorPath,
  readTockTutorRouteLocation,
  rememberTockTutorPath,
} from '../plugins/sidebar/src/client/tocktutor-route.ts'
import {
  brandingMutationRoots,
  findHeroHeadlines,
  matchingElements,
  pruneDisconnected,
} from '../plugins/shared/branding.ts'
import {
  TOCKTEAM_SURFACE_VIEW_SERVICE,
  type TockTeamSurfaceView,
} from '../plugins/shared/surface.ts'

export {
  canonicalTockTeamPath,
  isTockCoderPath,
  isTockTutorPath,
  TOCKCODER_ROUTE_PREFIX,
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

interface ThemeSnapshot {
  active: Readonly<{ id: string; colorScheme: 'light' | 'dark' }>
}

interface ThemeService {
  getTheme: () => ThemeSnapshot
}

interface ClientContext {
  effect(effect: () => (() => Promise<void> | void) | void, label?: string): void
  get(name: string): unknown
  on(event: 'theme/change', listener: (snapshot: ThemeSnapshot) => void): () => void
  reflect: {
    provide(name: string, value: unknown, options?: unknown): (() => Promise<void> | void) | void
  }
}

declare global {
  interface Window {
    dshDesktop?: DesktopBridge
  }
}

/** Wait for the DSH services used by native menu commands. */
export const inject = ['workspaces', 'desktopPanels', 'pinnedSummary', 'theme', ...launcherSettingsInject]

function installDesktopChrome(): () => void {
  const originalTitle = document.title
  const synchronizeTitle = (): void => {
    if (document.title !== 'TockCoder') document.title = 'TockCoder'
  }
  const titleObserver = new MutationObserver(synchronizeTitle)
  titleObserver.observe(document.head, {
    childList: true,
    characterData: true,
    subtree: true,
  })
  document.documentElement.dataset.tockteamDesktop = 'true'
  document.documentElement.classList.add('tockteam-desktop-shell')
  synchronizeTitle()
  return () => {
    titleObserver.disconnect()
    delete document.documentElement.dataset.tockteamDesktop
    document.documentElement.classList.remove('tockteam-desktop-shell')
    document.title = originalTitle
  }
}

// Mirrors Tockbot's inline LogoMark component, with currentColor for theme-aware UI use.
const TOCKTEAM_LOGO_MARK = `
  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true" data-tockteam-product-mark="true">
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
  const previewCopy = new Set(['Preview', '预览版'])
  const originalHeadlines = new Map<HTMLElement, string>()
  const originalPreviewBadges = new Map<HTMLElement, HTMLElement['hidden']>()
  const originalBrandMarks = new Map<SVGSVGElement, SVGSVGElement>()
  const originalSidebarNames = new Map<HTMLElement, string>()
  const synchronize = (roots: readonly ParentNode[] = [document]): void => {
    pruneDisconnected(originalHeadlines)
    pruneDisconnected(originalPreviewBadges)
    pruneDisconnected(originalBrandMarks)
    pruneDisconnected(originalSidebarNames)
    for (const element of new Set(roots.flatMap(findHeroHeadlines))) {
      const text = element.textContent?.trim() ?? ''
      if (headlineCopy.has(text)) {
        if (!originalHeadlines.has(element)) originalHeadlines.set(element, text)
        element.textContent = 'TockCoder'
      } else if (text !== 'TockCoder') {
        continue
      }
      const previewBadge = element.nextElementSibling
      if (previewBadge instanceof HTMLElement && previewCopy.has(previewBadge.textContent?.trim() ?? '')) {
        if (!originalPreviewBadges.has(previewBadge)) originalPreviewBadges.set(previewBadge, previewBadge.hidden)
        previewBadge.hidden = true
      }
      element.dataset.tockteamHeroHeadline = 'true'
    }
    for (const brand of new Set(roots.flatMap(root => (
      matchingElements<HTMLElement>(root, "[data-slot='sidebar.brand.name']")
    )))) {
      if (!originalSidebarNames.has(brand)) originalSidebarNames.set(brand, brand.innerHTML)
      if (brand.textContent !== 'TockCoder') brand.replaceChildren(document.createTextNode('TockCoder'))
      brand.dataset.tockteamSidebarBrand = 'true'
    }
    const fishSelector = [
      "[data-slot='sidebar.brand.mark'] > svg[viewBox='0 0 23.16 17.04']",
      "[data-slot='conversation.hero.brand.mark'] > svg[viewBox='0 0 23.16 17.04']",
    ].join(',')
    for (const fish of new Set(roots.flatMap(root => (
      matchingElements<SVGSVGElement>(root, fishSelector)
    )))) {
      const container = document.createElement('span')
      container.innerHTML = TOCKTEAM_LOGO_MARK
      const mark = container.querySelector<SVGSVGElement>('svg')
      if (mark === null) continue
      const size = fish.getAttribute('width') ?? '20'
      const className = fish.getAttribute('class')
      mark.setAttribute('width', size)
      mark.setAttribute('height', size)
      if (className !== null) mark.setAttribute('class', className)
      originalBrandMarks.set(mark, fish)
      fish.replaceWith(mark)
    }
  }
  const observer = new MutationObserver(records => {
    synchronize(brandingMutationRoots(records))
  })
  observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  synchronize()
  return () => {
    observer.disconnect()
    for (const [element, original] of originalHeadlines) {
      if (element.isConnected && element.textContent === 'TockCoder') element.textContent = original
      delete element.dataset.tockteamHeroHeadline
    }
    for (const [previewBadge, hidden] of originalPreviewBadges) {
      if (previewBadge.isConnected) previewBadge.hidden = hidden
    }
    for (const [mark, original] of originalBrandMarks) {
      if (mark.isConnected) mark.replaceWith(original)
    }
    for (const [brand, original] of originalSidebarNames) {
      if (brand.isConnected && brand.textContent === 'TockCoder') brand.innerHTML = original
      delete brand.dataset.tockteamSidebarBrand
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

function isSettingsShellOpen(): boolean {
  return document.querySelector('[role="dialog"] button[aria-current]') !== null
}

function showSettingsAfterRoute(section?: 'tocklauncher'): void {
  const schedule = (callback: () => void): void => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => { queueMicrotask(callback) })
    } else {
      queueMicrotask(callback)
    }
  }
  if (section !== 'tocklauncher') {
    deferSettingsOpen({
      findButton: findSettingsButton,
      isOpen: isSettingsShellOpen,
      isTockCoder: () => isTockCoderPath(window.location.pathname),
      isTockTutorActive: () => document.documentElement.dataset.tockteamTocktutorActive === 'true',
      schedule: callback => {
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => { queueMicrotask(callback) })
        } else {
          queueMicrotask(callback)
        }
      },
    })
    return
  }
  const selectLauncherSection = (): void => {
    let attempts = 0
    const attempt = (): void => {
      const section = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
        .find(button => button.textContent?.trim() === 'TockLauncher')
      if (section !== undefined) {
        section.click()
        return
      }
      if (attempts >= 60) return
      attempts += 1
      schedule(attempt)
    }
    schedule(attempt)
  }
  deferSettingsOpen({
    findButton: findSettingsButton,
    isOpen: isSettingsShellOpen,
    isTockCoder: () => isTockCoderPath(window.location.pathname),
    isTockTutorActive: () => document.documentElement.dataset.tockteamTocktutorActive === 'true',
    onOpened: selectLauncherSection,
    schedule: callback => {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => { queueMicrotask(callback) })
      } else {
        queueMicrotask(callback)
      }
    },
  })
}

function navigateLauncherRoute(route: LauncherWorkbenchRoute): void {
  const currentLocation = readTockTutorRouteLocation()
  if (isTockTutorPath(currentLocation.pathname)) rememberTockTutorPath(currentLocation)
  if (route.destination === 'tocktutor' && isTockTutorPath(currentLocation.pathname)) return
  const pathname = route.destination === 'tocktutor'
    ? readLastTockTutorPath()
    : resolveLauncherRoutePath(route.destination)
  const current = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`
  if (current === pathname) {
    window.dispatchEvent(new PopStateEvent('popstate'))
    if (route.destination === 'tockcoder') window.setTimeout(focusComposer, 0)
    return
  }
  window.history.pushState(window.history.state, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
  if (route.destination === 'tockcoder') window.setTimeout(focusComposer, 0)
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
      showSettingsAfterRoute(command.section)
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
  const panels = ctx.get('desktopPanels') as DesktopPanels
  const pinnedSummary = ctx.get('pinnedSummary') as PinnedSummary
  applyLauncherSettings(ctx)
  ctx.effect(() => {
    const removeShell = ctx.reflect.provide('desktopShell', bridge, undefined)
    // The unified three-surface contract, client plane: the desktop shell.
    const removeSurface = ctx.reflect.provide(TOCKTEAM_SURFACE_VIEW_SERVICE, Object.freeze({
      kind: 'desktop',
    } satisfies TockTeamSurfaceView), undefined)
    return async () => {
      await removeSurface?.()
      await removeShell?.()
    }
  }, 'tockteam-desktop: reflected client services')
  ctx.effect(() => {
    const removeDesktopChrome = installDesktopChrome()
    const removeBranding = installBranding()
    const unsubscribeCommand = bridge.onCommand((command) => {
      dispatch(
        command,
        workspaces,
        panels,
        pinnedSummary,
        ctx.get('workspaceTools') as WorkspaceTools,
      )
    })
    const unsubscribeRoute = bridge.onRoute((route) => { navigateLauncherRoute(route) })
    const theme = ctx.get('theme') as ThemeService
    const locale = ctx.get('locale') as LocaleService
    const syncLocale = (): void => {
      void bridge.syncLauncherLocale(localeTag(locale)).catch(() => {})
    }
    const syncTheme = (): void => {
      void bridge.syncLauncherTheme(projectLauncherThemeSource(theme.getTheme())).catch(() => {})
    }
    syncLocale()
    syncTheme()
    const unsubscribeLocale = locale.subscribe(syncLocale)
    const unsubscribeTheme = ctx.on('theme/change', snapshot => {
      void bridge.syncLauncherTheme(projectLauncherThemeSource(snapshot)).catch(() => {})
    })
    return () => {
      unsubscribeLocale()
      unsubscribeTheme()
      unsubscribeRoute()
      unsubscribeCommand()
      removeBranding()
      removeDesktopChrome()
    }
  }, 'tockteam-desktop: native command, route, and theme bridge')
}
