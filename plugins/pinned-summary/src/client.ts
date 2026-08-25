/** Layout-reserving pinned summary derived from the active DSH session. */

import { createElement as createIcon, X } from 'lucide'
import type { LocaleService, Translate } from '../../shared/i18n.ts'
import { localeTag } from '../../shared/i18n.ts'
import {
  PINNED_SUMMARY_MESSAGES,
  type PinnedSummaryMessage,
} from './i18n.ts'

interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

interface SessionListSummary {
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

function conversationNodes(snapshot: unknown): unknown[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.nodes)) return []
  return snapshot.nodes
}

function latestSummary(nodes: readonly unknown[]): { kind: 'context' | 'assistant'; text: string } | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (!isRecord(node)) continue
    if (node.kind === 'compaction' && typeof node.summary === 'string' && node.summary.trim() !== '') {
      return { kind: 'context', text: node.summary.trim() }
    }
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

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (element === null) throw new Error(`pinned-summary: missing ${selector}`)
  return element
}

class PinnedSummaryService implements PinnedSummary {
  readonly #sessions: SessionsService
  readonly #locale: LocaleService
  readonly #t: Translate<PinnedSummaryMessage>
  readonly #listeners = new Set<() => void>()
  #open = readOpen()
  #panel: HTMLElement | undefined
  #title: HTMLElement | undefined
  #headerTitle: HTMLElement | undefined
  #close: HTMLButtonElement | undefined
  #meta: HTMLElement | undefined
  #source: HTMLElement | undefined
  #text: HTMLElement | undefined
  #currentId: string | undefined
  #unsubscribeList: (() => void) | undefined
  #unsubscribeSession: (() => void) | undefined
  #unsubscribeLocale: (() => void) | undefined

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
    panel.dataset.tockteamPinnedSummary = 'true'
    panel.setAttribute('aria-label', this.#t('summary.label'))
    panel.className = 'fixed right-3 top-[calc(var(--tockteam-titlebar-height,40px)+12px)] z-[9000] h-[calc((100vh-var(--tockteam-titlebar-height,40px)-24px)/2)] w-72 box-border translate-x-[calc(100%+24px)] overflow-hidden invisible pointer-events-none rounded-[22px] border border-[var(--dsw-alias-border-l1)] bg-background text-foreground opacity-0 shadow-[0_14px_42px_rgba(0,0,0,0.09)] transition-[opacity,transform,visibility] [transition-duration:140ms,180ms,0s] [transition-timing-function:var(--ds-ease-in-out,ease),var(--ds-ease-in-out,ease),linear] [transition-delay:0s,0s,180ms] [-webkit-app-region:no-drag] data-[open=true]:visible data-[open=true]:pointer-events-auto data-[open=true]:translate-x-0 data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] max-[900px]:shadow-[-20px_0_48px_rgba(0,0,0,0.14)] motion-reduce:transition-none'
    panel.innerHTML = `
      <header data-tockteam-summary-header class="flex h-12 box-border items-center border-b border-border pr-2.5 pl-[15px] text-[13px] font-semibold">
        <span></span>
        <button data-tockteam-summary-close class="ml-auto grid size-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-0 text-muted-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover)] [&_svg]:size-4" type="button"></button>
      </header>
      <div data-tockteam-summary-body class="h-[calc(100%-48px)] box-border overflow-auto px-[15px] pt-3.5 pb-4">
        <h2 data-tockteam-summary-title class="m-0 text-sm leading-[1.35]"></h2>
        <div data-tockteam-summary-meta class="mt-1.5 mb-3 text-[11px] leading-[1.55] text-subtle-foreground [overflow-wrap:anywhere]"></div>
        <span data-tockteam-summary-source class="mb-2.5 inline-flex rounded-full bg-[var(--dsw-alias-interactive-bg-hover)] px-2 py-[3px] text-[10px] font-semibold text-muted-foreground"></span>
        <p data-tockteam-summary-text class="m-0 whitespace-pre-wrap text-xs leading-[1.55] text-muted-foreground [overflow-wrap:anywhere]"></p>
      </div>
    `
    document.body.append(panel)
    this.#panel = panel
    this.#title = required(panel, '[data-tockteam-summary-title]')
    this.#headerTitle = required(panel, '[data-tockteam-summary-header] span')
    this.#close = required(panel, '[data-tockteam-summary-close]')
    const closeIcon = createIcon(X)
    closeIcon.setAttribute('aria-hidden', 'true')
    closeIcon.setAttribute('class', 'lucide lucide-x')
    this.#close.append(closeIcon)
    this.#meta = required(panel, '[data-tockteam-summary-meta]')
    this.#source = required(panel, '[data-tockteam-summary-source]')
    this.#text = required(panel, '[data-tockteam-summary-text]')
    this.#close.addEventListener('click', () => { this.setOpen(false) })
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
    this.#unsubscribeList?.()
    this.#unsubscribeSession?.()
    this.#unsubscribeLocale?.()
    this.#panel?.remove()
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
    this.#open = open
    writeOpen(open)
    this.applyState()
    for (const listener of this.#listeners) listener()
  }

  private applyState(): void {
    const html = document.documentElement
    if (this.#panel !== undefined) {
      this.#panel.dataset.open = String(this.#open)
      this.#panel.setAttribute('aria-hidden', String(!this.#open))
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
    if (currentId !== this.#currentId) {
      this.#unsubscribeSession?.()
      this.#unsubscribeSession = undefined
      this.#currentId = currentId
      if (currentId !== undefined) {
        this.#unsubscribeSession = this.#sessions.binding(currentId)?.session.subscribe(() => { this.render() })
      }
    }
    this.render()
  }

  private renderChrome(): void {
    this.#panel?.setAttribute('aria-label', this.#t('summary.label'))
    if (this.#headerTitle !== undefined) this.#headerTitle.textContent = this.#t('summary.title')
    if (this.#close !== undefined) {
      const label = this.#t('summary.close')
      this.#close.setAttribute('aria-label', label)
      this.#close.title = label
    }
  }

  private render(): void {
    if (this.#title === undefined || this.#meta === undefined || this.#source === undefined || this.#text === undefined) return
    const list = this.#sessions.list.getSnapshot()
    const id = list.current
    const summary = id === undefined ? undefined : list.byId[id]
    if (id === undefined || summary === undefined) {
      this.#title.textContent = this.#t('summary.no-active')
      this.#meta.textContent = this.#t('summary.select-session')
      this.#source.textContent = this.#t('summary.session')
      this.#text.textContent = this.#t('summary.empty-placeholder')
      return
    }
    const binding = this.#sessions.binding(id)
    const derived = latestSummary(conversationNodes(binding?.session.getSnapshot()))
    const status = summary.running
      ? this.#t('summary.status.running')
      : summary.pendingInteraction !== undefined
        ? this.#t('summary.status.waiting')
        : this.#t('summary.status.ready')
    this.#title.textContent = summary.displayTitle
    this.#meta.textContent = [
      status,
      summary.cwd,
      this.#t('summary.updated', {
        time: new Date(summary.updatedAt).toLocaleString(localeTag(this.#locale)),
      }),
    ].filter((part): part is string => typeof part === 'string' && part !== '').join(' · ')
    this.#source.textContent = derived === undefined
      ? this.#t('summary.source.overview')
      : derived.kind === 'context'
        ? this.#t('summary.source.context')
        : this.#t('summary.source.assistant')
    this.#text.textContent = derived?.text
      ?? (summary.blank
        ? this.#t('summary.blank')
        : this.#t('summary.unavailable'))
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
