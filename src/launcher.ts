import {
  ArrowRight,
  History as HistoryIcon,
  ListFilter,
  RefreshCw,
  Search,
  Settings,
  Star,
  StarOff,
  Trash2,
  X,
  createElement,
} from 'lucide'
import type { IconNode } from 'lucide'
import type { LauncherPublicAction, LauncherPublicResultItem } from './launcher-actions.ts'
import type { LauncherSurfaceSettings } from './launcher-contract.ts'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { LauncherThemeProjection } from './launcher-theme.ts'
import type { LauncherOsThemeMode } from './launcher-os-assets.ts'
import { createLauncherLocalTool, LAUNCHER_LOCAL_TOOL_IDS, type LauncherLocalToolId } from './launcher-local-tools.ts'
import { createLauncherFileSearchTool } from './launcher-file-search-tool.ts'
import { createLauncherNetworkExtensionTool } from './launcher-network-extension-tool.ts'
import { LAUNCHER_LOCAL_EXTENSION_ASSET_URLS } from './launcher-local-extension-assets.ts'
import { launcherDiscoveryAssetUrl } from './launcher-discovery-assets.ts'
import { launcherFileSearchAssetUrl } from './launcher-file-search-assets.ts'
import { launcherNetworkAssetUrl } from './launcher-network-assets.ts'
import { launcherOsAssetUrl } from './launcher-os-assets.ts'
import { launcherTerminalAssetUrl } from './launcher-terminal-assets.ts'
import { launcherWorkflowAssetUrl } from './launcher-workflow-assets.ts'
import { isLauncherImageUrl } from './launcher-image-url.ts'
import type { LauncherLocalExtensionSettings } from './launcher-local-extension-contract.ts'
import { tockTeamSkin } from '../plugins/skins/src/skins.ts'

type LauncherBridge = LauncherPreloadBridge

declare global {
  interface Window {
    tockteamLauncher?: LauncherBridge
  }
}

const FOCUS_SEARCH_EVENT = 'tockteam-launcher-focus-search'
let focusSearchHandler = (): void => { document.getElementById('launcher-search')?.focus() }
document.addEventListener(FOCUS_SEARCH_EVENT, () => { focusSearchHandler() })

let appliedThemeTokens = new Set<string>()
let appliedThemeRevision = -1
let appliedThemeMode: LauncherOsThemeMode = 'light'
let launcherThemeRerender: (() => void) | undefined

function applyLauncherTheme(projection: LauncherThemeProjection): void {
  if (projection.revision < appliedThemeRevision) return
  appliedThemeRevision = projection.revision
  appliedThemeMode = projection.mode
  const root = document.documentElement
  root.style.colorScheme = projection.mode
  if (projection.skinId === null) delete root.dataset.tockteamSkin
  else root.dataset.tockteamSkin = projection.skinId
  for (const token of appliedThemeTokens) root.style.removeProperty(token)
  appliedThemeTokens = new Set<string>()
  const skin = projection.skinId === null ? undefined : tockTeamSkin(projection.skinId)
  if (skin !== undefined) {
    for (const [token, value] of Object.entries(skin.tokens)) {
      root.style.setProperty(token, value)
      appliedThemeTokens.add(token)
    }
  }
  launcherThemeRerender?.()
}

function setReady(ready: boolean): void {
  const value = String(ready)
  document.documentElement.dataset.launcherReady = value
  if (document.body !== null) document.body.dataset.launcherReady = value
  document.getElementById('launcher-root')?.setAttribute('data-launcher-ready', value)
}

