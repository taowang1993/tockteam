import type { ComponentProps, ReactNode } from 'react'
import { Input } from '@tockteam/ui/input'
import { NativeSelect } from '@tockteam/ui/native-select'
import { useLauncherDraft } from './launcher-settings-drafts.ts'

function initialText(value: unknown): string | number {
  return typeof value === 'string' || typeof value === 'number' ? value : ''
}

export function LauncherSyncedInput({ defaultValue, value, onChange, ...props }: ComponentProps<typeof Input>): ReactNode {
  const [draft, setDraft] = useLauncherDraft<string | number>(initialText(value ?? defaultValue))
  return <Input {...props} value={draft} onChange={event => { setDraft(event.target.value); onChange?.(event) }} />
}

export function LauncherSyncedNativeSelect({ defaultValue, value, onChange, ...props }: ComponentProps<typeof NativeSelect>): ReactNode {
  const [draft, setDraft] = useLauncherDraft<string>(typeof value === 'string' ? value : typeof defaultValue === 'string' ? defaultValue : '')
  return <NativeSelect {...props} value={draft} onChange={event => { setDraft(event.target.value); onChange?.(event) }} />
}

export function LauncherSyncedTextarea({ defaultValue, value, onChange, ...props }: ComponentProps<'textarea'>): ReactNode {
  const [draft, setDraft] = useLauncherDraft<string>(typeof value === 'string' ? value : typeof defaultValue === 'string' ? defaultValue : '')
  return <textarea {...props} value={draft} onChange={event => { setDraft(event.target.value); onChange?.(event) }} />
}
