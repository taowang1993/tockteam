import type { ReactNode } from 'react'
import { BookmarkPlus, Copy, ExternalLink, FileClock, FolderInput, FolderOpen, Merge, PanelsTopLeft, Pencil, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@tockteam/ui/dropdown-menu'

export type SidebarNoteAction = 'tab' | 'right' | 'open-window' | 'duplicate' | 'move' | 'bookmark' | 'merge' | 'copy-relative' | 'copy-absolute' | 'recovery' | 'open-default' | 'reveal' | 'rename' | 'trash'
export interface NoteMenuAnchor { x: number; y: number; row: HTMLElement }

/** The shared menu owns focus, keyboard navigation, dismissal and collision handling. */
export function SidebarNoteMenu(props: {
  anchor: NoteMenuAnchor
  bookmarked: boolean
  markdown: boolean
  nativeAvailable: boolean
  onAction(action: SidebarNoteAction): void
  onClose(): void
}): ReactNode {
  const item = (action: SidebarNoteAction, label: string, icon: ReactNode, disabled = false): ReactNode => (
    <DropdownMenuItem disabled={disabled} onSelect={() => props.onAction(action)}>{icon}<span>{label}</span></DropdownMenuItem>
  )
  return <DropdownMenu open modal={false} onOpenChange={open => { if (!open) props.onClose() }}>
    <DropdownMenuTrigger aria-hidden tabIndex={-1} className="pointer-events-none fixed size-0 border-0 p-0 opacity-0" style={{ left: props.anchor.x, top: props.anchor.y }} />
    <DropdownMenuContent aria-labelledby={undefined} aria-label="Note Actions" className="min-w-60" sideOffset={0} collisionPadding={8}
      onCloseAutoFocus={event => { event.preventDefault(); if (props.anchor.row.isConnected) props.anchor.row.focus() }}>
      <DropdownMenuGroup>
        {item('tab', 'Open in New Tab', <PanelsTopLeft aria-hidden />)}
        {item('right', 'Open to the Right', <PanelsTopLeft aria-hidden />)}
        {item('open-window', 'Open in New Window', <ExternalLink aria-hidden />, !props.nativeAvailable)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {item('duplicate', 'Duplicate', <Copy aria-hidden />)}
        {item('move', 'Move Note…', <FolderInput aria-hidden />, !props.markdown)}
        {item('bookmark', props.bookmarked ? 'Edit Bookmark…' : 'Bookmark Note…', <BookmarkPlus aria-hidden />)}
        {item('merge', 'Merge Entire File With…', <Merge aria-hidden />, !props.markdown)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Copy aria-hidden /><span>Copy Path</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuGroup>
              {item('copy-relative', 'Copy Relative Path', <Copy aria-hidden />)}
              {item('copy-absolute', 'Copy Absolute Path', <Copy aria-hidden />, !props.nativeAvailable)}
            </DropdownMenuGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {item('recovery', 'File Recovery', <FileClock aria-hidden />)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {item('open-default', 'Open in Default App', <ExternalLink aria-hidden />, !props.nativeAvailable)}
        {item('reveal', 'Reveal in Finder', <FolderOpen aria-hidden />, !props.nativeAvailable)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {item('rename', 'Rename Note…', <Pencil aria-hidden />, !props.markdown)}
        {item('trash', 'Move File to Trash', <Trash2 aria-hidden />)}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
