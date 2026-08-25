import { Button } from '@tockteam/ui/button'
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import { Check } from 'lucide-react'
import type { LocaleService, Translate } from '../../../shared/i18n.ts'
import {
  DESKTOP_SKINS_MESSAGES,
  type DesktopSkinsMessage,
} from './i18n.ts'
import {
  DesktopSkinsController,
  matchesThemeHotkey,
  type DesktopSkinsSnapshot,
  type ThemeService,
  type ThemeSnapshot,
} from './skin-controller.ts'
import { SkinDomPresenter } from './skin-dom.ts'
import {
  DesktopSkinPreferencesStorage,
  type PreferencesFetch,
} from './preferences-storage.ts'
import { DESKTOP_SKINS, type DesktopSkin } from './skins.ts'

interface BoundSkinActions {
  sync(activeId: string, ready: boolean, revision: number): void
}

interface SkinRowState {
  activeId: string
  ready: boolean
  revision: number
}

interface SkinRowProps {
  setSkin(id: string | null): void
  t: Translate<DesktopSkinsMessage>
  useStore<T>(selector: (state: SkinRowState) => T): T
}

interface SlotsService {
  inject(name: string, register: () => unknown): void
  register(options: {
    id: string
    inject(actions: BoundSkinActions): { setSkin(id: string | null): void }
    locale: string
    name: string
    order: number
    store: unknown
  }, component: (props: SkinRowProps) => JSX.Element): unknown
}

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
  on(event: 'theme/change', listener: (snapshot: ThemeSnapshot) => void): (() => void) | void
  reflect: {
    provide(name: string, value: unknown, options?: unknown): (() => Promise<void> | void) | void
  }
}

interface SkinOption {
  id: string | null
  label: DesktopSkinsMessage
  mode: DesktopSkinsMessage
  preview: string
  accent: string
}

export const inject = ['locale', 'slots', 'theme']

const SETTINGS_NAMESPACE = 'tockteam.skins'
const SETTINGS_STYLE_ATTRIBUTE = 'data-tockteam-skins'

const DEFAULT_OPTION: SkinOption = {
  id: null,
  label: 'skins.name.default',
  mode: 'skins.mode.system',
  preview: 'linear-gradient(135deg, #fafafa 0 49%, #30343b 50% 100%)',
  accent: '#80868f',
}

function optionFor(skin: DesktopSkin): SkinOption {
  return {
    id: skin.id,
    label: skin.label,
    mode: skin.colorScheme === 'light' ? 'skins.mode.light' : 'skins.mode.dark',
    preview: skin.preview,
    accent: skin.accent,
  }
}

const OPTIONS = [DEFAULT_OPTION, ...DESKTOP_SKINS.map(optionFor)]

