import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasBoard } from '../src/canvas-board.tsx'

const source = JSON.stringify({
  extension: { keep: true },
  nodes: [
    { id: 'text', type: 'text', x: 0, y: 0, width: 240, height: 120, text: '# First\nBody', extra: 'card' },
    { id: 'file', type: 'file', x: 320, y: 0, width: 240, height: 120, file: 'Notes/File.md' },
    { id: 'unsafe', type: 'link', x: 640, y: 0, width: 240, height: 120, url: 'https://user:secret@example.com' },
  ],
  edges: [],
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('CanvasBoard', () => {
  it('exposes pointer and keyboard-operable side handles through one conflict-safe change seam', () => {
    const onChange = vi.fn()
    render(<CanvasBoard source={source} revision="sha256:before" onChange={onChange} />)

    expect(screen.getByRole('region', { name: 'Canvas Board' })).toBeTruthy()
    const sourceHandle = screen.getByRole('button', { name: 'Right Connection Handle for First' })
    const targetHandle = screen.getByRole('button', { name: 'Left Connection Handle for Notes/File.md' })
    expect(sourceHandle.tagName).toBe('BUTTON')
    expect(sourceHandle.style.right).toBe('0px')
    expect(sourceHandle.style.transform).toBe('translate(50%, -50%)')

    fireEvent.click(sourceHandle)
    expect(sourceHandle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(targetHandle)

    expect(onChange).toHaveBeenCalledOnce()
    const change = onChange.mock.calls[0]?.[0]
    expect(change.previousSource).toBe(source)
    expect(change.expectedRevision).toBe('sha256:before')
    expect(change.operation).toBe('create-edge')
    expect(JSON.parse(change.source).extension).toEqual({ keep: true })
    expect(JSON.parse(change.source).edges).toEqual([{
      id: 'edge-1',
      fromNode: 'text',
      fromSide: 'right',
      toNode: 'file',
      toSide: 'left',
      toEnd: 'arrow',
    }])
  })

  it('cancels an armed connection with Escape and keeps unsafe persisted links inert', () => {
    const onChange = vi.fn()
    render(<CanvasBoard source={source} revision="sha256:before" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Top Connection Handle for First' }))
    expect(screen.getByRole('status').textContent).toContain('First')
    fireEvent.keyDown(screen.getByRole('region', { name: 'Canvas Board' }), { key: 'Escape' })
    expect(screen.queryByRole('status')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('note').textContent).toMatch(/unsafe link is inert/iu)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('emits bounded keyboard movement with exact rollback inputs and stays source-controlled', () => {
    const onChange = vi.fn()
    const { rerender } = render(<CanvasBoard source={source} revision="sha256:before" onChange={onChange} />)
    const card = screen.getByRole('button', { name: 'Canvas Card First' })

    fireEvent.click(card)
    expect(card.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(card, { key: 'ArrowRight' })

    const change = onChange.mock.calls[0]?.[0]
    expect(change.operation).toBe('move-node')
    expect(change.previousSource).toBe(source)
    expect(JSON.parse(change.source).nodes[0].x).toBe(20)

    rerender(<CanvasBoard source={source} revision="sha256:conflict" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Canvas Card First' }).getAttribute('data-canvas-x')).toBe('0')
  })

  it('selects and deletes a visible connection through the controlled change seam', () => {
    const connected = JSON.stringify({
      ...JSON.parse(source),
      edges: [{ id: 'edge-1', fromNode: 'text', fromSide: 'right', toNode: 'file', toSide: 'left', toEnd: 'arrow' }],
    })
    const onChange = vi.fn()
    render(<CanvasBoard source={connected} revision="sha256:edge" onChange={onChange} />)

    const edge = screen.getByRole('button', { name: 'Canvas Edge Unlabeled from First to Notes/File.md' })
    fireEvent.click(edge)
    expect(edge.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(edge, { key: 'Delete' })

    const change = onChange.mock.calls[0]?.[0]
    expect(change.operation).toBe('delete-edge')
    expect(change.previousSource).toBe(connected)
    expect(JSON.parse(change.source).edges).toEqual([])
  })

  it('renders excessive board spans as unsupported instead of allocating an unbounded surface', () => {
    const excessive = JSON.stringify({
      nodes: [{ id: 'far', type: 'text', x: 900_000_000, y: 0, width: 120, height: 80, text: 'Far' }],
      edges: [],
    })
    render(<CanvasBoard source={excessive} revision="sha256:before" onChange={() => {}} />)
    expect(screen.getByRole('note').textContent).toMatch(/display limit/iu)
    expect(screen.queryByRole('button', { name: 'Canvas Card Far' })).toBeNull()
  })
})
