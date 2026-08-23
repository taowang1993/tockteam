import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useSyncExternalStore, } from 'react';
function remoteValue(result) {
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
function defaultIdentity(vault) {
    const random = () => globalThis.crypto?.randomUUID?.()
        ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return {
        operationId: random(),
        requestId: random(),
        sessionId: random(),
        vault,
        windowId: random(),
    };
}
export class ImportExportReviewController {
    active = null;
    abort = new AbortController();
    disposed = false;
    identity;
    listeners = new Set();
    remote;
    revision = 0;
    snapshot = {
        error: null,
        format: 'markdown-folder',
        kind: 'import',
        phase: 'idle',
        preview: null,
        result: null,
    };
    constructor(remote, vault, identity = () => defaultIdentity(vault)) {
        this.remote = remote;
        this.identity = identity;
    }
    getSnapshot = () => this.snapshot;
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    setFormat(format) {
        if (this.snapshot.phase !== 'idle' && this.snapshot.phase !== 'complete' && this.snapshot.phase !== 'error')
            return;
        this.update({ ...this.snapshot, format });
    }
    async startImport(format = this.snapshot.format) {
        const identity = this.identity();
        const revision = this.begin(identity, 'import', format);
        try {
            const preview = remoteValue(await this.remote['tocktutor-import-export'].inspect({ format, identity }, this.abort.signal));
            if (this.current(revision))
                this.update({ ...this.snapshot, phase: 'review', preview });
        }
        catch (error) {
            this.fail(revision, error);
        }
    }
    async startBackup() {
        const identity = this.identity();
        const revision = this.begin(identity, 'backup', this.snapshot.format);
        try {
            const preview = remoteValue(await this.remote['tocktutor-import-export']['prepare-backup'](identity, this.abort.signal));
            if (this.current(revision))
                this.update({ ...this.snapshot, phase: 'review', preview });
        }
        catch (error) {
            this.fail(revision, error);
        }
    }
    async approveAndCommit() {
        const identity = this.active;
        const preview = this.snapshot.preview;
        if (identity === null || preview === null || this.snapshot.phase !== 'review')
            return;
        const revision = this.revision;
        const binding = {
            operationId: preview.operationId,
            planDigest: preview.planDigest,
            reviewToken: preview.reviewToken,
            sessionId: identity.sessionId,
            vault: identity.vault,
        };
        try {
            this.update({ ...this.snapshot, phase: 'approving' });
            if (this.snapshot.kind === 'backup') {
                remoteValue(await this.remote['tocktutor-import-export']['approve-backup'](binding));
                if (!this.current(revision))
                    return;
                this.update({ ...this.snapshot, phase: 'committing' });
                const result = remoteValue(await this.remote['tocktutor-import-export']['commit-backup'](binding, this.abort.signal));
                if (this.current(revision))
                    this.update({ ...this.snapshot, phase: 'complete', result });
            }
            else {
                remoteValue(await this.remote['tocktutor-import-export']['approve-import'](binding));
                if (!this.current(revision))
                    return;
                this.update({ ...this.snapshot, phase: 'committing' });
                const result = remoteValue(await this.remote['tocktutor-import-export']['commit-import'](binding, this.abort.signal));
                if (this.current(revision))
                    this.update({ ...this.snapshot, phase: 'complete', result });
            }
        }
        catch (error) {
            this.fail(revision, error);
        }
    }
    async cancel() {
        const identity = this.active;
        if (identity === null)
            return;
        this.abort.abort();
        const kind = this.snapshot.kind;
        const revision = ++this.revision;
        try {
            if (kind === 'backup') {
                await this.remote['tocktutor-import-export']['cancel-backup'](identity.operationId, identity.sessionId);
            }
            else {
                await this.remote['tocktutor-import-export']['cancel-import'](identity.operationId, identity.sessionId);
            }
        }
        catch {
            // Local cancellation remains authoritative when transport teardown races unload.
        }
        finally {
            if (!this.disposed && this.revision === revision) {
                this.active = null;
                this.abort = new AbortController();
                this.update({ ...this.snapshot, error: null, phase: 'idle', preview: null, result: null });
            }
        }
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.revision += 1;
        this.abort.abort();
        this.active = null;
        this.snapshot = { ...this.snapshot, error: null, phase: 'idle', preview: null, result: null };
        this.listeners.clear();
    }
    begin(identity, kind, format) {
        this.abort.abort();
        this.abort = new AbortController();
        this.active = identity;
        const revision = ++this.revision;
        this.update({ error: null, format, kind, phase: 'inspecting', preview: null, result: null });
        return revision;
    }
    current(revision) {
        return !this.disposed && this.revision === revision;
    }
    fail(revision, error) {
        if (!this.current(revision))
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
    return (_jsxs("section", { "aria-label": "Import, Backup, and Restore", className: "tocktutor-import-export-review", children: [_jsx("style", { children: PANEL_CSS }), _jsxs("header", { children: [_jsx("p", { className: "tocktutor-import-export-kicker", children: "Reviewed Operations" }), _jsx("h2", { children: "Import, Backup, and Restore" })] }), _jsx("p", { children: "Craft exports use the reviewed Markdown Folder or Markdown ZIP path; no Craft-specific parser changes your files." }), (snapshot.phase === 'idle' || snapshot.phase === 'complete' || snapshot.phase === 'error') && (_jsxs("div", { className: "tocktutor-import-export-start", children: [_jsxs("label", { children: ["Import Format", _jsx("select", { onChange: event => { props.onFormat(event.currentTarget.value); }, value: snapshot.format, children: FORMAT_LABELS.map(([format, label]) => _jsx("option", { value: format, children: label }, format)) })] }), _jsx("button", { onClick: props.onStart, type: "button", children: "Inspect Import" }), _jsx("button", { onClick: props.onStartBackup, type: "button", children: "Create Vault Backup" })] })), busy && (_jsxs("div", { className: "tocktutor-import-export-actions", children: [_jsx("p", { "aria-live": "polite", role: "status", children: snapshot.phase === 'inspecting' ? 'Inspecting the selected source…' : snapshot.phase === 'approving' ? 'Approving the reviewed plan…' : 'Committing through the vault runtime…' }), _jsx("button", { onClick: props.onCancel, type: "button", children: "Cancel" })] })), snapshot.phase === 'review' && preview !== null && (_jsxs("div", { className: "tocktutor-import-export-plan", children: [_jsxs("h3", { children: ["Review ", String('entries' in preview ? preview.entries : items.length), " Planned ", 'entries' in preview ? 'Backup Entries' : items.length === 1 ? 'Item' : 'Items'] }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: "Source" }), _jsx("dd", { children: 'source' in preview ? preview.source.label : 'Active Vault Snapshot' })] }), _jsxs("div", { children: [_jsx("dt", { children: "Total Bytes" }), _jsx("dd", { children: String(preview.totalBytes) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Plan Digest" }), _jsxs("dd", { children: [preview.planDigest.slice(0, 23), "\u2026"] })] })] }), items.length > 0 && _jsx("ul", { children: items.slice(0, 100).map(item => _jsxs("li", { children: [item.destination, " \u2014 ", String(item.size), " bytes"] }, item.id)) }), warnings.map(warning => _jsx("p", { role: "note", children: warning }, warning)), skipped.length > 0 && _jsxs("details", { children: [_jsxs("summary", { children: [String(skipped.length), " Skipped Entries"] }), _jsx("ul", { children: skipped.slice(0, 100).map(entry => _jsxs("li", { children: [entry.label, ": ", entry.reason] }, `${entry.label}:${entry.reason}`)) })] }), _jsxs("div", { className: "tocktutor-import-export-actions", children: [_jsx("button", { onClick: props.onApprove, type: "button", children: "Approve and Commit" }), _jsx("button", { onClick: props.onCancel, type: "button", children: "Cancel" })] })] })), snapshot.phase === 'complete' && snapshot.result !== null && (_jsxs("div", { "aria-live": "polite", className: "tocktutor-import-export-result", role: "status", children: [_jsx("h3", { children: "Operation Result" }), 'committed' in snapshot.result ? (_jsxs(_Fragment, { children: [_jsxs("p", { children: [String(snapshot.result.committed.length), " committed, ", String(snapshot.result.skipped.length), " skipped, and ", String(snapshot.result.failed.length), " failed."] }), _jsxs("p", { children: ["Recovery: ", snapshot.result.recovery.status] }), snapshot.result.committed.length > 0 && _jsx("ul", { children: snapshot.result.committed.slice(0, 100).map(entry => _jsxs("li", { children: ["Committed: ", entry.destination] }, entry.id)) }), snapshot.result.skipped.length > 0 && _jsx("ul", { children: snapshot.result.skipped.slice(0, 100).map(entry => _jsxs("li", { children: ["Skipped: ", entry.destination, " \u2014 ", entry.reason] }, `${entry.destination}:${entry.reason}`)) }), snapshot.result.failed.length > 0 && _jsx("ul", { children: snapshot.result.failed.slice(0, 100).map(entry => _jsxs("li", { children: ["Failed: ", entry.destination, " \u2014 ", entry.reason] }, `${entry.destination}:${entry.reason}`)) })] })) : (_jsxs(_Fragment, { children: [_jsxs("p", { children: ["Backup publication: ", snapshot.result.status] }), _jsxs("p", { children: ["Cleanup: ", snapshot.result.cleanup.status] }), 'residualLabels' in snapshot.result.cleanup && _jsxs("p", { children: [String(snapshot.result.cleanup.residualLabels.length), " bounded recovery labels require review."] })] }))] })), snapshot.phase === 'error' && _jsx("p", { role: "alert", children: snapshot.error ?? 'The reviewed operation failed.' })] }));
}
const INACTIVE_VAULT = { generation: 0, id: 'inactive' };
export function ImportExportReviewPanel(props) {
    const vault = props.vault ?? INACTIVE_VAULT;
    const vaultGeneration = vault.generation;
    const vaultId = vault.id;
    const controller = useMemo(() => new ImportExportReviewController(props.remote, { generation: vaultGeneration, id: vaultId }), [props.remote, vaultGeneration, vaultId]);
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    useEffect(() => () => { controller.dispose(); }, [controller]);
    if (props.vault === null)
        return null;
    return (_jsx(ImportExportReviewPanelView, { onApprove: () => { void controller.approveAndCommit(); }, onCancel: () => { void controller.cancel(); }, onFormat: format => { controller.setFormat(format); }, onStart: () => { void controller.startImport(); }, onStartBackup: () => { void controller.startBackup(); }, snapshot: snapshot }));
}
const PANEL_CSS = `
.tocktutor-import-export-review { border: 1px solid var(--tt-border); border-radius: 10px; display: grid; gap: 12px; padding: 14px; }
.tocktutor-import-export-review h2, .tocktutor-import-export-review h3, .tocktutor-import-export-review p { margin: 0; }
.tocktutor-import-export-kicker { color: var(--tt-muted); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.tocktutor-import-export-start, .tocktutor-import-export-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tocktutor-import-export-start label { display: grid; flex: 1 1 220px; font-size: 12px; gap: 4px; }
.tocktutor-import-export-review button, .tocktutor-import-export-review select { background: var(--tt-panel); border: 1px solid var(--tt-border); border-radius: 6px; color: inherit; min-height: 32px; padding: 5px 9px; }
.tocktutor-import-export-plan { display: grid; gap: 10px; }
.tocktutor-import-export-plan dl { display: grid; gap: 4px; margin: 0; }
.tocktutor-import-export-plan dl div { display: flex; gap: 8px; justify-content: space-between; }
.tocktutor-import-export-plan dd { margin: 0; overflow-wrap: anywhere; text-align: right; }
.tocktutor-import-export-plan ul { margin: 0; max-height: 180px; overflow: auto; padding-left: 18px; }
`;
//# sourceMappingURL=review-panel.js.map