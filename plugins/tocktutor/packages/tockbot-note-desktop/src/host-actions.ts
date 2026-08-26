import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  createNativeOwnerLifetime,
  MAX_PRINT_EXPORT_HTML_BYTES,
  type DesktopCallerOperation,
  type NativeOperationIdentity,
  type TockTeamDesktopCaller,
  type TockTeamDesktopMicrophone,
  type TockTeamDesktopPickerService,
  type TockTeamDesktopPopOut,
  type TockTeamDesktopPrintExport,
} from '@tockteam/desktop/host'
import type { NoteVaultRuntime } from 'tockbot-note-runtime'
import {
  buildMarkdownExportDocument,
  collectEmbedTargets,
  resolveEmbedTargetPath,
  resolveNoteEmbedFragment,
  type StaticMarkdownEmbed,
} from '@tockteam/tocktutor-workbench'
import type { DesktopVaultReference as VaultReference, NativeActionResult } from './types.ts'

export type { NativeActionResult } from './types.ts'

export const MAX_TRACKED_POPOUTS = 64

declare module '@deepseek-ai/cordis' {
  interface Context {
    noteVault: NoteVaultRuntime
    tockTeamDesktopCaller: TockTeamDesktopCaller
    tockTeamDesktopMicrophone: TockTeamDesktopMicrophone
    tockTeamDesktopPicker: TockTeamDesktopPickerService
    tockTeamDesktopPopOut: TockTeamDesktopPopOut
    tockTeamDesktopPrintExport: TockTeamDesktopPrintExport
  }
}

function assertVault(value: VaultReference): void {
  if (
    typeof value !== 'object'
    || value === null
    || !Number.isSafeInteger(value.generation)
    || value.generation < 0
    || typeof value.id !== 'string'
    || !/^vault:[0-9a-f]{64}$/u.test(value.id)
  ) throw new TypeError('Vault must identify one active vault generation.')
}

function assertVaultId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^vault:[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError('Vault target must be one opaque recent vault id.')
  }
}

function assertPath(value: string): void {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)
    || new TextEncoder().encode(value).byteLength > 4096
    || value.startsWith('/')
    || /^[A-Za-z]:/u.test(value)
    || value.split('/').some(part => part.length === 0 || part === '.' || part === '..')
  ) throw new TypeError('Path must be one bounded vault-relative entry.')
}

function assertAuthorization(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    throw new TypeError('Desktop authorization must be one bounded opaque token.')
  }
}

function popOutKey(vault: VaultReference, path: string): string {
  return `${vault.id}:${String(vault.generation)}:${path}`
}