function icon(definition: IconNode): SVGSVGElement {
  const svg = createElement(definition) as SVGSVGElement
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('size-[18px]', 'shrink-0')
  return svg
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('launcher-root') as HTMLElement
  const search = document.getElementById('launcher-search') as HTMLInputElement
  const searchForm = document.getElementById('launcher-search-form') as HTMLElement
  const searchIcon = document.getElementById('launcher-search-icon') as HTMLElement
  const close = document.getElementById('launcher-close') as HTMLButtonElement
  const settings = document.getElementById('launcher-settings') as HTMLButtonElement
  const results = document.getElementById('launcher-results') as HTMLUListElement
  const status = document.getElementById('launcher-status') as HTMLElement
  const historyToggle = document.getElementById('launcher-history-toggle') as HTMLButtonElement
  const historyPanel = document.getElementById('launcher-history') as HTMLElement
  const rescan = document.getElementById('launcher-rescan') as HTMLButtonElement
  const details = document.getElementById('launcher-details') as HTMLElement
  const bridge = window.tockteamLauncher as LauncherBridge
  if (!(root instanceof HTMLElement)
    || !(search instanceof HTMLInputElement)
    || !(searchForm instanceof HTMLElement)
    || !(searchIcon instanceof HTMLElement)
    || !(close instanceof HTMLButtonElement)
    || !(settings instanceof HTMLButtonElement)
    || !(results instanceof HTMLUListElement)
    || !(status instanceof HTMLElement)
    || !(historyToggle instanceof HTMLButtonElement)
    || !(historyPanel instanceof HTMLElement)
    || !(rescan instanceof HTMLButtonElement)
    || !(details instanceof HTMLElement)
    || bridge === undefined) {
    throw new Error('TockLauncher renderer is missing its required controls')
  }

  searchIcon.append(icon(Search))
  historyToggle.prepend(icon(HistoryIcon))
  rescan.prepend(icon(RefreshCw))
  close.prepend(icon(X))
  settings.prepend(icon(Settings))
  bridge.onTheme(applyLauncherTheme)
  void bridge.getTheme().then(applyLauncherTheme).catch(() => {})

  const isMac = navigator.platform.startsWith('Mac')
  const modifier = isMac ? 'Meta' : 'Control'
  const hasPrimaryModifier = (event: KeyboardEvent): boolean => (
    modifier === 'Meta' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  )
  let revision = 0
  let selectedItemId = ''
  let currentItems: LauncherPublicResultItem[] = []
  let currentResultSetId = ''
  let pinnedCount = 0
  let actionMenuOpen = false
  let historyOpen = false
  let invoking = false
  let invokingWorkflow = false
  let cancellationPending = false
  let cancellationRequested = false
  let activeCancellation: Readonly<{ actionId: string; resultSetId: string }> | undefined
  let activeLocalTool: HTMLElement | undefined
  let activeLocalToolId: LauncherLocalToolId | undefined
  let surfaceSettings: LauncherSurfaceSettings = Object.freeze({
    fuzziness: 0.5,
    history: Object.freeze([]),
    historyEnabled: false,
    historyLimit: 10,
    maxSearchResultItems: 50,
    searchEngineId: 'fuzzysort',
  })
  try { surfaceSettings = await bridge.getSurfaceSettings() } catch { /* retain bounded defaults */ }
  let history: string[] = surfaceSettings.historyEnabled ? [...surfaceSettings.history] : []

  const setStatus = (message: string, tone: 'error' | 'muted' | 'ready' = 'muted'): void => {
    status.textContent = message
    status.dataset.tone = tone
  }

  const selectedItem = (): LauncherPublicResultItem | undefined => (
    currentItems.find(item => item.id === selectedItemId)
  )

  const restoreSearchFocus = (): void => {
    search.focus()
    search.select()
  }

  const setWorkflowBusy = (busy: boolean): void => {
    search.disabled = busy
    rescan.disabled = busy
    historyToggle.disabled = busy || !surfaceSettings.historyEnabled
  }

  const closeLocalTool = (): void => {
    const tool = activeLocalTool
    activeLocalTool = undefined
    activeLocalToolId = undefined
    tool?.remove()
    for (const element of [searchForm, historyPanel, status, results, details, rescan, settings]) element.hidden = false
    void renderSearch(search.value).finally(restoreSearchFocus)
  }

  const hideLauncherControls = (): void => {
    for (const element of [searchForm, historyPanel, status, results, details, rescan, settings]) element.hidden = true
  }
  const openLocalTool = async (extensionId: LauncherLocalToolId): Promise<void> => {
    let localSettings: LauncherLocalExtensionSettings
    try { localSettings = await bridge.getLocalExtensionSettings() } catch { setStatus('Local extension settings are unavailable.', 'error'); restoreSearchFocus(); return }
    const tool = createLauncherLocalTool({ document, extensionId, onClose: closeLocalTool, settings: localSettings })
    activeLocalTool = tool
    activeLocalToolId = extensionId
    hideLauncherControls()
    root.append(tool)
  }
  const openFileSearchTool = async (): Promise<void> => {
    const tool = createLauncherFileSearchTool({ bridge, document, onClose: closeLocalTool, searchOptions: {
      fuzziness: surfaceSettings.fuzziness,
      maxSearchResultItems: surfaceSettings.maxSearchResultItems,
      searchEngineId: surfaceSettings.searchEngineId,
    } })
    activeLocalTool = tool
    activeLocalToolId = undefined
    hideLauncherControls()
    root.append(tool)
  }
  const openNetworkTool = async (extensionId: 'DeeplTranslator' | 'WebSearch'): Promise<void> => {
    const tool = createLauncherNetworkExtensionTool({ bridge, document, extensionId, onClose: closeLocalTool, searchOptions: {
      fuzziness: surfaceSettings.fuzziness,
      maxSearchResultItems: surfaceSettings.maxSearchResultItems,
      searchEngineId: surfaceSettings.searchEngineId,
    } })
    activeLocalTool = tool
    activeLocalToolId = undefined
    hideLauncherControls()
    root.append(tool)
  }

  const updateSelection = (): void => {
    for (const button of results.querySelectorAll<HTMLElement>('[data-result-id]')) {
      const selected = button.dataset.resultId === selectedItemId
      button.setAttribute('aria-selected', String(selected))
      if (selected) {
        search.setAttribute('aria-activedescendant', button.id)
        button.scrollIntoView?.({ block: 'nearest' })
      }
    }
    if (selectedItemId.length === 0) search.removeAttribute('aria-activedescendant')
    renderDetails()
  }

  const closeActionMenu = (focus = true): void => {
    if (!actionMenuOpen) return
    actionMenuOpen = false
    renderDetails()
    if (focus) restoreSearchFocus()
  }

  const renderHistory = (): void => {
    historyToggle.hidden = !surfaceSettings.historyEnabled
    historyToggle.disabled = invokingWorkflow || !surfaceSettings.historyEnabled
    if (!surfaceSettings.historyEnabled) {
      history = []
      historyOpen = false
      historyPanel.hidden = true
      historyToggle.setAttribute('aria-expanded', 'false')
    }
    historyPanel.replaceChildren()
    if (history.length === 0) {
      const empty = document.createElement('button')
      empty.className = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--dsw-alias-label-secondary,CanvasText)]'
      empty.type = 'button'
      empty.disabled = true
      empty.setAttribute('role', 'menuitem')
      empty.setAttribute('aria-disabled', 'true')
      empty.append(icon(HistoryIcon), document.createTextNode('No Recent Searches'))
      historyPanel.append(empty)
      return
    }
    for (const query of history) {
      const button = document.createElement('button')
      button.className = 'block w-full truncate px-3 py-2 text-left text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]'
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.append(icon(HistoryIcon), document.createTextNode(query))
      button.addEventListener('click', () => {
        if (invokingWorkflow) return
        search.value = query
        historyOpen = false
        historyPanel.hidden = true
        historyToggle.setAttribute('aria-expanded', 'false')
        void renderSearch(query)
        restoreSearchFocus()
      })
      historyPanel.append(button)
    }
  }

  const closeHistory = (focus = true): void => {
    if (!historyOpen) return
    historyOpen = false
    historyPanel.hidden = true
    historyToggle.setAttribute('aria-expanded', 'false')
    if (focus) restoreSearchFocus()
  }

  focusSearchHandler = (): void => {
    actionMenuOpen = false
    historyOpen = false
    historyPanel.hidden = true
    historyToggle.setAttribute('aria-expanded', 'false')
    if (invokingWorkflow) return
    void bridge.getSurfaceSettings().then(current => {
      surfaceSettings = current
      history = current.historyEnabled ? [...current.history] : []
      renderHistory()
      void renderSearch(search.value)
    }).catch(() => { renderHistory() })
    renderDetails()
    restoreSearchFocus()
  }

  const rememberSearch = async (): Promise<void> => {
    const raw = search.value
    if (raw.trim().length === 0) return
    try {
      surfaceSettings = await bridge.recordSearch(raw)
      history = surfaceSettings.historyEnabled ? [...surfaceSettings.history] : []
      renderHistory()
    } catch {
      // Search invocation remains usable when history persistence is unavailable.
    }
  }

  const actionLabel = (action: LauncherPublicAction): string => (
    action.keyboardShortcut === undefined
      ? action.description
      : `${action.description} (${action.keyboardShortcut})`
  )

  const invoke = async (action: LauncherPublicAction): Promise<void> => {
    if (invoking) return
    const candidate = selectedItem()
    const isWorkflowAction = candidate?.sourceExtension === 'Workflow'
    const invocationResultSetId = currentResultSetId
    const candidateId = candidate?.id.slice('ueli-local:'.length)
    const toolId = candidate !== undefined
      && candidate.id === `ueli-local:${candidate.sourceExtension}`
      && action.actionId === candidate.defaultAction.actionId
      && typeof candidateId === 'string'
      && (LAUNCHER_LOCAL_TOOL_IDS as readonly string[]).includes(candidateId)
      ? candidateId as LauncherLocalToolId
      : undefined
    const fileSearchTool = candidate?.id === 'file-search:invoke'
      && candidate.sourceExtension === 'FileSearch'
      && action.actionId === candidate.defaultAction.actionId
    const networkTool = candidate !== undefined
      && (candidate.id === 'ueli-network:DeeplTranslator' || candidate.id === 'ueli-network:WebSearch')
      && candidate.sourceExtension === (candidate.id.endsWith('DeeplTranslator') ? 'DeeplTranslator' : 'WebSearch')
      && action.actionId === candidate.defaultAction.actionId
    invoking = true
    invokingWorkflow = isWorkflowAction
    if (invokingWorkflow) setWorkflowBusy(true)
    closeActionMenu(false)
    renderDetails()
    await rememberSearch()
    setStatus(`${action.description}…`, 'muted')
    try {
      const pending = bridge.invokeAction(action.actionId)
      if (isWorkflowAction) {
        activeCancellation = Object.freeze({ actionId: action.actionId, resultSetId: invocationResultSetId })
        renderDetails()
      }
      const result = await pending
      if (!result.ok) {
        const refreshed = await renderSearch(search.value)
        if (refreshed) setStatus('Results Refreshed. Try Again.', 'muted')
        restoreSearchFocus()
        return
      }
      if (toolId !== undefined) {
        await openLocalTool(toolId)
        return
      }
      if (fileSearchTool) {
        await openFileSearchTool()
        return
      }
      if (networkTool) {
        await openNetworkTool(candidate!.sourceExtension as 'DeeplTranslator' | 'WebSearch')
        return
      }
      if (action.hideWindowAfterInvocation === true) {
        await bridge.dismiss().catch(() => undefined)
        return
      }
      await renderSearch(search.value)
      restoreSearchFocus()
    } catch {
      await renderSearch(search.value).catch(() => undefined)
      setStatus(cancellationRequested && isWorkflowAction ? 'Workflow canceled.' : `${action.description} could not be completed.`, cancellationRequested && isWorkflowAction ? 'muted' : 'error')
      restoreSearchFocus()
    } finally {
      invoking = false
      invokingWorkflow = false
      activeCancellation = undefined
      cancellationPending = false
      cancellationRequested = false
      setWorkflowBusy(false)
      renderDetails()
    }
  }

  const cancelActiveWorkflow = async (): Promise<void> => {
    const cancellation = activeCancellation
    if (cancellation === undefined || cancellationPending) return
    cancellationRequested = true
    cancellationPending = true
    setStatus('Canceling workflow…', 'muted')
    renderDetails()
    try {
      await bridge.cancelAction(cancellation.actionId, cancellation.resultSetId)
      setStatus('Workflow canceled.', 'muted')
    } catch {
      cancellationRequested = false
      setStatus('Workflow could not be canceled.', 'error')
    } finally {
      cancellationPending = false
      renderDetails()
    }
  }

  function renderDetails(): void {
    details.replaceChildren()
    const item = selectedItem()
    if (item === undefined) return

    const selection = document.createElement('span')
    selection.className = 'min-w-0 flex-1 truncate text-sm font-medium text-[var(--dsw-alias-label-primary,CanvasText)]'
    selection.textContent = `${item.name} — ${item.description}`
    const open = document.createElement('button')
    open.className = 'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--dsw-alias-brand-primary,#0969da)] px-3 text-sm font-medium text-[var(--dsw-alias-brand-primary-invert,Canvas)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2'
    open.type = 'button'
    open.setAttribute('aria-label', actionLabel(item.defaultAction))
    open.setAttribute('aria-keyshortcuts', 'Enter')
    open.append(icon(ArrowRight))
    const openText = document.createElement('span')
    openText.textContent = item.defaultAction.description
    open.append(openText)
    open.addEventListener('click', () => { void invoke(item.defaultAction) })

    const toggle = document.createElement('button')
    toggle.className = 'inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] px-2 text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] focus-visible:outline-2'
    toggle.type = 'button'
    toggle.setAttribute('aria-label', `Actions for ${item.name}`)
    toggle.setAttribute('aria-haspopup', 'menu')
    toggle.setAttribute('aria-expanded', String(actionMenuOpen))
    toggle.setAttribute('aria-controls', 'launcher-actions-menu')
    toggle.setAttribute('aria-keyshortcuts', `${modifier}+K`)
    toggle.append(icon(ListFilter))
    const toggleText = document.createElement('span')
    toggleText.textContent = 'Actions'
    toggle.append(toggleText)
    toggle.addEventListener('click', () => {
      actionMenuOpen = !actionMenuOpen
      renderDetails()
      if (actionMenuOpen) details.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
      else restoreSearchFocus()
    })

    const row = document.createElement('div')
    row.className = 'flex min-w-0 items-center gap-2'
    row.append(selection, open)
    if (activeCancellation !== undefined && item.sourceExtension === 'Workflow') {
      const cancel = document.createElement('button')
      cancel.className = 'inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] px-2 text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] focus-visible:outline-2'
      cancel.type = 'button'
      cancel.disabled = cancellationPending
      cancel.dataset.testid = 'tocklauncher-cancel-workflow'
      cancel.setAttribute('aria-label', 'Cancel workflow')
      cancel.textContent = 'Cancel'
      cancel.addEventListener('click', () => { void cancelActiveWorkflow() })
      row.append(cancel)
    }
    row.append(toggle)
    details.append(row)
    if (!actionMenuOpen) return

    const menu = document.createElement('div')
    menu.className = 'absolute bottom-full right-0 z-10 mb-2 max-h-[240px] min-w-[220px] max-w-[320px] overflow-y-auto rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--dsw-alias-bg-layer-1,Canvas)] py-1 shadow-lg'
    menu.id = 'launcher-actions-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', `Actions for ${item.name}`)
    const actions = [item.defaultAction, ...(item.additionalActions ?? [])]
    for (const action of actions) {
      const actionButton = document.createElement('button')
      actionButton.className = 'flex w-full items-center gap-2 truncate px-3 py-2 text-left text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] focus-visible:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]'
      actionButton.type = 'button'
      actionButton.setAttribute('role', 'menuitem')
      actionButton.setAttribute('aria-label', actionLabel(action))
      const description = action.description.toLowerCase()
      const actionIcon = description.includes('favorite')
        ? description.includes('remove') ? StarOff : Star
        : description.includes('exclude') ? Trash2 : ArrowRight
      actionButton.append(icon(actionIcon), document.createTextNode(actionLabel(action)))
      actionButton.addEventListener('click', () => { void invoke(action) })
      menu.append(actionButton)
    }
    menu.addEventListener('keydown', event => {
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      let next: number | undefined
      if (event.key === 'ArrowDown') next = (Math.max(index, 0) + 1) % buttons.length
      else if (event.key === 'ArrowUp') next = (Math.max(index, 0) - 1 + buttons.length) % buttons.length
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = buttons.length - 1
      else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeActionMenu()
        return
      }
      if (next !== undefined) {
        event.preventDefault()
        buttons[next]?.focus()
      }
    })
    details.classList.add('relative')
    details.append(menu)
  }

  const renderGroup = (name: string, items: readonly LauncherPublicResultItem[], start: number): void => {
    if (items.length === 0) return
    const group = document.createElement('li')
    group.className = 'mb-2'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', name)
    const heading = document.createElement('h2')
    heading.className = 'm-0 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--dsw-alias-label-secondary,CanvasText)]'
    heading.textContent = name
    const list = document.createElement('ul')
    list.className = 'm-0 list-none p-0'
    list.setAttribute('role', 'presentation')
    for (const [index, item] of items.entries()) {
      const listItem = document.createElement('li')
      listItem.setAttribute('role', 'presentation')
      const button = document.createElement('button')
      button.className = 'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] focus-visible:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] aria-selected:bg-[var(--dsw-alias-interactive-bg-active,rgb(0_0_0_/_10%))] aria-selected:font-semibold'
      button.type = 'button'
      button.id = `launcher-result-${encodeURIComponent(item.id)}`
      button.dataset.resultId = item.id
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(item.id === selectedItemId))
      button.tabIndex = -1
      if (start + index < 9) button.setAttribute('aria-keyshortcuts', `${modifier}+${start + index + 1}`)
      const localAsset = Object.hasOwn(LAUNCHER_LOCAL_EXTENSION_ASSET_URLS, item.sourceExtension) && item.imageKey !== undefined
        ? LAUNCHER_LOCAL_EXTENSION_ASSET_URLS[item.sourceExtension as keyof typeof LAUNCHER_LOCAL_EXTENSION_ASSET_URLS]
        : undefined
      const packagedAsset = item.imageKey === undefined
        ? undefined
        : launcherDiscoveryAssetUrl(item.imageKey) ?? launcherFileSearchAssetUrl(item.imageKey) ?? launcherNetworkAssetUrl(item.imageKey) ?? launcherOsAssetUrl(item.imageKey, appliedThemeMode) ?? launcherTerminalAssetUrl(item.imageKey) ?? launcherWorkflowAssetUrl(item.imageKey)
      const imageUrl = isLauncherImageUrl(item.imageUrl)
        ? item.imageUrl
        : localAsset ?? packagedAsset
      const marker = imageUrl !== undefined
        ? document.createElement('img')
        : document.createElement('span')
      marker.className = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--dsw-alias-bg-layer-2,Canvas)] text-sm font-semibold text-[var(--dsw-alias-label-secondary,CanvasText)]'
      marker.setAttribute('aria-hidden', 'true')
      if (marker instanceof HTMLImageElement) {
        marker.alt = ''
        marker.src = imageUrl!
        marker.onerror = () => {
          const fallback = document.createElement('span')
          fallback.className = marker.className
          fallback.setAttribute('aria-hidden', 'true')
          fallback.textContent = item.name.slice(0, 1).toLocaleUpperCase()
          marker.replaceWith(fallback)
        }
      } else marker.textContent = item.name.slice(0, 1).toLocaleUpperCase()
      const copy = document.createElement('span')
      copy.className = 'min-w-0'
      const nameElement = document.createElement('strong')
      nameElement.className = 'block truncate text-sm font-medium'
      nameElement.textContent = item.name
      const description = document.createElement('span')
      description.className = 'block truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'
      description.textContent = item.description
      const itemDetailsText = item.details
      const itemDetails = itemDetailsText === undefined ? undefined : document.createElement('span')
      if (itemDetails !== undefined) {
        itemDetails.className = 'block truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'
        itemDetails.textContent = itemDetailsText ?? null
      }
      copy.append(nameElement, description)
      if (itemDetails !== undefined) copy.append(itemDetails)
      button.append(marker, copy)
      button.addEventListener('pointerdown', event => { event.preventDefault() })
      button.addEventListener('click', () => {
        const wasActionMenuOpen = actionMenuOpen
        selectedItemId = item.id
        actionMenuOpen = false
        updateSelection()
        if (wasActionMenuOpen) restoreSearchFocus()
      })
      button.addEventListener('dblclick', () => { void invoke(item.defaultAction) })
      listItem.append(button)
      list.append(listItem)
    }
    group.append(heading, list)
    results.append(group)
  }

  function renderResults(): void {
    results.replaceChildren()
    renderGroup('Pinned', currentItems.slice(0, pinnedCount), 0)
    renderGroup(search.value.trim().length === 0 ? 'Recent' : 'Results', currentItems.slice(pinnedCount), pinnedCount)
    updateSelection()
  }

  async function renderSearch(term: string): Promise<boolean> {
    if (invokingWorkflow) return false
    const currentRevision = ++revision
    setStatus('Searching…', 'muted')
    try {
      const response = await bridge.search(term, {
        fuzziness: surfaceSettings.fuzziness,
        maxSearchResultItems: surfaceSettings.maxSearchResultItems,
        searchEngineId: surfaceSettings.searchEngineId,
      })
      if (currentRevision !== revision) return false
      const previous = selectedItemId
      pinnedCount = response.before.length
      currentItems = [...response.before, ...response.after]
      currentResultSetId = response.resultSetId
      selectedItemId = currentItems.some(item => item.id === previous) ? previous : currentItems[0]?.id ?? ''
      search.setAttribute('aria-expanded', String(currentItems.length > 0))
      renderResults()
      const error = response.status.lastError
      setStatus(error ?? (currentItems.length === 0
        ? 'No TockTeam destinations found.'
        : `${response.status.indexedItemCount} indexed destinations`), error ? 'error' : 'ready')
      document.documentElement.dataset.launcherResultRevision = String(currentRevision)
      return error === undefined
    } catch {
      if (currentRevision !== revision) return false
      currentItems = []
      pinnedCount = 0
      selectedItemId = ''
      search.setAttribute('aria-expanded', 'false')
      renderResults()
      setStatus('TockLauncher destinations are unavailable.', 'error')
      return false
    }
  }

  launcherThemeRerender = () => {
    if (activeLocalTool === undefined && !invokingWorkflow) void renderSearch(search.value)
  }
  close.addEventListener('click', () => { void bridge.dismiss().catch(() => undefined) })
  settings.addEventListener('click', () => { void bridge.openSettings().catch(() => undefined) })
  historyToggle.addEventListener('click', () => {
    if (invokingWorkflow || !surfaceSettings.historyEnabled) return
    historyOpen = !historyOpen
    historyPanel.hidden = !historyOpen
    historyToggle.setAttribute('aria-expanded', String(historyOpen))
    if (historyOpen) {
      renderHistory()
      historyPanel.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    } else restoreSearchFocus()
  })
  historyPanel.addEventListener('keydown', event => {
    const buttons = [...historyPanel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeHistory()
      return
    }
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown'
      ? (Math.max(index, 0) + 1) % buttons.length
      : event.key === 'ArrowUp'
        ? (Math.max(index, 0) - 1 + buttons.length) % buttons.length
        : undefined
    if (next !== undefined && buttons.length > 0) {
      event.preventDefault()
      buttons[next]?.focus()
    }
  })
  rescan.addEventListener('click', async () => {
    if (invokingWorkflow) return
    rescan.disabled = true
    rescan.setAttribute('aria-busy', 'true')
    setStatus('Rescanning TockLauncher…', 'muted')
    try {
      await bridge.rescan()
      await renderSearch(search.value)
    } catch {
      setStatus('TockLauncher rescan failed.', 'error')
    } finally {
      rescan.disabled = false
      rescan.removeAttribute('aria-busy')
    }
  })
  search.addEventListener('input', () => {
    if (invokingWorkflow) return
    void renderSearch(search.value)
  })
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (activeLocalTool !== undefined) closeLocalTool()
      else if (actionMenuOpen) closeActionMenu()
      else if (historyOpen) closeHistory()
      else void bridge.dismiss().catch(() => undefined)
      return
    }
    if (event.key === 'ArrowDown' || (hasPrimaryModifier(event) && event.key.toLowerCase() === 'n')) {
      event.preventDefault()
      if (currentItems.length > 0) {
        const index = currentItems.findIndex(item => item.id === selectedItemId)
        selectedItemId = currentItems[(Math.max(index, -1) + 1) % currentItems.length]?.id ?? ''
        updateSelection()
      }
    } else if (event.key === 'ArrowUp' || (hasPrimaryModifier(event) && event.key.toLowerCase() === 'p')) {
      event.preventDefault()
      if (currentItems.length > 0) {
        const index = currentItems.findIndex(item => item.id === selectedItemId)
        selectedItemId = currentItems[(Math.max(index, 0) - 1 + currentItems.length) % currentItems.length]?.id ?? ''
        updateSelection()
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = selectedItem()
      if (item !== undefined) void invoke(item.defaultAction)
    } else if (event.key === 'F5') {
      event.preventDefault()
      rescan.click()
    } else if (hasPrimaryModifier(event) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (selectedItem() === undefined) return
      actionMenuOpen = !actionMenuOpen
      renderDetails()
      if (actionMenuOpen) details.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
      else restoreSearchFocus()
    } else if (hasPrimaryModifier(event) && event.key.toLowerCase() === 'f') {
      const action = selectedItem()?.additionalActions?.find(item => /favorite/u.test(item.description.toLowerCase()))
      if (action !== undefined) {
        event.preventDefault()
        void invoke(action)
      }
    } else if (hasPrimaryModifier(event) && event.key === 'Delete') {
      const action = selectedItem()?.additionalActions?.find(item => /exclude/u.test(item.description.toLowerCase()))
      if (action !== undefined) {
        event.preventDefault()
        void invoke(action)
      }
    } else if (hasPrimaryModifier(event) && /^[1-9]$/u.test(event.key)) {
      const item = currentItems[Number(event.key) - 1]
      if (item !== undefined) {
        event.preventDefault()
        selectedItemId = item.id
        updateSelection()
        void invoke(item.defaultAction)
      }
    } else if ((event.key === 'l' || event.key === 'L') && hasPrimaryModifier(event)) {
      event.preventDefault()
      restoreSearchFocus()
    }
  })
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.target === search) return
    event.preventDefault()
    if (activeLocalTool !== undefined) closeLocalTool()
    else if (actionMenuOpen) closeActionMenu()
    else if (historyOpen) closeHistory()
    else void bridge.dismiss().catch(() => undefined)
  })
  document.addEventListener('pointerdown', event => {
    if (!historyOpen || !(event.target instanceof Element)) return
    if (event.target.closest('#launcher-history, #launcher-history-toggle') !== null) return
    closeHistory(false)
  })

  renderHistory()
  await renderSearch('')
  setReady(true)
  search.focus()
}

setReady(false)
void bootstrap().catch(() => { setReady(false) })
