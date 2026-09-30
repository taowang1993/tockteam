import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { UserRaycastStatus } from './user-raycast-contract.ts'
import type { UserRaycastMessage } from './user-raycast-manager.ts'

type Node = { type: string; props: Record<string, string | number | boolean | null>; children: Array<Node | string> }

/** Inert text/buttons only: extension code and React never enter the launcher renderer. */
export function createUserRaycastView(document: Document, bridge: LauncherPreloadBridge, onClose: () => void) {
  const element = document.createElement('section')
  element.className = 'flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 text-foreground'
  element.setAttribute('aria-label', 'Raycast-Compatible Extensions')
  element.dataset.userRaycast = 'true'
  const title = document.createElement('h2')
  title.className = 'm-0 text-base font-semibold'
  title.textContent = 'Raycast-Compatible Extensions'
  const subtitle = document.createElement('p')
  subtitle.className = 'm-0 text-sm text-muted-foreground'
  subtitle.textContent = 'Choose a built folder or fetch one public source command. Building public source requires npm on your computer; installation does not prove compatibility.'
  const warning = document.createElement('p')
  warning.className = 'm-0 text-sm text-warning'
  warning.textContent = 'Approved extensions run as local programs and can access files, the network, and processes using your account. A separate process is not a security sandbox.'
  const sourceInputs = document.createElement('div')
  sourceInputs.className = 'flex flex-wrap gap-2'
  const sourceInput = (name: string, example: string): HTMLInputElement => {
    const label = document.createElement('label')
    label.className = 'flex min-w-0 flex-1 flex-col gap-1 text-sm'
    label.textContent = name
    const input = document.createElement('input')
    input.type = 'text'; input.maxLength = 64; input.placeholder = example; input.setAttribute('aria-label', name)
    input.className = 'min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring'
    label.append(input); sourceInputs.append(label)
    return input
  }
  const extensionInput = sourceInput('Public Extension', 'uuid-generator')
  const commandInput = sourceInput('Command Name', 'generate')
  const sourceSummary = document.createElement('div')
  sourceSummary.className = 'min-w-0 break-words text-sm text-muted-foreground'
  const summary = document.createElement('div')
  summary.className = 'min-w-0 break-words text-sm text-muted-foreground'
  const controls = document.createElement('div')
  controls.className = 'flex flex-wrap gap-2'
  const rendered = document.createElement('div')
  rendered.className = 'min-h-0 overflow-auto'
  const feedback = document.createElement('p')
  feedback.className = 'm-0 text-sm text-muted-foreground'
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')
  const close = document.createElement('button')
  close.type = 'button'; close.textContent = 'Back to Search'; close.className = 'rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring'
  close.addEventListener('click', () => { void bridge.userRaycastClose().finally(onClose) })
  element.append(close, title, subtitle, warning, sourceInputs, sourceSummary, summary, controls, feedback, rendered)
  let state: UserRaycastStatus = { digest: '', enabled: false, hasPrevious: false, installed: false }
  let busy = false
  let reviewed = false
  let reviewedSource = false
  let removing = false
  let active: { extensionId: string; sessionId: string; revision: number } | undefined
  let searchText = ''
  let disposed = false
  const button = (text: string, action: string, run: () => Promise<unknown> | void, disabled = false): HTMLButtonElement => {
    const result = document.createElement('button')
    result.type = 'button'; result.textContent = text; result.dataset.userRaycastAction = action
    result.className = 'rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'
    result.disabled = disabled || busy
    result.addEventListener('click', () => { if (busy || disposed) return; void execute(run) })
    return result
  }
  const execute = async (action: () => Promise<unknown> | void): Promise<void> => {
    busy = true; paint()
    try { await action(); if (!disposed && (!state.enabled || state.mode !== 'menu-bar') && !(state.mode === 'no-view' && active)) feedback.textContent = '' }
    catch (error) { if (!disposed) { feedback.textContent = error instanceof Error ? error.message.slice(0, 512) : 'Extension operation failed'; feedback.setAttribute('role', 'alert') } }
    finally { busy = false; if (!disposed) paint() }
  }
  const paint = (): void => {
    controls.replaceChildren()
    const candidate = state.candidate
    const source = state.sourceCandidate
    sourceSummary.textContent = source ? `Public Source: ${source.title} · ${source.extensionId} / ${source.command} · MIT (declared) · ${source.files} files · Revision: ${source.revision} · Source SHA-256: ${source.digest} · ${source.source}. Review this exact source before building. Compatibility is not guaranteed.` : 'No public source selected.'
    summary.textContent = candidate ? `${state.installed ? `Current Installed SHA-256: ${state.digest}. ` : ''}${candidate.title} · ${candidate.extensionId} / ${candidate.command} · Version: ${candidate.version ?? 'not specified'} · License: ${candidate.license ?? 'not specified'} · Declared source: ${candidate.source ?? 'chosen local folder'} · SHA-256: ${candidate.digest}. These declarations and compatibility have not been verified by TockTeam.` : state.installed ? `Installed digest: ${state.digest}` : 'No built extension selected.'
    controls.append(button('Fetch Public Source', 'source-prepare', async () => {
      await bridge.userRaycastSourcePrepare({ extensionId: extensionInput.value.trim(), command: commandInput.value.trim() })
      state = await bridge.userRaycastState(); reviewedSource = false
    }))
    if (source) {
      const label = document.createElement('label')
      label.className = 'flex items-start gap-2 text-sm'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'; checkbox.checked = reviewedSource; checkbox.dataset.userRaycastSourceReview = 'true'; checkbox.className = 'mt-1 accent-primary'
      checkbox.addEventListener('change', () => { reviewedSource = checkbox.checked; paint() })
      label.append(checkbox, document.createTextNode('I reviewed this exact public source and want to download build packages.'))
      controls.append(label, button('Build Reviewed Source', 'source-build', async () => { state = await bridge.userRaycastSourceBuild(source.digest); reviewedSource = false; reviewed = false }, !reviewedSource))
    }
    controls.append(button('Choose Built Folder', 'choose', async () => { const chosen = await bridge.userRaycastChoose(); if (chosen) { state = await bridge.userRaycastState(); reviewed = false; removing = false } }))
    if (candidate && (!state.installed || candidate.digest !== state.digest)) {
      const label = document.createElement('label')
      label.className = 'flex items-start gap-2 text-sm'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'; checkbox.checked = reviewed; checkbox.dataset.userRaycastBuiltReview = 'true'; checkbox.className = 'mt-1 accent-primary'
      checkbox.addEventListener('change', () => { reviewed = checkbox.checked; paint() })
      label.append(checkbox, document.createTextNode('I reviewed the selected source and accept account-level access.'))
      controls.append(label, button('Review and Install', 'approve', async () => { state = await bridge.userRaycastApprove(candidate.digest); reviewed = false }, !reviewed))
    }
    if (state.hasPrevious) controls.append(button('Restore Previous Version', 'recover', async () => { await bridge.userRaycastClose(); active = undefined; rendered.replaceChildren(); state = await bridge.userRaycastMutate('recover') }))
    if (!state.installed) return
    if (state.enabled) {
      controls.append(button(state.mode === 'menu-bar' ? 'Activate Menu Bar' : state.mode === 'no-view' ? 'Run Command' : 'Open Command', 'open', async () => { active = undefined; searchText = ''; rendered.replaceChildren(); await bridge.userRaycastOpen(); if (state.mode === 'menu-bar') feedback.textContent = 'Menu Bar Active' }))
      controls.append(button('Disable', 'disable', async () => { await bridge.userRaycastClose(); active = undefined; rendered.replaceChildren(); state = await bridge.userRaycastMutate('disable') }))
    } else controls.append(button('Enable', 'enable', async () => { state = await bridge.userRaycastMutate('enable') }))
    controls.append(button(removing ? 'Confirm Remove' : 'Remove Extension', 'remove', async () => {
      if (!removing) { removing = true; feedback.textContent = 'Select Confirm Remove to remove this extension.'; return }
      await bridge.userRaycastClose(); active = undefined; rendered.replaceChildren(); state = await bridge.userRaycastMutate('remove'); removing = false
    }))
  }
  const collect = (node: Node | string, type: string, output: Node[]): void => {
    if (typeof node === 'string') return
    if (node.type === type) output.push(node)
    for (const child of node.children) collect(child, type, output)
  }
  const update = (message: UserRaycastMessage): void => {
    if (disposed) return
    if (message.type === 'auth-url') {
      if (message.extensionId !== 'linear' || !message.url) return
      active = { extensionId: message.extensionId, sessionId: message.sessionId, revision: message.revision }
      const label = document.createElement('label')
      label.className = 'flex min-w-0 flex-col gap-2 text-sm'
      label.textContent = 'Linear Sign-In Link'
      const field = document.createElement('input')
      field.type = 'text'; field.readOnly = true; field.value = message.url; field.setAttribute('aria-label', 'Linear Sign-In Link')
      field.className = 'w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring'
      label.append(field)
      const hint = document.createElement('p')
      hint.className = 'm-0 text-sm text-muted-foreground'
      hint.textContent = 'Select and copy this link into your browser to sign in. Return here afterward. This test does not open a browser for you.'
      const select = button('Select Sign-In Link', 'select-sign-in-link', () => { field.focus(); field.select() })
      select.disabled = false
      rendered.replaceChildren(label, hint, select)
      feedback.textContent = 'Waiting for Linear sign-in.'
      return
    }
    if (message.type === 'error') { feedback.textContent = message.message ?? 'Extension failed'; feedback.setAttribute('role', 'alert'); return }
    if (message.type === 'outcome') { feedback.textContent = message.succeeded ? message.eventId === 'run' ? 'Command Complete' : 'Action Complete' : message.message ?? 'Action failed'; feedback.setAttribute('role', message.succeeded ? 'status' : 'alert'); return }
    if (message.type === 'toast') { feedback.textContent = message.title ?? ''; return }
    if (!message.root || typeof message.root !== 'object') return
    if (message.type === 'ready') active = { extensionId: message.extensionId, sessionId: message.sessionId, revision: message.revision }
    else if (!active || active.extensionId !== message.extensionId || active.sessionId !== message.sessionId || message.revision <= active.revision) return
    else active.revision = message.revision
    if (state.mode === 'menu-bar') { rendered.replaceChildren(); feedback.textContent = 'Menu Bar Active'; return }
    if (state.mode === 'no-view') { rendered.replaceChildren(); feedback.textContent = 'Running Command'; return }
    const root = message.root as Node
    const items: Node[] = []
    collect(root, 'raycast-list-item', items)
    const searchFocused = document.activeElement === rendered.querySelector('input[aria-label="Search Extension"]')
    rendered.replaceChildren()
    if (root.props.searchable === true) {
      const search = document.createElement('input')
      search.type = 'search'; search.setAttribute('aria-label', 'Search Extension'); search.className = 'mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring'
      search.value = searchText
      search.addEventListener('input', () => { searchText = search.value; if (active) void bridge.userRaycastEvent({ revision: active.revision, eventId: 'search', kind: 'searchChanged', value: searchText }).catch(error => { feedback.textContent = String(error).slice(0, 512) }) })
      rendered.append(search)
      if (searchFocused) search.focus()
    }
    const list = document.createElement('ul')
    list.className = 'm-0 flex list-none flex-col gap-1 p-0'
    for (const item of items.slice(0, 64)) {
      const row = document.createElement('li')
      row.className = 'flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2'
      const name = document.createElement('span')
      name.className = 'min-w-0 break-words text-sm'
      name.textContent = String(item.props.title ?? '')
      row.append(name)
      const actions: Node[] = []
      collect(item, 'raycast-action', actions)
      for (const action of actions.slice(0, 4)) {
        if (typeof action.props.actionEventId !== 'string') continue
        const id = action.props.actionEventId
        const run = button(String(action.props.title ?? 'Run Action'), id, async () => {
          if (!active) throw new Error('Extension is no longer open')
          await bridge.userRaycastEvent({ revision: active.revision, eventId: id, kind: 'action' })
        })
        run.disabled = false // The parent Open request may still be settling when the ready frame arrives.
        row.append(run)
      }
      list.append(row)
    }
    rendered.append(list)
    if (!items.length) {
      const empty: Node[] = []
      collect(root, 'raycast-empty', empty)
      const hint = document.createElement('p')
      hint.className = 'm-0 text-sm text-muted-foreground'
      hint.textContent = String(empty[0]?.props.title ?? 'No items yet.')
      rendered.append(hint)
    }
    if (items.length > 64) feedback.textContent = `Showing the first 64 of ${items.length} items.`
  }
  const unsubscribe = bridge.onUserRaycastView(update)
  element.addEventListener('keydown', event => { if (event.key !== 'Escape') return; event.preventDefault(); event.stopPropagation(); void bridge.userRaycastClose().finally(onClose) })
  paint()
  void bridge.userRaycastState().then(result => { if (!disposed) { state = result; paint() } }).catch(error => { if (!disposed) { feedback.textContent = String(error).slice(0, 512); feedback.setAttribute('role', 'alert') } })
  return { element, focus: () => close.focus(), dispose: () => { disposed = true; unsubscribe() } }
}
