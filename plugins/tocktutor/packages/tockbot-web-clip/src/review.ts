import { createHash, randomUUID } from 'node:crypto'
import { normalizePublicHttpUrl } from './fetch.ts'

export const MAX_PENDING_CLIP_REVIEWS = 16
export const MAX_CLIP_CONTENT_CHARS = 200_000
export const MAX_CLIP_MARKDOWN_CHARS = 210_000
export const MAX_CLIP_MARKDOWN_BYTES = 256 * 1024
export const MAX_CLIP_DESTINATION_CHARS = 1024
const MAX_CLIP_TITLE_CHARS = 200
const MAX_VAULT_ID_CHARS = 256
const MAX_REVIEW_ID_CHARS = 128
const DEFAULT_REVIEW_TTL_MS = 5 * 60_000
const MAX_REVIEW_TTL_MS = 15 * 60_000

export type ClipReviewErrorCode = 'capacity' | 'expired' | 'input' | 'mismatch' | 'missing'

export class ClipReviewError extends Error {
  readonly code: ClipReviewErrorCode

  constructor(code: ClipReviewErrorCode, message: string) {
    super(message)
    this.name = 'ClipReviewError'
    this.code = code
  }
}

export interface ClipVaultReference {
  generation: number
  id: string
}

export interface ClipPreviewInput {
  capturedAt: Date
  content: string
  destination?: string
  sourceUrl: string
  title: string
  vault: ClipVaultReference
}

export interface ClipTargetIdentity {
  state: 'absent'
}

export interface ClipPreview {
  contentDigest: string
  destination: string
  expiresAt: number
  markdown: string
  permission: 'user-approval-required'
  reviewId: string
  sourceUrl: string
  target: Readonly<ClipTargetIdentity>
  title: string
  vault: Readonly<ClipVaultReference>
}

export interface ClipApproval {
  contentDigest: string
  destination: string
  expiresAt: number
  permission: 'user-approved'
  reviewId: string
  sourceUrl: string
  target: ClipTargetIdentity
  vault: ClipVaultReference
}

export interface ConsumedClipCreate {
  content: string
  contentDigest: string
  expectedVault: Readonly<ClipVaultReference>
  path: string
  sourceUrl: string
  target: Readonly<ClipTargetIdentity>
}

export interface ClipReviewStoreOptions {
  createId?: () => string
  maxPending?: number
  now?: () => number
  ttlMs?: number
}

function inputError(message: string): never {
  throw new ClipReviewError('input', message)
}

function normalizedTitle(value: string): string {
  if (typeof value !== 'string' || value.length > MAX_CLIP_TITLE_CHARS) inputError('Clip title must be text')
  const title = value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (!title || title.length > MAX_CLIP_TITLE_CHARS) inputError('Clip title is invalid')
  return title
}

function normalizedContent(value: string): string {
  if (typeof value !== 'string' || value.length > MAX_CLIP_CONTENT_CHARS) inputError('Clip content must be text')
  const content = value.trim()
  if (!content || content.length > MAX_CLIP_CONTENT_CHARS) inputError('Clip content is invalid')
  return content
}

function normalizedSourceUrl(value: string): string {
  try {
    return normalizePublicHttpUrl(value)
  } catch {
    return inputError('Clip source must be a credential-free HTTP(S) URL')
  }
}

function normalizedVault(value: ClipVaultReference): Readonly<ClipVaultReference> {
  if (typeof value !== 'object'
    || value === null
    || typeof value.id !== 'string'
    || !value.id
    || value.id.length > MAX_VAULT_ID_CHARS
    || /[\u0000-\u001f\u007f]/u.test(value.id)
    || !Number.isSafeInteger(value.generation)
    || value.generation < 0) inputError('Clip vault reference is invalid')
  return Object.freeze({ generation: value.generation, id: value.id })
}

export function normalizeClipDestination(value: string): string {
  if (typeof value !== 'string') inputError('Clip destination must be text')
  const trimmed = value.trim()
  if (!trimmed
    || trimmed.length > MAX_CLIP_DESTINATION_CHARS
    || trimmed.startsWith('/')
    || trimmed.startsWith('\\')
    || /^[A-Za-z]:/u.test(trimmed)) inputError('Clip destination must be vault-relative')
  const parts = trimmed.split(/[\\/]+/u)
  if (parts.length === 0 || parts.some(part => (
    !part
    || part !== part.trim()
    || part === '.'
    || part === '..'
    || part.length > 255
    || /[:*?"<>|\u0000-\u001f\u007f]/u.test(part)
  ))) inputError('Clip destination is invalid')
  const normalized = parts.join('/')
  if (!/\.(?:md|markdown)$/iu.test(normalized)) inputError('Clip destination must be Markdown')
  return normalized
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64) || 'clip'
}

function defaultDestination(title: string, capturedAt: Date): string {
  return `${capturedAt.toISOString().slice(0, 10)}-${slug(title)}.md`
}

