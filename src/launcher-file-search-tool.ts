import type { LauncherPublicResultItem, LauncherPublicAction } from './launcher-actions.ts'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { LauncherSearchOptions } from './launcher-core-search.ts'
import { LAUNCHER_FILE_SEARCH_QUERY_PREFIX, LAUNCHER_MAX_SEARCH_TERM_LENGTH, type LauncherLocale } from './launcher-contract.ts'
import { launcherCountText, launcherText } from './launcher-i18n.ts'

function element<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag)
  if (className) created.className = className
  return created
}

export function createLauncherFileSearchTool(options: Readonly<{
  bridge: LauncherPreloadBridge
  document: Document
  locale?: LauncherLocale
  onClose: () => void
  searchOptions: LauncherSearchOptions
}>): HTMLElement {
  const { bridge, document } = options
  const text = (key: string, fallback: string): string => launcherText(options.locale, key, fallback)
  const tool = element(document, 'section', 'launcher-local-tool')
  tool.setAttribute('aria-label', `${text('fileSearch', 'File Search')} Tool`)
  const header = element(document, 'header', 'launcher-local-tool-header')
  const title = element(document, 'h2')
  title.textContent = text('fileSearch', 'File Search')
  const close = element(document, 'button', 'launcher-secondary-button')
  close.type = 'button'; close.textContent = text('back', 'Back to Results'); close.setAttribute('aria-label', `Close ${text('fileSearch', 'File Search')} Tool`); close.addEventListener('click', options.onClose)
  header.append(title, close); tool.append(header)
  const content = element(document, 'div', 'launcher-local-tool-content'); tool.append(content)
  const input = element(document, 'input')
  const maxInputLength = LAUNCHER_MAX_SEARCH_TERM_LENGTH
  input.type = 'search'; input.maxLength = maxInputLength; input.placeholder = text('searchFiles', 'Search files'); input.setAttribute('aria-label', text('fileSearchInput', 'File Search Input')); input.autocomplete = 'off'
  const status = element(document, 'p', 'launcher-local-tool-error'); status.setAttribute('role', 'status'); status.textContent = text('enterFile', 'Enter a file name to search.')
  const list = element(document, 'ul', 'm-0 min-w-0 list-none overflow-auto p-0'); list.setAttribute('aria-label', text('fileSearchResults', 'File Search Results')); list.setAttribute('role', 'list')
  content.append(input, status, list)

  let requestRevision = 0
  let openMenu: Readonly<{ menu: HTMLElement; toggle: HTMLButtonElement }> | undefined
  let currentItems: LauncherPublicResultItem[] = []
  const actionLabel = (action: LauncherPublicAction): string => action.keyboardShortcut === undefined ? action.description : `${action.description} (${action.keyboardShortcut})`
  const render = (items: readonly LauncherPublicResultItem[]): void => {
    currentItems = [...items]
    list.replaceChildren()
    for (const [index, item] of currentItems.entries()) {
      const row = element(document, 'li', 'relative min-w-0'); row.setAttribute('role', 'listitem')
      const actions = [item.defaultAction, ...(item.additionalActions ?? [])]
      const content = element(document, 'div', 'flex min-w-0 items-center gap-1')
      const button = element(document, 'button', 'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]')
      button.type = 'button'; button.setAttribute('role', 'listitem'); button.setAttribute('aria-label', `${item.name} — ${actionLabel(item.defaultAction)}`)
      const name = element(document, 'strong', 'min-w-0 flex-1 truncate text-sm font-medium'); name.textContent = item.name
      const description = element(document, 'span', 'shrink-0 text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'); description.textContent = item.description
      const itemDetails = item.details
      const details = itemDetails === undefined ? undefined : element(document, 'span', 'min-w-0 truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]')
      if (details !== undefined && itemDetails !== undefined) { details.id = `launcher-file-search-details-${index}`; details.textContent = itemDetails; details.setAttribute('aria-label', itemDetails); button.setAttribute('aria-describedby', details.id) }
      button.append(name, description)
      if (details !== undefined) content.append(details)
      button.addEventListener('click', () => { void invoke(item.defaultAction, item) })
      content.append(button)
      if (actions.length > 1) {
        const menuId = `launcher-file-search-actions-${index}`
        const toggle = element(document, 'button', 'shrink-0 rounded-md px-2 py-2 text-xs hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]')
        toggle.type = 'button'; toggle.textContent = text('actions', 'Actions'); toggle.setAttribute('aria-label', `${text('actions', 'Actions')} for ${item.name}`); toggle.setAttribute('aria-haspopup', 'menu'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', menuId); toggle.setAttribute('data-file-search-result-id', item.id)
        const menu = element(document, 'div', 'absolute right-0 top-full z-10 mt-1 min-w-[220px] rounded-lg border border-[var(--dsw-alias-border-l2,CanvasText)] bg-[var(--dsw-alias-bg-layer-1,Canvas)] py-1 shadow-lg')
        menu.id = menuId; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `Actions for ${item.name}`)
        const menuButtons: HTMLButtonElement[] = []
        for (const action of actions) {
          const actionButton = element(document, 'button', 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))]')
          actionButton.type = 'button'; actionButton.setAttribute('role', 'menuitem'); actionButton.setAttribute('aria-label', actionLabel(action)); actionButton.textContent = actionLabel(action)
          actionButton.addEventListener('click', () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); void invoke(action, item) })
          menuButtons.push(actionButton); menu.append(actionButton)
        }
        const closeMenu = (focus = true): void => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); if (openMenu?.menu === menu) openMenu = undefined; if (focus) toggle.focus() }
        toggle.addEventListener('click', () => {
          const open = menu.hidden
          if (openMenu !== undefined && openMenu.menu !== menu) { openMenu.menu.hidden = true; openMenu.toggle.setAttribute('aria-expanded', 'false') }
          menu.hidden = !open
          toggle.setAttribute('aria-expanded', String(open))
          if (open) { openMenu = Object.freeze({ menu, toggle }); menuButtons[0]?.focus() } else if (openMenu?.menu === menu) openMenu = undefined
        })
        menu.addEventListener('keydown', event => {
          const current = menuButtons.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'ArrowDown'
            ? (Math.max(current, 0) + 1) % menuButtons.length
            : event.key === 'ArrowUp'
              ? (Math.max(current, 0) - 1 + menuButtons.length) % menuButtons.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? menuButtons.length - 1 : undefined
          if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); closeMenu(); return }
          if (next !== undefined) { event.preventDefault(); menuButtons[next]?.focus() }
        })
        content.append(toggle); row.append(content, menu)
      } else row.append(content)
      list.append(row)
    }
  }
  type RestoreFocus = Readonly<{ menu: boolean; resultId: string }>
  const restoreFocus = (target: RestoreFocus): void => {
    if (target.menu) {
      const toggle = [...list.querySelectorAll<HTMLButtonElement>('[data-file-search-result-id]')]
        .find(candidate => candidate.getAttribute('data-file-search-result-id') === target.resultId)
      if (toggle !== undefined) { toggle.focus(); return }
    }
    input.focus()
  }
  const invoke = async (action: LauncherPublicAction, item: LauncherPublicResultItem): Promise<void> => {
    const focus = action.hideWindowAfterInvocation === true
      ? undefined
      : { menu: document.activeElement?.getAttribute('role') === 'menuitem', resultId: item.id }
    try {
      const result = await bridge.invokeAction(action.actionId)
      if (!result.ok) { await search(focus); return }
      if (action.hideWindowAfterInvocation === true) await bridge.dismiss().catch(() => undefined)
      else await search(focus)
    } catch {
      status.textContent = `${action.description} could not be completed.`
      status.setAttribute('data-tone', 'error')
      await search(focus)
    }
  }
  const search = async (focus?: RestoreFocus): Promise<void> => {
    const revision = ++requestRevision
    const term = input.value.trim()
    if (term.length === 0) { render([]); status.textContent = text('enterFile', 'Enter a file name to search.'); return }
    if (term.length > maxInputLength) { render([]); status.textContent = text('searchTooLong', 'Search term is too long.'); status.setAttribute('data-tone', 'error'); return }
    status.textContent = text('searching', 'Searching…'); status.setAttribute('data-tone', 'muted')
    try {
      const response = await bridge.search(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX}${term}`, options.searchOptions)
      if (revision !== requestRevision) return
      render([...response.before, ...response.after])
      status.textContent = response.status.lastError ?? (currentItems.length === 0 ? text('noFiles', 'No files found.') : launcherCountText(options.locale, 'filesFound', currentItems.length, `${currentItems.length} files found.`))
      status.setAttribute('data-tone', response.status.lastError === undefined ? 'ready' : 'error')
      if (focus !== undefined) restoreFocus(focus)
    } catch {
      if (revision !== requestRevision) return
      render([]); status.textContent = text('fileUnavailable', 'File Search is unavailable.'); status.setAttribute('data-tone', 'error')
      if (focus !== undefined) restoreFocus(focus)
    }
  }
  input.addEventListener('input', () => { void search() })
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      options.onClose()
    } else if (event.key === 'ArrowDown') {
      const first = list.querySelector<HTMLButtonElement>('button')
      if (first !== null) { event.preventDefault(); first.focus() }
    } else if (event.key === 'Enter') {
      const first = currentItems[0]
      if (first !== undefined) { event.preventDefault(); void invoke(first.defaultAction, first) }
    }
  })
  tool.addEventListener('pointerdown', event => {
    if (openMenu === undefined || !(event.target instanceof Element)) return
    if (event.target.closest('[role="menu"], [aria-haspopup="menu"]') === null) closeMenuWithoutFocus()
  })
  const closeMenuWithoutFocus = (): void => {
    if (openMenu === undefined) return
    openMenu.menu.hidden = true
    openMenu.toggle.setAttribute('aria-expanded', 'false')
    openMenu = undefined
  }
  queueMicrotask(() => input.focus())
  return tool
}
