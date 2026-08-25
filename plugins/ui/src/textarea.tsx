import * as React from 'react'
import { cn } from './utils.ts'

type TextareaProps = React.ComponentProps<'textarea'> & {
  unstyled?: boolean
}

function Textarea({ className, unstyled = false, ...props }: TextareaProps): React.ReactElement {
  return (
    <textarea
      data-slot="textarea"
      className={unstyled
        ? className
        : cn('field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20', className)}
      {...props}
    />
  )
}

export { Textarea }
export type { TextareaProps }
