import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  DesktopCallerOperation,
  NativeOperationIdentity,
  TockTeamDesktopCaller,
  TockTeamDesktopPickerService,
} from '@tockteam/desktop/host'
import type { NoteVaultRuntime } from 'tockbot-note-runtime'
import { ReviewedBackupEngine } from './backup-engine.ts'
import { ImportExportError } from './core.ts'
import { ReviewedOperationEngine } from './engine.ts'
import {
  isImportInspectFormat,
  type BackupPlanView,
  type BackupPrepareRequest,
  type BackupPublishResult,
  type CommitResult,
  type InspectRequest,
  type ReviewBindingRequest,
  type ReviewCancellationRequest,
  type ReviewPlanView,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tockTeamDesktopCaller: TockTeamDesktopCaller
    tockTeamDesktopPicker: TockTeamDesktopPickerService
  }
}

export const name = '@tockteam/tocktutor-import-export'
export const inject = ['noteVault', 'tockTeamDesktopCaller', 'tockTeamDesktopPicker']

function token(): string {
  return randomBytes(32).toString('base64url')
}

/** Host-only reviewed operation gateway. Native grants never cross a Remote method. */
export class TockTutorImportExportGateway extends TypertRemoteService {
  private readonly backups: ReviewedBackupEngine
  private readonly caller: TockTeamDesktopCaller
  private readonly imports: ReviewedOperationEngine
  private readonly runtime: NoteVaultRuntime

  constructor(ctx: Context) {
    super(ctx, 'tocktutor-import-export')
    const runtime = ctx.noteVault as NoteVaultRuntime
    this.caller = ctx.tockTeamDesktopCaller
    this.runtime = runtime
    this.imports = new ReviewedOperationEngine({
      now: Date.now,
      picker: ctx.tockTeamDesktopPicker,
      randomToken: token,
      runtime,
    })
    this.backups = new ReviewedBackupEngine({
      desktop: ctx.tockTeamDesktopPicker,
      now: Date.now,
      randomToken: token,
      runtime,
    })
    ctx.effect(() => async () => {
      await this.imports.dispose()
      await this.backups.dispose()
    })
  }

  @Remote('inspect')
  async inspect(request: InspectRequest, signal: AbortSignal): Promise<ReviewPlanView> {
    if (!isImportInspectFormat(request.format)) throw new ImportExportError('unsupported-type')
    const operation = request.format === 'restore-backup' ? 'restore-backup' : 'import-source'
    const identity = await this.claim(request.authorization, operation, signal)
    return await this.imports.inspect({ format: request.format, identity }, signal)
  }

  @Remote('abandon-import')
  async abandonImport(request: InspectRequest, signal: AbortSignal): Promise<{ status: 'cancelled' }> {
    if (!isImportInspectFormat(request.format)) throw new ImportExportError('unsupported-type')
    const operation = request.format === 'restore-backup' ? 'restore-backup' : 'import-source'
    const identity = await this.claim(request.authorization, operation, signal, false)
    return await this.imports.abandon({ format: request.format, identity })
  }

  @Remote('approve-import')
  async approveImport(request: ReviewBindingRequest): Promise<{ status: 'approved' }> {
    return await this.imports.approve(request)
  }

  @Remote('commit-import')
  async commitImport(request: ReviewBindingRequest, signal: AbortSignal): Promise<CommitResult> {
    return await this.imports.commit(request, signal)
  }

  @Remote('cancel-import')
  async cancelImport(request: ReviewCancellationRequest): Promise<{ status: 'cancelled' }> {
    return await this.imports.cancel(request)
  }

  @Remote('prepare-backup')
  async prepareBackup(request: BackupPrepareRequest, signal: AbortSignal): Promise<BackupPlanView> {
    const identity = await this.claim(request.authorization, 'backup', signal)
    return await this.backups.prepare({ identity }, signal)
  }

  @Remote('abandon-backup')
  async abandonBackup(request: BackupPrepareRequest, signal: AbortSignal): Promise<{ status: 'cancelled' }> {
    const identity = await this.claim(request.authorization, 'backup', signal, false)
    return await this.backups.abandon({ identity })
  }

  @Remote('approve-backup')
  async approveBackup(request: ReviewBindingRequest): Promise<{ status: 'approved' }> {
    return await this.backups.approve(request)
  }

  @Remote('commit-backup')
  async commitBackup(request: ReviewBindingRequest, signal: AbortSignal): Promise<BackupPublishResult> {
    return await this.backups.commit(request, signal)
  }

  @Remote('cancel-backup')
  async cancelBackup(request: ReviewCancellationRequest): Promise<{ status: 'cancelled' }> {
    return await this.backups.cancel(request)
  }

  private async claim(
    authorization: string,
    operation: DesktopCallerOperation,
    signal: AbortSignal,
    revalidateRuntime = true,
  ): Promise<NativeOperationIdentity> {
    if (typeof authorization !== 'string' || authorization === '' || Buffer.byteLength(authorization, 'utf8') > 1_024) {
      throw new ImportExportError('invalid-plan')
    }
    if (this.runtime.state.active) await this.runtime.synchronizeDesktopSelection(signal)
    const identity = await this.caller.claim({ authorization, operation }, signal)
    if (revalidateRuntime) {
      const state = this.runtime.state
      if (!state.active || identity.vaultId !== state.id || identity.vaultGeneration !== state.generation) {
        throw new ImportExportError('stale-vault')
      }
    }
    return identity
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(TockTutorImportExportGateway)
}

export * from './archive.ts'
export * from './backup.ts'
export * from './backup-engine.ts'
export * from './core.ts'
export * from './engine.ts'
export * from './types.ts'
