import * as React from 'react'
import { cn } from './utils.ts'

type InputProps = React.ComponentProps<'input'> & {
  unstyled?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, unstyled = false, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={unstyled
        ? className
        : cn('h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20', className)}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
export type { InputProps }
