import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from './utils.ts'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  // DSH omits Tailwind Preflight: reset native button padding and sizing here.
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      className={cn('peer relative box-border inline-flex h-5 w-9 shrink-0 cursor-pointer appearance-none items-center rounded-full border border-solid border-border bg-muted p-0 outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-transparent data-[state=checked]:bg-primary motion-reduce:transition-none', className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 shrink-0 translate-x-px rounded-full bg-[light-dark(var(--dsw-alias-bg-base),var(--dsw-alias-label-primary))] shadow-[0_1px_3px_rgb(0_0_0_/_20%)] transition-transform duration-150 data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-primary-foreground motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
})

export { Switch }
