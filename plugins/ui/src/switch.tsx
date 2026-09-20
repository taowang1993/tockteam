import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from './utils.ts'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { size?: 'sm' | 'default' }
>(function Switch({ className, size = 'default', ...props }, ref) {
  // shadcn radix-nova: retain React 18 refs, DSH color-scheme, and the no-Preflight reset.
  // DSH's global superellipse corners and brand-primary-invert (same as brand-primary)
  // are not shadcn's round corners and contrasting thumb; override only this control.
  // Use Radix data-state selectors directly (DSH does not load shadcn's custom variants).
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      data-size={size}
      className={cn('peer group/switch relative box-border inline-flex shrink-0 appearance-none items-center rounded-full [corner-shape:round] border border-solid border-transparent p-0 outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-in-out group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-primary data-[state=unchecked]:bg-[light-dark(var(--dsw-alias-border-l2),color-mix(in_srgb,var(--dsw-alias-border-l2)_80%,transparent))] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none', className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full [corner-shape:round] bg-[light-dark(var(--dsw-alias-bg-base),var(--dsw-alias-label-primary))] ring-0 transition-[translate,background-color] duration-200 ease-in-out group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-[light-dark(var(--dsw-alias-bg-base),var(--dsw-alias-label-primary-inverted))] data-[state=unchecked]:translate-x-0 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
})

export { Switch }