export function buildClipMarkdown(input: {
  capturedAt: Date
  content: string
  sourceUrl: string
  title: string
}): string {
  const title = normalizedTitle(input.title)
  const content = normalizedContent(input.content)
  const sourceUrl = normalizedSourceUrl(input.sourceUrl)
  if (!(input.capturedAt instanceof Date) || Number.isNaN(input.capturedAt.getTime())) {
    inputError('Clip capture time is invalid')
  }
  const markdown = [
    '---',
    `source: ${sourceUrl}`,
    `captured: ${input.capturedAt.toISOString()}`,
    'kind: web-clip',
    '---',
    '',
    `# ${title}`,
    '',
    `Source: [Source](<${sourceUrl}>)`,
    '',
    content,
    '',
  ].join('\n')
  if (markdown.length > MAX_CLIP_MARKDOWN_CHARS
    || Buffer.byteLength(markdown, 'utf8') > MAX_CLIP_MARKDOWN_BYTES) inputError('Clip Markdown is too large')
  return markdown
}

function sameVault(left: ClipVaultReference, right: ClipVaultReference): boolean {
  return left.id === right.id && left.generation === right.generation
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

const absentTarget: Readonly<ClipTargetIdentity> = Object.freeze({ state: 'absent' })

export class ClipReviewStore {
  private readonly createId: () => string
  private readonly maxPending: number
  private readonly now: () => number
  private readonly pending = new Map<string, Readonly<ClipPreview>>()
  private readonly ttlMs: number

  constructor(options: ClipReviewStoreOptions = {}) {
    this.createId = options.createId ?? randomUUID
    this.maxPending = options.maxPending ?? MAX_PENDING_CLIP_REVIEWS
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? DEFAULT_REVIEW_TTL_MS
    if (!Number.isSafeInteger(this.maxPending) || this.maxPending < 1 || this.maxPending > 64) {
      inputError('Pending clip review limit is invalid')
    }
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 1000 || this.ttlMs > MAX_REVIEW_TTL_MS) {
      inputError('Clip review lifetime is invalid')
    }
  }

  private purgeExpired(now: number): void {
    for (const [id, value] of this.pending) {
      if (value.expiresAt <= now) this.pending.delete(id)
    }
  }

  create(input: ClipPreviewInput): ClipPreview {
    const now = this.now()
    if (!Number.isSafeInteger(now) || now < 0) inputError('Clip review clock is invalid')
    this.purgeExpired(now)
    if (this.pending.size >= this.maxPending) {
      throw new ClipReviewError('capacity', 'Too many clip reviews are awaiting approval')
    }
    const title = normalizedTitle(input.title)
    const sourceUrl = normalizedSourceUrl(input.sourceUrl)
    const vault = normalizedVault(input.vault)
    if (!(input.capturedAt instanceof Date) || Number.isNaN(input.capturedAt.getTime())) {
      inputError('Clip capture time is invalid')
    }
    const markdown = buildClipMarkdown({
      capturedAt: input.capturedAt,
      content: input.content,
      sourceUrl,
      title,
    })
    const destination = normalizeClipDestination(
      input.destination ?? defaultDestination(title, input.capturedAt),
    )
    const reviewId = this.createId()
    if (typeof reviewId !== 'string'
      || !reviewId
      || reviewId.length > MAX_REVIEW_ID_CHARS
      || /[\u0000-\u001f\u007f]/u.test(reviewId)
      || this.pending.has(reviewId)) inputError('Clip review identity is invalid')
    const value: Readonly<ClipPreview> = Object.freeze({
      contentDigest: digest(markdown),
      destination,
      expiresAt: now + this.ttlMs,
      markdown,
      permission: 'user-approval-required',
      reviewId,
      sourceUrl,
      target: absentTarget,
      title,
      vault,
    })
    this.pending.set(reviewId, value)
    return value
  }

  consume(approval: ClipApproval, currentVault: ClipVaultReference): ConsumedClipCreate {
    const value = typeof approval === 'object' && approval !== null
      ? this.pending.get(approval.reviewId)
      : undefined
    if (!value) throw new ClipReviewError('missing', 'Clip review is missing or already used')
    this.pending.delete(value.reviewId)
    if (value.expiresAt <= this.now()) throw new ClipReviewError('expired', 'Clip review expired')
    let activeVault: Readonly<ClipVaultReference>
    let approvedVault: Readonly<ClipVaultReference>
    try {
      activeVault = normalizedVault(currentVault)
      approvedVault = normalizedVault(approval.vault)
    } catch {
      throw new ClipReviewError('mismatch', 'Clip approval no longer matches the active vault')
    }
    if (approval.reviewId !== value.reviewId
      || approval.sourceUrl !== value.sourceUrl
      || approval.destination !== value.destination
      || approval.contentDigest !== value.contentDigest
      || approval.expiresAt !== value.expiresAt
      || approval.permission !== 'user-approved'
      || approval.target?.state !== value.target.state
      || !sameVault(approvedVault, value.vault)
      || !sameVault(activeVault, value.vault)) {
      throw new ClipReviewError('mismatch', 'Clip approval does not match its reviewed preview')
    }
    return Object.freeze({
      content: value.markdown,
      contentDigest: value.contentDigest,
      expectedVault: value.vault,
      path: value.destination,
      sourceUrl: value.sourceUrl,
      target: value.target,
    })
  }

  cancel(reviewId: string): boolean {
    return typeof reviewId === 'string' && this.pending.delete(reviewId)
  }

  dispose(): void {
    this.pending.clear()
  }
}
