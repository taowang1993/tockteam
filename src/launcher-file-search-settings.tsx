import { useRef, useState, type ReactNode } from 'react'
import { FolderSearch, Plus, Trash2 } from 'lucide-react'
import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { isAllowedLauncherEverythingCliPath, type LauncherSettingsSnapshot } from './launcher-settings-contract.ts'

 type SearchFolder = Readonly<{
  excludeHiddenFiles?: boolean
  id: string
  path: string
  recursive: boolean
  searchFor: 'files' | 'folders' | 'filesAndFolders'
}>

type FileSearchSettingsProps = Readonly<{
  busy: boolean
  save: (key: string, value: unknown) => Promise<boolean>
  snapshot: LauncherSettingsSnapshot
}>

function stored<T>(snapshot: LauncherSettingsSnapshot, key: string, fallback: T): T {
  return (snapshot.values[key] as T | undefined) ?? fallback
}

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>): ReactNode {
  return <label className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"><span className="text-sm text-foreground">{label}</span><span className="flex min-w-0 shrink-0 items-center gap-2">{children}</span></label>
}

function validFolders(value: unknown): SearchFolder[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return []
    const row = candidate as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.path !== 'string' || typeof row.recursive !== 'boolean'
      || (row.excludeHiddenFiles !== undefined && typeof row.excludeHiddenFiles !== 'boolean')
      || (row.searchFor !== 'files' && row.searchFor !== 'folders' && row.searchFor !== 'filesAndFolders')) return []
    return [Object.freeze({
      ...(row.excludeHiddenFiles === undefined ? null : { excludeHiddenFiles: row.excludeHiddenFiles }),
      id: row.id,
      path: row.path,
      recursive: row.recursive,
      searchFor: row.searchFor,
    })]
  })
}

function newFolderId(index: number): string {
  return `simple-file-search-root-${index}`
}

function absolutePath(value: string): boolean {
  return value.length > 0 && (value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value))
}

export function LauncherFileSearchSettings({ busy, save, snapshot }: FileSearchSettingsProps): ReactNode {
  const configuredFolders = validFolders(stored(snapshot, 'extension[SimpleFileSearch].folders', []))
  const [folders, setFolders] = useState<SearchFolder[]>(configuredFolders)
  const foldersRef = useRef<SearchFolder[]>(configuredFolders)
  const persistFolders = (next: SearchFolder[]): void => {
    foldersRef.current = next
    setFolders(next)
    if (next.some(folder => !absolutePath(folder.path.trim()))) return
    void save('extension[SimpleFileSearch].folders', next)
  }
  const updateFolder = (id: string, patch: Partial<SearchFolder>): void => {
    const normalizedPatch = patch.path === undefined ? patch : { ...patch, path: patch.path.trim() }
    persistFolders(foldersRef.current.map(folder => folder.id === id ? Object.freeze({ ...folder, ...normalizedPatch }) : folder))
  }
  const addFolder = (): void => {
    let index = foldersRef.current.length + 1
    while (foldersRef.current.some(folder => folder.id === newFolderId(index))) index += 1
    const next = [...foldersRef.current, Object.freeze({
      id: newFolderId(index), path: '', recursive: true, excludeHiddenFiles: true, searchFor: 'filesAndFolders' as const,
    })]
    foldersRef.current = next
    setFolders(next)
  }
  const removeFolder = (id: string): void => { persistFolders(foldersRef.current.filter(folder => folder.id !== id)) }
  const maxResults = stored(snapshot, 'extension[FileSearch].maxSearchResultCount', 20)
  const everythingPath = stored(snapshot, 'extension[FileSearch].everythingCliFilePath', '')
  const everythingConfigured = typeof everythingPath === 'string'
    && everythingPath.length > 0
    && isAllowedLauncherEverythingCliPath(everythingPath)
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const isLinux = /Linux/u.test(userAgent) && !/Android/u.test(userAgent)
  const isWindows = /Windows/u.test(userAgent)
  return <section className="space-y-3" data-testid="tocklauncher-file-search-settings">
    <div><h2 className="text-base font-semibold text-foreground">File Search</h2><p className="mt-1 text-xs text-muted-foreground">Search indexed files through bounded native adapters, or configure home-contained Simple File Search roots. Paths are validated by Electron main.</p></div>
    {isLinux ? <p className="rounded-md border border-border/60 p-2 text-xs text-muted-foreground" role="status">Indexed File Search is unsupported on Linux. Simple File Search remains available for configured home-contained roots.</p> : null}
    {isWindows && !everythingConfigured ? <p className="rounded-md border border-border/60 p-2 text-xs text-muted-foreground" role="status">Indexed File Search requires a configured Everything CLI executable on Windows. Simple File Search remains available.</p> : null}
    <Field label="Maximum File Search Results"><Input aria-label="Maximum File Search Results" className="w-24" type="number" min="1" max="100" disabled={busy} defaultValue={maxResults} onBlur={event => { const value = Math.min(100, Math.max(1, Number(event.target.value) || 20)); void save('extension[FileSearch].maxSearchResultCount', value) }} /></Field>
    <Field label="Windows Everything CLI Path"><Input aria-label="Windows Everything CLI Path" className="w-72" maxLength={1024} disabled={busy} defaultValue={everythingPath} onBlur={event => { void save('extension[FileSearch].everythingCliFilePath', event.target.value) }} /></Field>
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-medium text-foreground"><FolderSearch aria-hidden="true" className="size-4" />Simple File Search Roots</h3><p className="mt-1 text-xs text-muted-foreground">Only strict children of the Desktop home directory are accepted. New roots stay local until a nonempty absolute path is entered.</p></div><Button type="button" size="sm" variant="outline" disabled={busy || folders.length >= 16} onClick={addFolder}><Plus aria-hidden="true" />Add Root</Button></div>
      <div className="mt-2 space-y-2">
        {folders.length === 0 ? <p className="py-2 text-xs text-muted-foreground">No Simple File Search roots configured.</p> : folders.map(folder => <div key={folder.id} className="rounded-md border border-border/60 p-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2"><Input aria-label={`Path for ${folder.id}`} className="min-w-0 flex-1" maxLength={4096} disabled={busy} defaultValue={folder.path} aria-invalid={folder.path.length > 0 && !absolutePath(folder.path.trim())} onBlur={event => updateFolder(folder.id, { path: event.target.value })} /><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${folder.id}`} disabled={busy} onClick={() => removeFolder(folder.id)}><Trash2 aria-hidden="true" /></Button></div>
          <div className="mt-2 flex flex-wrap items-center gap-4"><span className="flex items-center gap-2 text-xs text-foreground"><Switch aria-label={`Recursive ${folder.id}`} disabled={busy} checked={folder.recursive} onCheckedChange={checked => updateFolder(folder.id, { recursive: checked })} />Recursive</span><span className="flex items-center gap-2 text-xs text-foreground"><Switch aria-label={`Exclude hidden files ${folder.id}`} disabled={busy} checked={folder.excludeHiddenFiles === true} onCheckedChange={checked => updateFolder(folder.id, { excludeHiddenFiles: checked })} />Exclude hidden</span><NativeSelect aria-label={`Search for ${folder.id}`} size="sm" disabled={busy} value={folder.searchFor} onChange={event => updateFolder(folder.id, { searchFor: event.target.value as SearchFolder['searchFor'] })}><NativeSelectOption value="files">Files</NativeSelectOption><NativeSelectOption value="folders">Folders</NativeSelectOption><NativeSelectOption value="filesAndFolders">Files and folders</NativeSelectOption></NativeSelect></div>
        </div>)}
      </div>
    </div>
  </section>
}
