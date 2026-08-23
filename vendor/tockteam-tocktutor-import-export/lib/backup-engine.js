import { computeDesktopDestinationPlanDigest, } from '@tockteam/desktop/host';
import { createBackupArchive } from "./backup.js";
import { ImportExportError, sha256, stableJson } from "./core.js";
const BACKUP_PLAN_LIFETIME_MS = 5 * 60 * 1_000;
const DESTINATION_CHUNK_BYTES = 1024 * 1024;
const TREE_PAGE_SIZE = 1_000;
function assertVault(state, expected) {
    if (!state.active || state.id !== expected.id || state.generation !== expected.generation) {
        throw new ImportExportError('stale-vault');
    }
}
function desktopIdentity(identity) {
    return {
        operationId: identity.operationId,
        requestId: identity.requestId,
        sessionId: identity.sessionId,
        vaultGeneration: identity.vault.generation,
        vaultId: identity.vault.id,
        windowId: identity.windowId,
    };
}
async function treeSnapshot(runtime, vault, signal) {
    assertVault(runtime.state, vault);
    const entries = [];
    let cursor = null;
    for (let pages = 0; pages <= 100; pages += 1) {
        signal.throwIfAborted();
        const page = await runtime.listTree({ cursor, expectedVault: vault, limit: TREE_PAGE_SIZE }, signal);
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
            entries.sort((left, right) => left.path.localeCompare(right.path));
            return { entries, fingerprint: sha256(stableJson(entries)) };
        }
        if (page.cursor === null || page.cursor === cursor)
            throw new ImportExportError('stale-vault');
        cursor = page.cursor;
    }
    throw new ImportExportError('limit-exceeded');
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
            if (result.path !== entry.path || result.revision !== entry.revision
                || result.generation !== vault.generation || result.digest !== sha256(result.data)
                || result.data.byteLength !== entry.size)
                throw new ImportExportError('stale-vault');
            output.push({ bytes: result.data, kind: 'attachment', path: entry.path, revision: entry.revision });
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
    return record.browserSessionId === request.sessionId
        && record.reviewToken === request.reviewToken
        && record.view.operationId === request.operationId
        && record.view.planDigest === request.planDigest
        && record.view.vault.id === request.vault.id
        && record.view.vault.generation === request.vault.generation;
}
export class ReviewedBackupEngine {
    disposed = false;
    lifetime = new AbortController();
    operations = new Map();
    options;
    used = new Set();
    constructor(options) {
        this.options = options;
    }
    async prepare(request, signal) {
        if (this.disposed)
            throw new ImportExportError('aborted');
        const { identity } = request;
        if (this.operations.has(identity.operationId) || this.used.has(identity.operationId)) {
            throw new ImportExportError('replayed');
        }
        const combined = AbortSignal.any([signal, this.lifetime.signal]);
        const before = await treeSnapshot(this.options.runtime, identity.vault, combined);
        const entries = await captureEntries(this.options.runtime, identity.vault, before, combined);
        const after = await treeSnapshot(this.options.runtime, identity.vault, combined);
        if (after.fingerprint !== before.fingerprint)
            throw new ImportExportError('stale-vault');
        const createdAt = this.options.now();
        const archive = createBackupArchive({ createdAt, entries, vault: identity.vault });
        const archiveHex = sha256(archive).slice(7);
        const nativeIdentity = desktopIdentity(identity);
        const picked = await this.options.desktop.pick({ identity: nativeIdentity, kind: 'destination', purpose: 'vault-backup' }, combined);
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
            identity: nativeIdentity,
            planDigest: desktopPlanDigest,
            selectionAuthorization: picked.authorization,
        }, combined);
        const expiresAt = Math.min(locked.expiresAt, createdAt + BACKUP_PLAN_LIFETIME_MS);
        const planDigest = sha256(stableJson({
            archiveDigest: `sha256:${archiveHex}`,
            desktopPlanDigest,
            entries: entries.map(entry => ({ digest: sha256(entry.bytes), kind: entry.kind, path: entry.path, revision: entry.revision })),
            expectedState: locked.expectedState,
            expiresAt,
            operationId: identity.operationId,
            vault: identity.vault,
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
            vault: identity.vault,
        };
        const reviewToken = this.options.randomToken();
        this.operations.set(identity.operationId, {
            archive,
            authorization: locked.authorization,
            browserSessionId: identity.sessionId,
            desktopPlanDigest,
            expectedState: locked.expectedState,
            identity: nativeIdentity,
            reviewToken,
            snapshot: before,
            state: 'pending',
            view,
        });
        return { ...view, reviewToken };
    }
    async approve(request) {
        const record = this.operations.get(request.operationId);
        if (record === undefined || this.disposed)
            throw new ImportExportError('not-found');
        if (record.state !== 'pending')
            throw new ImportExportError('replayed');
        if (!matches(record, request))
            throw new ImportExportError('invalid-plan');
        if (record.view.expiresAt <= this.options.now()) {
            await this.close(request.operationId, record);
            throw new ImportExportError('expired');
        }
        record.state = 'approved';
        return { status: 'approved' };
    }
    async commit(request, signal) {
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
        const combined = AbortSignal.any([signal, this.lifetime.signal]);
        let session;
        try {
            if (record.view.expiresAt <= this.options.now())
                throw new ImportExportError('expired');
            if (sha256(record.archive) !== record.view.archiveDigest)
                throw new ImportExportError('invalid-plan');
            const current = await treeSnapshot(this.options.runtime, request.vault, combined);
            if (current.fingerprint !== record.snapshot.fingerprint)
                throw new ImportExportError('stale-vault');
            const archiveHex = record.view.archiveDigest.slice(7);
            const destinationPlan = {
                entries: [{ digest: archiveHex, size: record.archive.byteLength, target: { kind: 'selected-file' } }],
                purpose: 'vault-backup',
                totalBytes: record.archive.byteLength,
            };
            const begun = await this.options.desktop.beginDestination({
                ...destinationPlan,
                authorization: record.authorization,
                identity: record.identity,
                planDigest: record.desktopPlanDigest,
            }, combined);
            session = begun.session;
            if (stableJson(begun.expectedState) !== stableJson(record.expectedState))
                throw new ImportExportError('invalid-plan');
            let offset = 0;
            while (offset < record.archive.byteLength) {
                const bytes = record.archive.slice(offset, Math.min(record.archive.byteLength, offset + DESTINATION_CHUNK_BYTES));
                const result = await this.options.desktop.writeDestinationChunk({
                    bytes,
                    offset,
                    planDigest: record.desktopPlanDigest,
                    session,
                    target: { kind: 'selected-file' },
                }, combined);
                if (result.acceptedBytes !== bytes.byteLength || result.nextOffset !== offset + bytes.byteLength) {
                    throw new ImportExportError('invalid-plan');
                }
                offset = result.nextOffset;
            }
            const result = await this.options.desktop.finalizeDestination({
                expectedState: record.expectedState,
                planDigest: record.desktopPlanDigest,
                session,
            }, combined);
            session = undefined;
            if (result.status === 'partial') {
                return {
                    cleanup: cleanupView(result.cleanup),
                    failedEntries: result.failedEntries,
                    operationId: request.operationId,
                    planDigest: request.planDigest,
                    stagedBytes: result.stagedBytes,
                    stagedEntries: result.stagedEntries,
                    status: 'partial',
                };
            }
            if (result.planDigest !== record.desktopPlanDigest || result.bytes !== record.archive.byteLength || result.entries !== 1) {
                throw new ImportExportError('invalid-plan');
            }
            return {
                bytes: result.bytes,
                cleanup: cleanupView(result.cleanup),
                label: String(result.label),
                operationId: request.operationId,
                planDigest: request.planDigest,
                status: 'published',
            };
        }
        catch (error) {
            if (session === undefined) {
                await this.options.desktop.revokeDestinationPlan({ authorization: record.authorization }).catch(() => undefined);
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
    async cancel(operationId, sessionId) {
        const record = this.operations.get(operationId);
        if (record === undefined || record.browserSessionId !== sessionId)
            throw new ImportExportError('not-found');
        await this.close(operationId, record);
        return { status: 'cancelled' };
    }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.lifetime.abort(new ImportExportError('aborted'));
        const records = [...this.operations.values()];
        this.operations.clear();
        this.used.clear();
        await Promise.allSettled(records.flatMap(record => record.state === 'used' ? [] : [
            this.options.desktop.revokeDestinationPlan({ authorization: record.authorization }),
        ]));
    }
    async close(operationId, record) {
        this.operations.delete(operationId);
        if (record.state !== 'used') {
            await this.options.desktop.revokeDestinationPlan({ authorization: record.authorization }).catch(() => undefined);
        }
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