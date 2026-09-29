import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { UserRaycastStatus } from './user-raycast-contract.ts'
import type { UserRaycastMessage } from './user-raycast-manager.ts'

type Node = { type: string; props: Record<string, string | number | boolean | null>; children: Array<Node | string> }

/** Inert text/buttons only: extension code and React never enter the launcher renderer. */
export function createUserRaycastView(document: Document, bridge: LauncherPreloadBridge, onClose: () => void) {
  const element = document.createElement('section')
  element.className = 'flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 text-foreground'
  element.setAttribute('aria-label', 'Local Raycast Extensions')
  element.dataset.userRaycast = 'true'
  const title = document.createElement('h2')
  title.className = 'm-0 text-base font-semibold'
  title.textContent = 'Local Raycast Extensions'
  const subtitle = document.createElement('p')
  subtitle.className = 'm-0 text-sm text-muted-foreground'
  subtitle.textContent = 'Choose an already-built extension folder. Installation does not prove a command works.'
  const warning = document.createElement('p')
  warning.className = 'm-0 text-sm text-warning'
  warning.textContent = 'Approved extensions run as local programs and can access files, the network, and processes using your account. A separate process is not a security sandbox.'
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
  element.append(close, title, subtitle, warning, summary, controls, feedback, rendered)
  let state: UserRaycastStatus = { digest: '', enabled: false, hasPrevious: false, installed: false }
  let busy = false
  let reviewed = false
  let removing = false
  let active: { extensionId: string; sessionId: string; revision: number } | undefined
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
    try { await action(); if (!disposed) feedback.textContent = '' }
    catch (error) { if (!disposed) { feedback.textContent = error instanceof Error ? error.message.slice(0, 512) : 'Extension operation failed'; feedback.setAttribute('role', 'alert') } }
    finally { busy = false; if (!disposed) paint() }
  }
  const paint = (): void => {
    controls.replaceChildren()
    const candidate = state.candidate
    summary.textContent = candidate ? `${candidate.title} · ${candidate.extensionId} / ${candidate.command} · Version: ${candidate.version ?? 'not specified'} · License: ${candidate.license ?? 'not specified'} · Declared source: ${candidate.source ?? 'chosen local folder'} · SHA-256: ${candidate.digest}. These declarations and compatibility have not been verified by TockTeam.` : state.installed ? `Installed digest: ${state.digest}` : 'No local extension selected.'
    controls.append(button('Choose Built Folder', 'choose', async () => { const chosen = await bridge.userRaycastChoose(); if (chosen) { state = await bridge.userRaycastState(); reviewed = false; removing = false } }))
    if (candidate && (!state.installed || candidate.digest !== state.digest)) {
      const label = document.createElement('label')
      label.className = 'flex items-start gap-2 text-sm'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'; checkbox.checked = reviewed; checkbox.className = 'mt-1 accent-primary'
      checkbox.addEventListener('change', () => { reviewed = checkbox.checked; paint() })
      label.append(checkbox, document.createTextNode('I reviewed the selected source and accept account-level access.'))
      controls.append(label, button('Review and Install', 'approve', async () => { state = await bridge.userRaycastApprove(candidate.digest); reviewed = false }, !reviewed))
    }
    if (!state.installed) return
    if (state.enabled) {
      controls.append(button('Open Command', 'open', async () => { active = undefined; await bridge.userRaycastOpen() }))
      controls.append(button('Disable', 'disable', async () => { await bridge.userRaycastClose(); active = undefined; rendered.replaceChildren(); state = await bridge.userRaycastMutate('disable') }))
    } else controls.append(button('Enable', 'enable', async () => { state = await bridge.userRaycastMutate('enable') }))
    if (state.hasPrevious) controls.append(button('Restore Previous Version', 'recover', async () => { await bridge.userRaycastClose(); active = undefined; rendered.replaceChildren(); state = await bridge.userRaycastMutate('recover') }))
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
    if (message.type === 'error') { feedback.textContent = message.message ?? 'Extension failed'; feedback.setAttribute('role', 'alert'); return }
    if (message.type === 'outcome') { feedback.textContent = message.succeeded ? 'Action Complete' : message.message ?? 'Action failed'; feedback.setAttribute('role', message.succeeded ? 'status' : 'alert'); return }
    if (message.type === 'toast') { feedback.textContent = message.title ?? ''; return }
    if (!message.root || typeof message.root !== 'object') return
    if (message.type === 'ready') active = { extensionId: message.extensionId, sessionId: message.sessionId, revision: message.revision }
    else if (!active || active.extensionId !== message.extensionId || active.sessionId !== message.sessionId || message.revision <= active.revision) return
    else active.revision = message.revision
    const root = message.root as Node
    const items: Node[] = []
    collect(root, 'raycast-list-item', items)
    rendered.replaceChildren()
    if (root.props.searchable === true) {
      const search = document.createElement('input')
      search.type = 'search'; search.setAttribute('aria-label', 'Search Extension'); search.className = 'mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring'
      search.addEventListener('input', () => { if (active) void bridge.userRaycastEvent({ revision: active.revision, eventId: 'search', kind: 'searchChanged', value: search.value }).catch(error => { feedback.textContent = String(error).slice(0, 512) }) })
      rendered.append(search)
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
    if (items.length > 64) feedback.textContent = `Showing the first 64 of ${items.length} items.`
    else if (!items.length) feedback.textContent = 'No items yet.'
  }
  const unsubscribe = bridge.onUserRaycastView(update)
  element.addEventListener('keydown', event => { if (event.key !== 'Escape') return; event.preventDefault(); event.stopPropagation(); void bridge.userRaycastClose().finally(onClose) })
  paint()
  void bridge.userRaycastState().then(result => { if (!disposed) { state = result; paint() } }).catch(error => { if (!disposed) { feedback.textContent = String(error).slice(0, 512); feedback.setAttribute('role', 'alert') } })
  return { element, focus: () => close.focus(), dispose: () => { disposed = true; unsubscribe() } }
}
