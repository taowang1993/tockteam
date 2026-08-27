import type { LauncherPublicResultItem, LauncherPublicAction } from './launcher-actions.ts'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { LauncherSearchOptions } from './launcher-core-search.ts'
import { LAUNCHER_FILE_SEARCH_QUERY_PREFIX } from './launcher-contract.ts'

function element<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag)
  if (className) created.className = className
  return created
}

export function createLauncherFileSearchTool(options: Readonly<{
  bridge: LauncherPreloadBridge
  document: Document
  onClose: () => void
  searchOptions: LauncherSearchOptions
}>): HTMLElement {
  const { bridge, document } = options
  const tool = element(document, 'section', 'launcher-local-tool')
  tool.setAttribute('aria-label', 'File Search Tool')
  const header = element(document, 'header', 'launcher-local-tool-header')
  const title = element(document, 'h2')
  title.textContent = 'File Search'
  const close = element(document, 'button', 'launcher-secondary-button')
  close.type = 'button'; close.textContent = 'Back to Results'; close.setAttribute('aria-label', 'Close File Search Tool'); close.addEventListener('click', options.onClose)
  header.append(title, close); tool.append(header)
  const content = element(document, 'div', 'launcher-local-tool-content'); tool.append(content)
  const input = element(document, 'input')
  input.type = 'search'; input.maxLength = 512; input.placeholder = 'Search files'; input.setAttribute('aria-label', 'File Search Input'); input.autocomplete = 'off'
  const status = element(document, 'p', 'launcher-local-tool-error'); status.setAttribute('role', 'status'); status.textContent = 'Enter a file name to search.'
  const list = element(document, 'ul', 'm-0 list-none p-0'); list.setAttribute('aria-label', 'File Search Results')
  content.append(input, status, list)

  let requestRevision = 0
  let currentItems: LauncherPublicResultItem[] = []
  const actionLabel = (action: LauncherPublicAction): string => action.keyboardShortcut === undefined ? action.description : `${action.description} (${action.keyboardShortcut})`
  const render = (items: readonly LauncherPublicResultItem[]): void => {
    currentItems = [...items]
    list.replaceChildren()
    for (const item of currentItems) {
      const row = element(document, 'li')
      const button = element(document, 'button', 'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]')
      button.type = 'button'; button.setAttribute('aria-label', `${item.name} — ${actionLabel(item.defaultAction)}`)
      const name = element(document, 'strong', 'min-w-0 flex-1 truncate text-sm font-medium'); name.textContent = item.name
      const description = element(document, 'span', 'shrink-0 text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'); description.textContent = item.description
      button.append(name, description)
      button.addEventListener('click', () => { void invoke(item.defaultAction) })
      row.append(button); list.append(row)
    }
  }
  const invoke = async (action: LauncherPublicAction): Promise<void> => {
    try {
      const result = await bridge.invokeAction(action.actionId)
      if (!result.ok) { await search(); return }
      if (action.hideWindowAfterInvocation === true) await bridge.dismiss().catch(() => undefined)
      else await search()
    } catch {
      status.textContent = `${action.description} could not be completed.`
      status.setAttribute('data-tone', 'error')
      await search()
    }
  }
  const search = async (): Promise<void> => {
    const revision = ++requestRevision
    const term = input.value.trim()
    if (term.length === 0) { render([]); status.textContent = 'Enter a file name to search.'; return }
    status.textContent = 'Searching…'; status.setAttribute('data-tone', 'muted')
    try {
      const response = await bridge.search(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX}${term}`, options.searchOptions)
      if (revision !== requestRevision) return
      render([...response.before, ...response.after])
      status.textContent = response.status.lastError ?? (currentItems.length === 0 ? 'No files found.' : `${currentItems.length} files found.`)
      status.setAttribute('data-tone', response.status.lastError === undefined ? 'ready' : 'error')
    } catch {
      if (revision !== requestRevision) return
      render([]); status.textContent = 'File Search is unavailable.'; status.setAttribute('data-tone', 'error')
    }
  }
  input.addEventListener('input', () => { void search() })
  queueMicrotask(() => input.focus())
  return tool
}
