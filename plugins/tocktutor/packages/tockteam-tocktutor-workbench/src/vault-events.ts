import { isSafeVaultRelativePath } from './session.ts'
import type { NoteVaultChangeEvent, VaultReference } from './types.ts'

export type { NoteVaultChangeEvent } from './types.ts'

export interface NoteVaultEventRemote {
  $on(
    event: 'note-vault/change',
    listener: (event: NoteVaultChangeEvent) => void,
  ): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'note-vault/change': (event: NoteVaultChangeEvent) => void
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends Record<'note-vault/change', true> {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).toSorted()
  const expected = keys.toSorted()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isVaultReference(value: unknown): value is VaultReference {
  return isRecord(value)
    && hasExactKeys(value, ['generation', 'id'])
    && Number.isSafeInteger(value.generation)
    && (value.generation as number) >= 0
    && typeof value.id === 'string'
    && /^vault:[0-9a-f]{64}$/u.test(value.id)
}

export function isNoteVaultChangeEvent(value: unknown): value is NoteVaultChangeEvent {
  if (!isRecord(value) || !isVaultReference(value.vault)) return false
  if (value.kind === 'vault') {
    return value.action === 'activated' && hasExactKeys(value, ['action', 'kind', 'vault'])
  }
  if (value.kind === 'tree') {
    return (value.action === 'changed' || value.action === 'watcher-error')
      && hasExactKeys(value, ['action', 'kind', 'vault'])
  }
  if (value.kind !== 'entry' || !isSafeVaultRelativePath(value.path)) return false
  if (
    value.action === 'created'
    || value.action === 'external-change'
    || value.action === 'external-rename'
    || value.action === 'stored'
    || value.action === 'updated'
  ) return hasExactKeys(value, ['action', 'kind', 'path', 'vault'])
  return (
    value.action === 'duplicated'
    || value.action === 'moved'
    || value.action === 'restored'
    || value.action === 'trashed'
  )
    && isSafeVaultRelativePath(value.fromPath)
    && hasExactKeys(value, ['action', 'fromPath', 'kind', 'path', 'vault'])
}

/** Subscribe to current-vault runtime changes and suppress stale or malformed delivery. */
export function subscribeNoteVaultChanges(
  remote: NoteVaultEventRemote,
  currentVault: () => VaultReference | null,
  listener: (event: NoteVaultChangeEvent) => void,
): () => void {
  return remote.$on('note-vault/change', event => {
    if (!isNoteVaultChangeEvent(event)) return
    const current = currentVault()
    if (
      current === null
      || event.vault.id !== current.id
      || event.vault.generation !== current.generation
    ) return
    listener(event)
  })
}
