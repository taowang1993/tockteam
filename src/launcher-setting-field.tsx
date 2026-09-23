import { cloneElement, isValidElement, useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@tockteam/ui'
import { Checkbox } from '@tockteam/ui/checkbox'
import { Input } from '@tockteam/ui/input'
import { NativeSelect } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { Slider } from '@tockteam/ui/slider'
import { Textarea } from '@tockteam/ui/textarea'
import { LauncherSyncedInput, LauncherSyncedNativeSelect, LauncherSyncedTextarea } from './launcher-settings-drafts.tsx'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@tockteam/ui/field'
import { launcherFixedText } from './launcher-i18n.ts'

type LauncherSettingFieldProps = Readonly<{
  children?: ReactNode
  compact?: boolean
  description?: string
  label?: string
  title?: string
}>

export function LauncherSettingField({ children, compact = false, description, label, title }: LauncherSettingFieldProps): ReactNode {
  const id = useId()
  const helpId = description === undefined ? undefined : `${id}-help`
  // Only a single known control gets a label. Compound rows retain group semantics.
  const control = isValidElement<Pick<ComponentProps<'input'>, 'id' | 'aria-describedby'>>(children)
    && [Input, NativeSelect, Switch, Slider, Checkbox, Textarea, LauncherSyncedInput, LauncherSyncedNativeSelect, LauncherSyncedTextarea].some(type => children.type === type) ? children : null
  const controlId = control === null ? undefined : control.props.id ?? id
  const text = launcherFixedText(label ?? title ?? '')
  return (
    <Field aria-labelledby={`${id}-label`} aria-describedby={helpId} className={cn('min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 last:border-b-0', compact ? 'py-2' : 'py-3')} orientation="horizontal">
      <FieldContent className="min-w-[min(100%,14rem)] flex-1 [overflow-wrap:anywhere]">
        {control === null || control.type === Slider
          ? <FieldTitle id={`${id}-label`} className="text-foreground">{text}</FieldTitle>
          : <FieldLabel id={`${id}-label`} htmlFor={controlId} className="text-foreground">{text}</FieldLabel>}
        {description === undefined ? null : <FieldDescription id={helpId} className="max-w-2xl text-xs leading-[18px]">{launcherFixedText(description)}</FieldDescription>}
      </FieldContent>
      {children === undefined ? null : <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [&>*]:max-w-full">{control === null ? children : cloneElement(control, {
        id: controlId,
        'aria-describedby': [control.props['aria-describedby'], helpId].filter(Boolean).join(' ') || undefined,
      })}</div>}
    </Field>
  )
}

export function LauncherCompactSettingField(props: LauncherSettingFieldProps): ReactNode {
  return <LauncherSettingField {...props} compact />
}
