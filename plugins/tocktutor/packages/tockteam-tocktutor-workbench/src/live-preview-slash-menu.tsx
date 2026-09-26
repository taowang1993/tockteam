// @ts-nocheck -- Milkdown's extensionless declarations are incompatible with the pinned NodeNext analyzer.
import { SlashProvider } from '@milkdown/plugin-slash'
import { autoUpdate, flip, offset, shift, size } from '@floating-ui/dom'
import { closeHistory } from '@milkdown/prose/history'
import { Plugin, PluginKey, TextSelection, NodeSelection } from '@milkdown/prose/state'
import { findWrapping } from '@milkdown/prose/transform'
import { createTable } from '@milkdown/preset-gfm'
import { $prose } from '@milkdown/utils'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@tockteam/ui/command'
import { Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Text, Quote, List, ListOrdered, ListTodo, Minus, Code, Image, Table, Sigma } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useLayoutEffect } from 'react'

export const slashKey = new PluginKey('tocktutor-slash-menu')
const commands = [
  { id: 'text', label: 'Text', icon: Text, group: 'Basic Blocks' },
  { id: 'h1', label: 'Heading 1', icon: Heading1, group: 'Basic Blocks' },
  { id: 'h2', label: 'Heading 2', icon: Heading2, group: 'Basic Blocks' },
  { id: 'h3', label: 'Heading 3', icon: Heading3, group: 'Basic Blocks' },
  { id: 'h4', label: 'Heading 4', icon: Heading4, group: 'Basic Blocks' },
  { id: 'h5', label: 'Heading 5', icon: Heading5, group: 'Basic Blocks' },
  { id: 'h6', label: 'Heading 6', icon: Heading6, group: 'Basic Blocks' },
  { id: 'quote', label: 'Quote', icon: Quote, group: 'Basic Blocks' },
  { id: 'divider', label: 'Divider', icon: Minus, group: 'Basic Blocks' },
  { id: 'bullet', label: 'Bulleted List', icon: List, group: 'Lists' },
  { id: 'numbered', label: 'Numbered List', aliases: 'ordered', icon: ListOrdered, group: 'Lists' },
  { id: 'todo', label: 'Task List', icon: ListTodo, group: 'Lists' },
  { id: 'code', label: 'Code Block', icon: Code, group: 'Advanced' },
  { id: 'image', label: 'Image', icon: Image, group: 'Advanced' },
  { id: 'table', label: 'Table', icon: Table, group: 'Advanced' },
  { id: 'math', label: 'Math', icon: Sigma, group: 'Advanced' },
]

function eligible(state) {
  const { empty, $from } = state.selection
  return empty && state.selection instanceof TextSelection && ['paragraph', 'heading'].includes($from.parent.type.name)
    && !$from.marks().some(mark => ['code', 'link'].includes(mark.type.name))
}
// Build, validate, then dispatch once: refusing an action must also retain /query.
function transaction(state, invocation, id, ctx) {
  const tr = state.tr.delete(invocation.from, invocation.to)
  const { $from } = tr.selection
  const nodes = state.schema.nodes
  if (id === 'text' || /^h[1-6]$/u.test(id) || id === 'code') {
    const type = id === 'text' ? nodes.paragraph : id === 'code' ? nodes.code_block : nodes.heading
    if (!$from.node(-1).canReplaceWith($from.index(-1), $from.index(-1) + 1, type)) return null
    // Code cannot represent non-text inline nodes without losing their authored content.
    if (id === 'code' && [...Array($from.parent.childCount).keys()].some(i => !$from.parent.child(i).isText)) return null
    tr.setBlockType(tr.selection.from, tr.selection.to, type, id.startsWith('h') ? { level: Number(id.slice(1)) } : {})
  } else if (['quote', 'bullet', 'numbered', 'todo'].includes(id)) {
    if (id !== 'quote') tr.setBlockType(tr.selection.from, tr.selection.to, nodes.paragraph)
    const range = tr.selection.$from.blockRange()
    const type = id === 'quote' ? nodes.blockquote : id === 'numbered' ? nodes.ordered_list : nodes.bullet_list
    const wrapping = range && findWrapping(range, type)
    if (!wrapping) return null
    tr.wrap(range, wrapping)
    if (id === 'todo') tr.setNodeMarkup(range.start + 1, undefined, { ...tr.doc.nodeAt(range.start + 1).attrs, checked: false })
  } else {
    // Atomic insertions are document-level only; do not restructure a table or list around them.
    if ($from.depth !== 1) return null
    const node = id === 'table' ? createTable(ctx, 3, 3)
      : id === 'math' ? nodes.code_block.create({ language: 'LaTeX' })
      : (id === 'divider' ? nodes.hr : nodes['image-block'])?.create()
    if (!node) return null
    const empty = $from.parent.content.size === 0
    const pos = empty ? $from.before() : $from.after()
    tr.replaceWith(pos, empty ? $from.after() : pos, node)
    tr.setSelection(node.isAtom ? NodeSelection.create(tr.doc, pos) : TextSelection.near(tr.doc.resolve(pos + 1)))
  }
  return tr.setMeta(slashKey, null).scrollIntoView()
}
function entries(state, invocation, ctx) {
  const query = state.doc.textBetween(invocation.from + Number(invocation.slash), invocation.to).trim().toLowerCase()
  return commands.filter(item => `${item.id} ${item.label} ${item.aliases ?? ''}`.toLowerCase().includes(query)
    && transaction(state, invocation, item.id, ctx))
}

