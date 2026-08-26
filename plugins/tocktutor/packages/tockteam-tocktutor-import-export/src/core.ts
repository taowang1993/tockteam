import { createHash } from 'node:crypto'
import { isPassiveBackupPath } from 'tockbot-note-runtime'

export const PLAN_SCHEMA_VERSION = 1 as const
export const MAX_PLAN_ITEMS = 5_000
export const MAX_PLAN_BYTES = 500 * 1024 * 1024
export const MAX_PLAN_WARNINGS = 100
export const MAX_PLAN_SKIPPED = 1_000
export const MAX_BROWSER_LABEL_BYTES = 512
export const MAX_BROWSER_PLAN_BYTES = 4 * 1024 * 1024
export const MAX_RELATIVE_PATH_BYTES = 4_096

export type ImportFormat =
  | 'apple-journal'
  | 'bear-backup'
  | 'csv'
  | 'evernote'
  | 'google-keep'
  | 'html'
  | 'markdown-folder'
  | 'markdown-zip'
  | 'restore-backup'
  | 'roam-research'
  | 'textbundle'
  | 'vault-backup'

export type ImportExportErrorCode =
  | 'aborted'
  | 'destination-collision'
  | 'expired'
  | 'invalid-archive'
  | 'invalid-manifest'
  | 'invalid-path'
  | 'invalid-plan'
  | 'limit-exceeded'
  | 'not-found'
  | 'replayed'
  | 'stale-source'
  | 'stale-vault'
  | 'unsupported-format'
  | 'unsupported-type'

const ERROR_MESSAGES: Record<ImportExportErrorCode, string> = {
  aborted: 'The operation was cancelled.',
  'destination-collision': 'Two planned outputs resolve to the same destination.',
  expired: 'The reviewed plan expired.',
  'invalid-archive': 'The selected archive is invalid.',
  'invalid-manifest': 'The backup manifest is invalid.',
  'invalid-path': 'A path is not a safe relative path.',
  'invalid-plan': 'The reviewed plan is invalid.',
  'limit-exceeded': 'An operation limit was exceeded.',
  'not-found': 'The reviewed operation was not found.',
  replayed: 'The reviewed plan was already used.',
  'stale-source': 'The selected source changed.',
  'stale-vault': 'The active vault changed.',
  'unsupported-format': 'The selected format is not supported.',
  'unsupported-type': 'The selected entry type is not supported.',
}

export class ImportExportError extends Error {
  readonly code: ImportExportErrorCode

  constructor(code: ImportExportErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = 'ImportExportError'
    this.code = code
  }
}

export function normalizeAbort<Result>(promise: Promise<Result>, signal?: AbortSignal): Promise<Result> {
  return promise.catch((error: unknown) => {
    if (signal?.aborted === true
      || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
      throw new ImportExportError('aborted')
    }
    throw error
  })
}

export interface VaultBinding {
  generation: number
  id: string
}

export interface SourceBinding {
  digest: string
  fingerprint: string
  format: ImportFormat
  label: string
  size: number
}

export interface PlannedFile {
  bytes: Uint8Array
  destination: string
  kind: 'attachment' | 'document' | 'passive'
  sourceKey: string
}

export interface SkippedEntry {
  label: string
  reason: string
}

export interface PlanItemSummary {
  destination: string
  digest: string
  id: string
  kind: PlannedFile['kind']
  size: number
}

export interface ReviewedPlanSummary {
  collisionPolicy: 'preserve-existing'
  createdAt: number
  expiresAt: number
  items: PlanItemSummary[]
  operationId: string
  planDigest: string
  schemaVersion: typeof PLAN_SCHEMA_VERSION
  skipped: SkippedEntry[]
  source: SourceBinding
  totalBytes: number
  vault: VaultBinding
  warnings: string[]
}

export interface ReviewedPlan {
  files: PlannedFile[]
  summary: ReviewedPlanSummary
  token: string
}

export interface CreateReviewedPlanInput {
  createdAt: number
  expiresAt: number
  files: PlannedFile[]
  operationId: string
  skipped: SkippedEntry[]
  source: SourceBinding
  token: string
  vault: VaultBinding
  warnings: string[]
}

export function sha256(bytes: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function boundedInteger(value: number, maximum = Number.MAX_SAFE_INTEGER): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum && !Object.is(value, -0)
}

function boundedText(value: string, maximum = MAX_BROWSER_LABEL_BYTES): boolean {
  return value.length > 0
    && !value.includes('\0')
    && Buffer.byteLength(value, 'utf8') <= maximum
}

