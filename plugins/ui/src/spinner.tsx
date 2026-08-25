import type { ComponentProps } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from './utils.ts'

function Spinner({ className, ...props }: ComponentProps<typeof LoaderCircle>): JSX.Element {
  return <LoaderCircle aria-label="Loading" role="status" data-slot="spinner" className={cn('size-4 animate-spin motion-reduce:animate-none', className)} {...props} />
}

export { Spinner }
