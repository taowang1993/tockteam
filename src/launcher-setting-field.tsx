import type { ReactNode } from 'react'
import { cn } from '@tockteam/ui'
import { Field, FieldContent, FieldDescription, FieldTitle } from '@tockteam/ui/field'
import { launcherFixedText } from './launcher-i18n.ts'

type LauncherSettingFieldProps = Readonly<{
  children?: ReactNode
  compact?: boolean
  description?: string
  label?: string
  title?: string
}>

export function LauncherSettingField({ children, compact = false, description, label, title }: LauncherSettingFieldProps): ReactNode {
  return (
    <Field className={cn('min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 last:border-b-0', compact ? 'py-2' : 'py-3')} orientation="horizontal">
      <FieldContent className="min-w-0 flex-1">
        <FieldTitle className="text-foreground">{launcherFixedText(label ?? title ?? '')}</FieldTitle>
        {description === undefined ? null : <FieldDescription className="max-w-2xl text-xs leading-5">{launcherFixedText(description)}</FieldDescription>}
      </FieldContent>
      {children === undefined ? null : <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{children}</div>}
    </Field>
  )
}

export function LauncherCompactSettingField(props: LauncherSettingFieldProps): ReactNode {
  return <LauncherSettingField {...props} compact />
}
