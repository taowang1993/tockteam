import { Button } from '@tockteam/ui/button'
import { X } from 'lucide-react'
import type { RoutePaneSummary, TockTutorRouteViewProps } from './route.tsx'

export function PaneTabs({ pane, onActivateTab, onCloseTab, onMoveTab, paneController }: Pick<TockTutorRouteViewProps, 'onActivateTab' | 'onCloseTab' | 'onMoveTab' | 'paneController'> & { pane: RoutePaneSummary }) {
  const fileName = (path: string) => path.split('/').at(-1) ?? path
  return <div className="tocktutor-tabs -mx-[var(--tt-tab-curve)] -mb-px flex min-w-0 self-stretch items-end gap-1 overflow-x-auto overflow-y-hidden px-[var(--tt-tab-curve)] [--tt-tab-curve:16px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" {...(pane.tabs.length ? { 'aria-label': 'Note Tabs', role: 'tablist' } : {})}>
    {pane.tabs.map((tab, index) => <div
      className="group/tab relative z-1 -mb-px flex h-[34px] min-w-[118px] max-w-[220px] items-center gap-2 rounded-t-[5px] border border-b-0 border-transparent bg-[var(--tt-panel)] pr-2.5 pl-3 before:pointer-events-none before:absolute before:bottom-[-1px] before:left-[calc(var(--tt-tab-curve)*-1)] before:size-[var(--tt-tab-curve)] before:rounded-br-[var(--tt-tab-curve)] before:content-[''] before:[box-shadow:calc(var(--tt-tab-curve)/2)_calc(var(--tt-tab-curve)/2)_0_calc(var(--tt-tab-curve)/2)_var(--tt-panel)] after:pointer-events-none after:absolute after:right-[calc(var(--tt-tab-curve)*-1)] after:bottom-[-1px] after:size-[var(--tt-tab-curve)] after:rounded-bl-[var(--tt-tab-curve)] after:content-[''] after:[box-shadow:calc(var(--tt-tab-curve)/-2)_calc(var(--tt-tab-curve)/2)_0_calc(var(--tt-tab-curve)/2)_var(--tt-panel)] data-[active=false]:mb-0.5 data-[active=false]:h-7 data-[active=false]:rounded-[5px] data-[active=false]:border-b data-[active=false]:bg-transparent data-[active=false]:hover:bg-accent data-[active=false]:focus-within:bg-accent data-[active=false]:text-[var(--tt-muted)] data-[active=false]:shadow-none data-[active=false]:before:hidden data-[active=false]:after:hidden"
      data-active={tab.path === pane.activePath} key={tab.path} role="presentation">
      <Button unstyled aria-selected={tab.path === pane.activePath}
        className="relative z-1 flex min-w-0 flex-1 items-center self-stretch border-0 bg-transparent p-0 text-left [&>span]:truncate"
        onClick={() => { onActivateTab(pane.id, tab.path) }}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const offset = event.key === 'ArrowLeft' ? -1 : 1
          if (event.altKey) { onMoveTab?.(pane.id, tab.path, offset); return }
          const next = pane.tabs[(index + offset + pane.tabs.length) % pane.tabs.length]
          if (next) onActivateTab(pane.id, next.path)
        }}
        aria-controls={paneController ? `tocktutor-note-editor-${pane.id}` : 'tocktutor-note-editor'}
        role="tab" tabIndex={tab.path === pane.activePath ? 0 : -1} title={tab.path} type="button">
        <span>{tab.dirty && <span aria-label="Unsaved">•</span>}{fileName(tab.path)}</span>
      </Button>
      <Button unstyled aria-label={`Close ${fileName(tab.path)}`} className="pointer-events-none relative z-1 inline-flex size-5 shrink-0 translate-x-0.5 items-center justify-center rounded border-0 bg-transparent p-0 text-[var(--tt-muted)] opacity-0 group-data-[active=true]/tab:pointer-events-auto group-data-[active=true]/tab:opacity-100 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 [&_svg]:size-3!" onClick={() => { onCloseTab?.(pane.id, tab.path) }} type="button"><X aria-hidden="true" /></Button>
    </div>)}
  </div>
}
