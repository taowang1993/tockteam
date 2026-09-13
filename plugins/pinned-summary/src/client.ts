/** Layout-reserving pinned summary derived from the active DSH session. */

import { createElement as createIcon, X } from 'lucide'
import type { LocaleService, Translate } from '../../shared/i18n.ts'
import { mountChromeSurface } from '../../shared/chrome-layer.ts'
import { localeTag } from '../../shared/i18n.ts'
import {
  PINNED_SUMMARY_MESSAGES,
  type PinnedSummaryMessage,
} from './i18n.ts'

interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export interface SessionListSummary {
  id: string
  displayTitle: string
  cwd?: string
  running: boolean
  pendingInteraction?: unknown
  completed?: boolean
  blank: boolean
  updatedAt: number
}

interface SessionListState {
  current?: string
  byId: Record<string, SessionListSummary>
}

interface SessionBinding {
  session: ObservableSnapshot<unknown>
}

interface SessionsService {
  list: ObservableSnapshot<SessionListState>
  binding(id: string): SessionBinding | undefined
}

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
  reflect: {
    provide(name: string, value: unknown, options?: unknown): () => Promise<void> | void
  }
}

/** Public toggle face consumed by the unified desktop client. */
export interface PinnedSummary {
  isOpen(): boolean
  setOpen(open: boolean): void
  subscribe(listener: () => void): () => void
  toggle(): void
}

export const inject = ['locale', 'sessions']

const OPEN_KEY = 'tockteam-desktop.pinned-summary.open'
export const PINNED_SUMMARY_PANEL_ID = 'tockteam-pinned-summary'
const SUMMARY_CONTENT_ID = 'tockteam-pinned-summary-content'
const SUMMARY_HEADING_ID = 'tockteam-pinned-summary-heading'

/** Maximum text shown before the user explicitly expands the pane. */
export const SUMMARY_PREVIEW_LIMIT = 480

export type SummaryKind = 'context' | 'assistant'

export interface SummaryRecord {
  kind: SummaryKind
  text: string
}

export type SummaryState =
  | 'no-session'
  | 'loading'
  | 'blank'
  | 'running'
  | 'waiting'
  | 'ready'
  | 'unavailable'
  | 'error'

export interface TruncatedSummary {
  text: string
  truncated: boolean
}

const SUMMARY_ROOT_CLASSES = ['box-border', 'pr-[312px]', 'max-[900px]:pr-0'] as const

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    // Preferences are best-effort in restricted browser storage modes.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function conversationNodes(snapshot: unknown): readonly unknown[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.nodes)) return []
  return snapshot.nodes
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Select the latest non-empty compaction summary, then assistant text blocks. */
export function latestSummary(nodes: readonly unknown[]): SummaryRecord | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (!isRecord(node) || node.kind !== 'compaction') continue
    const text = readString(node.summary)
    if (text !== undefined) return { kind: 'context', text }
  }
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (!isRecord(node) || node.kind !== 'assistant' || !Array.isArray(node.blocks)) continue
    const text = node.blocks.flatMap((block) => {
      return isRecord(block) && block.kind === 'text' && typeof block.text === 'string' ? [block.text] : []
    }).join('\n').trim()
    if (text !== '') return { kind: 'assistant', text: text.slice(0, 5000) }
  }
  return undefined
}

/** Return a stable bounded preview while retaining the full text for copying. */
export function truncateSummary(
  text: string,
  limit = SUMMARY_PREVIEW_LIMIT,
): TruncatedSummary {
  const normalized = text.trim()
  const characters = [...normalized]
  if (!Number.isFinite(limit) || limit < 1 || characters.length <= Math.floor(limit)) {
    return { text: normalized, truncated: false }
  }
  const boundary = Math.max(1, Math.floor(limit))
  if (boundary === 1) return { text: '…', truncated: true }
  return {
    text: `${characters.slice(0, boundary - 1).join('').trimEnd()}…`,
    truncated: true,
  }
}

