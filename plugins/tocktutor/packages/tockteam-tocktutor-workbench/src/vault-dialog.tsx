import { Button } from '@tockteam/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tockteam/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tockteam/ui/dropdown-menu'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { Copy, Ellipsis, Plus } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { VaultReference } from './types.ts'
import { WorkbenchGlyph } from './workbench-glyph.tsx'

export interface WorkbenchVaultDialogProps {
  onCreateManagedVault?: ((name: string) => void) | undefined
  renderVaultActions?: ((
    placement: 'actions' | 'menu',
    close: () => void,
    closeMenu: () => void,
    beginRename: (rename: (name: string, signal: AbortSignal) => Promise<boolean>) => void,
  ) => ReactNode) | undefined
  vault: VaultReference | null
  vaultName: string | null
}

function TockTeamLogo(): ReactNode {
  return (
    <svg aria-label="TockTeam Logo" className="size-12" fill="none" role="img" viewBox="0 0 20 20">
      <path d="M10 5.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0-2a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Z" fill="currentColor" />
      <path d="m2.8 18.2 2.9-2.9 1.4 1.4-2.9 2.9-1.4-1.4Zm14.4 0-2.9-2.9-1.4 1.4 2.9 2.9 1.4-1.4Z" fill="currentColor" />
      <path d="m7.5 10.5 2 2.5L13 8.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M6.33 3.17 2.57 6.76s-2.1-1.9-.19-3.96c1.9-2.06 3.95.37 3.95.37Zm7.34 0 3.76 3.59s2.1-1.9.19-3.96c-1.9-2.06-3.95.37-3.95.37Z" fill="currentColor" />
    </svg>
  )
}

