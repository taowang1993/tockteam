import { isLauncherExtensionId } from './launcher-extension-settings.ts'
import { createTrustedRaycastView } from './trusted-raycast-renderer.ts'
import { createTrustedRaycastFirstUseView, createTrustedRaycastTrustView } from './trusted-raycast-trust-view.ts'
import { trustedRaycastCommands, trustedRaycastSetupId, trustedRaycastAssetUrl, TRUSTED_RAYCAST_TRUST_RESULT_ID } from './trusted-raycast-catalog.ts'
import {
  ArrowRight,
  History as HistoryIcon,
  Notebook,
  Search,
  Star,
  StarOff,
  Trash2,
  createElement,
} from 'lucide'
import type { IconNode } from 'lucide'
import type { LauncherPublicAction, LauncherPublicResultItem } from './launcher-actions.ts'
import {
  LAUNCHER_HIDE_WINDOW_ON_DEFAULT,
  launcherEffectiveScrollBehavior,
  launcherShortcutAriaLabel,
  launcherShortcutMatches,
  type LauncherSearchSection,
  type LauncherInvokeResult,
  type LauncherSurfacePlatform,
  type LauncherSurfaceSettings,
} from './launcher-contract.ts'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import { launcherOriginalThemeTokens, type LauncherThemeProjection } from './launcher-theme.ts'
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
  actionsFor: string
  applications: string
  cancel: string
  commands: string
  cancelFailed: string
  canceling: string
  canceled: string
  cancelWorkflow: string
  fileSearchUnavailable: string
  indexed: (count: number) => string
  invokeFailed: (action: string) => string
  invoking: (action: string) => string
  history: string
  noHistory: string
  noResults: string
  openCommand: string
  pinned: string
  providerState: (state: string) => string
  recent: string
  refreshed: string
  results: string
  search: string
  searching: string
  unavailable: string
}>

