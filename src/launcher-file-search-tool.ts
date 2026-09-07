import type { LauncherPublicResultItem, LauncherPublicAction } from './launcher-actions.ts'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { LauncherSearchOptions } from './launcher-core-search.ts'
import { LAUNCHER_FILE_SEARCH_QUERY_PREFIX, LAUNCHER_MAX_SEARCH_TERM_LENGTH, launcherShortcutAriaLabel, type LauncherLocale } from './launcher-contract.ts'
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
  const toolName = text('fileSearch', 'File Search')
  tool.setAttribute('aria-label', `${toolName} ${text('tool', 'Tool')}`)
  const header = element(document, 'header', 'launcher-command-header justify-between')
  const title = element(document, 'h2', 'm-0 text-sm font-semibold')
  title.textContent = toolName
  const close = element(document, 'button', 'launcher-command-footer-action')
  close.type = 'button'; close.textContent = text('back', 'Back to Results'); close.setAttribute('aria-label', `${text('closeTool', 'Close')} ${toolName} ${text('tool', 'Tool')}`); close.addEventListener('click', options.onClose)
  header.append(title, close); tool.append(header)
  const content = element(document, 'div', 'launcher-command-content'); tool.append(content)
  const input = element(document, 'input')
  const maxInputLength = LAUNCHER_MAX_SEARCH_TERM_LENGTH
  input.type = 'search'; input.className = 'launcher-command-control'; input.maxLength = maxInputLength; input.placeholder = text('searchFiles', 'Search files'); input.setAttribute('aria-label', text('fileSearchInput', 'File Search Input')); input.setAttribute('aria-controls', 'launcher-file-search-results'); input.setAttribute('aria-autocomplete', 'list'); input.autocomplete = 'off'
  const status = element(document, 'p', 'launcher-command-status data-[tone=error]:text-[var(--dsw-alias-state-error-primary,CanvasText)]'); status.setAttribute('role', 'status'); status.textContent = text('enterFile', 'Enter a file name to search.')
  const list = element(document, 'ul', 'launcher-command-list'); list.id = 'launcher-file-search-results'; list.setAttribute('aria-label', text('fileSearchResults', 'File Search Results')); list.setAttribute('role', 'list')
  content.append(input, status, list)

  let requestRevision = 0
  let openMenu: Readonly<{ menu: HTMLElement; toggle: HTMLButtonElement }> | undefined
  let currentItems: LauncherPublicResultItem[] = []
  const actionLabel = (action: LauncherPublicAction): string => action.keyboardShortcut === undefined ? action.description : `${action.description} (${action.keyboardShortcut})`
  const render = (items: readonly LauncherPublicResultItem[]): void => {
    currentItems = [...items]
    list.replaceChildren()
    const resultButtons: HTMLButtonElement[] = []
    for (const [index, item] of currentItems.entries()) {
      const row = element(document, 'li', 'relative min-w-0'); row.setAttribute('role', 'listitem')
      const actions = [item.defaultAction, ...(item.additionalActions ?? [])]
      const content = element(document, 'div', 'flex min-w-0 items-center gap-1')
      const button = element(document, 'button', 'launcher-command-row flex-1')
      button.type = 'button'; button.setAttribute('aria-label', `${item.name} — ${actionLabel(item.defaultAction)}`)
      const name = element(document, 'strong', 'min-w-0 flex-1 truncate text-sm font-medium'); name.textContent = item.name
      const description = element(document, 'span', 'shrink-0 text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]'); description.textContent = item.description
      const itemDetails = item.details
      const details = itemDetails === undefined ? undefined : element(document, 'span', 'min-w-0 truncate text-xs text-[var(--dsw-alias-label-secondary,CanvasText)]')
      if (details !== undefined && itemDetails !== undefined) { details.id = `launcher-file-search-details-${index}`; details.textContent = itemDetails; details.setAttribute('aria-label', itemDetails); button.setAttribute('aria-describedby', details.id) }
      button.append(name, description)
      if (details !== undefined) content.append(details)
      button.addEventListener('click', () => { void invoke(item.defaultAction, item) })
      button.addEventListener('keydown', event => {
        const next = event.key === 'ArrowDown' ? (index + 1) % currentItems.length
          : event.key === 'ArrowUp' ? (index - 1 + currentItems.length) % currentItems.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? currentItems.length - 1 : undefined
        if (next === undefined) return
        event.preventDefault()
        resultButtons[next]?.focus()
      })
      resultButtons.push(button)
      content.append(button)
      if (actions.length > 1) {
        const menuId = `launcher-file-search-actions-${index}`
        const toggle = element(document, 'button', 'launcher-command-footer-action shrink-0')
        toggle.type = 'button'; toggle.textContent = text('actions', 'Actions'); toggle.setAttribute('aria-label', `${text('actionsFor', 'Actions for')} ${item.name}`); toggle.setAttribute('aria-haspopup', 'menu'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', menuId); toggle.setAttribute('data-file-search-result-id', item.id)
        const menu = element(document, 'div', 'launcher-command-menu right-0 top-full mt-1')
        menu.id = menuId; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `${text('actionsFor', 'Actions for')} ${item.name}`)
        const menuButtons: HTMLButtonElement[] = []
        for (const action of actions) {
          const actionButton = element(document, 'button', 'launcher-command-menu-item')
          actionButton.type = 'button'; actionButton.setAttribute('role', 'menuitem'); actionButton.setAttribute('aria-label', actionLabel(action)); actionButton.setAttribute('aria-keyshortcuts', action.keyboardShortcut === undefined ? 'Enter' : launcherShortcutAriaLabel(action.keyboardShortcut)); actionButton.title = action.description; actionButton.textContent = actionLabel(action)
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
          if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); closeMenu(); return }
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
    const focus = { menu: document.activeElement?.getAttribute('role') === 'menuitem', resultId: item.id }
    try {
      const result = await bridge.invokeAction(action.actionId)
      if (!result.ok) { await search(focus); return }
      await search(focus)
    } catch {
      status.textContent = launcherText(options.locale, 'actionFailed', 'The action could not be completed.')
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
      status.textContent = response.status.lastError === undefined
        ? (currentItems.length === 0 ? text('noFiles', 'No files found.') : launcherCountText(options.locale, 'filesFound', currentItems.length, `${currentItems.length} files found.`))
        : text('fileUnavailable', 'File Search is unavailable.')
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
      event.stopPropagation()
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
  const closeMenuAndRestoreFocus = (): void => {
    const toggle = openMenu?.toggle
    closeMenuWithoutFocus()
    if (toggle !== undefined) setTimeout(() => { if (toggle.isConnected) toggle.focus() }, 0)
  }
  tool.addEventListener('tockteam-launcher-close-tool-menu', closeMenuAndRestoreFocus)
  queueMicrotask(() => input.focus())
  return tool
}
