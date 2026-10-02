import fuzzysort from 'fuzzysort'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { UserRaycastFieldEvent, UserRaycastFieldValue, UserRaycastStatus } from './user-raycast-contract.ts'
import type { UserRaycastMessage } from './user-raycast-manager.ts'

type Node = { type: string; props: Record<string, string | number | boolean | null | readonly string[]>; children: Array<Node | string> }
type Field = { input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; row: HTMLElement; title: HTMLElement; label: HTMLElement; info: HTMLElement; error: HTMLElement; node: Node; sessionId: string; version: number; dirty?: number; focused: number; autoFocused: boolean; selection?: readonly string[]; search?: HTMLInputElement; results?: HTMLElement; searchTimer?: ReturnType<typeof setTimeout>; searchPending?: boolean; searchText?: string }

/** Inert native controls only: extension code and React never enter the launcher renderer. */
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
  let formMode = false
  let actionPending = false
  let fieldSequence = 0
  let queuedFields = 0
  const maxQueuedFields = 32
  let fieldQueue = Promise.resolve()
  const fieldFailures = new Map<string, Error>()
  const fields = new Map<string, Field>()
  const forms = new Map<string, { element: HTMLFormElement; group: HTMLElement; actions: HTMLElement }>()
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
  const selectValue = (field: Field, value: unknown): void => {
    const select = field.input as HTMLSelectElement
    if (select.multiple) {
      field.selection = Array.isArray(value) ? [...value] : []
      for (const option of Array.from(select.options)) option.selected = field.selection.includes(option.value)
    } else select.value = typeof value === 'string' ? value : ''
  }
  const syncChoices = (field: Field): void => {
    const select = field.input as HTMLSelectElement
    const value = field.dirty === undefined ? field.node.props.value : fieldValue(field)
    const options = new Map(Array.from(select.options).map(option => [option.value, option]))
    const groups = new Map(Array.from(select.querySelectorAll('optgroup')).map(group => [group.dataset.groupKey, group]))
    const declared = new Set<string>(), selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
    const query = field.search?.value.trim() ?? '', filtering = select.multiple || field.node.props.filtering !== false
    let matches = 0
    // ponytail: bounded native choices retain declared order; rank menus if measured parity needs it.
    const children = (nodes: Array<Node | string>, path = '', sectionTitle = ''): HTMLElement[] => nodes.flatMap((node, index) => {
      if (typeof node === 'string') return []
      const key = `${path}-${index}`
      if (node.type === 'raycast-section') {
        const group = groups.get(key) ?? document.createElement('optgroup'); group.label = String(node.props.title ?? ''); group.dataset.groupKey = key
        reorder(group, children(node.children, key, group.label)); group.hidden = Array.from(group.children).every(option => (option as HTMLOptionElement).hidden); return [group]
      }
      if (node.type !== 'raycast-form-dropdown-item') return children(node.children, key, sectionTitle)
      const id = String(node.props.value ?? '')
      const option = options.get(id) ?? document.createElement('option'); option.value = id; option.textContent = String(node.props.title ?? id)
      let keywords: string[] = [sectionTitle]
      if (typeof node.props.keywords === 'string') { try { const parsed: unknown = JSON.parse(node.props.keywords); keywords = Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === 'string') : [] } catch { keywords = [] } }
      const matched = !filtering || !query || Boolean(fuzzysort.single(query, [option.textContent, ...(select.multiple ? [] : keywords)].join(' ')))
      if (matched) matches++
      option.hidden = !matched && !(select.multiple && selected.includes(id))
      declared.add(id); return [option]
    })
    const desired = children(field.node.children)
    for (const id of Array.isArray(value) ? value : typeof value === 'string' ? [value] : []) if (!declared.has(id)) {
      const option = options.get(id) ?? document.createElement('option'); option.value = id; option.textContent ||= id || 'No Options'
      option.hidden = Boolean(query) && filtering && !select.multiple; desired.push(option)
    }
    reorder(select, desired); selectValue(field, value)
    if (select.multiple) select.size = Math.min(6, Math.max(2, Array.from(select.options).filter(option => !option.hidden).length))
    if (field.results) { field.results.textContent = field.node.props.isLoading === true ? 'Loading Options…' : query && matches === 0 ? 'No Matching Options' : ''; field.results.hidden = !field.results.textContent }
    field.search?.setAttribute('aria-busy', String(field.node.props.isLoading === true))
  }
  const applyValue = (field: Field): void => {
    if (field.dirty !== undefined) return
    const input = field.input
    if (input.tagName === 'SELECT') { syncChoices(field); return }
    if (field.node.props.fieldKind === 'checkbox') { (input as HTMLInputElement).checked = field.node.props.value === true; return }
    const text = input as HTMLInputElement | HTMLTextAreaElement
    const next = String(field.node.props.value ?? '')
    if (text.value === next) return
    const focused = document.activeElement === text
    const start = text.selectionStart, end = text.selectionEnd, direction = text.selectionDirection
    text.value = next
    if (focused && start !== null && end !== null) text.setSelectionRange(Math.min(start, next.length), Math.min(end, next.length), direction ?? undefined)
  }
  const applyFocusRequests = (): void => {
    if (actionPending) return
    for (const field of fields.values()) {
      const requested = Number(field.node.props.focusRequest ?? 0)
      if (requested <= field.focused && (field.node.props.autoFocus !== true || field.autoFocused)) continue
      field.focused = requested; field.autoFocused = true; field.input.focus()
    }
  }
  const fieldValue = (field: Field): UserRaycastFieldValue => {
    if (field.node.props.fieldKind === 'tagpicker') {
      const selected = Array.from((field.input as HTMLSelectElement).selectedOptions).map(option => option.value)
      const previous = field.selection ?? []
      field.selection = [...previous.filter(value => selected.includes(value)), ...selected.filter(value => !previous.includes(value))]
      return [...field.selection]
    }
    return field.node.props.fieldKind === 'checkbox' ? (field.input as HTMLInputElement).checked : field.input.value
  }
  const enqueueField = (field: Field, kind: UserRaycastFieldEvent['kind']): boolean => {
    if (disposed || actionPending || queuedFields >= maxQueuedFields || !active || active.sessionId !== field.sessionId || fields.get(String(field.node.props.fieldEventId)) !== field) return false
    queuedFields++
    if (queuedFields === maxQueuedFields) { feedback.textContent = 'Waiting for field edits.'; feedback.setAttribute('role', 'status') }
    setFieldAvailability()
    const value = kind === 'fieldSearchChanged' ? field.search?.value ?? '' : fieldValue(field), version = ++field.version
    if (kind === 'fieldChanged') field.dirty = version
    const id = String(field.node.props.fieldEventId), sessionId = field.sessionId
    fieldQueue = fieldQueue.then(async () => {
      if (disposed || active?.sessionId !== sessionId || fields.get(id) !== field) throw new Error('Extension field is no longer open')
      await bridge.userRaycastEvent({ sessionId, revision: active.revision, eventId: id, requestId: `field-request-${++fieldSequence}`, kind, value })
      fieldFailures.delete(`${id}:${kind}`)
      if (kind === 'fieldChanged') {
        if (field.dirty === version) { delete field.dirty; applyValue(field) }
      }
    }).catch(error => {
      if (disposed || active?.sessionId !== sessionId || fields.get(id) !== field) return
      const failure = error instanceof Error ? error : new Error('Field callback failed'); fieldFailures.set(`${id}:${kind}`, failure)
      feedback.textContent = failure.message.slice(0, 512); feedback.setAttribute('role', 'alert')
    }).finally(() => {
      if (disposed || active?.sessionId !== sessionId) return
      queuedFields--; setFieldAvailability()
      for (const current of fields.values()) if (current.searchPending && !current.searchTimer) flushSearch(current)
      if (queuedFields === 0 && feedback.textContent === 'Waiting for field edits.') feedback.textContent = 'Fields Updated'
    })
    return true
  }
  const flushSearch = (field: Field): void => {
    clearTimeout(field.searchTimer); delete field.searchTimer
    if (field.searchPending && enqueueField(field, 'fieldSearchChanged')) delete field.searchPending
  }
  const retireField = (field: Field): void => {
    clearTimeout(field.searchTimer)
    const id = String(field.node.props.fieldEventId); fields.delete(id)
    for (const key of fieldFailures.keys()) if (key.slice(0, key.lastIndexOf(':')) === id) fieldFailures.delete(key)
  }
  const setFieldAvailability = (): void => {
    for (const field of fields.values()) {
      field.input.disabled = actionPending || queuedFields >= maxQueuedFields
      if (field.search) field.search.disabled = field.input.disabled
      field.row.toggleAttribute('data-disabled', field.input.disabled)
    }
  }
  const setActionPending = (pending: boolean): void => {
    actionPending = pending
    setFieldAvailability()
    for (const form of forms.values()) for (const control of Array.from(form.actions.querySelectorAll<HTMLButtonElement>('button'))) control.disabled = pending
  }
  const runAction = async (id: string, sessionId: string): Promise<void> => {
    for (const field of fields.values()) flushSearch(field)
    let pending: Promise<void>
    do { pending = fieldQueue; await pending } while (pending !== fieldQueue)
    if (fieldFailures.size) throw fieldFailures.values().next().value
    if (disposed || active?.sessionId !== sessionId) throw new Error('Extension is no longer open')
    setActionPending(true)
    try { await bridge.userRaycastEvent({ sessionId, revision: active.revision, eventId: id, kind: 'action' }) }
    catch (error) { setActionPending(false); throw error }
  }
  const reorder = (parent: HTMLElement, desired: HTMLElement[]): void => {
    desired.forEach((child, index) => { if (parent.children[index] !== child) parent.insertBefore(child, parent.children[index] ?? null) })
    for (const child of Array.from(parent.children)) if (!desired.includes(child as HTMLElement)) child.remove()
  }
  const renderForms = (nodes: Node[]): void => {
    if (!active) return
    if (!formMode) { rendered.replaceChildren(); formMode = true }
    const sessionId = active.sessionId, liveFields = new Set<string>(), liveForms = new Set<string>()
    for (const [index, form] of nodes.entries()) {
      const formId = String(form.props.formId ?? `form-${index}`)
      liveForms.add(formId)
      let current = forms.get(formId)
      if (!current) {
        const shell = document.createElement('form'), group = document.createElement('div'), actions = document.createElement('div')
        shell.className = 'flex min-w-0 flex-col gap-4'; shell.setAttribute('aria-label', 'Extension Form')
        group.className = 'flex min-w-0 flex-col gap-3'; group.dataset.slot = 'field-group'
        actions.className = 'flex flex-wrap gap-2 border-t border-border pt-3'
        shell.append(group, actions); current = { element: shell, group, actions }; forms.set(formId, current)
        shell.addEventListener('submit', event => { event.preventDefault(); current!.actions.querySelector<HTMLButtonElement>('button')?.click() })
        shell.addEventListener('keydown', event => {
          if (!event.isComposing && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); current!.actions.querySelector<HTMLButtonElement>('button')?.click() }
        })
      }
      const projected: Node[] = []; collect(form, 'raycast-text-field', projected)
      const rows: HTMLElement[] = []
      for (const node of projected) {
        const id = node.props.fieldEventId
        if (typeof id !== 'string') continue
        liveFields.add(id)
        let field = fields.get(id)
        if (field && field.node.props.fieldKind !== node.props.fieldKind) { field.row.remove(); retireField(field); field = undefined }
        if (!field) {
          const row = document.createElement('div'), title = document.createElement('span'), label = document.createElement('label'), info = document.createElement('p'), error = document.createElement('p')
          const input = node.props.fieldKind === 'textarea' ? document.createElement('textarea') : node.props.fieldKind === 'dropdown' || node.props.fieldKind === 'tagpicker' ? document.createElement('select') : document.createElement('input')
          row.className = 'flex min-w-0 flex-col gap-1'; row.dataset.slot = 'field'
          title.className = 'min-w-0 break-words text-sm font-medium'; label.className = node.props.fieldKind === 'checkbox' ? 'min-w-0 break-words text-sm' : 'min-w-0 break-words text-sm font-medium'
          input.id = `user-${sessionId}-${id}`; label.htmlFor = input.id
          if (input.tagName === 'INPUT') (input as HTMLInputElement).type = node.props.fieldKind === 'checkbox' ? 'checkbox' : node.props.fieldKind === 'password' ? 'password' : 'text'
          input.className = node.props.fieldKind === 'checkbox' ? 'm-0 box-border size-4 shrink-0 p-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring' : 'box-border w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 font-[family-name:inherit] text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'
          if (input.tagName === 'SELECT') (input as HTMLSelectElement).multiple = node.props.fieldKind === 'tagpicker'
          else (input as HTMLInputElement | HTMLTextAreaElement).maxLength = 16384
          info.className = 'm-0 min-w-0 break-words text-xs text-muted-foreground'; error.className = 'm-0 min-w-0 break-words text-sm text-destructive'
          info.id = `${input.id}-info`; error.id = `${input.id}-error`; error.setAttribute('role', 'alert')
          if (node.props.fieldKind === 'checkbox') {
            const line = document.createElement('div'); line.className = 'flex min-w-0 items-center gap-2'
            line.append(input, label); row.append(title, line, info, error)
          } else row.append(title, label, input, info, error)
          field = { input, row, title, label, info, error, node, sessionId, version: 0, focused: 0, autoFocused: false }; fields.set(id, field)
          const owned = field
          input.addEventListener(input.tagName === 'SELECT' || node.props.fieldKind === 'checkbox' ? 'change' : 'input', () => enqueueField(owned, 'fieldChanged'))
          row.addEventListener('focusin', event => { if (!row.contains(event.relatedTarget as globalThis.Node | null)) enqueueField(owned, 'fieldFocused') })
          row.addEventListener('focusout', event => { if (!row.contains(event.relatedTarget as globalThis.Node | null)) enqueueField(owned, 'fieldBlurred') })
          if (input.tagName === 'SELECT') {
            const search = document.createElement('input'), results = document.createElement('p')
            search.type = 'search'; search.maxLength = 16384; search.className = input.className
            results.id = `${input.id}-results`; results.className = 'm-0 min-w-0 break-words text-xs text-muted-foreground'; results.setAttribute('role', 'status'); results.setAttribute('aria-live', 'polite')
            search.setAttribute('aria-describedby', results.id); row.insertBefore(search, input); row.insertBefore(results, info)
            owned.search = search; owned.results = results
            const changed = (): void => {
              if (disposed || active?.sessionId !== owned.sessionId || fields.get(id) !== owned || search.disabled || (owned.searchText ?? '') === search.value) return
              owned.searchText = search.value; syncChoices(owned)
              if (owned.node.props.searchable === true && owned.node.props.fieldKind === 'dropdown') {
                clearTimeout(owned.searchTimer); owned.searchPending = true
                if (owned.node.props.throttle === true) owned.searchTimer = setTimeout(() => flushSearch(owned), 300)
                else flushSearch(owned)
              }
            }
            search.addEventListener('input', event => { if (!event.isComposing) changed() })
            search.addEventListener('compositionend', changed)
            search.addEventListener('keydown', event => {
              if (event.isComposing) return
              if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) event.preventDefault()
              if (event.key === 'Escape' && search.value) { event.preventDefault(); event.stopPropagation(); search.value = ''; changed() }
              if (event.key === 'ArrowDown') { event.preventDefault(); input.focus() }
            })
          }
        }
        field.node = node
        field.title.textContent = node.props.fieldKind === 'checkbox' ? String(node.props.title ?? '') : ''; field.title.hidden = !field.title.textContent
        field.label.textContent = String(node.props.fieldKind === 'checkbox' ? node.props.label ?? node.props.title ?? node.props.id : node.props.title ?? node.props.id ?? 'Field')
        field.input.setAttribute('aria-label', field.label.textContent)
        if (field.search) {
          field.search.setAttribute('aria-label', `Search ${field.label.textContent}`); field.search.placeholder = String(node.props.placeholder ?? 'Search…')
          field.search.disabled = actionPending || queuedFields >= maxQueuedFields
        }
        if (field.input.tagName === 'SELECT') syncChoices(field)
        else (field.input as HTMLInputElement | HTMLTextAreaElement).placeholder = String(node.props.placeholder ?? '')
        field.input.disabled = actionPending || queuedFields >= maxQueuedFields
        field.row.toggleAttribute('data-disabled', field.input.disabled)
        field.info.textContent = String(node.props.info ?? (node.props.fieldKind === 'tagpicker' ? (field.input as HTMLSelectElement).options.length === 0 ? 'No tags are available.' : 'Hold Command or Control to select more than one tag.' : '')); field.info.hidden = !field.info.textContent
        field.error.textContent = String(node.props.error ?? ''); field.error.hidden = !field.error.textContent
        field.input.setAttribute('aria-invalid', field.error.textContent ? 'true' : 'false')
        field.row.toggleAttribute('data-invalid', Boolean(field.error.textContent))
        const descriptions = [field.info, field.error].filter(item => !item.hidden).map(item => item.id)
        if (descriptions.length) field.input.setAttribute('aria-describedby', descriptions.join(' ')); else field.input.removeAttribute('aria-describedby')
        applyValue(field)
        rows.push(field.row)
      }
      reorder(current.group, rows)
      const actions: Node[] = []; collect(form, 'raycast-action', actions)
      current.actions.replaceChildren()
      for (const action of actions.slice(0, 16)) if (typeof action.props.actionEventId === 'string') {
        const id = action.props.actionEventId
        const control = button(String(action.props.title ?? 'Run Action'), id, () => runAction(id, sessionId))
        control.disabled = actionPending; current.actions.append(control)
      }
    }
    for (const [id, field] of fields) if (!liveFields.has(id)) retireField(field)
    for (const [id] of forms) if (!liveForms.has(id)) forms.delete(id)
    reorder(rendered, [...liveForms].map(id => forms.get(id)!.element))
    applyFocusRequests()
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
    if (message.type !== 'ready' && active && message.sessionId !== active.sessionId) return
    if (message.type === 'error') { setActionPending(false); active = undefined; feedback.textContent = message.message ?? 'Extension failed'; feedback.setAttribute('role', 'alert'); return }
    if (message.type === 'outcome') { setActionPending(false); applyFocusRequests(); feedback.textContent = message.succeeded ? message.eventId === 'run' ? 'Command Complete' : 'Action Complete' : message.message ?? 'Action failed'; feedback.setAttribute('role', message.succeeded ? 'status' : 'alert'); return }
    if (message.type === 'toast') { feedback.textContent = message.title ?? ''; return }
    if (!message.root || typeof message.root !== 'object') return
    if (message.type === 'ready') {
      if (active?.sessionId !== message.sessionId) { for (const field of fields.values()) retireField(field); forms.clear(); formMode = false; actionPending = false; queuedFields = 0; fieldQueue = Promise.resolve(); rendered.replaceChildren() }
      active = { extensionId: message.extensionId, sessionId: message.sessionId, revision: message.revision }
    }
    else if (!active || active.extensionId !== message.extensionId || active.sessionId !== message.sessionId || message.revision <= active.revision) return
    else active.revision = message.revision
    if (state.mode === 'menu-bar') { rendered.replaceChildren(); feedback.textContent = 'Menu Bar Active'; return }
    if (state.mode === 'no-view') { rendered.replaceChildren(); feedback.textContent = 'Running Command'; return }
    const root = message.root as Node
    const projectedForms: Node[] = []; collect(root, 'raycast-form', projectedForms)
    if (projectedForms.length) { renderForms(projectedForms); return }
    if (formMode) { for (const field of fields.values()) retireField(field); forms.clear(); formMode = false }
    const items: Node[] = []
    collect(root, 'raycast-list-item', items)
    const searchFocused = document.activeElement === rendered.querySelector('input[aria-label="Search Extension"]')
    rendered.replaceChildren()
    if (root.props.searchable === true) {
      const search = document.createElement('input')
      search.type = 'search'; search.setAttribute('aria-label', 'Search Extension'); search.className = 'mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring'
      search.value = searchText
      const sessionId = active!.sessionId
      search.addEventListener('input', () => { searchText = search.value; if (active?.sessionId === sessionId) void bridge.userRaycastEvent({ sessionId, revision: active.revision, eventId: 'search', kind: 'searchChanged', value: searchText }).catch(error => { feedback.textContent = String(error).slice(0, 512) }) })
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
        const sessionId = active!.sessionId
        const run = button(String(action.props.title ?? 'Run Action'), id, () => runAction(id, sessionId))
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
  return { element, focus: () => close.focus(), dispose: () => { disposed = true; for (const field of fields.values()) retireField(field); unsubscribe() } }
}
