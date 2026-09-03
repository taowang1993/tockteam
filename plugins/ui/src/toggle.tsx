import * as React from 'react'
import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils.ts'

const toggleVariants = cva(
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow] hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-muted data-[state=on]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent',
      },
      size: {
        default: 'h-8 min-w-8 px-2.5',
        sm: 'h-7 min-w-7 rounded-md px-2 text-xs',
        lg: 'h-9 min-w-9 px-3',
      },
    },
    defaultVariants: { size: 'default', variant: 'default' },
  },
)

type ToggleProps = React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants> & { unstyled?: boolean }

function Toggle({ className, size = 'default', unstyled = false, variant = 'default', ...props }: ToggleProps): React.ReactElement {
  return <TogglePrimitive.Root data-slot="toggle" className={unstyled ? className : cn(toggleVariants({ className, size, variant }))} {...props} />
}

export { Toggle, toggleVariants }
export type { ToggleProps }
