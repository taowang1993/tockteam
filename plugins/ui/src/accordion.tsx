import * as React from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from './utils.ts'

// shadcn radix-nova with React 18 refs and native resets (DSH omits Preflight).
const Accordion = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Root>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>>(
  ({ className, ...props }, ref) => <AccordionPrimitive.Root ref={ref} data-slot="accordion" className={cn('flex w-full min-w-0 flex-col', className)} {...props} />,
)
Accordion.displayName = 'Accordion'

const AccordionItem = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Item>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>>(
  ({ className, ...props }, ref) => <AccordionPrimitive.Item ref={ref} data-slot="accordion-item" className={cn('min-w-0 border-0 border-b border-solid border-border last:border-b-0', className)} {...props} />,
)
AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Header className="m-0 flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        data-slot="accordion-trigger"
        className={cn('group/accordion-trigger relative m-0 flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg border border-solid border-transparent bg-transparent px-0 py-2.5 text-left font-[inherit] text-sm font-medium text-foreground outline-none transition-[color,box-shadow] hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0', className)}
        {...props}
      >
        {children}
        <ChevronDown aria-hidden="true" className="ml-auto text-muted-foreground group-aria-expanded/accordion-trigger:hidden" />
        <ChevronUp aria-hidden="true" className="ml-auto hidden text-muted-foreground group-aria-expanded/accordion-trigger:inline" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  ),
)
AccordionTrigger.displayName = 'AccordionTrigger'

const AccordionContent = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Content>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    // forceMount keeps settings drafts alive; hidden content must leave the tab order.
    <AccordionPrimitive.Content ref={ref} data-slot="accordion-content" className="overflow-hidden text-sm data-[state=closed]:hidden" {...props}>
      <div className={cn('min-w-0 pb-2.5', className)}>{children}</div>
    </AccordionPrimitive.Content>
  ),
)
AccordionContent.displayName = 'AccordionContent'

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
