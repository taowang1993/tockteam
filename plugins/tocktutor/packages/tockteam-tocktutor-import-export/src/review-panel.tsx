import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { Card } from '@tockteam/ui/card'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Spinner } from '@tockteam/ui/spinner'
import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { DesktopCallerOperation, TockTutorDesktopCallerBridge } from '@tockteam/desktop/client'
import type { TockTutorReviewPanelOwnerProps } from '@tockteam/tocktutor-workbench/client'
import type {
  BackupPlanView,
  BackupPrepareRequest,
  BackupPublishResult,
  CommitResult,
  ImportInspectFormat,
  InspectRequest,
  ReviewBindingRequest,
  ReviewCancellationRequest,
  ReviewPlanView,
} from './types.ts'

export interface ReviewPanelNamespace {
  inspect(request: InspectRequest, signal?: AbortSignal): Promise<RemoteResult<ReviewPlanView>>
  'abandon-import'(request: InspectRequest, signal?: AbortSignal): Promise<RemoteResult<{ status: 'cancelled' }>>
  'approve-import'(request: ReviewBindingRequest): Promise<RemoteResult<{ status: 'approved' }>>
  'commit-import'(request: ReviewBindingRequest, signal?: AbortSignal): Promise<RemoteResult<CommitResult>>
  'cancel-import'(request: ReviewCancellationRequest): Promise<RemoteResult<{ status: 'cancelled' }>>
  'prepare-backup'(request: BackupPrepareRequest, signal?: AbortSignal): Promise<RemoteResult<BackupPlanView>>
  'abandon-backup'(request: BackupPrepareRequest, signal?: AbortSignal): Promise<RemoteResult<{ status: 'cancelled' }>>
  'approve-backup'(request: ReviewBindingRequest): Promise<RemoteResult<{ status: 'approved' }>>
  'commit-backup'(request: ReviewBindingRequest, signal?: AbortSignal): Promise<RemoteResult<BackupPublishResult>>
  'cancel-backup'(request: ReviewCancellationRequest): Promise<RemoteResult<{ status: 'cancelled' }>>
}

export interface ReviewPanelRemote {
  readonly ['tocktutor-import-export']: ReviewPanelNamespace
}

export type ReviewPanelPhase =
  | 'approving'
  | 'committing'
  | 'complete'
  | 'error'
  | 'idle'
  | 'inspecting'
  | 'review'

export interface ReviewPanelSnapshot {
  error: string | null
  format: ImportInspectFormat
  kind: 'backup' | 'import'
  phase: ReviewPanelPhase
  preview: BackupPlanView | ReviewPlanView | null
  result: BackupPublishResult | CommitResult | null
}

