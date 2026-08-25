import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelectOption } from '@tockteam/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@tockteam/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@tockteam/ui/tooltip'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ChevronDown, ChevronUp, Plus, Type, X } from 'lucide-react'
import { TerminalView } from './TerminalView.tsx'
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  MAX_PANEL_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_PANEL_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  nextTabId,
  tabLabelFromCwd,
  type DockStore,
} from './panel-store.ts'
import { DEFAULT_TAB_LABEL } from './panel-store.ts'
import type { LocaleService, Translate } from '../../../shared/i18n.ts'
import { useTranslate } from '../../../shared/use-i18n.ts'
import type { TerminalMessage } from './i18n.ts'

export interface TerminalPanelProps {
  locale: LocaleService
  t: Translate<TerminalMessage>
  store: DockStore
  scopeKey: string
  cwd: string | null
  active: boolean
}

export function openOrToggleTerminal(store: DockStore): void {
  const state = store.getState()
  if (state.tabs.length === 0) {
    store.dispatch({ type: 'set-collapsed', collapsed: false })
    store.dispatch({ type: 'add-tab', id: nextTabId() })
    return
  }
  store.dispatch({ type: 'toggle-collapsed' })
}

/** Bottom dock adapted from dsh-web-panel and owned by TockTeam Desktop. */
export function TerminalPanel({ locale, t: translate, store, scopeKey, cwd, active }: TerminalPanelProps): JSX.Element {
  const t = useTranslate(locale, translate)
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const [resizing, setResizing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fontFamilyDraft, setFontFamilyDraft] = useState(state.fontFamily)
  const fontPresetListId = `tockteam-terminal-fonts-${encodeURIComponent(scopeKey)}`

  useEffect(() => { setFontFamilyDraft(state.fontFamily) }, [state.fontFamily])
  useEffect(() => {
    if (!active) return
    const handleShortcut = (event: KeyboardEvent): void => {
      if (document.documentElement.dataset.tockteamTocktutorActive === 'true'
        || !event.ctrlKey || event.key !== '`') return
      event.preventDefault()
      openOrToggleTerminal(store)
    }
    window.addEventListener('keydown', handleShortcut)
    return () => { window.removeEventListener('keydown', handleShortcut) }
  }, [active, store])

  const addTab = (): void => {
    store.dispatch({ type: 'set-collapsed', collapsed: false })
    store.dispatch({ type: 'add-tab', id: nextTabId() })
  }
  const commitFontFamily = (): void => {
    store.dispatch({ type: 'set-font-family', fontFamily: fontFamilyDraft })
  }
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startY = event.clientY
    const startSize = state.size
    setResizing(true)
    const move = (next: PointerEvent): void => {
      const available = Math.max(MIN_PANEL_SIZE, window.innerHeight - 190)
      store.dispatch({ type: 'set-size', size: Math.min(available, startSize + startY - next.clientY) })
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      setResizing(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }
  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    store.dispatch({ type: 'set-size', size: state.size + (event.key === 'ArrowUp' ? 24 : -24) })
  }

  return (
    <TooltipProvider>
      <section
      className="group/terminal relative flex min-w-0 flex-none flex-col box-border border-t border-[var(--tockteam-shell-divider,var(--dsw-alias-border-l2,rgba(0,0,0,0.1)))] bg-surface text-foreground [-webkit-app-region:no-drag]"
      data-tockteam-terminal-dock=""
      data-collapsed={state.collapsed || undefined}
      aria-label={t('terminal')}
    >
      {!state.collapsed && (
        <div
          className="relative z-[1] h-2 flex-none touch-none cursor-ns-resize bg-surface after:absolute after:top-0.5 after:left-1/2 after:h-[3px] after:w-8 after:-translate-x-1/2 after:rounded-full after:bg-[var(--dsw-alias-label-dimmed,#8c959f)] after:opacity-50 after:content-[''] hover:after:bg-brand hover:after:opacity-100 focus-visible:after:bg-brand focus-visible:after:opacity-100"
          role="separator"
          aria-label={t('terminal.resize')}
          aria-orientation="horizontal"
          aria-valuemin={MIN_PANEL_SIZE}
          aria-valuemax={MAX_PANEL_SIZE}
          aria-valuenow={state.size}
          tabIndex={0}
          onPointerDown={beginResize}
          onKeyDown={resizeWithKeyboard}
        />
      )}
      <div className="flex h-[34px] flex-none items-center justify-between gap-2 box-border border-b border-[var(--dsw-alias-border-l1,rgba(0,0,0,0.07))] bg-surface-muted px-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-[3px] overflow-x-auto [scrollbar-width:none]">
          {state.tabs.length > 0 && (
            <div className="contents" role="tablist" aria-label={t('terminal.tabs')}>
              {state.tabs.map(tab => (
                <span
                  key={tab.id}
                  role="tab"
                  aria-selected={tab.id === state.activeTabId}
                  className={`inline-flex h-6 max-w-[180px] cursor-default select-none items-center gap-[5px] whitespace-nowrap rounded-md px-1.5 box-border text-muted-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] ${tab.id === state.activeTabId ? 'bg-[var(--dsw-alias-interactive-bg-active,rgba(0,0,0,0.08))] text-foreground' : ''}`}
                  onClick={() => { store.dispatch({ type: 'activate-tab', id: tab.id }) }}
                >
                  <span className={`size-[5px] flex-none rounded-full ${tab.status === 'ready' ? 'bg-[#2da44e]' : tab.status === 'error' ? 'bg-[#cf222e]' : 'bg-[#8c959f]'}`} aria-hidden="true" />
                  <span className="min-w-0 overflow-hidden text-ellipsis">
                    {tab.label === DEFAULT_TAB_LABEL ? t('terminal.shell') : tab.label}
                    {tab.status === 'exited'
                      ? ` · ${t('terminal.status.exited')}`
                      : tab.status === 'error' ? ` · ${t('terminal.status.error')}` : ''}
                  </span>
                  <Button unstyled
                    type="button"
                    className="grid size-[15px] cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 font-[inherit] leading-none text-[var(--dsw-alias-label-dimmed,#8c959f)] hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.06))] hover:text-foreground [&_svg]:size-[11px]"
                    aria-label={t('terminal.close-tab', { tab: tab.label })}
                    onClick={(event) => {
                      event.stopPropagation()
                      store.dispatch({ type: 'remove-tab', id: tab.id })
                    }}
                  ><X aria-hidden="true" /></Button>
                </span>
              ))}
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button unstyled
                type="button"
                className="size-[22px] flex-none cursor-pointer rounded-md border-0 bg-transparent p-0 font-[inherit] text-[15px] text-muted-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.06))] hover:text-foreground [&_svg]:size-[15px]"
                onClick={addTab}
                aria-label={t('terminal.new-shell')}
              ><Plus aria-hidden="true" /></Button>
            </TooltipTrigger>
            <TooltipContent>{t('terminal.new-shell')}</TooltipContent>
          </Tooltip>
          {state.tabs.length === 0 && <span className="select-none pl-0.5 text-[var(--dsw-alias-label-dimmed,#8c959f)]">{t('terminal')}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button unstyled
                    type="button"
                    className="h-6 w-[27px] cursor-pointer rounded-md border-0 bg-transparent p-0 font-[inherit] text-muted-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.06))] hover:text-foreground [&_svg]:size-[15px]"
                    aria-label={t('terminal.font-settings')}
                  ><Type aria-hidden="true" /></Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{t('terminal.font')}</TooltipContent>
            </Tooltip>
            <PopoverContent
              unstyled
              align="end"
              aria-label={t('terminal.font-settings')}
              className="z-50 grid w-[min(360px,calc(100vw-16px))] gap-3 box-border rounded-[9px] border border-border bg-surface-muted p-3.5 text-xs text-foreground shadow-[0_10px_28px_rgba(0,0,0,0.16)] outline-none"
              side={state.collapsed ? 'top' : 'bottom'}
              sideOffset={10}
            >
              <div className="flex items-center justify-between gap-2.5">
                <strong>{t('terminal.font')}</strong>
                <Button unstyled className="cursor-pointer border-0 bg-transparent px-[5px] py-0.5 font-[inherit] text-base text-muted-foreground [&_svg]:size-[15px]" type="button" onClick={() => { setSettingsOpen(false) }} aria-label={t('terminal.close-settings')}><X aria-hidden="true" /></Button>
              </div>
              <Label unstyled className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5 text-muted-foreground">
                <span>{t('terminal.font-family')}</span>
                <Input unstyled
                  className="h-7 min-w-0 box-border rounded-md border border-border bg-surface px-2 font-[inherit] text-foreground"
                  type="text"
                  list={fontPresetListId}
                  value={fontFamilyDraft}
                  onChange={event => { setFontFamilyDraft(event.currentTarget.value) }}
                  onBlur={commitFontFamily}
                  onKeyDown={event => {
                    if (event.key !== 'Enter') return
                    commitFontFamily()
                    event.currentTarget.blur()
                  }}
                />
                <datalist id={fontPresetListId}>
                  <NativeSelectOption value={DEFAULT_TERMINAL_FONT_FAMILY} />
                  <NativeSelectOption value="'JetBrains Mono', ui-monospace, monospace" />
                  <NativeSelectOption value="'Maple Mono', ui-monospace, monospace" />
                  <NativeSelectOption value="'Fira Code', ui-monospace, monospace" />
                </datalist>
              </Label>
              <Label unstyled className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5 text-muted-foreground">
                <span>{t('terminal.font-size')}</span>
                <Input unstyled
                  className="h-7 min-w-0 box-border rounded-md border border-border bg-surface px-2 font-[inherit] text-foreground"
                  type="number"
                  min={MIN_TERMINAL_FONT_SIZE}
                  max={MAX_TERMINAL_FONT_SIZE}
                  value={state.fontSize}
                  onChange={event => { store.dispatch({ type: 'set-font-size', fontSize: event.currentTarget.valueAsNumber }) }}
                />
              </Label>
              <div className="flex items-center justify-between gap-2.5 text-[var(--dsw-alias-label-dimmed,#8c959f)]">
                <span>{MIN_TERMINAL_FONT_SIZE}–{MAX_TERMINAL_FONT_SIZE}px</span>
                <Button unstyled className="cursor-pointer rounded-md border border-border bg-transparent px-[9px] py-1 font-[inherit] text-foreground" type="button" onClick={() => { store.dispatch({ type: 'reset-font' }) }}>{t('terminal.reset')}</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button unstyled
                type="button"
                className="h-6 w-[27px] cursor-pointer rounded-md border-0 bg-transparent p-0 font-[inherit] text-muted-foreground hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.06))] hover:text-foreground [&_svg]:size-[15px]"
                onClick={() => { store.dispatch({ type: 'toggle-collapsed' }) }}
                aria-label={state.collapsed ? t('terminal.expand') : t('terminal.collapse')}
              >{state.collapsed
                ? <ChevronUp aria-hidden="true" />
                : <ChevronDown aria-hidden="true" />}</Button>
            </TooltipTrigger>
            <TooltipContent>{state.collapsed ? t('terminal.expand') : t('terminal.collapse')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div
        className={`flex max-h-[calc(100vh-190px)] min-h-0 flex-none flex-col overflow-hidden bg-surface transition-[height] duration-150 ease-in motion-reduce:transition-none ${resizing ? 'select-none transition-none' : ''}`}
        style={{ height: state.collapsed ? 0 : state.size }}
        aria-hidden={state.collapsed}
        {...(state.collapsed ? { inert: '' } : {})}
      >
        {state.tabs.map(tab => (
          <div
            key={tab.id}
            className={`h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden ${tab.id === state.activeTabId ? 'flex' : 'hidden'}`}
            aria-hidden={tab.id !== state.activeTabId}
          >
            <TerminalView
              sessionId={scopeKey}
              tabId={tab.id}
              cwd={cwd}
              fontFamily={state.fontFamily}
              fontSize={state.fontSize}
              onReady={readyCwd => {
                store.dispatch({ type: 'rename-tab', id: tab.id, label: tabLabelFromCwd(readyCwd) })
              }}
              onStatus={(status, exitCode) => {
                store.dispatch({
                  type: 'update-tab',
                  id: tab.id,
                  status,
                  ...(exitCode === undefined ? {} : { exitCode }),
                })
              }}
              t={t}
            />
          </div>
        ))}
        {state.tabs.length === 0 && (
          <div className="flex flex-1 items-center justify-center gap-2.5 text-xs text-[var(--dsw-alias-label-dimmed,#8c959f)]">
            <span>{t('terminal.empty')}</span>
            <Button unstyled className="cursor-pointer rounded-md border border-border bg-transparent px-[9px] py-1 font-[inherit] text-foreground" type="button" onClick={addTab}>{t('terminal.new-shell')}</Button>
          </div>
        )}
      </div>
      </section>
    </TooltipProvider>
  )
}
