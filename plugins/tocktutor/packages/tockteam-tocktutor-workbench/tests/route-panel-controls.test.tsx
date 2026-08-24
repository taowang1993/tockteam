import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

describe('TockTutor titlebar panel controls', () => {
  it('opens and closes the Files sidebar and Assistant panel', () => {
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
      snapshot={snapshot}
    />)

    const sidebarButton = screen.getByRole('button', { name: 'Toggle Files Sidebar' })
    const sidebar = screen.getByRole('complementary', { name: 'Files' })
    const resizeHandle = screen.getByRole('button', { name: /Resize Files Sidebar/u })
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(sidebarButton)
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('false')
    expect(sidebar.hidden).toBe(true)
    expect(resizeHandle.hidden).toBe(true)

    fireEvent.click(sidebarButton)
    expect(sidebarButton.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.hidden).toBe(false)

    const assistantButton = screen.getByRole('button', { name: 'Toggle Assistant Panel' })
    const assistant = screen.getByLabelText('Assistant Panel')
    expect(assistantButton.getAttribute('aria-expanded')).toBe('false')
    expect(assistant.hidden).toBe(true)

    fireEvent.click(assistantButton)
    expect(assistantButton.getAttribute('aria-expanded')).toBe('true')
    expect(assistant.hidden).toBe(false)

    fireEvent.click(assistantButton)
    expect(assistantButton.getAttribute('aria-expanded')).toBe('false')
    expect(assistant.hidden).toBe(true)
  })
})
