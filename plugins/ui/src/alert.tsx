import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils.ts'

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-3 py-2.5 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        destructive: 'border-destructive/30 bg-destructive/5 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

type AlertProps = React.ComponentProps<'div'> & VariantProps<typeof alertVariants> & {
  unstyled?: boolean
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, variant = 'default', unstyled = false, ...props },
  ref,
): JSX.Element {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={unstyled ? className : cn(alertVariants({ variant, className }))}
      ref={ref}
      {...props}
    />
  )
})

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div data-slot="alert-title" className={cn('col-start-2 font-medium', className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div data-slot="alert-description" className={cn('col-start-2 text-sm text-muted-foreground', className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle }
export type { AlertProps }
