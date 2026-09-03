import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@tockteam/ui/alert-dialog'
import { Button } from '@tockteam/ui/button'
import { Checkbox } from '@tockteam/ui/checkbox'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@tockteam/ui/field'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import {
  LAUNCHER_WORKFLOW_SETTING_KEY,
  isLauncherWorkflows,
  parseLauncherWorkflows,
  initialLauncherWorkflowSettings,
  createLauncherWorkflowSaveGate,
  type LauncherWorkflow,
  type LauncherWorkflowAction,
} from './launcher-workflow-contract.ts'
import { LAUNCHER_TERMINALS, type LauncherTerminalId, type LauncherTerminalPlatform } from './launcher-terminal-config.ts'
import { launcherFixedText } from './launcher-i18n.ts'

const ACTION_TYPES = Object.freeze([
  ['OpenFile', 'Open File'],
  ['OpenUrl', 'Open URL'],
  ['OpenTerminal', 'Open Terminal'],
  ['ExecuteCommand', 'Execute Command'],
] as const)

type DraftAction = {
  args: Record<string, string>
  handlerId: LauncherWorkflowAction['handlerId']
  id: string
  name: string
}

type DraftWorkflow = {
  actions: DraftAction[]
  id: string
  name: string
  requiresConfirmation: boolean
}

type WorkflowSettingsProps = Readonly<{
  busy: boolean
  save: (key: string, value: unknown) => Promise<boolean>
  snapshot: LauncherSettingsSnapshot
}>

let nextWorkflowId = 0

function platform(): LauncherTerminalPlatform {
  if (typeof navigator !== 'undefined' && /Windows/iu.test(`${navigator.platform} ${navigator.userAgent}`)) return 'Windows'
  if (typeof navigator !== 'undefined' && /Macintosh|Mac OS X/iu.test(`${navigator.platform} ${navigator.userAgent}`)) return 'macOS'
  return 'Linux'
}

function newId(prefix: string): string {
  nextWorkflowId += 1
  return `${prefix}-${Date.now().toString(36)}-${nextWorkflowId.toString(36)}`.slice(0, 128)
}

function copyWorkflow(workflow: LauncherWorkflow): DraftWorkflow {
  return {
    actions: workflow.actions.map(action => ({ args: { ...action.args }, handlerId: action.handlerId, id: action.id, name: action.name })),
    id: workflow.id,
    name: workflow.name,
    requiresConfirmation: workflow.requiresConfirmation === true,
  }
}

function actionValue(action: DraftAction): LauncherWorkflowAction {
  switch (action.handlerId) {
    case 'OpenFile': return { args: { filePath: action.args.filePath ?? '' }, handlerId: 'OpenFile', id: action.id, name: action.name }
    case 'OpenUrl': return { args: { url: action.args.url ?? '' }, handlerId: 'OpenUrl', id: action.id, name: action.name }
    case 'OpenTerminal': return { args: { command: action.args.command ?? '', terminalId: (action.args.terminalId ?? '') as LauncherTerminalId }, handlerId: 'OpenTerminal', id: action.id, name: action.name }
    case 'ExecuteCommand': return { args: { command: action.args.command ?? '' }, handlerId: 'ExecuteCommand', id: action.id, name: action.name }
  }
}

function workflowValue(draft: DraftWorkflow): LauncherWorkflow {
  return {
    actions: draft.actions.map(actionValue),
    id: draft.id,
    name: draft.name,
    requiresConfirmation: draft.requiresConfirmation,
  }
}

function actionLabel(handlerId: LauncherWorkflowAction['handlerId']): string {
  const label = ACTION_TYPES.find(([id]) => id === handlerId)?.[1] ?? handlerId
  return launcherFixedText(label)
}

function makeAction(currentPlatform: LauncherTerminalPlatform): DraftAction {
  return {
    args: { command: '', filePath: '', terminalId: LAUNCHER_TERMINALS[currentPlatform][0]?.id ?? '', url: '' },
    handlerId: 'OpenFile',
    id: newId('workflow-action'),
    name: '',
  }
}

function validWorkflow(value: DraftWorkflow, currentPlatform: LauncherTerminalPlatform): boolean {
  try { return isLauncherWorkflows([workflowValue(value)], currentPlatform) }
  catch { return false }
}

function validAction(value: DraftAction, currentPlatform: LauncherTerminalPlatform): boolean {
  try {
    return isLauncherWorkflows([{ actions: [actionValue(value)], id: 'workflow-validation', name: 'Validation' }], currentPlatform)
  } catch { return false }
}

