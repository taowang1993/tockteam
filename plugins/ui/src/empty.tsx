import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils.ts'

type EmptyPartProps = React.ComponentProps<'div'> & { unstyled?: boolean }

function Empty({ className, unstyled = false, ...props }: EmptyPartProps): JSX.Element {
  return <div data-slot="empty" className={unstyled ? className : cn('flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance', className)} {...props} />
}

function EmptyHeader({ className, unstyled = false, ...props }: EmptyPartProps): JSX.Element {
  return <div data-slot="empty-header" className={unstyled ? className : cn('flex max-w-sm flex-col items-center gap-2', className)} {...props} />
}

const emptyMediaVariants = cva('mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0', {
  variants: {
    variant: {
      default: 'bg-transparent',
      icon: "flex size-8 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4",
    },
  },
  defaultVariants: { variant: 'default' },
})

type EmptyMediaProps = React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants> & { unstyled?: boolean }

function EmptyMedia({ className, variant = 'default', unstyled = false, ...props }: EmptyMediaProps): JSX.Element {
  return <div data-slot="empty-icon" data-variant={variant} className={unstyled ? className : cn(emptyMediaVariants({ variant, className }))} {...props} />
}

function EmptyTitle({ className, unstyled = false, ...props }: EmptyPartProps): JSX.Element {
  return <div data-slot="empty-title" className={unstyled ? className : cn('text-sm font-medium tracking-tight', className)} {...props} />
}

function EmptyDescription({ className, unstyled = false, ...props }: EmptyPartProps): JSX.Element {
  return <div data-slot="empty-description" className={unstyled ? className : cn('text-sm/relaxed text-muted-foreground', className)} {...props} />
}

function EmptyContent({ className, unstyled = false, ...props }: EmptyPartProps): JSX.Element {
  return <div data-slot="empty-content" className={unstyled ? className : cn('flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm text-balance', className)} {...props} />
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle }
