import { Alert } from '@tockteam/ui/alert'
import { Badge } from '@tockteam/ui/badge'
import { Button } from '@tockteam/ui/button'
import { Card } from '@tockteam/ui/card'
import { Checkbox } from '@tockteam/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Spinner } from '@tockteam/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@tockteam/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@tockteam/ui/tooltip'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Blocks, Search, X } from 'lucide-react'
import type { DesktopBridge } from '../../../../src/contracts.ts'
import type { LocaleService, Translate } from '../../../shared/i18n.ts'
import { localeTag } from '../../../shared/i18n.ts'
import { useTranslate } from '../../../shared/use-i18n.ts'
import type {
  MarketplaceCommand,
  MarketplaceConfirmation,
  MarketplacePlugin,
  MarketplaceRiskReason,
  MarketplaceSnapshot,
} from '../protocol.ts'
import { MARKETPLACE_MESSAGES, type MarketplaceMessage } from './i18n.ts'
import {
  initialSessionNavigationState,
  transitionSessionNavigation,
  type SessionListSnapshot,
  type SessionNavigationState,
} from './session-navigation.ts'

type MarketplaceStatusFilter = 'all' | 'installed' | 'available' | 'updates' | 'disabled'

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
  reflect: {
    provide(name: string, value: unknown, options?: unknown): (() => Promise<void> | void) | void
  }
}

interface MarketplaceViewState {
  available: boolean
  open: boolean
}

interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

interface SessionsService {
  list: ObservableSnapshot<SessionListSnapshot>
}

interface MarketplaceNavigationProps {
  locale: LocaleService
  t: Translate<MarketplaceMessage>
  view: PluginMarketplaceView
  wide: boolean
}

interface SlotsService {
  inject(name: string, register: () => unknown): void
  register(options: {
    id: string
    inject(): Omit<MarketplaceNavigationProps, 'wide'>
    locale: string
    name: string
    order: number
  }, component: (props: MarketplaceNavigationProps) => JSX.Element | null): unknown
}

export interface PluginMarketplaceView {
  getSnapshot(): MarketplaceViewState
  isOpen(): boolean
  setOpen(open: boolean): void
  subscribe(listener: () => void): () => void
  toggle(): void
}

declare global {
  interface Window {
    dshDesktop?: DesktopBridge
  }
}

export const inject = ['locale', 'sessions', 'slots']

const OPEN_KEY = 'tockteam-desktop.plugin-marketplace.open'
const FOOTER_STACK_ATTRIBUTE = 'data-tockteam-marketplace-footer-stack'
const BUTTON_CLASSES = 'min-h-9 cursor-pointer rounded-[10px] border border-[var(--dsw-alias-border-l1,#ddd)] bg-background px-[15px] font-[inherit] text-xs font-[570] text-inherit hover:bg-[var(--dsw-alias-interactive-bg-hover,#f4f4f4)] disabled:cursor-default disabled:opacity-45 data-[primary=true]:border-[#202124] data-[primary=true]:bg-[#202124] data-[primary=true]:text-white data-[danger=true]:border-[#e4b6b6] data-[danger=true]:text-[#b42318]'
const ICON_BUTTON_CLASSES = 'grid size-9 cursor-pointer place-items-center rounded-[10px] border border-[var(--dsw-alias-border-l1,#ddd)] bg-background p-0 font-[inherit] text-inherit hover:bg-[var(--dsw-alias-interactive-bg-hover,#f4f4f4)] disabled:cursor-default disabled:opacity-45 [&_svg]:size-[18px]'
const PILL_CLASSES = 'inline-flex min-h-[21px] items-center rounded-full bg-[var(--dsw-alias-interactive-bg-hover,#f1f2f3)] px-2 text-[9px] font-semibold text-muted-foreground data-[installed=true]:bg-[#e8f7ee] data-[installed=true]:text-[#147d3f] data-[update=true]:bg-[#e8f0ff] data-[update=true]:text-[#2f62bf] data-[unsupported=true]:bg-[#fff4df] data-[unsupported=true]:text-[#966211] data-[protected=true]:bg-[#f1eaff] data-[protected=true]:text-[#6741a5]'

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === 'true' } catch { return false }
}

function persistOpen(open: boolean): void {
  try { localStorage.setItem(OPEN_KEY, String(open)) } catch { /* best effort */ }
}

