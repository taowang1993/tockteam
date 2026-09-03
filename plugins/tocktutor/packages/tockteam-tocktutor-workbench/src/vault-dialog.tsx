import { Button } from '@tockteam/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tockteam/ui/dialog'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { Folder, Plus, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import type { RecentVaultInfo, VaultReference } from './types.ts'
import { WorkbenchGlyph } from './workbench-glyph.tsx'

export interface WorkbenchVaultDialogProps {
  onActivateRecentVault?: ((id: string) => void) | undefined
  onCreateManagedVault?: ((name: string) => void) | undefined
  onRemoveRecentVault?: ((id: string) => void) | undefined
  recentVaults: readonly RecentVaultInfo[]
  vault: VaultReference | null
}

export function WorkbenchVaultDialog(props: WorkbenchVaultDialogProps): ReactNode {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const recentVaults = props.recentVaults.filter(vault => vault.id !== props.vault?.id)

  const changeOpen = (open: boolean): void => {
    if (!open) {
      setCreating(false)
      setName('')
    }
    setOpen(open)
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
          <span>{props.vault === null ? 'Choose Vault' : 'TockTutor Vault'}</span>
          <WorkbenchGlyph kind="more" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="z-[2147483647] gap-0 overflow-hidden p-0"
        overlayClassName="z-[2147483646]"
        style={{ maxWidth: '720px', width: 'calc(100% - 2rem)' }}
      >
        <div className="grid min-h-[420px] sm:grid-cols-[230px_minmax(0,1fr)]">
          <section aria-label="Vault List" className="flex min-h-0 flex-col border-b border-border bg-muted/35 p-4 sm:border-r sm:border-b-0">
            <DialogHeader className="text-left">
              <DialogTitle>Vaults</DialogTitle>
              <DialogDescription className="sr-only">Switch between local Markdown vaults or create a new one.</DialogDescription>
            </DialogHeader>

            <div className="mt-6 flex min-h-0 flex-col gap-5">
              <section aria-labelledby="current-vault-heading" className="flex flex-col gap-2">
                <h2 className="text-xs font-medium text-muted-foreground" id="current-vault-heading">Current Vault</h2>
                <div className="flex min-w-0 items-center gap-2 rounded-md bg-accent px-2 py-2 text-accent-foreground">
                  <Folder aria-hidden="true" className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{props.vault === null ? 'No Vault Open' : 'TockTutor Vault'}</p>
                    <p className="m-0 text-xs text-muted-foreground">{props.vault === null ? 'Choose or create a vault' : 'Active'}</p>
                  </div>
                </div>
              </section>

              <section aria-labelledby="recent-vaults-heading" className="flex min-h-0 flex-col gap-2">
                <h2 className="text-xs font-medium text-muted-foreground" id="recent-vaults-heading">Recent Vaults</h2>
                {recentVaults.length === 0
                  ? <p className="m-0 text-sm text-muted-foreground">No other vaults yet.</p>
                  : (
                      <div className="flex min-h-0 flex-col gap-1 overflow-auto">
                        {recentVaults.map((vault, index) => (
                          <div className="flex min-w-0 items-center gap-1" key={vault.id}>
                            <Button
                              aria-label={`Open Recent Vault ${String(index + 1)}`}
                              className="h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-2 text-left"
                              onClick={() => { props.onActivateRecentVault?.(vault.id); changeOpen(false) }}
                              variant="ghost"
                            >
                              <Folder aria-hidden="true" />
                              <span className="truncate">Recent Vault {String(index + 1)}</span>
                            </Button>
                            <Button aria-label={`Forget Recent Vault ${String(index + 1)}`} onClick={() => { props.onRemoveRecentVault?.(vault.id) }} size="icon-sm" variant="ghost"><X aria-hidden="true" /></Button>
                          </div>
                        ))}
                      </div>
                    )}
              </section>
            </div>
          </section>

          <section aria-label="Vault Actions" className="flex flex-col justify-center p-6 sm:p-10">
            <div className="mb-8 flex flex-col items-center text-center">
              <span className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Folder aria-hidden="true" className="size-7" /></span>
              <h2 className="m-0 text-2xl font-semibold">TockTutor</h2>
              <p className="mt-1 text-sm text-muted-foreground">Your local Markdown notes, kept together.</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              {creating
                ? (
                    <form className="flex flex-col gap-3" onSubmit={submit}>
                      <div>
                        <h3 className="m-0 font-medium">Create new vault</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Give your new collection a name.</p>
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
                        <h3 className="m-0 font-medium">Create new vault</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Start a new collection of Markdown notes.</p>
                      </div>
                      <Button aria-label="Create New Vault" onClick={() => { setCreating(true) }} variant="outline">
                        <Plus aria-hidden="true" data-icon="inline-start" />
                        Create
                      </Button>
                    </div>
                  )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