function snapshotHasPending(snapshot: unknown): boolean {
  return isRecord(snapshot) && [snapshot.pending, snapshot.pendingSubmissions, snapshot.queue]
    .some(value => Array.isArray(value) && value.length > 0)
}

function snapshotOpenState(snapshot: unknown): string | undefined {
  return isRecord(snapshot) && typeof snapshot.openState === 'string' ? snapshot.openState : undefined
}

function snapshotHasError(snapshot: unknown): boolean {
  if (!isRecord(snapshot)) return false
  if (snapshot.openError !== null && snapshot.openError !== undefined) return true
  if (snapshot.promptError !== null && snapshot.promptError !== undefined) return true
  return readString(snapshot.lastAgentError) !== undefined
}

/** Resolve the visible lifecycle state from the DSH session projection. */
export function summaryState(
  session: SessionListSummary | undefined,
  snapshot: unknown,
  derived: SummaryRecord | undefined = snapshot === undefined
    ? undefined
    : latestSummary(conversationNodes(snapshot)),
): SummaryState {
  if (session === undefined) return 'no-session'
  if (snapshot === undefined) return 'loading'
  const openState = snapshotOpenState(snapshot)
  if (openState === 'loading' || openState === 'cold') return 'loading'
  if (openState === 'error' || snapshotHasError(snapshot)) return 'error'
  if (session.blank || (isRecord(snapshot) && snapshot.blank === true)) return 'blank'
  if (session.pendingInteraction != null || snapshotHasPending(snapshot)) return 'waiting'
  if (session.running || (isRecord(snapshot) && snapshot.running === true)) return 'running'
  if (derived !== undefined) return 'ready'
  return 'unavailable'
}

function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.username !== '' || url.password !== '') return undefined
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/** Render the small audited Markdown subset without interpreting raw HTML. */
function appendInline(parent: HTMLElement, input: string): void {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^\s)]+\))/g
  let cursor = 0
  for (const match of input.matchAll(pattern)) {
    const token = match[0]
    const index = match.index ?? cursor
    if (index > cursor) parent.append(document.createTextNode(input.slice(cursor, index)))
    if (token.startsWith('`')) {
      parent.append(makeElement('code', token.slice(1, -1)))
    } else if (token.startsWith('**') || token.startsWith('__')) {
      parent.append(makeElement('strong', token.slice(2, -2)))
    } else if (token.startsWith('*') || token.startsWith('_')) {
      parent.append(makeElement('em', token.slice(1, -1)))
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(token)
      const url = linkMatch?.[2] === undefined ? undefined : safeHttpUrl(linkMatch[2])
      if (linkMatch !== null && url !== undefined) {
        const link = makeElement('a', linkMatch[1])
        link.href = url
        link.target = '_blank'
        link.rel = 'noreferrer noopener'
        parent.append(link)
      } else {
        parent.append(document.createTextNode(token))
      }
    }
    cursor = index + token.length
  }
  if (cursor < input.length) parent.append(document.createTextNode(input.slice(cursor)))
}

