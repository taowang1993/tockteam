import { jsx as _jsx } from "react/jsx-runtime";
import { Bookmark, ChevronLeft, ChevronRight, Ellipsis, FileText, Folder, MessageSquare, PanelLeft, PanelRight, Pencil, Plus, X, } from 'lucide-react';
const GLYPHS = {
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
};
export function WorkbenchGlyph({ kind }) {
    const Glyph = GLYPHS[kind];
    return _jsx(Glyph, { "aria-hidden": "true" });
}
//# sourceMappingURL=workbench-glyph.js.map