export function LauncherWorkflowSettings({ busy, save, snapshot }: WorkflowSettingsProps): ReactNode {
  const currentPlatform = useMemo(platform, [])
  const fixed = launcherFixedText
  const [workflows, setWorkflows] = useState(() => initialLauncherWorkflowSettings(snapshot))
  const [selectedId, setSelectedId] = useState(() => initialLauncherWorkflowSettings(snapshot)[0]?.id ?? '')
  const [draft, setDraft] = useState<DraftWorkflow | null>(() => {
    const first = initialLauncherWorkflowSettings(snapshot)[0]
    return first === undefined ? null : copyWorkflow(first)
  })
  const [pendingAction, setPendingAction] = useState<DraftAction>(() => makeAction(currentPlatform))
  const [deletePending, setDeletePending] = useState(false)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)
  const selectedIdRef = useRef(selectedId)
  const saveWorkflow = useMemo(() => createLauncherWorkflowSaveGate(save), [save])

  useEffect(() => {
    if (dirtyRef.current || savingRef.current) return
    const next = initialLauncherWorkflowSettings(snapshot)
    const selected = next.find(workflow => workflow.id === selectedIdRef.current) ?? next[0]
    selectedIdRef.current = selected?.id ?? ''
    setWorkflows(next)
    setSelectedId(selected?.id ?? '')
    setDraft(selected === undefined ? null : copyWorkflow(selected))
    setPendingAction(makeAction(currentPlatform))
  }, [currentPlatform, snapshot])

  const selectWorkflow = (workflow: LauncherWorkflow): void => {
    dirtyRef.current = false
    selectedIdRef.current = workflow.id
    setSelectedId(workflow.id)
    setDraft(copyWorkflow(workflow))
    setPendingAction(makeAction(currentPlatform))
    setDeletePending(false)
  }

  const addWorkflow = (): void => {
    const id = newId('workflow')
    dirtyRef.current = true
    selectedIdRef.current = id
    setSelectedId(id)
    setDraft({ actions: [], id, name: '', requiresConfirmation: false })
    setPendingAction(makeAction(currentPlatform))
    setDeletePending(false)
  }

  const persist = async (next: readonly LauncherWorkflow[], selected: string): Promise<void> => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      if (!await saveWorkflow(next)) return
      dirtyRef.current = false
      selectedIdRef.current = selected
      setWorkflows([...next])
      setSelectedId(selected)
      const chosen = next.find(workflow => workflow.id === selected)
      setDraft(chosen === undefined ? null : copyWorkflow(chosen))
      setPendingAction(makeAction(currentPlatform))
      setDeletePending(false)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const updateDraftName = (event: ChangeEvent<HTMLInputElement>): void => {
    dirtyRef.current = true
    setDraft(previous => previous === null ? previous : { ...previous, name: event.target.value })
  }
  const selectedWorkflow = workflows.find(workflow => workflow.id === selectedId)

  return (
    <div className="mt-3" data-testid="tocklauncher-workflows">
      <p className="mb-3 text-xs leading-5 text-muted-foreground">{launcherFixedText('Every action receives exact native approval. Commands use the trusted Desktop home, are time and output bounded, cancellable, and audited without command text or output.')}</p>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.8fr)]">
        <div aria-label={fixed('Saved workflows')} className="min-w-0 rounded-md border border-border/60 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-foreground">{fixed('Workflows')}</h4>
            <Button aria-label={fixed('Add workflow')} data-testid="tocklauncher-workflow-add" size="sm" type="button" variant="outline" disabled={busy || saving || workflows.length >= 64} onClick={addWorkflow}>{fixed('Add')}</Button>
          </div>
          <div className="flex min-w-0 flex-col gap-1" role="list">
            {workflows.length === 0 ? <p className="px-2 py-3 text-xs text-muted-foreground">{fixed('No saved workflows.')}</p> : workflows.map(workflow => (
              <div key={workflow.id} role="listitem">
                <Button unstyled aria-current={workflow.id === selectedId ? 'true' : undefined} className="w-full min-w-0 rounded px-2 py-2 text-left text-sm hover:bg-muted" disabled={busy || saving} type="button" onClick={() => selectWorkflow(workflow)}>
                  <span className="block truncate" title={workflow.name}>{workflow.name}</span>
                  <span className="block text-xs text-muted-foreground">{workflow.actions.length} {fixed(workflow.actions.length === 1 ? 'action' : 'actions')}</span>
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div aria-label={fixed('Selected workflow editor')} className="min-w-0 rounded-md border border-border/60 p-3">
          {draft === null ? <p className="text-sm text-muted-foreground">{fixed('Add or select a workflow to edit its ordered actions.')}</p> : <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-foreground">{selectedWorkflow === undefined ? fixed('New workflow') : fixed('Edit workflow')}</h4>
              <span className="max-w-full truncate text-xs text-muted-foreground">ID: {draft.id}</span>
            </div>
            <div className="grid gap-3">
              <Field data-invalid={draft.name.trim().length === 0 || draft.name.length > 128}>
                <FieldLabel htmlFor="tocklauncher-workflow-name">{fixed('Workflow name')}</FieldLabel>
                <Input id="tocklauncher-workflow-name" aria-describedby="tocklauncher-workflow-name-help" aria-invalid={draft.name.trim().length === 0 || draft.name.length > 128} disabled={busy || saving} maxLength={128} value={draft.name} onChange={updateDraftName} />
                <FieldDescription id="tocklauncher-workflow-name-help" className="text-xs">{fixed('Use 1–128 characters; the name is shown only as bounded display text.')}</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="tocklauncher-workflow-confirmation" aria-label={fixed('Workflow requires confirmation')} checked={draft.requiresConfirmation} disabled={busy || saving} onCheckedChange={checked => { dirtyRef.current = true; setDraft(previous => previous === null ? previous : { ...previous, requiresConfirmation: checked === true }) }} />
                <FieldLabel htmlFor="tocklauncher-workflow-confirmation">{fixed('Require launcher confirmation (commands always do)')}</FieldLabel>
              </Field>

              <div>
                <h5 className="mb-2 text-sm font-medium text-foreground">{fixed('Ordered actions')}</h5>
                {draft.actions.length === 0 ? <p className="text-xs text-muted-foreground">{fixed('No actions yet. Add one below.')}</p> : <ol className="grid gap-2 pl-5">
                  {draft.actions.map((action, index) => <li className="flex min-w-0 items-center justify-between gap-2 text-sm" key={action.id}>
                    <span className="min-w-0 truncate"><span className="mr-1 text-muted-foreground">{index + 1}.</span>{action.name || fixed('Unnamed action')} · {actionLabel(action.handlerId)}</span>
                    <Button aria-label={`${fixed('Remove')} ${action.name || `${fixed('action')} ${index + 1}`}`} size="sm" type="button" variant="outline" disabled={busy || saving} onClick={() => { dirtyRef.current = true; setDraft(previous => previous === null ? previous : { ...previous, actions: previous.actions.filter(candidate => candidate.id !== action.id) }) }}>{fixed('Remove')}</Button>
                  </li>)}
                </ol>}
              </div>

              <FieldSet className="grid gap-2 rounded-md border border-border/60 p-2">
                <FieldLegend className="px-1 text-xs text-foreground" variant="label">{fixed('New action')}</FieldLegend>
                <Label htmlFor="tocklauncher-workflow-action-name">{fixed('Action name')}</Label>
                <Input id="tocklauncher-workflow-action-name" aria-describedby="tocklauncher-workflow-action-name-help" aria-invalid={pendingAction.name.trim().length === 0 || pendingAction.name.length > 128} disabled={busy || saving} maxLength={128} value={pendingAction.name} onChange={event => { dirtyRef.current = true; setPendingAction(previous => ({ ...previous, name: event.target.value })) }} />
                <p id="tocklauncher-workflow-action-name-help" className="text-xs text-muted-foreground">{fixed('Action names are required and bounded to 128 characters.')}</p>
                <Label htmlFor="tocklauncher-workflow-action-type">{fixed('Action type')}</Label>
                <NativeSelect id="tocklauncher-workflow-action-type" aria-label={fixed('New action type')} value={pendingAction.handlerId} disabled={busy || saving} onChange={event => { dirtyRef.current = true; setPendingAction(previous => ({ ...previous, handlerId: event.target.value as DraftAction['handlerId'] })) }}>
                  {ACTION_TYPES.map(([id]) => <NativeSelectOption key={id} value={id}>{actionLabel(id)}</NativeSelectOption>)}
                </NativeSelect>
                {pendingAction.handlerId === 'OpenFile' ? <>
                  <Label htmlFor="tocklauncher-workflow-file-path">{fixed('Absolute file path')}</Label>
                  <Input id="tocklauncher-workflow-file-path" aria-label={fixed('New action file path')} maxLength={4096} value={pendingAction.args.filePath} disabled={busy || saving} onChange={event => { dirtyRef.current = true; setPendingAction(previous => ({ ...previous, args: { ...previous.args, filePath: event.target.value } })) }} />
                </> : null}
                {pendingAction.handlerId === 'OpenUrl' ? <>
                  <Label htmlFor="tocklauncher-workflow-url">{fixed('HTTP(S) URL')}</Label>
                  <Input id="tocklauncher-workflow-url" aria-label={fixed('New action url')} maxLength={4096} value={pendingAction.args.url} disabled={busy || saving} onChange={event => { dirtyRef.current = true; setPendingAction(previous => ({ ...previous, args: { ...previous.args, url: event.target.value } })) }} />
                </> : null}
                {pendingAction.handlerId === 'OpenTerminal' ? <>
                  <Label htmlFor="tocklauncher-workflow-terminal">{fixed('Terminal')}</Label>
                  <NativeSelect id="tocklauncher-workflow-terminal" aria-label={fixed('New action terminal')} disabled={busy || saving || LAUNCHER_TERMINALS[currentPlatform].length === 0} value={pendingAction.args.terminalId} onChange={event => { dirtyRef.current = true; setPendingAction(previous => ({ ...previous, args: { ...previous.args, terminalId: event.target.value } })) }}>
                    {LAUNCHER_TERMINALS[currentPlatform].map(terminal => <NativeSelectOption key={terminal.id} value={terminal.id}>{terminal.name}</NativeSelectOption>)}
                  </NativeSelect>
                </> : null}
                {pendingAction.handlerId === 'OpenTerminal' || pendingAction.handlerId === 'ExecuteCommand' ? <>
                  <Label htmlFor="tocklauncher-workflow-command">{fixed('Command')}</Label>
                  <Input id="tocklauncher-workflow-command" aria-label={fixed('New action command')} maxLength={pendingAction.handlerId === 'OpenTerminal' ? 512 : 2048} value={pendingAction.args.command} disabled={busy || saving} onChange={event => { dirtyRef.current = true; setPendingAction(previous => ({ ...previous, args: { ...previous.args, command: event.target.value } })) }} />
                </> : null}
                <Button data-testid="tocklauncher-workflow-add-action" size="sm" type="button" variant="outline" disabled={busy || saving || draft.actions.length >= 16 || !validAction(pendingAction, currentPlatform)} onClick={() => {
                  dirtyRef.current = true
                  setDraft(previous => previous === null ? previous : { ...previous, actions: [...previous.actions, { ...pendingAction, args: { ...pendingAction.args } }] })
                  setPendingAction(makeAction(currentPlatform))
                }}>{fixed('Add action')}</Button>
              </FieldSet>

              <div className="flex flex-wrap justify-end gap-2">
                {selectedWorkflow === undefined ? null : (
                  <AlertDialog open={deletePending} onOpenChange={setDeletePending}>
                    <AlertDialogTrigger asChild><Button ref={deleteTriggerRef} data-testid="tocklauncher-workflow-delete" size="sm" type="button" variant="outline" disabled={busy || saving}>{launcherFixedText('Delete')}</Button></AlertDialogTrigger>
                    <AlertDialogContent data-testid="tocklauncher-workflow-delete-dialog">
                      <AlertDialogHeader>
                        <AlertDialogTitle>{fixed('Confirm workflow deletion')}</AlertDialogTitle>
                        <AlertDialogDescription>{fixed('This permanently removes the selected workflow from launcher settings.')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="tockteam-workflow-delete-cancel" size="sm" disabled={busy || saving}>{launcherFixedText('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction data-testid="tocklauncher-workflow-confirm-delete" size="sm" variant="destructive" disabled={busy || saving} onClick={() => { void persist(workflows.filter(workflow => workflow.id !== draft.id), workflows.find(workflow => workflow.id !== draft.id)?.id ?? '').finally(() => requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="tocklauncher-workflow-add"]')?.focus())) }}>{fixed('Delete workflow')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button data-testid="tocklauncher-workflow-save" size="sm" type="button" disabled={busy || saving || !validWorkflow(draft, currentPlatform)} onClick={() => {
                  const value = workflowValue(draft)
                  if (!isLauncherWorkflows([value], currentPlatform)) return
                  const next = workflows.some(workflow => workflow.id === value.id)
                    ? workflows.map(workflow => workflow.id === value.id ? value : workflow)
                    : [...workflows, value]
                  void persist(next, value.id)
                }}>{fixed('Save workflow')}</Button>
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}