/** Render bounded summary Markdown with textContent-backed dynamic nodes. */
export function appendSummaryMarkdown(parent: HTMLElement, markdown: string): void {
  const lines = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  let index = 0
  while (index < lines.length) {
    const line = lines[index]!
    if (line.trim() === '') {
      index += 1
      continue
    }
    const fence = /^\s*```([^`]*)\s*$/.exec(line)
    if (fence !== null) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index]!)) {
        codeLines.push(lines[index]!)
        index += 1
      }
      if (index < lines.length) index += 1
      const pre = makeElement('pre')
      const code = makeElement('code', codeLines.join('\n'))
      const language = fence[1]?.trim()
      if (language !== undefined && language !== '') code.dataset.language = language
      pre.append(code)
      parent.append(pre)
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading !== null) {
      const level = Math.min(6, heading[1]!.length + 2) as 3 | 4 | 5 | 6
      const title = makeElement(`h${level}` as 'h3' | 'h4' | 'h5' | 'h6')
      appendInline(title, heading[2]!)
      parent.append(title)
      index += 1
      continue
    }
    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index]!)) {
        quoteLines.push(lines[index]!.replace(/^\s*>\s?/, ''))
        index += 1
      }
      const quote = makeElement('blockquote')
      appendInline(quote, quoteLines.join('\n'))
      parent.append(quote)
      continue
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (unordered !== null || ordered !== null) {
      const list = makeElement(ordered !== null ? 'ol' : 'ul')
      while (index < lines.length) {
        const item = (ordered !== null
          ? /^\s*\d+[.)]\s+(.+)$/
          : /^\s*[-*+]\s+(.+)$/).exec(lines[index]!)
        if (item === null) break
        const li = makeElement('li')
        appendInline(li, item[1]!)
        list.append(li)
        index += 1
      }
      parent.append(list)
      continue
    }
    const paragraphLines: string[] = []
    while (index < lines.length && lines[index]!.trim() !== '') {
      const candidate = lines[index]!
      if (paragraphLines.length > 0 && (
        /^\s*```/.test(candidate)
        || /^(#{1,6})\s+/.test(candidate)
        || /^\s*>/.test(candidate)
        || /^\s*[-*+]\s+/.test(candidate)
        || /^\s*\d+[.)]\s+/.test(candidate)
      )) break
      paragraphLines.push(candidate)
      index += 1
    }
    const paragraph = makeElement('p')
    appendInline(paragraph, paragraphLines.join('\n'))
    parent.append(paragraph)
  }
}

class PinnedSummaryService implements PinnedSummary {
  readonly #sessions: SessionsService
  readonly #locale: LocaleService
  readonly #t: Translate<PinnedSummaryMessage>
  readonly #listeners = new Set<() => void>()
  #open = readOpen()
  #expanded = false
  #panel: HTMLElement | undefined
  #unmountChrome: (() => void) | undefined
  #title: HTMLElement | undefined
  #headerTitle: HTMLElement | undefined
  #close: HTMLButtonElement | undefined
  #status: HTMLElement | undefined
  #meta: HTMLElement | undefined
  #source: HTMLElement | undefined
  #content: HTMLElement | undefined
  #actions: HTMLElement | undefined
  #copy: HTMLButtonElement | undefined
  #expand: HTMLButtonElement | undefined
  #feedback: HTMLElement | undefined
  #currentId: string | undefined
  #currentSession: ObservableSnapshot<unknown> | undefined
  #currentText = ''
  #returnFocus: HTMLElement | null = null
  #unsubscribeList: (() => void) | undefined
  #unsubscribeSession: (() => void) | undefined
  #unsubscribeLocale: (() => void) | undefined
  readonly #handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this.#open || this.#panel === undefined || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    this.setOpen(false)
  }

  constructor(
    sessions: SessionsService,
    locale: LocaleService,
    t: Translate<PinnedSummaryMessage>,
  ) {
    this.#sessions = sessions
    this.#locale = locale
    this.#t = t
  }

  mount(): void {
    const panel = document.createElement('aside')
    panel.id = PINNED_SUMMARY_PANEL_ID
    panel.dataset.tockteamPinnedSummary = 'true'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'false')
    panel.setAttribute('aria-hidden', 'true')
    panel.setAttribute('aria-labelledby', SUMMARY_HEADING_ID)
    panel.className = 'absolute right-3 top-[calc(var(--tockteam-titlebar-height,40px)+12px)] z-[9000] h-[calc((100%-var(--tockteam-titlebar-height,40px)-24px)/2)] w-72 box-border translate-x-[calc(100%+24px)] overflow-hidden invisible pointer-events-none rounded-[22px] border border-[var(--dsw-alias-border-l1)] bg-background text-foreground opacity-0 shadow-[0_14px_42px_rgba(0,0,0,0.09)] transition-[opacity,transform,visibility] [transition-duration:140ms,180ms,0s] [transition-timing-function:var(--ds-ease-in-out,ease),var(--ds-ease-in-out,ease),linear] [transition-delay:0s,0s,180ms] [-webkit-app-region:no-drag] data-[open=true]:visible data-[open=true]:pointer-events-auto data-[open=true]:translate-x-0 data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] max-[900px]:shadow-[-20px_0_48px_rgba(0,0,0,0.14)] motion-reduce:transition-none'

    const header = document.createElement('header')
    header.dataset.tockteamSummaryHeader = ''
    header.className = 'flex h-12 box-border items-center border-b border-border pr-2.5 pl-[15px] text-[13px] font-semibold'
    const headerTitle = document.createElement('span')
    headerTitle.id = SUMMARY_HEADING_ID
    const close = document.createElement('button')
    close.dataset.tockteamSummaryClose = ''
    close.className = 'ml-auto grid size-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-0 text-muted-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring [&_svg]:size-4'
    close.type = 'button'
    header.append(headerTitle, close)
    const closeIcon = createIcon(X)
    closeIcon.setAttribute('aria-hidden', 'true')
    closeIcon.setAttribute('class', 'lucide lucide-x')
    close.append(closeIcon)

    const body = document.createElement('div')
    body.dataset.tockteamSummaryBody = ''
    body.className = 'h-[calc(100%-48px)] box-border overflow-auto px-[15px] pt-3.5 pb-4'
    const title = document.createElement('h2')
    title.dataset.tockteamSummaryTitle = ''
    title.className = 'm-0 text-sm leading-[1.35]'
    const meta = document.createElement('div')
    meta.dataset.tockteamSummaryMeta = ''
    meta.className = 'mt-1.5 mb-3 text-[11px] leading-[1.55] text-subtle-foreground [overflow-wrap:anywhere]'
    const status = document.createElement('span')
    status.dataset.tockteamSummaryStatus = ''
    status.className = 'mb-2.5 inline-flex rounded-full bg-[var(--dsw-alias-interactive-bg-hover)] px-2 py-[3px] text-[10px] font-semibold text-muted-foreground'
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    status.setAttribute('aria-atomic', 'true')
    const source = document.createElement('span')
    source.dataset.tockteamSummarySource = ''
    source.className = 'mb-2.5 inline-flex rounded-full bg-[var(--dsw-alias-interactive-bg-hover)] px-2 py-[3px] text-[10px] font-semibold text-muted-foreground'
    const content = document.createElement('article')
    content.dataset.tockteamSummaryText = ''
    content.dataset.tockteamSummaryContent = ''
    content.id = SUMMARY_CONTENT_ID
    content.className = 'm-0 text-xs leading-[1.55] text-muted-foreground [overflow-wrap:anywhere] [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2 [&_code]:rounded [&_code]:bg-[var(--dsw-alias-interactive-bg-hover)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-border [&_pre]:bg-code-block [&_pre]:p-2 [&_pre]:whitespace-pre [&_ul]:my-2 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:pl-5'
    const actions = document.createElement('div')
    actions.dataset.tockteamSummaryActions = ''
    actions.className = 'mt-3 flex flex-wrap gap-1 border-t border-border pt-2.5'
    const actionClass = 'min-h-7 cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-[11px] text-muted-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50'
    const copy = document.createElement('button')
    copy.dataset.tockteamSummaryCopy = ''
    copy.className = actionClass
    copy.type = 'button'
    const expand = document.createElement('button')
    expand.dataset.tockteamSummaryExpand = ''
    expand.className = actionClass
    expand.type = 'button'
    expand.setAttribute('aria-controls', SUMMARY_CONTENT_ID)
    expand.setAttribute('aria-expanded', 'false')
    actions.append(copy, expand)
    const feedback = document.createElement('p')
    feedback.dataset.tockteamSummaryFeedback = ''
    feedback.className = 'm-0 mt-2 min-h-[18px] text-[11px] text-subtle-foreground'
    feedback.setAttribute('role', 'status')
    feedback.setAttribute('aria-live', 'polite')
    feedback.setAttribute('aria-atomic', 'true')
    feedback.hidden = true
    body.append(title, meta, status, source, content, actions, feedback)
    panel.append(header, body)

    this.#unmountChrome = mountChromeSurface(panel)
    this.#panel = panel
    this.#title = title
    this.#headerTitle = headerTitle
    this.#close = close
    this.#status = status
    this.#meta = meta
    this.#source = source
    this.#content = content
    this.#actions = actions
    this.#copy = copy
    this.#expand = expand
    this.#feedback = feedback
    close.addEventListener('click', () => { this.setOpen(false) })
    copy.addEventListener('click', () => { void this.copySummary() })
    expand.addEventListener('click', () => {
      this.#expanded = !this.#expanded
      this.render()
    })
    document.addEventListener('keydown', this.#handleDocumentKeyDown, true)
    this.#unsubscribeList = this.#sessions.list.subscribe(() => { this.bindAndRender() })
    this.#unsubscribeLocale = this.#locale.subscribe(() => {
      this.renderChrome()
      this.render()
    })
    this.renderChrome()
    this.applyState()
    this.bindAndRender()
  }

  dispose(): void {
    const active = document.activeElement
    if (this.#open && active instanceof HTMLElement && this.#panel?.contains(active)) {
      this.#returnFocus?.focus()
    }
    this.#unsubscribeList?.()
    this.#unsubscribeSession?.()
    this.#unsubscribeLocale?.()
    this.#unsubscribeList = undefined
    this.#unsubscribeSession = undefined
    this.#unsubscribeLocale = undefined
    document.removeEventListener('keydown', this.#handleDocumentKeyDown, true)
    this.#unmountChrome?.()
    this.#unmountChrome = undefined
    this.#panel = undefined
    this.#title = undefined
    this.#headerTitle = undefined
    this.#close = undefined
    this.#status = undefined
    this.#meta = undefined
    this.#source = undefined
    this.#content = undefined
    this.#actions = undefined
    this.#copy = undefined
    this.#expand = undefined
    this.#feedback = undefined
    this.#returnFocus = null
    this.#currentId = undefined
    this.#currentSession = undefined
    this.#currentText = ''
    this.#expanded = false
    this.#listeners.clear()
    delete document.documentElement.dataset.tockteamSummaryPinned
    if (document.documentElement.dataset.tockteamRightPanelOwner === 'pinned-summary') {
      delete document.documentElement.dataset.tockteamRightPanelOwner
      document.getElementById('root')?.classList.remove(...SUMMARY_ROOT_CLASSES)
    }
  }

  isOpen(): boolean {
    return this.#open
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  toggle(): void {
    this.setOpen(!this.#open)
  }

  setOpen(open: boolean): void {
    if (this.#open === open) return
    if (open) {
      const active = document.activeElement
      this.#returnFocus = active instanceof HTMLElement && !this.#panel?.contains(active)
        ? active
        : null
    } else {
      this.setFeedback()
      const returnFocus = this.#returnFocus
      const fallback = document.querySelector<HTMLElement>('[data-tockteam-summary-toggle]')
      const active = document.activeElement
      const ownsFocus = active instanceof HTMLElement
        && (this.#panel?.contains(active) === true
          || active.closest('[data-tockteam-summary-toggle]') !== null)
      this.#returnFocus = null
      if (ownsFocus) {
        const canRestore = returnFocus?.isConnected === true
          && returnFocus.closest('[aria-hidden="true"], [inert]') === null
        if (canRestore) returnFocus.focus()
        else fallback?.focus()
      }
    }
    this.#open = open
    writeOpen(open)
    this.applyState()
    if (open) this.focusPanel()
    for (const listener of this.#listeners) listener()
  }

  private focusPanel(): void {
    const focus = (): void => {
      if (this.#open && this.#close?.isConnected !== false) this.#close?.focus()
    }
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(focus)
    else queueMicrotask(focus)
  }

  private applyState(): void {
    const html = document.documentElement
    if (this.#panel !== undefined) {
      this.#panel.dataset.open = String(this.#open)
      this.#panel.setAttribute('aria-hidden', String(!this.#open))
      this.#panel.inert = !this.#open
      this.#panel.toggleAttribute('inert', !this.#open)
    }
    if (this.#open) {
      html.dataset.tockteamSummaryPinned = 'true'
      html.dataset.tockteamRightPanelOwner = 'pinned-summary'
      document.getElementById('root')?.classList.add(...SUMMARY_ROOT_CLASSES)
    } else {
      delete html.dataset.tockteamSummaryPinned
      if (html.dataset.tockteamRightPanelOwner === 'pinned-summary') {
        delete html.dataset.tockteamRightPanelOwner
        document.getElementById('root')?.classList.remove(...SUMMARY_ROOT_CLASSES)
      }
    }
  }

  private bindAndRender(): void {
    const list = this.#sessions.list.getSnapshot()
    const currentId = list.current
    const currentSession = currentId === undefined
      ? undefined
      : this.#sessions.binding(currentId)?.session
    if (currentId !== this.#currentId || currentSession !== this.#currentSession) {
      this.#unsubscribeSession?.()
      this.#unsubscribeSession = undefined
      this.#currentId = currentId
      this.#currentSession = currentSession
      this.#expanded = false
      this.#currentText = ''
      this.setFeedback()
      if (currentSession !== undefined) {
        this.#unsubscribeSession = currentSession.subscribe(() => { this.render() })
      }
    }
    this.render()
  }

  private renderChrome(): void {
    if (this.#headerTitle !== undefined) this.#headerTitle.textContent = this.#t('summary.title')
    if (this.#close !== undefined) {
      const label = this.#t('summary.close')
      this.#close.setAttribute('aria-label', label)
      this.#close.title = label
    }
    if (this.#copy !== undefined) {
      const label = this.#t('summary.copy')
      this.#copy.textContent = label
      this.#copy.setAttribute('aria-label', label)
    }
    if (this.#expand !== undefined) {
      const label = this.#expanded ? this.#t('summary.show-less') : this.#t('summary.show-more')
      this.#expand.textContent = label
      this.#expand.setAttribute('aria-label', label)
    }
  }

  private async copySummary(): Promise<void> {
    const text = this.#currentText
    const id = this.#currentId
    const session = this.#currentSession
    if (text === '') return
    const isCurrent = (): boolean => this.#currentId === id
      && this.#currentSession === session
      && this.#currentText === text
      && this.#panel !== undefined
      && this.#open
    try {
      if (typeof navigator === 'undefined' || navigator.clipboard?.writeText === undefined) {
        throw new Error('clipboard unavailable')
      }
      await navigator.clipboard.writeText(text)
      if (!isCurrent()) return
      this.setFeedback(this.#t('summary.copy-success'))
    } catch {
      if (!isCurrent()) return
      this.setFeedback(this.#t('summary.copy-failure'))
    }
  }

  private setFeedback(text?: string): void {
    if (this.#feedback === undefined) return
    this.#feedback.textContent = text ?? ''
    this.#feedback.hidden = text === undefined || text === ''
  }

  private render(): void {
    if (this.#title === undefined || this.#status === undefined || this.#meta === undefined
      || this.#source === undefined || this.#content === undefined) return
    const list = this.#sessions.list.getSnapshot()
    const id = list.current
    const session = id === undefined ? undefined : list.byId[id]
    if (id === undefined || session === undefined) {
      this.#currentText = ''
      this.#expanded = false
      this.#panel?.setAttribute('data-state', 'no-session')
      this.#title.textContent = this.#t('summary.no-active')
      this.#status.textContent = this.#t('summary.status.no-session')
      this.#status.dataset.state = 'no-session'
      this.#meta.textContent = this.#t('summary.select-session')
      this.#source.textContent = this.#t('summary.source.overview')
      const message = makeElement('p', this.#t('summary.empty-placeholder'))
      this.#content.replaceChildren(message)
      this.setFeedback()
      this.updateActions(false, false)
      return
    }

    const binding = this.#sessions.binding(id)
    const snapshot = binding?.session.getSnapshot()
    const derived = latestSummary(conversationNodes(snapshot))
    const state: SummaryState = binding === undefined
      ? 'unavailable'
      : summaryState(session, snapshot, derived)
    const stateLabel: Record<SummaryState, string> = {
      'no-session': this.#t('summary.status.no-session'),
      loading: this.#t('summary.status.loading'),
      blank: this.#t('summary.status.blank'),
      running: this.#t('summary.status.running'),
      waiting: this.#t('summary.status.waiting'),
      ready: this.#t('summary.status.ready'),
      unavailable: this.#t('summary.status.unavailable'),
      error: this.#t('summary.status.error'),
    }
    if (derived === undefined || !truncateSummary(derived.text).truncated) this.#expanded = false
    this.#panel?.setAttribute('data-state', state)
    this.#title.textContent = session.displayTitle
    this.#status.textContent = stateLabel[state]
    this.#status.dataset.state = state
    this.#meta.textContent = [
      session.cwd,
      this.#t('summary.updated', {
        time: new Date(session.updatedAt).toLocaleString(localeTag(this.#locale)),
      }),
    ].filter((part): part is string => typeof part === 'string' && part !== '').join(' · ')
    this.#source.textContent = derived === undefined
      ? this.#t('summary.source.overview')
      : derived.kind === 'context'
        ? this.#t('summary.source.context')
        : this.#t('summary.source.assistant')

    const stateMessage = state === 'loading'
      ? this.#t('summary.loading')
      : state === 'error'
        ? this.#t('summary.error')
        : state === 'blank'
          ? this.#t('summary.blank')
          : undefined
    if (stateMessage !== undefined) {
      this.#currentText = ''
      this.#expanded = false
      this.setFeedback()
      this.#content.replaceChildren(makeElement('p', stateMessage))
      this.updateActions(false, false)
      return
    }

    const text = derived?.text ?? this.#t('summary.unavailable')
    this.#currentText = derived?.text ?? ''
    const preview = this.#expanded ? { text, truncated: false } : truncateSummary(text)
    this.#content.replaceChildren()
    appendSummaryMarkdown(this.#content, preview.text)
    this.setFeedback()
    this.updateActions(derived !== undefined, preview.truncated)
  }

  private updateActions(hasSummary: boolean, canExpand: boolean): void {
    if (this.#actions === undefined || this.#copy === undefined || this.#expand === undefined) return
    this.#actions.hidden = !hasSummary
    this.#copy.disabled = !hasSummary
    const canToggle = canExpand || this.#expanded
    this.#expand.hidden = !canToggle
    this.#expand.disabled = !canToggle
    this.#expand.setAttribute('aria-expanded', String(this.#expanded))
    const label = this.#expanded ? this.#t('summary.show-less') : this.#t('summary.show-more')
    this.#expand.textContent = label
    this.#expand.setAttribute('aria-label', label)
    this.#expand.title = label
  }
}

/** Provide the pinned-summary service and its layout-reserving DOM surface. */
export function apply(ctx: ClientContext): void {
  const locale = ctx.get('locale') as LocaleService
  const t: Translate<PinnedSummaryMessage> = locale.bind('tockteam.pinned-summary')
  ctx.effect(
    () => locale.register('tockteam.pinned-summary', PINNED_SUMMARY_MESSAGES),
    'tockteam-desktop: pinned summary dictionaries',
  )
  const service = new PinnedSummaryService(
    ctx.get('sessions') as SessionsService,
    locale,
    t,
  )
  ctx.effect(() => {
    service.mount()
    const disposeService = ctx.reflect.provide('pinnedSummary', service, undefined)
    return () => {
      service.dispose()
      void disposeService()
    }
  }, 'tockteam-desktop: pinned summary')
}
