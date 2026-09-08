import { ChevronLeft, Hourglass, SearchX, type IconNode } from 'lucide'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { TrustedRaycastViewEvent, TrustedRaycastViewMessage, TrustedRaycastViewNode } from './trusted-raycast-contract.ts'

/** First-party finite DOM projection. Source callbacks stay in the child; native effects stay in main. */
export function createTrustedRaycastView(document: Document, bridge: LauncherPreloadBridge, onClose: () => void, locale = 'en-US'): { element: HTMLElement; focus(): void; update(message: TrustedRaycastViewMessage): void } {
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
  const sendEvent = (event: { kind: TrustedRaycastViewEvent['kind']; eventId: string; value?: string }): void => {
    if (!current?.root || current.type === 'error') return
    // Field and navigation events are superseded by the next projection; stale rejections stay silent.
    void bridge.trustedRaycastEvent({ sessionId: current.sessionId, generation: current.generation, revision: current.revision, ...event } as TrustedRaycastViewEvent).catch(() => undefined)
  }
  const popNavigation = (): void => {
    const depth = typeof current?.root?.props.navigationDepth === 'number' ? current.root.props.navigationDepth : 0
    if (depth <= 0) return
    sendEvent({ kind: 'navigation', eventId: 'language-nav', value: 'language:pop' })
  }
  const element = document.createElement('section'); element.className = 'launcher-local-tool !gap-0 overflow-hidden text-sm'; element.setAttribute('aria-label', 'Google Translate'); element.setAttribute('aria-busy', 'false'); element.setAttribute('data-view', 'translate')
  const header = document.createElement('header'); header.className = 'launcher-command-header'
  const close = document.createElement('button'); close.type = 'button'; close.className = 'launcher-command-footer-action !size-8 !min-h-8 !px-0'; close.append(icon(ChevronLeft, 'size-5')); close.setAttribute('aria-label', zh ? '返回结果' : 'Back to Results'); close.addEventListener('click', onClose)
  const titleIcon = document.createElement('img'); titleIcon.setAttribute('src', './trusted-raycast/google-translate.png'); titleIcon.setAttribute('alt', ''); titleIcon.className = 'size-6 rounded-md'
  const title = document.createElement('h2'); title.textContent = 'Google Translate'; title.className = 'm-0 text-sm font-semibold'
  header.append(close, titleIcon, title)
  const hero = document.createElement('div'); hero.className = 'flex flex-col items-center px-6 pb-2 text-center'; hero.hidden = true
  const logoFrame = document.createElement('div'); logoFrame.className = 'mb-3 flex size-16 items-center justify-center rounded-full border border-[var(--dsw-alias-border-l1,CanvasText)] bg-[var(--dsw-alias-bg-layer-2,Canvas)] shadow-sm'
  const logo = document.createElement('img'); logo.setAttribute('src', './trusted-raycast/google-translate.png'); logo.setAttribute('alt', 'Google Translate'); logo.className = 'size-10'; logoFrame.append(logo)
  const heroTitle = document.createElement('h1'); heroTitle.textContent = 'Google Translate'; heroTitle.className = 'm-0 text-2xl font-semibold tracking-[-0.02em] text-[var(--dsw-alias-label-primary,CanvasText)]'
  const about = document.createElement('details'); about.className = 'relative mt-2'
  const aboutSummary = document.createElement('summary'); aboutSummary.className = 'cursor-pointer list-none rounded-lg bg-[var(--dsw-alias-bg-layer-2,Canvas)] px-3 py-1.5 text-sm font-medium text-[var(--dsw-alias-label-primary,CanvasText)] focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; aboutSummary.textContent = zh ? '关于此扩展 ⓘ' : 'About This Extension ⓘ'
  const aboutText = document.createElement('p'); aboutText.className = 'absolute left-1/2 z-10 mt-2 w-72 -translate-x-1/2 rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--dsw-alias-bg-overlay,Canvas)] p-3 text-left text-xs leading-5 text-[var(--dsw-alias-label-secondary,CanvasText)] shadow-lg'; aboutText.textContent = zh ? '由 TockTeam 固定并审核的 Google Translate 扩展。' : 'Google Translate is bundled from the exact extension archive reviewed by TockTeam.'
  about.append(aboutSummary, aboutText); hero.append(logoFrame, heroTitle, about)
  const content = document.createElement('div'); content.className = 'launcher-command-content !gap-0 !p-0'
  const intro = document.createElement('p'); intro.className = 'mx-auto mb-2 max-w-3xl px-4 text-center text-sm font-medium text-[var(--dsw-alias-label-secondary,CanvasText)]'; intro.textContent = zh ? '开始使用此扩展前，请设置以下偏好：' : 'Before you can start using this extension you have to set the following preferences:'; intro.hidden = true
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
  const results = document.createElement('ul'); results.className = 'launcher-command-list'; results.setAttribute('aria-label', zh ? '翻译结果' : 'Translations')
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
    void bridge.trustedRaycastEvent({ sessionId: current.sessionId, generation: current.generation, revision: current.revision, eventId, kind: 'action' }).catch(error => {
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
    void bridge.trustedRaycastEvent({ sessionId: current.sessionId, generation: current.generation, revision, eventId: String(current.root.props.searchEventId), kind: 'searchChanged', value }).then(() => {
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
    status.textContent = zh ? '正在翻译…' : 'Translating…'
    queryPending = true; syncBusy()
    sendLatest()
  })
  input.addEventListener('compositionstart', () => { composing = true })
  input.addEventListener('compositionend', () => { composing = false })
  const buttonClass = 'launcher-command-footer-action bg-[var(--dsw-alias-bg-layer-2,Canvas)] disabled:opacity-50'
  const shortcutText = (value: unknown): string => {
    if (typeof value !== 'string') return ''
    try {
      const parsed = JSON.parse(value) as { macOS?: { key?: unknown; modifiers?: unknown }; key?: unknown; modifiers?: unknown }
      const shortcut = parsed.macOS ?? parsed
      if (typeof shortcut.key !== 'string') return ''
      const glyphs: Record<string, string> = { cmd: '⌘', ctrl: '⌃', opt: '⌥', shift: '⇧' }
      const modifiers = Array.isArray(shortcut.modifiers) ? shortcut.modifiers.filter((item): item is string => typeof item === 'string').map(item => glyphs[item] ?? item) : []
      const key = shortcut.key === 'enter' ? '↵' : shortcut.key.toLocaleUpperCase('en-US')
      return [...modifiers, key].join(' ')
    } catch { return '' }
  }
  const syncSourceSearch = (root: TrustedRaycastViewNode): void => {
    const list = descendants(root, 'raycast-list')[0]
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
    rows = []; rootActionOwner = undefined
    primaryFooter = undefined; primaryFooterLabel = undefined
    submitAction = undefined
    preferenceSetup = root.props.preferenceSetup === true
    element.setAttribute('data-view', preferenceSetup ? 'preference-setup' : 'translate')
    setHidden(hero, !preferenceSetup)
    setHidden(intro, !preferenceSetup)
    setHidden(commandFooter, false)
    footerActions.replaceChildren()
    const commandSearch = descendants(root, 'raycast-list')[0] !== undefined && 'searchEventId' in root.props
    setHidden(title, preferenceSetup || commandSearch)
    setHidden(titleIcon, preferenceSetup || commandSearch)
    setHidden(status, preferenceSetup)
    content.classList?.toggle('!overflow-hidden', preferenceSetup)
    syncSourceSearch(root)
    renderDropdown(root)
    const depth = typeof root.props.navigationDepth === 'number' ? root.props.navigationDepth : 0
    setHidden(back, preferenceSetup || depth <= 0)
    const form = descendants(root, 'raycast-form')[0]
    const list = descendants(root, 'raycast-list')[0]
    setHidden(searchRow, form !== undefined || !('searchEventId' in root.props))
    if (form !== undefined) { renderForm(form); return }
    setHidden(formArea, true)
    setHidden(results, false)
    setHidden(panelActions, false)
    if (list === undefined) { results.replaceChildren(); return }
    input.placeholder = typeof list.props.searchBarPlaceholder === 'string' ? list.props.searchBarPlaceholder.slice(0, 256) : (zh ? '输入要翻译的文本' : 'Enter text to translate')
    if (!preferenceSetup && preferenceAction !== undefined) status.textContent = ''
    const waiting = root.props.queryCurrent === false
    queryPending = waiting; syncBusy()
    const emptyProjection = descendants(root, 'raycast-empty')[0]
    const emptyTitle = waiting ? (zh ? '正在翻译…' : 'Translating…') : String(emptyProjection?.props.title ?? '')
    const showingDetail = descendants(root, 'raycast-list').some(list => list.props.isShowingDetail === true)
    const items = waiting ? [] : descendants(root, 'raycast-list-item')
    selected = Math.min(selected, Math.max(0, items.length - 1))
    const itemActions = new Set(items.flatMap(item => descendants(item, 'raycast-action')))
    const rootActions = descendants(root, 'raycast-action').filter(action => !itemActions.has(action))
    panelActions.replaceChildren(); setHidden(panelActions, true)
    const createActionOwner = (actions: TrustedRaycastViewNode[], item: HTMLElement): ActionOwner => {
      const buttons: HTMLButtonElement[] = []
      const menu = document.createElement('details'); menu.className = 'relative'
      const summary = document.createElement('summary'); summary.className = 'sr-only'; summary.textContent = zh ? '操作' : 'Actions'; menu.append(summary)
      const panel = document.createElement('div'); panel.className = 'launcher-command-menu fixed bottom-14 right-3 flex w-72 flex-col gap-1'
      const panelTitle = document.createElement('p'); panelTitle.className = 'm-0 px-3 py-1 text-xs font-medium text-[var(--dsw-alias-label-secondary,CanvasText)]'; panelTitle.textContent = 'Google Translate'; panel.append(panelTitle); menu.append(panel)
      const owner: ActionOwner = { item, actions, buttons, menu }
      for (const action of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'launcher-command-menu-item grid-cols-[minmax(0,1fr)_auto] text-sm'
        const actionTitle = String(action.props.title ?? '')
        button.textContent = actionTitle + (action.props.unavailable ? (zh ? '（不可用）' : ' (Unavailable)') : '')
        const shortcut = shortcutText(action.props.shortcut)
        if (shortcut) { const key = document.createElement('kbd'); key.className = 'ml-3 text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'; key.textContent = shortcut; key.setAttribute('aria-hidden', 'true'); button.append(key) }
        button.disabled = !action.props.actionEventId || action.props.unavailable === true
        button.addEventListener('click', () => { menu.open = false; owner.item.focus(); invoke(action) }); buttons.push(button); panel.append(button)
      }
      item.append(menu); return owner
    }
    items.forEach((node, index) => {
      const item = document.createElement('li'); item.className = 'launcher-command-row !block [overflow-wrap:anywhere]'
      item.tabIndex = 0; item.setAttribute('data-selected', String(index === selected))
      const titleLine = document.createElement('div'); titleLine.className = 'flex min-w-0 items-center justify-between gap-3'
      const titleRow = document.createElement('p'); titleRow.className = 'm-0 min-w-0 flex-1 truncate'; titleRow.textContent = String(node.props.title ?? ''); titleLine.append(titleRow)
      try {
        const accessories: unknown = typeof node.props.accessories === 'string' && node.props.accessories.length <= 4096 ? JSON.parse(node.props.accessories) : []
        const accessory = Array.isArray(accessories) ? accessories[0] : undefined
        if (accessory && typeof accessory === 'object' && typeof accessory.text === 'string' && accessory.text.length <= 256) { const text = document.createElement('span'); text.className = 'shrink-0 truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'; text.textContent = accessory.text; if (typeof accessory.tooltip === 'string' && accessory.tooltip.length <= 512) text.title = accessory.tooltip; titleLine.append(text) }
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
  }
  const renderForm = (form: TrustedRaycastViewNode): void => {
    formArea.replaceChildren(); footerActions.replaceChildren()
    firstFormControl = undefined
    formArea.className = preferenceSetup ? 'mx-auto flex w-full max-w-[34rem] flex-col gap-3 px-4 pb-3' : 'flex w-full flex-col items-start gap-3 px-4 py-3'
    results.replaceChildren(); setHidden(results, true)
    setHidden(panelActions, true)
    setHidden(formArea, false)
    for (const child of form.children) {
      if (typeof child === 'string') continue
      if (child.type === 'raycast-form-dropdown') {
        const field = document.createElement('label'); field.className = 'launcher-command-field'
        const fieldTitle = String(child.props.title ?? '')
        const fieldLabel = document.createElement('span'); fieldLabel.className = 'text-right'; fieldLabel.textContent = fieldTitle
        const select = document.createElement('select'); select.className = 'launcher-command-control'
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
        field.append(fieldLabel, select); formArea.append(field)
      } else if (child.type === 'raycast-text-field') {
        const field = document.createElement('label'); field.className = 'launcher-command-field'
        const fieldTitle = String(child.props.title ?? '')
        const fieldLabel = document.createElement('span'); fieldLabel.className = 'text-right'; fieldLabel.textContent = fieldTitle
        const fieldInput = document.createElement('input'); fieldInput.type = 'text'; firstFormControl ??= fieldInput; fieldInput.className = 'launcher-command-control'
        fieldInput.setAttribute('aria-label', fieldTitle)
        fieldInput.value = String(child.props.value ?? '')
        fieldInput.addEventListener('change', () => {
          const eventId = child.props.fieldEventId
          if (typeof eventId === 'string') sendEvent({ kind: 'fieldChanged', eventId, value: fieldInput.value.slice(0, 128) })
        })
        field.append(fieldLabel, fieldInput); formArea.append(field)
      }
    }
    const actions = descendants(form, 'raycast-action')
    submitAction = actions.find(action => action.props.title === 'Add Language Set') ?? actions.find(action => Boolean(action.props.actionEventId))
    for (const action of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.className = preferenceSetup ? 'launcher-command-footer-action bg-[var(--dsw-alias-bg-layer-2,Canvas)]' : buttonClass
      button.textContent = String(action.props.title ?? '')
      button.disabled = !action.props.actionEventId
      if (preferenceSetup && action.props.title === 'Continue') { const shortcut = document.createElement('kbd'); shortcut.className = 'ml-2 text-xs font-normal text-[var(--dsw-alias-label-secondary,CanvasText)]'; shortcut.textContent = '⌘ ↵'; button.append(shortcut) }
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
  const focus = (): void => { if (preferenceSetup) firstFormControl?.focus(); else if (!searchRow.hidden) input.focus() }
  return {
    element,
    focus,
    update(message) {
      if (current && (message.sessionId !== current.sessionId || message.generation !== current.generation)) return
      if (message.type === 'toast') {
        if (pending !== undefined || sending || !current?.root || descendants(current.root, 'raycast-list').some(list => list.props.searchText !== input.value)) return
        if (message.style === 'failure') fail(`${message.title}: ${message.message}`); else showToastText(message.message ? `${message.title}: ${message.message}` : String(message.title ?? '')); return }
      if (message.type === 'outcome') {
        if (actionPending !== message.eventId) return
        setActionPending()
        if (preferenceAction === message.eventId) { preferenceAction = undefined; actionFeedback = ''; status.textContent = ''; if (message.succeeded) setHidden(error, true); else fail(userActionMessage(message.message ?? 'Translate action failed')); return }
        if (message.succeeded) { setHidden(error, true); actionFeedback = zh ? '操作已完成' : 'Action Completed'; if (toastText === '') status.textContent = actionFeedback }
        else { actionFeedback = ''; status.textContent = ''; fail(userActionMessage(message.message ?? 'Translate action failed')) }
        return
      }
      if (current && message.revision <= current.revision) return
      const restoreRow = rows.some(row => row.item.contains?.(document.activeElement))
      current = message
      if (message.type === 'error') {
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
      if (restoreRow) rows[selected]?.item.focus()
      sendLatest()
      if (message.type === 'ready') { focus(); document.defaultView?.requestAnimationFrame(() => focus()) }
    },
  }
}