function SkinSettingsRow({ setSkin, t, useStore }: SkinRowProps): JSX.Element {
  const activeId = useStore(state => state.activeId)
  const ready = useStore(state => state.ready)
  return (
    <div className="flex flex-col gap-2.5 border-b border-border py-4">
      <div className="flex flex-col gap-0.5">
        <div className="text-sm font-medium leading-[22px] text-foreground">{t('skins.title')}</div>
        <div className="text-xs leading-[18px] text-subtle-foreground">{t('skins.description')}</div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(126px,1fr))] gap-[9px] max-[720px]:grid-cols-2">
        {OPTIONS.map(option => {
          const selected = activeId === (option.id ?? '')
          return (
            <Button unstyled
              key={option.id ?? 'default'}
              type="button"
              className="relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[14px] border border-border bg-surface p-0 text-left font-[inherit] text-foreground transition-[border-color,box-shadow,transform] duration-[120ms] ease-in-out hover:-translate-y-px hover:border-border-strong disabled:cursor-wait disabled:opacity-[.58] disabled:transform-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand data-[selected=true]:border-brand data-[selected=true]:shadow-[0_0_0_1px_var(--dsw-alias-brand-primary)] motion-reduce:transition-none"
              data-selected={selected}
              aria-label={t(option.label)}
              aria-pressed={selected}
              disabled={!ready}
              onClick={() => { setSkin(option.id) }}
            >
              <span
                className="block aspect-video w-full border-b border-[var(--dsw-alias-border-l1)] bg-cover bg-center"
                style={{ background: option.preview }}
              />
              <span className="grid grid-cols-[9px_minmax(0,1fr)_auto] items-center gap-1.5 px-[9px] pt-2 pb-[9px]">
                <span className="size-2 rounded-full" style={{ background: option.accent }} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-semibold leading-[17px]">{t(option.label)}</span>
                  <span className="truncate text-[10px] leading-[14px] text-subtle-foreground">{t(option.mode)}</span>
                </span>
                {selected && (
                  <span className="grid size-[18px] place-items-center rounded-full bg-brand text-brand-foreground [&_svg]:size-3 [&_svg]:stroke-[2.5]" title={t('skins.selected')}><Check aria-hidden="true" /></span>
                )}
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function installSettingsStyles(): () => void {
  const style = document.createElement('style')
  style.setAttribute(SETTINGS_STYLE_ATTRIBUTE, 'true')
  style.textContent = __TOCKTEAM_TAILWIND_CSS__
  document.head.append(style)
  return () => { style.remove() }
}

function syncActions(
  actions: BoundSkinActions | undefined,
  snapshot: DesktopSkinsSnapshot,
  ready: boolean,
): void {
  actions?.sync(snapshot.activeId ?? '', ready, snapshot.revision)
}

export function apply(ctx: ClientContext): void {
  const locale = ctx.get('locale') as LocaleService
  const slots = ctx.get('slots') as SlotsService
  const theme = ctx.get('theme') as ThemeService

  ctx.effect(
    () => locale.register('tockteam.skins', DESKTOP_SKINS_MESSAGES),
    'tockteam-skins: dictionaries',
  )
  ctx.effect(
    () => typeof document === 'undefined' ? undefined : installSettingsStyles(),
    'tockteam-skins: Tailwind utilities',
  )

  const storage = typeof fetch === 'undefined'
    ? memoryStorage()
    : new DesktopSkinPreferencesStorage(fetch.bind(globalThis) as PreferencesFetch)
  const controller = new DesktopSkinsController(
    theme,
    storage,
    new SkinDomPresenter(typeof document === 'undefined' ? undefined : document),
  )
  const store = defineStore<SkinRowState>({
    init: () => ({ activeId: '', ready: false, revision: -1 }),
    actions: {
      sync: (draft, activeId: string, ready: boolean, revision: number) => {
        if (revision < draft.revision) return
        draft.activeId = activeId
        draft.ready = ready
        draft.revision = revision
      },
    },
  })
  let bound: BoundSkinActions | undefined
  let ready = false

  ctx.effect(() => {
    let disposed = false
    let started = false
    let stopTheme: (() => void) | void
    let stopController: (() => void) | undefined
    let removeService: (() => Promise<void> | void) | void
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!ready || !matchesThemeHotkey(event)) return
      event.preventDefault()
      event.stopPropagation()
      controller.toggleTheme()
    }
    if (typeof window !== 'undefined') window.addEventListener('keydown', handleKeyDown, true)
    const boot = async (): Promise<void> => {
      if (storage instanceof DesktopSkinPreferencesStorage) {
        try {
          await storage.load()
        } catch (error) {
          console.error('skins: failed to load preferences', error)
        }
      }
      if (disposed) return
      controller.start()
      started = true
      ready = true
      stopTheme = ctx.on('theme/change', snapshot => { controller.adopt(snapshot) })
      stopController = controller.subscribe(() => {
        syncActions(bound, controller.getSnapshot(), true)
      })
      removeService = ctx.reflect.provide('desktopSkins', controller, undefined)
      syncActions(bound, controller.getSnapshot(), true)
    }
    void boot()
    return () => {
      disposed = true
      ready = false
      if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKeyDown, true)
      stopTheme?.()
      stopController?.()
      if (started) controller.dispose()
      void removeService?.()
    }
  }, 'tockteam-skins: controller')

  slots.inject('settings.general.item', () => slots.register({
    name: 'settings.general.item',
    id: 'tockteam-skins',
    order: 20,
    store,
    locale: SETTINGS_NAMESPACE,
    inject: actions => {
      bound = actions
      syncActions(bound, controller.getSnapshot(), ready)
      return { setSkin: id => { if (ready) controller.setSkin(id) } }
    },
  }, SkinSettingsRow))
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => { values.clear() },
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}
