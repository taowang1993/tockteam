import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TockTutorRouteView,
  type WorkbenchRouteSnapshot,
} from '../src/route.tsx'

const snapshot: WorkbenchRouteSnapshot = {
  dispatchDialog: null,
  documentKind: null,
  entries: [],
  focusedPaneId: 'main',
  message: '',
  mode: 'reading',
  panes: [{ activePath: null, id: 'main', tabs: [] }],
  path: null,
  phase: 'inactive',
  revision: null,
  saveStatus: 'saved',
  searchOpen: false,
  searchQuery: '',
  source: '',
  vault: null,
  warnings: [],
}

afterEach(() => {
  document.body.replaceChildren()
})

function renderRoute(overrides: Partial<WorkbenchRouteSnapshot> = {}, props: {
  onCancelDispatch?(): void
  onSubmitDispatch?(draft: { path: string } | { text: string; title: string }): void
} = {}): void {
  render(<TockTutorRouteView
    onActivateTab={() => {}}
    onAddPane={() => {}}
    onEdit={() => {}}
    onFocusPane={() => {}}
    onMode={() => {}}
    onMoveCanvas={() => {}}
    onSave={() => {}}
    onSelect={() => {}}
    onToggleTask={() => {}}
    snapshot={{ ...snapshot, ...overrides }}
    {...props}
  />)
}

describe('TockTutor titlebar panel controls', () => {
  it('opens and closes the Files sidebar and Assistant panel', () => {
    renderRoute()

    const searchButton = screen.getByRole('button', { name: 'Search Notes' })
    expect(searchButton.className).toContain('border-0')

    const sidebarButton = screen.getByRole('button', { name: 'Toggle Files Sidebar' })
    const sidebar = screen.getByRole('complementary', { name: 'Files' })
    const resizeHandle = screen.getByRole('button', { name: /Resize Files Sidebar/u })
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.getAttribute('data-open')).toBe('true')

    fireEvent.click(sidebarButton)
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('false')
    expect(sidebar.getAttribute('aria-hidden')).toBe('true')
    expect(sidebar.getAttribute('data-open')).toBe('false')
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(sidebar.hidden).toBe(false)
    expect(resizeHandle.hidden).toBe(true)

    fireEvent.click(sidebarButton)
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.getAttribute('data-open')).toBe('true')
    expect(sidebar.hasAttribute('inert')).toBe(false)

    const assistantButton = screen.getByRole('button', { name: 'Toggle Assistant Panel' })
    const assistant = screen.getByLabelText('Assistant Panel')
    expect(assistantButton.getAttribute('aria-expanded')).toBe('false')
    expect(assistant.getAttribute('data-open')).toBe('false')
    expect(assistant.hidden).toBe(false)
    expect(assistant.hasAttribute('inert')).toBe(true)

    fireEvent.click(assistantButton)
    expect(assistantButton.getAttribute('aria-expanded')).toBe('true')
    expect(assistant.getAttribute('data-open')).toBe('true')
    expect(assistant.hasAttribute('inert')).toBe(false)
    const assistantResize = screen.getByRole('separator', { name: 'Resize Assistant Panel' })
    expect(assistantResize.getAttribute('aria-valuenow')).toBe('300')
    fireEvent.pointerDown(assistantResize, { clientX: 700 })
    expect(assistant.style.transitionDuration).toBe('0ms')
    fireEvent.pointerUp(window)
    expect(assistant.style.transitionDuration).toBe('')
    fireEvent.keyDown(assistantResize, { key: 'ArrowLeft' })
    expect(assistantResize.getAttribute('aria-valuenow')).toBe('310')

    fireEvent.click(assistantButton)
    expect(assistantButton.getAttribute('aria-expanded')).toBe('false')
    expect(assistant.getAttribute('data-open')).toBe('false')
    expect(assistant.hasAttribute('inert')).toBe(true)
  })

  it('renders and submits the shadcn New Note dialog', () => {
    const onSubmitDispatch = vi.fn()
    renderRoute({ dispatchDialog: 'new' }, { onSubmitDispatch })

    expect(screen.getByRole('dialog', { name: 'New Note' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('New Note Path'), { target: { value: 'Notes/New.md' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmitDispatch).toHaveBeenCalledWith({ path: 'Notes/New.md' })
  })

  it('closes the shadcn dispatch dialog on Escape', () => {
    const onCancelDispatch = vi.fn()
    renderRoute({ dispatchDialog: 'capture' }, { onCancelDispatch })

    expect(screen.getByRole('dialog', { name: 'Quick Capture' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancelDispatch).toHaveBeenCalledOnce()
  })
})
