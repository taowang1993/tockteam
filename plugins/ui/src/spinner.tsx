import * as React from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from './utils.ts'

const Spinner = React.forwardRef<
  React.ElementRef<typeof LoaderCircle>,
  React.ComponentPropsWithoutRef<typeof LoaderCircle>
>(function Spinner({ className, ...props }, ref) {
  return <LoaderCircle ref={ref} aria-label="Loading" role="status" data-slot="spinner" className={cn('size-4 animate-spin motion-reduce:animate-none', className)} {...props} />
})

export { Spinner }
