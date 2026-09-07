import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { admitTrustedRaycastArtifact, assertTrustedRaycastBuildIdentity, TRUSTED_RAYCAST_ARTIFACT_SHA256 } from './trusted-raycast-artifact-admission.ts'
import type { TrustedRaycastTrustRecovery, TrustedRaycastTrustState } from './trusted-raycast-contract.ts'

export type TrustedRaycastDiskTrustState = Omit<TrustedRaycastTrustState, 'active'>

const INSTALL_FILES = ['artifact.tar', 'child.mjs', 'resolution.mjs', 'build.json'] as const
const SHA256_PATTERN = /^[a-f0-9]{64}$/

export type TrustedRaycastTrustOptions = Readonly<{
  /** Writable install root: <root>/current, <root>/previous and transient staging live here. */
  installRoot: string
  /** Read-only reviewed candidate source shipped with the distribution. */
  candidateDir: string
  /** User-owned trust file (enabled + approved digest); preserved across install/remove. */
  stateFile: string
  expectedSha256?: string
  /** Isolated bounded boot of a staged candidate; resolves '' when ready, otherwise the failure text. */
  preview?: (stagedDir: string) => Promise<string>
}>

type TrustFile = Readonly<{ enabled: boolean; approvedSha256: string; installedSha256: string }>

const readTrustFile = (path: string): TrustFile => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid')
    const record = parsed as Record<string, unknown>
    const approved = typeof record.approvedSha256 === 'string' && SHA256_PATTERN.test(record.approvedSha256) ? record.approvedSha256 : ''
    const installed = typeof record.installedSha256 === 'string' && SHA256_PATTERN.test(record.installedSha256) ? record.installedSha256 : ''
    return Object.freeze({ enabled: record.enabled === true, approvedSha256: approved, installedSha256: installed })
  } catch { return Object.freeze({ enabled: false, approvedSha256: '', installedSha256: '' }) }
}

/** Trust files only change through a durable rename; a torn write leaves the prior file intact. */
const writeAtomic = (path: string, bytes: Buffer): void => {
  const temporary = `${path}.tmp`
  const file = openSync(temporary, 'w', 0o600)
  try { writeFileSync(file, bytes); fsyncSync(file) } finally { closeSync(file) }
  renameSync(temporary, path)
  try { const directory = openSync(join(path, '..'), 'r'); fsyncSync(directory); closeSync(directory) } catch { /* directory fsync is best effort on this platform */ }
}

/**
 * Installed != enabled; stage -> pinned candidate -> isolated preview -> explicit approve/apply.
 * The only admitted digest is the reviewed pin, so installing is itself the explicit approval.
 * No automatic upgrades and no install scripts: staging copies admitted bytes verbatim.
 */
export class TrustedRaycastTrustStore {
  private readonly options: TrustedRaycastTrustOptions
  private readonly expectedSha256: string
  private cache: { key: string; value: TrustedRaycastDiskTrustState } | undefined
  constructor(options: TrustedRaycastTrustOptions) {
    this.options = options
    this.expectedSha256 = options.expectedSha256 ?? TRUSTED_RAYCAST_ARTIFACT_SHA256
  }
  private readonly currentDir = (): string => join(this.options.installRoot, 'current')
  private readonly previousDir = (): string => join(this.options.installRoot, 'previous')
  private readonly stageDir = (): string => join(this.options.installRoot, 'stage')
  private readonly stageTmpDir = (): string => join(this.options.installRoot, 'stage.tmp')

  private statToken(paths: readonly string[]): string {
    return paths.map(path => { try { const stat = statSync(path); return `${stat.mtimeMs}:${stat.size}` } catch { return 'missing' } }).join('|')
  }

  private validateInstall(dir: string): boolean {
    try {
      const metadata: unknown = JSON.parse(readFileSync(join(dir, 'build.json'), 'utf8'))
      assertTrustedRaycastBuildIdentity(metadata, this.expectedSha256)
      admitTrustedRaycastArtifact(join(dir, 'artifact.tar'), this.expectedSha256)
      return true
    } catch { return false }
  }

