import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileText,
  Folder,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type WorkbenchGlyphKind =
  | 'back'
  | 'bookmark'
  | 'chat'
  | 'close'
  | 'collapse'
  | 'document'
  | 'folder'
  | 'forward'
  | 'more'
  | 'new'
  | 'panel'
  | 'panel-right'
  | 'pencil'

const GLYPHS: Record<WorkbenchGlyphKind, LucideIcon> = {
  back: ChevronLeft,
  bookmark: Bookmark,
  chat: MessageSquare,
  close: X,
  collapse: ChevronRight,
  document: FileText,
  folder: Folder,
  forward: ChevronRight,
  more: Ellipsis,
  new: Plus,
  panel: PanelLeft,
  'panel-right': PanelRight,
  pencil: Pencil,
}

export function WorkbenchGlyph({ kind }: { kind: WorkbenchGlyphKind }): ReactNode {
  const Glyph = GLYPHS[kind]
  return <Glyph aria-hidden="true" />
}