function settingsButton(): HTMLButtonElement | null {
  const visible = (button: HTMLButtonElement): boolean => {
    const rect = button.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const byBottom = (left: HTMLButtonElement, right: HTMLButtonElement): number =>
    right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom
  // rc.5 wraps the trigger content in a stable slot marker; the rail trigger
  // is the one inside the sidebar (the open settings panel may render a copy).
  const slotted = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.querySelector('[data-slot="settings.trigger"]') !== null
      && button.closest('[data-slot="sidebar"]') !== null
      && visible(button))
  if (slotted !== undefined) return slotted
  const labeled = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .filter(button => {
      if (button.closest('#tockteam-plugin-marketplace-root') !== null) return false
      if (!visible(button)) return false
      const label = [
        button.textContent,
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
      ].filter(Boolean).join(' ').trim().toLowerCase()
      return label.includes('settings') || label.includes('设置')
    })
  if (labeled.length > 0) return labeled.sort(byBottom)[0] ?? null
  // rc.5's collapsed rail renders the settings trigger as an icon-only
  // dialog-opener at the rail foot, with no accessible settings label.
  const railTriggers = [...document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')]
    .filter(button => button.closest('[data-slot="sidebar"]') !== null && visible(button))
  return railTriggers.sort(byBottom)[0] ?? null
}

function settingsDialogOpen(): boolean {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
    .some(dialog => {
      const labelledBy = dialog.getAttribute('aria-labelledby')
      const label = [
        dialog.getAttribute('aria-label'),
        labelledBy === null ? null : document.getElementById(labelledBy)?.textContent,
        dialog.textContent?.slice(0, 80),
      ].filter(Boolean).join(' ').trim().toLowerCase()
      return label.includes('settings') || label.includes('设置')
    })
}

function marketplaceFooter(settings: HTMLElement): HTMLElement | null {
  const navigation = document.querySelector<HTMLElement>('[data-tockteam-marketplace-nav]')
  if (navigation === null) return null
  let candidate = navigation.parentElement
  while (candidate !== null && candidate !== document.body) {
    if (candidate.contains(settings)) return candidate
    candidate = candidate.parentElement
  }
  return null
}

function sidebarFor(settings: HTMLElement): HTMLElement | null {
  const declared = document.querySelector<HTMLElement>('[data-slot="sidebar"]')
  if (declared !== null) return declared
  const aside = settings.closest<HTMLElement>('aside')
  if (aside !== null) return aside
  let candidate: HTMLElement | null = settings.parentElement
  let best: HTMLElement | null = candidate
  while (candidate !== null && candidate !== document.body) {
    const rect = candidate.getBoundingClientRect()
    if (rect.left <= 8 && rect.height > window.innerHeight * 0.55 && rect.width < window.innerWidth * 0.5) {
      best = candidate
    }
    candidate = candidate.parentElement
  }
  return best
}

/**
 * First descendant of the sidebar slot with a real box. rc.5 renders the
 * `[data-slot="sidebar"]` wrapper as `display: contents`, whose own rect is
 * always empty; the rail state must be read from the boxed child instead.
 */
function sidebarBox(sidebar: HTMLElement): HTMLElement | null {
  const stack: HTMLElement[] = [sidebar]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) break
    if (node !== sidebar) {
      const rect = node.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return node
    }
    for (const child of [...node.children].reverse()) stack.push(child as HTMLElement)
  }
  return null
}

function MarketplaceNavigationEntry({
  locale,
  t,
  view,
  wide,
}: MarketplaceNavigationProps): JSX.Element | null {
  const state = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const translate = useTranslate(locale, t)
  if (!state.available) return null
  const label = translate('plugins')
  return (
    <Button unstyled
      aria-label={label}
      className="box-border flex h-[34px] min-h-[34px] w-[calc(100%+8px)] cursor-pointer items-center gap-2 my-1 -mx-1 rounded-xl border-0 bg-transparent py-1.5 pr-0.5 pl-2.5 text-left font-[inherit] text-foreground [-webkit-app-region:no-drag] hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] data-[active=true]:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] data-[collapsed=true]:my-[8px] data-[collapsed=true]:mb-[10px] data-[collapsed=true]:size-9 data-[collapsed=true]:min-h-9 data-[collapsed=true]:justify-center data-[collapsed=true]:rounded-full data-[collapsed=true]:p-0 data-[collapsed=true]:[&_span]:hidden [&_svg]:size-5 [&_svg]:flex-none [&_svg]:stroke-[1.7]"
      data-tockteam-marketplace-nav=""
      data-active={String(state.open)}
      data-collapsed={String(!wide)}
      onClick={() => { view.toggle() }}
      type="button"
    >
      <Blocks aria-hidden="true" />
      {wide && <span>{label}</span>}
    </Button>
  )
}

class PluginMarketplaceViewService implements PluginMarketplaceView {
  readonly #bridge: DesktopBridge
  readonly #locale: LocaleService
  readonly #t: Translate<MarketplaceMessage>
  readonly #sessions: SessionsService
  readonly #listeners = new Set<() => void>()
  #state: MarketplaceViewState = { available: false, open: readOpen() }
  #element: HTMLDivElement | null = null
  #root: Root | null = null
  #observer: MutationObserver | null = null
  #resizeObserver: ResizeObserver | null = null
  #geometryFrame: number | null = null
  #footerStack: HTMLElement | null = null
  #unsubscribeSessions: (() => void) | null = null
  #sessionNavigationState: SessionNavigationState = initialSessionNavigationState()
  readonly #handleResize = (): void => { this.scheduleGeometry() }
  readonly #handleDocumentClick = (event: MouseEvent): void => {
    if (!this.#state.open || !(event.target instanceof Element)) return
    const button = event.target.closest('button')
    if (button !== null && button === settingsButton()) this.setOpen(false)
  }

  constructor(
    bridge: DesktopBridge,
    locale: LocaleService,
    t: Translate<MarketplaceMessage>,
    sessions: SessionsService,
  ) {
    this.#bridge = bridge
    this.#locale = locale
    this.#t = t
    this.#sessions = sessions
  }

