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
import {
  launcherEffectiveScrollBehavior,
  launcherShortcutAriaLabel,
  launcherShortcutMatches,
  type LauncherInvokeResult,
  type LauncherSurfacePlatform,
  type LauncherSurfaceSettings,
} from './launcher-contract.ts'
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

type LauncherMessages = Readonly<{
  actions: string
  cancel: string
  cancelFailed: string
  canceling: string
  canceled: string
  close: string
  fileSearchUnavailable: string
  indexed: (count: number) => string
  initialStatus: string
  invokeFailed: (action: string) => string
  invoking: (action: string) => string
  history: string
  noHistory: string
  noResults: string
  pinned: string
  providerState: (state: string) => string
  recent: string
  refreshed: string
  rescan: string
  rescanFailed: string
  rescanning: string
  results: string
  search: string
  searching: string
  settings: string
  unavailable: string
}>

const LAUNCHER_MESSAGES: Readonly<Record<'en' | 'zh', LauncherMessages>> = Object.freeze({
  en: Object.freeze({
    actions: 'Actions',
    cancel: 'Cancel',
    cancelFailed: 'Workflow could not be canceled.',
    canceling: 'Canceling workflow…',
    canceled: 'Workflow canceled.',
    close: 'Close TockLauncher',
    fileSearchUnavailable: 'Local extension settings are unavailable.',
    history: 'History',
    indexed: (count: number) => `${count} indexed destinations`,
    initialStatus: 'Destinations will appear here.',
    invokeFailed: (action: string) => `${action} could not be completed.`,
    invoking: (action: string) => `${action}…`,
    noHistory: 'No Recent Searches',
    noResults: 'No TockTeam destinations found.',
    refreshed: 'Results Refreshed. Try Again.',
    pinned: 'Pinned',
    providerState: (state: string) => state,
    recent: 'Recent',
    rescan: 'Rescan',
    rescanFailed: 'TockLauncher rescan failed.',
    rescanning: 'Rescanning TockLauncher…',
    results: 'Results',
    search: 'Search TockTeam',
    unavailable: 'TockLauncher destinations are unavailable.',
    searching: 'Searching…',
    settings: 'Open TockLauncher Settings',
  }),
  zh: Object.freeze({
    actions: '操作',
    cancel: '取消',
    cancelFailed: '无法取消工作流。',
    canceling: '正在取消工作流…',
    canceled: '工作流已取消。',
    close: '关闭 TockLauncher',
    fileSearchUnavailable: '本地扩展设置不可用。',
    history: '历史',
    indexed: (count: number) => `${count} 个已索引目标`,
    initialStatus: '目标将在此处显示。',
    invokeFailed: (action: string) => `${action} 无法完成。`,
    invoking: (action: string) => `${action}…`,
    noHistory: '没有最近搜索',
    noResults: '未找到 TockTeam 目标。',
    refreshed: '结果已刷新，请重试。',
    pinned: '置顶',
    providerState: (state: string) => ({ disabled: '已禁用', unavailable: '不可用', unsupported: '不支持', ready: '就绪' } as Record<string, string>)[state] ?? state,
    recent: '最近',
    rescan: '重新扫描',
    rescanFailed: 'TockLauncher 重新扫描失败。',
    rescanning: '正在重新扫描 TockLauncher…',
    results: '结果',
    search: '搜索 TockTeam',
    unavailable: 'TockLauncher 目标不可用。',
    searching: '正在搜索…',
    settings: '打开 TockLauncher 设置',
  }),
})

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
  const providerStatuses = document.getElementById('launcher-provider-statuses') as HTMLElement
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
    || !(providerStatuses instanceof HTMLElement)
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
    (modifier === 'Meta' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
    && !event.altKey && !event.shiftKey
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
    doubleClickBehavior: 'invokeSearchResultItem',
    dragAndDropEnabled: false,
    fuzziness: 0.5,
    history: Object.freeze([]),
    historyEnabled: false,
    historyLimit: 10,
    hideWindowOn: Object.freeze(['blur', 'afterInvocation'] as const),
    locale: 'en-US',
    maxSearchResultItems: 50,
    placeholder: 'Search TockTeam',
    preserveUserInput: true,
    providerStatuses: Object.freeze([]),
    searchBarAppearance: 'auto',
    searchBarSize: 'large',
    searchEngineId: 'fuzzysort',
    searchResultLayout: 'compact',
    scrollBehavior: 'smooth',
    showSearchIcon: true,
    singleClickBehavior: 'selectSearchResultItem',
  })
  document.documentElement.lang = surfaceSettings.locale
  try { surfaceSettings = await bridge.getSurfaceSettings() } catch { /* retain bounded defaults */ }
  let history: string[] = surfaceSettings.historyEnabled ? [...surfaceSettings.history] : []
  const surfacePlatform: LauncherSurfacePlatform = isMac ? 'macOS' : /Windows/iu.test(`${navigator.platform} ${navigator.userAgent}`) ? 'Windows' : 'Linux'
  const messages = (): typeof LAUNCHER_MESSAGES.en => surfaceSettings.locale === 'zh-CN' ? LAUNCHER_MESSAGES.zh : LAUNCHER_MESSAGES.en
  const syncScrollBehavior = (): void => {
    // The media rule owns CSS scrolling; programmatic scrolling uses the effective behavior below.
    results.style.removeProperty('scroll-behavior')
  }
  const applySurfaceSettings = (): void => {
    const copy = messages()
    document.documentElement.lang = surfaceSettings.locale
    document.title = 'TockLauncher'
    search.placeholder = surfaceSettings.placeholder
    document.querySelector<HTMLLabelElement>('label[for="launcher-search"]')?.replaceChildren(document.createTextNode(copy.search))
    search.setAttribute('aria-label', copy.search)
    historyToggle.setAttribute('aria-label', copy.history)
    results.setAttribute('aria-label', copy.results)
    searchIcon.hidden = !surfaceSettings.showSearchIcon
    search.dataset.searchBarAppearance = surfaceSettings.searchBarAppearance
    search.dataset.searchBarSize = surfaceSettings.searchBarSize
    search.classList.remove('h-8', 'h-10', 'h-12')
    search.classList.add(surfaceSettings.searchBarSize === 'small' ? 'h-8' : surfaceSettings.searchBarSize === 'large' ? 'h-12' : 'h-10')
    results.dataset.layout = surfaceSettings.searchResultLayout
    syncScrollBehavior()
    const setButtonLabel = (button: HTMLButtonElement, label: string): void => {
      const textNode = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE)
      if (textNode !== undefined) textNode.textContent = label
      else button.append(document.createTextNode(label))
    }
    setButtonLabel(historyToggle, copy.history)
    setButtonLabel(rescan, copy.rescan)
    setButtonLabel(close, copy.close)
    setButtonLabel(settings, copy.settings)
    if (!invoking && !invokingWorkflow) status.textContent = copy.initialStatus
    providerStatuses.hidden = surfaceSettings.providerStatuses.every(provider => provider.state === 'ready' || provider.state === 'disabled')
    providerStatuses.textContent = surfaceSettings.providerStatuses
      .filter(provider => provider.state !== 'ready')
      .map(provider => `${provider.extensionId}: ${messages().providerState(provider.state)}`)
      .join(' · ')
  }
  applySurfaceSettings()

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

  const workflowInteractionBlocked = (): boolean => invokingWorkflow || activeCancellation !== undefined || cancellationPending

  const closeLocalTool = (): void => {
    const tool = activeLocalTool
    activeLocalTool = undefined
    activeLocalToolId = undefined
    tool?.remove()
    for (const element of [searchForm, status, providerStatuses, results, details, rescan, settings]) element.hidden = false
    historyOpen = false
    historyPanel.hidden = true
    historyToggle.setAttribute('aria-expanded', 'false')
    historyToggle.hidden = !surfaceSettings.historyEnabled
    void renderSearch(search.value).finally(restoreSearchFocus)
  }

  const hideLauncherControls = (): void => {
    historyOpen = false
    historyPanel.hidden = true
    historyToggle.setAttribute('aria-expanded', 'false')
    for (const element of [searchForm, status, providerStatuses, results, details, rescan, settings]) element.hidden = true
  }
  const openLocalTool = async (extensionId: LauncherLocalToolId): Promise<void> => {
    let localSettings: LauncherLocalExtensionSettings
    try { localSettings = await bridge.getLocalExtensionSettings() } catch { setStatus(messages().fileSearchUnavailable, 'error'); restoreSearchFocus(); return }
    const tool = createLauncherLocalTool({ document, extensionId, locale: surfaceSettings.locale, onClose: closeLocalTool, settings: localSettings })
    activeLocalTool = tool
    activeLocalToolId = extensionId
    hideLauncherControls()
    root.append(tool)
  }
  const openFileSearchTool = async (): Promise<void> => {
    const tool = createLauncherFileSearchTool({ bridge, document, locale: surfaceSettings.locale, onClose: closeLocalTool, searchOptions: {
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
    const tool = createLauncherNetworkExtensionTool({ bridge, document, extensionId, locale: surfaceSettings.locale, onClose: closeLocalTool, searchOptions: {
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
        const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        button.scrollIntoView?.({ behavior: launcherEffectiveScrollBehavior(surfaceSettings.scrollBehavior, reducedMotion), block: 'nearest' })
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
      const empty = document.createElement('div')
      empty.className = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--dsw-alias-label-secondary,CanvasText)]'
      empty.tabIndex = 0
      empty.setAttribute('role', 'menuitem')
      empty.setAttribute('aria-disabled', 'true')
      empty.append(icon(HistoryIcon), document.createTextNode(messages().noHistory))
      historyPanel.append(empty)
      return
    }
    for (const query of history) {
      const button = document.createElement('button')
      button.className = 'block w-full truncate px-3 py-2 text-left text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]'
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.append(icon(HistoryIcon), document.createTextNode(query))
      button.title = query
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
    const focusedSearchValue = search.value
    void bridge.getSurfaceSettings().then(current => {
      surfaceSettings = current
      history = current.historyEnabled ? [...current.history] : []
      applySurfaceSettings()
      renderHistory()
      if (search.value === focusedSearchValue && currentItems.length === 0) void renderSearch(search.value)
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

  const invocationSearchTerm = (): string => surfaceSettings.preserveUserInput ? search.value : ''

  const actionLabel = (action: LauncherPublicAction): string => (
    action.keyboardShortcut === undefined
      ? action.description
      : `${action.description} (${action.keyboardShortcut})`
  )
  const actionAriaShortcut = (action: LauncherPublicAction, defaultShortcut = false): string | undefined => {
    if (action.keyboardShortcut !== undefined) return launcherShortcutAriaLabel(action.keyboardShortcut)
    return defaultShortcut ? 'Enter' : undefined
  }

  const invoke = async (action: LauncherPublicAction): Promise<void> => {
    if (invoking || workflowInteractionBlocked()) return
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
    if (invokingWorkflow) {
      // A search started before invocation may resolve after the workflow owns the UI.
      // Fence its revision before any asynchronous history write or native effect.
      revision += 1
      setWorkflowBusy(true)
      renderResults()
    }
    closeActionMenu(false)
    if (!invokingWorkflow) renderDetails()
    let pending: Promise<LauncherInvokeResult>
    let invocationStarted = false
    try {
      pending = Promise.resolve(bridge.invokeAction(action.actionId))
      invocationStarted = true
    } catch (error) {
      pending = Promise.reject(error)
    }
    // Keep a handler attached while history persistence is pending; the invocation
    // must be reserved before that await, but a fast rejection must stay contained.
    void pending.catch(() => undefined)
    if (isWorkflowAction && invocationStarted) {
      activeCancellation = Object.freeze({ actionId: action.actionId, resultSetId: invocationResultSetId })
      renderDetails()
    }
    const historyPending = rememberSearch()
    setStatus(messages().invoking(action.description), 'muted')
    try {
      await historyPending
      const result = await pending
      if (!result.ok) {
        if (isWorkflowAction) {
          invoking = false
          invokingWorkflow = false
          activeCancellation = undefined
          cancellationPending = false
          cancellationRequested = false
          setWorkflowBusy(false)
          renderDetails()
        }
        const refreshed = await renderSearch(search.value)
        if (refreshed) setStatus(messages().refreshed, 'muted')
        restoreSearchFocus()
        return
      }
      if (!surfaceSettings.preserveUserInput) search.value = ''
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
      search.value = invocationSearchTerm()
      await renderSearch(search.value)
      restoreSearchFocus()
    } catch {
      search.value = invocationSearchTerm()
      await renderSearch(search.value).catch(() => undefined)
      setStatus(cancellationRequested && isWorkflowAction ? messages().canceled : messages().invokeFailed(action.description), cancellationRequested && isWorkflowAction ? 'muted' : 'error')
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
    setStatus(messages().canceling, 'muted')
    renderDetails()
    try {
      await bridge.cancelAction(cancellation.actionId, cancellation.resultSetId)
      setStatus(messages().canceled, 'muted')
    } catch {
      cancellationRequested = false
      setStatus(messages().cancelFailed, 'error')
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
    open.disabled = workflowInteractionBlocked()
    open.setAttribute('aria-label', actionLabel(item.defaultAction))
    const openShortcut = actionAriaShortcut(item.defaultAction, true)
    if (openShortcut !== undefined) open.setAttribute('aria-keyshortcuts', openShortcut)
    open.append(icon(ArrowRight))
    const openText = document.createElement('span')
    openText.textContent = item.defaultAction.description
    open.append(openText)
    open.addEventListener('click', () => {
      if (workflowInteractionBlocked()) return
      void invoke(item.defaultAction)
    })

    const toggle = document.createElement('button')
    toggle.className = 'inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] px-2 text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] focus-visible:outline-2'
    toggle.type = 'button'
    toggle.disabled = workflowInteractionBlocked()
    toggle.setAttribute('aria-label', `Actions for ${item.name}`)
    toggle.setAttribute('aria-haspopup', 'menu')
    toggle.setAttribute('aria-expanded', String(actionMenuOpen))
    toggle.setAttribute('aria-controls', 'launcher-actions-menu')
    toggle.setAttribute('aria-keyshortcuts', `${modifier}+K`)
    toggle.append(icon(ListFilter))
    const toggleText = document.createElement('span')
    toggleText.textContent = messages().actions
    toggle.append(toggleText)
    toggle.addEventListener('click', () => {
      if (workflowInteractionBlocked()) return
      if (!actionMenuOpen) {
        historyOpen = false
        historyPanel.hidden = true
        historyToggle.setAttribute('aria-expanded', 'false')
      }
      actionMenuOpen = !actionMenuOpen
      renderDetails()
      if (actionMenuOpen) details.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
      else restoreSearchFocus()
    })

    const row = document.createElement('div')
    row.className = 'flex min-w-0 flex-wrap items-center gap-2'
    row.append(selection, open)
    if (activeCancellation !== undefined && item.sourceExtension === 'Workflow') {
      const cancel = document.createElement('button')
      cancel.className = 'inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] px-2 text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] focus-visible:outline-2'
      cancel.type = 'button'
      cancel.disabled = cancellationPending
      cancel.dataset.testid = 'tocklauncher-cancel-workflow'
      cancel.setAttribute('aria-label', 'Cancel workflow')
      cancel.textContent = messages().cancel
      cancel.addEventListener('click', () => { void cancelActiveWorkflow() })
      row.append(cancel)
    }
    row.append(toggle)
    details.append(row)
    if (!actionMenuOpen) return

    const menu = document.createElement('div')
    menu.className = 'absolute bottom-full right-0 z-10 mb-2 max-h-[240px] w-[min(320px,calc(100vw-2rem))] min-w-0 max-w-full overflow-y-auto rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--dsw-alias-bg-layer-1,Canvas)] py-1 shadow-lg'
    menu.id = 'launcher-actions-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', `Actions for ${item.name}`)
    const actions = [item.defaultAction, ...(item.additionalActions ?? [])]
    for (const action of actions) {
      const actionButton = document.createElement('button')
      actionButton.className = 'flex w-full items-center gap-2 truncate px-3 py-2 text-left text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] focus-visible:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]'
      actionButton.type = 'button'
      actionButton.disabled = workflowInteractionBlocked()
      actionButton.setAttribute('role', 'menuitem')
      actionButton.setAttribute('aria-label', actionLabel(action))
      actionButton.title = action.description
      const ariaShortcut = actionAriaShortcut(action, true)
      if (ariaShortcut !== undefined) actionButton.setAttribute('aria-keyshortcuts', ariaShortcut)
      const description = action.description.toLowerCase()
      const actionIcon = description.includes('favorite')
        ? description.includes('remove') ? StarOff : Star
        : description.includes('exclude') ? Trash2 : ArrowRight
      actionButton.append(icon(actionIcon), document.createTextNode(actionLabel(action)))
      actionButton.addEventListener('click', () => {
        if (workflowInteractionBlocked()) return
        void invoke(action)
      })
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
      else if (event.key === 'Escape' || event.key === 'Tab') {
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
    const heading = document.createElement('h2')
    heading.id = `launcher-group-${name.toLocaleLowerCase('en-US')}`
    heading.className = 'm-0 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--dsw-alias-label-secondary,CanvasText)]'
    heading.textContent = name
    group.setAttribute('aria-labelledby', heading.id)
    const list = document.createElement('ul')
    list.className = 'm-0 list-none p-0'
    list.setAttribute('role', 'presentation')
    for (const [index, item] of items.entries()) {
      const listItem = document.createElement('li')
      listItem.setAttribute('role', 'presentation')
      const button = document.createElement('button')
      button.className = 'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] focus-visible:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] aria-selected:bg-[var(--dsw-alias-interactive-bg-active,rgb(0_0_0_/_10%))] aria-selected:font-semibold'
      button.type = 'button'
      button.disabled = workflowInteractionBlocked()
      button.id = `launcher-result-${encodeURIComponent(item.id)}`
      button.dataset.resultId = item.id
      button.title = item.name
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
        if (workflowInteractionBlocked()) return
        const wasActionMenuOpen = actionMenuOpen
        selectedItemId = item.id
        actionMenuOpen = false
        updateSelection()
        if (surfaceSettings.singleClickBehavior === 'invokeSearchResultItem') void invoke(item.defaultAction)
        else if (wasActionMenuOpen) restoreSearchFocus()
      })
      button.addEventListener('dblclick', () => {
        if (workflowInteractionBlocked()) return
        if (surfaceSettings.singleClickBehavior !== 'invokeSearchResultItem' && surfaceSettings.doubleClickBehavior === 'invokeSearchResultItem') void invoke(item.defaultAction)
      })
      listItem.append(button)
      list.append(listItem)
    }
    group.append(heading, list)
    results.append(group)
  }

  function renderResults(): void {
    results.replaceChildren()
    const copy = messages()
    renderGroup(copy.pinned, currentItems.slice(0, pinnedCount), 0)
    renderGroup(search.value.trim().length === 0 ? copy.recent : copy.results, currentItems.slice(pinnedCount), pinnedCount)
    updateSelection()
  }

  async function renderSearch(term: string): Promise<boolean> {
    if (workflowInteractionBlocked()) return false
    const currentRevision = ++revision
    setStatus(messages().searching, 'muted')
    try {
      const response = await bridge.search(term, {
        fuzziness: surfaceSettings.fuzziness,
        maxSearchResultItems: surfaceSettings.maxSearchResultItems,
        searchEngineId: surfaceSettings.searchEngineId,
      })
      if (currentRevision !== revision || workflowInteractionBlocked()) return false
      const previous = selectedItemId
      pinnedCount = response.before.length
      currentItems = [...response.before, ...response.after]
      currentResultSetId = response.resultSetId
      selectedItemId = currentItems.some(item => item.id === previous) ? previous : currentItems[0]?.id ?? ''
      search.setAttribute('aria-expanded', String(currentItems.length > 0))
      renderResults()
      const error = response.status.lastError
      setStatus(error ?? (currentItems.length === 0
        ? messages().noResults
        : messages().indexed(response.status.indexedItemCount)), error ? 'error' : 'ready')
      document.documentElement.dataset.launcherResultRevision = String(currentRevision)
      return error === undefined
    } catch {
      if (currentRevision !== revision || workflowInteractionBlocked()) return false
      currentItems = []
      pinnedCount = 0
      selectedItemId = ''
      search.setAttribute('aria-expanded', 'false')
      renderResults()
      setStatus(messages().unavailable, 'error')
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
    actionMenuOpen = false
    historyOpen = !historyOpen
    renderDetails()
    historyPanel.hidden = !historyOpen
    historyToggle.setAttribute('aria-expanded', String(historyOpen))
    if (historyOpen) {
      renderHistory()
      historyPanel.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    } else restoreSearchFocus()
  })
  historyPanel.addEventListener('keydown', event => {
    const buttons = [...historyPanel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    if (event.key === 'Escape' || event.key === 'Tab') {
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
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
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
    setStatus(messages().rescanning, 'muted')
    try {
      await bridge.rescan()
      await renderSearch(search.value)
    } catch {
      setStatus(messages().rescanFailed, 'error')
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
      else if (surfaceSettings.hideWindowOn.includes('escapePressed')) void bridge.dismiss().catch(() => undefined)
      return
    }
    if (workflowInteractionBlocked()) return
    if (hasPrimaryModifier(event) && event.key === ',') {
      event.preventDefault()
      void bridge.openSettings().catch(() => undefined)
      return
    }
    const shortcutAction = selectedItem() === undefined ? undefined : [selectedItem()!.defaultAction, ...(selectedItem()!.additionalActions ?? [])]
      .find(action => action.keyboardShortcut !== undefined && launcherShortcutMatches(event, action.keyboardShortcut, surfacePlatform))
    if (shortcutAction !== undefined) {
      event.preventDefault()
      void invoke(shortcutAction)
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
    } else if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      const item = selectedItem()
      if (item !== undefined) void invoke(item.defaultAction)
    } else if (event.key === 'F5' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      rescan.click()
    } else if (hasPrimaryModifier(event) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (selectedItem() === undefined) return
      historyOpen = false
      historyPanel.hidden = true
      historyToggle.setAttribute('aria-expanded', 'false')
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
    const eventInsideTool = activeLocalTool !== undefined
      && event.target instanceof Node
      && activeLocalTool.contains(event.target)
    if (eventInsideTool && event.key !== 'Escape') return
    if (event.target !== search && !workflowInteractionBlocked() && hasPrimaryModifier(event) && event.key === ',') {
      event.preventDefault()
      void bridge.openSettings().catch(() => undefined)
      return
    }
    if (event.target !== search && !workflowInteractionBlocked()) {
      if (hasPrimaryModifier(event) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (selectedItem() === undefined) return
        historyOpen = false
        historyPanel.hidden = true
        historyToggle.setAttribute('aria-expanded', 'false')
        actionMenuOpen = !actionMenuOpen
        renderDetails()
        if (actionMenuOpen) details.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
        else restoreSearchFocus()
        return
      }
      if (hasPrimaryModifier(event) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        closeActionMenu(false)
        closeHistory(false)
        restoreSearchFocus()
        return
      }
      if (activeLocalTool === undefined) {
        const item = selectedItem()
        const action = item === undefined ? undefined : [item.defaultAction, ...(item.additionalActions ?? [])]
          .find(candidate => candidate.keyboardShortcut !== undefined && launcherShortcutMatches(event, candidate.keyboardShortcut, surfacePlatform))
        if (action !== undefined) {
          event.preventDefault()
          void invoke(action)
          return
        }
      }
    }
    if (event.key !== 'Escape' || event.target === search) return
    event.preventDefault()
    event.stopPropagation()
    if (activeLocalTool !== undefined) closeLocalTool()
    else if (actionMenuOpen) closeActionMenu()
    else if (historyOpen) closeHistory()
    else if (surfaceSettings.hideWindowOn.includes('escapePressed')) void bridge.dismiss().catch(() => undefined)
  })
  document.addEventListener('pointerdown', event => {
    if (activeLocalTool !== undefined) {
      activeLocalTool.dispatchEvent(new Event('tockteam-launcher-close-tool-menu'))
    }
    if (!(event.target instanceof Element)) return
    if (historyOpen && event.target.closest('#launcher-history, #launcher-history-toggle') === null) closeHistory()
    if (actionMenuOpen && event.target.closest('#launcher-details') === null) closeActionMenu()
  })
  bridge.onLocale(locale => {
    surfaceSettings = Object.freeze({ ...surfaceSettings, locale })
    history = surfaceSettings.historyEnabled ? [...surfaceSettings.history] : []
    applySurfaceSettings()
    renderHistory()
    renderResults()
  })

  renderHistory()
  await renderSearch('')
  setReady(true)
  search.focus()
}

setReady(false)
void bootstrap().catch(() => { setReady(false) })