const LAUNCHER_MESSAGES: Readonly<Record<'en' | 'zh', LauncherMessages>> = Object.freeze({
  en: Object.freeze({
    actions: 'Actions',
    actionsFor: 'Actions for',
    applications: 'Applications',
    cancel: 'Cancel',
    commands: 'Commands',
    cancelFailed: 'Workflow could not be canceled.',
    canceling: 'Canceling workflow…',
    canceled: 'Workflow canceled.',
    cancelWorkflow: 'Cancel workflow',
    fileSearchUnavailable: 'Local extension settings are unavailable.',
    history: 'History',
    indexed: (count: number) => `${count} indexed destinations`,
    invokeFailed: (action: string) => `${action} could not be completed.`,
    invoking: (action: string) => `${action}…`,
    noHistory: 'No Recent Searches',
    noResults: 'No TockTeam destinations found.',
    openCommand: 'Open Command',
    refreshed: 'Results Refreshed. Try Again.',
    pinned: 'Pinned',
    providerState: (state: string) => state,
    recent: 'Recent',
    results: 'Results',
    search: 'Search TockTeam',
    unavailable: 'TockLauncher destinations are unavailable.',
    searching: 'Searching…',
  }),
  zh: Object.freeze({
    actions: '操作',
    actionsFor: '操作：',
    applications: '应用程序',
    cancel: '取消',
    commands: '命令',
    cancelFailed: '无法取消工作流。',
    canceling: '正在取消工作流…',
    canceled: '工作流已取消。',
    cancelWorkflow: '取消工作流',
    fileSearchUnavailable: '本地扩展设置不可用。',
    history: '历史',
    indexed: (count: number) => `${count} 个已索引目标`,
    invokeFailed: (action: string) => `${action} 无法完成。`,
    invoking: (action: string) => `${action}…`,
    noHistory: '没有最近搜索',
    noResults: '未找到 TockTeam 目标。',
    openCommand: '打开命令',
    refreshed: '结果已刷新，请重试。',
    pinned: '置顶',
    providerState: (state: string) => ({ disabled: '已禁用', unavailable: '不可用', unsupported: '不支持', ready: '就绪' } as Record<string, string>)[state] ?? state,
    recent: '最近',
    results: '结果',
    search: '搜索 TockTeam',
    unavailable: 'TockLauncher 目标不可用。',
    searching: '正在搜索…',
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
  for (const [token, value] of Object.entries(skin?.tokens ?? launcherOriginalThemeTokens(projection.mode))) {
    root.style.setProperty(token, value)
    appliedThemeTokens.add(token)
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

function createLauncherShortcut(shortcut: string): HTMLSpanElement {
  const normalized = shortcut
    .replace('Cmd', '⌘')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Enter', '↵')
    .replace('Backspace', '⌫')
    .replace('Delete', 'Del')
  const wrapper = document.createElement('span')
  wrapper.className = 'inline-flex shrink-0 items-center gap-px'
  wrapper.setAttribute('aria-hidden', 'true')
  for (const part of normalized.split('+')) {
    const key = document.createElement('kbd')
    key.className = 'inline-grid box-border h-4 min-w-4 place-items-center rounded-[3px] border border-[color-mix(in_srgb,var(--dsw-alias-label-primary,CanvasText)_12%,var(--dsw-alias-border-l1,CanvasText))] bg-[color-mix(in_srgb,var(--dsw-alias-label-primary,CanvasText)_9%,transparent)] px-[1.5px] font-sans text-[9px] leading-none text-[var(--dsw-alias-label-secondary,CanvasText)] shadow-[0_1px_0_0_var(--dsw-alias-border-l1,CanvasText)]'
    key.textContent = part
    wrapper.append(key)
  }
  return wrapper
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('launcher-root') as HTMLElement
  const search = document.getElementById('launcher-search') as HTMLInputElement
  const searchForm = document.getElementById('launcher-search-form') as HTMLElement
  const searchIcon = document.getElementById('launcher-search-icon') as HTMLElement
  const results = document.getElementById('launcher-results') as HTMLUListElement
  const status = document.getElementById('launcher-status') as HTMLElement
  const providerStatuses = document.getElementById('launcher-provider-statuses') as HTMLElement
  const historyToggle = document.getElementById('launcher-history-toggle') as HTMLButtonElement
  const historyPanel = document.getElementById('launcher-history') as HTMLElement
  const details = document.getElementById('launcher-details') as HTMLElement
  const footer = document.getElementById('launcher-footer') as HTMLElement
  const footerSelection = document.getElementById('launcher-footer-selection') as HTMLElement
  const bridge = window.tockteamLauncher as LauncherBridge
  if (!(root instanceof HTMLElement)
    || !(search instanceof HTMLInputElement)
    || !(searchForm instanceof HTMLElement)
    || !(searchIcon instanceof HTMLElement)
    || !(results instanceof HTMLUListElement)
    || !(status instanceof HTMLElement)
    || !(providerStatuses instanceof HTMLElement)
    || !(historyToggle instanceof HTMLButtonElement)
    || !(historyPanel instanceof HTMLElement)
    || !(details instanceof HTMLElement)
    || !(footer instanceof HTMLElement)
    || !(footerSelection instanceof HTMLElement)
    || bridge === undefined) {
    throw new Error('TockLauncher renderer is missing its required controls')
  }

  searchIcon.append(icon(Search))
  historyToggle.prepend(icon(HistoryIcon))
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
  let currentSections: LauncherSearchSection[] = []
  let currentResultSetId = ''
  let actionMenuOpen = false
  let historyOpen = false
  let invoking = false
  let invokingWorkflow = false
  let cancellationPending = false
  let cancellationRequested = false
  let activeCancellation: Readonly<{ actionId: string; resultSetId: string }> | undefined
  let trustManagement: ReturnType<typeof createTrustedRaycastTrustView> | undefined
  let firstUseView: ReturnType<typeof createTrustedRaycastFirstUseView> | undefined
  let trustedClosePending: Promise<unknown> = Promise.resolve()
  let closingTrusted = false
  const closeTrusted = (): void => {
    if (closingTrusted) return
    closingTrusted = true
    trustedClosePending = bridge.trustedRaycastClose().finally(() => { closingTrusted = false })
    void trustedClosePending.catch(() => undefined)
  }
  let trustedOpening = false
  let trustedInvocation = false
  let toolSequence = 0
  let trustedView: ReturnType<typeof createTrustedRaycastView> | undefined
  let activeLocalTool: HTMLElement | undefined
  let activeLocalToolId: LauncherLocalToolId | undefined
  let surfaceSettings: LauncherSurfaceSettings = Object.freeze({
    doubleClickBehavior: 'invokeSearchResultItem',
    dragAndDropEnabled: false,
    fuzziness: 0.5,
    history: Object.freeze([]),
    historyEnabled: false,
    historyLimit: 10,
    hideWindowOn: LAUNCHER_HIDE_WINDOW_ON_DEFAULT,
    locale: 'en-US',
    maxSearchResultItems: 50,
    placeholder: 'Type here...',
    preserveUserInput: true,
    providerStatuses: Object.freeze([]),
    searchBarAppearance: 'auto',
    searchBarSize: 'large',
    searchEngineId: 'fuzzysort',
    searchResultLayout: 'compact',
    scrollBehavior: 'smooth',
    showSearchIcon: false,
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
    document.getElementById('launcher-search-label')?.replaceChildren(document.createTextNode(copy.search))
    search.setAttribute('aria-label', copy.search)
    historyToggle.setAttribute('aria-label', copy.history)
    results.setAttribute('aria-label', copy.results)
    searchIcon.hidden = !surfaceSettings.showSearchIcon
    searchIcon.classList.toggle('hidden', !surfaceSettings.showSearchIcon)
    searchIcon.classList.toggle('flex', surfaceSettings.showSearchIcon)
    search.classList.toggle('pl-7', surfaceSettings.showSearchIcon)
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
    providerStatuses.hidden = surfaceSettings.providerStatuses.every(provider => provider.state === 'ready' || provider.state === 'disabled')
    providerStatuses.textContent = surfaceSettings.providerStatuses
      .filter(provider => provider.state !== 'ready' && provider.state !== 'disabled')
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
    if (firstUseView !== undefined) { firstUseView.focus(); return }
    if (trustedView !== undefined) { trustedView.focus(); return }
    search.focus()
    search.select()
  }

  const setWorkflowBusy = (busy: boolean): void => {
    search.disabled = busy
    historyToggle.disabled = busy || !surfaceSettings.historyEnabled
  }

  const workflowInteractionBlocked = (): boolean => invokingWorkflow || activeCancellation !== undefined || cancellationPending

  const closeLocalTool = (): void => {
    toolSequence++
    if (trustedInvocation) invoking = false
    trustManagement?.dispose(); trustManagement = undefined
    if (firstUseView || trustedOpening || trustedInvocation || trustedView) closeTrusted()
    firstUseView?.dispose(); firstUseView = undefined
    trustedOpening = false; trustedInvocation = false
    if (trustedView) { trustedView.dispose(); trustedView = undefined }
    const tool = activeLocalTool
    activeLocalTool = undefined
    activeLocalToolId = undefined
    tool?.remove()
    for (const element of [searchForm, providerStatuses, results, footer]) { element.hidden = false; element.classList.remove('hidden') }
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
    for (const element of [searchForm, providerStatuses, results, footer]) { element.hidden = true; element.classList.add('hidden') }
  }
  bridge.onTrustedRaycastView(message => {
    if (message.type === 'ready') {
      if (!trustedOpening) { closeTrusted(); return }
      firstUseView?.dispose(); firstUseView = undefined
      trustedView?.dispose()
      activeLocalTool?.remove()
      trustedView = createTrustedRaycastView(document, bridge, closeLocalTool, surfaceSettings.locale)
      activeLocalTool = trustedView.element
      activeLocalToolId = undefined
      hideLauncherControls()
      root.append(trustedView.element)
    }
    trustedView?.update(message)
  })
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
  const openTrustedRaycastTrustView = (): void => {
    const tool = createTrustedRaycastTrustView(document, bridge, closeLocalTool, surfaceSettings.locale)
    trustManagement = tool
    activeLocalTool = tool.element
    activeLocalToolId = undefined
    hideLauncherControls()
    root.append(tool.element)
    tool.focus()
  }

  const openFirstUse = (extensionId: typeof trustedRaycastCommands[number]['extensionId']): void => {
    const sequence = toolSequence
    const tool = createTrustedRaycastFirstUseView(document, bridge, extensionId, closeLocalTool, async (digest, mode) => {
      if (sequence !== toolSequence) return
      await trustedClosePending
      if (sequence !== toolSequence) return
      trustedOpening = true
      try {
        const result = await bridge.trustedRaycastFirstUse({ extensionId, digest, mode })
        if (sequence !== toolSequence) return
        if (!result.ok) throw new Error(result.error)
      } catch (error) {
        if (sequence === toolSequence) trustedOpening = false
        throw error
      }
    }, () => {
      firstUseView?.dispose(); firstUseView = undefined
      activeLocalTool?.remove()
      closeTrusted()
      openTrustedRaycastTrustView()
    }, surfaceSettings.locale)
    firstUseView = tool; activeLocalTool = tool.element; activeLocalToolId = undefined
    hideLauncherControls(); root.append(tool.element)
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
    // Hiding revoked the main-owned child; its old view cannot be resumed.
    if (trustedView || trustedOpening || trustedInvocation || firstUseView) { closeLocalTool(); return }
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
    const setupCommand = trustedRaycastCommands.find(command => candidate?.defaultAction.actionId === action.actionId && candidate.id === trustedRaycastSetupId(command.extensionId))
    const runtimeCommand = trustedRaycastCommands.find(command => candidate?.defaultAction.actionId === action.actionId && candidate.id === command.id)
    const sequence = ++toolSequence
    trustedInvocation = !!(setupCommand || runtimeCommand)
    trustedOpening = false
    // Drain already-sent ready messages before a new intent may own the renderer.
    if (trustedInvocation) closeTrusted()
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
    const trustTool = candidate !== undefined
      && candidate.id === TRUSTED_RAYCAST_TRUST_RESULT_ID
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
      pending = trustedInvocation ? trustedClosePending.then(() => {
        if (sequence !== toolSequence) throw new Error('Extension opening canceled')
        trustedOpening = !!runtimeCommand
        return bridge.invokeAction(action.actionId)
      }) : Promise.resolve(bridge.invokeAction(action.actionId))
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
      if (sequence !== toolSequence) return
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
      if (trustedView !== undefined) { trustedView.focus(); return }
      if (setupCommand) { openFirstUse(setupCommand.extensionId); return }
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
      if (trustTool) {
        openTrustedRaycastTrustView()
        return
      }
      search.value = invocationSearchTerm()
      await renderSearch(search.value)
      restoreSearchFocus()
    } catch {
      if (sequence !== toolSequence) return
      trustedOpening = false
      search.value = invocationSearchTerm()
      await renderSearch(search.value).catch(() => undefined)
      setStatus(cancellationRequested && isWorkflowAction ? messages().canceled : messages().invokeFailed(action.description), cancellationRequested && isWorkflowAction ? 'muted' : 'error')
      restoreSearchFocus()
    } finally {
      if (sequence === toolSequence) {
        trustedInvocation = false
        invoking = false
        invokingWorkflow = false
        activeCancellation = undefined
        cancellationPending = false
        cancellationRequested = false
        setWorkflowBusy(false)
        renderDetails()
      }
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

  const createResultMarker = (item: LauncherPublicResultItem): HTMLImageElement | HTMLSpanElement => {
    const localAsset = Object.hasOwn(LAUNCHER_LOCAL_EXTENSION_ASSET_URLS, item.sourceExtension) && item.imageKey !== undefined
      ? LAUNCHER_LOCAL_EXTENSION_ASSET_URLS[item.sourceExtension as keyof typeof LAUNCHER_LOCAL_EXTENSION_ASSET_URLS]
      : undefined
    const packagedAsset = item.imageKey === undefined
      ? undefined
      : item.imageKey === 'tockcoder' ? './launcher-assets/tockteam-logo.svg'
      : launcherDiscoveryAssetUrl(item.imageKey) ?? launcherFileSearchAssetUrl(item.imageKey) ?? launcherNetworkAssetUrl(item.imageKey) ?? launcherOsAssetUrl(item.imageKey, appliedThemeMode) ?? launcherTerminalAssetUrl(item.imageKey) ?? launcherWorkflowAssetUrl(item.imageKey) ?? trustedRaycastAssetUrl(item.imageKey)
    const imageUrl = isLauncherImageUrl(item.imageUrl) ? item.imageUrl : localAsset ?? packagedAsset
    const marker = imageUrl === undefined ? document.createElement('span') : document.createElement('img')
    marker.className = 'launcher-command-row-icon text-[10px] font-semibold'
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
    } else if (item.imageKey === 'tocktutor') marker.append(icon(Notebook))
    else marker.textContent = item.name.slice(0, 1).toLocaleUpperCase()
    return marker
  }

  function renderDetails(): void {
    details.replaceChildren()
    footerSelection.replaceChildren()
    const item = selectedItem()
    if (item === undefined) return

    const selectionName = document.createElement('span')
    selectionName.className = 'min-w-0 truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'
    selectionName.textContent = item.name
    footerSelection.append(createResultMarker(item), selectionName)

    const open = document.createElement('button')
    open.className = 'launcher-command-footer-action'
    open.type = 'button'
    open.disabled = workflowInteractionBlocked()
    open.setAttribute('aria-label', actionLabel(item.defaultAction))
    const openShortcut = actionAriaShortcut(item.defaultAction, true)
    if (openShortcut !== undefined) open.setAttribute('aria-keyshortcuts', openShortcut)
    const openText = document.createElement('span')
    openText.textContent = messages().openCommand
    open.append(openText, createLauncherShortcut('Enter'))
    open.addEventListener('click', () => {
      if (workflowInteractionBlocked()) return
      void invoke(item.defaultAction)
    })

    const toggle = document.createElement('button')
    toggle.className = 'launcher-command-footer-action text-[var(--dsw-alias-label-secondary,CanvasText)]'
    toggle.type = 'button'
    toggle.disabled = workflowInteractionBlocked()
    toggle.setAttribute('aria-label', `${messages().actionsFor} ${item.name}`)
    toggle.setAttribute('aria-haspopup', 'menu')
    toggle.setAttribute('aria-expanded', String(actionMenuOpen))
    toggle.setAttribute('aria-controls', 'launcher-actions-menu')
    toggle.setAttribute('aria-keyshortcuts', `${modifier}+K`)
    const toggleText = document.createElement('span')
    toggleText.textContent = messages().actions
    toggle.append(toggleText, createLauncherShortcut(`${isMac ? 'Cmd' : 'Ctrl'}+K`))
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
    row.className = 'launcher-command-footer-actions'
    row.append(open)
    if (activeCancellation !== undefined && item.sourceExtension === 'Workflow') {
      const cancel = document.createElement('button')
      cancel.className = 'launcher-command-footer-action text-[var(--dsw-alias-label-secondary,CanvasText)]'
      cancel.type = 'button'
      cancel.disabled = cancellationPending
      cancel.dataset.testid = 'tocklauncher-cancel-workflow'
      cancel.setAttribute('aria-label', messages().cancelWorkflow)
      cancel.textContent = messages().cancel
      cancel.addEventListener('click', () => { void cancelActiveWorkflow() })
      row.append(cancel)
    }
    row.append(toggle)
    details.append(row)
    if (!actionMenuOpen) return

    const menu = document.createElement('div')
    menu.className = 'launcher-command-menu bottom-[calc(100%+10px)] right-0'
    menu.id = 'launcher-actions-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', `${messages().actionsFor} ${item.name}`)
    const actions = [item.defaultAction, ...(item.additionalActions ?? [])]
    for (const action of actions) {
      const actionButton = document.createElement('button')
      actionButton.className = 'launcher-command-menu-item grid-cols-[18px_minmax(0,1fr)_auto]'
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
      const actionText = document.createElement('span')
      actionText.className = 'min-w-0 truncate text-xs font-medium'
      actionText.textContent = action.description
      actionButton.append(icon(actionIcon), actionText, createLauncherShortcut(action.keyboardShortcut ?? 'Enter'))
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
    const extensionId = isLauncherExtensionId(item.sourceExtension) ? item.sourceExtension
      : trustedRaycastCommands.find(command => command.id === item.id || trustedRaycastSetupId(command.extensionId) === item.id)?.extensionId
    if (extensionId) {
      const settingsAction = document.createElement('button')
      settingsAction.type = 'button'
      settingsAction.className = 'launcher-command-menu-item'
      settingsAction.setAttribute('role', 'menuitem')
      settingsAction.textContent = surfaceSettings.locale === 'zh-CN' ? '扩展设置' : 'Extension Settings'
      settingsAction.disabled = workflowInteractionBlocked()
      settingsAction.addEventListener('click', () => { if (!workflowInteractionBlocked()) void bridge.openSettings(extensionId).catch(() => undefined) })
      menu.append(settingsAction)
    }
    details.append(menu)
  }

  const renderGroup = (id: string, name: string, items: readonly LauncherPublicResultItem[], start: number): void => {
    if (items.length === 0) return
    const group = document.createElement('li')
    group.className = 'mb-0.5'
    group.setAttribute('role', 'group')
    const heading = document.createElement('h2')
    heading.id = `launcher-group-${id}`
    heading.className = 'launcher-command-group-title'
    heading.textContent = name
    group.setAttribute('aria-labelledby', heading.id)
    const list = document.createElement('ul')
    list.className = 'm-0 list-none p-0'
    list.setAttribute('role', 'presentation')
    for (const [index, item] of items.entries()) {
      const listItem = document.createElement('li')
      listItem.setAttribute('role', 'presentation')
      const button = document.createElement('button')
      button.className = 'launcher-command-row'
      button.type = 'button'
      button.disabled = workflowInteractionBlocked()
      button.id = `launcher-result-${encodeURIComponent(item.id)}`
      button.dataset.resultId = item.id
      button.title = item.name
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(item.id === selectedItemId))
      button.tabIndex = -1
      const resultIndex = start + index
      if (resultIndex < 9) button.setAttribute('aria-keyshortcuts', `${modifier}+${resultIndex + 1}`)
      const compact = surfaceSettings.searchResultLayout === 'compact'
      const copy = document.createElement('span')
      copy.className = compact ? 'flex min-w-0 flex-1 items-baseline gap-2' : 'min-w-0 flex-1'
      const nameElement = document.createElement('strong')
      nameElement.className = compact ? 'min-w-0 max-w-[42%] shrink-0 truncate text-[13px] font-medium tracking-[0.004em]' : 'block truncate text-sm font-medium'
      nameElement.textContent = item.name
      const description = document.createElement('span')
      description.className = compact ? 'min-w-0 flex-1 truncate text-xs font-medium text-[var(--dsw-alias-label-secondary,CanvasText)]' : 'block truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'
      description.textContent = item.description
      copy.append(nameElement, description)
      if (!compact && item.details !== undefined) {
        const itemDetails = document.createElement('span')
        itemDetails.className = 'block truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'
        itemDetails.textContent = item.details
        copy.append(itemDetails)
      }
      button.append(createResultMarker(item), copy)
      if (resultIndex < 9) {
        const shortcut = createLauncherShortcut(`${isMac ? 'Cmd' : 'Ctrl'}+${resultIndex + 1}`)
        shortcut.classList.add('launcher-result-shortcut', 'ml-auto')
        button.append(shortcut)
      }
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
    let start = 0
    for (const section of currentSections) {
      const name = section.id === 'pinned'
        ? copy.pinned
        : section.id === 'recent'
          ? copy.recent
          : section.id === 'commands'
            ? copy.commands
            : section.id === 'applications'
              ? copy.applications
              : copy.results
      renderGroup(section.id, name, section.items, start)
      start += section.items.length
    }
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
      currentSections = [...response.sections]
      currentItems = currentSections.flatMap(section => section.items)
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
      currentSections = []
      selectedItemId = ''
      search.setAttribute('aria-expanded', 'false')
      renderResults()
      setStatus(messages().unavailable, 'error')
      return false
    }
  }

  launcherThemeRerender = () => {
    if (trustedView !== undefined) { trustedView.refreshTheme(); return }
    if (activeLocalTool === undefined && !invokingWorkflow) void renderSearch(search.value)
  }
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
  const scrollbarHideTimers = new WeakMap<HTMLElement, number>()
  root.addEventListener('scroll', event => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    target.dataset.scrolling = 'true'
    window.clearTimeout(scrollbarHideTimers.get(target))
    scrollbarHideTimers.set(target, window.setTimeout(() => {
      delete target.dataset.scrolling
      scrollbarHideTimers.delete(target)
    }, 300))
  }, { capture: true, passive: true })
  search.addEventListener('input', () => {
    if (invokingWorkflow) return
    void renderSearch(search.value)
  })
  // Preserve native composition before any root, menu, or nested tool shortcut.
  root.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) event.stopImmediatePropagation()
  }, { capture: true })
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (activeLocalTool !== undefined || trustedInvocation || trustedOpening) closeLocalTool()
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
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (currentItems.length > 0) {
        selectedItemId = currentItems[event.key === 'Home' ? 0 : currentItems.length - 1]?.id ?? ''
        updateSelection()
      }
    } else if (event.key === 'Enter' && !event.repeat && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      const item = selectedItem()
      if (item !== undefined) void invoke(item.defaultAction)
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
    if (activeLocalTool !== undefined || trustedInvocation || trustedOpening) closeLocalTool()
    else if (actionMenuOpen) closeActionMenu()
    else if (historyOpen) closeHistory()
    else if (surfaceSettings.hideWindowOn.includes('escapePressed')) void bridge.dismiss().catch(() => undefined)
  })
  document.addEventListener('pointerdown', event => {
    const target = event.target
    const insideToolMenu = target instanceof Element
      && activeLocalTool !== undefined
      && activeLocalTool.contains(target)
      && target.closest('[role="menu"], [aria-haspopup="menu"]') !== null
    if (activeLocalTool !== undefined && !insideToolMenu) {
      activeLocalTool.dispatchEvent(new Event('tockteam-launcher-close-tool-menu'))
    }
    if (!(target instanceof Element)) return
    if (historyOpen && target.closest('#launcher-history, #launcher-history-toggle') === null) closeHistory()
    if (actionMenuOpen && target.closest('#launcher-details') === null) closeActionMenu()
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
