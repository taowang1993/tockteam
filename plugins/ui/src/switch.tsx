import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from './utils.ts'

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn('peer relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-transparent data-[state=checked]:bg-primary', className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3 translate-x-0.5 rounded-full bg-background shadow-[0_1px_3px_rgb(0_0_0_/_20%)] transition-transform duration-150 data-[state=checked]:translate-x-3.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