export function normalizeRelativePath(value: string): string {
  if (!boundedText(value, MAX_RELATIVE_PATH_BYTES)
    || value.startsWith('/')
    || value.startsWith('\\')
    || /^[A-Za-z]:/u.test(value)
    || value.includes('\\')
    || value.includes('//')) throw new ImportExportError('invalid-path')
  const parts = value.split('/')
  if (parts.some(part => part === ''
    || part === '.'
    || part === '..'
    || part.startsWith('.')
    || part.trim() !== part
    || /[:*?"<>|\u0000-\u001f\u007f]/u.test(part))) {
    throw new ImportExportError('invalid-path')
  }
  return parts.map(part => part.normalize('NFC')).join('/')
}

function normalizePlannedPath(value: string, kind: PlannedFile['kind']): string {
  if (kind !== 'passive') return normalizeRelativePath(value)
  if (!boundedText(value, MAX_RELATIVE_PATH_BYTES) || !isPassiveBackupPath(value)) {
    throw new ImportExportError('invalid-path')
  }
  return value
}

export function destinationAliasKey(destination: string): string {
  const normalized = isPassiveBackupPath(destination) ? destination : normalizeRelativePath(destination)
  return normalized.normalize('NFKC').toLocaleLowerCase('en-US')
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    )
  }
  return value
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stable(value))
}

function validateBinding(input: CreateReviewedPlanInput): void {
  if (!boundedText(input.operationId)
    || !boundedText(input.token)
    || !boundedInteger(input.createdAt)
    || !boundedInteger(input.expiresAt)
    || input.expiresAt <= input.createdAt
    || !boundedText(input.vault.id)
    || !boundedInteger(input.vault.generation)
    || !boundedText(input.source.label)
    || !boundedText(input.source.fingerprint, 4_096)
    || !/^sha256:[0-9a-f]{64}$/u.test(input.source.digest)
    || !boundedInteger(input.source.size, MAX_PLAN_BYTES)) {
    throw new ImportExportError('invalid-plan')
  }
  if (input.files.length === 0 || input.files.length > MAX_PLAN_ITEMS
    || input.warnings.length > MAX_PLAN_WARNINGS
    || input.skipped.length > MAX_PLAN_SKIPPED) {
    throw new ImportExportError('limit-exceeded')
  }
}

export function createReviewedPlan(input: CreateReviewedPlanInput): ReviewedPlan {
  validateBinding(input)
  const aliases = new Set<string>()
  let browserPlanBytes = 0
  let totalBytes = 0
  const files = input.files.map(file => {
    const destination = normalizePlannedPath(file.destination, file.kind)
    const alias = destinationAliasKey(destination)
    if (aliases.has(alias)) throw new ImportExportError('destination-collision')
    aliases.add(alias)
    browserPlanBytes += Buffer.byteLength(destination, 'utf8')
    if (browserPlanBytes > MAX_BROWSER_PLAN_BYTES) throw new ImportExportError('limit-exceeded')
    if (!(file.bytes instanceof Uint8Array) || !boundedText(file.sourceKey, MAX_RELATIVE_PATH_BYTES * 2)) {
      throw new ImportExportError('invalid-plan')
    }
    totalBytes += file.bytes.byteLength
    if (totalBytes > MAX_PLAN_BYTES) throw new ImportExportError('limit-exceeded')
    return { ...file, bytes: new Uint8Array(file.bytes), destination }
  }).sort((left, right) => left.destination.localeCompare(right.destination))

  const items = files.map(file => {
    const digest = sha256(file.bytes)
    return {
      destination: file.destination,
      digest,
      id: createHash('sha256')
        .update(`tockbot-import-item\0${file.destination}\0${digest}`, 'utf8')
        .digest('hex')
        .slice(0, 24),
      kind: file.kind,
      size: file.bytes.byteLength,
    }
  })
  const skipped = input.skipped.map(entry => {
    if (!boundedText(entry.label) || !boundedText(entry.reason)) {
      throw new ImportExportError('invalid-plan')
    }
    return { ...entry }
  }).sort((left, right) => left.label.localeCompare(right.label) || left.reason.localeCompare(right.reason))
  const warnings = [...input.warnings]
  if (warnings.some(warning => !boundedText(warning, 2_048))) throw new ImportExportError('invalid-plan')

  const canonical = {
    collisionPolicy: 'preserve-existing',
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    items,
    operationId: input.operationId,
    schemaVersion: PLAN_SCHEMA_VERSION,
    skipped,
    source: input.source,
    totalBytes,
    vault: input.vault,
    warnings,
  } as const
  const planDigest = sha256(stableJson(canonical))
  return {
    files,
    summary: { ...canonical, planDigest },
    token: input.token,
  }
}

export function assertPlanContent(plan: ReviewedPlan): void {
  const items = plan.files.map(file => ({
    destination: file.destination,
    digest: sha256(file.bytes),
    id: createHash('sha256')
      .update(`tockbot-import-item\0${file.destination}\0${sha256(file.bytes)}`, 'utf8')
      .digest('hex')
      .slice(0, 24),
    kind: file.kind,
    size: file.bytes.byteLength,
  }))
  if (stableJson(items) !== stableJson(plan.summary.items)) throw new ImportExportError('invalid-plan')
  const { planDigest: _planDigest, ...canonical } = plan.summary
  if (sha256(stableJson(canonical)) !== plan.summary.planDigest) {
    throw new ImportExportError('invalid-plan')
  }
}
