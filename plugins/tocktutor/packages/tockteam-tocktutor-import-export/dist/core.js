import { createHash } from 'node:crypto';
import { isPassiveBackupPath } from 'tockbot-note-runtime';
export const PLAN_SCHEMA_VERSION = 1;
export const MAX_PLAN_ITEMS = 5_000;
export const MAX_PLAN_BYTES = 500 * 1024 * 1024;
export const MAX_PLAN_WARNINGS = 100;
export const MAX_PLAN_SKIPPED = 1_000;
export const MAX_BROWSER_LABEL_BYTES = 512;
export const MAX_BROWSER_PLAN_BYTES = 4 * 1024 * 1024;
export const MAX_RELATIVE_PATH_BYTES = 4_096;
const ERROR_MESSAGES = {
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
};
export class ImportExportError extends Error {
    code;
    constructor(code) {
        super(ERROR_MESSAGES[code]);
        this.name = 'ImportExportError';
        this.code = code;
    }
}
export function normalizeAbort(promise, signal) {
    return promise.catch((error) => {
        if (signal?.aborted === true
            || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
            throw new ImportExportError('aborted');
        }
        throw error;
    });
}
export function sha256(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function boundedInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum && !Object.is(value, -0);
}
function boundedText(value, maximum = MAX_BROWSER_LABEL_BYTES) {
    return value.length > 0
        && !value.includes('\0')
        && Buffer.byteLength(value, 'utf8') <= maximum;
}
export function normalizeRelativePath(value) {
    if (!boundedText(value, MAX_RELATIVE_PATH_BYTES)
        || value.startsWith('/')
        || value.startsWith('\\')
        || /^[A-Za-z]:/u.test(value)
        || value.includes('\\')
        || value.includes('//'))
        throw new ImportExportError('invalid-path');
    const parts = value.split('/');
    if (parts.some(part => part === ''
        || part === '.'
        || part === '..'
        || part.startsWith('.')
        || part.trim() !== part
        || /[:*?"<>|\u0000-\u001f\u007f]/u.test(part))) {
        throw new ImportExportError('invalid-path');
    }
    return parts.map(part => part.normalize('NFC')).join('/');
}
function normalizePlannedPath(value, kind) {
    if (kind !== 'passive')
        return normalizeRelativePath(value);
    if (!boundedText(value, MAX_RELATIVE_PATH_BYTES) || !isPassiveBackupPath(value)) {
        throw new ImportExportError('invalid-path');
    }
    return value;
}
export function destinationAliasKey(destination) {
    const normalized = isPassiveBackupPath(destination) ? destination : normalizeRelativePath(destination);
    return normalized.normalize('NFKC').toLocaleLowerCase('en-US');
}
function stable(value) {
    if (Array.isArray(value))
        return value.map(stable);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => comparePortableText(left, right))
            .map(([key, item]) => [key, stable(item)]));
    }
    return value;
}
export function comparePortableText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
export function stableJson(value) {
    return JSON.stringify(stable(value));
}
function validateBinding(input) {
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
        throw new ImportExportError('invalid-plan');
    }
    if (input.files.length === 0 || input.files.length > MAX_PLAN_ITEMS
        || input.warnings.length > MAX_PLAN_WARNINGS
        || input.skipped.length > MAX_PLAN_SKIPPED) {
        throw new ImportExportError('limit-exceeded');
    }
}
export function createReviewedPlan(input) {
    validateBinding(input);
    const aliases = new Set();
    let browserPlanBytes = 0;
    let totalBytes = 0;
    const files = input.files.map(file => {
        const destination = normalizePlannedPath(file.destination, file.kind);
        const alias = destinationAliasKey(destination);
        if (aliases.has(alias))
            throw new ImportExportError('destination-collision');
        aliases.add(alias);
        browserPlanBytes += Buffer.byteLength(destination, 'utf8');
        if (browserPlanBytes > MAX_BROWSER_PLAN_BYTES)
            throw new ImportExportError('limit-exceeded');
        if (!(file.bytes instanceof Uint8Array) || !boundedText(file.sourceKey, MAX_RELATIVE_PATH_BYTES * 2)) {
            throw new ImportExportError('invalid-plan');
        }
        totalBytes += file.bytes.byteLength;
        if (totalBytes > MAX_PLAN_BYTES)
            throw new ImportExportError('limit-exceeded');
        return { ...file, bytes: new Uint8Array(file.bytes), destination };
    }).sort((left, right) => comparePortableText(left.destination, right.destination));
    const items = files.map(file => {
        const digest = sha256(file.bytes);
        return {
            destination: file.destination,
            digest,
            id: createHash('sha256')
                .update(`tockbot-import-item\0${file.destination}\0${digest}`, 'utf8')
                .digest('hex')
                .slice(0, 24),
            kind: file.kind,
            size: file.bytes.byteLength,
        };
    });
    const skipped = input.skipped.map(entry => {
        if (!boundedText(entry.label) || !boundedText(entry.reason)) {
            throw new ImportExportError('invalid-plan');
        }
        return { ...entry };
    }).sort((left, right) => comparePortableText(left.label, right.label) || comparePortableText(left.reason, right.reason));
    const warnings = [...input.warnings];
    if (warnings.some(warning => !boundedText(warning, 2_048)))
        throw new ImportExportError('invalid-plan');
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
    };
    const planDigest = sha256(stableJson(canonical));
    return {
        files,
        summary: { ...canonical, planDigest },
        token: input.token,
    };
}
export function assertPlanContent(plan) {
    const items = plan.files.map(file => ({
        destination: file.destination,
        digest: sha256(file.bytes),
        id: createHash('sha256')
            .update(`tockbot-import-item\0${file.destination}\0${sha256(file.bytes)}`, 'utf8')
            .digest('hex')
            .slice(0, 24),
        kind: file.kind,
        size: file.bytes.byteLength,
    }));
    if (stableJson(items) !== stableJson(plan.summary.items))
        throw new ImportExportError('invalid-plan');
    const { planDigest: _planDigest, ...canonical } = plan.summary;
    if (sha256(stableJson(canonical)) !== plan.summary.planDigest) {
        throw new ImportExportError('invalid-plan');
    }
}
//# sourceMappingURL=core.js.map