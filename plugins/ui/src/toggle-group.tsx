import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import type { VariantProps } from 'class-variance-authority'
import { toggleVariants } from './toggle.tsx'
import { cn } from './utils.ts'

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({ size: 'default', variant: 'default' })

type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof toggleVariants> & { unstyled?: boolean }

function ToggleGroup({ children, className, size, unstyled = false, variant, ...props }: ToggleGroupProps): React.ReactElement {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-size={size}
      data-variant={variant}
      className={unstyled ? className : cn('flex w-fit items-center gap-1', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size, variant }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

type ToggleGroupItemProps = React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants> & { unstyled?: boolean }

function ToggleGroupItem({ className, size = 'default', unstyled = false, variant = 'default', ...props }: ToggleGroupItemProps): React.ReactElement {
  const context = React.useContext(ToggleGroupContext)
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-size={context.size ?? size}
      data-variant={context.variant ?? variant}
      className={unstyled ? className : cn(toggleVariants({ size: context.size ?? size, variant: context.variant ?? variant }), className)}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
export type { ToggleGroupItemProps, ToggleGroupProps }
