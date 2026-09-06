import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { TrustedRaycastViewMessage, TrustedRaycastViewNode } from './trusted-raycast-contract.ts'

/** First-party finite DOM projection. No extension code, HTML, URLs, or native effects. */
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
  const notice = document.createElement('p'); notice.className = 'launcher-local-tool-status'; notice.textContent = zh ? '手动输入 · 自动检测 → 简体中文 / 英语。复制、粘贴、语言管理和语音暂不可用。' : 'Manual input · Auto → Simplified Chinese / English. Copy, Paste, language management and speech are not available in this slice.'
  const error = document.createElement('p'); error.className = 'launcher-local-tool-error'; error.setAttribute('role', 'alert'); error.hidden = true
  content.append(label, status, results, notice, error); element.append(header, content)
  let current: TrustedRaycastViewMessage | undefined
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
    error.hidden = true
    status.textContent = zh ? '正在翻译…' : 'Translating…'
    sendLatest()
  })
  const render = (node: TrustedRaycastViewNode): void => {
    if (node.type === 'raycast-empty') status.textContent = String(node.props.title ?? '')
    if (node.type === 'raycast-list-item') {
      const item = document.createElement('li'); item.className = 'px-3 py-2 rounded-md focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)] [overflow-wrap:anywhere]'
      item.textContent = String(node.props.title ?? '')
      item.tabIndex = 0
      item.addEventListener('keydown', event => { if (event.key === 'Enter') fail(zh ? '此操作暂不可用。' : 'Translation actions are not supported in this slice.') })
      results.append(item)
    }
    for (const child of node.children) if (typeof child !== 'string') render(child)
  }
  return {
    element,
    update(message) {
      if (current && (message.sessionId !== current.sessionId || message.generation !== current.generation || message.revision <= current.revision)) return
      current = message
      if (message.type === 'error') { pending = undefined; input.disabled = true; fail(message.message ?? 'Translate runtime failed'); return }
      input.disabled = false
      status.textContent = ''
      results.replaceChildren()
      if (message.root) render(message.root)
      sendLatest()
      if (message.type === 'ready') queueMicrotask(() => input.focus())
    },
  }
}
