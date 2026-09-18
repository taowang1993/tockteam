import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Label } from './label.tsx'
import { cn } from './utils.ts'

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>): React.ReactElement {
  return <fieldset data-slot="field-set" className={cn('flex flex-col gap-4', className)} {...props} />
}

function FieldLegend({ className, variant = 'legend', ...props }: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' }): React.ReactElement {
  return <legend data-slot="field-legend" data-variant={variant} className={cn('font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base', className)} {...props} />
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return <div data-slot="field-group" className={cn('flex w-full flex-col gap-5', className)} {...props} />
}

const fieldVariants = cva('group/field flex w-full gap-2 data-[invalid=true]:text-destructive', {
  variants: {
    orientation: {
      horizontal: 'flex-row items-center has-[>[data-slot=field-content]]:items-start',
      responsive: 'flex-col sm:flex-row sm:items-center sm:has-[>[data-slot=field-content]]:items-start',
      vertical: 'flex-col',
    },
  },
  defaultVariants: { orientation: 'vertical' },
})

function Field({ className, orientation = 'vertical', ...props }: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>): React.ReactElement {
  return <div role="group" data-slot="field" data-orientation={orientation} className={cn(fieldVariants({ orientation }), className)} {...props} />
}

function FieldContent({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return <div data-slot="field-content" className={cn('flex min-w-0 flex-1 flex-col gap-1 leading-snug', className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>): React.ReactElement {
  return <Label data-slot="field-label" className={cn('group-data-[disabled=true]/field:opacity-50', className)} {...props} />
}

function FieldTitle({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return <div data-slot="field-title" className={cn('text-sm font-medium group-data-[disabled=true]/field:opacity-50', className)} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>): React.ReactElement {
  return <p data-slot="field-description" className={cn('text-sm leading-normal text-muted-foreground', className)} {...props} />
}

function FieldSeparator({ children, className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div data-slot="field-separator" className={cn('relative flex items-center text-sm text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border', className)} {...props}>
      {children === undefined ? null : <span className="px-2">{children}</span>}
    </div>
  )
}

function FieldError({ className, children, errors, ...props }: React.ComponentProps<'div'> & { errors?: Array<{ message?: string } | undefined> }): React.ReactElement | null {
  const messages = [...new Set(errors?.flatMap(error => error?.message === undefined ? [] : [error.message]) ?? [])]
  const content = children ?? (messages.length === 1 ? messages[0] : messages.length > 1 ? <ul className="ml-4 list-disc">{messages.map(message => <li key={message}>{message}</li>)}</ul> : null)
  if (content === null || content === undefined) return null
  return <div role="alert" data-slot="field-error" className={cn('text-sm text-destructive', className)} {...props}>{content}</div>
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
}
