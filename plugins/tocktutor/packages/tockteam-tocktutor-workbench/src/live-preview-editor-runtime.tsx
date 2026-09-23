import type { ReactNode } from 'react'
import type { LivePreviewEditorProps } from './live-preview-editor.tsx'
import { SourceEditorRuntime } from './source-editor-runtime.tsx'

/** Live Preview decorates the authored Markdown; it never serializes a rich-text copy. */
export function LivePreviewEditorRuntime(props: LivePreviewEditorProps): ReactNode {
  return <SourceEditorRuntime
    ariaLabel={props.ariaLabel ?? 'Live Preview Editor'}
    className={`tocktutor-live-preview-editor tocktutor-live-preview-styles ${props.className ?? ''}`}
    content={props.content}
    localEditRevision={props.localEditRevision}
    livePreview
    onContentChange={props.onMarkdownChange}
    onOpenExternalUrl={props.onOpenExternalUrl}
    {...(props.onSearchState === undefined ? {} : { onSearchState: props.onSearchState })}
    {...(props.searchCurrentIndex === undefined ? {} : { searchCurrentIndex: props.searchCurrentIndex })}
    {...(props.searchQuery === undefined ? {} : { searchQuery: props.searchQuery })}
    {...(props.searchRequest === undefined ? {} : { searchRequest: props.searchRequest })}
    onSelectionChange={selection => props.onSelectionChange?.(selection.main)}
    {...(props.editorViewRef === undefined ? {} : { editorViewRef: props.editorViewRef })}
    {...(props.resolvedEmbeds === undefined ? {} : { resolvedEmbeds: props.resolvedEmbeds })}
    {...(props.onWidgetState === undefined ? {} : { onWidgetState: props.onWidgetState })}
  />
}