function apply(view, id, ctx) {
  const invocation = slashKey.getState(view.state)
  if (view.isDestroyed || !invocation || !view.editable || !eligible(view.state) || !entries(view.state, invocation, ctx).some(item => item.id === id)) return
  const tr = transaction(view.state, invocation, id, ctx)
  if (!tr) return
  view.dispatch(closeHistory(tr))
  view.dispatch(closeHistory(view.state.tr))
  view.focus()
}

export function slashMenuPlugin(publish) {
  return $prose(ctx => new Plugin({
    key: slashKey,
    state: {
      init: () => null,
      apply(tr, previous) {
        const explicit = tr.getMeta(slashKey)
        if (explicit !== undefined) return explicit
        if (!previous) return null
        const from = tr.mapping.mapResult(previous.from, -1)
        const to = tr.mapping.map(previous.to, 1)
        if (from.deleted || !eligible({ selection: tr.selection }) || tr.selection.from !== to
          || tr.selection.$from.start() > from.pos || (previous.slash && tr.doc.textBetween(from.pos, from.pos + 1) !== '/')) return null
        return { ...previous, from: from.pos, to }
      },
    },
    props: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Note Content' },
      handleTextInput(view, from, to, text) {
        if (text !== '/' || from !== to || view.composing || !view.editable || !eligible(view.state)) return false
        const prefix = view.state.selection.$from.parent.textBetween(0, view.state.selection.$from.parentOffset)
        if (/(?:https?:|www\.)\S*$/iu.test(prefix)) return false
        view.dispatch(view.state.tr.insertText(text, from, to).setMeta(slashKey, { from, to: from + 1, slash: true, selected: '' }))
        return true
      },
      handleKeyDown(view, event) {
        const invocation = slashKey.getState(view.state)
        if (!invocation || event.isComposing || view.composing || event.keyCode === 229) return false
        const items = entries(view.state, invocation, ctx)
        const selected = Math.max(0, items.findIndex(item => item.id === invocation.selected))
        if (event.key === 'Escape' || event.key === 'Tab' || ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
          || (event.key === 'Enter' && (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey))) {
          view.dispatch(view.state.tr.setMeta(slashKey, null))
          return event.key === 'Escape'
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const index = Math.max(0, Math.min(items.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)))
          if (items[index]) view.dispatch(view.state.tr.setMeta(slashKey, { ...invocation, selected: items[index].id }))
          return true
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (items[selected]) { apply(view, items[selected].id, ctx); return true }
          view.dispatch(view.state.tr.setMeta(slashKey, null))
        }
        return false
      },
      handleDOMEvents: {
        paste(view) { if (slashKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(slashKey, null)); return false },
        compositionstart(view) { if (slashKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(slashKey, null)); return false },
        blur(view) { if (slashKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(slashKey, null)); return false },
      },
    },
    view(view) {
      const element = document.createElement('div')
      element.className = 'tocktutor-slash-menu fixed z-50 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-popover text-popover-foreground shadow-md data-[show=false]:invisible data-[show=false]:pointer-events-none'
      element.dataset.show = 'false'
      const boundary = view.dom.closest('.tocktutor-editor-body') ?? document.documentElement
      const provider = new SlashProvider({ content: element, root: view.dom.closest('[data-tockteam-tocktutor-route]') ?? document.body, debounce: 0,
        floatingUIOptions: { strategy: 'fixed', middleware: [offset(6), flip({ boundary, padding: 8 }), shift({ boundary, padding: 8 }),
          size({ boundary, padding: 8, apply({ availableWidth, availableHeight }) {
            element.style.maxWidth = `${Math.max(0, availableWidth)}px`
            element.style.setProperty('--tocktutor-slash-height', `${Math.max(0, availableHeight - 2)}px`)
          } }),
        ] }, 
        shouldShow: view => !!slashKey.getState(view.state) && view.editable && view.hasFocus(),
      })
      const clearARIA = () => { for (const name of ['aria-controls', 'aria-activedescendant', 'aria-autocomplete', 'aria-haspopup']) view.dom.removeAttribute(name) }
      const dismiss = event => {
        if (!element.contains(event.target) && slashKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(slashKey, null))
      }
      document.addEventListener('pointerdown', dismiss)
      const update = () => {
        const invocation = slashKey.getState(view.state)
        if (!invocation || !view.editable || !view.hasFocus()) { provider.hide(); clearARIA(); publish(null); return }
        const items = entries(view.state, invocation, ctx)
        const selected = items.find(item => item.id === invocation.selected)?.id ?? items[0]?.id ?? ''
        publish({ element, view, provider, items, selected,
          select(id) {
            const current = slashKey.getState(view.state)
            if (current && current.selected !== id) view.dispatch(view.state.tr.setMeta(slashKey, { ...current, selected: id }))
          },
          run: id => apply(view, id, ctx),
        })
      }
      update()
      return { update, destroy() { document.removeEventListener('pointerdown', dismiss); clearARIA(); provider.destroy(); element.remove(); publish(null) } }
    },
  }))
}

