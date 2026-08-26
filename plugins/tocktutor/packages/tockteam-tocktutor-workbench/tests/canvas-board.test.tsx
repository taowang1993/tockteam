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

  it('moves and resizes with bounded pointer snapping and accessible zoom controls', () => {
    const onChange = vi.fn()
    const view = render(<CanvasBoard source={source} revision="sha256:pointer" onChange={onChange} />)
    const surface = screen.getByLabelText('Canvas Board Surface')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom Canvas In' }))
    expect((surface as HTMLElement).style.zoom).toBe('1.25')
    const card = screen.getByRole('button', { name: 'Canvas Card First' })
    fireEvent.pointerDown(card, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 25, clientY: 25 })
    fireEvent.pointerUp(window)
    const moved = onChange.mock.calls.at(-1)?.[0]
    expect(moved.operation).toBe('move-node')
    expect(JSON.parse(moved.source).nodes[0]).toMatchObject({ x: 20, y: 20 })

    view.rerender(<CanvasBoard source={moved.source} revision="sha256:resize" onChange={onChange} />)
    const resize = screen.getByRole('button', { name: 'Resize Card First' })
    fireEvent.pointerDown(resize, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 20 })
    fireEvent.pointerUp(window)
    const resized = onChange.mock.calls.at(-1)?.[0]
    expect(resized.operation).toBe('resize-node')
    expect(JSON.parse(resized.source).nodes[0]).toMatchObject({ width: 280, height: 140 })
    fireEvent.click(screen.getByRole('button', { name: 'Reset Canvas Zoom' }))
    expect((screen.getByLabelText('Canvas Board Surface') as HTMLElement).style.zoom).toBe('1')
    const emitted = onChange.mock.calls.length
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Canvas Card First' }), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 80, clientY: 40 })
    fireEvent.pointerCancel(window)
    expect(onChange).toHaveBeenCalledTimes(emitted)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Canvas Card First' }), { button: 0, clientX: 0, clientY: 0 })
    view.unmount()
    fireEvent.pointerMove(window, { clientX: 80, clientY: 40 })
    fireEvent.pointerUp(window)
    expect(onChange).toHaveBeenCalledTimes(emitted)
  })

  it('Shift- and marquee-selects mixed cards and moves them through one rollback change', () => {
    const onChange = vi.fn()
    render(<CanvasBoard source={source} revision="sha256:mixed" onChange={onChange} />)
    const first = screen.getByRole('button', { name: 'Canvas Card First' })
    const file = screen.getByRole('button', { name: 'Canvas Card Notes/File.md' })

    fireEvent.click(first)
    fireEvent.click(file, { shiftKey: true })
    expect(first.getAttribute('aria-pressed')).toBe('true')
    expect(file.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(file, { key: 'ArrowRight' })
    const shifted = onChange.mock.calls.at(-1)?.[0]
    expect(shifted.operation).toBe('move-node')
    expect(shifted.previousSource).toBe(source)
    expect(JSON.parse(shifted.source).nodes.slice(0, 2).map((node: { x: number }) => node.x)).toEqual([20, 340])

    onChange.mockClear()
    const surface = screen.getByLabelText('Canvas Board Surface')
    fireEvent.pointerDown(surface, { button: 0, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: 620, clientY: 180 })
    expect(screen.getByRole('img', { name: 'Canvas Marquee Selection' })).toBeTruthy()
    fireEvent.pointerUp(window)
    expect(first.getAttribute('aria-pressed')).toBe('true')
    expect(file.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    const marqueeMoved = onChange.mock.calls.at(-1)?.[0]
    expect(JSON.parse(marqueeMoved.source).nodes.slice(0, 2).map((node: { y: number }) => node.y)).toEqual([20, 20])
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

  it('creates, edits, duplicates, and deletes cards and groups through controlled changes', () => {
    const onChange = vi.fn()
    const view = render(<CanvasBoard source={source} revision="sha256:create" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Text Card' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Card Text' }), { target: { value: 'New Card' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Card' }))
    const created = onChange.mock.calls.at(-1)?.[0]
    expect(created.operation).toBe('create-node')
    expect(JSON.parse(created.source).nodes.at(-1).text).toBe('New Card')

    view.rerender(<CanvasBoard source={created.source} revision="sha256:edit" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Canvas Card New Card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Card' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Card Text' }), { target: { value: 'Edited Card' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Card Width' }), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Card' }))
    const edited = onChange.mock.calls.at(-1)?.[0]
    expect(edited.operation).toBe('update-node')
    expect(JSON.parse(edited.source).nodes.at(-1)).toMatchObject({ text: 'Edited Card', width: 300 })

    view.rerender(<CanvasBoard source={edited.source} revision="sha256:duplicate" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Canvas Card Edited Card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Card' }))
    const duplicated = onChange.mock.calls.at(-1)?.[0]
    expect(duplicated.operation).toBe('duplicate-node')
    expect(JSON.parse(duplicated.source).nodes).toHaveLength(5)

    view.rerender(<CanvasBoard source={duplicated.source} revision="sha256:group" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Group' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Group Label' }), { target: { value: 'Research' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
    const grouped = onChange.mock.calls.at(-1)?.[0]
    expect(JSON.parse(grouped.source).nodes.at(-1)).toMatchObject({ type: 'group', label: 'Research' })

    view.rerender(<CanvasBoard source={grouped.source} revision="sha256:group-duplicate" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Canvas Group Research' }))
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Group' }))
    const duplicatedGroup = onChange.mock.calls.at(-1)?.[0]
    expect(duplicatedGroup.operation).toBe('duplicate-node')
    expect(JSON.parse(duplicatedGroup.source).nodes.filter((node: { type?: string }) => node.type === 'group')).toHaveLength(2)

    view.rerender(<CanvasBoard source={duplicatedGroup.source} revision="sha256:delete" onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Canvas Group Research' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Group' }))
    const deleted = onChange.mock.calls.at(-1)?.[0]
    expect(deleted.operation).toBe('delete-node')
    expect(JSON.parse(deleted.source).nodes.filter((node: { label?: string }) => node.label === 'Research')).toHaveLength(1)
  })

  it('edits edge labels, colors, and endpoints and exposes visible deletion', () => {
    const connected = JSON.stringify({
      ...JSON.parse(source),
      nodes: [...JSON.parse(source).nodes, { id: 'target', type: 'text', x: 960, y: 0, width: 240, height: 120, text: 'Target' }],
      edges: [{ id: 'edge-1', fromNode: 'text', fromSide: 'right', toNode: 'file', toSide: 'left', toEnd: 'arrow', extension: 'keep' }],
    })
    const onChange = vi.fn()
    const view = render(<CanvasBoard source={connected} revision="sha256:edge-edit" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Canvas Edge Unlabeled from First to Notes/File.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Connection' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Connection Label' }), { target: { value: 'Supports' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Connection Color' }), { target: { value: '4' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Connection Target Card' }), { target: { value: 'target' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Connection Target Side' }), { target: { value: 'top' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Connection' }))

    const edited = onChange.mock.calls.at(-1)?.[0]
    expect(edited.operation).toBe('reconnect-edge')
    expect(JSON.parse(edited.source).edges[0]).toMatchObject({
      color: '4',
      extension: 'keep',
      label: 'Supports',
      toNode: 'target',
      toSide: 'top',
    })

    view.rerender(<CanvasBoard source={edited.source} revision="sha256:edge-delete" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Canvas Edge Supports from First to Target' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Connection' }))
    expect(JSON.parse(onChange.mock.calls.at(-1)?.[0].source).edges).toEqual([])
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