async function resolveExportEmbeds(
  runtime: NoteVaultRuntime,
  source: string,
  expectedVault: VaultReference,
  signal: AbortSignal,
): Promise<StaticMarkdownEmbed[]> {
  const targets = collectEmbedTargets(source)
  if (targets.length === 0) return []
  const entries: Array<{ kind: string; mediaKind?: string; path: string }> = []
  let cursor: string | null = null
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await runtime.listTree({ cursor, expectedVault, limit: 500 }, signal)
    assertCurrentVault(runtime, expectedVault)
    if (page.generation !== expectedVault.generation) throw new Error('The active vault changed while resolving embeds.')
    entries.push(...page.entries)
    if (page.complete || page.cursor === null) break
    if (page.cursor === cursor || pageIndex === 9) throw new Error('The bounded embed tree scan did not complete.')
    cursor = page.cursor
  }

  const resolved: StaticMarkdownEmbed[] = []
  let aggregateBytes = 0
  for (const target of targets) {
    const path = resolveEmbedTargetPath(entries, target.path)
    if (path === null) continue
    const entry = entries.find(candidate => candidate.path === path)
    if (entry === undefined) continue
    const projectedTarget = { ...target, path: entry.path }
    if (target.kind === 'media') {
      if (entry.kind !== 'attachment') continue
      if (entry.mediaKind !== 'image') {
        resolved.push({
          content: '',
          mimeType: entry.mediaKind === 'audio' ? 'audio/unknown' : entry.mediaKind === 'video' ? 'video/unknown' : 'application/pdf',
          target: projectedTarget,
        })
        continue
      }
      const preview = await runtime.previewAttachment(entry.path, expectedVault, signal)
      assertCurrentVault(runtime, expectedVault)
      if (preview.generation !== expectedVault.generation || preview.path !== entry.path || preview.data.byteLength > 1_500_000) continue
      aggregateBytes += preview.data.byteLength
      if (aggregateBytes > 6_000_000) break
      resolved.push({ content: Buffer.from(preview.data).toString('base64'), mimeType: preview.mimeType, target: projectedTarget })
      continue
    }
    if (entry.kind !== 'document') continue
    const opened = await runtime.openDocument(entry.path, expectedVault, signal)
    assertCurrentVault(runtime, expectedVault)
    if (opened.generation !== expectedVault.generation || opened.path !== entry.path) throw new Error('An embedded document changed during export.')
    aggregateBytes += new TextEncoder().encode(opened.content).byteLength
    if (aggregateBytes > 6_000_000) break
    const content = target.kind === 'note' ? resolveNoteEmbedFragment(opened.content, target.fragment) : opened.content
    if (content !== null) resolved.push({ content, target: projectedTarget })
  }
  return resolved
}

async function renderNote(
  runtime: NoteVaultRuntime,
  path: string,
  content: string,
  expectedVault: VaultReference,
  signal: AbortSignal,
): Promise<{ html: string; title: string }> {
  const title = Array.from(path).slice(-128).join('')
  const embeds = await resolveExportEmbeds(runtime, content, expectedVault, signal)
  const html = buildMarkdownExportDocument({ embeds, markdown: content, title })
  if (new TextEncoder().encode(html).byteLength > MAX_PRINT_EXPORT_HTML_BYTES) {
    throw new TypeError('The active note is too large to print or export safely.')
  }
  return { html, title }
}

function assertCurrentVault(runtime: NoteVaultRuntime, expected: VaultReference): void {
  const state = runtime.state
  if (!state.active || state.id !== expected.id || state.generation !== expected.generation) {
    throw new Error('The active vault changed before the Desktop action could finish.')
  }
}

function assertIdentityCurrent(runtime: NoteVaultRuntime, identity: NativeOperationIdentity): void {
  const state = runtime.state
  if (
    state.generation !== identity.vaultGeneration
    || (state.active ? state.id : null) !== identity.vaultId
  ) throw new Error('Desktop caller authorization is stale for the active vault.')
}

function sameIdentity(left: NativeOperationIdentity, right: NativeOperationIdentity): boolean {
  return left.operationId === right.operationId
    && left.requestId === right.requestId
    && left.sessionId === right.sessionId
    && left.vaultGeneration === right.vaultGeneration
    && left.vaultId === right.vaultId
    && left.windowId === right.windowId
}

function assertClaim(
  runtime: NoteVaultRuntime,
  expected: VaultReference,
  identity: NativeOperationIdentity,
): void {
  assertCurrentVault(runtime, expected)
  assertIdentityCurrent(runtime, identity)
  if (identity.vaultId !== expected.id || identity.vaultGeneration !== expected.generation) {
    throw new Error('Desktop caller authorization is stale for the requested vault.')
  }
}

/** Caller-bound Host gateway for the bounded TockTutor native action seat. */
export class TockTutorDesktopGateway extends TypertRemoteService {
  static inject = [
    'noteVault',
    'tockTeamDesktopCaller',
    'tockTeamDesktopMicrophone',
    'tockTeamDesktopPicker',
    'tockTeamDesktopPopOut',
    'tockTeamDesktopPrintExport',
  ]

