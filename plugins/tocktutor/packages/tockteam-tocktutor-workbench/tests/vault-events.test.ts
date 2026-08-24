import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import {
  subscribeNoteVaultChanges,
  type NoteVaultChangeEvent,
  type NoteVaultEventRemote,
} from '../src/vault-events.ts'
import type { VaultReference } from '../src/host-read.ts'

class FakeRemote implements NoteVaultEventRemote {
  eventName: string | null = null
  listener: ((event: NoteVaultChangeEvent) => void) | null = null
  disposeCount = 0

  $on(event: 'note-vault/change', listener: (event: NoteVaultChangeEvent) => void): () => void {
    this.eventName = event
    this.listener = listener
    return () => {
      this.disposeCount += 1
      this.listener = null
    }
  }

  emit(value: unknown): void {
    this.listener?.(value as NoteVaultChangeEvent)
  }
}

const vault = Object.freeze({ generation: 7, id: `vault:${'d'.repeat(64)}` })

// Compile-time proof that the selected pinned Remote face satisfies the helper.
function acceptsPinnedRemote(remote: TypertClientRemote, current: () => VaultReference | null): void {
  subscribeNoteVaultChanges(remote, current, () => undefined)
}
void acceptsPinnedRemote

test('delivers only exact current-vault activation, tree, and entry events', () => {
  const remote = new FakeRemote()
  const delivered: NoteVaultChangeEvent[] = []
  const dispose = subscribeNoteVaultChanges(remote, () => vault, event => { delivered.push(event) })
  assert.equal(remote.eventName, 'note-vault/change')

  const events: NoteVaultChangeEvent[] = [
    { action: 'activated', kind: 'vault', vault },
    { action: 'changed', kind: 'tree', vault },
    { action: 'watcher-error', kind: 'tree', vault },
    { action: 'created', kind: 'entry', path: 'Folder/Note.md', vault },
    { action: 'external-change', kind: 'entry', path: 'image.png', vault },
    { action: 'external-rename', kind: 'entry', path: 'Folder/Renamed.canvas', vault },
    { action: 'stored', kind: 'entry', path: 'image.png', vault },
    { action: 'updated', kind: 'entry', path: 'Data.base', vault },
    { action: 'duplicated', fromPath: 'Note.md', kind: 'entry', path: 'Copy.md', vault },
    { action: 'moved', fromPath: 'Old.md', kind: 'entry', path: 'New.md', vault },
    { action: 'restored', fromPath: 'Trash/Note.md', kind: 'entry', path: 'Note.md', vault },
    { action: 'trashed', fromPath: 'Note.md', kind: 'entry', path: 'Trash/Note.md', vault },
  ]
  for (const event of events) remote.emit(event)
  assert.deepEqual(delivered, events)

  dispose()
  assert.equal(remote.disposeCount, 1)
  remote.emit(events[0])
  assert.deepEqual(delivered, events)
})

test('suppresses stale generations, other vaults, and malformed event records', () => {
  const remote = new FakeRemote()
  const delivered: NoteVaultChangeEvent[] = []
  let current: VaultReference | null = vault
  subscribeNoteVaultChanges(remote, () => current, event => { delivered.push(event) })

  remote.emit({ action: 'changed', kind: 'tree', vault: { ...vault, generation: 6 } })
  remote.emit({ action: 'changed', kind: 'tree', vault: { ...vault, id: `vault:${'e'.repeat(64)}` } })
  remote.emit({ action: 'updated', kind: 'entry', path: '../escape.md', vault })
  remote.emit({ action: 'removed', fromPath: 'A.md', kind: 'entry', path: 'B.md', vault })
  remote.emit({ action: 'moved', fromPath: '../escape.md', kind: 'entry', path: 'B.md', vault })
  remote.emit({ action: 'activated', kind: 'tree', vault })
  remote.emit({ action: 'created', kind: 'entry', path: '/absolute.md', vault })
  remote.emit({ action: 'changed', kind: 'tree', vault: { generation: 7, id: 'unsafe' } })
  remote.emit(null)
  current = null
  remote.emit({ action: 'changed', kind: 'tree', vault })

  assert.deepEqual(delivered, [])
})

test('keeps the client event lifecycle free of Host authority', async () => {
  const source = await readFile(new URL('../src/vault-events.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /node:|electron|window\.electronAPI|child_process|(?:^|[/'" ])fs(?:['"/])/u)
})
