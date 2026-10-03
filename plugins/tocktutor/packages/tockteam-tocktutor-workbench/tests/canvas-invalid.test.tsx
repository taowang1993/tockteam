import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasBoard } from '../src/canvas-board.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it.each(['', '{broken', 'null'])('displays an invalid Canvas error without trapping the editor in a render loop: %s', source => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
    if (String(message).includes('Maximum update depth exceeded')) throw new Error('Canvas entered an endless update loop')
  })
  const onChange = vi.fn()
  render(<CanvasBoard source={source} revision="file:invalid" onChange={onChange} />)
  expect(screen.getByRole('region', { name: 'Canvas Board' })).toBeTruthy()
  expect(screen.getByRole('note').textContent).toMatch(/not valid JSON|must contain a nodes array/iu)
  expect(consoleError).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
})

it('clears an existing selection when the Canvas becomes invalid and allows a valid board to reopen', () => {
  const source = JSON.stringify({ nodes: [{ id: 'card', type: 'text', x: 0, y: 0, width: 240, height: 120, text: 'Lesson' }], edges: [] })
  const onChange = vi.fn()
  const { rerender } = render(<CanvasBoard source={source} revision="file:valid" onChange={onChange} />)
  const card = screen.getByRole('button', { name: 'Canvas Card Lesson' })
  fireEvent.click(card)
  expect(card.getAttribute('aria-pressed')).toBe('true')
  rerender(<CanvasBoard source="" revision="file:invalid" onChange={onChange} />)
  expect(screen.getByRole('note').textContent).toMatch(/not valid JSON/iu)
  rerender(<CanvasBoard source={source} revision="file:valid-again" onChange={onChange} />)
  expect(screen.getByRole('button', { name: 'Canvas Card Lesson' }).getAttribute('aria-pressed')).toBe('false')
  expect(onChange).not.toHaveBeenCalled()
})