  private readonly activations = new Map<string, {
    identity: NativeOperationIdentity
    vault: VaultReference
  }>()
  private readonly targetActivations = new Map<string, {
    identity: NativeOperationIdentity
    requestedId: string
    target: VaultReference
  }>()
  private readonly lifetime = createNativeOwnerLifetime()
  private readonly recoveredResults = new Map<string, {
    fingerprint: string
    identity: NativeOperationIdentity
    result: NativeActionResult
  }>()
  private readonly popOutClosures = new Map<string, {
    identity: NativeOperationIdentity
    request: string
    vault: VaultReference
  }>()
  private readonly popOuts = new Map<string, { identity: NativeOperationIdentity; windowId: string }>()
  private readonly revealed = new Map<string, {
    identity: NativeOperationIdentity
    path: string
    vault: VaultReference
  }>()

  constructor(ctx: Context) {
    super(ctx, 'tocktutorDesktop')
    ctx.effect(() => async () => {
      await this.lifetime.dispose()
      const opened = new Map(
        [...this.popOuts.values()].map(record => [record.windowId, record] as const),
      )
      this.activations.clear()
      this.targetActivations.clear()
      this.popOutClosures.clear()
      this.popOuts.clear()
      this.recoveredResults.clear()
      this.revealed.clear()
      await Promise.allSettled([...opened.values()].map(record => (
        this.ctx.tockTeamDesktopPopOut.close(
          { identity: record.identity, windowId: record.windowId },
          AbortSignal.timeout(2_000),
        )
      )))
    }, 'tocktutorDesktop owner lifetime')
  }

  private async claimForVault(
    authorization: string,
    operation: DesktopCallerOperation,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<NativeOperationIdentity> {
    await this.ctx.noteVault.synchronizeDesktopSelection(signal)
    assertCurrentVault(this.ctx.noteVault, expectedVault)
    const identity = await this.ctx.tockTeamDesktopCaller.claim({ authorization, operation }, signal)
    assertClaim(this.ctx.noteVault, expectedVault, identity)
    return identity
  }

  private recoverResult(
    authorization: string,
    fingerprint: string,
    identity: NativeOperationIdentity,
  ): NativeActionResult | undefined {
    const recovered = this.recoveredResults.get(authorization)
    if (recovered === undefined) return undefined
    if (recovered.fingerprint !== fingerprint || !sameIdentity(recovered.identity, identity)) {
      throw new Error('Desktop action changed during response recovery.')
    }
    return recovered.result
  }

  private rememberResult(
    authorization: string,
    fingerprint: string,
    identity: NativeOperationIdentity,
    result: NativeActionResult,
  ): NativeActionResult {
    this.recoveredResults.set(authorization, { fingerprint, identity, result })
    if (this.recoveredResults.size > 128) {
      this.recoveredResults.delete(this.recoveredResults.keys().next().value!)
    }
    return result
  }

  @Remote
  async activateVault(authorization: string, signal: AbortSignal): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    return this.lifetime.run(async ownerSignal => {
      const identity = await this.ctx.tockTeamDesktopCaller.claim({
        authorization,
        operation: 'activate-vault',
      }, ownerSignal)
      const recovered = this.activations.get(authorization)
      if (recovered !== undefined) {
        if (!sameIdentity(recovered.identity, identity)) {
          throw new Error('Desktop caller authorization changed during recovery.')
        }
        assertCurrentVault(this.ctx.noteVault, recovered.vault)
        return { status: 'activated' }
      }
      assertIdentityCurrent(this.ctx.noteVault, identity)
      const selection = await this.ctx.tockTeamDesktopPicker.pick({
        identity,
        kind: 'vault',
        purpose: 'activate',
      }, ownerSignal)
      assertIdentityCurrent(this.ctx.noteVault, identity)
      if (selection.status !== 'selected') return { status: selection.status }
      if (selection.operationId !== identity.operationId) {
        throw new Error('Desktop picker returned a mismatched operation.')
      }
      const result = await this.ctx.noteVault.activateDesktopSelection({
        authorization: selection.authorization,
        identity,
      }, ownerSignal)
      const state = this.ctx.noteVault.state
      if (
        result.operationId !== identity.operationId
        || !state.active
        || state.id !== result.vaultId
        || state.generation !== result.vaultGeneration
      ) throw new Error('Desktop vault activation completed with stale state.')
      this.activations.set(authorization, {
        identity,
        vault: { generation: result.vaultGeneration, id: result.vaultId },
      })
      if (this.activations.size > 128) this.activations.delete(this.activations.keys().next().value!)
      return { status: 'activated' }
    }, signal)
  }

