import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TockTutorRoute } from '../src/route.tsx'

// Control editor readiness without warming the real lazy imports first. The
// existing search focus matrix separately exercises Source and Live Preview.
const readiness = vi.hoisted(() => ({ ready: false, listeners: new Set<() => void>() }))
vi.mock('../src/editor-surface.tsx', async importOriginal => {
  const original = await importOriginal<typeof import('../src/editor-surface.tsx')>()
  const { useSyncExternalStore } = await import('react')
  return {
    ...original,
    LivePreviewView: ({ source }: { source: string }) => {
      const ready = useSyncExternalStore(listener => {
        readiness.listeners.add(listener)
        return () => { readiness.listeners.delete(listener) }
      }, () => readiness.ready)
      return ready ? <div aria-label="Live Preview Editor" className="cm-content" contentEditable suppressContentEditableWarning tabIndex={0}>{source}</div> : <p>Loading Editor…</p>
    },
  }
})

beforeEach(() => { readiness.ready = false })
afterEach(() => { cleanup(); readiness.listeners.clear() })

function mountRoute() {
  const vault = { generation: 1, id: `vault:${'a'.repeat(64)}` }
  const revision = `file:${'b'.repeat(64)}`
  const remote = {
    $on: () => () => {},
    tocktutorWorkbench: {
      currentVault: async () => ({ ok: true, value: { displayPath: '~/Fixture', generation: 1, name: 'Fixture', vault } }),
      listTree: async () => ({ ok: true, value: { complete: true, cursor: null, entries: [], generation: 1, scan: { entries: 0 }, truncated: false, truncationReason: null, warnings: [] } }),
      openDocument: async (path: string) => ({ ok: true, value: { content: '# Welcome\n', digest: `sha256:${'c'.repeat(64)}`, generation: 1, path, revision } }),
      readDraft: async () => ({ ok: true, value: { draft: null, generation: 1 } }),
    },
  }
  const props = { location: { hash: '', pathname: '/tocktutor/Welcome.md', search: '' }, navigate: vi.fn(), remote: remote as never, renderSlot: () => null }
  const view = render(<><button>Other Control</button><TockTutorRoute {...props} /></>)
  return { ...view, props }
}

async function waitForLoadedNote() {
  await screen.findByText('Welcome.md opened.')
  await screen.findByText('Loading Editor…')
}

function readyEditor() {
  act(() => { readiness.ready = true; for (const listener of readiness.listeners) listener() })
}

describe('deferred route editor focus', () => {
  it('focuses the editor when its asynchronous renderer is ready', async () => {
    mountRoute()
    await waitForLoadedNote()
    readyEditor()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Live Preview Editor')))
  })

  it.each(['pointer', 'keyboard'])('does not steal focus after a new %s interaction', async kind => {
    mountRoute()
    await waitForLoadedNote()
    const other = screen.getByRole('button', { name: 'Other Control' })
    if (kind === 'pointer') fireEvent.pointerDown(other)
    else fireEvent.keyDown(other, { key: 'Tab' })
    other.focus()
    readyEditor()
    await screen.findByLabelText('Live Preview Editor')
    await act(async () => {})
    expect(document.activeElement).toBe(other)
  })

  it('cancels a pending focus request when the route becomes inactive', async () => {
    const view = mountRoute()
    await waitForLoadedNote()
    view.rerender(<><button>Other Control</button><TockTutorRoute {...view.props} active={false} /></>)
    const other = screen.getByRole('button', { name: 'Other Control' })
    other.focus()
    readyEditor()
    await act(async () => {})
    expect(document.activeElement).toBe(other)
  })
})
