import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from './utils.ts'

// shadcn radix-nova; retain React 18 refs, DSH tokens, and thumb-level labeling.
const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>>(
  ({ className, defaultValue, value, min = 0, max = 100, id, 'aria-label': label, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-valuetext': valueText, ...props }, ref) => {
    const values = value ?? defaultValue ?? [min, max]
    return (
      <SliderPrimitive.Root
        ref={ref}
        data-slot="slider"
        {...(value === undefined ? { defaultValue: values } : { value })}
        min={min}
        max={max}
        className={cn('relative flex min-w-0 touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=horizontal]:min-h-6 data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col', className)}
        {...props}
      >
        <SliderPrimitive.Track data-slot="slider-track" className="relative grow overflow-hidden rounded-full [corner-shape:round] bg-muted data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1">
          <SliderPrimitive.Range data-slot="slider-range" className="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full" />
        </SliderPrimitive.Track>
        {/* A thumb's position is its identity; keying by value would remount it during dragging. */}
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            id={values.length === 1 ? id : id ? `${id}-${index}` : undefined}
            aria-label={label}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-valuetext={valueText}
            data-slot="slider-thumb"
            className="relative box-border block size-3 shrink-0 rounded-full [corner-shape:round] border border-solid border-ring bg-background ring-ring/50 outline-none transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 active:ring-3 data-[disabled]:pointer-events-none motion-reduce:transition-none"
          />
        ))}
      </SliderPrimitive.Root>
    )
  },
)
Slider.displayName = 'Slider'

export { Slider }
