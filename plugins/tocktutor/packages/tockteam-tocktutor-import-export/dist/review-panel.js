import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useSyncExternalStore, } from 'react';
function remoteValue(result) {
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
const callerBridge = {
    async authorize(operation) {
        const root = globalThis;
        const bridge = root.window?.dshDesktop?.tockTutor;
        if (bridge === undefined)
            throw new Error('This operation is available only in the trusted TockTeam Desktop window.');
        return await bridge.authorize(operation);
    },
};
export class ImportExportReviewController {
    abort = new AbortController();
    approvedOperationId;
    authoritativeCommit;
    bridge;
    disposed = false;
    listeners = new Set();
    remote;
    retryStart;
    revision = 0;
    snapshot = {
        error: null,
        format: 'markdown-folder',
        kind: 'import',
        phase: 'idle',
        preview: null,
        result: null,
    };
    constructor(remote, bridge = callerBridge) {
        this.remote = remote;
        this.bridge = bridge;
    }
    getSnapshot = () => this.snapshot;
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    setFormat(format) {
        if (this.snapshot.phase !== 'idle' && this.snapshot.phase !== 'complete' && this.snapshot.phase !== 'error')
            return;
        if (this.retryStart !== undefined && this.retryStart.format !== format)
            return;
        this.update({ ...this.snapshot, format });
    }
    async startImport(format = this.snapshot.format) {
        if (!this.canStart('import', format))
            return;
        const revision = this.begin('import', format);
        try {
            const operation = format === 'restore-backup' ? 'restore-backup' : 'import-source';
            const authorization = await this.startAuthorization('import', format, operation);
            if (!this.current(revision))
                return;
            const response = await this.remote['tocktutor-import-export'].inspect({ authorization, format }, this.abort.signal);
            if (!response.ok)
                this.retryStart = undefined;
            const preview = remoteValue(response);
            if (this.current(revision)) {
                this.approvedOperationId = undefined;
                this.retryStart = undefined;
                this.update({ ...this.snapshot, phase: 'review', preview });
            }
        }
        catch (error) {
            this.fail(revision, error);
        }
    }
    async startBackup() {
        const format = this.snapshot.format;
        if (!this.canStart('backup', format))
            return;
        const revision = this.begin('backup', format);
        try {
            const authorization = await this.startAuthorization('backup', format, 'backup');
            if (!this.current(revision))
                return;
            const response = await this.remote['tocktutor-import-export']['prepare-backup']({ authorization }, this.abort.signal);
            if (!response.ok)
                this.retryStart = undefined;
            const preview = remoteValue(response);
            if (this.current(revision)) {
                this.approvedOperationId = undefined;
                this.retryStart = undefined;
                this.update({ ...this.snapshot, phase: 'review', preview });
            }
        }
        catch (error) {
            this.fail(revision, error);
        }
    }
    approveAndCommit() {
        if (this.authoritativeCommit !== undefined)
            return this.authoritativeCommit;
        const run = this.commitReviewed();
        this.authoritativeCommit = run;
        return run.finally(() => {
            if (this.authoritativeCommit === run)
                this.authoritativeCommit = undefined;
        });
    }
    async cancel() {
        if (this.snapshot.phase === 'approving' || this.snapshot.phase === 'committing') {
            await this.authoritativeCommit;
            return;
        }
        this.abort.abort();
        const kind = this.snapshot.kind;
        const preview = this.snapshot.preview;
        const retry = this.retryStart;
        const revision = ++this.revision;
        try {
            if (preview !== null)
                await this.cancelPreview(kind, preview);
            else if (retry !== undefined)
                await this.abandonRetry(retry);
        }
        catch {
            // Host expiry and unload remain bounded fallbacks when transport teardown races cancellation.
        }
        finally {
            if (!this.disposed && this.revision === revision) {
                this.abort = new AbortController();
                this.approvedOperationId = undefined;
                this.retryStart = undefined;
                this.update({ ...this.snapshot, error: null, phase: 'idle', preview: null, result: null });
            }
        }
    }
    dispose() {
        if (this.disposed)
            return;
        const { kind, phase, preview } = this.snapshot;
        const retry = this.retryStart;
        this.disposed = true;
        if (phase !== 'committing')
            this.abort.abort();
        if (phase === 'committing') {
            this.listeners.clear();
            return;
        }
        this.revision += 1;
        if (preview !== null && phase !== 'complete') {
            void this.cancelPreview(kind, preview).catch(() => undefined);
        }
        else if (preview === null && retry !== undefined) {
            void this.abandonRetry(retry).catch(() => undefined);
        }
        this.snapshot = { ...this.snapshot, error: null, phase: 'idle', preview: null, result: null };
        this.listeners.clear();
    }
    async authorize(operation) {
        const result = await this.bridge.authorize(operation);
        if (typeof result?.authorization !== 'string' || result.authorization === ''
            || new TextEncoder().encode(result.authorization).byteLength > 1_024) {
            throw new Error('Desktop authorization was rejected.');
        }
        return result.authorization;
    }
    canStart(kind, format) {
        if (this.retryStart === undefined
            || (this.retryStart.kind === kind && this.retryStart.format === format))
            return true;
        this.update({
            ...this.snapshot,
            error: `Retry the interrupted ${this.retryStart.kind} operation before starting another operation.`,
            phase: 'error',
        });
        return false;
    }
    async abandonRetry(retry) {
        if (retry.kind === 'backup') {
            remoteValue(await this.remote['tocktutor-import-export']['abandon-backup']({ authorization: retry.authorization }));
        }
        else {
            remoteValue(await this.remote['tocktutor-import-export']['abandon-import']({
                authorization: retry.authorization,
                format: retry.format,
            }));
        }
    }
    async cancelPreview(kind, preview) {
        const request = { operationId: preview.operationId, reviewToken: preview.reviewToken };
        if (kind === 'backup')
            remoteValue(await this.remote['tocktutor-import-export']['cancel-backup'](request));
        else
            remoteValue(await this.remote['tocktutor-import-export']['cancel-import'](request));
    }
    async commitReviewed() {
        const preview = this.snapshot.preview;
        if (preview === null || (this.snapshot.phase !== 'review' && this.snapshot.phase !== 'error'))
            return;
        const revision = this.revision;
        const binding = {
            operationId: preview.operationId,
            planDigest: preview.planDigest,
            reviewToken: preview.reviewToken,
        };
        try {
            this.update({ ...this.snapshot, phase: 'approving' });
            if (this.snapshot.kind === 'backup') {
                if (this.approvedOperationId !== preview.operationId) {
                    remoteValue(await this.remote['tocktutor-import-export']['approve-backup'](binding));
                    this.approvedOperationId = preview.operationId;
                }
                if (!this.current(revision))
                    return;
                this.update({ ...this.snapshot, phase: 'committing' });
                const result = remoteValue(await this.remote['tocktutor-import-export']['commit-backup'](binding, this.abort.signal));
                if (this.revision === revision) {
                    this.approvedOperationId = undefined;
                    this.update({ ...this.snapshot, phase: 'complete', result });
                }
            }
            else {
                if (this.approvedOperationId !== preview.operationId) {
                    remoteValue(await this.remote['tocktutor-import-export']['approve-import'](binding));
                    this.approvedOperationId = preview.operationId;
                }
                if (!this.current(revision))
                    return;
                this.update({ ...this.snapshot, phase: 'committing' });
                const result = remoteValue(await this.remote['tocktutor-import-export']['commit-import'](binding, this.abort.signal));
                if (this.revision === revision) {
                    this.approvedOperationId = undefined;
                    this.update({ ...this.snapshot, phase: 'complete', result });
                }
            }
        }
        catch (error) {
            this.fail(revision, error, true);
        }
    }
    begin(kind, format) {
        this.abort.abort();
        this.abort = new AbortController();
        const revision = ++this.revision;
        this.update({ error: null, format, kind, phase: 'inspecting', preview: null, result: null });
        return revision;
    }
    current(revision) {
        return !this.disposed && this.revision === revision;
    }
    async startAuthorization(kind, format, operation) {
        if (this.retryStart !== undefined)
            return this.retryStart.authorization;
        const authorization = await this.authorize(operation);
        this.retryStart = { authorization, format, kind };
        return authorization;
    }
    fail(revision, error, preserveDisposed = false) {
        if (this.revision !== revision || (this.disposed && !preserveDisposed))
            return;
        const message = error instanceof Error && error.message.trim() !== ''
            ? error.message.slice(0, 512)
            : 'The reviewed operation failed.';
        this.update({ ...this.snapshot, error: message, phase: 'error' });
    }
    update(snapshot) {
        this.snapshot = snapshot;
        for (const listener of this.listeners)
            listener();
    }
}
const FORMAT_LABELS = [
    ['markdown-folder', 'Markdown Folder'],
    ['markdown-zip', 'Markdown ZIP'],
    ['html', 'HTML, Notion, or Apple Notes Export'],
    ['csv', 'CSV'],
    ['apple-journal', 'Apple Journal'],
    ['bear-backup', 'Bear Backup'],
    ['evernote', 'Evernote ENEX'],
    ['google-keep', 'Google Keep'],
    ['roam-research', 'Roam Research'],
    ['textbundle', 'Textbundle or Textpack'],
    ['restore-backup', 'TockTutor Backup Restore'],
];
export function ImportExportReviewPanelView(props) {
    const { snapshot } = props;
    const preview = snapshot.preview;
    const items = preview !== null && 'items' in preview ? preview.items : [];
    const skipped = preview !== null && 'skipped' in preview ? preview.skipped : [];
    const warnings = preview !== null && 'warnings' in preview ? preview.warnings : [];
    const busy = snapshot.phase === 'inspecting' || snapshot.phase === 'approving' || snapshot.phase === 'committing';
    return (_jsxs("section", { "aria-label": "Import, Backup, and Restore", className: "tocktutor-import-export-review grid gap-3 rounded-[10px] border border-[var(--tt-border)] p-3.5 [&_h2]:m-0 [&_h3]:m-0 [&_p]:m-0 [&_button]:min-h-8 [&_button]:rounded-md [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-[9px] [&_button]:py-[5px] [&_button]:text-inherit [&_select]:min-h-8 [&_select]:rounded-md [&_select]:border [&_select]:border-[var(--tt-border)] [&_select]:bg-[var(--tt-panel)] [&_select]:px-[9px] [&_select]:py-[5px] [&_select]:text-inherit", children: [_jsxs("header", { children: [_jsx("p", { className: "tocktutor-import-export-kicker text-[11px] font-bold tracking-[.08em] text-[var(--tt-muted)] uppercase", children: "Reviewed Operations" }), _jsx("h2", { children: "Import, Backup, and Restore" })] }), _jsx("p", { children: "Craft exports use the reviewed Markdown Folder or Markdown ZIP path; no Craft-specific parser changes your files." }), (snapshot.phase === 'idle' || snapshot.phase === 'complete' || (snapshot.phase === 'error' && preview === null)) && (_jsxs("div", { className: "tocktutor-import-export-start flex flex-wrap gap-2", children: [_jsxs("label", { className: "grid flex-[1_1_220px] gap-1 text-xs", children: ["Import Format", _jsx("select", { onChange: event => { props.onFormat(event.currentTarget.value); }, value: snapshot.format, children: FORMAT_LABELS.map(([format, label]) => _jsx("option", { value: format, children: label }, format)) })] }), _jsx("button", { onClick: props.onStart, type: "button", children: "Inspect Import" }), _jsx("button", { onClick: props.onStartBackup, type: "button", children: "Create Vault Backup" })] })), busy && (_jsxs("div", { className: "tocktutor-import-export-actions flex flex-wrap gap-2", children: [_jsx("p", { "aria-live": "polite", role: "status", children: snapshot.phase === 'inspecting' ? 'Inspecting the selected source…' : snapshot.phase === 'approving' ? 'Approving the reviewed plan…' : 'Committing through the vault runtime…' }), _jsx("button", { onClick: props.onCancel, type: "button", children: "Cancel" })] })), snapshot.phase === 'review' && preview !== null && (_jsxs("div", { className: "tocktutor-import-export-plan grid gap-2.5", children: [_jsxs("h3", { children: ["Review ", String('entries' in preview ? preview.entries : items.length), " Planned ", 'entries' in preview ? 'Backup Entries' : items.length === 1 ? 'Item' : 'Items'] }), _jsxs("dl", { className: "m-0 grid gap-1", children: [_jsxs("div", { className: "flex justify-between gap-2", children: [_jsx("dt", { children: "Source" }), _jsx("dd", { className: "m-0 text-right [overflow-wrap:anywhere]", children: 'source' in preview ? preview.source.label : 'Active Vault Snapshot' })] }), _jsxs("div", { className: "flex justify-between gap-2", children: [_jsx("dt", { children: "Total Bytes" }), _jsx("dd", { className: "m-0 text-right [overflow-wrap:anywhere]", children: String(preview.totalBytes) })] }), _jsxs("div", { className: "flex justify-between gap-2", children: [_jsx("dt", { children: "Plan Digest" }), _jsxs("dd", { className: "m-0 text-right [overflow-wrap:anywhere]", children: [preview.planDigest.slice(0, 23), "\u2026"] })] })] }), items.length > 0 && _jsx("ul", { className: "m-0 max-h-[180px] overflow-auto pl-[18px]", children: items.slice(0, 100).map(item => _jsxs("li", { children: [item.destination, " \u2014 ", String(item.size), " bytes"] }, item.id)) }), warnings.map(warning => _jsx("p", { role: "note", children: warning }, warning)), skipped.length > 0 && _jsxs("details", { children: [_jsxs("summary", { children: [String(skipped.length), " Skipped Entries"] }), _jsx("ul", { className: "m-0 max-h-[180px] overflow-auto pl-[18px]", children: skipped.slice(0, 100).map(entry => _jsxs("li", { children: [entry.label, ": ", entry.reason] }, `${entry.label}:${entry.reason}`)) })] }), _jsxs("div", { className: "tocktutor-import-export-actions flex flex-wrap gap-2", children: [_jsx("button", { onClick: props.onApprove, type: "button", children: "Approve and Commit" }), _jsx("button", { onClick: props.onCancel, type: "button", children: "Cancel" })] })] })), snapshot.phase === 'complete' && snapshot.result !== null && (_jsxs("div", { "aria-live": "polite", className: "tocktutor-import-export-result", role: "status", children: [_jsx("h3", { children: "Operation Result" }), 'committed' in snapshot.result ? (_jsxs(_Fragment, { children: [_jsxs("p", { children: [String(snapshot.result.committed.length), " committed, ", String(snapshot.result.skipped.length), " skipped, and ", String(snapshot.result.failed.length), " failed."] }), _jsxs("p", { children: ["Recovery: ", snapshot.result.recovery.status] }), snapshot.result.committed.length > 0 && _jsx("ul", { children: snapshot.result.committed.slice(0, 100).map(entry => _jsxs("li", { children: ["Committed: ", entry.destination] }, entry.id)) }), snapshot.result.skipped.length > 0 && _jsx("ul", { children: snapshot.result.skipped.slice(0, 100).map(entry => _jsxs("li", { children: ["Skipped: ", entry.destination, " \u2014 ", entry.reason] }, `${entry.destination}:${entry.reason}`)) }), snapshot.result.failed.length > 0 && _jsx("ul", { children: snapshot.result.failed.slice(0, 100).map(entry => _jsxs("li", { children: ["Failed: ", entry.destination, " \u2014 ", entry.reason] }, `${entry.destination}:${entry.reason}`)) })] })) : (_jsxs(_Fragment, { children: [_jsxs("p", { children: ["Backup publication: ", snapshot.result.status] }), _jsxs("p", { children: ["Cleanup: ", snapshot.result.cleanup.status] }), 'residualLabels' in snapshot.result.cleanup && _jsxs("p", { children: [String(snapshot.result.cleanup.residualLabels.length), " bounded recovery labels require review."] })] }))] })), snapshot.phase === 'error' && (_jsxs("div", { className: "tocktutor-import-export-actions flex flex-wrap gap-2", children: [_jsx("p", { role: "alert", children: snapshot.error ?? 'The reviewed operation failed.' }), preview !== null && _jsx("button", { onClick: props.onApprove, type: "button", children: "Retry Reviewed Commit" }), preview !== null && _jsx("button", { onClick: props.onCancel, type: "button", children: "Cancel" })] }))] }));
}
export function ImportExportReviewPanel(props) {
    const vaultGeneration = props.vault?.generation ?? null;
    const vaultId = props.vault?.id ?? null;
    const controller = useMemo(() => new ImportExportReviewController(props.remote), [props.remote]);
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    useEffect(() => { void controller.cancel(); }, [controller, vaultGeneration, vaultId]);
    useEffect(() => () => { controller.dispose(); }, [controller]);
    if (props.vault === null)
        return null;
    return (_jsx(ImportExportReviewPanelView, { onApprove: () => { void controller.approveAndCommit(); }, onCancel: () => { void controller.cancel(); }, onFormat: format => { controller.setFormat(format); }, onStart: () => { void controller.startImport(); }, onStartBackup: () => { void controller.startBackup(); }, snapshot: snapshot }));
}
//# sourceMappingURL=review-panel.js.map