export function WorkbenchVaultDialog(props: WorkbenchVaultDialogProps): ReactNode {
  const [copyError, setCopyError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [rename, setRename] = useState<((name: string, signal: AbortSignal) => Promise<boolean>) | null>(null)
  const renameOperation = useRef<AbortController>()
  const [renameError, setRenameError] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)

  const changeOpen = (open: boolean): void => {
    if (!open) {
      setCopyError(false)
      setCreating(false)
      setMenuOpen(false)
      setName('')
      renameOperation.current?.abort()
      renameOperation.current = undefined
      setRename(null)
      setRenameError(false)
      setRenameName('')
      setRenaming(false)
    }
    setOpen(open)
  }
  const copyVaultId = (): void => {
    if (props.vault === null) return
    setCopyError(false)
    try {
      const result = globalThis.navigator?.clipboard?.writeText(props.vault.id)
      if (result === undefined) setCopyError(true)
      else void result.catch(() => { setCopyError(true) })
    } catch {
      setCopyError(true)
    }
  }
  const beginRename = (action: (name: string, signal: AbortSignal) => Promise<boolean>): void => {
    renameOperation.current?.abort()
    renameOperation.current = undefined
    setCopyError(false)
    setRename(() => action)
    setRenaming(false)
    setRenameError(false)
    setRenameName(props.vaultName ?? '')
  }
  const submitRename = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const normalized = renameName.trim()
    if (rename === null || normalized === '') return
    if (normalized === props.vaultName) {
      setRename(null)
      return
    }
    renameOperation.current?.abort()
    const operation = new AbortController()
    renameOperation.current = operation
    setRenaming(true)
    setRenameError(false)
    void rename(normalized, operation.signal).then(success => {
      if (operation.signal.aborted) return
      if (success) setRename(null)
      else setRenameError(true)
    }, () => {
      if (!operation.signal.aborted) setRenameError(true)
    }).finally(() => {
      if (!operation.signal.aborted) setRenaming(false)
    })
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const normalized = name.trim()
    if (normalized === '') return
    props.onCreateManagedVault?.(normalized)
    changeOpen(false)
  }

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          unstyled
          aria-expanded={open}
          className="tocktutor-vault-switcher grid grid-cols-[14px_minmax(0,1fr)_16px] items-center gap-1.5 border-0 border-t border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] px-2.5 text-left [&>span]:truncate [&_svg]:size-[13px]"
          type="button"
        >
          <WorkbenchGlyph kind="collapse" />
          <span>{props.vault === null ? 'Choose Vault' : props.vaultName ?? 'TockTutor Vault'}</span>
          <WorkbenchGlyph kind="more" />
        </Button>
      </DialogTrigger>
      <DialogContent
        unstyled
        className="fixed top-1/2 left-1/2 z-[2147483647] grid w-full -translate-x-1/2 -translate-y-1/2 gap-0 overflow-y-auto rounded-xl border border-[var(--tt-border)] bg-[var(--tt-panel)] p-0 text-[var(--tt-text)] shadow-[0_18px_48px_rgba(0,0,0,0.16),0_2px_8px_rgba(0,0,0,0.08)] outline-none sm:overflow-hidden [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]"
        overlayClassName="z-[2147483646]"
        style={{ height: '560px', maxHeight: 'calc(100vh - 2rem)', maxWidth: '860px', width: 'calc(100% - 2rem)' }}
      >
        <div className="grid min-h-0 sm:h-full sm:grid-cols-[270px_minmax(0,1fr)]">
          <section aria-label="Vault List" className="flex min-h-0 flex-col border-b border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] p-5 sm:overflow-y-auto sm:border-r sm:border-b-0">
            <DialogHeader className="sr-only">
              <DialogTitle>Vault Switcher</DialogTitle>
              <DialogDescription>Open a local Markdown vault or create a new one.</DialogDescription>
            </DialogHeader>
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0 flex-1">
                {rename === null
                  ? <p className="m-0 truncate font-medium">{props.vault === null ? 'No Vault Open' : props.vaultName ?? 'TockTutor Vault'}</p>
                  : (
                      <form onSubmit={submitRename}>
                        <Input
                          aria-label="Vault Name"
                          autoFocus
                          disabled={renaming}
                          maxLength={80}
                          onChange={event => { setRenameName(event.target.value) }}
                          onKeyDown={event => {
                            if (event.key === 'Escape') {
                              event.preventDefault()
                              renameOperation.current?.abort()
                              renameOperation.current = undefined
                              setRename(null)
                              setRenaming(false)
                            }
                          }}
                          value={renameName}
                        />
                        <button className="sr-only" type="submit">Rename Vault</button>
                        {renameError && <p className="mt-1 text-xs text-destructive" role="alert">The vault could not be renamed.</p>}
                      </form>
                    )}
                <p className="mt-0.5 truncate text-xs text-[var(--tt-muted)]">{props.vault === null ? 'Open or create a local vault' : 'Local Markdown vault'}</p>
                {copyError && <p className="mt-1 text-xs text-destructive" role="alert">The vault ID could not be copied.</p>}
              </div>
              {props.vault !== null && rename === null && (
                <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button unstyled aria-label="More Vault Actions" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]" type="button">
                      <Ellipsis aria-hidden="true" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 border border-[var(--tt-border)] bg-[var(--tt-panel)] text-[var(--tt-text)]" portalled={false}>
                    <DropdownMenuItem onSelect={copyVaultId}>
                      <Copy aria-hidden="true" />
                      <span>Copy vault ID</span>
                    </DropdownMenuItem>
                    {props.renderVaultActions?.('menu', () => { changeOpen(false) }, () => { setMenuOpen(false) }, beginRename)}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </section>

          <section aria-label="Vault Actions" className="flex min-h-0 flex-col overflow-y-auto p-8 sm:p-12">
            <div className="my-auto w-full">
              <div className="mb-10 flex flex-col items-center text-center">
                <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><TockTeamLogo /></span>
                <h2 className="m-0 text-2xl font-semibold">TockTutor</h2>
                <p className="mt-1 text-sm text-[var(--tt-muted)]">Your local Markdown notes, kept together.</p>
              </div>

              <div className="divide-y divide-[var(--tt-border)] rounded-xl border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-panel)_82%,var(--tockteam-shell-chrome,var(--tt-panel)))]">
                <div className="p-4" data-vault-action-row>
                  {creating
                    ? (
                        <form className="flex flex-col gap-3" onSubmit={submit}>
                          <div>
                            <h3 className="m-0 font-medium">Create New Vault</h3>
                            <p className="mt-1 text-xs text-[var(--tt-muted)]">Give your new collection a name.</p>
                          </div>
                          <Label htmlFor="tocktutor-vault-name">Vault Name</Label>
                          <Input autoFocus id="tocktutor-vault-name" maxLength={80} onChange={event => { setName(event.target.value) }} value={name} />
                          <div className="flex justify-end gap-2">
                            <Button onClick={() => { setCreating(false); setName('') }} type="button" variant="ghost">Cancel</Button>
                            <Button disabled={name.trim() === ''} type="submit">Create Vault</Button>
                          </div>
                        </form>
                      )
                    : (
                        <div className="flex items-center gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="m-0 font-medium">Create New Vault</h3>
                            <p className="mt-1 text-xs text-[var(--tt-muted)]">Start a new collection of Markdown notes.</p>
                          </div>
                          <Button aria-label="Create New Vault" onClick={() => { setCreating(true) }} variant="outline">
                            <Plus aria-hidden="true" data-icon="inline-start" />
                            Create
                          </Button>
                        </div>
                      )}
                </div>
                {props.renderVaultActions?.('actions', () => { changeOpen(false) }, () => { setMenuOpen(false) }, beginRename)}
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
