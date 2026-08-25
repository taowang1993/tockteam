import * as React from 'react'
import { cn } from './utils.ts'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)} {...props} />
}

export { Skeleton }
