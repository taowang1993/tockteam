// @ts-nocheck -- Milkdown's extensionless declarations are incompatible with the pinned NodeNext analyzer.
import { remarkStringifyOptionsCtx } from '@milkdown/core'
import { $node, $remark } from '@milkdown/utils'
import { imageBlockSchema } from '@milkdown/components/image-block'
import { classifyExternalEmbed } from './external-embeds.ts'

// These constructs carry vault semantics, not merely a Markdown spelling choice.
// Keep them as editable inline text nodes instead of letting remark escape them.
const syntax = /!?\[\[[^\]\n]+\]\]|\[![A-Za-z][\w-]*\][+-]?|\[\^[^\]\n]+\]|==[^=\n]+==|%%[\s\S]*?%%|(?:^|\s)\^[A-Za-z0-9-]+(?=\s|$)/gu
export const obsidianInline = $node('tocktutor_inline', () => ({
  group: 'inline', inline: true, content: 'text*',
  parseDOM: [{ tag: 'span[data-tocktutor-inline]' }],
  toDOM: () => ['span', { 'data-tocktutor-inline': '', class: 'tocktutor-preserved-inline' }, 0],
  parseMarkdown: {
    match: node => node.type === 'tocktutorInline',
    runner: (state, node, type) => { state.openNode(type); state.addText(node.value); state.closeNode() },
  },
  toMarkdown: {
    match: node => node.type.name === 'tocktutor_inline',
    runner: (state, node) => { state.addNode('tocktutorInline', undefined, node.textContent) },
  },
}))

export const referenceDefinition = $node('tocktutor_definition', () => ({
  group: 'block', content: 'text*', code: true,
  parseDOM: [{ tag: 'pre[data-tocktutor-definition]' }],
  toDOM: () => ['pre', { 'data-tocktutor-definition': '', 'aria-label': 'Link or Footnote Definition' }, ['code', 0]],
  parseMarkdown: { match: node => node.type === 'tocktutorDefinition', runner: (state, node, type) => {
    state.openNode(type); state.addText(node.value); state.closeNode()
  } },
  toMarkdown: { match: node => node.type.name === 'tocktutor_definition', runner: (state, node) => {
    state.addNode('tocktutorDefinition', undefined, node.textContent)
  } },
}))

export const obsidianSyntax = $remark('tocktutorObsidianSyntax', () => () => (tree, file) => {
  const visit = node => {
    if (!node.children || ['code', 'inlineCode', 'html'].includes(node.type)) return
    node.children = node.children.flatMap(child => {
      if (child.type === 'image-block' && ['youtube', 'twitter'].includes(classifyExternalEmbed(child.url)?.kind ?? '')) {
        const value = `![${child.alt ?? ''}](${child.url})`
        return [{ type: 'paragraph', children: [{ type: 'tocktutorInline', value }] }]
      }
      if (['definition', 'linkReference', 'imageReference'].includes(child.type)
        || child.type === 'inlineMath' && String(file).slice(child.position.start.offset, child.position.end.offset).startsWith('$$')
        || child.type === 'image' && ['youtube', 'twitter'].includes(classifyExternalEmbed(child.url)?.kind ?? '')) {
        const value = String(file).slice(child.position.start.offset, child.position.end.offset)
        return [{ type: child.type === 'definition' ? 'tocktutorDefinition' : 'tocktutorInline', value }]
      }
      if (child.type !== 'text') { visit(child); return [child] }
      const parts = []; let offset = 0
      for (const match of child.value.matchAll(syntax)) {
        if (match.index > offset) parts.push({ type: 'text', value: child.value.slice(offset, match.index) })
        parts.push({ type: 'tocktutorInline', value: match[0] })
        offset = match.index + match[0].length
      }
      if (!parts.length) return [child]
      if (offset < child.value.length) parts.push({ type: 'text', value: child.value.slice(offset) })
      return parts
    })
  }
  visit(tree)
})

export function configureObsidianContent(ctx) {
  // Crepe otherwise uses Markdown alt text to store its image-width ratio.
  // Preserve human-authored image descriptions independently of view sizing.
  ctx.update(imageBlockSchema.key, previous => context => {
    const schema = previous(context)
    return { ...schema,
      attrs: { ...schema.attrs, alt: { default: '' } },
      parseMarkdown: { ...schema.parseMarkdown, runner: (state, node, type) => {
        state.addNode(type, { src: node.url, caption: node.title ?? '', alt: node.alt ?? '', ratio: 1 })
      } },
      toMarkdown: { ...schema.toMarkdown, runner: (state, node) => {
        state.openNode('paragraph')
        state.addNode('image', undefined, undefined, { url: node.attrs.src, title: node.attrs.caption, alt: node.attrs.alt })
        state.closeNode()
      } },
    }
  })
  ctx.update(remarkStringifyOptionsCtx, value => ({
    ...value, handlers: { ...value.handlers, tocktutorInline: node => node.value, tocktutorDefinition: node => node.value },
  }))
}
