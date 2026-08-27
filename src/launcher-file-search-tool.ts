import type { LauncherPublicResultItem, LauncherPublicAction } from './launcher-actions.ts'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { LauncherSearchOptions } from './launcher-core-search.ts'
import { LAUNCHER_FILE_SEARCH_QUERY_PREFIX, LAUNCHER_MAX_SEARCH_TERM_LENGTH } from './launcher-contract.ts'

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
  const maxInputLength = Math.max(1, LAUNCHER_MAX_SEARCH_TERM_LENGTH - LAUNCHER_FILE_SEARCH_QUERY_PREFIX.length)
  input.type = 'search'; input.maxLength = maxInputLength; input.placeholder = 'Search files'; input.setAttribute('aria-label', 'File Search Input'); input.autocomplete = 'off'
  const status = element(document, 'p', 'launcher-local-tool-error'); status.setAttribute('role', 'status'); status.textContent = 'Enter a file name to search.'
  const list = element(document, 'ul', 'm-0 list-none p-0'); list.setAttribute('aria-label', 'File Search Results')
  content.append(input, status, list)

  let requestRevision = 0
  let currentItems: LauncherPublicResultItem[] = []
  const actionLabel = (action: LauncherPublicAction): string => action.keyboardShortcut === undefined ? action.description : `${action.description} (${action.keyboardShortcut})`
  const render = (items: readonly LauncherPublicResultItem[]): void => {
    currentItems = [...items]
    list.replaceChildren()
    for (const [index, item] of currentItems.entries()) {
      const row = element(document, 'li', 'relative')
      const actions = [item.defaultAction, ...(item.additionalActions ?? [])]
      const content = element(document, 'div', 'flex min-w-0 items-center gap-1')
      const button = element(document, 'button', 'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]')
      button.type = 'button'; button.setAttribute('aria-label', `${item.name} — ${actionLabel(item.defaultAction)}`)
      const name = element(document, 'strong', 'min-w-0 flex-1 truncate text-sm font-medium'); name.textContent = item.name
      const description = element(document, 'span', 'shrink-0 text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'); description.textContent = item.description
      button.append(name, description)
      button.addEventListener('click', () => { void invoke(item.defaultAction) })
      content.append(button)
      if (actions.length > 1) {
        const menuId = `launcher-file-search-actions-${index}`
        const toggle = element(document, 'button', 'shrink-0 rounded-md px-2 py-2 text-xs hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]')
        toggle.type = 'button'; toggle.textContent = 'Actions'; toggle.setAttribute('aria-label', `Actions for ${item.name}`); toggle.setAttribute('aria-haspopup', 'menu'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', menuId)
        const menu = element(document, 'div', 'absolute right-0 top-full z-10 mt-1 min-w-[220px] rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--dsw-alias-bg-layer-1,Canvas)] py-1 shadow-lg')
        menu.id = menuId; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `Actions for ${item.name}`)
        const menuButtons: HTMLButtonElement[] = []
        for (const action of actions) {
          const actionButton = element(document, 'button', 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]')
          actionButton.type = 'button'; actionButton.setAttribute('role', 'menuitem'); actionButton.setAttribute('aria-label', actionLabel(action)); actionButton.textContent = actionLabel(action)
          actionButton.addEventListener('click', () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); void invoke(action) })
          menuButtons.push(actionButton); menu.append(actionButton)
        }
        const closeMenu = (): void => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus() }
        toggle.addEventListener('click', () => {
          const open = menu.hidden
          menu.hidden = !open
          toggle.setAttribute('aria-expanded', String(open))
          if (open) menuButtons[0]?.focus()
        })
        menu.addEventListener('keydown', event => {
          const current = menuButtons.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'ArrowDown'
            ? (Math.max(current, 0) + 1) % menuButtons.length
            : event.key === 'ArrowUp'
              ? (Math.max(current, 0) - 1 + menuButtons.length) % menuButtons.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? menuButtons.length - 1 : undefined
          if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return }
          if (next !== undefined) { event.preventDefault(); menuButtons[next]?.focus() }
        })
        content.append(toggle); row.append(content, menu)
      } else row.append(content)
      list.append(row)
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
    if (term.length > maxInputLength) { render([]); status.textContent = 'Search term is too long.'; status.setAttribute('data-tone', 'error'); return }
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
