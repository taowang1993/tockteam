import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { Dialog, DialogOverlay, DialogPortal } from '@tockteam/ui/dialog'
import { Input } from '@tockteam/ui/input'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('mounts shared UI refs through the browser source export without React warnings', () => {
  const inputRef = createRef<HTMLInputElement>()
  const overlayRef = createRef<HTMLDivElement>()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

  render(
    <>
      <Input ref={inputRef} aria-label="Search notes" />
      <Dialog open>
        <DialogPortal>
          <DialogOverlay ref={overlayRef} />
        </DialogPortal>
      </Dialog>
    </>,
  )

  expect(inputRef.current).toBeInstanceOf(HTMLInputElement)
  expect(overlayRef.current).toBeInstanceOf(HTMLDivElement)
  expect(errors.mock.calls.some(([message]) => String(message).includes('Function components cannot be given refs'))).toBe(false)
})
