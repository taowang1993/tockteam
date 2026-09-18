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
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Search, X } from 'lucide-react'
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
import {
  deriveMarketplaceCatalogView,
  type MarketplaceStatusFilter,
} from './catalog-view.ts'
import { MARKETPLACE_MESSAGES, type MarketplaceMessage } from './i18n.ts'

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
}

interface MarketplaceSettingsProps {
  bridge: DesktopBridge
  locale: LocaleService
  translate: Translate<MarketplaceMessage>
}

interface SlotsService {
  inject(name: string, register: () => unknown): void
  register(options: {
    id: string
    inject(): MarketplaceSettingsProps
    label: () => string
    locale: string
    name: string
    order: number
  }, component: (props: MarketplaceSettingsProps) => JSX.Element): unknown
}

declare global {
  interface Window {
    dshDesktop?: DesktopBridge
  }
}

export const inject = ['locale', 'slots']

const BUTTON_CLASSES = 'min-h-9 cursor-pointer rounded-[8px] border border-border bg-surface px-[15px] font-[inherit] text-xs font-[570] text-inherit hover:bg-surface-muted disabled:cursor-default disabled:opacity-45 data-[primary=true]:border-brand data-[primary=true]:bg-brand data-[primary=true]:text-brand-foreground data-[danger=true]:border-destructive data-[danger=true]:text-destructive'
const ICON_BUTTON_CLASSES = 'grid size-9 cursor-pointer place-items-center rounded-[8px] border border-border bg-surface p-0 font-[inherit] text-inherit hover:bg-surface-muted disabled:cursor-default disabled:opacity-45 [&_svg]:size-[18px]'
const PILL_CLASSES = 'inline-flex min-h-[21px] items-center rounded-full bg-surface-muted px-2 text-[9px] font-semibold text-muted-foreground data-[installed=true]:bg-[color-mix(in_srgb,var(--dsw-alias-state-success-primary)_12%,transparent)] data-[installed=true]:text-success data-[update=true]:bg-[color-mix(in_srgb,var(--dsw-alias-brand-primary)_12%,transparent)] data-[update=true]:text-brand data-[unsupported=true]:bg-[color-mix(in_srgb,var(--dsw-alias-state-warn-primary)_12%,transparent)] data-[unsupported=true]:text-warning data-[protected=true]:bg-[color-mix(in_srgb,var(--dsw-alias-brand-primary)_12%,transparent)] data-[protected=true]:text-brand'

function shortCommit(commit: string): string {
  return commit.slice(0, 10)
}

