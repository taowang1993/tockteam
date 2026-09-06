import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { TrustedRaycastViewMessage, TrustedRaycastViewNode } from './trusted-raycast-contract.ts'

/** First-party finite DOM projection. Source callbacks stay in the child; native effects stay in main. */
export function createTrustedRaycastView(document: Document, bridge: LauncherPreloadBridge, onClose: () => void, locale = 'en-US'): { element: HTMLElement; update(message: TrustedRaycastViewMessage): void } {
  const zh = locale.startsWith('zh')
  const element = document.createElement('section'); element.className = 'launcher-local-tool p-4 text-sm'; element.setAttribute('aria-label', 'Google Translate')
  const header = document.createElement('header'); header.className = 'launcher-local-tool-header'
  const title = document.createElement('h2'); title.textContent = 'Google Translate'; title.className = 'm-0 text-sm font-semibold'
  const close = document.createElement('button'); close.type = 'button'; close.className = 'launcher-secondary-button bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; close.textContent = zh ? '返回结果' : 'Back to Results'; close.addEventListener('click', onClose)
  header.append(title, close)
  const content = document.createElement('div'); content.className = 'launcher-local-tool-content min-w-0 overflow-auto'
  const label = document.createElement('label'); label.className = 'flex flex-col gap-2 text-xs'; label.textContent = zh ? '要翻译的文本' : 'Text to Translate'
  const input = document.createElement('input'); input.type = 'search'; input.id = 'trusted-raycast-search'; input.maxLength = 16384; input.autocomplete = 'off'; input.className = 'box-border w-full min-w-0 rounded-md border border-[var(--dsw-alias-border-l2,CanvasText)] bg-transparent px-3 py-2 text-sm text-[var(--dsw-alias-label-primary,CanvasText)] focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; label.append(input)
  const status = document.createElement('p'); status.className = 'launcher-local-tool-status'; status.setAttribute('role', 'status')
  const results = document.createElement('ul'); results.className = 'm-0 list-none p-0'; results.setAttribute('aria-label', zh ? '翻译结果' : 'Translations')
  const notice = document.createElement('p'); notice.className = 'launcher-local-tool-status'; notice.textContent = zh ? '手动输入 · 自动检测 → 简体中文 / 英语。粘贴、语言管理和语音暂不可用。' : 'Manual input · Auto → Simplified Chinese / English. Paste, language management and speech are not available in this slice.'
  const error = document.createElement('p'); error.className = 'launcher-local-tool-error'; error.setAttribute('role', 'alert'); error.hidden = true
  content.append(label, status, results, notice, error); element.append(header, content)
  let current: TrustedRaycastViewMessage | undefined
  let actionPending: string | undefined
  let actionFeedback = ''
  let selected = 0
  let rows: { item: HTMLElement; actions: TrustedRaycastViewNode[]; menu: HTMLDetailsElement; detail: HTMLElement | undefined }[] = []
  const descendants = (node: TrustedRaycastViewNode, type: string): TrustedRaycastViewNode[] => [ ...(node.type === type ? [node] : []), ...node.children.flatMap(child => typeof child === 'string' ? [] : descendants(child, type)) ]
  const invoke = (action: TrustedRaycastViewNode | undefined): boolean => {
    if (!action || !current?.root || current.type === 'error' || pending !== undefined || sending || actionPending) return false
    if (!action.props.actionEventId || action.props.unavailable) { fail(zh ? '此操作暂不可用。' : 'This action is not available in this slice.'); return false }
    const eventId = String(action.props.actionEventId)
    actionPending = eventId
    actionFeedback = zh ? '正在执行操作…' : 'Running Action…'
    status.textContent = actionFeedback
    void bridge.trustedRaycastEvent({ sessionId: current.sessionId, generation: current.generation, revision: current.revision, eventId, kind: 'action' }).catch(error => {
      if (actionPending === eventId) { actionPending = undefined; actionFeedback = ''; status.textContent = ''; fail(error instanceof Error ? error.message : 'Translate action failed') }
    })
    return true
  }
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
    pending = input.value
    actionPending = undefined
    actionFeedback = ''
    error.hidden = true
    status.textContent = zh ? '正在翻译…' : 'Translating…'
    sendLatest()
  })
  const buttonClass = 'launcher-secondary-button bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)] disabled:opacity-50'
  const render = (root: TrustedRaycastViewNode): void => {
    rows = []
    if (root.props.queryCurrent === false) { status.textContent = zh ? '正在翻译…' : 'Translating…'; return }
    for (const empty of descendants(root, 'raycast-empty')) status.textContent = String(empty.props.title ?? '')
    const showingDetail = descendants(root, 'raycast-list').some(list => list.props.isShowingDetail === true)
    const nodes = descendants(root, 'raycast-list-item')
    selected = Math.min(selected, Math.max(0, nodes.length - 1))
    nodes.forEach((node, index) => {
      const item = document.createElement('li'); item.className = 'px-3 py-2 rounded-md focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)] [overflow-wrap:anywhere]'
      item.tabIndex = 0
      const text = document.createElement('p'); text.className = 'm-0 truncate'; text.textContent = String(node.props.title ?? ''); item.append(text)
      const actions = descendants(node, 'raycast-action')
      const controls = document.createElement('div'); controls.className = 'flex flex-wrap items-start gap-2 py-2'
      const primary = document.createElement('button'); primary.type = 'button'; primary.className = buttonClass; primary.textContent = String(actions[0]?.props.title ?? ''); primary.disabled = !actions[0]?.props.actionEventId; primary.addEventListener('click', () => invoke(actions[0]))
      const menu = document.createElement('details'); menu.className = 'relative'
      const summary = document.createElement('summary'); summary.className = 'cursor-pointer text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; summary.textContent = zh ? '操作' : 'Actions'; menu.append(summary)
      const panel = document.createElement('div'); panel.className = 'flex flex-col items-start gap-1 py-2'; menu.append(panel)
      for (const action of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.className = buttonClass
        button.textContent = String(action.props.title ?? '') + (action.props.unavailable ? (zh ? '（暂不可用）' : ' (Unavailable)') : '')
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
  element.addEventListener('keydown', event => {
    // Do not cancel native IME behavior; stop Escape before the owning launcher closes this view.
    if (event.isComposing || event.keyCode === 229) { event.stopPropagation(); return }
    const row = rows[selected]
    if (event.key === 'Escape' && row?.menu.open) { event.preventDefault(); event.stopPropagation(); row.menu.open = false; row.menu.querySelector('summary')?.focus(); return }
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
        if (message.style === 'failure') fail(`${message.title}: ${message.message}`); else status.textContent = `${message.title}: ${message.message}`; return }
      if (message.type === 'outcome') {
        if (actionPending !== message.eventId) return
        actionPending = undefined
        if (message.succeeded) { error.hidden = true; actionFeedback = zh ? '操作已完成' : 'Action Completed'; status.textContent = actionFeedback }
        else { actionFeedback = ''; status.textContent = ''; fail(message.message ?? 'Translate action failed') }
        return
      }
      if (current && message.revision <= current.revision) return
      const restoreRow = rows.some(row => row.item.contains?.(document.activeElement))
      current = message
      if (message.type === 'error') { pending = undefined; input.disabled = true; fail(message.message ?? 'Translate runtime failed'); return }
      input.disabled = false
      status.textContent = actionFeedback
      results.replaceChildren()
      if (message.root) render(message.root)
      if (restoreRow) rows[selected]?.item.focus()
      sendLatest()
      if (message.type === 'ready') queueMicrotask(() => input.focus())
    },
  }
}
