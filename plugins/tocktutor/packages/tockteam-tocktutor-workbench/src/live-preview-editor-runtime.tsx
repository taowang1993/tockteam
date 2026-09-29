// @ts-nocheck -- Milkdown's extensionless declarations are incompatible with the pinned NodeNext analyzer.
import { Crepe } from '@milkdown/crepe'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { tags } from '@lezer/highlight'
import { commandsCtx, parserCtx, serializerCtx } from '@milkdown/core'
import { toggleStrongCommand, toggleEmphasisCommand, remarkInlineLinkPlugin, headingSchema, wrapInHeadingInputRule } from '@milkdown/preset-commonmark'
import { textblockTypeInputRule } from '@milkdown/prose/inputrules'
import { splitBlockAs } from '@milkdown/prose/commands'
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm'
import { closeHistory } from '@milkdown/prose/history'
import { Slice } from '@milkdown/prose/model'
import { EditorState, Plugin, PluginKey, TextSelection } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import { $inputRule, $prose } from '@milkdown/utils'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { applyEditorCommand, resolvePlatformEditorCommand, type EditorCommandId } from './editor-commands.ts'
import { clampEditorSearchIndex, moveEditorSearchIndex, searchEditorMatches } from './editor-search.ts'
import { splitLivePreviewSource, type LivePreviewEditorProps } from './live-preview-editor.tsx'
import { withoutGeneratedHeadingIds } from './live-preview-authored-history.ts'
import { configureObsidianContent, obsidianInline, obsidianSyntax, referenceDefinition } from './milkdown-content.ts'
import { InlineImageLoader, attachInlineImages } from './inline-images.ts'
import { renderMarkdownHtml } from './rich-markdown.ts'
import { classifyExternalEmbed } from './external-embeds.ts'
import { collectEmbedTargets } from './embeds.ts'
import { SlashMenu, slashMenuPlugin, slashKey } from './live-preview-slash-menu.tsx'
import { SlashLinkDialog } from './slash-link-dialog.tsx'
import { ImageViewerDialog, mountImageViewerAction, safeRasterImageDataUrl, type ViewerImage } from './image-viewer.tsx'
import { mountImageResizeControl, resizedImageAlt, resizeWikilinkToken } from './image-resize.ts'