function formatDate(value: string | null, locale: string, unknown: string): string {
  if (value === null) return unknown
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString(locale) : unknown
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
  detailsId,
  plugin,
  selected,
  select,
  t,
}: {
  detailsId: string
  plugin: MarketplacePlugin
  selected: boolean
  select(): void
  t: Translate<MarketplaceMessage>
}): JSX.Element {
  return (
    <Button unstyled
      aria-controls={selected ? detailsId : undefined}
      aria-expanded={selected}
      className="relative flex min-h-44 cursor-pointer flex-col rounded-xl border border-border bg-surface p-4 text-left text-inherit transition-[background-color,border-color] duration-[120ms] ease-out hover:bg-surface-muted data-[selected=true]:border-brand data-[selected=true]:bg-surface-muted motion-reduce:transition-none"
      data-selected={String(selected)}
      data-tockteam-marketplace-plugin={plugin.id}
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
  id,
  pending,
  plugin,
  snapshot,
  locale,
  t,
  close,
  run,
}: {
  bridge: DesktopBridge
  id: string
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
      aria-label={t('details', { plugin: plugin.title })}
      className="min-w-0 overflow-auto border-l border-border bg-surface max-[820px]:border-t max-[820px]:border-l-0"
      id={id}
    >
      <div className="px-6 pt-[25px] pb-[38px]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button unstyled aria-label={t('close-details')} className={`${ICON_BUTTON_CLASSES} float-right`} onClick={close} type="button"><X aria-hidden="true" /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('close-details')}</TooltipContent>
        </Tooltip>
        <h2 className="mt-px mr-[42px] mb-1 text-[19px] leading-[1.3]">{plugin.title}</h2>
        <Badge unstyled className={PILL_CLASSES} data-installed={String(plugin.installed)}>
          {plugin.installed ? t('installed') : mechanismLabel(plugin, t)}
        </Badge>
        <p className="my-[18px] text-xs leading-[1.6] text-muted-foreground">{plugin.description}</p>
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-2.5 border-y border-border py-4 text-[10px] [&_dt]:text-subtle-foreground [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:[overflow-wrap:anywhere]">
          <dt>{t('category')}</dt><dd>{plugin.category}</dd>
          <dt>{t('mechanism')}</dt><dd>{mechanismLabel(plugin, t)}</dd>
          <dt>{t('updated')}</dt>
          <dd>{formatDate(plugin.stats?.updatedAt ?? plugin.pushedAt, localeTag(locale), t('unknown'))}</dd>
          <dt>{t('stars')}</dt><dd>{plugin.stats?.stars.toLocaleString(localeTag(locale)) ?? t('unknown')}</dd>
          <dt>{t('forks')}</dt><dd>{plugin.stats?.forks.toLocaleString(localeTag(locale)) ?? t('unknown')}</dd>
          <dt>{t('open-issues')}</dt><dd>{plugin.stats?.openIssues.toLocaleString(localeTag(locale)) ?? t('unknown')}</dd>
          <dt>{t('language')}</dt><dd>{plugin.stats?.language ?? t('unknown')}</dd>
          <dt>{t('license')}</dt><dd>{plugin.stats?.license ?? t('unknown')}</dd>
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
              onClick={() => { if (plan !== null) void run({
                type: 'preview',
                confirmations,
                expectedPlan: {
                  action: plan.action,
                  manifestHash: plan.manifestHash,
                  pluginId: plan.pluginId,
                  resolvedCommit: plan.resolvedCommit,
                },
              }) }}
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

function MarketplaceSurface({ bridge, locale, translate }: MarketplaceSettingsProps): JSX.Element {
  const t = useTranslate(locale, translate)
  const detailsId = useId()
  const [available, setAvailable] = useState(false)
  const [snapshot, setSnapshot] = useState<MarketplaceSnapshot | null>(null)
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MarketplaceStatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showBuiltins, setShowBuiltins] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const requestedStats = useRef(new Set<string>())

  const run = useCallback(async (command: MarketplaceCommand): Promise<void> => {
    if (command.type === 'refresh') requestedStats.current.clear()
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
    void bridge.getInfo().then(info => {
      if (alive && info.preview === null) setAvailable(true)
    }).catch((error: unknown) => {
      if (alive) setLocalError(error instanceof Error ? error.message : String(error))
    })
    return () => { alive = false }
  }, [bridge])

  useEffect(() => {
    if (!available) return
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
  }, [available, bridge])

  const catalogView = useMemo(() => deriveMarketplaceCatalogView(
    snapshot?.catalog ?? [],
    { categoryFilter, search, showBuiltins, statusFilter },
  ), [categoryFilter, search, showBuiltins, snapshot?.catalog, statusFilter])
  const { categories, plugins, statusCounts } = catalogView
  const selected = plugins.find(plugin => plugin.id === selectedId) ?? null
  const error = localError ?? snapshot?.error ?? null
  const preview = snapshot?.preview ?? null
  useEffect(() => {
    if (selected === null || selected.stats !== null || requestedStats.current.has(selected.id)) return
    requestedStats.current.add(selected.id)
    void run({ type: 'load-repository-stats', pluginId: selected.id })
  }, [run, selected])
  const resetView = (): void => {
    setSearch('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setSelectedId(null)
  }
  const setBuiltinsVisible = (visible: boolean): void => {
    setShowBuiltins(visible)
    if (visible) return
    const hiddenView = deriveMarketplaceCatalogView(snapshot?.catalog ?? [], {
      categoryFilter,
      search,
      showBuiltins: false,
      statusFilter,
    })
    if (hiddenView.categoryFilter !== categoryFilter) {
      setCategoryFilter(hiddenView.categoryFilter)
    }
    if (selectedId !== null
      && !hiddenView.visibleCatalog.some(plugin => plugin.id === selectedId)) {
      setSelectedId(null)
    }
  }

  if (!available) return <></>

  return (
    <TooltipProvider>
      <div className="min-w-0 bg-surface text-foreground [-webkit-app-region:no-drag]" data-tockteam-plugin-marketplace-settings="">
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <div>
          <header className="flex min-h-14 items-center justify-end gap-3.5 border-b border-border">
            <div className="flex items-center gap-2">
              {snapshot?.undoAvailable === true && (
                <Button unstyled className={BUTTON_CLASSES} disabled={pending} onClick={() => { void run({ type: 'undo' }) }} type="button">
                  {t('undo-last-apply')}
                </Button>
              )}
              <Button unstyled className={BUTTON_CLASSES} disabled={pending} onClick={() => { void run({ type: 'refresh' }) }} type="button">
                {pending ? t('working') : t('refresh')}
              </Button>
            </div>
          </header>
          {preview !== null && (
            <Alert unstyled role="status" className="mx-7 mt-3.5 flex flex-wrap items-center gap-2.5 rounded-[11px] border border-[#bcd0fa] bg-[#f2f6ff] px-3.5 py-[11px] text-[11px] leading-[1.45] text-[#244f9e] dark:border-[#395993] dark:bg-[#182744] dark:text-[#a9c4ff] [&_strong]:mr-auto">
              <strong>{t('preview.running', { plugin: preview.pluginId })}</strong>
              <Button unstyled className={BUTTON_CLASSES} disabled={pending} onClick={() => { void run({ type: 'discard' }) }} type="button">
                {t('discard')}
              </Button>
              <Button unstyled className={BUTTON_CLASSES} data-primary="true" disabled={pending} onClick={() => { void run({ type: 'apply', expectedTransactionId: preview.transactionId }) }} type="button">
                {t('apply-action', { action: t(`action.${preview.action}`) })}
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
          <main className="min-w-0 px-0 pt-6 pb-10">
            <div className="mb-5 flex flex-wrap items-center gap-2.5">
              <div className="flex h-[38px] max-w-[460px] flex-[1_1_280px] items-center rounded-[8px] border border-border bg-surface-muted px-[13px] [&>svg]:mr-[9px] [&>svg]:size-4 [&>svg]:fill-none [&>svg]:stroke-[1.7] [&>svg]:stroke-subtle-foreground">
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
              <ToggleGroup unstyled type="single" aria-label={t('installation-status')} className="flex h-[38px] max-w-full items-center overflow-x-auto rounded-[8px] bg-surface-muted p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:flex [&_button]:h-[30px] [&_button]:cursor-pointer [&_button]:items-center [&_button]:gap-[5px] [&_button]:whitespace-nowrap [&_button]:rounded-md [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-2.5 [&_button]:font-[inherit] [&_button]:text-[11px] [&_button]:text-muted-foreground [&_button[data-active=true]]:bg-surface [&_button[data-active=true]]:font-semibold [&_button[data-active=true]]:text-foreground [&_span]:text-[9px] [&_span]:text-subtle-foreground" value={statusFilter} onValueChange={value => { if (value !== '') setStatusFilter(value as MarketplaceStatusFilter) }}>
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
                className="h-[38px] rounded-[8px] border border-border bg-surface-muted px-[11px] font-[inherit] text-xs text-inherit"
                onChange={event => { setCategoryFilter(event.target.value) }}
                value={catalogView.categoryFilter}
              >
                <NativeSelectOption value="all">{t('all-categories')}</NativeSelectOption>
                {categories.map(category => <NativeSelectOption key={category} value={category}>{category}</NativeSelectOption>)}
              </NativeSelect>
              <Label unstyled className="inline-flex h-[38px] cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                <Checkbox
                  aria-label={t('show-builtins')}
                  checked={showBuiltins}
                  onCheckedChange={checked => { setBuiltinsVisible(checked === true) }}
                />
                <span>{t('show-builtins')}</span>
              </Label>
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
                    detailsId={detailsId}
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
              id={detailsId}
              pending={pending}
              plugin={selected}
              snapshot={snapshot}
              locale={locale}
              t={t}
              close={() => {
                const pluginId = selected.id
                setSelectedId(null)
                requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(
                  `[data-tockteam-marketplace-plugin="${CSS.escape(pluginId)}"]`,
                )?.focus())
              }}
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
  const slots = ctx.get('slots') as SlotsService
  const t: Translate<MarketplaceMessage> = locale.bind('tockteam.plugin-marketplace')
  ctx.effect(
    () => locale.register('tockteam.plugin-marketplace', MARKETPLACE_MESSAGES),
    'tockteam-desktop: marketplace dictionaries',
  )
  slots.inject('settings.plugins.tab', () => slots.register({
    name: 'settings.plugins.tab',
    id: 'tockteam-plugin-marketplace',
    order: -10,
    label: () => t('marketplace'),
    locale: 'tockteam.plugin-marketplace',
    inject: () => ({ bridge, locale, translate: t }),
  }, MarketplaceSurface))
}
