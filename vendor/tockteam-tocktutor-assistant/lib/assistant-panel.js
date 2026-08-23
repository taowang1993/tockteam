import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, } from 'react';
import { redactBoundaryText } from "./context.js";
const EMPTY_CONVERSATION = Object.freeze({
    lastAgentError: null,
    nodes: Object.freeze([]),
    openError: null,
    openState: 'cold',
    partial: null,
    promptError: null,
    running: false,
    runningCalls: Object.freeze([]),
});
function remoteValue(result) {
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
const emptySubscribe = () => () => { };
const MAX_TRANSCRIPT_ENTRIES = 20;
const MAX_TRANSCRIPT_ENTRY_CHARS = 2_000;
const MAX_TRANSCRIPT_CHARS = 16_000;
function record(value) {
    return value !== null && typeof value === 'object' ? value : null;
}
function boundedText(value, limit) {
    const redacted = redactBoundaryText(value);
    return redacted.length <= limit
        ? redacted
        : `${redacted.slice(0, Math.max(0, limit - 1))}…`;
}
function blockText(value, discriminator) {
    if (!Array.isArray(value))
        return '';
    return value.flatMap(block => {
        const candidate = record(block);
        return candidate?.[discriminator] === 'text' && typeof candidate.text === 'string'
            ? [candidate.text]
            : [];
    }).join('');
}
function transcriptEntry(value, index) {
    const node = record(value);
    if (node === null || typeof node.kind !== 'string')
        return null;
    const key = `${typeof node.seq === 'number' ? String(node.seq) : String(index)}-${node.kind}`;
    if (node.kind === 'user' || node.kind === 'steering') {
        const text = blockText(node.content, 'type');
        return text === '' ? null : { key, label: node.kind === 'user' ? 'You' : 'Steering', text };
    }
    if (node.kind === 'assistant') {
        const text = blockText(node.blocks, 'kind');
        return text === '' ? null : { key, label: 'Assistant', text };
    }
    if (node.kind === 'tool-result') {
        const call = record(node.call);
        const name = typeof call?.name === 'string'
            ? boundedText(call.name, 127)
            : typeof node.callId === 'string' ? boundedText(node.callId, 127) : 'Tool';
        return {
            key,
            label: 'Tool',
            text: `${name} · ${node.isError === true ? 'Failed' : 'Completed'}`,
            toolStatus: true,
        };
    }
    if (node.kind === 'turn-error' && typeof node.message === 'string') {
        return { key, label: 'Assistant Error', text: node.message };
    }
    return null;
}
function auditTime(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime()))
        return null;
    return { dateTime: date.toISOString(), label: date.toLocaleString() };
}
function projectTranscript(nodes) {
    const entries = nodes.slice(-100)
        .map(transcriptEntry)
        .filter((entry) => entry !== null)
        .slice(-MAX_TRANSCRIPT_ENTRIES);
    let remaining = MAX_TRANSCRIPT_CHARS;
    return entries.flatMap(entry => {
        if (remaining <= 0)
            return [];
        const text = boundedText(entry.text, Math.min(MAX_TRANSCRIPT_ENTRY_CHARS, remaining));
        remaining -= text.length;
        return [{ ...entry, text }];
    });
}
/** Inline, authority-free browser presentation for the selected Agent and Host review queue. */
export function TockTutorAssistantPanel(props) {
    const [settings, setSettings] = useState(null);
    const [audit, setAudit] = useState(null);
    const [auditOffset, setAuditOffset] = useState(0);
    const [message, setMessage] = useState('');
    const [proposals, setProposals] = useState(null);
    const [proposalOffset, setProposalOffset] = useState(0);
    const [decision, setDecision] = useState(null);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const pending = useRef(new Set());
    const reviewPending = useRef(new Set());
    const reviewControllers = reviewPending.current;
    const statusRef = useRef(null);
    const reviewKey = `${props.vault?.id ?? 'inactive'}:${String(props.vault?.generation ?? 0)}:${props.activePath ?? ''}`;
    const routeRef = useRef(null);
    if (routeRef.current === null)
        routeRef.current = { epoch: 0, key: reviewKey };
    else if (routeRef.current.key !== reviewKey) {
        routeRef.current = { epoch: routeRef.current.epoch + 1, key: reviewKey };
    }
    const routeEpoch = routeRef.current.epoch;
    const auditPage = audit?.key === reviewKey ? audit.value : null;
    const proposalPage = proposals?.key === reviewKey ? proposals.value : null;
    const activeDecision = decision?.routeEpoch === routeEpoch ? decision : null;
    const current = useSyncExternalStore(props.sessions.list.subscribe, () => props.sessions.list.getSnapshot().current, () => undefined);
    const conversation = current === undefined ? undefined : props.sessions.binding(current)?.session;
    const transcript = useSyncExternalStore(conversation?.subscribe ?? emptySubscribe, conversation?.getSnapshot ?? (() => EMPTY_CONVERSATION), () => EMPTY_CONVERSATION);
    const loadAudit = useCallback((offset = 0) => {
        const controller = new AbortController();
        pending.current.add(controller);
        reviewPending.current.add(controller);
        return props.remote.tocktutorAssistant.audit({ limit: 20, offset }, controller.signal)
            .then(remoteValue)
            .then(value => {
            if (!controller.signal.aborted) {
                setAudit({ key: reviewKey, value });
                setAuditOffset(offset);
            }
        })
            .catch(error => {
            if (!controller.signal.aborted)
                setStatus(error instanceof Error ? error.message : 'Audit history could not be loaded.');
        })
            .finally(() => {
            pending.current.delete(controller);
            reviewPending.current.delete(controller);
        });
    }, [props.remote, reviewKey]);
    const loadProposals = useCallback((offset = 0) => {
        const controller = new AbortController();
        pending.current.add(controller);
        reviewPending.current.add(controller);
        return props.remote.tocktutorAssistant.listProposals({ limit: 20, offset }, controller.signal)
            .then(remoteValue)
            .then(value => {
            if (!controller.signal.aborted) {
                setProposals({ key: reviewKey, value });
                setProposalOffset(offset);
            }
        })
            .catch(error => {
            if (!controller.signal.aborted)
                setStatus(error instanceof Error ? error.message : 'Staged proposals could not be loaded.');
        })
            .finally(() => {
            pending.current.delete(controller);
            reviewPending.current.delete(controller);
        });
    }, [props.remote, reviewKey]);
    useEffect(() => {
        const controller = new AbortController();
        pending.current.add(controller);
        void props.remote.tocktutorAssistant.currentSettings(controller.signal)
            .then(remoteValue)
            .then(value => {
            if (!controller.signal.aborted) {
                setSettings(value);
            }
        })
            .catch(error => {
            if (!controller.signal.aborted)
                setStatus(error instanceof Error ? error.message : 'Assistant settings could not be loaded.');
        })
            .finally(() => { pending.current.delete(controller); });
        return () => { controller.abort(); };
    }, [props.remote]);
    useEffect(() => {
        void loadAudit();
        void loadProposals();
        return () => {
            for (const controller of reviewControllers)
                controller.abort();
            reviewControllers.clear();
        };
    }, [loadAudit, loadProposals, reviewControllers]);
    useEffect(() => () => {
        for (const controller of pending.current)
            controller.abort();
        pending.current.clear();
    }, [pending]);
    const decideProposal = (proposal, action) => {
        if (activeDecision !== null)
            return;
        if (proposal.expiresAt <= Date.now()) {
            setStatus('This proposal has expired. Refresh the review queue.');
            statusRef.current?.focus();
            void loadProposals();
            return;
        }
        const controller = new AbortController();
        pending.current.add(controller);
        reviewPending.current.add(controller);
        setDecision({ action, routeEpoch, proposalId: proposal.proposalId });
        setStatus(action === 'approve' ? 'Approving proposal…' : 'Rejecting proposal…');
        const request = action === 'approve'
            ? props.remote.tocktutorAssistant.approveProposal({ proposalId: proposal.proposalId }, controller.signal)
            : props.remote.tocktutorAssistant.rejectProposal({
                proposalId: proposal.proposalId,
                reason: 'Rejected from the TockTutor review panel.',
            }, controller.signal);
        void request
            .then(remoteValue)
            .then(() => {
            if (controller.signal.aborted)
                return;
            setStatus(action === 'approve'
                ? `${proposal.destination} was ${proposal.operation === 'create' ? 'created' : 'saved'}.`
                : `${proposal.destination} was rejected.`);
            statusRef.current?.focus();
            void loadAudit();
            void loadProposals();
        })
            .catch(error => {
            if (!controller.signal.aborted) {
                setStatus(error instanceof Error ? error.message : 'The proposal decision failed.');
                statusRef.current?.focus();
                void loadAudit();
                void loadProposals();
            }
        })
            .finally(() => {
            pending.current.delete(controller);
            reviewPending.current.delete(controller);
            setDecision(current => current?.routeEpoch === routeEpoch
                && current.proposalId === proposal.proposalId
                ? null
                : current);
        });
    };
    const saveSettings = (event) => {
        event.preventDefault();
        if (settings === null || settingsSaving)
            return;
        const controller = new AbortController();
        pending.current.add(controller);
        setSettingsSaving(true);
        setStatus('Saving settings…');
        void props.remote.tocktutorAssistant.saveSettings(settings, controller.signal)
            .then(remoteValue)
            .then(value => {
            if (!controller.signal.aborted) {
                setSettings(value);
                setStatus('Settings saved.');
            }
        })
            .catch(error => {
            if (!controller.signal.aborted)
                setStatus(error instanceof Error ? error.message : 'Settings could not be saved.');
        })
            .finally(() => {
            pending.current.delete(controller);
            if (!controller.signal.aborted)
                setSettingsSaving(false);
        });
    };
    const send = (event) => {
        event.preventDefault();
        const text = message.trim();
        if (text === '')
            return;
        if (current === undefined) {
            setStatus('Select an active conversation before sending a message.');
            return;
        }
        const scope = props.sessions.scope(current);
        if (scope === undefined) {
            setStatus('The selected conversation is unavailable.');
            return;
        }
        const controller = new AbortController();
        pending.current.add(controller);
        setStatus('Sending message…');
        const requestText = props.activePath === null ? text : `Active note: ${props.activePath}\n\n${text}`;
        void scope.remote.tocktutorAssistant.continueTurn({ mode: 'followup', text: requestText }, controller.signal)
            .then(remoteValue)
            .then(() => {
            if (!controller.signal.aborted) {
                setMessage('');
                setStatus('Message accepted. Live output appears below.');
            }
        })
            .catch(error => {
            if (!controller.signal.aborted)
                setStatus(error instanceof Error ? error.message : 'The message could not be sent.');
        })
            .finally(() => { pending.current.delete(controller); });
    };
    const partial = boundedText(blockText(transcript.partial?.blocks, 'kind'), MAX_TRANSCRIPT_ENTRY_CHARS);
    const transcriptEntries = projectTranscript(transcript.nodes);
    const transcriptError = transcript.promptError?.error.message
        ?? transcript.openError?.message
        ?? transcript.lastAgentError;
    const renderedAt = Date.now();
    return (_jsxs("section", { "aria-label": "TockTutor Assistant", className: "tocktutor-assistant-panel", children: [_jsx("style", { children: PANEL_CSS }), _jsxs("header", { children: [_jsx("p", { className: "tocktutor-assistant-kicker", children: "Assistant" }), _jsx("h2", { children: "TockTutor" }), _jsx("p", { children: props.activePath ?? 'No active note' })] }), _jsx("section", { "aria-label": "Provider Settings", children: _jsxs("form", { onSubmit: saveSettings, children: [_jsxs("label", { children: ["Provider", _jsx("input", { "aria-label": "Provider", disabled: settings === null || settingsSaving, maxLength: 127, onChange: event => {
                                        setSettings(currentSettings => currentSettings === null
                                            ? null
                                            : { ...currentSettings, provider: event.target.value });
                                    }, value: settings?.provider ?? '' })] }), _jsxs("label", { children: ["Model", _jsx("input", { "aria-label": "Model", disabled: settings === null || settingsSaving, maxLength: 127, onChange: event => {
                                        setSettings(currentSettings => currentSettings === null
                                            ? null
                                            : { ...currentSettings, model: event.target.value });
                                    }, value: settings?.model ?? '' })] }), _jsxs("label", { children: ["Write Permission", _jsxs("select", { "aria-label": "Write Permission", disabled: settings === null || settingsSaving, onChange: event => {
                                        const writePermission = event.target.value === 'propose' ? 'propose' : 'read-only';
                                        setSettings(currentSettings => currentSettings === null
                                            ? null
                                            : { ...currentSettings, writePermission });
                                    }, value: settings?.writePermission ?? 'read-only', children: [_jsx("option", { value: "read-only", children: "Read Only" }), _jsx("option", { value: "propose", children: "Propose Writes" })] })] }), _jsx("button", { disabled: settings === null || settingsSaving, type: "submit", children: settingsSaving ? 'Saving…' : 'Save Settings' })] }) }), _jsxs("section", { "aria-label": "Live Assistant Output", "aria-live": "polite", children: [transcriptEntries.map(entry => entry.toolStatus === true
                        ? _jsx("p", { children: entry.text }, entry.key)
                        : (_jsxs("article", { "aria-label": `${entry.label} transcript entry`, children: [_jsx("p", { className: "tocktutor-assistant-kicker", children: entry.label }), _jsx("p", { children: entry.text })] }, entry.key))), partial !== '' && (_jsxs("article", { "aria-label": "Streaming assistant transcript entry", children: [_jsx("p", { className: "tocktutor-assistant-kicker", children: "Assistant \u00B7 Writing" }), _jsx("p", { children: partial })] })), transcript.runningCalls.slice(0, 20).map(call => (_jsxs("p", { children: [boundedText(call.name, 127), " \u00B7 Reading\u2026"] }, call.callId))), transcriptError !== null && transcriptError !== undefined && (_jsx("p", { role: "alert", children: boundedText(transcriptError, 500) }))] }), _jsxs("section", { "aria-label": "Staged Proposals", children: [_jsx("h2", { children: "Staged Proposals" }), proposalPage === null && _jsx("p", { children: "Loading staged proposals\u2026" }), proposalPage !== null && proposalPage.proposals.length === 0 && _jsx("p", { children: "No staged proposals." }), proposalPage?.proposals.slice(0, 20).map(proposal => {
                        const expired = proposal.expiresAt <= renderedAt;
                        const pendingDecision = activeDecision?.proposalId === proposal.proposalId;
                        const operation = proposal.operation === 'create' ? 'Create' : 'Update';
                        return (_jsxs("article", { children: [_jsxs("h3", { children: [operation, " ", proposal.destination] }), _jsxs("p", { children: [String(proposal.contentChars), " characters \u00B7 ", String(proposal.contentBytes), " bytes"] }), _jsx("pre", { children: boundedText(proposal.preview, 1_000) }), proposal.warnings.length > 0 && (_jsx("ul", { "aria-label": `Warnings for ${proposal.destination}`, children: proposal.warnings.map((warning, index) => (_jsx("li", { children: boundedText(warning, 500) }, String(index)))) })), proposal.skippedEntryCount > 0 && (_jsxs("p", { children: [String(proposal.skippedEntryCount), " skipped ", proposal.skippedEntryCount === 1 ? 'entry' : 'entries', proposal.skippedEntries.length > 0 ? `: ${proposal.skippedEntries.join(', ')}` : ''] })), _jsxs("div", { children: [_jsx("button", { "aria-label": expired ? undefined : `Approve ${operation} ${proposal.destination}`, disabled: expired || activeDecision !== null, onClick: () => { decideProposal(proposal, 'approve'); }, type: "button", children: expired ? 'Expired' : pendingDecision && activeDecision.action === 'approve' ? 'Approving…' : 'Approve' }), _jsx("button", { "aria-label": `Reject ${operation} ${proposal.destination}`, disabled: expired || activeDecision !== null, onClick: () => { decideProposal(proposal, 'reject'); }, type: "button", children: pendingDecision && activeDecision.action === 'reject' ? 'Rejecting…' : 'Reject' })] })] }, proposal.proposalId));
                    }), proposalPage !== null && (proposalOffset > 0 || proposalPage.nextOffset !== null) && (_jsxs("nav", { "aria-label": "Proposal Pages", children: [_jsx("button", { "aria-label": "Previous Proposal Page", disabled: proposalOffset === 0, onClick: () => { void loadProposals(Math.max(0, proposalOffset - 20)); }, type: "button", children: "Previous" }), _jsx("button", { "aria-label": "Next Proposal Page", disabled: proposalPage.nextOffset === null, onClick: () => { if (proposalPage.nextOffset !== null)
                                    void loadProposals(proposalPage.nextOffset); }, type: "button", children: "Next" })] }))] }), _jsxs("section", { "aria-label": "Audit History", children: [_jsx("h2", { children: "Audit History" }), auditPage === null && _jsx("p", { children: "Loading audit history\u2026" }), auditPage !== null && auditPage.entries.length === 0 && _jsx("p", { children: "No audit entries." }), auditPage?.dropped !== undefined && auditPage.dropped > 0 && (_jsxs("p", { children: [String(auditPage.dropped), " older audit ", auditPage.dropped === 1 ? 'entry was' : 'entries were', " dropped by bounded retention."] })), auditPage?.entries.slice(0, 20).map(entry => {
                        const outcome = entry.outcome.split('-').map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
                        const operation = entry.operation === 'create' ? 'Create' : 'Update';
                        const time = auditTime(entry.timestamp);
                        return (_jsxs("article", { "aria-label": `Audit entry ${entry.auditId}`, children: [_jsxs("h3", { children: [outcome, " ", operation, " ", entry.destination] }), time === null
                                    ? _jsx("span", { children: "Time Unavailable" })
                                    : _jsx("time", { dateTime: time.dateTime, children: time.label }), entry.reason !== undefined && _jsx("p", { children: boundedText(entry.reason, 500) })] }, entry.auditId));
                    }), auditPage !== null && (auditOffset > 0 || auditPage.nextOffset !== null) && (_jsxs("nav", { "aria-label": "Audit Pages", children: [_jsx("button", { "aria-label": "Previous Audit Page", disabled: auditOffset === 0, onClick: () => { void loadAudit(Math.max(0, auditOffset - 20)); }, type: "button", children: "Previous" }), _jsx("button", { "aria-label": "Next Audit Page", disabled: auditPage.nextOffset === null, onClick: () => { if (auditPage.nextOffset !== null)
                                    void loadAudit(auditPage.nextOffset); }, type: "button", children: "Next" })] }))] }), _jsxs("form", { onSubmit: send, children: [_jsx("label", { htmlFor: "tocktutor-assistant-message", children: "Message" }), _jsx("textarea", { id: "tocktutor-assistant-message", maxLength: 8_000, onChange: event => { setMessage(event.target.value); }, value: message }), _jsx("button", { disabled: message.trim() === '', type: "submit", children: "Send" })] }), _jsx("p", { "aria-live": "polite", ref: statusRef, role: "status", tabIndex: -1, children: boundedText(status ?? (settings === null ? 'Loading assistant settings.' : 'Assistant ready.'), 500) })] }));
}
const PANEL_CSS = `
.tocktutor-assistant-panel {
  --tta-accent: var(--tt-accent, #2457d6);
  --tta-bg: var(--tt-bg, #f7f8fa);
  --tta-border: var(--tt-border, #d9dde5);
  --tta-muted: var(--tt-muted, #667085);
  --tta-panel: var(--tt-panel, #fff);
  color: inherit;
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
}
.tocktutor-assistant-panel h2, .tocktutor-assistant-panel h3, .tocktutor-assistant-panel p { margin: 0; }
.tocktutor-assistant-panel > header { border: 0; padding: 2px 2px 4px; }
.tocktutor-assistant-panel > header h2 { font-size: 16px; }
.tocktutor-assistant-panel > header > p:last-child { color: var(--tta-muted); font-size: 12px; overflow-wrap: anywhere; }
.tocktutor-assistant-panel > section, .tocktutor-assistant-panel > form {
  background: var(--tta-panel);
  border: 1px solid var(--tta-border);
  border-radius: 10px;
  display: grid;
  gap: 9px;
  padding: 12px;
}
.tocktutor-assistant-panel section > h2 { font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.tocktutor-assistant-panel article { background: var(--tta-bg); border: 1px solid var(--tta-border); border-radius: 8px; display: grid; gap: 7px; padding: 10px; }
.tocktutor-assistant-panel article h3 { font-size: 13px; overflow-wrap: anywhere; }
.tocktutor-assistant-panel article > p, .tocktutor-assistant-panel article > time, .tocktutor-assistant-panel article > span { color: var(--tta-muted); font-size: 12px; }
.tocktutor-assistant-panel pre { background: var(--tta-panel); border: 1px solid var(--tta-border); border-radius: 6px; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; margin: 0; max-height: 180px; overflow: auto; padding: 8px; white-space: pre-wrap; }
.tocktutor-assistant-kicker { color: var(--tta-muted); font-size: 10px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
.tocktutor-assistant-panel label { display: grid; font-size: 12px; gap: 4px; }
.tocktutor-assistant-panel input, .tocktutor-assistant-panel select, .tocktutor-assistant-panel textarea { background: var(--tta-panel); border: 1px solid var(--tta-border); border-radius: 7px; box-sizing: border-box; color: inherit; font: inherit; max-width: 100%; padding: 7px 8px; width: 100%; }
.tocktutor-assistant-panel textarea { min-height: 88px; resize: vertical; }
.tocktutor-assistant-panel article > div, .tocktutor-assistant-panel nav { display: flex; flex-wrap: wrap; gap: 6px; }
.tocktutor-assistant-panel button { background: var(--tta-panel); border: 1px solid var(--tta-border); border-radius: 7px; color: inherit; cursor: pointer; font: inherit; font-weight: 600; padding: 6px 9px; }
.tocktutor-assistant-panel button[type="submit"], .tocktutor-assistant-panel article button:first-child { background: var(--tta-accent); border-color: var(--tta-accent); color: white; }
.tocktutor-assistant-panel button:disabled { cursor: default; opacity: .5; }
.tocktutor-assistant-panel > [role="status"] { background: color-mix(in srgb, var(--tta-accent) 9%, transparent); border-radius: 7px; color: var(--tta-muted); font-size: 12px; padding: 8px 10px; }
.tocktutor-assistant-panel button:focus-visible, .tocktutor-assistant-panel input:focus-visible, .tocktutor-assistant-panel select:focus-visible, .tocktutor-assistant-panel textarea:focus-visible, .tocktutor-assistant-panel [role="status"]:focus-visible { outline: 2px solid var(--tta-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .tocktutor-assistant-panel *, .tocktutor-assistant-panel *::before, .tocktutor-assistant-panel *::after { scroll-behavior: auto !important; transition-duration: 0s !important; }
}
`;
//# sourceMappingURL=assistant-panel.js.map