import { randomUUID } from 'node:crypto'
import { closeSync, constants as fsConstants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { assertTrustedRaycastBuildIdentity, readTrustedRaycastBuildIdentity, readTrustedRaycastFile, TRUSTED_RAYCAST_ARTIFACT_SHA256, type TrustedRaycastBuildIdentity } from './trusted-raycast-artifact-admission.ts'
import type { TrustedRaycastTrustRecovery, TrustedRaycastTrustState } from './trusted-raycast-contract.ts'

export type TrustedRaycastDiskTrustState = Omit<TrustedRaycastTrustState, 'active'>
const INSTALL_FILES = ['artifact.tar', 'child.mjs', 'resolution.mjs', 'build.json'] as const
const SHA256_PATTERN = /^[a-f0-9]{64}$/

type TrustFile = Readonly<{
  enabled: boolean
  approvedSha256: string
  installedSha256: string
  approvedIdentity?: TrustedRaycastBuildIdentity
  previousApprovedSha256: string
  previousIdentity?: TrustedRaycastBuildIdentity
}>
type RotationJournal = Readonly<{ candidate: TrustedRaycastBuildIdentity; previous?: TrustedRaycastBuildIdentity }>

export type TrustedRaycastTrustOptions = Readonly<{
  installRoot: string
  candidateDir: string
  stateFile: string
  expectedSha256?: string
  preview?: (stagedDir: string) => Promise<string>
}>

const identityFrom = (value: unknown): TrustedRaycastBuildIdentity | undefined => {
  try { return assertTrustedRaycastBuildIdentity(value, (value as { artifactSha256: string }).artifactSha256) } catch { return undefined }
}
const sameIdentity = (left: TrustedRaycastBuildIdentity | undefined, right: TrustedRaycastBuildIdentity | undefined): boolean => left !== undefined && right !== undefined && JSON.stringify(left) === JSON.stringify(right)
const readTrustFile = (path: string): TrustFile => {
  try {
    const parsed: unknown = JSON.parse(readTrustedRaycastFile(path, 128 * 1024).toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid')
    const record = parsed as Record<string, unknown>
    const approved = typeof record.approvedSha256 === 'string' && SHA256_PATTERN.test(record.approvedSha256) ? record.approvedSha256 : ''
    const installed = typeof record.installedSha256 === 'string' && SHA256_PATTERN.test(record.installedSha256) ? record.installedSha256 : ''
    const previous = typeof record.previousApprovedSha256 === 'string' && SHA256_PATTERN.test(record.previousApprovedSha256) ? record.previousApprovedSha256 : ''
    const approvedIdentity = identityFrom(record.approvedIdentity)
    const previousIdentity = identityFrom(record.previousIdentity)
    return Object.freeze({ enabled: record.enabled === true, approvedSha256: approved, installedSha256: installed, previousApprovedSha256: previous, ...(approvedIdentity === undefined ? {} : { approvedIdentity }), ...(previousIdentity === undefined ? {} : { previousIdentity }) })
  } catch { return Object.freeze({ enabled: false, approvedSha256: '', installedSha256: '', previousApprovedSha256: '' }) }
}

/** Trust files and rotation journals use durable replacement; a crash leaves the prior decision intact. */
const writeAtomic = (path: string, bytes: Buffer): void => {
  const directoryPath = dirname(path)
  mkdirSync(directoryPath, { recursive: true })
  const temporary = join(directoryPath, `.${basename(path)}.${randomUUID()}.tmp`)
  let file: number | undefined
  try {
    file = openSync(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600)
    writeFileSync(file, bytes)
    fsyncSync(file)
    closeSync(file); file = undefined
    renameSync(temporary, path)
    try { const directory = openSync(directoryPath, 'r'); try { fsyncSync(directory) } finally { closeSync(directory) } } catch { /* best effort on platforms without directory fsync */ }
  } finally {
    if (file !== undefined) closeSync(file)
    rmSync(temporary, { force: true })
  }
}

export class TrustedRaycastTrustStore {
  private readonly options: TrustedRaycastTrustOptions
  private readonly expectedSha256: string
  constructor(options: TrustedRaycastTrustOptions) { this.options = options; this.expectedSha256 = options.expectedSha256 ?? TRUSTED_RAYCAST_ARTIFACT_SHA256 }
  private readonly currentDir = (): string => join(this.options.installRoot, 'current')
  private readonly previousDir = (): string => join(this.options.installRoot, 'previous')
  private readonly stageDir = (): string => join(this.options.installRoot, 'stage')
  private readonly stageTmpDir = (): string => join(this.options.installRoot, 'stage.tmp')
  private readonly journalPath = (): string => join(this.options.installRoot, 'rotation.json')

  private readIdentity(dir: string, expected: string): TrustedRaycastBuildIdentity | undefined {
    try { if (lstatSync(dir).isSymbolicLink()) return undefined; return readTrustedRaycastBuildIdentity(dir, expected) } catch { return undefined }
  }
  private ensureInstallRoot(): void {
    try { if (lstatSync(this.options.installRoot).isSymbolicLink()) throw new Error('Trusted Translate install root is a symlink') } catch (error) { if (error instanceof Error && error.message.includes('is a symlink')) throw error }
    mkdirSync(this.options.installRoot, { recursive: true })
  }
  private readExact(dir: string, identity: TrustedRaycastBuildIdentity | undefined): TrustedRaycastBuildIdentity | undefined {
    if (identity === undefined) return undefined
    const actual = this.readIdentity(dir, identity.artifactSha256)
    return sameIdentity(actual, identity) ? actual : undefined
  }
  private readJournal(): RotationJournal | undefined {
    try {
      const parsed: unknown = JSON.parse(readTrustedRaycastFile(this.journalPath(), 128 * 1024).toString('utf8'))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid')
      const record = parsed as Record<string, unknown>
      const candidate = identityFrom(record.candidate)
      const previous = record.previous === undefined ? undefined : identityFrom(record.previous)
      if (candidate === undefined || (record.previous !== undefined && previous === undefined)) throw new Error('invalid')
      return Object.freeze({ candidate, ...(previous === undefined ? {} : { previous }) })
    } catch { return undefined }
  }
  private candidateIdentity(): TrustedRaycastBuildIdentity | undefined { return this.readIdentity(this.options.candidateDir, this.expectedSha256) }

  status(): TrustedRaycastDiskTrustState {
    const trust = readTrustFile(this.options.stateFile)
    const journal = this.readJournal()
    const current = this.readIdentity(this.currentDir(), this.expectedSha256) ?? this.readExact(this.currentDir(), trust.approvedIdentity)
    const currentApproved = current !== undefined && (sameIdentity(current, trust.approvedIdentity) || (trust.approvedIdentity === undefined && current.artifactSha256 === trust.approvedSha256))
    const previous = this.readExact(this.previousDir(), trust.previousIdentity)
    const stage = (() => { try { const parsed = JSON.parse(readTrustedRaycastFile(join(this.stageDir(), 'stage.json'), 4096).toString('utf8')) as Record<string, unknown>; return typeof parsed.digest === 'string' && SHA256_PATTERN.test(parsed.digest) && typeof parsed.previewed === 'boolean' ? { digest: parsed.digest, previewed: parsed.previewed } : { digest: '', previewed: false } } catch { return { digest: '', previewed: false } } })()
    const candidate = this.candidateIdentity()
    const currentPresent = existsSync(this.currentDir())
    let recovery: TrustedRaycastTrustRecovery = ''
    if (journal !== undefined || !currentApproved) {
      if (journal !== undefined || previous !== undefined || currentPresent || trust.installedSha256 !== '') recovery = journal !== undefined || previous !== undefined ? 'interrupted-rotation' : 'invalid-install'
    }
    const value: TrustedRaycastDiskTrustState = Object.freeze({
      candidateAvailable: candidate !== undefined,
      candidateDigest: candidate?.artifactSha256 ?? '',
      digest: current?.artifactSha256 ?? '',
      digestApproved: currentApproved,
      enabled: trust.enabled,
      hasPrevious: previous !== undefined,
      installed: currentApproved && journal === undefined,
      previewed: stage.previewed && stage.digest === this.expectedSha256,
      recovery,
      staged: stage.digest === this.expectedSha256 && this.readIdentity(this.stageDir(), this.expectedSha256) !== undefined,
    })
    return value
  }

  stage(): TrustedRaycastDiskTrustState {
    const candidate = this.candidateIdentity()
    if (candidate === undefined) throw new Error('Reviewed Translate candidate fails its digest or identity check')
    this.ensureInstallRoot()
    rmSync(this.stageTmpDir(), { recursive: true, force: true }); mkdirSync(this.stageTmpDir(), { recursive: true })
    try {
      for (const file of INSTALL_FILES) writeFileSync(join(this.stageTmpDir(), file), readTrustedRaycastFile(join(this.options.candidateDir, file)))
      rmSync(this.stageDir(), { recursive: true, force: true }); renameSync(this.stageTmpDir(), this.stageDir())
      writeAtomic(join(this.stageDir(), 'stage.json'), Buffer.from(JSON.stringify({ digest: candidate.artifactSha256, previewed: false })))
      if (this.readIdentity(this.stageDir(), this.expectedSha256) === undefined) throw new Error('Staged Translate candidate failed its isolated digest check')
      return this.status()
    } catch (error) { rmSync(this.stageTmpDir(), { recursive: true, force: true }); throw error }
  }

  async preview(): Promise<TrustedRaycastDiskTrustState> {
    const status = this.status()
    if (!status.staged) throw new Error('No pinned Translate candidate is staged')
    const failure = await (this.options.preview ? this.options.preview(this.stageDir()) : Promise.resolve('')).catch(error => error instanceof Error ? error.message : 'Translate preview failed')
    if (failure !== '') throw new Error(failure.slice(0, 512))
    writeAtomic(join(this.stageDir(), 'stage.json'), Buffer.from(JSON.stringify({ digest: this.expectedSha256, previewed: true })))
    return this.status()
  }

  apply(enabledOverride?: boolean): TrustedRaycastDiskTrustState {
    const status = this.status()
    if (!status.staged) throw new Error('No pinned Translate candidate is staged')
    if (!status.previewed) throw new Error('The staged Translate candidate has not passed its isolated preview')
    const candidate = this.readIdentity(this.stageDir(), this.expectedSha256)
    if (candidate === undefined) throw new Error('Staged Translate candidate failed its digest check')
    const trust = readTrustFile(this.options.stateFile)
    const previous = this.readIdentity(this.currentDir(), trust.approvedSha256 || this.expectedSha256)
    writeAtomic(this.journalPath(), Buffer.from(JSON.stringify({ candidate, ...(previous === undefined ? {} : { previous }) })))
    try {
      this.ensureInstallRoot()
      rmSync(this.previousDir(), { recursive: true, force: true })
      if (existsSync(this.currentDir())) renameSync(this.currentDir(), this.previousDir())
      renameSync(this.stageDir(), this.currentDir())
      writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled: enabledOverride ?? trust.enabled, approvedSha256: candidate.artifactSha256, installedSha256: candidate.artifactSha256, approvedIdentity: candidate, ...(previous === undefined ? {} : { previousApprovedSha256: previous.artifactSha256, previousIdentity: previous }) })))
      if (this.readExact(this.currentDir(), candidate) === undefined) throw new Error('Applied Translate candidate failed its digest check')
      rmSync(this.journalPath(), { force: true })
    } catch (error) { throw error }
    return this.status()
  }

  /** A build-pinned reviewed bundle is ready on first launch; later user disablement remains authoritative. */
  async installBundledDefault(): Promise<TrustedRaycastDiskTrustState> {
    const current = this.status()
    let decided = false
    try { lstatSync(this.options.stateFile); decided = true } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (decided || !current.candidateAvailable || current.recovery !== '') return current
    this.stage()
    await this.preview()
    return this.apply(true)
  }

  private setEnabled(enabled: boolean): TrustedRaycastDiskTrustState {
    const trust = readTrustFile(this.options.stateFile)
    writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled, approvedSha256: trust.approvedSha256, installedSha256: trust.installedSha256, ...(trust.approvedIdentity === undefined ? {} : { approvedIdentity: trust.approvedIdentity }), ...(trust.previousIdentity === undefined ? {} : { previousApprovedSha256: trust.previousApprovedSha256, previousIdentity: trust.previousIdentity }) })))
    return this.status()
  }
  enable(): TrustedRaycastDiskTrustState { return this.setEnabled(true) }
  disable(): TrustedRaycastDiskTrustState { return this.setEnabled(false) }

  remove(): TrustedRaycastDiskTrustState {
    for (const dir of [this.stageTmpDir(), this.stageDir(), this.currentDir(), this.previousDir()]) rmSync(dir, { recursive: true, force: true })
    rmSync(this.journalPath(), { force: true })
    const trust = readTrustFile(this.options.stateFile)
    writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled: trust.enabled, approvedSha256: trust.approvedSha256, installedSha256: '' })))
    return this.status()
  }

  recover(): TrustedRaycastDiskTrustState {
    const healthy = this.status()
    if (healthy.recovery === '') return healthy
    const trust = readTrustFile(this.options.stateFile)
    const journal = this.readJournal()
    const previous = this.readExact(this.previousDir(), journal?.previous ?? trust.previousIdentity)
    const currentCandidate = journal === undefined ? undefined : this.readExact(this.currentDir(), journal.candidate)
    const journalPrevious = journal?.previous
    const currentPrevious = journalPrevious === undefined ? undefined : this.readExact(this.currentDir(), journalPrevious)
    if (journalPrevious !== undefined && currentPrevious !== undefined && trust.approvedSha256 === journalPrevious.artifactSha256 && (sameIdentity(trust.approvedIdentity, journalPrevious) || trust.approvedIdentity === undefined)) {
      rmSync(this.journalPath(), { force: true }); return this.status()
    }
    if (journal !== undefined && currentCandidate !== undefined && trust.approvedSha256 === journal.candidate.artifactSha256 && (sameIdentity(trust.approvedIdentity, journal.candidate) || trust.approvedIdentity === undefined)) {
      rmSync(this.journalPath(), { force: true }); return this.status()
    }
    if (previous !== undefined) {
      rmSync(this.currentDir(), { recursive: true, force: true }); renameSync(this.previousDir(), this.currentDir())
      writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled: trust.enabled, approvedSha256: previous.artifactSha256, installedSha256: previous.artifactSha256, approvedIdentity: previous })))
      rmSync(this.journalPath(), { force: true }); return this.status()
    }
    rmSync(this.currentDir(), { recursive: true, force: true }); rmSync(this.stageTmpDir(), { recursive: true, force: true }); rmSync(this.journalPath(), { force: true })
    writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled: trust.enabled, approvedSha256: trust.approvedSha256, installedSha256: '' })))
    return this.status()
  }

  runtimeDir(): string | undefined {
    const status = this.status()
    return status.installed && status.digestApproved ? this.currentDir() : undefined
  }
}