export function SlashMenu({ menu }) {
  useLayoutEffect(() => {
    const list = menu.element.querySelector('[role="listbox"]')
    const option = menu.element.querySelector(`[data-command-id="${menu.selected}"]`)
    if (list) menu.view.dom.setAttribute('aria-controls', list.id)
    if (option) menu.view.dom.setAttribute('aria-activedescendant', option.id)
    else menu.view.dom.removeAttribute('aria-activedescendant')
    menu.view.dom.setAttribute('aria-autocomplete', 'list')
    menu.view.dom.setAttribute('aria-haspopup', 'listbox')
    return autoUpdate(menu.view.dom, menu.element, () => menu.provider.update(menu.view), { layoutShift: false })
  }, [menu])
  return createPortal(<Command label="Block Commands" shouldFilter={false} value={menu.selected} onValueChange={menu.select}
    onPointerDown={event => event.preventDefault()}>
    <CommandList label="Block Commands" className="max-h-[min(18rem,var(--tocktutor-slash-height,18rem))]">
      <CommandEmpty>No Results</CommandEmpty>
      {[...new Set(menu.items.map(item => item.group))].map(group => <CommandGroup key={group} heading={<span className="text-popover-foreground">{group}</span>}>
        {menu.items.filter(item => item.group === group).map(item => <CommandItem key={item.id} value={item.id} data-command-id={item.id} onSelect={() => menu.run(item.id)}>
          <item.icon aria-hidden="true" className="size-4 shrink-0" />{item.label}
        </CommandItem>)}
      </CommandGroup>)}
    </CommandList>
    <span className="sr-only" role="status">{menu.items.find(item => item.id === menu.selected)?.label ?? 'No Results'}</span>
  </Command>, menu.element)
}
