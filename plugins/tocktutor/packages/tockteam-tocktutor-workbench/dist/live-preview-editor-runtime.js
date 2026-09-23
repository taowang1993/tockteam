import { jsx as _jsx } from "react/jsx-runtime";
import { SourceEditorRuntime } from "./source-editor-runtime.js";
/** Live Preview decorates the authored Markdown; it never serializes a rich-text copy. */
export function LivePreviewEditorRuntime(props) {
    return _jsx(SourceEditorRuntime, { ariaLabel: props.ariaLabel ?? 'Live Preview Editor', className: `tocktutor-live-preview-editor tocktutor-live-preview-styles ${props.className ?? ''}`, content: props.content, localEditRevision: props.localEditRevision, livePreview: true, onContentChange: props.onMarkdownChange, onOpenExternalUrl: props.onOpenExternalUrl, onSelectionChange: selection => props.onSelectionChange?.(selection.main), ...(props.editorViewRef === undefined ? {} : { editorViewRef: props.editorViewRef }), ...(props.resolvedEmbeds === undefined ? {} : { resolvedEmbeds: props.resolvedEmbeds }), ...(props.onWidgetState === undefined ? {} : { onWidgetState: props.onWidgetState }) });
}
//# sourceMappingURL=live-preview-editor-runtime.js.map