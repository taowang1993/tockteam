import { createHash, randomUUID } from 'node:crypto';
import { normalizePublicHttpUrl } from "./fetch.js";
export const MAX_PENDING_CLIP_REVIEWS = 16;
export const MAX_CLIP_CONTENT_CHARS = 200_000;
export const MAX_CLIP_MARKDOWN_CHARS = 210_000;
export const MAX_CLIP_MARKDOWN_BYTES = 256 * 1024;
export const MAX_CLIP_DESTINATION_CHARS = 1024;
const MAX_CLIP_TITLE_CHARS = 200;
const MAX_VAULT_ID_CHARS = 256;
const MAX_REVIEW_ID_CHARS = 128;
const DEFAULT_REVIEW_TTL_MS = 5 * 60_000;
const MAX_REVIEW_TTL_MS = 15 * 60_000;
export class ClipReviewError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ClipReviewError';
        this.code = code;
    }
}
function inputError(message) {
    throw new ClipReviewError('input', message);
}
function normalizedTitle(value) {
    if (typeof value !== 'string' || value.length > MAX_CLIP_TITLE_CHARS)
        inputError('Clip title must be text');
    const title = value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim();
    if (!title || title.length > MAX_CLIP_TITLE_CHARS)
        inputError('Clip title is invalid');
    return title;
}
function normalizedContent(value) {
    if (typeof value !== 'string' || value.length > MAX_CLIP_CONTENT_CHARS)
        inputError('Clip content must be text');
    const content = value.trim();
    if (!content || content.length > MAX_CLIP_CONTENT_CHARS)
        inputError('Clip content is invalid');
    return content;
}
function normalizedSourceUrl(value) {
    try {
        return normalizePublicHttpUrl(value);
    }
    catch {
        return inputError('Clip source must be a credential-free HTTP(S) URL');
    }
}
function normalizedVault(value) {
    if (typeof value !== 'object'
        || value === null
        || typeof value.id !== 'string'
        || !value.id
        || value.id.length > MAX_VAULT_ID_CHARS
        || /[\u0000-\u001f\u007f]/u.test(value.id)
        || !Number.isSafeInteger(value.generation)
        || value.generation < 0)
        inputError('Clip vault reference is invalid');
    return Object.freeze({ generation: value.generation, id: value.id });
}
export function normalizeClipDestination(value) {
    if (typeof value !== 'string')
        inputError('Clip destination must be text');
    const trimmed = value.trim();
    if (!trimmed
        || trimmed.length > MAX_CLIP_DESTINATION_CHARS
        || trimmed.startsWith('/')
        || trimmed.startsWith('\\')
        || /^[A-Za-z]:/u.test(trimmed))
        inputError('Clip destination must be vault-relative');
    const parts = trimmed.split(/[\\/]+/u);
    if (parts.length === 0 || parts.some(part => (!part
        || part !== part.trim()
        || part === '.'
        || part === '..'
        || part.length > 255
        || /[:*?"<>|\u0000-\u001f\u007f]/u.test(part))))
        inputError('Clip destination is invalid');
    const normalized = parts.join('/');
    if (!/\.(?:md|markdown)$/iu.test(normalized))
        inputError('Clip destination must be Markdown');
    return normalized;
}
function slug(value) {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, 64) || 'clip';
}
function defaultDestination(title, capturedAt) {
    return `${capturedAt.toISOString().slice(0, 10)}-${slug(title)}.md`;
}
export function buildClipMarkdown(input) {
    const title = normalizedTitle(input.title);
    const content = normalizedContent(input.content);
    const sourceUrl = normalizedSourceUrl(input.sourceUrl);
    if (!(input.capturedAt instanceof Date) || Number.isNaN(input.capturedAt.getTime())) {
        inputError('Clip capture time is invalid');
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
    ].join('\n');
    if (markdown.length > MAX_CLIP_MARKDOWN_CHARS
        || Buffer.byteLength(markdown, 'utf8') > MAX_CLIP_MARKDOWN_BYTES)
        inputError('Clip Markdown is too large');
    return markdown;
}
function sameVault(left, right) {
    return left.id === right.id && left.generation === right.generation;
}
function digest(value) {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
const absentTarget = Object.freeze({ state: 'absent' });
export class ClipReviewStore {
    createId;
    maxPending;
    now;
    pending = new Map();
    ttlMs;
    constructor(options = {}) {
        this.createId = options.createId ?? randomUUID;
        this.maxPending = options.maxPending ?? MAX_PENDING_CLIP_REVIEWS;
        this.now = options.now ?? Date.now;
        this.ttlMs = options.ttlMs ?? DEFAULT_REVIEW_TTL_MS;
        if (!Number.isSafeInteger(this.maxPending) || this.maxPending < 1 || this.maxPending > 64) {
            inputError('Pending clip review limit is invalid');
        }
        if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 1000 || this.ttlMs > MAX_REVIEW_TTL_MS) {
            inputError('Clip review lifetime is invalid');
        }
    }
    purgeExpired(now) {
        for (const [id, value] of this.pending) {
            if (value.expiresAt <= now)
                this.pending.delete(id);
        }
    }
    create(input) {
        const now = this.now();
        if (!Number.isSafeInteger(now) || now < 0)
            inputError('Clip review clock is invalid');
        this.purgeExpired(now);
        if (this.pending.size >= this.maxPending) {
            throw new ClipReviewError('capacity', 'Too many clip reviews are awaiting approval');
        }
        const title = normalizedTitle(input.title);
        const sourceUrl = normalizedSourceUrl(input.sourceUrl);
        const vault = normalizedVault(input.vault);
        if (!(input.capturedAt instanceof Date) || Number.isNaN(input.capturedAt.getTime())) {
            inputError('Clip capture time is invalid');
        }
        const markdown = buildClipMarkdown({
            capturedAt: input.capturedAt,
            content: input.content,
            sourceUrl,
            title,
        });
        const destination = normalizeClipDestination(input.destination ?? defaultDestination(title, input.capturedAt));
        const reviewId = this.createId();
        if (typeof reviewId !== 'string'
            || !reviewId
            || reviewId.length > MAX_REVIEW_ID_CHARS
            || /[\u0000-\u001f\u007f]/u.test(reviewId)
            || this.pending.has(reviewId))
            inputError('Clip review identity is invalid');
        const value = Object.freeze({
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
        });
        this.pending.set(reviewId, value);
        return value;
    }
    consume(approval, currentVault) {
        const value = typeof approval === 'object' && approval !== null
            ? this.pending.get(approval.reviewId)
            : undefined;
        if (!value)
            throw new ClipReviewError('missing', 'Clip review is missing or already used');
        this.pending.delete(value.reviewId);
        if (value.expiresAt <= this.now())
            throw new ClipReviewError('expired', 'Clip review expired');
        let activeVault;
        let approvedVault;
        try {
            activeVault = normalizedVault(currentVault);
            approvedVault = normalizedVault(approval.vault);
        }
        catch {
            throw new ClipReviewError('mismatch', 'Clip approval no longer matches the active vault');
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
            throw new ClipReviewError('mismatch', 'Clip approval does not match its reviewed preview');
        }
        return Object.freeze({
            content: value.markdown,
            contentDigest: value.contentDigest,
            expectedVault: value.vault,
            path: value.destination,
            sourceUrl: value.sourceUrl,
            target: value.target,
        });
    }
    cancel(reviewId) {
        return typeof reviewId === 'string' && this.pending.delete(reviewId);
    }
    dispose() {
        this.pending.clear();
    }
}
