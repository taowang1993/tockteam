import { planVerifiedRestore } from "./backup.js";
import { assertPlanContent, createReviewedPlan, destinationAliasKey, ImportExportError, sha256, stableJson, } from "./core.js";
import { planAppleJournal, planBear, planCsv, planEvernote, planGoogleKeep, planHtml, planHtmlZip, planRoam, planTextbundle, planTextpack, } from "./formats/converters.js";
import { MARKDOWN_MAX_ENTRIES, MARKDOWN_MAX_ENTRY_BYTES, MARKDOWN_MAX_TOTAL_BYTES, planMarkdownFolder, planMarkdownZip, } from "./formats/markdown.js";
const PLAN_LIFETIME_MS = 5 * 60 * 1_000;
const SOURCE_PAGE_SIZE = 256;
const SOURCE_CHUNK_SIZE = 1024 * 1024;
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
    const identity = desktopIdentity(request.identity);
    const limits = sourceLimits(request.format);
    const picked = await picker.pick({ identity, kind: 'source', purpose: request.format }, signal);
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
        const entries = [];
        let cursor = null;
        let scannedBytes = -1;
        let scannedEntries = -1;
        const fingerprint = begun.root.revision;
        for (;;) {
            signal.throwIfAborted();
            const page = await picker.listSource({ cursor, limit: SOURCE_PAGE_SIZE, session: begun.session }, signal);
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
    for (let pages = 0; pages <= 100; pages += 1) {
        signal.throwIfAborted();
        const page = await runtime.listTree({ cursor, expectedVault: vault, limit: TREE_PAGE_SIZE }, signal);
        if (page.generation !== vault.generation || page.truncated
            || page.truncationReason !== null || page.warnings.length > 0) {
            throw new ImportExportError('stale-vault');
        }
        for (const entry of page.entries)
            aliases.add(destinationAliasKey(entry.path));
        if (page.complete)
            return aliases;
        if (page.cursor === null || page.cursor === cursor)
            throw new ImportExportError('stale-vault');
        cursor = page.cursor;
    }
    throw new ImportExportError('limit-exceeded');
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
    return record.browserSessionId === request.sessionId
        && record.plan.token === request.reviewToken
        && record.plan.summary.operationId === request.operationId
        && record.plan.summary.planDigest === request.planDigest
        && record.plan.summary.vault.id === request.vault.id
        && record.plan.summary.vault.generation === request.vault.generation;
}
function errorCode(error) {
    if (error instanceof Error && 'code' in error)
        return String(error.code);
    return 'failed';
}
export class ReviewedOperationEngine {
    lifetime = new AbortController();
    operations = new Map();
    options;
    used = new Set();
    disposed = false;
    constructor(options) {
        this.options = options;
    }
    async inspect(request, signal) {
        if (this.disposed)
            throw new ImportExportError('aborted');
        if (this.operations.has(request.identity.operationId) || this.used.has(request.identity.operationId)) {
            throw new ImportExportError('replayed');
        }
        assertVault(this.options.runtime.state, request.identity.vault);
        const combined = AbortSignal.any([signal, this.lifetime.signal]);
        const source = await inspectSource(this.options.picker, request, combined);
        try {
            const planned = planSource(request, source);
            const existing = await existingDestinations(this.options.runtime, request.identity.vault, combined);
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
                operationId: request.identity.operationId,
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
                vault: request.identity.vault,
                warnings: planned.warnings,
            });
            this.operations.set(request.identity.operationId, {
                browserSessionId: request.identity.sessionId,
                plan,
                source,
                state: 'pending',
            });
            return { ...plan.summary, reviewToken: plan.token };
        }
        catch (error) {
            await this.options.picker.releaseSource({ session: source.session }).catch(() => undefined);
            throw error;
        }
    }
    async approve(request) {
        const record = this.operations.get(request.operationId);
        if (record === undefined || this.disposed)
            throw new ImportExportError('not-found');
        if (record.state !== 'pending')
            throw new ImportExportError('replayed');
        if (!requestMatches(record, request))
            throw new ImportExportError('invalid-plan');
        if (record.plan.summary.expiresAt <= this.options.now()) {
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
        if (record.state !== 'approved' || !requestMatches(record, request)) {
            throw new ImportExportError('invalid-plan');
        }
        record.state = 'used';
        const combined = AbortSignal.any([signal, this.lifetime.signal]);
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
            assertVault(this.options.runtime.state, request.vault);
            const existing = await existingDestinations(this.options.runtime, request.vault, combined);
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
                    const result = file.kind === 'document'
                        ? await this.options.runtime.createDocument({
                            content: new TextDecoder('utf-8', { fatal: true }).decode(file.bytes),
                            expectedVault: request.vault,
                            path: file.destination,
                        }, combined)
                        : await this.options.runtime.storeAttachment({
                            data: file.bytes,
                            expectedVault: request.vault,
                            path: file.destination,
                        }, combined);
                    if (result.digest !== item.digest || result.path !== file.destination
                        || result.generation !== request.vault.generation) {
                        failed.push({ destination: file.destination, reason: 'digest-mismatch' });
                        recoveryRequired = true;
                    }
                    else {
                        committed.push({ destination: file.destination, digest: result.digest, id: item.id });
                    }
                }
                catch (error) {
                    if (errorCode(error) === 'exists')
                        skipped.push({ destination: file.destination, reason: 'exists' });
                    else
                        failed.push({ destination: file.destination, reason: errorCode(error) });
                }
            }
            return {
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
        }
        finally {
            await this.options.picker.releaseSource({ session: record.source.session }).catch(() => undefined);
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
        await Promise.allSettled(records.map(record => (this.options.picker.releaseSource({ session: record.source.session }))));
    }
    async close(operationId, record) {
        this.operations.delete(operationId);
        await this.options.picker.releaseSource({ session: record.source.session }).catch(() => undefined);
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