  private candidateValid(): string {
    try {
      const metadata: unknown = JSON.parse(readFileSync(join(this.options.candidateDir, 'build.json'), 'utf8'))
      assertTrustedRaycastBuildIdentity(metadata, this.expectedSha256)
      admitTrustedRaycastArtifact(join(this.options.candidateDir, 'artifact.tar'), this.expectedSha256)
      return this.expectedSha256
    } catch { return '' }
  }

  private stageRecord(): Readonly<{ digest: string; previewed: boolean }> {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(this.stageDir(), 'stage.json'), 'utf8'))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid')
      const record = parsed as Record<string, unknown>
      if (!SHA256_PATTERN.test(String(record.digest)) || typeof record.previewed !== 'boolean') throw new Error('invalid')
      return Object.freeze({ digest: String(record.digest), previewed: record.previewed })
    } catch { return Object.freeze({ digest: '', previewed: false }) }
  }

  status(): TrustedRaycastDiskTrustState {
    const trust = readTrustFile(this.options.stateFile)
    const candidateDir = this.options.candidateDir
    const key = this.statToken([
      this.options.stateFile,
      ...INSTALL_FILES.map(file => join(candidateDir, file)),
      ...INSTALL_FILES.map(file => join(this.currentDir(), file)),
      ...INSTALL_FILES.map(file => join(this.previousDir(), file)),
      ...INSTALL_FILES.map(file => join(this.stageDir(), file)),
      join(this.stageDir(), 'stage.json'),
    ])
    if (this.cache?.key === key) return this.cache.value
    const currentValid = this.validateInstall(this.currentDir())
    const previousValid = this.validateInstall(this.previousDir())
    const candidateDigest = this.candidateValid()
    const stage = this.stageRecord()
    const currentPresent = existsSync(this.currentDir())
    const currentDigest = currentValid ? this.expectedSha256 : ''
    let recovery: TrustedRaycastTrustRecovery = ''
    if (!currentValid) {
      if (previousValid) recovery = 'interrupted-rotation'
      else if (currentPresent || trust.installedSha256 !== '') recovery = 'invalid-install'
    }
    const value: TrustedRaycastDiskTrustState = Object.freeze({
      candidateAvailable: candidateDigest === this.expectedSha256,
      candidateDigest,
      digest: currentDigest,
      digestApproved: trust.approvedSha256 === this.expectedSha256,
      enabled: trust.enabled,
      hasPrevious: previousValid,
      installed: currentValid,
      previewed: stage.previewed && stage.digest === this.expectedSha256,
      recovery,
      staged: stage.digest === this.expectedSha256 && this.validateInstall(this.stageDir()),
    })
    this.cache = { key, value }
    return value
  }

  /** Stage the reviewed candidate verbatim under an isolated pending directory. */
  stage(): TrustedRaycastDiskTrustState {
    this.cache = undefined
    if (this.candidateValid() === '') throw new Error('Reviewed Translate candidate fails its digest or identity check')
    rmSync(this.stageTmpDir(), { recursive: true, force: true })
    mkdirSync(this.stageTmpDir(), { recursive: true })
    for (const file of INSTALL_FILES) {
      copyFileSync(join(this.options.candidateDir, file), join(this.stageTmpDir(), file))
      try { const opened = openSync(join(this.stageTmpDir(), file), 'r'); fsyncSync(opened); closeSync(opened) } catch { /* file fsync is best effort */ }
    }
    rmSync(this.stageDir(), { recursive: true, force: true })
    renameSync(this.stageTmpDir(), this.stageDir())
    try { const directory = openSync(this.options.installRoot, 'r'); fsyncSync(directory); closeSync(directory) } catch { /* directory fsync is best effort */ }
    writeAtomic(join(this.stageDir(), 'stage.json'), Buffer.from(JSON.stringify({ digest: this.expectedSha256, previewed: false })))
    if (!this.validateInstall(this.stageDir())) throw new Error('Staged Translate candidate failed its isolated digest check')
    return this.status()
  }

  /** Isolated preview of the staged candidate; apply stays blocked until this admits it. */
  async preview(): Promise<TrustedRaycastDiskTrustState> {
    this.cache = undefined
    const status = this.status()
    if (!status.staged) throw new Error('No pinned Translate candidate is staged')
    const failure = await (this.options.preview ? this.options.preview(this.stageDir()) : Promise.resolve('')).catch(error => error instanceof Error ? error.message : 'Translate preview failed')
    if (failure !== '') throw new Error(failure.slice(0, 512))
    writeAtomic(join(this.stageDir(), 'stage.json'), Buffer.from(JSON.stringify({ digest: this.expectedSha256, previewed: true })))
    return this.status()
  }

  /** Explicit approve/apply: rotate current -> previous, staged -> current, record the approved digest. */
  apply(): TrustedRaycastDiskTrustState {
    this.cache = undefined
    const status = this.status()
    if (!status.staged) throw new Error('No pinned Translate candidate is staged')
    if (!status.previewed) throw new Error('The staged Translate candidate has not passed its isolated preview')
    // Applying a newly pinned digest IS the explicit user re-approval; nothing upgrades automatically.
    const trust = readTrustFile(this.options.stateFile)
    rmSync(this.previousDir(), { recursive: true, force: true })
    if (existsSync(this.currentDir())) renameSync(this.currentDir(), this.previousDir())
    renameSync(this.stageDir(), this.currentDir())
    try { const directory = openSync(this.options.installRoot, 'r'); fsyncSync(directory); closeSync(directory) } catch { /* directory fsync is best effort */ }
    writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled: trust.enabled, approvedSha256: this.expectedSha256, installedSha256: this.expectedSha256 })))
    if (!this.validateInstall(this.currentDir())) {
      // Never admit a load after a failed rotation: restore the previous install when it is valid.
      rmSync(this.currentDir(), { recursive: true, force: true })
      if (this.validateInstall(this.previousDir())) renameSync(this.previousDir(), this.currentDir())
      throw new Error('Applied Translate candidate failed its digest check')
    }
    return this.status()
  }

  private setEnabled(enabled: boolean): TrustedRaycastDiskTrustState {
    this.cache = undefined
    const trust = readTrustFile(this.options.stateFile)
    writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled, approvedSha256: trust.approvedSha256, installedSha256: trust.installedSha256 })))
    return this.status()
  }

  enable(): TrustedRaycastDiskTrustState { return this.setEnabled(true) }
  disable(): TrustedRaycastDiskTrustState { return this.setEnabled(false) }

  /** Remove the install (current/previous/staging) while retaining approval/enable and all user data. */
  remove(): TrustedRaycastDiskTrustState {
    this.cache = undefined
    for (const dir of [this.stageTmpDir(), this.stageDir(), this.currentDir(), this.previousDir()]) rmSync(dir, { recursive: true, force: true })
    const trust = readTrustFile(this.options.stateFile)
    writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled: trust.enabled, approvedSha256: trust.approvedSha256, installedSha256: '' })))
    return this.status()
  }

  /** Interruption recovery: roll back to the retained previous install, else clear the broken one. */
  recover(): TrustedRaycastDiskTrustState {
    this.cache = undefined
    const status = this.status()
    if (status.installed) return status
    if (this.validateInstall(this.previousDir())) {
      rmSync(this.currentDir(), { recursive: true, force: true })
      renameSync(this.previousDir(), this.currentDir())
      try { const directory = openSync(this.options.installRoot, 'r'); fsyncSync(directory); closeSync(directory) } catch { /* directory fsync is best effort */ }
      return this.status()
    }
    rmSync(this.currentDir(), { recursive: true, force: true })
    rmSync(this.stageTmpDir(), { recursive: true, force: true })
    const trust = readTrustFile(this.options.stateFile)
    writeAtomic(this.options.stateFile, Buffer.from(JSON.stringify({ enabled: trust.enabled, approvedSha256: trust.approvedSha256, installedSha256: '' })))
    return this.status()
  }

  /** The live runtime directory; undefined whenever nothing is validly installed. */
  runtimeDir(): string | undefined {
    return this.status().installed ? this.currentDir() : undefined
  }
}
