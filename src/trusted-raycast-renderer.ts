import { Check, CircleHelp, CircleX, ChevronDown, ChevronLeft, Hourglass, SearchX, type IconNode } from 'lucide'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import { isTrustedRaycastKaomojiSvg, type TrustedRaycastViewEvent, type TrustedRaycastViewMessage, type TrustedRaycastViewNode } from './trusted-raycast-contract.ts'

/** First-party finite DOM projection. Source callbacks stay in the child; native effects stay in main. */
export function createTrustedRaycastView(document: Document, bridge: LauncherPreloadBridge, onClose: () => void, locale = 'en-US'): { dispose(): void; element: HTMLElement; focus(): void; refreshTheme(): void; update(message: TrustedRaycastViewMessage): void } {
  const zh = locale.startsWith('zh')
  const setHidden = (target: HTMLElement, hidden: boolean): void => { target.hidden = hidden; target.classList?.toggle('!hidden', hidden) }
  const icon = (definition: IconNode, className = 'size-7 opacity-60'): Element => {
    if (typeof document.createElementNS !== 'function') return document.createElement('span')
    type SvgTuple = [string, Record<string, unknown>, SvgTuple[]?]
    const render = ([tag, attributes, children = []]: SvgTuple): Element => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
      for (const child of children) node.append(render(child))
      return node
    }
    const svg = render(definition as unknown as SvgTuple); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', className)
    return svg
  }
  let current: TrustedRaycastViewMessage | undefined
  let themeImages: Array<{ dark: string; image: HTMLImageElement; light: string }> = []
  let lightTheme = document.documentElement?.style?.colorScheme === 'light'
  const refreshTheme = (): void => {
    const light = document.documentElement?.style?.colorScheme === 'light'
    for (const entry of themeImages) entry.image.setAttribute('src', light ? entry.light : entry.dark)
    const changed = light !== lightTheme
    lightTheme = light
    const eventId = current?.root?.props.themeEventId
    if (changed && current?.extensionId === 'can-i-use' && typeof eventId === 'string') {
      setActionPending(); input.disabled = true; queryPending = true; syncBusy()
      status.textContent = 'Refreshing…'
      sendEvent({ kind: 'themeChanged', eventId })
    }
  }
  const sendEvent = (event: { kind: TrustedRaycastViewEvent['kind']; eventId: string; value?: string }): void => {
    if (!current?.root || current.type === 'error') return
    // Field and navigation events are superseded by the next projection; stale rejections stay silent.
    void bridge.trustedRaycastEvent({ extensionId: current.extensionId, sessionId: current.sessionId, generation: current.generation, revision: current.revision, ...event } as TrustedRaycastViewEvent).catch(() => undefined)
  }
  const popNavigation = (): void => {
    const depth = typeof current?.root?.props.navigationDepth === 'number' ? current.root.props.navigationDepth : 0
    if (depth <= 0) return
    if (current?.extensionId === 'can-i-use') {
      const eventId = current.root?.props.navigationEventId
      if (typeof eventId === 'string') sendEvent({ kind: 'navigation', eventId, value: 'can-i-use:pop' })
    } else sendEvent({ kind: 'navigation', eventId: 'language-nav', value: 'language:pop' })
  }
  const element = document.createElement('section'); element.className = 'launcher-local-tool !gap-0 overflow-hidden text-sm'; element.setAttribute('aria-label', 'Trusted Extension'); element.setAttribute('aria-busy', 'false'); element.setAttribute('data-view', 'translate')
  const header = document.createElement('header'); header.className = 'launcher-command-header'
  const close = document.createElement('button'); close.type = 'button'; close.className = 'launcher-command-footer-action !size-8 !min-h-8 !px-0'; close.append(icon(ChevronLeft, 'size-5')); close.setAttribute('aria-label', zh ? '返回结果' : 'Back to Results'); close.addEventListener('click', onClose)
  const titleIcon = document.createElement('img'); titleIcon.setAttribute('src', './trusted-raycast/google-translate.png'); titleIcon.setAttribute('alt', ''); titleIcon.className = 'size-6 rounded-md'
  const title = document.createElement('h2'); title.textContent = 'Google Translate'; title.className = 'm-0 min-w-0 truncate text-sm font-semibold'
  header.append(close, titleIcon, title)
  const hero = document.createElement('div'); hero.className = 'flex flex-col items-center px-6 pb-2 text-center'; hero.hidden = true
  const logoFrame = document.createElement('div'); logoFrame.className = 'launcher-preference-logo mb-5 flex size-16 items-center justify-center rounded-full'
  const logo = document.createElement('img'); logo.setAttribute('src', './trusted-raycast/google-translate.png'); logo.setAttribute('alt', 'Google Translate'); logo.className = 'size-8'; logoFrame.append(logo)
  const heroTitle = document.createElement('h1'); heroTitle.textContent = 'Google Translate'; heroTitle.className = 'm-0 text-2xl font-semibold tracking-[0.025em] text-[var(--dsw-alias-label-primary,CanvasText)]'
  const about = document.createElement('details'); about.className = 'relative mt-2'
  const aboutSummary = document.createElement('summary'); aboutSummary.className = 'cursor-pointer list-none rounded-lg px-2.5 py-0.5 text-sm font-medium text-[var(--dsw-alias-label-primary,CanvasText)] focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; aboutSummary.textContent = zh ? '关于此扩展' : 'About This Extension'
  const aboutInfo = document.createElement('span'); aboutInfo.className = 'ml-1.5'; aboutInfo.textContent = 'ⓘ'; aboutInfo.setAttribute('aria-hidden', 'true'); aboutInfo.setAttribute('data-about-info', ''); aboutSummary.append(aboutInfo)
  const aboutText = document.createElement('p'); aboutText.className = 'absolute left-1/2 z-10 mt-2 w-72 -translate-x-1/2 rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--dsw-alias-bg-overlay,Canvas)] p-3 text-left text-xs leading-5 text-[var(--dsw-alias-label-secondary,CanvasText)] shadow-lg'; aboutText.textContent = zh ? '由 TockTeam 固定并审核的 Google Translate 扩展。' : 'Google Translate is bundled from the exact extension archive reviewed by TockTeam.'
  about.append(aboutSummary, aboutText); hero.append(logoFrame, heroTitle, about)
  const content = document.createElement('div'); content.className = 'launcher-command-content !gap-0 !p-0'
  const intro = document.createElement('p'); intro.className = 'mx-auto mb-2 max-w-3xl px-4 text-center text-[0.84375rem] font-medium text-[var(--dsw-alias-label-secondary,CanvasText)]'; intro.textContent = zh ? '开始使用此扩展前，请设置以下偏好：' : 'Before you can start using this extension, you have to set the following preferences:'; intro.hidden = true
  const back = document.createElement('button'); back.type = 'button'; back.className = 'launcher-command-footer-action mx-4 mt-2'; back.textContent = zh ? '‹ 返回' : '‹ Back'; back.hidden = true; back.addEventListener('click', popNavigation)
  const searchRow = document.createElement('div'); searchRow.className = 'flex min-w-0 flex-1 items-center gap-3'
  const label = document.createElement('label'); label.className = 'flex min-w-0 flex-1 items-center'
  const searchLabel = document.createElement('span'); searchLabel.className = 'sr-only'; searchLabel.textContent = zh ? '要翻译的文本' : 'Text to Translate'
  const input = document.createElement('input'); input.type = 'search'; input.id = 'trusted-raycast-search'; input.maxLength = 16384; input.autocomplete = 'off'; input.className = 'launcher-command-search'; label.append(searchLabel, input)
  const languageSelect = document.createElement('select'); languageSelect.className = 'launcher-command-control !min-h-8 max-w-64 min-w-52 shrink !py-1 text-xs'; languageSelect.setAttribute('aria-label', zh ? '语言集' : 'Language Set'); languageSelect.hidden = true; languageSelect.addEventListener('change', () => {
    const dropdown = current?.root ? descendants(current.root, 'raycast-dropdown')[0] : undefined
    const eventId = dropdown?.props.fieldEventId
    if (typeof eventId === 'string') sendEvent({ kind: 'fieldChanged', eventId, value: languageSelect.value.slice(0, 128) })
  })
  searchRow.append(label, languageSelect)
  const status = document.createElement('p'); status.className = 'launcher-command-status mx-4'; status.setAttribute('role', 'status')
  const panelActions = document.createElement('div'); panelActions.className = 'flex flex-wrap items-start gap-2 py-2'; panelActions.hidden = true
  const results = document.createElement('ul'); results.className = 'launcher-command-list'; results.setAttribute('role', 'list'); results.setAttribute('aria-label', zh ? '翻译结果' : 'Translations')
  const formArea = document.createElement('form'); formArea.className = 'flex flex-col items-start gap-3 py-2'; formArea.hidden = true; formArea.addEventListener('submit', event => { event.preventDefault(); invoke(submitAction) })
  const error = document.createElement('p'); error.className = 'launcher-command-error'; error.setAttribute('role', 'alert'); error.hidden = true
  header.append(searchRow); content.append(intro, back, status, panelActions, results, formArea, error)
  const commandFooter = document.createElement('footer'); commandFooter.className = 'launcher-command-footer'; commandFooter.hidden = true
  const extensionLabel = document.createElement('span'); extensionLabel.className = 'launcher-command-footer-identity'
  const footerIcon = document.createElement('img'); footerIcon.setAttribute('src', './trusted-raycast/google-translate.png'); footerIcon.setAttribute('alt', ''); footerIcon.className = 'size-5'; extensionLabel.append(footerIcon); const footerText = document.createElement('span'); footerText.textContent = zh ? '翻译' : 'Translate'; extensionLabel.append(footerText)
  const footerActions = document.createElement('div'); footerActions.className = 'flex items-center gap-2'; footerActions.setAttribute('role', 'group'); footerActions.setAttribute('aria-label', zh ? '命令操作' : 'Command Actions')
  commandFooter.append(extensionLabel, footerActions); element.append(header, hero, content, commandFooter)
  let actionPending: string | undefined
  let queryPending = false
  const syncBusy = (): void => element.setAttribute('aria-busy', String(actionPending !== undefined || queryPending))
  const setActionPending = (eventId?: string): void => { actionPending = eventId; syncBusy() }
  let preferenceAction: string | undefined
  let actionFeedback = ''
  let selected = 0
  let rootSelected = 0
  let countText = ''
  let composing = false
  let submitAction: TrustedRaycastViewNode | undefined
  let firstFormControl: HTMLElement | undefined
  let primaryFooter: HTMLButtonElement | undefined
  let primaryFooterLabel: HTMLElement | undefined
  let preferenceSetup = false
  type ActionOwner = { item: HTMLElement; actions: TrustedRaycastViewNode[]; buttons: HTMLButtonElement[]; menu: HTMLDetailsElement }
  let rootActionOwner: ActionOwner | undefined
  let rows: (ActionOwner & { detail: HTMLElement | undefined })[] = []
  const descendants = (node: TrustedRaycastViewNode, type: string): TrustedRaycastViewNode[] => [ ...(node.type === type ? [node] : []), ...node.children.flatMap(child => typeof child === 'string' ? [] : descendants(child, type)) ]
  const identity = (): { image: string; title: string } => current?.extensionId === 'can-i-use'
    ? { image: './trusted-raycast-can-i-use/can-i-use.png', title: 'Can I Use' }
    : current?.extensionId === 'kaomoji-search'
    ? { image: './trusted-raycast-kaomoji/kaomoji-search.png', title: 'Kaomoji Search' }
    : { image: './trusted-raycast/google-translate.png', title: 'Google Translate' }
  const syncIdentity = (): void => {
    const value = identity()
    element.setAttribute('aria-label', value.title); title.textContent = value.title; titleIcon.setAttribute('src', value.image)
    searchLabel.textContent = current?.extensionId === 'can-i-use' ? 'Search Web Features' : current?.extensionId === 'kaomoji-search' ? 'Search Kaomoji' : (zh ? '要翻译的文本' : 'Text to Translate')
    results.setAttribute('aria-label', current?.extensionId === 'can-i-use' ? 'Web Features' : current?.extensionId === 'kaomoji-search' ? 'Kaomoji Results' : (zh ? '翻译结果' : 'Translations'))
    heroTitle.textContent = value.title; logo.setAttribute('src', value.image); logo.setAttribute('alt', value.title)
    if (current?.extensionId === 'can-i-use') intro.textContent = 'Use exact browser versions from the reviewed snapshot. Project configuration and automatic browser queries are unavailable.'
    footerIcon.setAttribute('src', value.image); footerText.textContent = current?.extensionId === 'can-i-use' ? 'Can I Use' : current?.extensionId === 'kaomoji-search' ? 'Search Kaomoji' : (zh ? '翻译' : 'Translate')
    aboutText.textContent = current?.extensionId === 'can-i-use' ? 'Can I Use is bundled from the exact extension archive reviewed by TockTeam.' : current?.extensionId === 'kaomoji-search'
      ? 'Kaomoji Search is bundled from the exact extension archive reviewed by TockTeam.'
      : (zh ? '由 TockTeam 固定并审核的 Google Translate 扩展。' : 'Google Translate is bundled from the exact extension archive reviewed by TockTeam.')
  }
  const syncPrimaryFooter = (): void => {
    if (!primaryFooter || !primaryFooterLabel) return
    const action = rows[selected]?.actions[0]
    const title = String(action?.props.title ?? '')
    primaryFooterLabel.textContent = title; primaryFooter.setAttribute('aria-label', title); primaryFooter.disabled = action?.props.actionEventId === undefined; setHidden(primaryFooter, action === undefined)
  }
  let toastText = ''
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  const showToastText = (text: string): void => {
    toastText = text
    status.textContent = text
    if (toastTimer !== undefined) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { if (toastText === text) { toastText = ''; if (status.textContent === text) status.textContent = actionFeedback } }, 3000)
  }
  const invoke = (action: TrustedRaycastViewNode | undefined): boolean => {
    if (!action || !current?.root || current.type === 'error' || pending !== undefined || sending || actionPending) return false
    if (!action.props.actionEventId || action.props.unavailable) { fail(zh ? '此操作不可用。' : 'This action is unavailable.'); return false }
    const eventId = String(action.props.actionEventId)
    setActionPending(eventId)
    if (preferenceSetup) preferenceAction = eventId
    actionFeedback = zh ? '正在执行操作…' : 'Running Action…'
    status.textContent = actionFeedback
    void bridge.trustedRaycastEvent({ extensionId: current.extensionId, sessionId: current.sessionId, generation: current.generation, revision: current.revision, eventId, kind: 'action' }).catch(error => {
      if (actionPending === eventId) { setActionPending(); preferenceAction = undefined; actionFeedback = ''; status.textContent = ''; fail(userActionMessage(error instanceof Error ? error.message : 'Translate action failed')) }
    })
    return true
  }
  // Internal lifecycle rejections (stale/busy/inactive) are runtime bookkeeping, not user-facing service text.
  const userActionMessage = (message: string): string => /stale|busy|inactive/i.test(message) ? (zh ? '此操作已失效，请重试。' : 'That action is no longer available. Please try again.') : message
  const fail = (message: string): void => { setHidden(error, false); error.textContent = message }
  let pending: string | undefined
  let sending = false
  let staleRevision = -1
  const sendLatest = (): void => {
    if (sending || pending === undefined || !current?.root || current.type === 'error' || current.revision <= staleRevision || !element.isConnected) return
    const value = pending
    const revision = current.revision
    sending = true
    void bridge.trustedRaycastEvent({ extensionId: current.extensionId, sessionId: current.sessionId, generation: current.generation, revision, eventId: String(current.root.props.searchEventId), kind: 'searchChanged', value }).then(() => {
      if (pending === value) pending = undefined
      if (current?.type !== 'error') setHidden(error, true)
    }).catch(error => {
      const message = error instanceof Error ? error.message : 'Translate input failed'
      if (message.includes('Translate event is stale')) staleRevision = revision
      else { if (pending === value) pending = undefined; fail(message) }
    }).finally(() => { sending = false; sendLatest() })
  }
  input.addEventListener('input', () => {
    if (!current?.root || input.disabled) return
    toastText = ''
    pending = input.value
    setActionPending()
    actionFeedback = ''
    setHidden(error, true)
    status.textContent = current?.extensionId === 'can-i-use' || current?.extensionId === 'kaomoji-search' ? 'Searching…' : (zh ? '正在翻译…' : 'Translating…')
    queryPending = true; syncBusy()
    sendLatest()
  })
  input.addEventListener('compositionstart', () => { composing = true })
  input.addEventListener('compositionend', () => { composing = false })
  const buttonClass = 'launcher-command-footer-action bg-[var(--dsw-alias-bg-layer-2,Canvas)] disabled:opacity-50'
  const shortcutInfo = (value: unknown): { display: string; aria: string } | undefined => {
    if (typeof value !== 'string') return undefined
    try {
      const parsed = JSON.parse(value) as { macOS?: { key?: unknown; modifiers?: unknown }; key?: unknown; modifiers?: unknown }
      const shortcut = parsed.macOS ?? parsed
      if (typeof shortcut.key !== 'string') return undefined
      const glyphs: Record<string, string> = { cmd: '⌘', ctrl: '⌃', opt: '⌥', shift: '⇧' }
      const ariaModifiers: Record<string, string> = { cmd: 'Meta', ctrl: 'Control', opt: 'Alt', shift: 'Shift' }
      const modifiers = Array.isArray(shortcut.modifiers) ? shortcut.modifiers.filter((item): item is string => typeof item === 'string') : []
      const key = shortcut.key === 'enter' ? '↵' : shortcut.key.toLocaleUpperCase('en-US')
      const ariaKey = shortcut.key === 'enter' ? 'Enter' : shortcut.key.toLocaleUpperCase('en-US')
      return {
        display: [...modifiers.map(item => glyphs[item] ?? item), key].join(' '),
        aria: [...modifiers.map(item => ariaModifiers[item] ?? item), ariaKey].join('+'),
      }
    } catch { return undefined }
  }
  const syncSourceSearch = (root: TrustedRaycastViewNode): void => {
    const list = current?.extensionId === 'can-i-use' ? root : descendants(root, 'raycast-list')[0]
    if (list === undefined || typeof list.props.searchText !== 'string' || composing || pending !== undefined || sending) return
    if (list.props.searchText !== input.value && (document.activeElement !== input || input.value === '')) input.value = list.props.searchText
  }
  const renderDropdown = (root: TrustedRaycastViewNode): void => {
    const dropdown = descendants(root, 'raycast-dropdown')[0]
    setHidden(languageSelect, dropdown === undefined)
    if (dropdown === undefined) return
    languageSelect.replaceChildren()
    for (const item of dropdown.children) {
      if (typeof item === 'string') continue
      const option = document.createElement('option'); option.value = String(item.props.value ?? ''); option.textContent = String(item.props.title ?? ''); languageSelect.append(option)
    }
    const value = typeof dropdown.props.value === 'string' ? dropdown.props.value : ''
    if ([...languageSelect.options].some(option => option.value === value)) languageSelect.value = value
  }
  const render = (root: TrustedRaycastViewNode): void => {
    themeImages = []
    rows = []; rootActionOwner = undefined
    primaryFooter = undefined; primaryFooterLabel = undefined
    submitAction = undefined
    preferenceSetup = root.props.preferenceSetup === true
    element.setAttribute('data-view', preferenceSetup ? 'preference-setup' : current?.extensionId === 'can-i-use' ? 'can-i-use' : current?.extensionId === 'kaomoji-search' ? 'kaomoji' : 'translate')
    setHidden(hero, !preferenceSetup)
    setHidden(intro, !preferenceSetup)
    setHidden(commandFooter, false)
    footerActions.replaceChildren()
    const commandSearch = (descendants(root, 'raycast-list')[0] !== undefined || descendants(root, 'raycast-grid')[0] !== undefined) && 'searchEventId' in root.props
    setHidden(title, preferenceSetup || commandSearch)
    setHidden(titleIcon, preferenceSetup || commandSearch)
    setHidden(status, preferenceSetup)
    content.classList?.toggle('!overflow-hidden', preferenceSetup && current?.extensionId !== 'can-i-use')
    syncSourceSearch(root)
    renderDropdown(root)
    const depth = typeof root.props.navigationDepth === 'number' ? root.props.navigationDepth : 0
    setHidden(back, preferenceSetup || depth <= 0)
    const form = descendants(root, 'raycast-form')[0]
    const list = descendants(root, 'raycast-list')[0]
    const grid = descendants(root, 'raycast-grid')[0]
    const collection = list ?? grid
    if (current?.extensionId === 'can-i-use' && depth === 1 && typeof collection?.props.navigationTitle === 'string') title.textContent = collection.props.navigationTitle
    setHidden(searchRow, form !== undefined || !('searchEventId' in root.props))
    if (form !== undefined) { renderForm(form); return }
    setHidden(formArea, true)
    setHidden(results, false)
    setHidden(panelActions, false)
    if (collection === undefined) { results.replaceChildren(); return }
    input.placeholder = typeof collection.props.searchBarPlaceholder === 'string' ? collection.props.searchBarPlaceholder.slice(0, 256) : current?.extensionId === 'kaomoji-search' ? 'Search by name...' : (zh ? '输入要翻译的文本' : 'Enter text to translate')
    if (!preferenceSetup && preferenceAction !== undefined) status.textContent = ''
    const waiting = root.props.queryCurrent === false
    queryPending = waiting; syncBusy()
    const emptyProjection = descendants(root, 'raycast-empty')[0]
    const emptyTitle = waiting ? (current?.extensionId === 'can-i-use' || current?.extensionId === 'kaomoji-search' ? 'Searching…' : (zh ? '正在翻译…' : 'Translating…')) : String(emptyProjection?.props.title ?? '')
    const showingDetail = descendants(root, 'raycast-list').some(list => list.props.isShowingDetail === true)
    const gridMode = grid !== undefined
    results.className = gridMode ? 'grid grid-cols-5 content-start gap-3 overflow-y-auto p-3' : 'launcher-command-list'
    const items = waiting ? [] : descendants(root, gridMode ? 'raycast-grid-item' : 'raycast-list-item')
    const itemSections = new Map<TrustedRaycastViewNode, string>()
    for (const section of descendants(root, 'raycast-section')) for (const child of section.children) if (typeof child !== 'string') itemSections.set(child, String(section.props.title ?? ''))
    selected = Math.min(selected, Math.max(0, items.length - 1))
    const itemActions = new Set(items.flatMap(item => descendants(item, 'raycast-action')))
    const rootActions = descendants(root, 'raycast-action').filter(action => !itemActions.has(action))
    panelActions.replaceChildren(); setHidden(panelActions, true)
    const createActionOwner = (actions: TrustedRaycastViewNode[], item: HTMLElement): ActionOwner => {
      const buttons: HTMLButtonElement[] = []
      const menu = document.createElement('details'); menu.className = 'relative'
      const summary = document.createElement('summary'); summary.className = 'sr-only'; summary.textContent = zh ? '操作' : 'Actions'; menu.append(summary)
      const panel = document.createElement('div'); panel.className = 'launcher-command-menu fixed bottom-14 right-3 flex w-72 flex-col gap-1'
      const panelTitle = document.createElement('p'); panelTitle.className = 'm-0 px-3 py-1 text-xs font-medium text-[var(--dsw-alias-label-secondary,CanvasText)]'; panelTitle.textContent = identity().title; panel.append(panelTitle); menu.append(panel)
      const owner: ActionOwner = { item, actions, buttons, menu }
      for (const action of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'launcher-command-menu-item grid-cols-[minmax(0,1fr)_auto] text-sm'
        const actionTitle = String(action.props.title ?? '')
        button.textContent = actionTitle + (action.props.unavailable ? (zh ? '（不可用）' : ' (Unavailable)') : '')
        const shortcut = shortcutInfo(action.props.shortcut)
        if (shortcut) { const key = document.createElement('kbd'); key.className = 'ml-3 text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'; key.textContent = shortcut.display; key.setAttribute('aria-hidden', 'true'); button.setAttribute('aria-keyshortcuts', shortcut.aria); button.append(key) }
        button.disabled = !action.props.actionEventId || action.props.unavailable === true
        button.addEventListener('click', () => { menu.open = false; owner.item.focus(); invoke(action) }); buttons.push(button); panel.append(button)
      }
      item.append(menu); return owner
    }
    let lastSection: string | undefined
    items.forEach((node, index) => {
      const sectionTitle = itemSections.get(node)
      if (sectionTitle !== undefined && sectionTitle !== lastSection) {
        const heading = document.createElement('li'); heading.className = gridMode ? 'col-span-full flex items-center justify-between px-1 pt-1 text-xs font-semibold text-[var(--dsw-alias-label-secondary,CanvasText)]' : 'px-4 pb-1 pt-3 text-xs font-semibold text-[var(--dsw-alias-label-secondary,CanvasText)]'; heading.textContent = sectionTitle; heading.setAttribute('aria-hidden', 'true'); results.append(heading); lastSection = sectionTitle
      }
      const item = document.createElement('li'); item.className = gridMode ? 'launcher-command-row flex aspect-square min-w-0 flex-col items-center justify-center gap-2 p-2 text-center [overflow-wrap:anywhere]' : 'launcher-command-row !block [overflow-wrap:anywhere]'
      item.tabIndex = 0; item.setAttribute('data-selected', String(index === selected)); if (gridMode) item.setAttribute('aria-label', String(node.props.title ?? 'Kaomoji'))
      if (gridMode) {
        const image = document.createElement('img'); const dark = node.props.contentDark; const light = node.props.contentLight
        const admitted = themeImages.length < 64 && typeof dark === 'string' && typeof light === 'string' && isTrustedRaycastKaomojiSvg(dark, '#fff') && isTrustedRaycastKaomojiSvg(light, '#000')
        if (admitted) themeImages.push({ dark, image, light })
        image.setAttribute('src', admitted ? document.documentElement?.style?.colorScheme === 'light' ? light : dark : '')
        image.setAttribute('alt', ''); image.className = 'size-16 max-h-full max-w-full'; item.append(image)
      }
      const titleLine = document.createElement('div'); titleLine.className = gridMode ? 'flex min-w-0 max-w-full items-center justify-center' : 'flex min-w-0 items-center justify-between gap-3'
      const titleRow = document.createElement('p'); titleRow.className = 'm-0 min-w-0 flex-1 truncate'; titleRow.textContent = String(node.props.title ?? ''); titleLine.append(titleRow)
      try {
        const accessories: unknown = typeof node.props.accessories === 'string' && node.props.accessories.length <= 4096 ? JSON.parse(node.props.accessories) : []
        const accessory = Array.isArray(accessories) ? accessories[0] : undefined
        if (accessory && typeof accessory === 'object' && typeof accessory.text === 'string' && accessory.text.length <= 256) { const text = document.createElement('span'); text.className = 'shrink-0 truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'; text.textContent = accessory.text; if (typeof accessory.tooltip === 'string' && accessory.tooltip.length <= 512) text.title = accessory.tooltip; titleLine.append(text) }
        if (current?.extensionId === 'can-i-use' && Array.isArray(accessories)) {
          const support = accessories[1]
          const variants: Record<string, { label: string; shape: IconNode; color: string }> = {
            Supported: { label: 'Supported', shape: Check, color: 'light-dark(#15803d, #4ade80)' },
            'Not supported': { label: 'Not Supported', shape: CircleX, color: 'light-dark(#b91c1c, #f87171)' },
            'Partial support': { label: 'Partial Support', shape: Check, color: 'light-dark(#a16207, #facc15)' },
            'Support unknown': { label: 'Support Unknown', shape: CircleHelp, color: 'inherit' },
          }
          if (support && typeof support === 'object' && typeof support.tooltip === 'string' && Object.hasOwn(variants, support.tooltip)) {
            const variant = variants[support.tooltip]!
            const badge = document.createElement('span'); badge.className = 'inline-flex shrink-0'; badge.setAttribute('role', 'img'); badge.setAttribute('aria-label', variant.label); badge.title = variant.label
            badge.style.color = variant.color; badge.append(icon(variant.shape, 'size-4')); titleLine.append(badge)
          }
        }
      } catch { /* malformed accessories stay inert */ }
      item.append(titleLine)
      if (typeof node.props.subtitle === 'string' && node.props.subtitle.length > 0) { const subtitle = document.createElement('p'); subtitle.className = 'm-0 truncate text-xs'; subtitle.textContent = node.props.subtitle; item.append(subtitle) }
      const ownActions = descendants(node, 'raycast-action')
      const owner = createActionOwner(ownActions, item)
      let detail: HTMLElement | undefined
      if (showingDetail) {
        detail = document.createElement('pre'); detail.hidden = index !== selected; detail.className = 'm-0 whitespace-pre-wrap font-sans [overflow-wrap:anywhere]'; detail.setAttribute('aria-label', zh ? '全文' : 'Full Text')
        detail.textContent = descendants(node, 'raycast-detail').map(detail => String(detail.props.markdown ?? '')).join('\n'); item.append(detail)
      }
      item.addEventListener('focusin', () => { selected = index; syncPrimaryFooter(); for (const row of rows) { row.item.setAttribute('data-selected', String(row.item === item)); if (row.detail) row.detail.hidden = row.item !== item } })
      rows.push({ ...owner, detail }); results.append(item)
    })
    if (current?.extensionId === 'can-i-use' && !waiting && Number.isSafeInteger(root.props.matchCount) && Number.isSafeInteger(root.props.totalCount)) {
      countText = depth === 1 ? `Showing ${items.length} of ${root.props.totalCount} browsers.` : `Showing ${items.length} of ${root.props.matchCount} matches. Search covers all ${root.props.totalCount} features.`
      status.textContent = countText
    }
    if (current?.extensionId === 'kaomoji-search' && items.length === 64 && input.value === '') {
      status.textContent = 'Showing 64 results. Search all 1,822 kaomoji.'
    }
    if (items.length === 0) {
      const empty = document.createElement('li'); empty.className = 'launcher-command-empty'; empty.tabIndex = -1
      const emptyIcon = icon(emptyProjection?.props.icon === 'Hourglass' ? Hourglass : SearchX)
      const emptyText = document.createElement('p'); emptyText.className = 'm-0 text-sm font-medium'; emptyText.textContent = emptyTitle || (zh ? '无结果' : 'No Results'); empty.append(emptyIcon, emptyText); results.append(empty)
      if (rootActions.length > 0) rootActionOwner = createActionOwner(rootActions, empty)
    }
    primaryFooter = document.createElement('button'); primaryFooter.type = 'button'; primaryFooter.className = 'launcher-command-footer-action bg-[var(--dsw-alias-bg-layer-2,Canvas)]'
    primaryFooterLabel = document.createElement('span'); const enter = document.createElement('kbd'); enter.className = 'ml-2 text-xs font-normal text-[var(--dsw-alias-label-secondary,CanvasText)]'; enter.textContent = '↵'; primaryFooter.append(primaryFooterLabel, enter); syncPrimaryFooter(); primaryFooter.addEventListener('click', () => invoke(rows[selected]?.actions[0]))
    const commandActions = document.createElement('button'); commandActions.type = 'button'; commandActions.className = 'launcher-command-footer-action'; commandActions.textContent = zh ? '操作' : 'Actions'
    const shortcut = document.createElement('kbd'); shortcut.className = 'ml-2 text-xs font-normal text-[var(--dsw-alias-label-secondary,CanvasText)]'; shortcut.textContent = '⌘ K'; commandActions.append(shortcut)
    commandActions.disabled = rows[selected] === undefined && rootActionOwner === undefined
    if (rootActionOwner) rootActionOwner.item = commandActions
    commandActions.addEventListener('click', event => { event.stopPropagation(); const owner = rows[selected] ?? rootActionOwner; if (!owner) return; owner.menu.open = !owner.menu.open; if (owner.menu.open) owner.buttons.find(button => !button.disabled)?.focus(); else commandActions.focus() })
    footerActions.append(primaryFooter, commandActions)
    const preferencesEventId = root.props.preferencesEventId
    if (current?.extensionId === 'can-i-use' && typeof preferencesEventId === 'string') {
      const preferences = document.createElement('button'); preferences.type = 'button'; preferences.className = 'launcher-command-footer-action'; preferences.textContent = 'Preferences'
      preferences.addEventListener('click', () => invoke({ type: 'raycast-action', props: { title: 'Open Extension Preferences', actionEventId: preferencesEventId }, children: [] }))
      footerActions.append(preferences)
    }
  }
  const renderForm = (form: TrustedRaycastViewNode): void => {
    formArea.replaceChildren(); footerActions.replaceChildren()
    firstFormControl = undefined
    const spacing = current?.extensionId === 'can-i-use' ? 'gap-3 pt-3' : 'gap-[1.375rem] pt-5'
    formArea.className = preferenceSetup ? `ml-[1.6875rem] flex w-[33.0625rem] max-w-[calc(100%-2.6875rem)] flex-col ${spacing} px-0 pb-3` : 'flex w-full flex-col items-start gap-3 px-4 py-3'
    results.replaceChildren(); setHidden(results, true)
    setHidden(panelActions, true)
    setHidden(formArea, false)
    for (const child of form.children) {
      if (typeof child === 'string') continue
      if (child.type === 'raycast-form-dropdown') {
        const field = document.createElement('label'); field.className = 'launcher-command-field'
        const fieldTitle = String(child.props.title ?? '')
        const fieldLabel = document.createElement('span'); fieldLabel.className = 'text-right'; fieldLabel.textContent = fieldTitle
        const selectFrame = document.createElement('span'); selectFrame.className = 'relative block min-w-0'
        const select = document.createElement('select'); select.className = 'launcher-command-control appearance-none pr-8'
        select.setAttribute('aria-label', fieldTitle)
        firstFormControl ??= select
        for (const option of child.children) {
          if (typeof option === 'string') continue
          const node = document.createElement('option'); node.value = String(option.props.value ?? ''); node.textContent = String(option.props.title ?? ''); select.append(node)
        }
        const value = typeof child.props.value === 'string' ? child.props.value : ''
        if ([...select.options].some(option => option.value === value)) select.value = value
        select.addEventListener('change', () => {
          const eventId = child.props.fieldEventId
          if (typeof eventId === 'string') sendEvent({ kind: 'fieldChanged', eventId, value: select.value.slice(0, 128) })
        })
        const selectArrow = icon(ChevronDown, 'pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dsw-alias-label-secondary,CanvasText)]')
        selectFrame.append(select, selectArrow); field.append(fieldLabel, selectFrame); formArea.append(field)
      } else if (child.type === 'raycast-text-field') {
        const field = document.createElement('label'); field.className = 'launcher-command-field'
        const fieldTitle = String(child.props.title ?? '')
        const fieldLabel = document.createElement('span'); fieldLabel.className = 'text-right'; fieldLabel.textContent = fieldTitle
        const fieldInput = document.createElement('input'); fieldInput.type = 'text'; firstFormControl ??= fieldInput; fieldInput.className = 'launcher-command-control'
        fieldInput.setAttribute('aria-label', fieldTitle)
        fieldInput.value = String(child.props.value ?? '')
        const canIUse = current?.extensionId === 'can-i-use'
        if (canIUse) fieldInput.maxLength = 4096
        fieldInput.addEventListener(canIUse ? 'input' : 'change', () => {
          const eventId = child.props.fieldEventId
          if (typeof eventId === 'string') sendEvent({ kind: 'fieldChanged', eventId, value: canIUse ? fieldInput.value : fieldInput.value.slice(0, 128) })
        })
        field.append(fieldLabel, fieldInput); formArea.append(field)
      }
    }
    const actions = descendants(form, 'raycast-action')
    submitAction = actions.find(action => action.props.title === 'Add Language Set') ?? actions.find(action => Boolean(action.props.actionEventId))
    for (const action of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.className = preferenceSetup ? 'launcher-command-footer-action' : buttonClass
      button.textContent = String(action.props.title ?? '')
      button.disabled = !action.props.actionEventId
      if (preferenceSetup && action.props.title === 'Continue') {
        button.className += ' !gap-1 !px-2'
        const shortcuts = document.createElement('span'); shortcuts.className = 'flex gap-px'; shortcuts.setAttribute('aria-hidden', 'true')
        for (const glyph of ['⌘', '↵']) { const key = document.createElement('kbd'); key.className = 'box-border inline-flex size-5 items-center justify-center rounded-[0.25rem] border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--dsw-alias-bg-layer-3,Canvas)] text-sm font-normal leading-none text-[var(--dsw-alias-label-secondary,CanvasText)]'; key.textContent = glyph; shortcuts.append(key) }
        button.append(shortcuts)
      }
      button.addEventListener('click', () => invoke(action)); (preferenceSetup ? footerActions : formArea).append(button)
    }
  }
  element.addEventListener('keydown', event => {
    // Do not cancel native IME behavior; stop Escape before the owning launcher closes this view.
    if (event.isComposing || event.keyCode === 229) { event.stopPropagation(); return }
    const depth = typeof current?.root?.props.navigationDepth === 'number' ? current.root.props.navigationDepth : 0
    const row = rows[selected]
    const actionOwner = row ?? rootActionOwner
    if (event.key === 'Escape' && actionOwner?.menu.open) { event.preventDefault(); event.stopPropagation(); actionOwner.menu.open = false; actionOwner.item.focus(); return }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && actionOwner?.menu.open) {
      event.preventDefault(); const enabled = actionOwner.buttons.filter(button => !button.disabled); if (enabled.length === 0) return
      const currentButton = enabled.indexOf(document.activeElement as HTMLButtonElement); const offset = event.key === 'ArrowDown' ? 1 : enabled.length - 1; enabled[(Math.max(0, currentButton) + offset) % enabled.length]?.focus(); return
    }
    if (event.key === 'Escape' && depth > 0) { event.preventDefault(); event.stopPropagation(); popNavigation(); return }
    if (event.key === 'Escape' && current?.root && descendants(current.root, 'raycast-list').some(list => list.props.isShowingDetail === true)) {
      if (invoke(row?.actions.find(action => action.props.title === 'Toggle Full Text'))) { event.preventDefault(); event.stopPropagation() }
      return
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !event.metaKey && !event.ctrlKey && !event.altKey && rows.length) {
      event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length; syncPrimaryFooter(); rows[selected]!.item.focus(); return
    }
    if (preferenceSetup && event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) { event.preventDefault(); invoke(submitAction); return }
    if (event.key === 'Enter' && (event.target === input || event.target === row?.item) && !event.altKey && !event.shiftKey) { event.preventDefault(); invoke(row?.actions[event.metaKey || event.ctrlKey ? 1 : 0]); return }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && actionOwner) { event.preventDefault(); actionOwner.menu.open = !actionOwner.menu.open; if (actionOwner.menu.open) actionOwner.buttons.find(button => !button.disabled)?.focus(); else actionOwner.item.focus(); return }
    for (const action of actionOwner?.actions ?? []) {
      if (typeof action.props.shortcut !== 'string' || !action.props.actionEventId) continue
      let raw: { macOS?: { key?: unknown; modifiers?: unknown }; key?: unknown; modifiers?: unknown } | null
      try { raw = JSON.parse(action.props.shortcut) } catch { continue }
      const shortcut = raw?.macOS ?? raw
      if (typeof shortcut?.key !== 'string') continue
      const modifiers = Array.isArray(shortcut.modifiers) ? shortcut.modifiers : []
      if (event.key.toLowerCase() === shortcut.key.toLowerCase() && (event.metaKey || event.ctrlKey) === modifiers.includes('cmd') && event.altKey === modifiers.includes('opt') && event.shiftKey === modifiers.includes('shift')) {
        // Preserve native text Copy while the user is editing/selecting the query.
        if (event.target === input && shortcut.key === 'c') return
        event.preventDefault(); invoke(action); return
      }
    }
  })
  element.addEventListener('click', event => {
    for (const owner of [...rows, ...(rootActionOwner ? [rootActionOwner] : [])]) if (!owner.menu.contains(event.target as globalThis.Node)) owner.menu.open = false
  })
  const focus = (): void => { if (firstFormControl && !formArea.hidden) firstFormControl.focus({ focusVisible: false }); else if (!searchRow.hidden) input.focus(); else rows[selected]?.item.focus() }
  return {
    dispose() { current = undefined; themeImages = [] },
    element,
    focus,
    refreshTheme,
    update(message) {
      if (current && (message.extensionId !== current.extensionId || message.sessionId !== current.sessionId || message.generation !== current.generation)) return
      if (message.type === 'toast') {
        if (pending !== undefined || sending || !current?.root || descendants(current.root, 'raycast-list').some(list => list.props.searchText !== input.value)) return
        if (message.style === 'failure') fail(`${message.title}: ${message.message}`); else showToastText(message.message ? `${message.title}: ${message.message}` : String(message.title ?? '')); return }
      if (message.type === 'outcome') {
        if (actionPending !== message.eventId) return
        setActionPending()
        if (preferenceAction === message.eventId) { preferenceAction = undefined; actionFeedback = ''; status.textContent = ''; if (message.succeeded) setHidden(error, true); else fail(userActionMessage(message.message ?? 'Translate action failed')); return }
        if (message.succeeded) { setHidden(error, true); actionFeedback = zh ? '操作已完成' : 'Action Completed'; if (toastText === '') status.textContent = actionFeedback }
        else { actionFeedback = ''; status.textContent = ''; fail(userActionMessage(message.message ?? 'Translate action failed')) }
        if (current?.extensionId === 'can-i-use') status.textContent = countText
        return
      }
      if (current && message.revision <= current.revision) return
      const depthChanged = message.extensionId === 'can-i-use' && (current?.root?.props.navigationDepth ?? 0) !== (message.root?.props.navigationDepth ?? 0)
      if (message.extensionId === 'can-i-use') {
        setActionPending(); actionFeedback = ''
        if (depthChanged) {
          if (message.root?.props.navigationDepth === 1) { rootSelected = selected; selected = 0 }
          else selected = rootSelected
        }
      }
      const restoreRow = rows.some(row => row.item.contains?.(document.activeElement))
      const previousHadForm = current?.root ? descendants(current.root, 'raycast-form').length > 0 : false
      current = message
      syncIdentity()
      if (message.type === 'error') {
        themeImages = []
        pending = undefined; queryPending = false; setActionPending()
        input.disabled = true; languageSelect.disabled = true; status.textContent = ''; setHidden(status, true)
        results.replaceChildren(); setHidden(panelActions, true); footerActions.replaceChildren()
        error.className = 'launcher-command-error launcher-command-empty'
        fail(message.message ?? 'Translate runtime failed'); return
      }
      input.disabled = false; languageSelect.disabled = false
      status.textContent = toastText === '' ? actionFeedback : toastText
      results.replaceChildren()
      if (message.root) render(message.root)
      if (restoreRow || depthChanged) rows[selected]?.item.focus()
      sendLatest()
      const hasForm = Boolean(message.root && descendants(message.root, 'raycast-form').length > 0)
      if (message.type === 'ready' || previousHadForm !== hasForm) { focus(); document.defaultView?.requestAnimationFrame(() => focus()) }
    },
  }
}
