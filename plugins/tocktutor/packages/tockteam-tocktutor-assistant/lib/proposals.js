import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { assertSafeRelativePath, boundToolText, redactBoundaryText, } from "./context.js";
const VERSION = 1;
const MAX_CONTENT_BYTES = 1024 * 1024;
const MAX_CONTENT_CHARS = 1024 * 1024;
const MAX_PERSISTED_BYTES = 8 * 1024 * 1024;
const MAX_WARNINGS = 20;
const MAX_SKIPPED_ENTRIES = 100;
const MAX_WARNING_CHARS = 500;
const MAX_PREVIEW_CHARS = 1_000;
const MAX_REASON_CHARS = 500;
const MAX_EXPIRY_MS = 10 * 60_000;
const DEFAULT_EXPIRY_MS = 5 * 60_000;
const DEFAULT_PENDING_LIMIT = 100;
const DEFAULT_AUDIT_LIMIT = 500;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ROUTE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const ERROR_MESSAGES = {
    INVALID_PROPOSAL: 'The proposal is invalid, stale, or already used.',
    QUEUE_FULL: 'The proposal queue is full.',
    EXPIRED: 'The proposal has expired.',
    STALE_VAULT: 'The active vault changed.',
    CHILD_REPLACED: 'The assistant tool child changed.',
    PERMISSION_CHANGED: 'The write permission changed.',
    TURN_MISMATCH: 'The assistant turn changed.',
    PROVIDER_MISMATCH: 'The provider or model changed.',
    SOURCE_CHANGED: 'The proposal source changed.',
    TARGET_CHANGED: 'The proposal destination changed.',
    DIGEST_MISMATCH: 'The proposal content digest does not match.',
    CORRUPT_QUEUE: 'The persisted proposal queue is invalid.',
};
export class ProposalError extends Error {
    code;
    constructor(code) {
        super(ERROR_MESSAGES[code]);
        this.name = 'ProposalError';
        this.code = code;
    }
}
export function sha256(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
function fail(code) {
    throw new ProposalError(code);
}
function assertPlainRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        fail('CORRUPT_QUEUE');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        fail('CORRUPT_QUEUE');
}
function assertKeys(value, allowed, code) {
    const keys = new Set(allowed);
    if (Object.keys(value).some(key => !keys.has(key)))
        fail(code);
}
function assertOpaqueId(value, code = 'INVALID_PROPOSAL') {
    if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value))
        fail(code);
}
function assertEpoch(value, code = 'INVALID_PROPOSAL') {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(code);
}
function assertRoute(value, maximum, code = 'INVALID_PROPOSAL') {
    if (typeof value !== 'string' || value.length > maximum || !ROUTE_PATTERN.test(value))
        fail(code);
}
function assertGeneration(value, code = 'INVALID_PROPOSAL') {
    if (!Number.isSafeInteger(value) || value < 1)
        fail(code);
}
function assertTimestamp(value, code = 'CORRUPT_QUEUE') {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(code);
}
function assertDigest(value, code = 'INVALID_PROPOSAL') {
    if (typeof value !== 'string' || !DIGEST_PATTERN.test(value))
        fail(code);
}
function safePath(value, code) {
    if (typeof value !== 'string')
        fail(code);
    try {
        assertSafeRelativePath(value);
    }
    catch {
        fail(code);
    }
}
function expectedTarget(value, operation, code) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        fail(code);
    const target = value;
    assertKeys(target, ['exists', 'identity', 'modifiedAt'], code);
    if (typeof target.exists !== 'boolean')
        fail(code);
    if (target.identity !== undefined)
        assertOpaqueId(target.identity, code);
    if (target.modifiedAt !== undefined)
        assertTimestamp(target.modifiedAt, code);
    if (operation === 'create' && (target.exists || target.identity !== undefined || target.modifiedAt !== undefined))
        fail(code);
    if (operation === 'update' && (!target.exists || target.identity === undefined))
        fail(code);
    return {
        exists: target.exists,
        ...target.identity === undefined ? {} : { identity: target.identity },
        ...target.modifiedAt === undefined ? {} : { modifiedAt: target.modifiedAt },
    };
}
function proposalSource(value, code) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        fail(code);
    const source = value;
    assertKeys(source, ['relativePath', 'identity', 'contentDigest'], code);
    safePath(source.relativePath, code);
    assertOpaqueId(source.identity, code);
    assertDigest(source.contentDigest, code);
    return {
        relativePath: source.relativePath,
        identity: source.identity,
        contentDigest: source.contentDigest,
    };
}
function boundedList(value, maximum, parse, code) {
    if (!Array.isArray(value) || value.length > maximum)
        fail(code);
    return value.map(parse);
}
function warning(entry, code) {
    if (typeof entry !== 'string' || entry.length > MAX_WARNING_CHARS)
        fail(code);
    const redacted = boundToolText(entry, MAX_WARNING_CHARS);
    if (code === 'CORRUPT_QUEUE' && redacted !== entry)
        fail(code);
    return redacted;
}
function recordSummary(record) {
    return {
        version: VERSION,
        proposalId: record.proposalId,
        auditCorrelationId: record.auditCorrelationId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        vaultId: record.vaultId,
        vaultGeneration: record.vaultGeneration,
        destination: record.destination,
        operation: record.operation,
        ...record.source === undefined ? {} : { source: structuredClone(record.source) },
        expectedTarget: { ...record.expectedTarget },
        contentDigest: record.contentDigest,
        contentBytes: record.contentBytes,
        contentChars: record.contentChars,
        preview: boundToolText(record.content, MAX_PREVIEW_CHARS),
        childInstanceId: record.childInstanceId,
        turnId: record.turnId,
        requestId: record.requestId,
        provider: record.provider,
        model: record.model,
        writePermission: record.writePermission,
        permissionEpoch: record.permissionEpoch,
        warnings: [...record.warnings],
        skippedEntries: [...record.skippedEntries],
    };
}
function parseRecord(value) {
    assertPlainRecord(value);
    assertKeys(value, [
        'version', 'proposalId', 'token', 'auditCorrelationId', 'createdAt', 'expiresAt',
        'vaultId', 'vaultGeneration', 'destination', 'operation', 'source', 'expectedTarget',
        'content', 'contentDigest', 'contentBytes', 'contentChars', 'childInstanceId', 'turnId',
        'requestId', 'provider', 'model', 'writePermission', 'permissionEpoch', 'warnings', 'skippedEntries',
    ], 'CORRUPT_QUEUE');
    if (value.version !== VERSION)
        fail('CORRUPT_QUEUE');
    assertOpaqueId(value.proposalId, 'CORRUPT_QUEUE');
    assertOpaqueId(value.token, 'CORRUPT_QUEUE');
    assertOpaqueId(value.auditCorrelationId, 'CORRUPT_QUEUE');
    assertTimestamp(value.createdAt);
    assertTimestamp(value.expiresAt);
    if (value.expiresAt <= value.createdAt
        || value.expiresAt - value.createdAt > MAX_EXPIRY_MS)
        fail('CORRUPT_QUEUE');
    assertOpaqueId(value.vaultId, 'CORRUPT_QUEUE');
    assertGeneration(value.vaultGeneration, 'CORRUPT_QUEUE');
    safePath(value.destination, 'CORRUPT_QUEUE');
    if (value.operation !== 'create' && value.operation !== 'update')
        fail('CORRUPT_QUEUE');
    const source = proposalSource(value.source, 'CORRUPT_QUEUE');
    const target = expectedTarget(value.expectedTarget, value.operation, 'CORRUPT_QUEUE');
    if (typeof value.content !== 'string' || value.content.includes('\0'))
        fail('CORRUPT_QUEUE');
    const bytes = Buffer.byteLength(value.content, 'utf8');
    if (value.content.length > MAX_CONTENT_CHARS || bytes > MAX_CONTENT_BYTES)
        fail('CORRUPT_QUEUE');
    assertDigest(value.contentDigest, 'CORRUPT_QUEUE');
    if (sha256(value.content) !== value.contentDigest)
        fail('DIGEST_MISMATCH');
    if (value.contentBytes !== bytes || value.contentChars !== value.content.length)
        fail('DIGEST_MISMATCH');
    assertOpaqueId(value.childInstanceId, 'CORRUPT_QUEUE');
    assertOpaqueId(value.turnId, 'CORRUPT_QUEUE');
    assertOpaqueId(value.requestId, 'CORRUPT_QUEUE');
    assertRoute(value.provider, 128, 'CORRUPT_QUEUE');
    assertRoute(value.model, 256, 'CORRUPT_QUEUE');
    if (value.writePermission !== 'propose')
        fail('CORRUPT_QUEUE');
    assertEpoch(value.permissionEpoch, 'CORRUPT_QUEUE');
    const warnings = boundedList(value.warnings, MAX_WARNINGS, entry => warning(entry, 'CORRUPT_QUEUE'), 'CORRUPT_QUEUE');
    const skippedEntries = boundedList(value.skippedEntries, MAX_SKIPPED_ENTRIES, (entry) => {
        safePath(entry, 'CORRUPT_QUEUE');
        return entry;
    }, 'CORRUPT_QUEUE');
    return {
        version: VERSION,
        proposalId: value.proposalId,
        token: value.token,
        auditCorrelationId: value.auditCorrelationId,
        createdAt: value.createdAt,
        expiresAt: value.expiresAt,
        vaultId: value.vaultId,
        vaultGeneration: value.vaultGeneration,
        destination: value.destination,
        operation: value.operation,
        ...source === undefined ? {} : { source },
        expectedTarget: target,
        content: value.content,
        contentDigest: value.contentDigest,
        contentBytes: bytes,
        contentChars: value.content.length,
        childInstanceId: value.childInstanceId,
        turnId: value.turnId,
        requestId: value.requestId,
        provider: value.provider,
        model: value.model,
        writePermission: 'propose',
        permissionEpoch: value.permissionEpoch,
        warnings,
        skippedEntries,
    };
}
function approvalMismatch(record, context, now) {
    if (now >= record.expiresAt)
        return 'EXPIRED';
    if (sha256(record.content) !== record.contentDigest
        || Buffer.byteLength(record.content, 'utf8') !== record.contentBytes
        || record.content.length !== record.contentChars)
        return 'DIGEST_MISMATCH';
    if (context.vaultId !== record.vaultId || context.vaultGeneration !== record.vaultGeneration)
        return 'STALE_VAULT';
    if (context.childInstanceId !== record.childInstanceId)
        return 'CHILD_REPLACED';
    if (context.writePermission !== record.writePermission
        || context.permissionEpoch !== record.permissionEpoch)
        return 'PERMISSION_CHANGED';
    if (context.turnId !== record.turnId || context.requestId !== record.requestId)
        return 'TURN_MISMATCH';
    if (context.provider !== record.provider || context.model !== record.model)
        return 'PROVIDER_MISMATCH';
    return undefined;
}
function parseAudit(value) {
    assertPlainRecord(value);
    assertKeys(value, [
        'version', 'auditId', 'auditCorrelationId', 'proposalId', 'timestamp', 'outcome',
        'vaultId', 'vaultGeneration', 'destination', 'operation', 'source', 'expectedTarget',
        'contentDigest', 'contentBytes', 'childInstanceId', 'turnId', 'requestId', 'provider',
        'model', 'writePermission', 'permissionEpoch', 'reason',
    ], 'CORRUPT_QUEUE');
    if (value.version !== VERSION)
        fail('CORRUPT_QUEUE');
    assertOpaqueId(value.auditId, 'CORRUPT_QUEUE');
    assertOpaqueId(value.auditCorrelationId, 'CORRUPT_QUEUE');
    assertOpaqueId(value.proposalId, 'CORRUPT_QUEUE');
    assertTimestamp(value.timestamp);
    if (![
        'staged',
        'approval-consumed',
        'approval-denied',
        'approval-failed',
        'applied',
        'rejected',
    ].includes(value.outcome))
        fail('CORRUPT_QUEUE');
    assertOpaqueId(value.vaultId, 'CORRUPT_QUEUE');
    assertGeneration(value.vaultGeneration, 'CORRUPT_QUEUE');
    safePath(value.destination, 'CORRUPT_QUEUE');
    if (value.operation !== 'create' && value.operation !== 'update')
        fail('CORRUPT_QUEUE');
    const source = proposalSource(value.source, 'CORRUPT_QUEUE');
    const target = expectedTarget(value.expectedTarget, value.operation, 'CORRUPT_QUEUE');
    assertDigest(value.contentDigest, 'CORRUPT_QUEUE');
    if (!Number.isSafeInteger(value.contentBytes) || value.contentBytes < 0 || value.contentBytes > MAX_CONTENT_BYTES)
        fail('CORRUPT_QUEUE');
    assertOpaqueId(value.childInstanceId, 'CORRUPT_QUEUE');
    assertOpaqueId(value.turnId, 'CORRUPT_QUEUE');
    assertOpaqueId(value.requestId, 'CORRUPT_QUEUE');
    assertRoute(value.provider, 128, 'CORRUPT_QUEUE');
    assertRoute(value.model, 256, 'CORRUPT_QUEUE');
    if (value.writePermission !== 'propose')
        fail('CORRUPT_QUEUE');
    assertEpoch(value.permissionEpoch, 'CORRUPT_QUEUE');
    if (value.reason !== undefined && (typeof value.reason !== 'string' || value.reason.length > MAX_REASON_CHARS || redactBoundaryText(value.reason) !== value.reason))
        fail('CORRUPT_QUEUE');
    return {
        version: VERSION,
        auditId: value.auditId,
        auditCorrelationId: value.auditCorrelationId,
        proposalId: value.proposalId,
        timestamp: value.timestamp,
        outcome: value.outcome,
        vaultId: value.vaultId,
        vaultGeneration: value.vaultGeneration,
        destination: value.destination,
        operation: value.operation,
        ...source === undefined ? {} : { source },
        expectedTarget: target,
        contentDigest: value.contentDigest,
        contentBytes: value.contentBytes,
        childInstanceId: value.childInstanceId,
        turnId: value.turnId,
        requestId: value.requestId,
        provider: value.provider,
        model: value.model,
        writePermission: 'propose',
        permissionEpoch: value.permissionEpoch,
        ...value.reason === undefined ? {} : { reason: value.reason },
    };
}
export class ProposalQueue {
    clock;
    randomId;
    pendingLimit;
    auditLimit;
    proposals = new Map();
    approvals = new Map();
    audits = [];
    auditDropped = 0;
    constructor(options = {}) {
        this.clock = options.clock ?? Date.now;
        this.randomId = options.randomId ?? randomUUID;
        this.pendingLimit = options.pendingLimit ?? DEFAULT_PENDING_LIMIT;
        this.auditLimit = options.auditLimit ?? DEFAULT_AUDIT_LIMIT;
        if (!Number.isSafeInteger(this.pendingLimit) || this.pendingLimit < 1 || this.pendingLimit > 1_000)
            fail('INVALID_PROPOSAL');
        if (!Number.isSafeInteger(this.auditLimit) || this.auditLimit < 1 || this.auditLimit > 10_000)
            fail('INVALID_PROPOSAL');
    }
    stage(input) {
        this.pruneExpired();
        if (this.proposals.size >= this.pendingLimit)
            fail('QUEUE_FULL');
        assertOpaqueId(input.vaultId);
        assertGeneration(input.vaultGeneration);
        safePath(input.destination, 'INVALID_PROPOSAL');
        if (input.operation !== 'create' && input.operation !== 'update')
            fail('INVALID_PROPOSAL');
        const target = expectedTarget(input.expectedTarget, input.operation, 'INVALID_PROPOSAL');
        const source = proposalSource(input.source, 'INVALID_PROPOSAL');
        if (typeof input.content !== 'string' || input.content.includes('\0'))
            fail('INVALID_PROPOSAL');
        const contentBytes = Buffer.byteLength(input.content, 'utf8');
        if (input.content.length > MAX_CONTENT_CHARS || contentBytes > MAX_CONTENT_BYTES)
            fail('INVALID_PROPOSAL');
        assertOpaqueId(input.childInstanceId);
        assertOpaqueId(input.turnId);
        assertOpaqueId(input.requestId);
        assertRoute(input.provider, 128);
        assertRoute(input.model, 256);
        if (input.writePermission !== 'propose')
            fail('PERMISSION_CHANGED');
        assertEpoch(input.permissionEpoch);
        const expiresInMs = input.expiresInMs ?? DEFAULT_EXPIRY_MS;
        if (!Number.isSafeInteger(expiresInMs) || expiresInMs < 1 || expiresInMs > MAX_EXPIRY_MS)
            fail('INVALID_PROPOSAL');
        const warnings = boundedList(input.warnings ?? [], MAX_WARNINGS, entry => warning(entry, 'INVALID_PROPOSAL'), 'INVALID_PROPOSAL');
        const skippedEntries = boundedList(input.skippedEntries ?? [], MAX_SKIPPED_ENTRIES, (entry) => {
            safePath(entry, 'INVALID_PROPOSAL');
            return entry;
        }, 'INVALID_PROPOSAL');
        const createdAt = this.clock();
        assertTimestamp(createdAt, 'INVALID_PROPOSAL');
        const expiresAt = createdAt + expiresInMs;
        assertTimestamp(expiresAt, 'INVALID_PROPOSAL');
        const proposalId = this.nextId();
        const token = this.nextId();
        const auditCorrelationId = this.nextId();
        const record = {
            version: VERSION,
            proposalId,
            token,
            auditCorrelationId,
            createdAt,
            expiresAt,
            vaultId: input.vaultId,
            vaultGeneration: input.vaultGeneration,
            destination: input.destination,
            operation: input.operation,
            ...source === undefined ? {} : { source },
            expectedTarget: target,
            content: input.content,
            contentDigest: sha256(input.content),
            contentBytes,
            contentChars: input.content.length,
            childInstanceId: input.childInstanceId,
            turnId: input.turnId,
            requestId: input.requestId,
            provider: input.provider,
            model: input.model,
            writePermission: 'propose',
            permissionEpoch: input.permissionEpoch,
            warnings,
            skippedEntries,
        };
        this.proposals.set(token, record);
        this.appendAudit(record, 'staged');
        return recordSummary(record);
    }
    list() {
        this.pruneExpired();
        return [...this.proposals.values()].map(recordSummary);
    }
    audit() {
        return structuredClone(this.audits);
    }
    auditStatus() {
        return { entries: this.audits.length, dropped: this.auditDropped };
    }
    consumeForApproval(proposalId, context) {
        const record = this.take(proposalId);
        const mismatch = approvalMismatch(record, context, this.clock());
        if (mismatch !== undefined) {
            this.appendAudit(record, 'approval-denied', mismatch);
            fail(mismatch);
        }
        this.appendAudit(record, 'approval-consumed');
        this.approvals.set(record.proposalId, record);
        return structuredClone(record);
    }
    approvalIsFresh(candidate) {
        const record = this.approvals.get(candidate.proposalId);
        return record !== undefined
            && record.token === candidate.token
            && record.auditCorrelationId === candidate.auditCorrelationId
            && record.contentDigest === candidate.contentDigest
            && this.clock() < record.expiresAt;
    }
    recordApprovalOutcome(candidate, outcome, reason) {
        const record = this.approvals.get(candidate.proposalId);
        if (record === undefined
            || record.token !== candidate.token
            || record.auditCorrelationId !== candidate.auditCorrelationId
            || record.contentDigest !== candidate.contentDigest
            || sha256(candidate.content) !== record.contentDigest)
            fail('INVALID_PROPOSAL');
        this.approvals.delete(record.proposalId);
        this.appendAudit(record, outcome, reason);
    }
    invalidateForChild(currentInstanceId) {
        let invalidated = 0;
        for (const [token, record] of this.proposals) {
            if (currentInstanceId !== null && record.childInstanceId === currentInstanceId)
                continue;
            this.proposals.delete(token);
            this.appendAudit(record, 'approval-denied', 'CHILD_REPLACED');
            invalidated += 1;
        }
        return invalidated;
    }
    invalidateVault(current) {
        let invalidated = 0;
        for (const [token, record] of this.proposals) {
            if (current !== null
                && record.vaultId === current.id
                && record.vaultGeneration === current.generation)
                continue;
            this.proposals.delete(token);
            this.appendAudit(record, 'approval-denied', 'STALE_VAULT');
            invalidated += 1;
        }
        return invalidated;
    }
    invalidatePermission(permission, epoch) {
        if (permission !== 'read-only' && permission !== 'propose')
            fail('INVALID_PROPOSAL');
        assertEpoch(epoch);
        let invalidated = 0;
        for (const [token, record] of this.proposals) {
            if (record.writePermission === permission && record.permissionEpoch === epoch)
                continue;
            this.proposals.delete(token);
            this.appendAudit(record, 'approval-denied', 'PERMISSION_CHANGED');
            invalidated += 1;
        }
        return invalidated;
    }
    invalidateProvider(provider, model) {
        assertRoute(provider, 128);
        assertRoute(model, 256);
        let invalidated = 0;
        for (const [token, record] of this.proposals) {
            if (record.provider === provider && record.model === model)
                continue;
            this.proposals.delete(token);
            this.appendAudit(record, 'approval-denied', 'PROVIDER_MISMATCH');
            invalidated += 1;
        }
        return invalidated;
    }
    invalidateMismatched(context) {
        const now = this.clock();
        let invalidated = 0;
        for (const [token, record] of this.proposals) {
            const mismatch = approvalMismatch(record, context, now);
            if (mismatch === undefined)
                continue;
            this.proposals.delete(token);
            this.appendAudit(record, 'approval-denied', mismatch);
            invalidated += 1;
        }
        return invalidated;
    }
    async invalidateRestored(validate) {
        this.pruneExpired();
        let invalidated = 0;
        for (const [token, record] of [...this.proposals]) {
            const mismatch = await validate(recordSummary(record));
            if (mismatch === undefined || this.proposals.get(token) !== record)
                continue;
            this.proposals.delete(token);
            this.appendAudit(record, 'approval-denied', mismatch);
            invalidated += 1;
        }
        return invalidated;
    }
    reject(proposalId, reason) {
        const record = this.take(proposalId);
        const boundedReason = boundToolText(reason.slice(0, 100_000), MAX_REASON_CHARS);
        this.appendAudit(record, 'rejected', boundedReason);
        return { proposalId: record.proposalId, auditCorrelationId: record.auditCorrelationId };
    }
    serialize() {
        const serialized = JSON.stringify({
            version: VERSION,
            proposals: [...this.proposals.values()],
            audits: this.audits,
            auditDropped: this.auditDropped,
        });
        if (Buffer.byteLength(serialized, 'utf8') > MAX_PERSISTED_BYTES)
            fail('CORRUPT_QUEUE');
        return serialized;
    }
    static hydrate(serialized, options = {}) {
        if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_PERSISTED_BYTES)
            fail('CORRUPT_QUEUE');
        let parsed;
        try {
            parsed = JSON.parse(serialized);
        }
        catch {
            fail('CORRUPT_QUEUE');
        }
        assertPlainRecord(parsed);
        assertKeys(parsed, ['version', 'proposals', 'audits', 'auditDropped'], 'CORRUPT_QUEUE');
        if (parsed.version !== VERSION
            || !Array.isArray(parsed.proposals)
            || !Array.isArray(parsed.audits)
            || !Number.isSafeInteger(parsed.auditDropped)
            || parsed.auditDropped < 0)
            fail('CORRUPT_QUEUE');
        const queue = new ProposalQueue(options);
        if (parsed.proposals.length > queue.pendingLimit || parsed.audits.length > queue.auditLimit)
            fail('CORRUPT_QUEUE');
        const proposalIds = new Set();
        const hydratedAt = queue.clock();
        assertTimestamp(hydratedAt, 'CORRUPT_QUEUE');
        const maximumExpiry = hydratedAt + MAX_EXPIRY_MS;
        assertTimestamp(maximumExpiry, 'CORRUPT_QUEUE');
        for (const entry of parsed.proposals) {
            const record = parseRecord(entry);
            if (record.expiresAt > maximumExpiry)
                fail('CORRUPT_QUEUE');
            if (queue.proposals.has(record.token) || proposalIds.has(record.proposalId))
                fail('CORRUPT_QUEUE');
            proposalIds.add(record.proposalId);
            queue.proposals.set(record.token, record);
        }
        const auditIds = new Set();
        queue.auditDropped = parsed.auditDropped;
        queue.audits = parsed.audits.map((entry) => {
            const audit = parseAudit(entry);
            if (auditIds.has(audit.auditId))
                fail('CORRUPT_QUEUE');
            auditIds.add(audit.auditId);
            return audit;
        });
        return queue;
    }
    pruneExpired() {
        const now = this.clock();
        let pruned = 0;
        for (const [token, record] of this.proposals) {
            if (now < record.expiresAt)
                continue;
            this.proposals.delete(token);
            this.appendAudit(record, 'approval-denied', 'EXPIRED');
            pruned += 1;
        }
        return pruned;
    }
    take(proposalId) {
        assertOpaqueId(proposalId);
        const match = [...this.proposals.entries()].find(([, record]) => record.proposalId === proposalId);
        if (match === undefined)
            fail('INVALID_PROPOSAL');
        const [token, record] = match;
        this.proposals.delete(token);
        return record;
    }
    nextId() {
        const value = this.randomId();
        assertOpaqueId(value);
        return value;
    }
    appendAudit(record, outcome, reason) {
        const entry = {
            version: VERSION,
            auditId: this.nextId(),
            auditCorrelationId: record.auditCorrelationId,
            proposalId: record.proposalId,
            timestamp: this.clock(),
            outcome,
            vaultId: record.vaultId,
            vaultGeneration: record.vaultGeneration,
            destination: record.destination,
            operation: record.operation,
            ...record.source === undefined ? {} : { source: structuredClone(record.source) },
            expectedTarget: { ...record.expectedTarget },
            contentDigest: record.contentDigest,
            contentBytes: record.contentBytes,
            childInstanceId: record.childInstanceId,
            turnId: record.turnId,
            requestId: record.requestId,
            provider: record.provider,
            model: record.model,
            writePermission: record.writePermission,
            permissionEpoch: record.permissionEpoch,
            ...reason === undefined ? {} : { reason: boundToolText(reason, MAX_REASON_CHARS) },
        };
        this.audits.push(entry);
        if (this.audits.length > this.auditLimit) {
            const dropped = this.audits.length - this.auditLimit;
            this.audits.splice(0, dropped);
            this.auditDropped = Math.min(Number.MAX_SAFE_INTEGER, this.auditDropped + dropped);
        }
    }
}
//# sourceMappingURL=proposals.js.map