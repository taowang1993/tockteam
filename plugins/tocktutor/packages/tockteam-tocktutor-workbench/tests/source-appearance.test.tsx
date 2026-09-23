import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { SourceEditor } from '../src/source-editor.tsx'

afterEach(cleanup)

it('shows strike, highlight, and purple links without hiding source syntax', async () => {
  const content = '~~strike~~ ==highlight== [[Welcome]] [[Guide|alias]] [Help](https://example.com) https://example.org\n'
  const editorViewRef = { current: null as unknown }
  const onContentChange = vi.fn()
  const { container } = render(<SourceEditor content={content} editorViewRef={editorViewRef} onContentChange={onContentChange} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  const styledText = (property: 'textDecoration' | 'backgroundColor' | 'color', value: string) =>
    [...container.querySelectorAll('.cm-content span')].filter(span => getComputedStyle(span)[property] === value).map(span => span.textContent).join('')
  expect(styledText('textDecoration', 'line-through')).toContain('~~strike~~')
  expect(styledText('backgroundColor', 'var(--dsw-specific-markdown-highlight)')).toContain('==highlight==')
  const links = styledText('color', 'var(--dsw-specific-markdown-accent)')
  for (const link of ['[[Welcome]]', '[[Guide|alias]]', '[Help](https://example.com)', 'https://example.org']) expect(links).toContain(link)
  expect(container.querySelector('.cm-content')?.textContent).toBe(content.trimEnd())
  expect(onContentChange).not.toHaveBeenCalled()
  const view = editorViewRef.current as EditorView
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Plain text' } })
  expect(styledText('backgroundColor', 'var(--dsw-specific-markdown-highlight)')).toBe('')
  expect(styledText('color', 'var(--dsw-specific-markdown-accent)')).toBe('')
})

it('leaves metadata, code, escaped markers, and unfinished highlights unformatted', async () => {
  const content = '---\nlabel: "==metadata== [[Note]] ~~strike~~"\n---\n\n`==inline== [[Note]] ~~strike~~`\n\n```md\n==fenced== [[Note]] ~~strike~~\n```\n\n\\==escaped== \\[[escaped]] ==unfinished\n'
  const editorViewRef = { current: null as unknown }
  const { container } = render(<SourceEditor content={content} editorViewRef={editorViewRef} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  const tree = syntaxTree((editorViewRef.current as EditorView).state).toString()
  expect(tree).not.toMatch(/Highlight|WikiLink|Strikethrough/u)
  for (const span of container.querySelectorAll('.cm-content span')) {
    expect(getComputedStyle(span).backgroundColor).not.toBe('var(--dsw-specific-markdown-highlight)')
    expect(getComputedStyle(span).textDecoration).not.toContain('line-through')
  }
})

it('keeps frontmatter as metadata with two visible delimiters, not an underlined Markdown heading', async () => {
  const content = '---\r\nstatus: review\r\ntags: [comparison, typography]\r\n# Metadata comment\r\n---\r\n\r\n# Body\r\n\r\n---\r\n'
  const editorViewRef = { current: null as unknown }
  const onContentChange = vi.fn()
  const { container } = render(<SourceEditor content={content} editorViewRef={editorViewRef} onContentChange={onContentChange} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  const view = editorViewRef.current as EditorView
  const tree = syntaxTree(view.state).toString()
  expect(tree).toContain('Frontmatter')
  expect(tree).not.toContain('SetextHeading')
  expect(tree).toContain('HorizontalRule')
  const lines = [...container.querySelectorAll('.cm-line')]
  expect(lines.slice(0, 5).map(line => line.textContent)).toEqual(['---', 'status: review', 'tags: [comparison, typography]', '# Metadata comment', '---'])
  expect(container.querySelectorAll('.cm-tock-heading-line')).toHaveLength(1)
  for (const line of lines.slice(0, 5)) {
    for (const element of [line, ...line.querySelectorAll('*')]) {
      expect(getComputedStyle(element).textDecoration).not.toContain('underline')
    }
  }
  expect(onContentChange).not.toHaveBeenCalled()
  view.dispatch({ changes: { from: view.state.doc.length, insert: 'Tail' } })
  expect(onContentChange).toHaveBeenLastCalledWith(`${content}Tail`)
})

it('uses the text color for ordinary Markdown punctuation in both themes', async () => {
  const content = '---\nstatus: review\n---\n\nUse **bold** and *italic*.\n\n1. Item\n\n> Quote\n'
  const { container } = render(<div style={{ color: 'rgb(224, 224, 224)' }}><SourceEditor content={content} /></div>)
  await waitFor(() => expect(container.querySelector('.cm-content span')).toBeTruthy())
  for (const color of ['rgb(224, 224, 224)', 'rgb(34, 34, 34)']) {
    const editor = container.querySelector<HTMLElement>('.cm-editor')!
    editor.style.color = color
    for (const span of container.querySelectorAll('.cm-content span')) {
      expect(getComputedStyle(span).color, span.textContent ?? '').toBe(color)
    }
  }
})
