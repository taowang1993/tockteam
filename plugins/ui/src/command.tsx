import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog.tsx'
import { cn } from './utils.ts'

type Unstyled = { unstyled?: boolean }

function Command({ className, unstyled = false, ...props }: React.ComponentProps<typeof CommandPrimitive> & Unstyled): React.ReactElement {
  return <CommandPrimitive data-slot="command" className={unstyled ? className : cn('flex size-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground', className)} {...props} />
}

type CommandDialogProps = React.ComponentProps<typeof Dialog> & {
  children: React.ReactNode
  className?: string
  description?: string
  showCloseButton?: boolean
  title?: string
}

function CommandDialog({ children, className, description = 'Search for a command to run.', showCloseButton = false, title = 'Command Palette', ...props }: CommandDialogProps): React.ReactElement {
  return (
    <Dialog {...props}>
      <DialogContent className={cn('overflow-hidden p-0', className)} showCloseButton={showCloseButton}>
        <DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({ className, unstyled = false, ...props }: React.ComponentProps<typeof CommandPrimitive.Input> & Unstyled): React.ReactElement {
  if (unstyled) return <CommandPrimitive.Input data-slot="command-input" className={className} {...props} />
  return (
    <div data-slot="command-input-wrapper" className="flex h-10 items-center gap-2 border-b px-3">
      <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input data-slot="command-input" className={cn('h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50', className)} {...props} />
    </div>
  )
}

function CommandList({ className, unstyled = false, ...props }: React.ComponentProps<typeof CommandPrimitive.List> & Unstyled): React.ReactElement {
  return <CommandPrimitive.List data-slot="command-list" className={unstyled ? className : cn('max-h-72 overflow-x-hidden overflow-y-auto', className)} {...props} />
}

function CommandEmpty({ className, unstyled = false, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty> & Unstyled): React.ReactElement {
  return <CommandPrimitive.Empty data-slot="command-empty" className={unstyled ? className : cn('py-6 text-center text-sm', className)} {...props} />
}

function CommandGroup({ className, unstyled = false, ...props }: React.ComponentProps<typeof CommandPrimitive.Group> & Unstyled): React.ReactElement {
  return <CommandPrimitive.Group data-slot="command-group" className={unstyled ? className : cn('overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground', className)} {...props} />
}

function CommandItem({ className, unstyled = false, ...props }: React.ComponentProps<typeof CommandPrimitive.Item> & Unstyled): React.ReactElement {
  return <CommandPrimitive.Item data-slot="command-item" className={unstyled ? className : cn('flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground', className)} {...props} />
}

function CommandSeparator({ className, unstyled = false, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator> & Unstyled): React.ReactElement {
  return <CommandPrimitive.Separator data-slot="command-separator" className={unstyled ? className : cn('-mx-1 h-px bg-border', className)} {...props} />
}

function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>): React.ReactElement {
  return <span data-slot="command-shortcut" className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)} {...props} />
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
