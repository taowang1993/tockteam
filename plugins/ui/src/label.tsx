import * as React from 'react'
import { cn } from './utils.ts'

type LabelProps = React.ComponentProps<'label'> & {
  unstyled?: boolean
}

function Label({ className, unstyled = false, ...props }: LabelProps): React.ReactElement {
  return (
    <label
      data-slot="label"
      className={unstyled ? className : cn('flex w-fit items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50', className)}
      {...props}
    />
  )
}

export { Label }
export type { LabelProps }
