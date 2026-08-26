import { computeDesktopDestinationPlanDigest, createNativeOwnerLifetime, } from '@tockteam/desktop/host';
import { createBackupArchive } from "./backup.js";
import { ImportExportError, normalizeAbort, sha256, stableJson } from "./core.js";
const BACKUP_PLAN_LIFETIME_MS = 5 * 60 * 1_000;
const MAX_ACTIVE_OPERATIONS = 1;
const MAX_COMPLETED_OPERATIONS = 64;
const MAX_COMPLETED_EVIDENCE_BYTES = 32 * 1024 * 1024;
const DESTINATION_CHUNK_BYTES = 1024 * 1024;
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
async function treeSnapshot(runtime, vault, signal) {
    assertVault(runtime.state, vault);
    const entries = [];
    let cursor = null;
    let complete = false;
    for (let pages = 0; pages <= 100; pages += 1) {
        signal.throwIfAborted();
        const page = await runtime.listTree({ cursor, expectedVault: vault, limit: TREE_PAGE_SIZE }, signal);
        signal.throwIfAborted();
        if (page.generation !== vault.generation || page.truncated || page.truncationReason !== null || page.warnings.length > 0) {
            throw new ImportExportError('stale-vault');
        }
        for (const entry of page.entries) {
            if (entry.kind === 'directory')
                entries.push({ kind: entry.kind, path: entry.path, revision: entry.revision, size: 0 });
            else
                entries.push({ kind: entry.kind, path: entry.path, revision: entry.revision, size: entry.size });
            if (entries.length > 20_000)
                throw new ImportExportError('limit-exceeded');
        }
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
    for (const entry of passive.entries) {
        entries.push({ kind: 'passive', path: entry.path, revision: entry.revision, size: entry.size });
        if (entries.length > 20_000)
            throw new ImportExportError('limit-exceeded');
    }
    assertVault(runtime.state, vault);
    entries.sort((left, right) => left.path.localeCompare(right.path));
    return { entries, fingerprint: sha256(stableJson(entries)) };
}
async function captureEntries(runtime, vault, snapshot, signal) {
    const output = [];
    let totalBytes = 0;
    for (const entry of snapshot.entries) {
        signal.throwIfAborted();
        if (entry.kind === 'directory')
            continue;
        if (entry.kind === 'document') {
            const result = await runtime.openDocument(entry.path, vault, signal);
            signal.throwIfAborted();
            assertVault(runtime.state, vault);
            const bytes = new TextEncoder().encode(result.content);
            if (result.path !== entry.path || result.revision !== entry.revision
                || result.generation !== vault.generation || result.digest !== sha256(bytes)
                || bytes.byteLength !== entry.size)
                throw new ImportExportError('stale-vault');
            output.push({ bytes, kind: 'document', path: entry.path, revision: entry.revision });
            totalBytes += bytes.byteLength;
        }
        else if (entry.kind === 'attachment') {
            const result = await runtime.previewAttachment(entry.path, vault, signal);
            signal.throwIfAborted();
            assertVault(runtime.state, vault);
            if (result.path !== entry.path || result.revision !== entry.revision
                || result.generation !== vault.generation || result.digest !== sha256(result.data)
                || result.data.byteLength !== entry.size)
                throw new ImportExportError('stale-vault');
            output.push({ bytes: result.data, kind: 'attachment', path: entry.path, revision: entry.revision });
            totalBytes += result.data.byteLength;
        }
        else if (entry.kind === 'passive') {
            const result = await runtime.readPassiveBackupEntry({
                expectedRevision: entry.revision,
                expectedVault: vault,
                path: entry.path,
            }, signal);
            signal.throwIfAborted();
            assertVault(runtime.state, vault);
            if (result.path !== entry.path || result.revision !== entry.revision
                || result.generation !== vault.generation || result.digest !== sha256(result.data)
                || result.data.byteLength !== entry.size || result.size !== entry.size) {
                throw new ImportExportError('stale-vault');
            }
            output.push({ bytes: result.data, kind: 'passive', path: entry.path, revision: entry.revision });
            totalBytes += result.data.byteLength;
        }
        if (totalBytes > 500 * 1024 * 1024)
            throw new ImportExportError('limit-exceeded');
    }
    if (output.length === 0)
        throw new ImportExportError('unsupported-type');
    return output;
}
function cleanupView(evidence) {
    return evidence.status === 'complete'
        ? { status: 'complete' }
        : { residualLabels: evidence.residualLabels.map(String), status: evidence.status };
}
function matches(record, request) {
    return record.reviewToken === request.reviewToken
        && record.view.operationId === request.operationId
        && record.view.planDigest === request.planDigest;
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
export class ReviewedBackupEngine {
    disposed = false;
    cancelled = new Map();
    completed = new Map();
    completedEvidenceBytes = 0;
    lifetime = createNativeOwnerLifetime();
    pendingCommits = new Map();
    pendingPreparations = new Map();
    operations = new Map();
    options;
    used = new Set();
    constructor(options) {
        this.options = options;
    }
    prepare(request, signal) {
        if (this.disposed)
            return Promise.reject(new ImportExportError('aborted'));
        const operationId = request.identity.operationId;
        const pending = this.pendingPreparations.get(operationId);
        if (pending !== undefined) {
            if (!sameIdentity(pending.identity, request.identity))
                return Promise.reject(new ImportExportError('invalid-plan'));
            return pending.promise;
        }
        const promise = normalizeAbort(this.lifetime.run(combined => this.prepareOwned(request, combined), signal), signal);
        this.pendingPreparations.set(operationId, { identity: request.identity, promise });
        void promise.then(() => { if (this.pendingPreparations.get(operationId)?.promise === promise)
            this.pendingPreparations.delete(operationId); }, () => { if (this.pendingPreparations.get(operationId)?.promise === promise)
            this.pendingPreparations.delete(operationId); });
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
            const pending = this.pendingPreparations.get(operationId);
            if (pending !== undefined) {
                if (!sameIdentity(pending.identity, request.identity))
                    throw new ImportExportError('invalid-plan');
                await pending.promise.catch(() => undefined);
            }
            const record = this.operations.get(operationId);
            if (record === undefined || record.state === 'used')
                return { status: 'cancelled' };
            if (!sameIdentity(record.identity, request.identity))
                throw new ImportExportError('invalid-plan');
            await this.close(operationId, record);
            this.rememberUsed(operationId);
            return { status: 'cancelled' };
        }));
    }
    async prepareOwned(request, combined) {
        if (this.disposed)
            throw new ImportExportError('aborted');
        const { identity } = request;
        const active = this.operations.get(identity.operationId);
        if (active !== undefined) {
            if (active.state === 'used')
                throw new ImportExportError('replayed');
            if (!sameIdentity(active.identity, identity))
                throw new ImportExportError('invalid-plan');
            return { ...active.view, reviewToken: active.reviewToken };
        }
        if (this.completed.has(identity.operationId) || this.cancelled.has(identity.operationId) || this.used.has(identity.operationId)) {
            throw new ImportExportError('replayed');
        }
        if (this.operations.size >= MAX_ACTIVE_OPERATIONS || this.pendingPreparations.size >= MAX_ACTIVE_OPERATIONS) {
            throw new ImportExportError('limit-exceeded');
        }
        const vault = vaultBinding(identity);
        const before = await treeSnapshot(this.options.runtime, vault, combined);
        combined.throwIfAborted();
        const entries = await captureEntries(this.options.runtime, vault, before, combined);
        combined.throwIfAborted();
        const after = await treeSnapshot(this.options.runtime, vault, combined);
        combined.throwIfAborted();
        if (after.fingerprint !== before.fingerprint)
            throw new ImportExportError('stale-vault');
        const createdAt = this.options.now();
        const archive = createBackupArchive({ createdAt, entries, vault });
        const archiveHex = sha256(archive).slice(7);
        assertVault(this.options.runtime.state, vault);
        const picked = await this.options.desktop.pick({ identity, kind: 'destination', purpose: 'vault-backup' }, combined);
        combined.throwIfAborted();
        assertVault(this.options.runtime.state, vault);
        if (picked.operationId !== identity.operationId)
            throw new ImportExportError('stale-vault');
        if (picked.status !== 'selected')
            throw new ImportExportError(picked.status === 'cancelled' ? 'aborted' : 'stale-vault');
        const desktopPlan = {
            entries: [{ digest: archiveHex, size: archive.byteLength, target: { kind: 'selected-file' } }],
            purpose: 'vault-backup',
            totalBytes: archive.byteLength,
        };
        const desktopPlanDigest = computeDesktopDestinationPlanDigest(desktopPlan);
        const locked = await this.options.desktop.lockDestinationPlan({
            ...desktopPlan,
            identity,
            planDigest: desktopPlanDigest,
            selectionAuthorization: picked.authorization,
        }, combined);
        try {
            combined.throwIfAborted();
            assertVault(this.options.runtime.state, vault);
        }
        catch (error) {
            await this.options.desktop.revokeDestinationPlan({ authorization: locked.authorization }).catch(() => undefined);
            throw error;
        }
        const expiresAt = Math.min(locked.expiresAt, createdAt + BACKUP_PLAN_LIFETIME_MS);
        const planDigest = sha256(stableJson({
            archiveDigest: `sha256:${archiveHex}`,
            desktopPlanDigest,
            entries: entries.map(entry => ({ digest: sha256(entry.bytes), kind: entry.kind, path: entry.path, revision: entry.revision })),
            expectedState: locked.expectedState,
            expiresAt,
            operationId: identity.operationId,
            vault,
        }));
        const view = {
            archiveDigest: `sha256:${archiveHex}`,
            createdAt,
            destinationLabel: String(picked.label).slice(0, 512),
            entries: entries.length,
            expiresAt,
            operationId: identity.operationId,
            planDigest,
            totalBytes: archive.byteLength,
            vault,
        };
        const reviewToken = this.options.randomToken();
        const record = {
            archive,
            expiryTimer: undefined,
            authorization: locked.authorization,
            desktopPlanDigest,
            expectedState: locked.expectedState,
            identity,
            reviewToken,
            snapshot: before,
            state: 'pending',
            view,
        };
        this.operations.set(identity.operationId, record);
        this.scheduleExpiry(identity.operationId, record);
        return { ...view, reviewToken };
    }
    async approveOwned(request) {
        const record = this.operations.get(request.operationId);
        if (record === undefined || this.disposed)
            throw new ImportExportError('not-found');
        if (!matches(record, request))
            throw new ImportExportError('invalid-plan');
        if (record.state === 'approved')
            return { status: 'approved' };
        if (record.state !== 'pending')
            throw new ImportExportError('replayed');
        if (record.view.expiresAt <= this.options.now()) {
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
        if (record.state !== 'approved' || !matches(record, request))
            throw new ImportExportError('invalid-plan');
        record.state = 'used';
        if (record.expiryTimer !== undefined)
            clearTimeout(record.expiryTimer);
        record.expiryTimer = undefined;
        let finalizing = false;
        let session;
        try {
            if (record.view.expiresAt <= this.options.now())
                throw new ImportExportError('expired');
            if (sha256(record.archive) !== record.view.archiveDigest)
                throw new ImportExportError('invalid-plan');
            const vault = record.view.vault;
            const current = await treeSnapshot(this.options.runtime, vault, combined);
            if (current.fingerprint !== record.snapshot.fingerprint)
                throw new ImportExportError('stale-vault');
            const archiveHex = record.view.archiveDigest.slice(7);
            const destinationPlan = {
                entries: [{ digest: archiveHex, size: record.archive.byteLength, target: { kind: 'selected-file' } }],
                purpose: 'vault-backup',
                totalBytes: record.archive.byteLength,
            };
            assertVault(this.options.runtime.state, vault);
            combined.throwIfAborted();
            const begun = await this.options.desktop.beginDestination({
                ...destinationPlan,
                authorization: record.authorization,
                identity: record.identity,
                planDigest: record.desktopPlanDigest,
            }, combined);
            session = begun.session;
            combined.throwIfAborted();
            assertVault(this.options.runtime.state, vault);
            if (stableJson(begun.expectedState) !== stableJson(record.expectedState))
                throw new ImportExportError('invalid-plan');
            let offset = 0;
            while (offset < record.archive.byteLength) {
                const bytes = record.archive.slice(offset, Math.min(record.archive.byteLength, offset + DESTINATION_CHUNK_BYTES));
                assertVault(this.options.runtime.state, vault);
                combined.throwIfAborted();
                const result = await this.options.desktop.writeDestinationChunk({
                    bytes,
                    offset,
                    planDigest: record.desktopPlanDigest,
                    session,
                    target: { kind: 'selected-file' },
                }, combined);
                combined.throwIfAborted();
                assertVault(this.options.runtime.state, vault);
                if (result.acceptedBytes !== bytes.byteLength || result.nextOffset !== offset + bytes.byteLength) {
                    throw new ImportExportError('invalid-plan');
                }
                offset = result.nextOffset;
            }
            assertVault(this.options.runtime.state, vault);
            combined.throwIfAborted();
            finalizing = true;
            const result = await this.options.desktop.finalizeDestination({
                expectedState: record.expectedState,
                planDigest: record.desktopPlanDigest,
                session,
            }, combined);
            finalizing = false;
            session = undefined;
            if (result.status === 'partial') {
                const publishResult = {
                    cleanup: cleanupView(result.cleanup),
                    failedEntries: result.failedEntries,
                    operationId: request.operationId,
                    planDigest: request.planDigest,
                    stagedBytes: result.stagedBytes,
                    stagedEntries: result.stagedEntries,
                    status: 'partial',
                };
                this.rememberCompleted(request, publishResult);
                return publishResult;
            }
            if (result.planDigest !== record.desktopPlanDigest || result.bytes !== record.archive.byteLength || result.entries !== 1) {
                throw new ImportExportError('invalid-plan');
            }
            const publishResult = {
                bytes: result.bytes,
                cleanup: cleanupView(result.cleanup),
                label: String(result.label),
                operationId: request.operationId,
                planDigest: request.planDigest,
                status: 'published',
            };
            this.rememberCompleted(request, publishResult);
            return publishResult;
        }
        catch (error) {
            if (session === undefined) {
                await this.options.desktop.revokeDestinationPlan({ authorization: record.authorization }).catch(() => undefined);
            }
            else if (finalizing) {
                const aborted = await this.options.desktop.abortDestination({ session }).catch(() => undefined);
                session = undefined;
                if (aborted !== undefined) {
                    const cleanup = cleanupView(aborted.cleanup);
                    const published = aborted.cleanup.status === 'retained'
                        && aborted.stagedBytes === 0
                        && aborted.stagedEntries === 0;
                    const publishResult = published
                        ? {
                            bytes: record.archive.byteLength,
                            cleanup,
                            label: record.view.destinationLabel,
                            operationId: request.operationId,
                            planDigest: request.planDigest,
                            status: 'published',
                        }
                        : {
                            cleanup,
                            failedEntries: 1,
                            operationId: request.operationId,
                            planDigest: request.planDigest,
                            stagedBytes: aborted.stagedBytes,
                            stagedEntries: aborted.stagedEntries,
                            status: 'partial',
                        };
                    this.rememberCompleted(request, publishResult);
                    return publishResult;
                }
            }
            else {
                await this.options.desktop.abortDestination({ session }).catch(() => undefined);
            }
            throw error;
        }
        finally {
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
        if (record.reviewToken !== request.reviewToken)
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
        this.pendingPreparations.clear();
        this.operations.clear();
        this.cancelled.clear();
        for (const completed of this.completed.values()) {
            if (completed.expiryTimer !== undefined)
                clearTimeout(completed.expiryTimer);
        }
        this.completed.clear();
        this.completedEvidenceBytes = 0;
        this.used.clear();
        await Promise.allSettled(records.flatMap(record => record.state === 'used' ? [] : [
            this.options.desktop.revokeDestinationPlan({ authorization: record.authorization }),
        ]));
    }
    async close(operationId, record) {
        if (record.expiryTimer !== undefined)
            clearTimeout(record.expiryTimer);
        record.expiryTimer = undefined;
        this.operations.delete(operationId);
        if (record.state !== 'used') {
            await this.options.desktop.revokeDestinationPlan({ authorization: record.authorization }).catch(() => undefined);
        }
    }
    scheduleExpiry(operationId, record) {
        const delay = Math.max(0, record.view.expiresAt - this.options.now());
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
        }, BACKUP_PLAN_LIFETIME_MS);
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
//# sourceMappingURL=backup-engine.js.map