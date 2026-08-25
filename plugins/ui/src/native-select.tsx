import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './utils.ts'

type NativeSelectProps = Omit<React.ComponentProps<'select'>, 'size'> & {
  size?: 'sm' | 'default'
  unstyled?: boolean
}

function NativeSelect({ className, size = 'default', unstyled = false, ...props }: NativeSelectProps): JSX.Element {
  if (unstyled) {
    return <select data-slot="native-select" className={className} {...props} />
  }
  return (
    <div
      className={cn('group/native-select relative w-fit has-[select:disabled]:opacity-50', className)}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-md data-[size=sm]:py-0.5"
        {...props}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none" aria-hidden="true" data-slot="native-select-icon" />
    </div>
  )
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>): JSX.Element {
  return <option data-slot="native-select-option" className={className} {...props} />
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<'optgroup'>): JSX.Element {
  return <optgroup data-slot="native-select-optgroup" className={className} {...props} />
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
export type { NativeSelectProps }