const searchKey = new PluginKey('tocktutor-crepe-search')
// Leading hashes + Space choose the level, even inside an existing heading.
const headingInputRule = $inputRule(ctx => textblockTypeInputRule(
  /^(#{1,6}) $/, headingSchema.type(ctx), match => ({ level: match[1].length }),
))
// Lucide Copy and CopyCheck (0.473.0); Crepe accepts SVG markup, not React components.
const copyIcons = `<svg xmlns="http://www.w3.org/2000/svg" class="lucide-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><svg xmlns="http://www.w3.org/2000/svg" class="lucide-copy-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 15 2 2 4-4"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
const codeHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.definitionKeyword], color: 'var(--dsw-specific-markdown-accent)' },
  { tag: [tags.string, tags.number, tags.bool], color: 'var(--dsw-alias-state-success-primary)' },
  { tag: tags.comment, color: 'var(--dsw-alias-label-secondary)' },
]))
const codeLanguages = [
  ...languages.map(language => LanguageDescription.of({ name: language.name, alias: [...language.alias, ...language.extensions], load: () => language.load() })),
  LanguageDescription.of({ name: 'TypeScript', alias: ['ts', 'tsx'], load: async () => javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: 'JavaScript', alias: ['js', 'jsx'], load: async () => javascript({ jsx: true }) }),
]
const codeLanguageNames = new Map(codeLanguages.flatMap(language => language.alias.map(alias => [alias, language.name])))

// Search rendered text, not Markdown punctuation. Keep offsets in the native document.
function searchDocument(doc, query: string) {
  let text = ''; const positions: number[] = []; let previousParent = null
  doc.descendants((node, position) => {
    if (!node.isText) return
    const parent = doc.resolve(position).parent
    if (text && parent !== previousParent) { text += '\n'; positions.push(position) }
    for (let i = 0; i < node.text.length; i++) { text += node.text[i]; positions.push(position + i) }
    previousParent = parent
  })
  const result = searchEditorMatches(text, query)
  return { ...result, matches: result.matches.map(({ from, to }) => ({ from: positions[from], to: positions[to - 1] + 1 })) }
}

export function LivePreviewEditorRuntime(props: LivePreviewEditorProps): ReactNode {
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const source = useRef(props.content)
  const revision = useRef(props.localEditRevision)
  const instance = useRef<Crepe | null>(null)
  const viewRef = useRef<any>(null)
  const commandHandler = useRef<((command: EditorCommandId) => boolean) | null>(null)
  const syncing = useRef(false)
  const current = useRef<number | null>(props.searchCurrentIndex ?? null)
  const lastRequest = useRef<number | null>(null)
  const [ready, setReady] = useState(false)
  const [slashMenu, setSlashMenu] = useState(null)
  const [error, setError] = useState('')
  const [viewerImage, setViewerImage] = useState<ViewerImage | null>(null)
  const viewerTriggerRef = useRef<HTMLElement | null>(null)
  const imageWaiters = useRef(new Set<() => void>())

  const publishSearch = (view, error?: string) => {
    const query = latest.current.searchQuery ?? ''
    const result = searchDocument(view.state.doc, query)
    current.current = clampEditorSearchIndex(result.matches.length, current.current)
    latest.current.onSearchState?.({ current: current.current, query, total: result.matches.length,
      ...(error ?? result.error ? { error: error ?? result.error } : {}), ...(result.truncated ? { truncated: true } : {}) })
  }

  useEffect(() => {
    if (!root.current) return
    let disposed = false, mounted = false
    const images = new InlineImageLoader()
    const imageCache = new Map<string, string>()
    const pendingImages = new Set<string>()
    let imageRevision = 0
    let contentRevision = 0
    const refreshImages = () => {
      imageRevision++
      const view = viewRef.current
      if (!disposed && view) view.dispatch(view.state.tr.setMeta(searchKey, true))
    }
    imageWaiters.current.add(refreshImages)
    // Crepe initializes its image view with the authored URL. The proxy must return
    // synchronously, before mounting: an async proxy briefly leaks that original URL.
    const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    const imageURL = (url: string): string => {
      if (url === '') return '' // An empty image owns the upload form, not a proxied preview.
      if (imageCache.has(url)) return imageCache.get(url)!
      const external = classifyExternalEmbed(url)
      if (external) {
        if (!pendingImages.has(url)) {
          pendingImages.add(url)
          void images.load(external.sourceUrl).then(image => {
            if (!disposed) { imageCache.set(url, image.src); refreshImages() }
          }).catch(() => {
            // Keep failure on the image itself; never replace the authored link or raise a note-wide banner.
            if (!disposed) { imageCache.set(url, 'data:image/png;base64,'); refreshImages() }
          })
        }
      } else {
        const target = collectEmbedTargets(`![](<${url}>)`)[0]
        const embed = target && latest.current.resolvedEmbeds?.find(item => item.target.path === target.path)
        if (embed && /^image\/(?:png|jpeg|gif|webp|avif|bmp)$/u.test(embed.mimeType ?? '') && /^[A-Za-z0-9+/]+={0,2}$/u.test(embed.content)) return `data:${embed.mimeType};base64,${embed.content}`
      }
      return placeholder
    }
    const crepe = new Crepe({
      root: root.current,
      defaultValue: splitLivePreviewSource(source.current).body,
      features: { [Crepe.Feature.BlockEdit]: false },
      featureConfigs: {
        // Let the browser own caret shape, blinking, and window-focus visibility.
        [Crepe.Feature.Cursor]: { virtual: false },
        [Crepe.Feature.CodeMirror]: {
          languages: codeLanguages,
          theme: codeHighlight,
          copyIcon: copyIcons,
          copyText: 'Copy Code',
          onCopy: () => {
            const button = root.current?.querySelector<HTMLButtonElement>('.milkdown-code-block .copy-button:focus')
            if (!button) return
            button.dataset.copied = 'true'
            button.setAttribute('aria-label', 'Copied Code')
            window.setTimeout(() => {
              if (!button.isConnected) return
              delete button.dataset.copied
              button.setAttribute('aria-label', 'Copy Code')
            }, 1800)
          },
        },
        [Crepe.Feature.ImageBlock]: {
          proxyDomURL: imageURL,
          onUpload: async file => {
            if (!latest.current.onUploadImage) throw new Error('Image upload is unavailable in this view.')
            const revision = contentRevision
            const url = await latest.current.onUploadImage(file)
            return disposed || revision !== contentRevision ? '' : url
          },
        },
        [Crepe.Feature.Placeholder]: { text: 'Start writing, or type / for commands.' },
      },
    })
    instance.current = crepe
    const serialize = doc => crepe.editor.action(ctx => `${splitLivePreviewSource(source.current).prefix}${ctx.get(serializerCtx)(doc)}`)
    const configured = crepe.editor.remove([...remarkInlineLinkPlugin, wrapInHeadingInputRule])
    crepe.editor.use(slashMenuPlugin(setSlashMenu, () => latest.current.slashLinks))
    crepe.editor.config(configureObsidianContent).use(obsidianSyntax).use(obsidianInline).use(referenceDefinition).use(headingInputRule)
      .use($prose(() => new Plugin({
        key: searchKey,
        props: {
          nodeViews: {
            tocktutor_inline(node, view, getPos, decorations) {
              const dom = document.createElement('span')
              dom.className = 'tocktutor-rich-inline'
              const contentDOM = document.createElement('span')
              contentDOM.className = 'tocktutor-inline-source'
              const preview = document.createElement('span')
              preview.className = 'tocktutor-inline-preview'
              preview.contentEditable = 'false'
              dom.append(contentDOM, preview)
              let detach: (() => void) | undefined
              const update = (next, decorations) => {
                if (next.type.name !== 'tocktutor_inline') return false
                detach?.()
                const pos = getPos()
                dom.dataset.editing = String(typeof pos === 'number' && view.state.selection.from > pos && view.state.selection.to < pos + next.nodeSize)
                const definitions = source.current.split('\n').filter(line => /^\s*\[(?!\^)[^\]]+\]:/u.test(line)).join('\n')
                const references = new Map([...definitions.matchAll(/^\s*\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gmu)].map(([, label, wrapped, bare]) => [label.toLowerCase(), wrapped ?? bare]))
                const markdown = next.textContent.replace(/!\[([^\]\n]{0,1000})\]\[([^\]\n]{1,200})\]/gu, (match, alt, label) => {
                  const url = references.get(label.toLowerCase())
                  return url && classifyExternalEmbed(url) ? `![${alt}](<${url}>)` : match
                })
                preview.innerHTML = renderMarkdownHtml(`${markdown}\n\n${definitions}`, { externalEmbedMode: 'viewer', resolvedEmbeds: latest.current.resolvedEmbeds ?? [] })
                preview.classList.toggle('tocktutor-live-embed-widget', next.textContent.startsWith('![['))
                detach = attachInlineImages(preview, () => {}, images)
                return true
              }
              update(node, decorations)
              preview.addEventListener('mousedown', event => {
                if (event.target instanceof Element && event.target.closest('a,button,audio,video')) return
                event.preventDefault()
                const pos = getPos()
                if (typeof pos === 'number') { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1))); view.focus() }
              })
              return { dom, contentDOM, update, ignoreMutation: mutation => preview.contains(mutation.target), destroy: () => detach?.() }
            },
          },
          handleKeyDown(view, event) {
            if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing
              && view.state.selection.$from.parent.type.name === 'heading') {
              return splitBlockAs(() => ({ type: view.state.schema.nodes.paragraph }))(view.state, view.dispatch)
            }
            const command = resolvePlatformEditorCommand(event, /Mac|iPhone|iPad/u.test(navigator.platform))
            if (!command || !commandHandler.current) return false
            event.preventDefault()
            return commandHandler.current(command)
          },
          decorations: state => {
            const result = searchDocument(state.doc, latest.current.searchQuery ?? '')
            const decorations = result.matches.map((range, index) => Decoration.inline(range.from, range.to, {
              class: `tocktutor-find-match${index === current.current ? ' tocktutor-find-current' : ''}`,
            }))
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'code_block') decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-code-language': node.attrs.language ?? '' }))
              if (node.type.name === 'image-block' || node.type.name === 'image') decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-image-revision': String(imageRevision) }))
              if (node.type.name === 'tocktutor_inline') decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-editing': String(state.selection.from > pos && state.selection.to < pos + node.nodeSize), 'data-image-revision': String(imageRevision) }))
            })
            return DecorationSet.create(state.doc, decorations)
          },
          handleDOMEvents: {
            click(_view, event) {
              const target = event.target instanceof Element ? event.target : null
              const external = target?.closest<HTMLElement>('[data-external-url]')?.dataset.externalUrl
              if (external) { event.preventDefault(); latest.current.onOpenExternalUrl?.(external); return true }
              const link = target?.closest('a') ?? null
              if (!link) return false
              event.preventDefault()
              const url = link.getAttribute('data-target') ?? link.getAttribute('href') ?? ''
              const publicLink = classifyExternalEmbed(url)
              if (publicLink) latest.current.onOpenExternalUrl?.(publicLink.viewerUrl)
              else if (!/^[a-z][a-z\d+.-]*:/iu.test(url) && !url.startsWith('//')) {
                if (link.hasAttribute('data-target') && link.dataset.linkKind !== 'markdown') latest.current.onOpenInternalLink?.(url)
                else latest.current.onOpenInternalLink?.(url, 'markdown')
              }
              return true
            },
          },
        },
        filterTransaction(transaction) {
          if (!transaction.docChanged) return true
          if (new TextEncoder().encode(serialize(transaction.doc)).byteLength <= 2_000_000) return true
          setError('This change exceeds the note size limit.'); return false
        },
        view: view => {
          viewRef.current = view
          if (latest.current.editorViewRef) latest.current.editorViewRef.current = view
          return {
            update(view, previous) {
              if (!previous.doc.eq(view.state.doc)) contentRevision++
              if (disposed || !mounted) return
              if (!syncing.current && !withoutGeneratedHeadingIds(previous.doc).eq(withoutGeneratedHeadingIds(view.state.doc))) {
                const markdown = serialize(view.state.doc)
                if (markdown !== source.current) {
                  source.current = markdown
                  imageRevision++
                  view.dispatch(view.state.tr.setMeta(searchKey, true))
                  latest.current.onMarkdownChange(markdown)
                }
              }
              publishSearch(view)
            },
            destroy() {
              if (latest.current.editorViewRef?.current === view) latest.current.editorViewRef.current = null
              if (viewRef.current === view) viewRef.current = null
            },
          }
        },
      })))
    void configured.then(() => crepe.create()).then(() => {
      if (disposed) return crepe.destroy()
      // Settle Crepe's trailing paragraph before edits/history/publication begin.
      viewRef.current.dispatch(viewRef.current.state.tr.setMeta('addToHistory', false))
      mounted = true
      setReady(true)
      publishSearch(viewRef.current)
    }).catch(reason => { if (!disposed) setError(`Live Preview could not open: ${String(reason)}`) })
    return () => {
      disposed = true
      images.dispose()
      imageWaiters.current.delete(refreshImages)
      instance.current = null
      // Crepe waits for creation before destroying; the completion above handles early unmount.
      if (viewRef.current) void crepe.destroy()
    }
  }, [])

  useEffect(() => { setViewerImage(null) }, [props.content, props.documentKey])

  useEffect(() => {
    if (!ready || !root.current) return
    const element = root.current
    const imageActions = new Map<HTMLImageElement, { dispose: () => void; host: HTMLElement; image: ViewerImage; authored: string | null }>()
    const imageNode = (image: HTMLImageElement): { authored: string; node: any; pos: number; kind: 'wiki' | 'markdown' } | null => {
      const view = viewRef.current
      const owner = image.closest<HTMLElement>('.tocktutor-rich-inline, .milkdown-image-block')
      if (!view || !owner || !element.contains(owner)) return null
      let position: number
      try { position = view.posAtDOM(owner, 0) } catch { return null }
      for (const pos of [position, position - 1]) {
        if (pos < 0) continue
        const node = view.state.doc.nodeAt(pos)
        if (owner.classList.contains('tocktutor-rich-inline') && node?.type.name === 'tocktutor_inline'
          && resizeWikilinkToken(node.textContent, 320) !== null) return { authored: node.textContent, node, pos, kind: 'wiki' }
        if (owner.classList.contains('milkdown-image-block') && node?.type.name === 'image-block'
          && typeof node.attrs.alt === 'string') return { authored: node.attrs.alt, node, pos, kind: 'markdown' }
      }
      return null
    }
    const removeImageAction = (image: HTMLImageElement): void => {
      const action = imageActions.get(image)
      if (!action) return
      action.dispose()
      action.host.remove()
      imageActions.delete(image)
    }
    const labelControls = () => {
      for (const block of element.querySelectorAll<HTMLElement>('.milkdown-code-block[data-code-language]')) {
        const button = block.querySelector<HTMLButtonElement>('.language-button')
        if (!button) continue
        const code = block.dataset.codeLanguage?.toLowerCase()
        const name = codeLanguageNames.get(code) ?? (block.dataset.codeLanguage || 'Text')
        const tools = button.closest<HTMLElement>('.tools')!
        tools.dataset.displayLanguage = name
        tools.setAttribute('role', 'group')
        tools.setAttribute('aria-label', name)
        button.hidden = true
      }
      for (const row of element.querySelectorAll<HTMLElement>('.milkdown-list-item-block .label-wrapper')) {
        const icon = row.querySelector('.milkdown-icon.label')
        if (!icon?.classList.contains('checked') && !icon?.classList.contains('unchecked')) continue
        const checked = icon.classList.contains('checked')
        row.setAttribute('role', 'checkbox')
        row.setAttribute('aria-checked', String(checked))
        row.setAttribute('aria-label', checked ? 'Mark Task as Incomplete' : 'Mark Task as Complete')
        row.tabIndex = 0
      }
      for (const image of element.querySelectorAll<HTMLImageElement>('img')) {
        const src = safeRasterImageDataUrl(image.getAttribute('src'))
        const alt = image.alt
        const existing = imageActions.get(image)
        if (src === null) { removeImageAction(image); continue }
        const current = imageNode(image)
        if (existing?.image.src === src && existing.image.alt === alt && existing.authored === (current?.authored ?? null)) continue
        removeImageAction(image)
        const row = document.createElement('span')
        row.className = 'tocktutor-image-actions flex w-fit max-w-full flex-wrap items-center gap-2 rounded-md bg-surface-muted !p-1 text-foreground [&_button]:!px-2 [&_button]:!py-1 [&_input]:!px-2 [&_input]:!py-1'
        row.contentEditable = 'false'
        row.setAttribute('role', 'group')
        row.setAttribute('aria-label', 'Image Actions')
        const anchor = image.closest('a')
        ;(image.closest('.milkdown-image-block .image-wrapper') ?? anchor ?? image).insertAdjacentElement('afterend', row)
        const host = document.createElement('span')
        const resizeHost = document.createElement('span')
        resizeHost.className = 'inline-flex items-center gap-2'
        row.append(host, resizeHost)
        const action = { alt, src }
        const disposeViewer = mountImageViewerAction(host, action, (value, trigger) => { viewerTriggerRef.current = trigger; setViewerImage(value) })
        const resizeHint = current?.kind === 'wiki' && current.authored.includes('|')
          ? current.authored.slice(current.authored.lastIndexOf('|'), -2) : current?.authored ?? ''
        const disposeResize = current && !anchor ? mountImageResizeControl(resizeHost, image, resizeHint, width => {
          const view = viewRef.current, next = imageNode(image)
          if (!view || !next || next.authored !== current.authored || next.kind !== current.kind) return false
          const value = next.kind === 'wiki'
            ? resizeWikilinkToken(next.authored, width)
            : resizedImageAlt(next.authored, width)
          if (value === null || value === next.authored) return false
          const tr = next.kind === 'wiki'
            ? view.state.tr.insertText(value, next.pos + 1, next.pos + next.node.nodeSize - 1)
            : view.state.tr.setNodeMarkup(next.pos, undefined, { ...next.node.attrs, alt: value })
          view.dispatch(tr)
          return true
        }) : () => {}
        imageActions.set(image, { dispose: () => { disposeResize(); disposeViewer() }, host: row, image: action, authored: current?.authored ?? null })
      }
      for (const image of imageActions.keys()) if (!image.isConnected) removeImageAction(image)
    }
    const observer = new MutationObserver(labelControls)
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-code-language', 'data-image-revision', 'src'] })
    labelControls()
    const activate = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter' || !(event.target instanceof Element) || !event.target.matches('.milkdown-list-item-block .label-wrapper[role="checkbox"]')) return
      event.preventDefault(); event.stopPropagation()
      event.target.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
    }
    element.addEventListener('keydown', activate)
    return () => {
      observer.disconnect()
      element.removeEventListener('keydown', activate)
      for (const image of imageActions.keys()) removeImageAction(image)
    }
  }, [ready])

  useEffect(() => {
    const view = viewRef.current
    if (view && slashKey.getState(view.state)?.form) view.dispatch(view.state.tr)
  }, [props.slashLinks])

  useEffect(() => {
    for (const finish of imageWaiters.current) finish()
  }, [props.resolvedEmbeds])

  useEffect(() => {
    const crepe = instance.current, view = viewRef.current
    if (!ready || !crepe || !view) return
    const local = revision.current !== props.localEditRevision
    revision.current = props.localEditRevision
    if (props.content === source.current) return
    const doc = crepe.editor.action(ctx => ctx.get(parserCtx)(splitLivePreviewSource(props.content).body))
    syncing.current = true
    try {
      source.current = props.content
      if (local) {
        view.dispatch(closeHistory(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content)))
        view.dispatch(closeHistory(view.state.tr))
      } else {
        // A peer/reload owns a new history; undo must never resurrect the prior note.
        view.updateState(EditorState.create({ doc, schema: view.state.schema, plugins: view.state.plugins,
          selection: TextSelection.between(doc.resolve(Math.min(view.state.selection.from, doc.content.size)), doc.resolve(Math.min(view.state.selection.to, doc.content.size))) }))
      }
      for (const finish of imageWaiters.current) finish()
    } finally { syncing.current = false }
  }, [ready, props.content, props.localEditRevision])

  useEffect(() => {
    if (!ready || !viewRef.current) return
    current.current = props.searchCurrentIndex ?? null
    viewRef.current.dispatch(viewRef.current.state.tr.setMeta(searchKey, true))
    publishSearch(viewRef.current)
  }, [ready, props.searchCurrentIndex, props.searchQuery])

  useEffect(() => {
    const view = viewRef.current, request = props.searchRequest
    if (!ready || !view || !request || request.id === lastRequest.current || request.consume?.() === false) return
    lastRequest.current = request.id
    const result = searchDocument(view.state.doc, props.searchQuery ?? '')
    if (result.error) { publishSearch(view, result.error); return }
    if (request.action === 'next' || request.action === 'previous') {
      current.current = moveEditorSearchIndex(result.matches.length, current.current, request.action === 'next' ? 1 : -1)
      const range = current.current === null ? null : result.matches[current.current]
      if (range) { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)).scrollIntoView()); view.focus() }
    } else {
      if (result.truncated && request.action === 'replace-all') { publishSearch(view, 'Too many matches to replace all at once; narrow the query.'); return }
      const ranges = request.action === 'replace-all' ? result.matches : result.matches.slice(current.current ?? 0, (current.current ?? 0) + 1)
      if (!ranges.length) return
      const replacement = request.replacement ?? ''
      if (new TextEncoder().encode(source.current).byteLength + new TextEncoder().encode(replacement).byteLength * ranges.length > 2_000_000) {
        publishSearch(view, 'Replacement exceeds the editor size limit.'); return
      }
      let tr = view.state.tr
      for (const range of [...ranges].reverse()) tr = tr.insertText(replacement, range.from, range.to)
      view.dispatch(closeHistory(tr)); view.dispatch(closeHistory(view.state.tr))
    }
    publishSearch(view)
  }, [ready, props.searchRequest])

  useEffect(() => {
    if (!ready) return
    const insert = (text: string): boolean => {
      const view = viewRef.current
      if (!view) return false
      view.dispatch(view.state.tr.insertText(text).scrollIntoView())
      view.focus()
      return true
    }
    if (props.insertTextRef) props.insertTextRef.current = insert
    const run = (command: EditorCommandId): boolean => {
      const crepe = instance.current, view = viewRef.current
      if (!crepe || !view) return false
      view.focus()
      const native = { bold: toggleStrongCommand, italic: toggleEmphasisCommand, strikethrough: toggleStrikethroughCommand }[command]
      if (native) crepe.editor.action(ctx => ctx.get(commandsCtx).call(native.key))
      else if (command === 'delete-line') {
        const { $from } = view.state.selection
        if ($from.depth) view.dispatch(view.state.tr.delete($from.before(), $from.after()))
      } else {
        const selected = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, '\n')
        const markdown = applyEditorCommand(selected, command, 0, selected.length).source
        const doc = crepe.editor.action(ctx => ctx.get(parserCtx)(markdown))
        view.dispatch(view.state.tr.replaceSelection(command === 'insert-table' || command === 'callout-tip' ? new Slice(doc.content, 0, 0) : Slice.maxOpen(doc.content)).scrollIntoView())
      }
      view.focus(); return true
    }
    commandHandler.current = run
    if (props.commandRef) props.commandRef.current = run
    return () => {
      commandHandler.current = null
      if (props.commandRef?.current === run) props.commandRef.current = null
      if (props.insertTextRef?.current === insert) props.insertTextRef.current = null
    }
  }, [ready, props.commandRef, props.insertTextRef])

  return <div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={`tocktutor-crepe-editor tocktutor-note-links relative min-h-0 min-w-0 flex-1 [&_.milkdown-image-block_.image-resize-handle]:hidden ${props.className ?? ''}`}>
    {error && <p role="alert">{error}</p>}
    <div ref={root} />
    {slashMenu && (slashMenu.form ? <SlashLinkDialog action={slashMenu.action} /> : <SlashMenu menu={slashMenu} />)}
    <ImageViewerDialog image={viewerImage} onClose={() => { setViewerImage(null) }} returnFocusRef={viewerTriggerRef} />
  </div>
}
