import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { TrustedRaycastViewEvent, TrustedRaycastViewMessage, TrustedRaycastViewNode } from './trusted-raycast-contract.ts'

/** First-party finite DOM projection. Source callbacks stay in the child; native effects stay in main. */
export function createTrustedRaycastView(document: Document, bridge: LauncherPreloadBridge, onClose: () => void, locale = 'en-US'): { element: HTMLElement; update(message: TrustedRaycastViewMessage): void } {
  const zh = locale.startsWith('zh')
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
  const element = document.createElement('section'); element.className = 'launcher-local-tool p-4 text-sm'; element.setAttribute('aria-label', 'Google Translate')
  const header = document.createElement('header'); header.className = 'launcher-local-tool-header'
  const title = document.createElement('h2'); title.textContent = 'Google Translate'; title.className = 'm-0 text-sm font-semibold'
  const close = document.createElement('button'); close.type = 'button'; close.className = 'launcher-secondary-button bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; close.textContent = zh ? '返回结果' : 'Back to Results'; close.addEventListener('click', onClose)
  header.append(title, close)
  const content = document.createElement('div'); content.className = 'launcher-local-tool-content min-w-0 overflow-auto'
  const back = document.createElement('button'); back.type = 'button'; back.className = 'launcher-secondary-button bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; back.textContent = zh ? '‹ 返回' : '‹ Back'; back.hidden = true; back.addEventListener('click', popNavigation)
  const searchRow = document.createElement('div'); searchRow.className = 'flex items-start gap-2'
  const label = document.createElement('label'); label.className = 'flex flex-col gap-2 text-xs'; label.textContent = zh ? '要翻译的文本' : 'Text to Translate'
  const input = document.createElement('input'); input.type = 'search'; input.id = 'trusted-raycast-search'; input.maxLength = 16384; input.autocomplete = 'off'; input.className = 'box-border w-full min-w-0 rounded-md border border-[var(--dsw-alias-border-l2,CanvasText)] bg-transparent px-3 py-2 text-sm text-[var(--dsw-alias-label-primary,CanvasText)] focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; label.append(input)
  const languageSelect = document.createElement('select'); languageSelect.className = 'box-border max-w-56 min-w-0 shrink rounded-md border border-[var(--dsw-alias-border-l2,CanvasText)] bg-transparent px-2 py-2 text-xs text-[var(--dsw-alias-label-primary,CanvasText)] focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; languageSelect.setAttribute('aria-label', zh ? '语言集' : 'Language Set'); languageSelect.hidden = true; languageSelect.addEventListener('change', () => {
    const dropdown = current?.root ? descendants(current.root, 'raycast-dropdown')[0] : undefined
    const eventId = dropdown?.props.fieldEventId
    if (typeof eventId === 'string') sendEvent({ kind: 'fieldChanged', eventId, value: languageSelect.value.slice(0, 128) })
  })
  searchRow.append(label, languageSelect)
  const status = document.createElement('p'); status.className = 'launcher-local-tool-status'; status.setAttribute('role', 'status')
  const panelActions = document.createElement('div'); panelActions.className = 'flex flex-wrap items-start gap-2 py-2'; panelActions.hidden = true
  const results = document.createElement('ul'); results.className = 'm-0 list-none p-0'; results.setAttribute('aria-label', zh ? '翻译结果' : 'Translations')
  const formArea = document.createElement('form'); formArea.className = 'flex flex-col items-start gap-3 py-2'; formArea.hidden = true; formArea.addEventListener('submit', event => { event.preventDefault(); invoke(submitAction) })
  const notice = document.createElement('p'); notice.className = 'launcher-local-tool-status'; notice.textContent = zh ? '手动输入始终可用 · 语言集、粘贴与语音由主进程按策略执行 · 选中文本需 macOS 辅助功能权限。' : 'Manual input is always available · Language sets, Paste and speech run under main-owned policy · Selected text needs macOS Accessibility permission.'
  const error = document.createElement('p'); error.className = 'launcher-local-tool-error'; error.setAttribute('role', 'alert'); error.hidden = true
  content.append(back, searchRow, status, panelActions, results, formArea, notice, error); element.append(header, content)
  let actionPending: string | undefined
  let actionFeedback = ''
  let selected = 0
  let composing = false
  let submitAction: TrustedRaycastViewNode | undefined
  let rows: { item: HTMLElement; actions: TrustedRaycastViewNode[]; menu: HTMLDetailsElement; detail: HTMLElement | undefined }[] = []
  const descendants = (node: TrustedRaycastViewNode, type: string): TrustedRaycastViewNode[] => [ ...(node.type === type ? [node] : []), ...node.children.flatMap(child => typeof child === 'string' ? [] : descendants(child, type)) ]
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
    actionPending = eventId
    actionFeedback = zh ? '正在执行操作…' : 'Running Action…'
    status.textContent = actionFeedback
    void bridge.trustedRaycastEvent({ sessionId: current.sessionId, generation: current.generation, revision: current.revision, eventId, kind: 'action' }).catch(error => {
      if (actionPending === eventId) { actionPending = undefined; actionFeedback = ''; status.textContent = ''; fail(userActionMessage(error instanceof Error ? error.message : 'Translate action failed')) }
    })
    return true
  }
  // Internal lifecycle rejections (stale/busy/inactive) are runtime bookkeeping, not user-facing service text.
  const userActionMessage = (message: string): string => /stale|busy|inactive/i.test(message) ? (zh ? '此操作已失效，请重试。' : 'That action is no longer available. Please try again.') : message
  const fail = (message: string): void => { error.hidden = false; error.textContent = message }
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
      if (current?.type !== 'error') error.hidden = true
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
    actionPending = undefined
    actionFeedback = ''
    error.hidden = true
    status.textContent = zh ? '正在翻译…' : 'Translating…'
    sendLatest()
  })
  input.addEventListener('compositionstart', () => { composing = true })
  input.addEventListener('compositionend', () => { composing = false })
  const buttonClass = 'launcher-secondary-button bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)] disabled:opacity-50'
  const syncSourceSearch = (root: TrustedRaycastViewNode): void => {
    const list = descendants(root, 'raycast-list')[0]
    if (list === undefined || typeof list.props.searchText !== 'string' || composing || pending !== undefined || sending) return
    if (list.props.searchText !== input.value && (document.activeElement !== input || input.value === '')) input.value = list.props.searchText
  }
  const renderDropdown = (root: TrustedRaycastViewNode): void => {
    const dropdown = descendants(root, 'raycast-dropdown')[0]
    languageSelect.hidden = dropdown === undefined
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
    rows = []
    submitAction = undefined
    syncSourceSearch(root)
    renderDropdown(root)
    const depth = typeof root.props.navigationDepth === 'number' ? root.props.navigationDepth : 0
    back.hidden = depth <= 0
    const form = descendants(root, 'raycast-form')[0]
    const list = descendants(root, 'raycast-list')[0]
    searchRow.hidden = form !== undefined || !('searchEventId' in root.props)
    if (form !== undefined) { renderForm(form); return }
    formArea.hidden = true
    results.hidden = false
    panelActions.hidden = false
    if (list === undefined) { results.replaceChildren(); return }
    if (root.props.queryCurrent === false) { status.textContent = zh ? '正在翻译…' : 'Translating…'; return }
    for (const empty of descendants(root, 'raycast-empty')) status.textContent = String(empty.props.title ?? '')
    const showingDetail = descendants(root, 'raycast-list').some(list => list.props.isShowingDetail === true)
    const items = descendants(root, 'raycast-list-item')
    selected = Math.min(selected, Math.max(0, items.length - 1))
    const itemActions = new Set(items.flatMap(item => descendants(item, 'raycast-action')))
    panelActions.replaceChildren()
    for (const action of descendants(root, 'raycast-action')) {
      if (itemActions.has(action)) continue
      const button = document.createElement('button'); button.type = 'button'; button.className = buttonClass
      button.textContent = String(action.props.title ?? '') + (action.props.unavailable ? (zh ? '（不可用）' : ' (Unavailable)') : '')
      button.disabled = !action.props.actionEventId || action.props.unavailable === true
      button.addEventListener('click', () => invoke(action)); panelActions.append(button)
    }
    panelActions.hidden = panelActions.children.length === 0
    items.forEach((node, index) => {
      const item = document.createElement('li'); item.className = 'px-3 py-2 rounded-md focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)] [overflow-wrap:anywhere]'
      item.tabIndex = 0
      const titleRow = document.createElement('p'); titleRow.className = 'm-0 truncate'
      titleRow.textContent = (node.props.selected === true ? '✓ ' : '') + String(node.props.title ?? ''); item.append(titleRow)
      if (typeof node.props.subtitle === 'string' && node.props.subtitle.length > 0) { const subtitle = document.createElement('p'); subtitle.className = 'm-0 truncate text-xs'; subtitle.textContent = node.props.subtitle; item.append(subtitle) }
      const actions = descendants(node, 'raycast-action')
      const controls = document.createElement('div'); controls.className = 'flex flex-wrap items-start gap-2 py-2'
      const primary = document.createElement('button'); primary.type = 'button'; primary.className = buttonClass; primary.textContent = String(actions[0]?.props.title ?? ''); primary.disabled = !actions[0]?.props.actionEventId; primary.addEventListener('click', () => invoke(actions[0]))
      const menu = document.createElement('details'); menu.className = 'relative'
      const summary = document.createElement('summary'); summary.className = 'cursor-pointer text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; summary.textContent = zh ? '操作' : 'Actions'; menu.append(summary)
      const panel = document.createElement('div'); panel.className = 'flex flex-col items-start gap-1 py-2'; menu.append(panel)
      for (const action of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.className = buttonClass
        button.textContent = String(action.props.title ?? '') + (action.props.unavailable ? (zh ? '（不可用）' : ' (Unavailable)') : '')
        button.disabled = !action.props.actionEventId || action.props.unavailable === true
        button.addEventListener('click', () => { menu.open = false; summary.focus(); invoke(action) }); panel.append(button)
      }
      controls.append(primary, menu); item.append(controls)
      let detail: HTMLElement | undefined
      if (showingDetail) {
        detail = document.createElement('pre'); detail.hidden = index !== selected; detail.className = 'm-0 whitespace-pre-wrap font-sans [overflow-wrap:anywhere]'; detail.setAttribute('aria-label', zh ? '全文' : 'Full Text')
        detail.textContent = descendants(node, 'raycast-detail').map(detail => String(detail.props.markdown ?? '')).join('\n'); item.append(detail)
      }
      item.addEventListener('focusin', () => { selected = index; for (const row of rows) if (row.detail) row.detail.hidden = row.item !== item })
      rows.push({ item, actions, menu, detail }); results.append(item)
    })
  }
  const renderForm = (form: TrustedRaycastViewNode): void => {
    formArea.replaceChildren()
    results.replaceChildren(); results.hidden = true
    panelActions.hidden = true
    formArea.hidden = false
    for (const child of form.children) {
      if (typeof child === 'string') continue
      if (child.type === 'raycast-form-dropdown') {
        const field = document.createElement('label'); field.className = 'flex flex-col gap-2 text-xs'; field.textContent = String(child.props.title ?? '')
        const select = document.createElement('select'); select.className = 'box-border w-full min-w-0 rounded-md border border-[var(--dsw-alias-border-l2,CanvasText)] bg-transparent px-3 py-2 text-sm text-[var(--dsw-alias-label-primary,CanvasText)] focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'
        select.setAttribute('aria-label', String(child.props.title ?? ''))
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
        field.append(select); formArea.append(field)
      } else if (child.type === 'raycast-text-field') {
        const field = document.createElement('label'); field.className = 'flex flex-col gap-2 text-xs'; field.textContent = String(child.props.title ?? '')
        const fieldInput = document.createElement('input'); fieldInput.type = 'text'; fieldInput.className = 'box-border w-full min-w-0 rounded-md border border-[var(--dsw-alias-border-l2,CanvasText)] bg-transparent px-3 py-2 text-sm text-[var(--dsw-alias-label-primary,CanvasText)] focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'
        fieldInput.value = String(child.props.value ?? '')
        fieldInput.addEventListener('change', () => {
          const eventId = child.props.fieldEventId
          if (typeof eventId === 'string') sendEvent({ kind: 'fieldChanged', eventId, value: fieldInput.value.slice(0, 128) })
        })
        field.append(fieldInput); formArea.append(field)
      }
    }
    const actions = descendants(form, 'raycast-action')
    submitAction = actions.find(action => action.props.title === 'Add Language Set') ?? actions.find(action => Boolean(action.props.actionEventId))
    for (const action of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.className = buttonClass
      button.textContent = String(action.props.title ?? '')
      button.disabled = !action.props.actionEventId
      button.addEventListener('click', () => invoke(action)); formArea.append(button)
    }
  }
  element.addEventListener('keydown', event => {
    // Do not cancel native IME behavior; stop Escape before the owning launcher closes this view.
    if (event.isComposing || event.keyCode === 229) { event.stopPropagation(); return }
    const depth = typeof current?.root?.props.navigationDepth === 'number' ? current.root.props.navigationDepth : 0
    const row = rows[selected]
    if (event.key === 'Escape' && row?.menu.open) { event.preventDefault(); event.stopPropagation(); row.menu.open = false; row.menu.querySelector('summary')?.focus(); return }
    if (event.key === 'Escape' && depth > 0) { event.preventDefault(); event.stopPropagation(); popNavigation(); return }
    if (event.key === 'Escape' && current?.root && descendants(current.root, 'raycast-list').some(list => list.props.isShowingDetail === true)) {
      if (invoke(row?.actions.find(action => action.props.title === 'Toggle Full Text'))) { event.preventDefault(); event.stopPropagation() }
      return
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !event.metaKey && !event.ctrlKey && !event.altKey && rows.length) {
      event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length; rows[selected]!.item.focus(); return
    }
    if (event.key === 'Enter' && (event.target === input || event.target === row?.item) && !event.altKey && !event.shiftKey) { event.preventDefault(); invoke(row?.actions[event.metaKey || event.ctrlKey ? 1 : 0]); return }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && row) { event.preventDefault(); row.menu.open = !row.menu.open; row.menu.querySelector('summary')?.focus(); return }
    for (const action of row?.actions ?? []) {
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
    for (const row of rows) if (!row.menu.contains(event.target as globalThis.Node)) row.menu.open = false
  })
  return {
    element,
    update(message) {
      if (current && (message.sessionId !== current.sessionId || message.generation !== current.generation)) return
      if (message.type === 'toast') {
        if (pending !== undefined || sending || !current?.root || descendants(current.root, 'raycast-list').some(list => list.props.searchText !== input.value)) return
        if (message.style === 'failure') fail(`${message.title}: ${message.message}`); else showToastText(message.message ? `${message.title}: ${message.message}` : String(message.title ?? '')); return }
      if (message.type === 'outcome') {
        if (actionPending !== message.eventId) return
        actionPending = undefined
        if (message.succeeded) { error.hidden = true; actionFeedback = zh ? '操作已完成' : 'Action Completed'; if (toastText === '') status.textContent = actionFeedback }
        else { actionFeedback = ''; status.textContent = ''; fail(userActionMessage(message.message ?? 'Translate action failed')) }
        return
      }
      if (current && message.revision <= current.revision) return
      const restoreRow = rows.some(row => row.item.contains?.(document.activeElement))
      current = message
      if (message.type === 'error') { pending = undefined; input.disabled = true; fail(message.message ?? 'Translate runtime failed'); return }
      input.disabled = false
      status.textContent = toastText === '' ? actionFeedback : toastText
      results.replaceChildren()
      if (message.root) render(message.root)
      if (restoreRow) rows[selected]?.item.focus()
      sendLatest()
      if (message.type === 'ready') queueMicrotask(() => { if (!searchRow.hidden) input.focus() })
    },
  }
}