  @Remote
  async activateVaultTarget(
    authorization: string,
    target: { id: string },
    signal: AbortSignal,
  ): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    if (typeof target !== 'object' || target === null) throw new TypeError('Vault target is required.')
    assertVaultId(target.id)
    return this.lifetime.run(async ownerSignal => {
      const identity = await this.ctx.tockTeamDesktopCaller.claim({
        authorization,
        operation: 'activate-vault',
      }, ownerSignal)
      const recovered = this.targetActivations.get(authorization)
      if (recovered !== undefined) {
        if (!sameIdentity(recovered.identity, identity) || recovered.requestedId !== target.id) {
          throw new Error('Desktop vault target changed during recovery.')
        }
        assertCurrentVault(this.ctx.noteVault, recovered.target)
        return { status: 'activated' }
      }
      assertIdentityCurrent(this.ctx.noteVault, identity)
      const current = this.ctx.noteVault.state
      if (!current.active) throw new Error('There is no active vault to switch from.')
      const activated = current.id === target.id
        ? current
        : this.ctx.noteVault.activateRecentVault(target.id, current.generation)
      if (!activated.active || activated.id !== target.id) {
        throw new Error('Desktop vault target activation returned stale state.')
      }
      await this.ctx.noteVault.synchronizeDesktopSelection(ownerSignal)
      const currentTarget = this.ctx.noteVault.state
      if (!currentTarget.active || currentTarget.id !== target.id || currentTarget.generation !== activated.generation) {
        throw new Error('Desktop vault target changed during synchronization.')
      }
      const targetVault = { id: currentTarget.id, generation: currentTarget.generation }
      this.targetActivations.set(authorization, { identity, requestedId: target.id, target: targetVault })
      if (this.targetActivations.size > 128) this.targetActivations.delete(this.targetActivations.keys().next().value!)
      return { status: 'activated' }
    }, signal)
  }

  @Remote
  async openPopOut(
    authorization: string,
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    assertPath(path)
    assertVault(expectedVault)
    assertCurrentVault(this.ctx.noteVault, expectedVault)
    return this.lifetime.run(async ownerSignal => {
      const identity = await this.claimForVault(authorization, 'popout-open', expectedVault, ownerSignal)
      const fingerprint = `popout-open:${expectedVault.id}:${String(expectedVault.generation)}:${path}`
      const recovered = this.recoverResult(authorization, fingerprint, identity)
      if (recovered !== undefined) return recovered
      const key = popOutKey(expectedVault, path)
      if (!this.popOuts.has(key) && this.popOuts.size >= MAX_TRACKED_POPOUTS) {
        return { status: 'denied' }
      }
      const result = await this.ctx.tockTeamDesktopPopOut.open({ identity, relativePath: path }, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      if (result.operationId !== identity.operationId) {
        throw new Error('Desktop pop-out returned a mismatched operation.')
      }
      if (result.status === 'opened' || result.status === 'focused') {
        this.popOuts.set(key, { identity, windowId: result.windowId })
      }
      return this.rememberResult(authorization, fingerprint, identity, { status: result.status })
    }, signal)
  }

  @Remote
  async closePopOut(
    authorization: string,
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    assertPath(path)
    assertVault(expectedVault)
    assertCurrentVault(this.ctx.noteVault, expectedVault)
    return this.lifetime.run(async ownerSignal => {
      const identity = await this.claimForVault(authorization, 'popout-close', expectedVault, ownerSignal)
      const recovered = this.popOutClosures.get(authorization)
      if (recovered !== undefined) {
        if (!sameIdentity(recovered.identity, identity)
          || recovered.request !== path
          || recovered.vault.id !== expectedVault.id
          || recovered.vault.generation !== expectedVault.generation) {
          throw new Error('Desktop pop-out close changed during recovery.')
        }
        return { status: 'closed' }
      }
      const key = popOutKey(expectedVault, path)
      const opened = this.popOuts.get(key)
      if (opened === undefined) return { status: 'stale' }
      const result = await this.ctx.tockTeamDesktopPopOut.close({
        identity,
        windowId: opened.windowId,
      }, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      if (result.operationId !== identity.operationId) {
        throw new Error('Desktop pop-out returned a mismatched operation.')
      }
      if (result.status === 'closed' || result.status === 'stale') this.popOuts.delete(key)
      if (result.status === 'closed') {
        this.popOutClosures.set(authorization, { identity, request: path, vault: expectedVault })
        if (this.popOutClosures.size > 128) {
          this.popOutClosures.delete(this.popOutClosures.keys().next().value!)
        }
      }
      return { status: result.status }
    }, signal)
  }

  @Remote
  async closeAllPopOuts(
    authorization: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    assertVault(expectedVault)
    assertCurrentVault(this.ctx.noteVault, expectedVault)
    return this.lifetime.run(async ownerSignal => {
      const identity = await this.claimForVault(authorization, 'popout-close-all', expectedVault, ownerSignal)
      const recovered = this.popOutClosures.get(authorization)
      if (recovered !== undefined) {
        if (!sameIdentity(recovered.identity, identity)
          || recovered.request !== '*'
          || recovered.vault.id !== expectedVault.id
          || recovered.vault.generation !== expectedVault.generation) {
          throw new Error('Desktop pop-out close changed during recovery.')
        }
        return { status: 'closed' }
      }
      const result = await this.ctx.tockTeamDesktopPopOut.closeAll({ identity }, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      if (result.operationId !== identity.operationId) {
        throw new Error('Desktop pop-out returned a mismatched operation.')
      }
      if (result.status === 'closed' || result.status === 'stale') this.popOuts.clear()
      if (result.status === 'closed') {
        this.popOutClosures.set(authorization, { identity, request: '*', vault: expectedVault })
        if (this.popOutClosures.size > 128) {
          this.popOutClosures.delete(this.popOutClosures.keys().next().value!)
        }
      }
      return { status: result.status }
    }, signal)
  }

  @Remote
  async printNote(
    authorization: string,
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    assertPath(path)
    assertVault(expectedVault)
    assertCurrentVault(this.ctx.noteVault, expectedVault)
    return this.lifetime.run(async ownerSignal => {
      const identity = await this.claimForVault(authorization, 'print', expectedVault, ownerSignal)
      const fingerprint = `print:${expectedVault.id}:${String(expectedVault.generation)}:${path}`
      const recovered = this.recoverResult(authorization, fingerprint, identity)
      if (recovered !== undefined) return recovered
      const document = await this.ctx.noteVault.openDocument(path, expectedVault, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      const note = await renderNote(this.ctx.noteVault, document.path, document.content, expectedVault, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      const result = await this.ctx.tockTeamDesktopPrintExport.render({
        format: 'print',
        ...note,
        identity,
      }, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      if (result.operationId !== identity.operationId) {
        throw new Error('Desktop print returned a mismatched operation.')
      }
      return this.rememberResult(authorization, fingerprint, identity, { status: result.status })
    }, signal)
  }

  @Remote
  async exportNote(
    authorization: string,
    format: 'html' | 'pdf',
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    if (format !== 'html' && format !== 'pdf') throw new TypeError('Export format must be html or pdf.')
    assertPath(path)
    assertVault(expectedVault)
    assertCurrentVault(this.ctx.noteVault, expectedVault)
    return this.lifetime.run(async ownerSignal => {
      const purpose = format === 'html' ? 'export-html' : 'export-pdf'
      const identity = await this.claimForVault(authorization, purpose, expectedVault, ownerSignal)
      const fingerprint = `export-${format}:${expectedVault.id}:${String(expectedVault.generation)}:${path}`
      const recovered = this.recoverResult(authorization, fingerprint, identity)
      if (recovered !== undefined) return recovered
      const document = await this.ctx.noteVault.openDocument(path, expectedVault, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      const selection = await this.ctx.tockTeamDesktopPicker.pick({
        identity,
        kind: 'destination',
        purpose,
      }, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      if (selection.status !== 'selected') {
        return this.rememberResult(authorization, fingerprint, identity, { status: selection.status })
      }
      if (selection.operationId !== identity.operationId) {
        throw new Error('Desktop picker returned a mismatched operation.')
      }
      const note = await renderNote(this.ctx.noteVault, document.path, document.content, expectedVault, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      const result = await this.ctx.tockTeamDesktopPrintExport.render(format === 'html' ? {
        authorization: selection.authorization,
        format: 'html',
        ...note,
        identity,
        purpose: 'export-html',
      } : {
        authorization: selection.authorization,
        format: 'pdf',
        ...note,
        identity,
        purpose: 'export-pdf',
      }, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      if (result.operationId !== identity.operationId) {
        throw new Error('Desktop export returned a mismatched operation.')
      }
      return this.rememberResult(authorization, fingerprint, identity, { status: result.status })
    }, signal)
  }

  @Remote
  async requestMicrophone(
    authorization: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    assertVault(expectedVault)
    assertCurrentVault(this.ctx.noteVault, expectedVault)
    return this.lifetime.run(async ownerSignal => {
      const identity = await this.claimForVault(authorization, 'microphone', expectedVault, ownerSignal)
      const fingerprint = `microphone:${expectedVault.id}:${String(expectedVault.generation)}`
      const recovered = this.recoverResult(authorization, fingerprint, identity)
      if (recovered !== undefined) return recovered
      const result = await this.ctx.tockTeamDesktopMicrophone.request({ identity }, ownerSignal)
      assertClaim(this.ctx.noteVault, expectedVault, identity)
      if (result.operationId !== identity.operationId) {
        throw new Error('Desktop microphone returned a mismatched operation.')
      }
      return this.rememberResult(authorization, fingerprint, identity, { status: result.status })
    }, signal)
  }

  @Remote
  async revealEntry(
    authorization: string,
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<NativeActionResult> {
    assertAuthorization(authorization)
    assertPath(path)
    assertVault(expectedVault)
    assertCurrentVault(this.ctx.noteVault, expectedVault)
    return this.lifetime.run(async ownerSignal => {
      const identity = await this.claimForVault(authorization, 'reveal-entry', expectedVault, ownerSignal)
      const recovered = this.revealed.get(authorization)
      if (
        recovered !== undefined
        && sameIdentity(recovered.identity, identity)
        && recovered.path === path
        && recovered.vault.id === expectedVault.id
        && recovered.vault.generation === expectedVault.generation
      ) return { status: 'revealed' }
      await this.ctx.noteVault.revealEntry({ expectedVault, path }, ownerSignal)
      assertCurrentVault(this.ctx.noteVault, expectedVault)
      this.revealed.set(authorization, { identity, path, vault: expectedVault })
      if (this.revealed.size > 128) this.revealed.delete(this.revealed.keys().next().value!)
      return { status: 'revealed' }
    }, signal)
  }
}
