import * as React from 'react'
import { cn } from './utils.ts'

type CardPartProps = React.ComponentProps<'div'> & { unstyled?: boolean }

function Card({ className, unstyled = false, ...props }: CardPartProps): JSX.Element {
  return <div data-slot="card" className={unstyled ? className : cn('flex flex-col gap-4 rounded-xl bg-card py-4 text-card-foreground ring-1 ring-foreground/10', className)} {...props} />
}

function CardHeader({ className, unstyled = false, ...props }: CardPartProps): JSX.Element {
  return <div data-slot="card-header" className={unstyled ? className : cn('grid auto-rows-min items-start gap-1.5 px-4', className)} {...props} />
}

function CardTitle({ className, unstyled = false, ...props }: CardPartProps): JSX.Element {
  return <div data-slot="card-title" className={unstyled ? className : cn('font-medium', className)} {...props} />
}

function CardDescription({ className, unstyled = false, ...props }: CardPartProps): JSX.Element {
  return <div data-slot="card-description" className={unstyled ? className : cn('text-sm text-muted-foreground', className)} {...props} />
}

function CardContent({ className, unstyled = false, ...props }: CardPartProps): JSX.Element {
  return <div data-slot="card-content" className={unstyled ? className : cn('px-4', className)} {...props} />
}

function CardFooter({ className, unstyled = false, ...props }: CardPartProps): JSX.Element {
  return <div data-slot="card-footer" className={unstyled ? className : cn('flex items-center px-4', className)} {...props} />
}

function CardAction({ className, unstyled = false, ...props }: CardPartProps): JSX.Element {
  return <div data-slot="card-action" className={unstyled ? className : cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
