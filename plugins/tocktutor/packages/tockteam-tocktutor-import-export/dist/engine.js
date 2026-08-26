import { createNativeOwnerLifetime } from '@tockteam/desktop/host';
import { planVerifiedRestore } from "./backup.js";
import { assertPlanContent, createReviewedPlan, destinationAliasKey, ImportExportError, normalizeAbort, sha256, stableJson, } from "./core.js";
import { planAppleJournal, planBear, planCsv, planEvernote, planGoogleKeep, planHtml, planHtmlZip, planRoam, planTextbundle, planTextpack, } from "./formats/converters.js";
import { isImportInspectFormat } from "./types.js";
import { MARKDOWN_MAX_ENTRIES, MARKDOWN_MAX_ENTRY_BYTES, MARKDOWN_MAX_TOTAL_BYTES, planMarkdownFolder, planMarkdownZip, } from "./formats/markdown.js";
const PLAN_LIFETIME_MS = 5 * 60 * 1_000;
const MAX_ACTIVE_OPERATIONS = 1;
const MAX_COMPLETED_OPERATIONS = 64;
const MAX_COMPLETED_EVIDENCE_BYTES = 32 * 1024 * 1024;
const SOURCE_PAGE_SIZE = 256;
const SOURCE_CHUNK_SIZE = 1024 * 1024;
const TREE_PAGE_SIZE = 1_000;
function assertVault(state, expected) {
    if (!state.active || state.id !== expected.id || state.generation !== expected.generation) {
        throw new ImportExportError('stale-vault');
    }
}
function vaultBinding(identity) {
    if (identity.vaultId === null)
        throw new ImportExportError('stale-vault');
    return { generation: identity.vaultGeneration, id: identity.vaultId };
}
function sourceLimits(format) {
    const path = { maxRelativePathBytes: 4_096 };
    switch (format) {
        case 'markdown-folder': return { ...path, maxDepth: 64, maxEntries: MARKDOWN_MAX_ENTRIES, maxEntryBytes: MARKDOWN_MAX_ENTRY_BYTES, maxTotalBytes: MARKDOWN_MAX_TOTAL_BYTES };
        case 'markdown-zip': return { ...path, maxDepth: 1, maxEntries: 1, maxEntryBytes: 50 * 1024 * 1024, maxTotalBytes: 50 * 1024 * 1024 };
        case 'csv': return { ...path, maxDepth: 1, maxEntries: 1, maxEntryBytes: 2 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 };
        case 'html': return { ...path, maxDepth: 64, maxEntries: 500, maxEntryBytes: 50 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 };
        case 'apple-journal': return { ...path, maxDepth: 64, maxEntries: 5_000, maxEntryBytes: 10 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 };
        case 'bear-backup': return { ...path, maxDepth: 1, maxEntries: 1, maxEntryBytes: 500 * 1024 * 1024, maxTotalBytes: 500 * 1024 * 1024 };
        case 'evernote': return { ...path, maxDepth: 1, maxEntries: 1, maxEntryBytes: 100 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 };
        case 'google-keep': return { ...path, maxDepth: 1, maxEntries: 1, maxEntryBytes: 200 * 1024 * 1024, maxTotalBytes: 200 * 1024 * 1024 };
        case 'roam-research': return { ...path, maxDepth: 1, maxEntries: 1, maxEntryBytes: 25 * 1024 * 1024, maxTotalBytes: 25 * 1024 * 1024 };
        case 'textbundle': return { ...path, maxDepth: 16, maxEntries: 202, maxEntryBytes: 25 * 1024 * 1024, maxTotalBytes: 25 * 1024 * 1024 };
        case 'restore-backup': return { ...path, maxDepth: 1, maxEntries: 1, maxEntryBytes: 512 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024 };
    }
}
function sourceError(error) {
    if (error instanceof ImportExportError)
        throw error;
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new ImportExportError('aborted');
    }
    if (error instanceof Error && 'code' in error) {
        const code = String(error.code);
        if (code === 'aborted')
            throw new ImportExportError('aborted');
        if (code === 'changed' || code === 'stale' || code === 'closed' || code === 'expired') {
            throw new ImportExportError('stale-source');
        }
        if (code === 'limit-exceeded')
            throw new ImportExportError('limit-exceeded');
    }
    throw new ImportExportError('invalid-plan');
}
function boundedPickerLabel(value) {
    const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 512);
    return normalized || 'Selected Source';
}
async function inspectSource(picker, request, signal) {
    const identity = request.identity;
    const limits = sourceLimits(request.format);
    const picked = await picker.pick({ identity, kind: 'source', purpose: request.format }, signal);
    signal.throwIfAborted();
    if (picked.operationId !== identity.operationId)
        throw new ImportExportError('stale-source');
    if (picked.status !== 'selected') {
        if (picked.status === 'cancelled')
            throw new ImportExportError('aborted');
        throw new ImportExportError('stale-source');
    }
    let begun;
    try {
        begun = await picker.beginSource({
            authorization: picked.authorization,
            identity,
            limits,
            purpose: request.format,
        }, signal);
        signal.throwIfAborted();
        const entries = [];
        let cursor = null;
        let scannedBytes = -1;
        let scannedEntries = -1;
        const fingerprint = begun.root.revision;
        for (;;) {
            signal.throwIfAborted();
            const page = await picker.listSource({ cursor, limit: SOURCE_PAGE_SIZE, session: begun.session }, signal);
            signal.throwIfAborted();
            if (page.truncated || page.truncationReason !== null)
                throw new ImportExportError('limit-exceeded');
            if (page.rootRevision !== fingerprint)
                throw new ImportExportError('stale-source');
            entries.push(...page.entries);
            scannedBytes = page.scannedBytes;
            scannedEntries = page.scannedEntries;
            if (entries.length > limits.maxEntries)
                throw new ImportExportError('limit-exceeded');
            if (page.complete)
                break;
            if (page.cursor === null || page.cursor === cursor)
                throw new ImportExportError('invalid-plan');
            cursor = page.cursor;
        }
        const declaredBytes = entries.reduce((total, entry) => total + (entry.kind === 'file' ? entry.size : 0), 0);
        if (entries.length !== scannedEntries || declaredBytes !== scannedBytes)
            throw new ImportExportError('invalid-plan');
        const files = [];
        const rejected = [];
        let size = 0;
        for (const entry of entries) {
            signal.throwIfAborted();
            if (entry.kind === 'rejected') {
                rejected.push({ label: boundedPickerLabel(entry.label), reason: entry.reason });
                continue;
            }
            if (entry.kind === 'directory')
                continue;
            const chunks = [];
            let offset = 0;
            while (offset < entry.size) {
                const result = await picker.readSource({
                    entryId: entry.entryId,
                    expectedRevision: entry.revision,
                    expectedSize: entry.size,
                    length: Math.min(SOURCE_CHUNK_SIZE, entry.size - offset),
                    offset,
                    session: begun.session,
                }, signal);
                signal.throwIfAborted();
                if (result.revision !== entry.revision || result.size !== entry.size
                    || result.nextOffset <= offset || result.nextOffset > entry.size
                    || result.bytes.byteLength !== result.nextOffset - offset) {
                    throw new ImportExportError('stale-source');
                }
                chunks.push(result.bytes);
                offset = result.nextOffset;
                if (result.complete !== (offset === entry.size))
                    throw new ImportExportError('stale-source');
            }
            const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), entry.size);
            size += bytes.byteLength;
            if (size > limits.maxTotalBytes)
                throw new ImportExportError('limit-exceeded');
            files.push({
                bytes: new Uint8Array(bytes),
                fingerprint: `${entry.revision}:${sha256(bytes)}`,
                path: entry.relativePath,
            });
        }
        return {
            expiresAt: begun.expiresAt,
            files,
            fingerprint,
            label: boundedPickerLabel(picked.label),
            rejected: rejected.sort((left, right) => left.label.localeCompare(right.label)),
            session: begun.session,
            size,
        };
    }
    catch (error) {
        if (begun !== undefined)
            await picker.releaseSource({ session: begun.session }).catch(() => undefined);
        return sourceError(error);
    }
}
async function existingDestinations(runtime, vault, signal) {
    assertVault(runtime.state, vault);
    const aliases = new Set();
    let cursor = null;
    let complete = false;
    for (let pages = 0; pages <= 100; pages += 1) {
        signal.throwIfAborted();
        const page = await runtime.listTree({ cursor, expectedVault: vault, limit: TREE_PAGE_SIZE }, signal);
        signal.throwIfAborted();
        if (page.generation !== vault.generation || page.truncated
            || page.truncationReason !== null || page.warnings.length > 0) {
            throw new ImportExportError('stale-vault');
        }
        for (const entry of page.entries)
            aliases.add(destinationAliasKey(entry.path));
        if (page.complete) {
            complete = true;
            break;
        }
        if (page.cursor === null || page.cursor === cursor)
            throw new ImportExportError('stale-vault');
        cursor = page.cursor;
    }
    if (!complete)
        throw new ImportExportError('limit-exceeded');
    const passive = await runtime.listPassiveBackupEntries({ expectedVault: vault }, signal);
    signal.throwIfAborted();
    if (passive.generation !== vault.generation)
        throw new ImportExportError('stale-vault');
    for (const entry of passive.entries)
        aliases.add(destinationAliasKey(entry.path));
    assertVault(runtime.state, vault);
    return aliases;
}
function onlyFile(source) {
    if (source.files.length !== 1)
        throw new ImportExportError('unsupported-type');
    return source.files[0];
}
function sourceStem(path) {
    const name = path.split('/').at(-1) ?? 'Import';
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
}
function planSource(request, source) {
    switch (request.format) {
        case 'markdown-folder': return planMarkdownFolder(source.files);
        case 'markdown-zip': return planMarkdownZip(onlyFile(source).bytes);
        case 'csv': {
            const file = onlyFile(source);
            return planCsv(file.bytes, file.path);
        }
        case 'html': {
            const file = source.files.length === 1 ? source.files[0] : undefined;
            return file !== undefined && /\.zip$/iu.test(file.path)
                ? planHtmlZip(file.bytes, sourceStem(file.path))
                : planHtml(source.files, sourceStem(file?.path ?? source.label));
        }
        case 'apple-journal': return planAppleJournal(source.files);
        case 'bear-backup': return planBear(onlyFile(source).bytes);
        case 'evernote': {
            const file = onlyFile(source);
            return planEvernote(file.bytes, file.path);
        }
        case 'google-keep': return planGoogleKeep(onlyFile(source).bytes);
        case 'roam-research': return planRoam(onlyFile(source).bytes);
        case 'textbundle': {
            const file = source.files.length === 1 ? source.files[0] : undefined;
            return file !== undefined && /\.(?:textpack|zip)$/iu.test(file.path)
                ? planTextpack(file.bytes)
                : planTextbundle(source.files);
        }
        case 'restore-backup': return planVerifiedRestore(onlyFile(source).bytes);
    }
}
function requestMatches(record, request) {
    return record.plan.token === request.reviewToken
        && record.plan.summary.operationId === request.operationId
        && record.plan.summary.planDigest === request.planDigest;
}
function sameBinding(left, right) {
    return left.operationId === right.operationId
        && left.planDigest === right.planDigest
        && left.reviewToken === right.reviewToken;
}
function sameIdentity(left, right) {
    return left.operationId === right.operationId
        && left.requestId === right.requestId
        && left.sessionId === right.sessionId
        && left.vaultGeneration === right.vaultGeneration
        && left.vaultId === right.vaultId
        && left.windowId === right.windowId;
}
function errorCode(error) {
    if (error instanceof Error && 'code' in error)
        return String(error.code);
    return 'failed';
}
export class ReviewedOperationEngine {
    cancelled = new Map();
    completed = new Map();
    completedEvidenceBytes = 0;
    lifetime = createNativeOwnerLifetime();
    pendingCommits = new Map();
    pendingInspections = new Map();
    operations = new Map();
    options;
    used = new Set();
    disposed = false;
    constructor(options) {
        this.options = options;
    }
    inspect(request, signal) {
        if (this.disposed)
            return Promise.reject(new ImportExportError('aborted'));
        const operationId = request.identity.operationId;
        const pending = this.pendingInspections.get(operationId);
        if (pending !== undefined) {
            if (!sameIdentity(pending.identity, request.identity) || pending.format !== request.format) {
                return Promise.reject(new ImportExportError('invalid-plan'));
            }
            return pending.promise;
        }
        const promise = normalizeAbort(this.lifetime.run(combined => this.inspectOwned(request, combined), signal), signal);
        this.pendingInspections.set(operationId, { format: request.format, identity: request.identity, promise });
        void promise.then(() => { if (this.pendingInspections.get(operationId)?.promise === promise)
            this.pendingInspections.delete(operationId); }, () => { if (this.pendingInspections.get(operationId)?.promise === promise)
            this.pendingInspections.delete(operationId); });
        return promise;
    }
    approve(request) {
        if (this.disposed)
            return Promise.reject(new ImportExportError('not-found'));
        return normalizeAbort(this.lifetime.run(() => this.approveOwned(request)));
    }
    commit(request, signal) {
        if (this.disposed)
            return Promise.reject(new ImportExportError('not-found'));
        const pending = this.pendingCommits.get(request.operationId);
        if (pending !== undefined) {
            if (!sameBinding(pending.binding, request))
                return Promise.reject(new ImportExportError('invalid-plan'));
            return pending.promise;
        }
        const promise = normalizeAbort(this.lifetime.run(combined => this.commitOwned(request, combined), signal), signal);
        this.pendingCommits.set(request.operationId, { binding: { ...request }, promise });
        void promise.then(() => { if (this.pendingCommits.get(request.operationId)?.promise === promise)
            this.pendingCommits.delete(request.operationId); }, () => { if (this.pendingCommits.get(request.operationId)?.promise === promise)
            this.pendingCommits.delete(request.operationId); });
        return promise;
    }
    cancel(request) {
        if (this.disposed)
            return Promise.reject(new ImportExportError('not-found'));
        return normalizeAbort(this.lifetime.run(() => this.cancelOwned(request)));
    }
    abandon(request) {
        if (this.disposed)
            return Promise.reject(new ImportExportError('not-found'));
        return normalizeAbort(this.lifetime.run(async () => {
            const operationId = request.identity.operationId;
            const pending = this.pendingInspections.get(operationId);
            if (pending !== undefined) {
                if (!sameIdentity(pending.identity, request.identity) || pending.format !== request.format) {
                    throw new ImportExportError('invalid-plan');
                }
                await pending.promise.catch(() => undefined);
            }
            const record = this.operations.get(operationId);
            if (record === undefined || record.state === 'used')
                return { status: 'cancelled' };
            if (!sameIdentity(record.identity, request.identity) || record.plan.summary.source.format !== request.format) {
                throw new ImportExportError('invalid-plan');
            }
            await this.close(operationId, record);
            this.rememberUsed(operationId);
            return { status: 'cancelled' };
        }));
    }
    async inspectOwned(request, combined) {
        if (this.disposed)
            throw new ImportExportError('aborted');
        if (!isImportInspectFormat(request.format))
            throw new ImportExportError('unsupported-type');
        const operationId = request.identity.operationId;
        const active = this.operations.get(operationId);
        if (active !== undefined) {
            if (active.state === 'used')
                throw new ImportExportError('replayed');
            if (!sameIdentity(active.identity, request.identity) || active.plan.summary.source.format !== request.format) {
                throw new ImportExportError('invalid-plan');
            }
            return { ...active.plan.summary, reviewToken: active.plan.token };
        }
        if (this.completed.has(operationId) || this.cancelled.has(operationId) || this.used.has(operationId)) {
            throw new ImportExportError('replayed');
        }
        if (this.operations.size >= MAX_ACTIVE_OPERATIONS || this.pendingInspections.size >= MAX_ACTIVE_OPERATIONS) {
            throw new ImportExportError('limit-exceeded');
        }
        const vault = vaultBinding(request.identity);
        assertVault(this.options.runtime.state, vault);
        const source = await inspectSource(this.options.picker, request, combined);
        try {
            const planned = planSource(request, source);
            const existing = await existingDestinations(this.options.runtime, vault, combined);
            assertVault(this.options.runtime.state, vault);
            const files = [];
            const destinationSkips = [];
            for (const file of planned.files) {
                if (existing.has(destinationAliasKey(file.destination))) {
                    destinationSkips.push({ label: file.destination, reason: 'destination-exists' });
                }
                else
                    files.push(file);
            }
            const skipped = [...source.rejected, ...planned.skipped, ...destinationSkips];
            const now = this.options.now();
            const plan = createReviewedPlan({
                createdAt: now,
                expiresAt: Math.min(source.expiresAt, now + PLAN_LIFETIME_MS),
                files,
                operationId,
                skipped,
                source: {
                    digest: sha256(stableJson(source.files.map(file => ({
                        digest: sha256(file.bytes),
                        fingerprint: file.fingerprint,
                        path: file.path,
                    })))),
                    fingerprint: source.fingerprint,
                    format: request.format,
                    label: source.label,
                    size: source.size,
                },
                token: this.options.randomToken(),
                vault,
                warnings: planned.warnings,
            });
            const record = {
                expiryTimer: undefined,
                identity: request.identity,
                plan,
                source,
                state: 'pending',
            };
            this.operations.set(operationId, record);
            this.scheduleExpiry(operationId, record);
            return { ...plan.summary, reviewToken: plan.token };
        }
        catch (error) {
            await this.options.picker.releaseSource({ session: source.session }).catch(() => undefined);
            throw error;
        }
    }
    async approveOwned(request) {
        const record = this.operations.get(request.operationId);
        if (record === undefined || this.disposed)
            throw new ImportExportError('not-found');
        if (!requestMatches(record, request))
            throw new ImportExportError('invalid-plan');
        if (record.state === 'approved')
            return { status: 'approved' };
        if (record.state !== 'pending')
            throw new ImportExportError('replayed');
        if (record.plan.summary.expiresAt <= this.options.now()) {
            await this.close(request.operationId, record);
            throw new ImportExportError('expired');
        }
        record.state = 'approved';
        return { status: 'approved' };
    }
    async commitOwned(request, combined) {
        const completed = this.completed.get(request.operationId);
        if (completed !== undefined) {
            if (!sameBinding(completed.binding, request))
                throw new ImportExportError('invalid-plan');
            return completed.result;
        }
        const record = this.operations.get(request.operationId);
        if (record === undefined || this.disposed) {
            if (this.used.has(request.operationId))
                throw new ImportExportError('replayed');
            throw new ImportExportError('not-found');
        }
        if (record.state === 'used')
            throw new ImportExportError('replayed');
        if (record.state !== 'approved' || !requestMatches(record, request)) {
            throw new ImportExportError('invalid-plan');
        }
        record.state = 'used';
        if (record.expiryTimer !== undefined)
            clearTimeout(record.expiryTimer);
        record.expiryTimer = undefined;
        try {
            if (record.plan.summary.expiresAt <= this.options.now())
                throw new ImportExportError('expired');
            assertPlanContent(record.plan);
            try {
                await this.options.picker.revalidateSource({
                    expectedRootRevision: record.source.fingerprint,
                    session: record.source.session,
                }, combined);
            }
            catch (error) {
                return sourceError(error);
            }
            combined.throwIfAborted();
            const vault = record.plan.summary.vault;
            assertVault(this.options.runtime.state, vault);
            const existing = await existingDestinations(this.options.runtime, vault, combined);
            const committed = [];
            const failed = [];
            const skipped = [];
            let recoveryRequired = false;
            for (let index = 0; index < record.plan.files.length; index += 1) {
                const file = record.plan.files[index];
                const item = record.plan.summary.items[index];
                if (existing.has(destinationAliasKey(file.destination))) {
                    skipped.push({ destination: file.destination, reason: 'exists' });
                    continue;
                }
                if (combined.aborted) {
                    for (const remaining of record.plan.files.slice(index)) {
                        skipped.push({ destination: remaining.destination, reason: 'cancelled' });
                    }
                    break;
                }
                try {
                    combined.throwIfAborted();
                    const result = file.kind === 'document'
                        ? await this.options.runtime.createDocument({
                            content: new TextDecoder('utf-8', { fatal: true }).decode(file.bytes),
                            expectedVault: vault,
                            path: file.destination,
                        }, combined)
                        : file.kind === 'attachment'
                            ? await this.options.runtime.storeAttachment({
                                data: file.bytes,
                                expectedVault: vault,
                                path: file.destination,
                            }, combined)
                            : await this.options.runtime.restorePassiveBackupEntry({
                                data: file.bytes,
                                expectedVault: vault,
                                path: file.destination,
                            }, combined);
                    if (result.digest !== item.digest || result.path !== file.destination
                        || result.generation !== vault.generation) {
                        failed.push({ destination: file.destination, reason: 'digest-mismatch' });
                        recoveryRequired = true;
                        for (const remaining of record.plan.files.slice(index + 1)) {
                            skipped.push({ destination: remaining.destination, reason: 'cancelled' });
                        }
                        break;
                    }
                    else {
                        committed.push({ destination: file.destination, digest: result.digest, id: item.id });
                    }
                }
                catch (error) {
                    const code = errorCode(error);
                    if (code === 'exists')
                        skipped.push({ destination: file.destination, reason: 'exists' });
                    else {
                        failed.push({ destination: file.destination, reason: code });
                        if (code === 'partial') {
                            recoveryRequired = true;
                            for (const remaining of record.plan.files.slice(index + 1)) {
                                skipped.push({ destination: remaining.destination, reason: 'cancelled' });
                            }
                            break;
                        }
                    }
                }
            }
            const result = {
                committed,
                failed,
                operationId: request.operationId,
                planDigest: request.planDigest,
                recovery: {
                    snapshots: [],
                    status: recoveryRequired ? 'required' : 'not-needed',
                    trash: [],
                },
                skipped,
                status: failed.length === 0 && skipped.length === 0 ? 'committed' : 'partial',
            };
            this.rememberCompleted(request, result);
            return result;
        }
        finally {
            await this.options.picker.releaseSource({ session: record.source.session }).catch(() => undefined);
            this.operations.delete(request.operationId);
            this.rememberUsed(request.operationId);
        }
    }
    async cancelOwned(request) {
        const cancelledToken = this.cancelled.get(request.operationId);
        if (cancelledToken !== undefined) {
            if (cancelledToken !== request.reviewToken)
                throw new ImportExportError('invalid-plan');
            return { status: 'cancelled' };
        }
        const record = this.operations.get(request.operationId);
        if (record === undefined)
            throw new ImportExportError('not-found');
        if (record.state === 'used')
            throw new ImportExportError('replayed');
        if (record.plan.token !== request.reviewToken)
            throw new ImportExportError('invalid-plan');
        await this.close(request.operationId, record);
        this.rememberCancelled(request);
        this.rememberUsed(request.operationId);
        return { status: 'cancelled' };
    }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const record of this.operations.values()) {
            if (record.expiryTimer !== undefined)
                clearTimeout(record.expiryTimer);
            record.expiryTimer = undefined;
        }
        await this.lifetime.dispose();
        const records = [...this.operations.values()];
        this.pendingCommits.clear();
        this.pendingInspections.clear();
        this.operations.clear();
        this.cancelled.clear();
        for (const completed of this.completed.values()) {
            if (completed.expiryTimer !== undefined)
                clearTimeout(completed.expiryTimer);
        }
        this.completed.clear();
        this.completedEvidenceBytes = 0;
        this.used.clear();
        await Promise.allSettled(records.map(record => (this.options.picker.releaseSource({ session: record.source.session }))));
    }
    async close(operationId, record) {
        if (record.expiryTimer !== undefined)
            clearTimeout(record.expiryTimer);
        record.expiryTimer = undefined;
        this.operations.delete(operationId);
        await this.options.picker.releaseSource({ session: record.source.session }).catch(() => undefined);
    }
    scheduleExpiry(operationId, record) {
        const delay = Math.max(0, record.plan.summary.expiresAt - this.options.now());
        record.expiryTimer = setTimeout(() => {
            if (this.disposed || this.operations.get(operationId) !== record || record.state === 'used')
                return;
            void normalizeAbort(this.lifetime.run(() => this.close(operationId, record))).catch(() => undefined);
        }, delay);
        record.expiryTimer.unref?.();
    }
    rememberCancelled(request) {
        this.cancelled.set(request.operationId, request.reviewToken);
        const oldest = this.cancelled.keys().next().value;
        if (this.cancelled.size > 1_024 && oldest !== undefined)
            this.cancelled.delete(oldest);
    }
    rememberCompleted(binding, result) {
        const previous = this.completed.get(binding.operationId);
        if (previous !== undefined)
            this.forgetCompleted(binding.operationId, previous);
        const bytes = new TextEncoder().encode(stableJson(result)).byteLength;
        const completed = {
            binding: { ...binding },
            bytes,
            expiryTimer: undefined,
            result,
        };
        completed.expiryTimer = setTimeout(() => {
            this.forgetCompleted(binding.operationId, completed);
        }, PLAN_LIFETIME_MS);
        completed.expiryTimer.unref?.();
        this.completed.set(binding.operationId, completed);
        this.completedEvidenceBytes += bytes;
        while (this.completed.size > MAX_COMPLETED_OPERATIONS
            || this.completedEvidenceBytes > MAX_COMPLETED_EVIDENCE_BYTES) {
            const oldest = this.completed.entries().next().value;
            if (oldest === undefined || (oldest[0] === binding.operationId && this.completed.size === 1))
                break;
            this.forgetCompleted(oldest[0], oldest[1]);
        }
    }
    forgetCompleted(operationId, completed) {
        if (this.completed.get(operationId) !== completed)
            return;
        if (completed.expiryTimer !== undefined)
            clearTimeout(completed.expiryTimer);
        this.completed.delete(operationId);
        this.completedEvidenceBytes -= completed.bytes;
    }
    rememberUsed(operationId) {
        this.used.add(operationId);
        if (this.used.size > 1_024) {
            const oldest = this.used.values().next().value;
            if (oldest !== undefined)
                this.used.delete(oldest);
        }
    }
}
//# sourceMappingURL=engine.js.map