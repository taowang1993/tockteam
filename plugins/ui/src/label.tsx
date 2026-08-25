import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from './utils.ts'

type LabelProps = React.ComponentProps<typeof LabelPrimitive.Root> & {
  unstyled?: boolean
}

function Label({ className, unstyled = false, ...props }: LabelProps): JSX.Element {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={unstyled ? className : cn('flex w-fit items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50', className)}
      {...props}
    />
  )
}

export { Label }
export type { LabelProps }
