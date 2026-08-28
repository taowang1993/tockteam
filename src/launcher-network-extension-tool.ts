import type { LauncherPublicAction, LauncherPublicResultItem } from './launcher-actions.ts'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { LauncherSearchOptions } from './launcher-core-search.ts'
import {
  LAUNCHER_DEEPL_QUERY_PREFIX,
  LAUNCHER_NETWORK_TOOL_INPUT_LENGTH,
  LAUNCHER_WEB_SEARCH_QUERY_PREFIX,
} from './launcher-network-extension-config.ts'
import { launcherNetworkAssetUrl } from './launcher-network-assets.ts'

function element<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag)
  if (className !== undefined) created.className = className
  return created
}

type NetworkToolExtensionId = 'DeeplTranslator' | 'WebSearch'

export function createLauncherNetworkExtensionTool(options: Readonly<{
  bridge: LauncherPreloadBridge
  document: Document
  extensionId: NetworkToolExtensionId
  onClose: () => void
  searchOptions: LauncherSearchOptions
}>): HTMLElement {
  const { bridge, document, extensionId } = options
  const isDeepL = extensionId === 'DeeplTranslator'
  const title = isDeepL ? 'DeepL Translator' : 'Web Search'
  const prefix = isDeepL ? LAUNCHER_DEEPL_QUERY_PREFIX : LAUNCHER_WEB_SEARCH_QUERY_PREFIX
  const tool = element(document, 'section', 'launcher-local-tool')
  tool.setAttribute('aria-label', `${title} tool`)
  const header = element(document, 'header', 'launcher-local-tool-header')
  const identity = element(document, 'div', 'launcher-local-tool-identity')
  const image = element(document, 'img')
  image.alt = ''
  image.src = launcherNetworkAssetUrl(isDeepL ? 'deepl-translator' : 'web-search') ?? ''
  const heading = element(document, 'h2')
  heading.textContent = title
  identity.append(image, heading)
  const close = element(document, 'button', 'launcher-secondary-button')
  close.type = 'button'
  close.textContent = 'Back to results'
  close.setAttribute('aria-label', `Close ${title} tool`)
  close.addEventListener('click', options.onClose)
  header.append(identity, close)

  const content = element(document, 'div', 'launcher-local-tool-content min-w-0 overflow-auto')
  const disclosure = element(document, 'p', 'text-xs text-muted-foreground')
  disclosure.textContent = isDeepL
    ? 'Text is sent to api-free.deepl.com for translation. Your saved key stays in Desktop secure storage.'
    : 'Queries are sent to the selected Google or DuckDuckGo provider for suggestions.'
  const label = element(document, 'label', 'launcher-tool-field')
  const labelText = element(document, 'span')
  labelText.textContent = isDeepL ? 'Text to translate' : 'Search term'
  const input = element(document, isDeepL ? 'textarea' : 'input')
  input.setAttribute('aria-label', labelText.textContent)
  input.setAttribute('autocomplete', 'off')
  input.maxLength = LAUNCHER_NETWORK_TOOL_INPUT_LENGTH
  if (!isDeepL) input.setAttribute('type', 'search')
  label.append(labelText, input)
  const status = element(document, 'p', 'launcher-local-tool-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = isDeepL ? 'Enter text to translate.' : 'Enter a web search.'
  const list = element(document, 'ul', 'm-0 min-w-0 list-none overflow-auto p-0')
  list.setAttribute('aria-label', `${title} results`)
  list.setAttribute('role', 'list')
  content.append(disclosure, label, status, list)
  tool.append(header, content)

  let requestRevision = 0
  let currentItems: readonly LauncherPublicResultItem[] = []
  let openMenu: Readonly<{ menu: HTMLElement; toggle: HTMLButtonElement }> | undefined
  const actionLabel = (action: LauncherPublicAction): string => action.keyboardShortcut === undefined
    ? action.description
    : `${action.description} (${action.keyboardShortcut})`
  const setStatus = (message: string, tone: 'error' | 'muted' | 'ready' = 'muted'): void => {
    status.textContent = message
    status.dataset.tone = tone
  }
  const render = (): void => {
    list.replaceChildren()
    for (const [index, item] of currentItems.entries()) {
      const row = element(document, 'li', 'relative min-w-0')
      row.setAttribute('role', 'listitem')
      const actions = [item.defaultAction, ...(item.additionalActions ?? [])]
      const line = element(document, 'div', 'flex min-w-0 items-center gap-1')
      const button = element(document, 'button', 'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left')
      button.type = 'button'
      button.setAttribute('role', 'listitem')
      button.setAttribute('aria-label', `${item.name} — ${actionLabel(item.defaultAction)}`)
      const name = element(document, 'strong', 'min-w-0 flex-1 truncate text-sm font-medium')
      name.textContent = item.name
      const description = element(document, 'span', 'shrink-0 truncate text-xs text-muted-foreground')
      description.textContent = item.description
      button.append(name, description)
      if (item.details !== undefined) {
        const detail = element(document, 'span', 'sr-only')
        detail.id = `launcher-network-details-${index}`
        detail.textContent = item.details
        button.setAttribute('aria-describedby', detail.id)
        row.append(detail)
      }
      line.append(button)
      row.append(line)
      if (actions.length > 1) {
        const menuId = `launcher-network-actions-${index}`
        const toggle = element(document, 'button', 'shrink-0 rounded-md px-2 py-2 text-xs')
        toggle.type = 'button'
        toggle.textContent = 'Actions'
        toggle.setAttribute('aria-label', `Actions for ${item.name}`)
        toggle.setAttribute('aria-haspopup', 'menu')
        toggle.setAttribute('aria-expanded', 'false')
        toggle.setAttribute('aria-controls', menuId)
        toggle.dataset.networkResultId = item.id
        const menu = element(document, 'div', 'absolute right-0 top-full z-10 mt-1 min-w-[220px] rounded-lg border bg-background py-1 shadow-lg')
        menu.id = menuId
        menu.hidden = true
        menu.setAttribute('role', 'menu')
        menu.setAttribute('aria-label', `Actions for ${item.name}`)
        const menuButtons: HTMLButtonElement[] = []
        for (const action of actions) {
          const actionButton = element(document, 'button', 'flex w-full items-center px-3 py-2 text-left text-sm')
          actionButton.type = 'button'
          actionButton.setAttribute('role', 'menuitem')
          actionButton.setAttribute('aria-label', actionLabel(action))
          actionButton.textContent = actionLabel(action)
          actionButton.addEventListener('click', () => {
            menu.hidden = true
            toggle.setAttribute('aria-expanded', 'false')
            void invoke(action, item)
          })
          menuButtons.push(actionButton)
          menu.append(actionButton)
        }
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
          if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault()
            menu.hidden = true
            toggle.setAttribute('aria-expanded', 'false')
            if (openMenu?.menu === menu) openMenu = undefined
            toggle.focus()
          } else if (next !== undefined) {
            event.preventDefault()
            menuButtons[next]?.focus()
          }
        })
        line.append(toggle)
        row.append(menu)
      }
      button.addEventListener('click', () => { void invoke(item.defaultAction, item) })
      list.append(row)
    }
  }
  const restoreFocus = (itemId?: string): void => {
    if (itemId !== undefined) {
      const toggle = [...list.querySelectorAll<HTMLButtonElement>('[data-network-result-id]')]
        .find(candidate => candidate.dataset.networkResultId === itemId)
      toggle?.focus()
      if (toggle !== undefined) return
    }
    input.focus()
  }
  const search = async (focusItemId?: string): Promise<void> => {
    const term = input.value.trim()
    const revision = ++requestRevision
    if (term.length === 0) {
      currentItems = []
      render()
      setStatus(isDeepL ? 'Enter text to translate.' : 'Enter a web search.')
      return
    }
    if (term.length > LAUNCHER_NETWORK_TOOL_INPUT_LENGTH) {
      currentItems = []
      render()
      setStatus(`${title} input is too long.`, 'error')
      return
    }
    setStatus(isDeepL ? 'Translating with DeepL…' : 'Loading suggestions…')
    try {
      const response = await bridge.search(`${prefix}${term}`, options.searchOptions)
      if (revision !== requestRevision) return
      currentItems = Object.freeze([...response.before, ...response.after].filter(item => item.sourceExtension === extensionId))
      render()
      setStatus(response.status.lastError ?? `${currentItems.length} result${currentItems.length === 1 ? '' : 's'}.`, response.status.lastError === undefined ? 'ready' : 'error')
      restoreFocus(focusItemId)
    } catch {
      if (revision !== requestRevision) return
      currentItems = []
      render()
      setStatus(`${title} is unavailable.`, 'error')
      restoreFocus(focusItemId)
    }
  }
  const invoke = async (action: LauncherPublicAction, item: LauncherPublicResultItem): Promise<void> => {
    const focusItemId = action.hideWindowAfterInvocation === true ? undefined : item.id
    setStatus(`${action.description}…`)
    try {
      const result = await bridge.invokeAction(action.actionId)
      if (!result.ok) {
        await search(focusItemId)
        return
      }
      if (action.hideWindowAfterInvocation === true) {
        await bridge.dismiss().catch(() => undefined)
        return
      }
      await search(focusItemId)
    } catch {
      setStatus(`${action.description} could not be completed.`, 'error')
      await search(focusItemId)
    }
  }
  input.addEventListener('input', () => { void search() })
  input.addEventListener('keydown', event => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key === 'Escape') {
      keyboardEvent.preventDefault()
      options.onClose()
    } else if (keyboardEvent.key === 'ArrowDown') {
      const first = list.querySelector<HTMLButtonElement>('button')
      if (first !== null) { keyboardEvent.preventDefault(); first.focus() }
    } else if (keyboardEvent.key === 'Enter') {
      const first = currentItems[0]
      if (first !== undefined) { keyboardEvent.preventDefault(); void invoke(first.defaultAction, first) }
    }
  })
  const closeMenuWithoutFocus = (): void => {
    if (openMenu === undefined) return
    openMenu.menu.hidden = true
    openMenu.toggle.setAttribute('aria-expanded', 'false')
    openMenu = undefined
  }
  tool.addEventListener('pointerdown', event => {
    if (openMenu === undefined || !(event.target instanceof Element)) return
    if (event.target.closest('[role="menu"], [aria-haspopup="menu"]') === null) closeMenuWithoutFocus()
  })
  queueMicrotask(() => input.focus())
  return tool
}