  getSnapshot = (): MarketplaceViewState => this.#state

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  isOpen(): boolean { return this.#state.open }

  setOpen(open: boolean): void {
    if (this.#state.open === open) return
    this.#state = { ...this.#state, open }
    persistOpen(open)
    this.applyOpenState()
    for (const listener of this.#listeners) listener()
  }

  toggle(): void { this.setOpen(!this.#state.open) }

  mount(): void {
    this.#sessionNavigationState = initialSessionNavigationState()
    document.documentElement.classList.add('tockteam-marketplace-shell')
    this.#element = document.createElement('div')
    this.#element.id = 'tockteam-plugin-marketplace-root'
    document.body.append(this.#element)
    this.#root = createRoot(this.#element)
    this.#root.render(
      <MarketplaceSurface
        bridge={this.#bridge}
        locale={this.#locale}
        translate={this.#t}
        view={this}
      />,
    )

    this.#state = { ...this.#state, available: true }
    for (const listener of this.#listeners) listener()

    this.#observer = new MutationObserver(() => {
      if (this.#state.open && settingsDialogOpen()) this.setOpen(false)
      this.scheduleGeometry()
    })
    this.#observer.observe(document.body, { childList: true, subtree: true })
    this.#resizeObserver = new ResizeObserver(() => { this.scheduleGeometry() })
    document.addEventListener('click', this.#handleDocumentClick, true)
    window.addEventListener('resize', this.#handleResize)
    const syncSessionNavigation = (): void => {
      const transition = transitionSessionNavigation(
        this.#sessionNavigationState,
        this.#sessions.list.getSnapshot(),
      )
      this.#sessionNavigationState = transition.state
      if (transition.close) this.setOpen(false)
    }
    this.#unsubscribeSessions = this.#sessions.list.subscribe(syncSessionNavigation)
    syncSessionNavigation()
    this.applyOpenState()
    this.scheduleGeometry()
  }

  dispose(): void {
    document.removeEventListener('click', this.#handleDocumentClick, true)
    window.removeEventListener('resize', this.#handleResize)
    this.#unsubscribeSessions?.()
    this.#unsubscribeSessions = null
    if (this.#geometryFrame !== null) cancelAnimationFrame(this.#geometryFrame)
    this.#observer?.disconnect()
    this.#resizeObserver?.disconnect()
    this.#root?.unmount()
    this.#footerStack?.removeAttribute(FOOTER_STACK_ATTRIBUTE)
    this.#footerStack = null
    this.#element?.remove()
    document.documentElement.classList.remove('tockteam-marketplace-shell')
    this.#state = { available: false, open: false }
    for (const listener of this.#listeners) listener()
    delete document.documentElement.dataset.tockteamMarketplaceOpen
    document.documentElement.style.removeProperty('--tockteam-marketplace-left')
  }

  private applyOpenState(): void {
    if (this.#state.open) document.documentElement.dataset.tockteamMarketplaceOpen = 'true'
    else delete document.documentElement.dataset.tockteamMarketplaceOpen
  }

  private scheduleGeometry(): void {
    if (this.#geometryFrame !== null) return
    this.#geometryFrame = requestAnimationFrame(() => {
      this.#geometryFrame = null
      this.synchronizeGeometry()
    })
  }

  private synchronizeGeometry(): void {
    const rail = document.getElementById('tockteam-rail-root')
    if (rail !== null) {
      this.#footerStack?.removeAttribute(FOOTER_STACK_ATTRIBUTE)
      this.#footerStack = null
      this.#resizeObserver?.disconnect()
      this.#resizeObserver?.observe(rail)
      document.documentElement.style.setProperty(
        '--tockteam-marketplace-left',
        `${String(Math.round(rail.getBoundingClientRect().right))}px`,
      )
      return
    }
    const declared = document.querySelector<HTMLElement>('[data-slot="sidebar"]')
    const settings = settingsButton()
    const footerStack = settings === null ? null : marketplaceFooter(settings)
    if (footerStack !== this.#footerStack) {
      this.#footerStack?.removeAttribute(FOOTER_STACK_ATTRIBUTE)
      footerStack?.setAttribute(FOOTER_STACK_ATTRIBUTE, 'true')
      this.#footerStack = footerStack
    }
    const sidebar = declared ?? (settings === null ? null : sidebarFor(settings))
    if (sidebar === null) {
      document.documentElement.style.setProperty('--tockteam-marketplace-left', '0px')
      return
    }
    const box = sidebarBox(sidebar) ?? sidebar
    this.#resizeObserver?.disconnect()
    this.#resizeObserver?.observe(box)
    const rect = box.getBoundingClientRect()
    const left = rect.right > 0 && rect.right < window.innerWidth * 0.55 ? rect.right : 0
    document.documentElement.style.setProperty('--tockteam-marketplace-left', `${String(Math.round(left))}px`)
  }
}

function shortCommit(commit: string): string {
  return commit.slice(0, 10)
}

function mechanismLabel(
  plugin: MarketplacePlugin,
  t: Translate<MarketplaceMessage>,
): string {
  return t(`mechanism.${plugin.mechanism}`)
}

function runtimeRiskLabel(
  plugin: MarketplacePlugin,
  t: Translate<MarketplaceMessage>,
): string {
  return t(`risk.${plugin.runtimeRisk}`)
}

function riskReasonLabel(
  reason: MarketplaceRiskReason,
  t: Translate<MarketplaceMessage>,
): string {
  return t(`risk-reason.${reason}`)
}

function confirmationLabel(
  confirmation: MarketplaceConfirmation,
  t: Translate<MarketplaceMessage>,
): string {
  if (confirmation === 'allow-build-scripts') return t('allow-scripts')
  if (confirmation === 'accept-high-risk') return t('accept-high-risk')
  return t('accept-source-change')
}

function PluginCard({
  plugin,
  selected,
  select,
  t,
}: {
  plugin: MarketplacePlugin
  selected: boolean
  select(): void
  t: Translate<MarketplaceMessage>
}): JSX.Element {
  return (
    <Button unstyled
      className="relative flex min-h-44 cursor-pointer flex-col rounded-2xl border border-border bg-background p-[17px] text-left text-inherit transition-[border-color,box-shadow,transform] duration-[120ms] ease-in-out hover:-translate-y-px hover:border-[#a8bff3] hover:shadow-[0_9px_28px_rgba(31,35,41,0.08)] data-[selected=true]:-translate-y-px data-[selected=true]:border-[#a8bff3] data-[selected=true]:shadow-[0_9px_28px_rgba(31,35,41,0.08)] motion-reduce:transition-none"
      data-selected={String(selected)}
      onClick={select}
      type="button"
    >
      <div className="flex items-start gap-[11px]">
        <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-[#eef4ff] text-base font-bold text-[#3f74df] uppercase dark:bg-[#1d2c4c] dark:text-[#8eb4ff]">{plugin.title.slice(0, 1)}</span>
        <div className="min-w-0">
          <h2 className="mt-px mb-0 truncate text-sm font-[620]">{plugin.title}</h2>
          <div className="mt-[3px] text-[10px] text-subtle-foreground capitalize">{plugin.category}</div>
        </div>
      </div>
      <p className="my-[13px] line-clamp-3 text-[11px] leading-normal text-muted-foreground">{plugin.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Badge
          unstyled
          className={PILL_CLASSES}
          data-unsupported={String(plugin.mechanism === 'unsupported')}
        >
          {mechanismLabel(plugin, t)}
        </Badge>
        {plugin.installed && (
          <Badge unstyled className={PILL_CLASSES} data-installed="true">
            {t('installed')}
          </Badge>
        )}
        {plugin.installed && (
          <Badge unstyled className={PILL_CLASSES} data-installed={String(plugin.enabled)}>
            {plugin.enabled ? t('enabled') : t('disabled')}
          </Badge>
        )}
        {plugin.updateAvailable && (
          <Badge unstyled className={PILL_CLASSES} data-update="true">
            {t('update-available')}
          </Badge>
        )}
        {plugin.protected && (
          <Badge unstyled className={PILL_CLASSES} data-protected="true">
            {t('managed')}
          </Badge>
        )}
      </div>
    </Button>
  )
}

function PluginDetail({
  bridge,
  pending,
  plugin,
  snapshot,
  locale,
  t,
  close,
  run,
}: {
  bridge: DesktopBridge
  pending: boolean
  plugin: MarketplacePlugin
  snapshot: MarketplaceSnapshot
  locale: LocaleService
  t: Translate<MarketplaceMessage>
  close(): void
  run(command: MarketplaceCommand): Promise<void>
}): JSX.Element {
  const [confirmations, setConfirmations] = useState<MarketplaceConfirmation[]>([])
  const plan = snapshot.plan?.pluginId === plugin.id ? snapshot.plan : null
  const hasScripts = plan !== null && Object.keys(plan.buildScripts).length > 0
  const readyToPreview = plan !== null
    && plan.requirements.every(requirement => confirmations.includes(requirement))
  useEffect(() => { setConfirmations([]) }, [plugin.id, plan?.resolvedCommit])
  const setConfirmed = (
    confirmation: MarketplaceConfirmation,
    confirmed: boolean,
  ): void => {
    setConfirmations(current => confirmed
      ? [...new Set([...current, confirmation])]
      : current.filter(entry => entry !== confirmation))
  }
  return (
    <aside
      className="min-w-0 overflow-auto border-l border-border bg-background max-[820px]:border-t max-[820px]:border-l-0"
      aria-label={t('details', { plugin: plugin.title })}
    >
      <div className="px-6 pt-[25px] pb-[38px]">
        <Button unstyled className={`${ICON_BUTTON_CLASSES} float-right`} onClick={close} type="button"><X aria-hidden="true" /></Button>
        <h2 className="mt-px mr-[42px] mb-1 text-[19px] leading-[1.3]">{plugin.title}</h2>
        <Badge unstyled className={PILL_CLASSES} data-installed={String(plugin.installed)}>
          {plugin.installed ? t('installed') : mechanismLabel(plugin, t)}
        </Badge>
        <p className="my-[18px] text-xs leading-[1.6] text-muted-foreground">{plugin.description}</p>
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-2.5 border-y border-border py-4 text-[10px] [&_dt]:text-subtle-foreground [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:[overflow-wrap:anywhere]">
          <dt>{t('category')}</dt><dd>{plugin.category}</dd>
          <dt>{t('mechanism')}</dt><dd>{mechanismLabel(plugin, t)}</dd>
          <dt>{t('updated')}</dt>
          <dd>
            {plugin.pushedAt === null
              ? t('unknown')
              : new Date(plugin.pushedAt).toLocaleString(localeTag(locale))}
          </dd>
          <dt>{t('repository')}</dt><dd>{plugin.url.replace('https://github.com/', '')}</dd>
          <dt>{t('trust')}</dt><dd>{t(`trust.${plugin.trust}`)}</dd>
          <dt>{t('runtime-boundary')}</dt><dd>{runtimeRiskLabel(plugin, t)}</dd>
          {plugin.currentCommit !== null && (
            <><dt>{t('current-commit')}</dt><dd>{shortCommit(plugin.currentCommit)}</dd></>
          )}
          {plugin.latestCommit !== null && (
            <><dt>{t('latest-commit')}</dt><dd>{shortCommit(plugin.latestCommit)}</dd></>
          )}
        </dl>

        {plan !== null && (
          <Card unstyled className="mt-[18px] rounded-xl border border-[#d7e3ff] bg-[#f7f9ff] p-3.5 text-[11px] dark:border-[#33466d] dark:bg-[#19233a] [&_code]:my-[5px] [&_code]:block [&_code]:text-[9px] [&_code]:leading-normal [&_code]:text-[#355593] [&_code]:[overflow-wrap:anywhere]">
            <div className="mb-[13px] grid grid-cols-3 gap-[5px] [&_span]:rounded-[7px] [&_span]:bg-[rgba(53,85,147,0.07)] [&_span]:px-1 [&_span]:py-1.5 [&_span]:text-center [&_span]:text-[9px] [&_span]:text-subtle-foreground [&_span[data-active=true]]:bg-[#e7efff] [&_span[data-active=true]]:font-[650] [&_span[data-active=true]]:text-[#315fae] dark:[&_span[data-active=true]]:bg-[#283d67] dark:[&_span[data-active=true]]:text-[#b8ceff]" aria-label={t('prepared-plan', { action: t(`action.${plan.action}`) })}>
              <span data-active="true">1 · {t('flow.review')}</span>
              <span data-active={String(snapshot.preview !== null)}>2 · {t('flow.preview')}</span>
              <span>3 · {t('flow.apply')}</span>
            </div>
            <h3 className="mt-0 mb-[9px] text-xs">{t('prepared-plan', { action: t(`action.${plan.action}`) })}</h3>
            <div className="my-2 grid gap-[3px] rounded-[9px] bg-[#ecf7f0] px-2.5 py-[9px] leading-[1.45] text-[#17663a] data-[risk=elevated]:bg-[#fff6e6] data-[risk=elevated]:text-[#83570b] data-[risk=high]:bg-[#fff0ef] data-[risk=high]:text-[#a33228] data-[risk=blocked]:bg-[#fff0ef] data-[risk=blocked]:text-[#a33228] dark:bg-[#193326] dark:text-[#94d5ae] dark:data-[risk=elevated]:bg-[#3b2e16] dark:data-[risk=elevated]:text-[#e5c27f] dark:data-[risk=high]:bg-[#40211e] dark:data-[risk=high]:text-[#f0aaa4] dark:data-[risk=blocked]:bg-[#40211e] dark:data-[risk=blocked]:text-[#f0aaa4]" data-risk={plan.riskLevel}>
              <strong>{t('risk-level')}: {t(`risk-level.${plan.riskLevel}`)}</strong>
              <span>{t('source-review')}: {t(`source-review.${plan.sourceReview}`)}</span>
            </div>
            {plan.riskReasons.length > 0 && (
              <ul className="mt-0 mb-2.5 pl-[18px] leading-[1.55] text-muted-foreground">
                {plan.riskReasons.map(reason => (
                  <li key={reason}>{riskReasonLabel(reason, t)}</li>
                ))}
              </ul>
            )}
            <code>{plan.source}</code>
            <code>{t('commit', { commit: shortCommit(plan.resolvedCommit) })}</code>
            {plan.packageName !== null && (
              <code>{t('package', { package: plan.packageName })}</code>
            )}
            {hasScripts && (
              <code>{Object.entries(plan.buildScripts).map(([name, script]) => `${name}: ${script}`).join('\n')}</code>
            )}
            {plan.requirements.map(requirement => (
              <Label unstyled className="my-3 flex items-start gap-2 text-[10px] leading-[1.45] text-[#7d5412] [&_[data-slot=checkbox]]:mt-0.5 [&_[data-slot=checkbox]]:flex-none" key={requirement}>
                  <Checkbox
                    checked={confirmations.includes(requirement)}
                    onCheckedChange={checked => { setConfirmed(requirement, checked === true) }}
                  />
                  <span>{confirmationLabel(requirement, t)}</span>
              </Label>
            ))}
            <p className="mt-3 mb-0 border-t border-[rgba(53,85,147,0.14)] pt-2.5 text-[9px] leading-normal text-subtle-foreground">{t('recovery-note')}</p>
          </Card>
        )}

        <div className="mt-[18px] flex flex-wrap gap-2">
          {plugin.mechanism === 'unsupported' || plugin.protected ? (
            <Button unstyled className={BUTTON_CLASSES} onClick={() => { void bridge.openExternal(plugin.url) }} type="button">
              {t('open-repository')}
            </Button>
          ) : plan === null ? (
            <>
              {!plugin.installed && (
                <Button unstyled
                  className={BUTTON_CLASSES}
                  data-primary="true"
                  disabled={pending}
                  onClick={() => { void run({
                    type: 'prepare',
                    action: 'install',
                    pluginId: plugin.id,
                  }) }}
                  type="button"
                >
                  {t('preview.install')}
                </Button>
              )}
              {plugin.installed && plugin.updateAvailable && (
                <Button unstyled
                  className={BUTTON_CLASSES}
                  data-primary="true"
                  disabled={pending}
                  onClick={() => { void run({
                    type: 'prepare',
                    action: 'update',
                    pluginId: plugin.id,
                  }) }}
                  type="button"
                >
                  {t('preview.update')}
                </Button>
              )}
              {plugin.installed && (
                <Button unstyled
                  className={BUTTON_CLASSES}
                  disabled={pending}
                  onClick={() => { void run({
                    type: 'prepare',
                    action: plugin.enabled ? 'disable' : 'enable',
                    pluginId: plugin.id,
                  }) }}
                  type="button"
                >
                  {plugin.enabled ? t('preview.disable') : t('preview.enable')}
                </Button>
              )}
              {plugin.installed && (
                <Button unstyled
                  className={BUTTON_CLASSES}
                  data-danger="true"
                  disabled={pending}
                  onClick={() => { void run({
                    type: 'prepare',
                    action: 'uninstall',
                    pluginId: plugin.id,
                  }) }}
                  type="button"
                >
                  {t('preview.uninstall')}
                </Button>
              )}
            </>
          ) : snapshot.preview === null ? (
            <Button unstyled
              className={BUTTON_CLASSES}
              data-primary="true"
              disabled={pending || !readyToPreview}
              onClick={() => { void run({ type: 'preview', confirmations }) }}
              type="button"
            >
              {t('preview.launch')}
            </Button>
          ) : null}
          <Button unstyled className={BUTTON_CLASSES} onClick={() => { void bridge.openExternal(plugin.url) }} type="button">
            {t('view-source')}
          </Button>
        </div>
      </div>
    </aside>
  )
}

function localizedAuthDetail(
  detail: string,
  t: Translate<MarketplaceMessage>,
): string {
  if (detail.startsWith('Install GitHub CLI')) return t('auth.install-gh')
  if (detail === 'Authenticated with GitHub CLI.') return t('auth.ready')
  if (detail === 'Plugin catalog has not been refreshed yet.') {
    return t('auth.not-refreshed')
  }
  return detail
}

function localizedHostMessage(
  message: string,
  t: Translate<MarketplaceMessage>,
): string {
  let match = /^Loaded (\d+) catalog plugins\.$/.exec(message)
  if (match !== null) return t('notice.loaded', { count: match[1] })
  match = /^Isolated (install|update|enable|disable|uninstall) preview is ready for (.+)\.$/.exec(message)
  if (match !== null) {
    const action = t(`action.${match[1] as 'install' | 'update' | 'enable' | 'disable' | 'uninstall'}`)
    return t('notice.preview-ready', { action, plugin: match[2] })
  }
  match = /^Discarded the (.+) preview without changing the desktop profile\.$/.exec(message)
  if (match !== null) return t('notice.discarded', { plugin: match[1] })
  match = /^Applied (.+); the previous profile remains available for Undo\.$/.exec(message)
  if (match !== null) return t('notice.applied', { plugin: match[1] })
  match = /^Restored the profile from before (.+) was applied\.$/.exec(message)
  if (match !== null) return t('notice.restored', { plugin: match[1] })
  return message
}

function MarketplaceSurface({ bridge, locale, translate, view }: {
  bridge: DesktopBridge
  locale: LocaleService
  translate: Translate<MarketplaceMessage>
  view: PluginMarketplaceViewService
}): JSX.Element {
  const t = useTranslate(locale, translate)
  const viewState = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const [snapshot, setSnapshot] = useState<MarketplaceSnapshot | null>(null)
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MarketplaceStatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const run = useCallback(async (command: MarketplaceCommand): Promise<void> => {
    setPending(true)
    setLocalError(null)
    try {
      setSnapshot(await bridge.pluginMarketplace.dispatch(command))
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }, [bridge])

  useEffect(() => {
    let alive = true
    void bridge.pluginMarketplace.getSnapshot().then(initial => {
      if (!alive) return
      setSnapshot(initial)
      return bridge.pluginMarketplace.dispatch({ type: 'refresh' })
    }).then(refreshed => {
      if (alive && refreshed !== undefined) setSnapshot(refreshed)
    }).catch((error: unknown) => {
      if (alive) setLocalError(error instanceof Error ? error.message : String(error))
    })
    return () => { alive = false }
  }, [bridge])

  const categories = useMemo(() => {
    return [...new Set(snapshot?.catalog.map(plugin => plugin.category) ?? [])].sort()
  }, [snapshot?.catalog])
  const statusCounts = useMemo(() => {
    const catalog = snapshot?.catalog ?? []
    const installed = catalog.filter(plugin => plugin.installed).length
    return {
      all: catalog.length,
      available: catalog.length - installed,
      disabled: catalog.filter(plugin => plugin.installed && !plugin.enabled).length,
      installed,
      updates: catalog.filter(plugin => plugin.updateAvailable).length,
    }
  }, [snapshot?.catalog])
  const plugins = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (snapshot?.catalog ?? []).filter(plugin => {
      if (statusFilter === 'installed' && !plugin.installed) return false
      if (statusFilter === 'available' && plugin.installed) return false
      if (statusFilter === 'updates' && !plugin.updateAvailable) return false
      if (statusFilter === 'disabled' && (!plugin.installed || plugin.enabled)) return false
      if (categoryFilter !== 'all' && plugin.category !== categoryFilter) return false
      return needle === '' || [plugin.title, plugin.description, plugin.category, ...plugin.tags]
        .some(value => value.toLowerCase().includes(needle))
    })
  }, [categoryFilter, search, snapshot?.catalog, statusFilter])
  const selected = plugins.find(plugin => plugin.id === selectedId) ?? null
  const error = localError ?? snapshot?.error ?? null
  const resetView = (): void => {
    setSearch('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setSelectedId(null)
  }

  useEffect(() => {
    if (viewState.open) resetView()
  }, [viewState.open])

  return (
    <TooltipProvider>
      <div className="fixed inset-y-0 right-0 left-[var(--tockteam-marketplace-left,0px)] top-[var(--tockteam-titlebar-height,40px)] z-[8800] box-border translate-y-1 overflow-hidden invisible pointer-events-none border-l border-border bg-background text-foreground opacity-0 transition-[opacity,transform,visibility] [transition-duration:140ms,160ms,0s] [transition-timing-function:ease,ease,linear] [transition-delay:0s,0s,160ms] [-webkit-app-region:no-drag] data-[open=true]:visible data-[open=true]:pointer-events-auto data-[open=true]:translate-y-0 data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] motion-reduce:transition-none" data-open={String(viewState.open)} aria-hidden={!viewState.open}>
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
        <div>
          <header className="flex min-h-[68px] items-center gap-3.5 border-b border-border px-7">
            <div className="min-w-0">
              <h1 className="m-0 text-xl font-[650] tracking-[-0.02em]">{t('plugins')}</h1>
              <p className="mt-0.5 mb-0 text-[11px] text-subtle-foreground">{t('subtitle')}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {snapshot?.undoAvailable === true && (
                <Button unstyled className={BUTTON_CLASSES} disabled={pending} onClick={() => { void run({ type: 'undo' }) }} type="button">
                  {t('undo-last-apply')}
                </Button>
              )}
              <Button unstyled className={BUTTON_CLASSES} disabled={pending} onClick={() => { void run({ type: 'refresh' }) }} type="button">
                {pending ? t('working') : t('refresh')}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button unstyled
                    aria-label={t('close')}
                    className={ICON_BUTTON_CLASSES}
                    onClick={() => { view.setOpen(false) }}
                    type="button"
                  ><X aria-hidden="true" /></Button>
                </TooltipTrigger>
                <TooltipContent>{t('close')}</TooltipContent>
              </Tooltip>
            </div>
          </header>
          {snapshot?.preview !== null && snapshot?.preview !== undefined && (
            <Alert unstyled role="status" className="mx-7 mt-3.5 flex flex-wrap items-center gap-2.5 rounded-[11px] border border-[#bcd0fa] bg-[#f2f6ff] px-3.5 py-[11px] text-[11px] leading-[1.45] text-[#244f9e] dark:border-[#395993] dark:bg-[#182744] dark:text-[#a9c4ff] [&_strong]:mr-auto">
              <strong>{t('preview.running', { plugin: snapshot.preview.pluginId })}</strong>
              <Button unstyled className={BUTTON_CLASSES} disabled={pending} onClick={() => { void run({ type: 'discard' }) }} type="button">
                {t('discard')}
              </Button>
              <Button unstyled className={BUTTON_CLASSES} data-primary="true" disabled={pending} onClick={() => { void run({ type: 'apply' }) }} type="button">
                {t('apply-action', { action: t(`action.${snapshot.preview.action}`) })}
              </Button>
            </Alert>
          )}
          {error !== null && (
            <Alert unstyled className="mx-7 mt-[18px] flex items-center gap-3 rounded-[11px] border border-[#f1c2bd] bg-[#fff5f4] px-3.5 py-[11px] text-[11px] leading-[1.45] text-[#9c2f24] [&_span]:mr-auto [&_span]:min-w-0 [&_span]:[overflow-wrap:anywhere]">
              <span>{error}</span>
              <Button unstyled
                className={`${BUTTON_CLASSES} flex-none border-[#e8b4ae] bg-white text-[#9c2f24]`}
                disabled={pending}
                onClick={() => { resetView(); void run({ type: 'refresh' }) }}
                type="button"
              >
                {t('reset-and-reload')}
              </Button>
            </Alert>
          )}
          {snapshot?.lastAction !== null && snapshot?.lastAction !== undefined && error === null && (
            <Alert unstyled role="status" className="mx-7 mt-[18px] rounded-[11px] border border-[#dedfe2] px-3.5 py-[11px] text-[11px] leading-[1.45] text-muted-foreground">
              {localizedHostMessage(snapshot.lastAction, t)}
            </Alert>
          )}
        </div>
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_360px] data-[detail=false]:grid-cols-[minmax(0,1fr)] max-[1050px]:grid-cols-[minmax(0,1fr)_320px] max-[820px]:block max-[820px]:overflow-auto" data-detail={String(selected !== null)}>
          <main className="min-w-0 overflow-auto px-7 pt-6 pb-10 max-[820px]:overflow-visible">
            <div className="mb-5 flex flex-wrap items-center gap-2.5">
              <div className="flex h-[38px] max-w-[460px] flex-[1_1_280px] items-center rounded-[11px] border border-[var(--dsw-alias-border-l1,#ddd)] bg-background px-[13px] [&>svg]:mr-[9px] [&>svg]:size-4 [&>svg]:fill-none [&>svg]:stroke-[1.7] [&>svg]:stroke-subtle-foreground">
                <Search aria-hidden="true" />
                <Input unstyled
                  aria-label={t('search.label')}
                  className="w-full border-0 bg-transparent font-[inherit] text-[13px] text-inherit outline-0"
                  onChange={event => { setSearch(event.target.value) }}
                  placeholder={t('search.placeholder')}
                  value={search}
                />
                {search !== '' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button unstyled className="grid size-6 flex-none cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-0 font-[15px/1_system-ui,sans-serif] text-subtle-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover,#f1f2f3)] [&_svg]:m-0 [&_svg]:size-3.5" aria-label={t('search.clear')} onClick={() => { setSearch('') }} type="button"><X aria-hidden="true" /></Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('search.clear')}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <ToggleGroup unstyled type="single" aria-label={t('installation-status')} className="flex h-[38px] max-w-full items-center overflow-x-auto rounded-[11px] border border-[var(--dsw-alias-border-l1,#ddd)] bg-[var(--dsw-alias-interactive-bg-hover,#f3f4f5)] p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:flex [&_button]:h-[30px] [&_button]:cursor-pointer [&_button]:items-center [&_button]:gap-[5px] [&_button]:whitespace-nowrap [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-2.5 [&_button]:font-[inherit] [&_button]:text-[11px] [&_button]:text-muted-foreground [&_button[data-active=true]]:bg-background [&_button[data-active=true]]:font-semibold [&_button[data-active=true]]:text-foreground [&_button[data-active=true]]:shadow-[0_1px_4px_rgba(31,35,41,0.1)] [&_span]:text-[9px] [&_span]:text-subtle-foreground" value={statusFilter} onValueChange={value => { if (value !== '') setStatusFilter(value as MarketplaceStatusFilter) }}>
                {([
                  ['all', t('all')],
                  ['installed', t('installed')],
                  ['available', t('not-installed')],
                  ['updates', t('updates')],
                  ['disabled', t('disabled')],
                ] as const).map(([value, label]) => (
                  <ToggleGroupItem unstyled data-active={String(statusFilter === value)} key={value} value={value}>
                    {label}<span>{statusCounts[value]}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <NativeSelect unstyled
                aria-label={t('plugin-category')}
                className="h-[38px] rounded-[10px] border border-[var(--dsw-alias-border-l1,#ddd)] bg-background px-[11px] font-[inherit] text-xs text-inherit"
                onChange={event => { setCategoryFilter(event.target.value) }}
                value={categoryFilter}
              >
                <NativeSelectOption value="all">{t('all-categories')}</NativeSelectOption>
                {categories.map(category => <NativeSelectOption key={category} value={category}>{category}</NativeSelectOption>)}
              </NativeSelect>
              <span className="ml-auto whitespace-nowrap text-[11px] text-subtle-foreground">
                {t('plugin-count', { count: plugins.length })}
              </span>
            </div>
            {snapshot === null || pending && snapshot.catalog.length === 0 ? (
              <Empty unstyled className="grid min-h-[340px] place-items-center text-center text-xs text-subtle-foreground">
                <EmptyHeader unstyled className="flex items-center gap-2"><Spinner />{t('loading-catalog')}</EmptyHeader>
              </Empty>
            ) : snapshot.auth.status !== 'ready' && snapshot.catalog.length === 0 ? (
              <Empty unstyled className="grid min-h-[340px] place-items-center text-center text-xs text-subtle-foreground">
                <EmptyHeader unstyled>
                  <EmptyTitle unstyled><strong>{t('github-auth-required')}</strong></EmptyTitle>
                  <EmptyDescription unstyled>{localizedAuthDetail(snapshot.auth.detail, t)}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : plugins.length === 0 ? (
              <Empty unstyled className="grid min-h-[340px] place-items-center text-center text-xs text-subtle-foreground">
                <EmptyHeader unstyled><EmptyTitle unstyled>{t('no-match')}</EmptyTitle></EmptyHeader>
              </Empty>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(235px,1fr))] gap-3">
                {plugins.map(plugin => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    selected={selectedId === plugin.id}
                    select={() => { setSelectedId(plugin.id) }}
                    t={t}
                  />
                ))}
              </div>
            )}
          </main>
          {selected !== null && snapshot !== null && (
            <PluginDetail
              bridge={bridge}
              pending={pending}
              plugin={selected}
              snapshot={snapshot}
              locale={locale}
              t={t}
              close={() => { setSelectedId(null) }}
              run={run}
            />
          )}
        </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

export function apply(ctx: ClientContext): void {
  // Three-surface adaptation: the marketplace lifecycle runs over the
  // Electron bridge, which only the desktop shell provides. On the web
  // surface the marketplace is skipped (its HTTP transport is a roadmap
  // item); the TUI surface has no browser client graph at all. Skipping
  // instead of throwing keeps a miscomposed profile from crashing the
  // client graph.
  const bridge = window.dshDesktop
  if (bridge === undefined) {
    console.info('plugin-marketplace: skipped, the plugin marketplace is desktop-only')
    return
  }
  const locale = ctx.get('locale') as LocaleService
  const sessions = ctx.get('sessions') as SessionsService
  const slots = ctx.get('slots') as SlotsService
  const t: Translate<MarketplaceMessage> = locale.bind('tockteam.plugin-marketplace')
  const view = new PluginMarketplaceViewService(bridge, locale, t, sessions)
  ctx.effect(
    () => locale.register('tockteam.plugin-marketplace', MARKETPLACE_MESSAGES),
    'tockteam-desktop: marketplace dictionaries',
  )
  slots.inject('sidebar.footer.action', () => slots.register({
    name: 'sidebar.footer.action',
    id: 'tockteam-plugin-marketplace',
    order: 80,
    locale: 'tockteam.plugin-marketplace',
    inject: () => ({ locale, t, view }),
  }, MarketplaceNavigationEntry))
  ctx.effect(() => {
    let disposed = false
    let disposeProvider: (() => Promise<void> | void) | void
    void bridge.getInfo().then(info => {
      if (disposed || info.preview !== null) return
      view.mount()
      disposeProvider = ctx.reflect.provide('pluginMarketplace', view, undefined)
    }).catch((error: unknown) => {
      console.error('plugin-marketplace: failed to inspect the desktop window', error)
    })
    return () => {
      disposed = true
      view.dispose()
      if (typeof disposeProvider === 'function') void disposeProvider()
    }
  }, 'tockteam-desktop: plugin marketplace')
}
