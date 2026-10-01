import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@tockteam/ui/alert-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@tockteam/ui/popover'

afterEach(cleanup)

it.each([false, true])('keeps shared popover defaults unless local ownership is requested: %s', async local => {
  render(<div data-overlay-owner="true"><Popover>
    <PopoverTrigger>Show Suggestions</PopoverTrigger>
    <PopoverContent {...(local ? { portalled: false } : {})}>Suggestion Content</PopoverContent>
  </Popover></div>)
  fireEvent.click(screen.getByRole('button', { name: 'Show Suggestions' }))
  const content = await screen.findByText('Suggestion Content')
  expect(content.closest('[data-overlay-owner]') !== null).toBe(local)
})

it.each([false, true])('keeps shared alert-dialog defaults and its overlay together: %s', async local => {
  render(<div data-overlay-owner="true"><AlertDialog defaultOpen>
    <AlertDialogContent {...(local ? { portalled: false } : {})}>
      <AlertDialogTitle>Confirm Change</AlertDialogTitle>
      <AlertDialogDescription>Confirm the intended property change.</AlertDialogDescription>
    </AlertDialogContent>
  </AlertDialog></div>)
  const content = await screen.findByRole('alertdialog')
  const overlay = document.querySelector('[data-slot="alert-dialog-overlay"]')
  expect(content.closest('[data-overlay-owner]') !== null).toBe(local)
  expect(overlay).not.toBeNull()
  expect(overlay?.closest('[data-overlay-owner]') !== null).toBe(local)
})