function remoteValue<Value>(result: RemoteResult<Value>): Value {
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

type DesktopCallerAuthorizer = Pick<TockTutorDesktopCallerBridge, 'authorize'>

interface RetriedStart {
  authorization: string
  format: ImportInspectFormat
  kind: ReviewPanelSnapshot['kind']
}

const callerBridge: DesktopCallerAuthorizer = {
  async authorize(operation) {
    const root = globalThis as typeof globalThis & {
      window?: { dshDesktop?: { tockTutor?: TockTutorDesktopCallerBridge } }
    }
    const bridge = root.window?.dshDesktop?.tockTutor
    if (bridge === undefined) throw new Error('This operation is available only in the trusted TockTeam Desktop window.')
    return await bridge.authorize(operation)
  },
}

export class ImportExportReviewController {
  private abort = new AbortController()
  private approvedOperationId: string | undefined
  private authoritativeCommit: Promise<void> | undefined
  private readonly bridge: DesktopCallerAuthorizer
  private disposed = false
  private readonly listeners = new Set<() => void>()
  private readonly remote: ReviewPanelRemote
  private retryStart: RetriedStart | undefined
  private revision = 0
  private snapshot: ReviewPanelSnapshot = {
    error: null,
    format: 'markdown-folder',
    kind: 'import',
    phase: 'idle',
    preview: null,
    result: null,
  }

  constructor(
    remote: ReviewPanelRemote,
    bridge: DesktopCallerAuthorizer = callerBridge,
  ) {
    this.remote = remote
    this.bridge = bridge
  }

  readonly getSnapshot = (): ReviewPanelSnapshot => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  setFormat(format: ImportInspectFormat): void {
    if (this.snapshot.phase !== 'idle' && this.snapshot.phase !== 'complete' && this.snapshot.phase !== 'error') return
    if (this.retryStart !== undefined && this.retryStart.format !== format) return
    this.update({ ...this.snapshot, format })
  }

  async startImport(format = this.snapshot.format): Promise<void> {
    if (!this.canStart('import', format)) return
    const revision = this.begin('import', format)
    try {
      const operation = format === 'restore-backup' ? 'restore-backup' : 'import-source'
      const authorization = await this.startAuthorization('import', format, operation)
      if (!this.current(revision)) return
      const response = await this.remote['tocktutor-import-export'].inspect(
        { authorization, format },
        this.abort.signal,
      )
      if (!response.ok) this.retryStart = undefined
      const preview = remoteValue(response)
      if (this.current(revision)) {
        this.approvedOperationId = undefined
        this.retryStart = undefined
        this.update({ ...this.snapshot, phase: 'review', preview })
      }
    } catch (error) {
      this.fail(revision, error)
    }
  }

  async startBackup(): Promise<void> {
    const format = this.snapshot.format
    if (!this.canStart('backup', format)) return
    const revision = this.begin('backup', format)
    try {
      const authorization = await this.startAuthorization('backup', format, 'backup')
      if (!this.current(revision)) return
      const response = await this.remote['tocktutor-import-export']['prepare-backup'](
        { authorization },
        this.abort.signal,
      )
      if (!response.ok) this.retryStart = undefined
      const preview = remoteValue(response)
      if (this.current(revision)) {
        this.approvedOperationId = undefined
        this.retryStart = undefined
        this.update({ ...this.snapshot, phase: 'review', preview })
      }
    } catch (error) {
      this.fail(revision, error)
    }
  }

  approveAndCommit(): Promise<void> {
    if (this.authoritativeCommit !== undefined) return this.authoritativeCommit
    const run = this.commitReviewed()
    this.authoritativeCommit = run
    return run.finally(() => {
      if (this.authoritativeCommit === run) this.authoritativeCommit = undefined
    })
  }

  async cancel(): Promise<void> {
    if (this.snapshot.phase === 'approving' || this.snapshot.phase === 'committing') {
      await this.authoritativeCommit
      return
    }
    this.abort.abort()
    const kind = this.snapshot.kind
    const preview = this.snapshot.preview
    const retry = this.retryStart
    const revision = ++this.revision
    try {
      if (preview !== null) await this.cancelPreview(kind, preview)
      else if (retry !== undefined) await this.abandonRetry(retry)
    } catch {
      // Host expiry and unload remain bounded fallbacks when transport teardown races cancellation.
    } finally {
      if (!this.disposed && this.revision === revision) {
        this.abort = new AbortController()
        this.approvedOperationId = undefined
        this.retryStart = undefined
        this.update({ ...this.snapshot, error: null, phase: 'idle', preview: null, result: null })
      }
    }
  }

  dispose(): void {
    if (this.disposed) return
    const { kind, phase, preview } = this.snapshot
    const retry = this.retryStart
    this.disposed = true
    if (phase !== 'committing') this.abort.abort()
    if (phase === 'committing') {
      this.listeners.clear()
      return
    }
    this.revision += 1
    if (preview !== null && phase !== 'complete') {
      void this.cancelPreview(kind, preview).catch(() => undefined)
    } else if (preview === null && retry !== undefined) {
      void this.abandonRetry(retry).catch(() => undefined)
    }
    this.snapshot = { ...this.snapshot, error: null, phase: 'idle', preview: null, result: null }
    this.listeners.clear()
  }

  private async authorize(operation: DesktopCallerOperation): Promise<string> {
    const result = await this.bridge.authorize(operation)
    if (typeof result?.authorization !== 'string' || result.authorization === ''
      || new TextEncoder().encode(result.authorization).byteLength > 1_024) {
      throw new Error('Desktop authorization was rejected.')
    }
    return result.authorization
  }

  private canStart(kind: ReviewPanelSnapshot['kind'], format: ImportInspectFormat): boolean {
    if (this.retryStart === undefined
      || (this.retryStart.kind === kind && this.retryStart.format === format)) return true
    this.update({
      ...this.snapshot,
      error: `Retry the interrupted ${this.retryStart.kind} operation before starting another operation.`,
      phase: 'error',
    })
    return false
  }

  private async abandonRetry(retry: RetriedStart): Promise<void> {
    if (retry.kind === 'backup') {
      remoteValue(await this.remote['tocktutor-import-export']['abandon-backup']({ authorization: retry.authorization }))
    } else {
      remoteValue(await this.remote['tocktutor-import-export']['abandon-import']({
        authorization: retry.authorization,
        format: retry.format,
      }))
    }
  }

  private async cancelPreview(
    kind: ReviewPanelSnapshot['kind'],
    preview: BackupPlanView | ReviewPlanView,
  ): Promise<void> {
    const request = { operationId: preview.operationId, reviewToken: preview.reviewToken }
    if (kind === 'backup') remoteValue(await this.remote['tocktutor-import-export']['cancel-backup'](request))
    else remoteValue(await this.remote['tocktutor-import-export']['cancel-import'](request))
  }

  private async commitReviewed(): Promise<void> {
    const preview = this.snapshot.preview
    if (preview === null || (this.snapshot.phase !== 'review' && this.snapshot.phase !== 'error')) return
    const revision = this.revision
    const binding = {
      operationId: preview.operationId,
      planDigest: preview.planDigest,
      reviewToken: preview.reviewToken,
    }
    try {
      this.update({ ...this.snapshot, phase: 'approving' })
      if (this.snapshot.kind === 'backup') {
        if (this.approvedOperationId !== preview.operationId) {
          remoteValue(await this.remote['tocktutor-import-export']['approve-backup'](binding))
          this.approvedOperationId = preview.operationId
        }
        if (!this.current(revision)) return
        this.update({ ...this.snapshot, phase: 'committing' })
        const result = remoteValue(await this.remote['tocktutor-import-export']['commit-backup'](binding, this.abort.signal))
        if (this.revision === revision) {
          this.approvedOperationId = undefined
          this.update({ ...this.snapshot, phase: 'complete', result })
        }
      } else {
        if (this.approvedOperationId !== preview.operationId) {
          remoteValue(await this.remote['tocktutor-import-export']['approve-import'](binding))
          this.approvedOperationId = preview.operationId
        }
        if (!this.current(revision)) return
        this.update({ ...this.snapshot, phase: 'committing' })
        const result = remoteValue(await this.remote['tocktutor-import-export']['commit-import'](binding, this.abort.signal))
        if (this.revision === revision) {
          this.approvedOperationId = undefined
          this.update({ ...this.snapshot, phase: 'complete', result })
        }
      }
    } catch (error) {
      this.fail(revision, error, true)
    }
  }

  private begin(
    kind: ReviewPanelSnapshot['kind'],
    format: ImportInspectFormat,
  ): number {
    this.abort.abort()
    this.abort = new AbortController()
    const revision = ++this.revision
    this.update({ error: null, format, kind, phase: 'inspecting', preview: null, result: null })
    return revision
  }

  private current(revision: number): boolean {
    return !this.disposed && this.revision === revision
  }

  private async startAuthorization(
    kind: ReviewPanelSnapshot['kind'],
    format: ImportInspectFormat,
    operation: DesktopCallerOperation,
  ): Promise<string> {
    if (this.retryStart !== undefined) return this.retryStart.authorization
    const authorization = await this.authorize(operation)
    this.retryStart = { authorization, format, kind }
    return authorization
  }

  private fail(revision: number, error: unknown, preserveDisposed = false): void {
    if (this.revision !== revision || (this.disposed && !preserveDisposed)) return
    const message = error instanceof Error && error.message.trim() !== ''
      ? error.message.slice(0, 512)
      : 'The reviewed operation failed.'
    this.update({ ...this.snapshot, error: message, phase: 'error' })
  }

  private update(snapshot: ReviewPanelSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

export const IMPORT_CHOOSER_DELEGATIONS = [
  { format: 'markdown-folder', id: 'craft-folder', label: 'Craft Markdown Folder' },
  { format: 'markdown-zip', id: 'craft-zip', label: 'Craft Markdown ZIP' },
  { format: 'html', id: 'notion-html', label: 'Notion HTML Export' },
  { format: 'markdown-folder', id: 'apple-notes-folder', label: 'Apple Notes Markdown Folder' },
  { format: 'markdown-zip', id: 'apple-notes-zip', label: 'Apple Notes Markdown ZIP' },
  { format: 'html', id: 'apple-notes-html', label: 'Apple Notes HTML Export' },
] as const satisfies ReadonlyArray<{ format: ImportInspectFormat; id: string; label: string }>

const FORMAT_LABELS: ReadonlyArray<[ImportInspectFormat, string]> = [
  ['markdown-folder', 'Markdown Folder'],
  ['markdown-zip', 'Markdown ZIP'],
  ['html', 'HTML, Notion, or Apple Notes Export'],
  ['csv', 'CSV'],
  ['apple-journal', 'Apple Journal'],
  ['bear-backup', 'Bear Backup'],
  ['evernote', 'Evernote ENEX'],
  ['google-keep', 'Google Keep'],
  ['roam-research', 'Roam Research'],
  ['textbundle', 'Textbundle or Textpack'],
  ['restore-backup', 'TockTutor Backup Restore'],
]

export function ImportExportReviewPanelView(props: {
  onApprove(): void
  onCancel(): void
  onFormat(format: ImportInspectFormat): void
  onStart(format?: ImportInspectFormat): void
  onStartBackup?(): void
  snapshot: ReviewPanelSnapshot
}): ReactNode {
  const { snapshot } = props
  const preview = snapshot.preview
  const items = preview !== null && 'items' in preview ? preview.items : []
  const skipped = preview !== null && 'skipped' in preview ? preview.skipped : []
  const warnings = preview !== null && 'warnings' in preview ? preview.warnings : []
  const busy = snapshot.phase === 'inspecting' || snapshot.phase === 'approving' || snapshot.phase === 'committing'
  return (
    <Card unstyled aria-label="Import, Backup, and Restore" className="tocktutor-import-export-review grid gap-3 rounded-[10px] border border-[var(--tt-border)] p-3.5 [&_h2]:m-0 [&_h3]:m-0 [&_p]:m-0 [&_button]:min-h-8 [&_button]:rounded-md [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-[9px] [&_button]:py-[5px] [&_button]:text-inherit [&_select]:min-h-8 [&_select]:rounded-md [&_select]:border [&_select]:border-[var(--tt-border)] [&_select]:bg-[var(--tt-panel)] [&_select]:px-[9px] [&_select]:py-[5px] [&_select]:text-inherit" role="region">
      <header>
        <p className="tocktutor-import-export-kicker text-[11px] font-bold tracking-[.08em] text-[var(--tt-muted)] uppercase">Reviewed Operations</p>
        <h2>Import, Backup, and Restore</h2>
      </header>
      <p>Choose the export shape you downloaded. Each source uses the existing reviewed Markdown or HTML transaction.</p>
      {(snapshot.phase === 'idle' || snapshot.phase === 'complete' || (snapshot.phase === 'error' && preview === null)) && (
        <>
          <fieldset className="m-0 grid gap-2 rounded-md border border-[var(--tt-border)] p-2.5">
            <legend className="px-1 text-xs font-medium">Popular Export Sources</legend>
            <div className="flex flex-wrap gap-2">
              {IMPORT_CHOOSER_DELEGATIONS.map(delegation => (
                <Button unstyled key={delegation.id} onClick={() => { props.onStart(delegation.format) }} type="button">
                  {delegation.label}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="tocktutor-import-export-start flex flex-wrap gap-2">
            <Label unstyled className="grid flex-[1_1_220px] gap-1 text-xs">
              Other Import Format
              <NativeSelect unstyled
                onChange={event => { props.onFormat(event.currentTarget.value as ImportInspectFormat) }}
                value={snapshot.format}
              >
                {FORMAT_LABELS.map(([format, label]) => <NativeSelectOption key={format} value={format}>{label}</NativeSelectOption>)}
              </NativeSelect>
            </Label>
            <Button unstyled onClick={() => { props.onStart() }} type="button">Inspect Selected Format</Button>
            <Button unstyled onClick={props.onStartBackup} type="button">Create Vault Backup</Button>
          </div>
        </>
      )}
      {busy && (
        <div className="tocktutor-import-export-actions flex flex-wrap gap-2">
          <Alert unstyled aria-live="polite" className="flex items-center gap-2" role="status"><Spinner />{snapshot.phase === 'inspecting' ? 'Inspecting the selected source…' : snapshot.phase === 'approving' ? 'Approving the reviewed plan…' : 'Committing through the vault runtime…'}</Alert>
          <Button unstyled onClick={props.onCancel} type="button">Cancel</Button>
        </div>
      )}
      {snapshot.phase === 'review' && preview !== null && (
        <div className="tocktutor-import-export-plan grid gap-2.5">
          <h3>Review {String('entries' in preview ? preview.entries : items.length)} Planned {'entries' in preview ? 'Backup Entries' : items.length === 1 ? 'Item' : 'Items'}</h3>
          <dl className="m-0 grid gap-1">
            <div className="flex justify-between gap-2"><dt>Source</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{'source' in preview ? preview.source.label : 'Active Vault Snapshot'}</dd></div>
            <div className="flex justify-between gap-2"><dt>Total Bytes</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{String(preview.totalBytes)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Plan Digest</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{preview.planDigest.slice(0, 23)}…</dd></div>
          </dl>
          {items.length > 0 && <ul className="m-0 max-h-[180px] overflow-auto pl-[18px]">{items.slice(0, 100).map(item => <li key={item.id}>{item.destination} — {String(item.size)} bytes</li>)}</ul>}
          {warnings.map(warning => <p key={warning} role="note">{warning}</p>)}
          {skipped.length > 0 && <details><summary>{String(skipped.length)} Skipped Entries</summary><ul className="m-0 max-h-[180px] overflow-auto pl-[18px]">{skipped.slice(0, 100).map(entry => <li key={`${entry.label}:${entry.reason}`}>{entry.label}: {entry.reason}</li>)}</ul></details>}
          <div className="tocktutor-import-export-actions flex flex-wrap gap-2">
            <Button unstyled onClick={props.onApprove} type="button">Approve and Commit</Button>
            <Button unstyled onClick={props.onCancel} type="button">Cancel</Button>
          </div>
        </div>
      )}
      {snapshot.phase === 'complete' && snapshot.result !== null && (
        <Alert unstyled aria-live="polite" className="tocktutor-import-export-result" role="status">
          <h3>Operation Result</h3>
          {'committed' in snapshot.result ? (
            <>
              <p>{String(snapshot.result.committed.length)} committed, {String(snapshot.result.skipped.length)} skipped, and {String(snapshot.result.failed.length)} failed.</p>
              <p>Recovery: {snapshot.result.recovery.status}</p>
              {snapshot.result.committed.length > 0 && <ul>{snapshot.result.committed.slice(0, 100).map(entry => <li key={entry.id}>Committed: {entry.destination}</li>)}</ul>}
              {snapshot.result.skipped.length > 0 && <ul>{snapshot.result.skipped.slice(0, 100).map(entry => <li key={`${entry.destination}:${entry.reason}`}>Skipped: {entry.destination} — {entry.reason}</li>)}</ul>}
              {snapshot.result.failed.length > 0 && <ul>{snapshot.result.failed.slice(0, 100).map(entry => <li key={`${entry.destination}:${entry.reason}`}>Failed: {entry.destination} — {entry.reason}</li>)}</ul>}
            </>
          ) : (
            <>
              <p>Backup publication: {snapshot.result.status}</p>
              <p>Cleanup: {snapshot.result.cleanup.status}</p>
              {'residualLabels' in snapshot.result.cleanup && <p>{String(snapshot.result.cleanup.residualLabels.length)} bounded recovery labels require review.</p>}
            </>
          )}
        </Alert>
      )}
      {snapshot.phase === 'error' && (
        <div className="tocktutor-import-export-actions flex flex-wrap gap-2">
          <Alert unstyled>{snapshot.error ?? 'The reviewed operation failed.'}</Alert>
          {preview !== null && <Button unstyled onClick={props.onApprove} type="button">Retry Reviewed Commit</Button>}
          {preview !== null && <Button unstyled onClick={props.onCancel} type="button">Cancel</Button>}
        </div>
      )}
    </Card>
  )
}

export function ImportExportReviewPanel(
  props: TockTutorReviewPanelOwnerProps & { remote: ReviewPanelRemote },
): ReactNode {
  const vaultGeneration = props.vault?.generation ?? null
  const vaultId = props.vault?.id ?? null
  const controller = useMemo(
    () => new ImportExportReviewController(props.remote),
    [props.remote],
  )
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => { void controller.cancel() }, [controller, vaultGeneration, vaultId])
  useEffect(() => () => { controller.dispose() }, [controller])
  if (props.vault === null) return null
  return (
    <ImportExportReviewPanelView
      onApprove={() => { void controller.approveAndCommit() }}
      onCancel={() => { void controller.cancel() }}
      onFormat={format => { controller.setFormat(format) }}
      onStart={format => { void controller.startImport(format) }}
      onStartBackup={() => { void controller.startBackup() }}
      snapshot={snapshot}
    />
  )
}
