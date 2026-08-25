import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, } from 'react';
import { ArrowDown, ArrowUp, FileText, List, Plus, Search, Sparkles } from 'lucide-react';
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
const PROMPT_SUGGESTIONS = [
    { icon: Search, label: 'Summarize the current note', prompt: 'Summarize the current note.' },
    { icon: List, label: 'Find related notes', prompt: 'Find related notes in this vault.' },
    { icon: FileText, label: 'Complete writing with AI', prompt: 'Help complete this note.' },
    { icon: Sparkles, label: 'Freely communicate with AI', prompt: 'I want to brainstorm about this note.' },
];
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
function submitOnEnter(event) {
    if (event.key !== 'Enter' || event.shiftKey)
        return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
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
    const [menuOpen, setMenuOpen] = useState(false);
    const [proposals, setProposals] = useState(null);
    const [proposalOffset, setProposalOffset] = useState(0);
    const [decision, setDecision] = useState(null);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const pending = useRef(new Set());
    const reviewPending = useRef(new Set());
    const reviewControllers = reviewPending.current;
    const followingRef = useRef(true);
    const scrollRef = useRef(null);
    const statusRef = useRef(null);
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
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
    const current = useSyncExternalStore(listener => props.sessions.list.subscribe(listener), () => props.sessions.list.getSnapshot().current, () => undefined);
    const conversation = current === undefined ? undefined : props.sessions.binding(current)?.session;
    const transcript = useSyncExternalStore(listener => conversation?.subscribe(listener) ?? emptySubscribe(), () => conversation?.getSnapshot() ?? EMPTY_CONVERSATION, () => EMPTY_CONVERSATION);
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
    const hasConversation = transcriptEntries.length > 0
        || partial !== ''
        || transcript.runningCalls.length > 0
        || transcriptError !== null;
    const scrollToLatest = useCallback(() => {
        const scroll = scrollRef.current;
        if (scroll === null)
            return;
        scroll.scrollTop = scroll.scrollHeight;
        followingRef.current = true;
        setShowJumpToLatest(false);
    }, []);
    useEffect(() => {
        const scroll = scrollRef.current;
        if (followingRef.current && scroll !== null)
            scroll.scrollTop = scroll.scrollHeight;
    }, [partial, proposalPage, transcript]);
    return (_jsxs("aside", { "aria-label": "TockTutor Assistant", className: "tocktutor-assistant-panel tocktutor-assistant-styles", children: [_jsx("div", { className: "tocktutor-assistant-scroll", onScroll: event => {
                    const scroll = event.currentTarget;
                    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 48;
                    followingRef.current = atBottom;
                    setShowJumpToLatest(!atBottom);
                }, ref: scrollRef, children: _jsxs("section", { "aria-label": "Live Assistant Output", "aria-live": "polite", className: "tocktutor-assistant-transcript", children: [!hasConversation && (proposalPage?.proposals.length ?? 0) === 0 && (_jsxs("div", { className: "tocktutor-assistant-empty", children: [_jsx("div", { className: "tocktutor-assistant-empty-icon", children: _jsx(Sparkles, { "aria-hidden": "true" }) }), _jsx("h2", { children: "What can I help you with?" }), _jsx("div", { className: "tocktutor-assistant-suggestions", children: PROMPT_SUGGESTIONS.map(suggestion => {
                                        const Icon = suggestion.icon;
                                        return (_jsxs("button", { onClick: () => { setMessage(suggestion.prompt); }, type: "button", children: [_jsx(Icon, { "aria-hidden": "true" }), _jsx("span", { children: suggestion.label })] }, suggestion.label));
                                    }) })] })), transcriptEntries.map(entry => entry.toolStatus === true
                            ? _jsx("p", { className: "tocktutor-assistant-tool-status", children: entry.text }, entry.key)
                            : (_jsxs("article", { "aria-label": `${entry.label} transcript entry`, className: entry.label === 'You' || entry.label === 'Steering' ? 'tocktutor-assistant-user-message' : 'tocktutor-assistant-answer', children: [entry.label !== 'You' && entry.label !== 'Steering' && _jsx("p", { className: "tocktutor-assistant-kicker", children: "TockTutor Assistant" }), _jsx("p", { children: entry.text })] }, entry.key))), partial !== '' && (_jsxs("article", { "aria-label": "Streaming assistant transcript entry", className: "tocktutor-assistant-answer", children: [_jsx("p", { className: "tocktutor-assistant-kicker", children: "TockTutor Assistant" }), _jsx("p", { children: partial })] })), transcript.runningCalls.slice(0, 20).map(call => (_jsxs("p", { className: "tocktutor-assistant-tool-status", children: [boundedText(call.name, 127), " \u00B7 Reading\u2026"] }, call.callId))), transcriptError !== null && transcriptError !== undefined && (_jsx("p", { className: "tocktutor-assistant-error", role: "alert", children: boundedText(transcriptError, 500) })), (proposalPage?.proposals.length ?? 0) > 0 && (_jsxs("section", { "aria-label": "Staged Proposals", className: "tocktutor-assistant-reviews", children: [_jsx("h2", { children: "Staged Proposals" }), proposalPage?.proposals.slice(0, 20).map(proposal => {
                                    const expired = proposal.expiresAt <= renderedAt;
                                    const pendingDecision = activeDecision?.proposalId === proposal.proposalId;
                                    const operation = proposal.operation === 'create' ? 'Create' : 'Update';
                                    return (_jsxs("article", { children: [_jsxs("h3", { children: [operation, " ", proposal.destination] }), _jsxs("p", { children: [String(proposal.contentChars), " characters \u00B7 ", String(proposal.contentBytes), " bytes"] }), _jsx("pre", { children: boundedText(proposal.preview, 1_000) }), proposal.warnings.length > 0 && (_jsx("ul", { "aria-label": `Warnings for ${proposal.destination}`, children: proposal.warnings.map((warning, index) => (_jsx("li", { children: boundedText(warning, 500) }, String(index)))) })), proposal.skippedEntryCount > 0 && (_jsxs("p", { children: [String(proposal.skippedEntryCount), " skipped ", proposal.skippedEntryCount === 1 ? 'entry' : 'entries', proposal.skippedEntries.length > 0 ? `: ${proposal.skippedEntries.join(', ')}` : ''] })), _jsxs("div", { children: [_jsx("button", { "aria-label": expired ? undefined : `Approve ${operation} ${proposal.destination}`, disabled: expired || activeDecision !== null, onClick: () => { decideProposal(proposal, 'approve'); }, type: "button", children: expired ? 'Expired' : pendingDecision && activeDecision.action === 'approve' ? 'Approving…' : 'Approve' }), _jsx("button", { "aria-label": `Reject ${operation} ${proposal.destination}`, disabled: expired || activeDecision !== null, onClick: () => { decideProposal(proposal, 'reject'); }, type: "button", children: pendingDecision && activeDecision.action === 'reject' ? 'Rejecting…' : 'Reject' })] })] }, proposal.proposalId));
                                }), proposalPage !== null && (proposalOffset > 0 || proposalPage.nextOffset !== null) && (_jsxs("nav", { "aria-label": "Proposal Pages", children: [_jsx("button", { "aria-label": "Previous Proposal Page", disabled: proposalOffset === 0, onClick: () => { void loadProposals(Math.max(0, proposalOffset - 20)); }, type: "button", children: "Previous" }), _jsx("button", { "aria-label": "Next Proposal Page", disabled: proposalPage.nextOffset === null, onClick: () => { if (proposalPage.nextOffset !== null)
                                                void loadProposals(proposalPage.nextOffset); }, type: "button", children: "Next" })] }))] }))] }) }), showJumpToLatest && (_jsxs("button", { className: "tocktutor-assistant-jump", onClick: scrollToLatest, type: "button", children: [_jsx(ArrowDown, { "aria-hidden": "true" }), "Jump to Latest"] })), _jsxs("div", { className: "tocktutor-assistant-composer-wrap", children: [_jsxs("div", { className: "tocktutor-assistant-add-menu", hidden: !menuOpen, id: "tocktutor-assistant-add-menu", children: [_jsxs("button", { disabled: props.activePath === null, onClick: () => {
                                    if (props.activePath !== null)
                                        setMessage(currentMessage => [currentMessage.trim(), `Use ${props.activePath} as context.`].filter(Boolean).join('\n'));
                                    setMenuOpen(false);
                                }, type: "button", children: [_jsx(FileText, { "aria-hidden": "true" }), _jsx("span", { children: props.activePath ?? 'Current Note' })] }), _jsxs("details", { children: [_jsx("summary", { children: "Assistant Settings" }), _jsxs("form", { onSubmit: saveSettings, children: [_jsxs("label", { children: ["Provider", _jsx("input", { "aria-label": "Provider", disabled: settings === null || settingsSaving, maxLength: 127, onChange: event => {
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
                                                        }, value: settings?.writePermission ?? 'read-only', children: [_jsx("option", { value: "read-only", children: "Read Only" }), _jsx("option", { value: "propose", children: "Propose Writes" })] })] }), _jsx("button", { disabled: settings === null || settingsSaving, type: "submit", children: settingsSaving ? 'Saving…' : 'Save Settings' })] })] }), _jsxs("details", { children: [_jsx("summary", { children: "Audit History" }), _jsxs("section", { "aria-label": "Audit History", className: "tocktutor-assistant-audit", children: [auditPage === null && _jsx("p", { children: "Loading audit history\u2026" }), auditPage !== null && auditPage.entries.length === 0 && _jsx("p", { children: "No audit entries." }), auditPage?.dropped !== undefined && auditPage.dropped > 0 && (_jsxs("p", { children: [String(auditPage.dropped), " older audit ", auditPage.dropped === 1 ? 'entry was' : 'entries were', " dropped by bounded retention."] })), auditPage?.entries.slice(0, 20).map(entry => {
                                                const outcome = entry.outcome.split('-').map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
                                                const operation = entry.operation === 'create' ? 'Create' : 'Update';
                                                const time = auditTime(entry.timestamp);
                                                return (_jsxs("article", { "aria-label": `Audit entry ${entry.auditId}`, children: [_jsxs("h3", { children: [outcome, " ", operation, " ", entry.destination] }), time === null
                                                            ? _jsx("span", { children: "Time Unavailable" })
                                                            : _jsx("time", { dateTime: time.dateTime, children: time.label }), entry.reason !== undefined && _jsx("p", { children: boundedText(entry.reason, 500) })] }, entry.auditId));
                                            }), auditPage !== null && (auditOffset > 0 || auditPage.nextOffset !== null) && (_jsxs("nav", { "aria-label": "Audit Pages", children: [_jsx("button", { "aria-label": "Previous Audit Page", disabled: auditOffset === 0, onClick: () => { void loadAudit(Math.max(0, auditOffset - 20)); }, type: "button", children: "Previous" }), _jsx("button", { "aria-label": "Next Audit Page", disabled: auditPage.nextOffset === null, onClick: () => { if (auditPage.nextOffset !== null)
                                                            void loadAudit(auditPage.nextOffset); }, type: "button", children: "Next" })] }))] })] })] }), _jsxs("form", { className: "tocktutor-assistant-composer", onSubmit: send, children: [_jsx("textarea", { "aria-label": "Assistant Message", id: "tocktutor-assistant-message", maxLength: 8_000, onChange: event => { setMessage(event.target.value); }, onKeyDown: submitOnEnter, placeholder: "What are your thoughts?", rows: 3, value: message }), _jsxs("div", { children: [_jsx("button", { "aria-controls": "tocktutor-assistant-add-menu", "aria-expanded": menuOpen, "aria-label": "Add Context", className: "tocktutor-assistant-icon-button", onClick: () => { setMenuOpen(open => !open); }, type: "button", children: _jsx(Plus, { "aria-hidden": "true" }) }), _jsx("button", { "aria-label": "Send", className: "tocktutor-assistant-send", disabled: message.trim() === '', type: "submit", children: _jsx(ArrowUp, { "aria-hidden": "true" }) })] })] })] }), _jsx("p", { "aria-live": "polite", className: "tocktutor-assistant-status", ref: statusRef, role: "status", tabIndex: -1, children: status === null ? '' : boundedText(status, 500) })] }));
}
//# sourceMappingURL=assistant-panel.js.map