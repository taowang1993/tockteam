import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@tockteam/ui/empty';
import { Input } from '@tockteam/ui/input';
import { Label } from '@tockteam/ui/label';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { Textarea } from '@tockteam/ui/textarea';
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
    return (_jsxs("aside", { "aria-label": "TockTutor Assistant", className: "tocktutor-assistant-panel relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[var(--tta-panel)] text-inherit [--tta-accent:var(--tt-accent,#4f46e5)] [--tta-bg:var(--tt-bg,#f7f8fa)] [--tta-border:var(--tt-border,#d9dde5)] [--tta-muted:var(--tt-muted,#667085)] [--tta-panel:var(--tt-panel,#fff)] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--tta-accent)] [&_h2]:m-0 [&_h3]:m-0 [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--tta-accent)] [&_p]:m-0 [&_select:focus-visible]:outline-2 [&_select:focus-visible]:outline-offset-2 [&_select:focus-visible]:outline-[var(--tta-accent)] [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[var(--tta-accent)] motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!duration-0 motion-reduce:[&_*::after]:!duration-0 motion-reduce:[&_*::before]:!duration-0", children: [_jsx("div", { className: "tocktutor-assistant-scroll flex min-h-0 flex-[1_1_auto] flex-col overflow-auto p-3.5", onScroll: event => {
                    const scroll = event.currentTarget;
                    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 48;
                    followingRef.current = atBottom;
                    setShowJumpToLatest(!atBottom);
                }, ref: scrollRef, children: _jsxs("section", { "aria-label": "Live Assistant Output", "aria-live": "polite", className: "tocktutor-assistant-transcript flex min-h-full min-w-0 flex-col gap-4", children: [!hasConversation && (proposalPage?.proposals.length ?? 0) === 0 && (_jsxs(Empty, { unstyled: true, className: "tocktutor-assistant-empty flex min-h-full flex-col items-center justify-center gap-4 text-center", children: [_jsxs(EmptyHeader, { unstyled: true, children: [_jsx(EmptyMedia, { unstyled: true, className: "tocktutor-assistant-empty-icon flex size-10 items-center justify-center rounded-xl border border-[var(--tta-border)] bg-[var(--tta-panel)] text-[var(--tta-accent)] shadow-[0_1px_2px_rgb(0_0_0_/_7%)] [&_svg]:size-[18px]", children: _jsx(Sparkles, { "aria-hidden": "true" }) }), _jsx(EmptyTitle, { unstyled: true, "aria-level": 2, className: "max-w-64 text-sm leading-5 font-bold", role: "heading", children: "What can I help you with?" })] }), _jsx(EmptyContent, { unstyled: true, className: "tocktutor-assistant-suggestions flex w-[min(100%,288px)] flex-col items-stretch gap-1.5 text-left", children: PROMPT_SUGGESTIONS.map(suggestion => {
                                        const Icon = suggestion.icon;
                                        return (_jsxs(Button, { unstyled: true, className: "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-left text-[13px] leading-[18px] text-inherit hover:border-[var(--tta-border)] hover:bg-[var(--tta-bg)] focus-visible:border-[var(--tta-border)] focus-visible:bg-[var(--tta-bg)] [&_span]:min-w-0 [&_span]:truncate [&_svg]:size-3.5 [&_svg]:flex-none", onClick: () => { setMessage(suggestion.prompt); }, type: "button", children: [_jsx(Icon, { "aria-hidden": "true" }), _jsx("span", { children: suggestion.label })] }, suggestion.label));
                                    }) })] })), transcriptEntries.map(entry => entry.toolStatus === true
                            ? _jsx("p", { className: "tocktutor-assistant-tool-status py-0.5 text-xs text-[var(--tta-muted)]", children: entry.text }, entry.key)
                            : (_jsxs("article", { "aria-label": `${entry.label} transcript entry`, className: entry.label === 'You' || entry.label === 'Steering'
                                    ? 'tocktutor-assistant-user-message max-w-[88%] self-end rounded-[10px] bg-[var(--tta-bg)] px-2.5 py-2 leading-normal [overflow-wrap:anywhere]'
                                    : 'tocktutor-assistant-answer grid gap-2 leading-[1.55] [overflow-wrap:anywhere]', children: [entry.label !== 'You' && entry.label !== 'Steering' && _jsx("p", { className: "tocktutor-assistant-kicker text-[11px] font-semibold text-[var(--tta-muted)]", children: "TockTutor Assistant" }), _jsx("p", { children: entry.text })] }, entry.key))), partial !== '' && (_jsxs("article", { "aria-label": "Streaming assistant transcript entry", className: "tocktutor-assistant-answer grid gap-2 leading-[1.55] [overflow-wrap:anywhere]", children: [_jsx("p", { className: "tocktutor-assistant-kicker text-[11px] font-semibold text-[var(--tta-muted)]", children: "TockTutor Assistant" }), _jsx("p", { children: partial })] })), transcript.runningCalls.slice(0, 20).map(call => (_jsxs("p", { className: "tocktutor-assistant-tool-status py-0.5 text-xs text-[var(--tta-muted)]", children: [boundedText(call.name, 127), " \u00B7 Reading\u2026"] }, call.callId))), transcriptError !== null && transcriptError !== undefined && (_jsx(Alert, { unstyled: true, className: "tocktutor-assistant-error rounded-lg border border-[var(--tta-border)] p-2 text-xs text-[#b42318]", children: boundedText(transcriptError, 500) })), (proposalPage?.proposals.length ?? 0) > 0 && (_jsxs("section", { "aria-label": "Staged Proposals", className: "tocktutor-assistant-reviews grid gap-2.5", children: [_jsx("h2", { className: "text-xs tracking-[.04em] uppercase", children: "Staged Proposals" }), proposalPage?.proposals.slice(0, 20).map(proposal => {
                                    const expired = proposal.expiresAt <= renderedAt;
                                    const pendingDecision = activeDecision?.proposalId === proposal.proposalId;
                                    const operation = proposal.operation === 'create' ? 'Create' : 'Update';
                                    return (_jsxs("article", { className: "grid gap-[7px] rounded-lg border border-[var(--tta-border)] bg-[var(--tta-bg)] p-2.5", children: [_jsxs("h3", { className: "text-[13px] [overflow-wrap:anywhere]", children: [operation, " ", proposal.destination] }), _jsxs("p", { className: "text-xs text-[var(--tta-muted)]", children: [String(proposal.contentChars), " characters \u00B7 ", String(proposal.contentBytes), " bytes"] }), _jsx("pre", { className: "m-0 max-h-[180px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--tta-border)] bg-[var(--tta-panel)] p-2 font-mono text-xs leading-normal", children: boundedText(proposal.preview, 1_000) }), proposal.warnings.length > 0 && (_jsx("ul", { "aria-label": `Warnings for ${proposal.destination}`, children: proposal.warnings.map((warning, index) => (_jsx("li", { children: boundedText(warning, 500) }, String(index)))) })), proposal.skippedEntryCount > 0 && (_jsxs("p", { children: [String(proposal.skippedEntryCount), " skipped ", proposal.skippedEntryCount === 1 ? 'entry' : 'entries', proposal.skippedEntries.length > 0 ? `: ${proposal.skippedEntries.join(', ')}` : ''] })), _jsxs("div", { className: "flex flex-wrap gap-1.5", children: [_jsx(Button, { unstyled: true, "aria-label": expired ? undefined : `Approve ${operation} ${proposal.destination}`, className: "cursor-pointer rounded-[7px] border border-[var(--tta-accent)] bg-[var(--tta-accent)] px-[9px] py-1.5 font-semibold text-white disabled:cursor-default disabled:opacity-50", disabled: expired || activeDecision !== null, onClick: () => { decideProposal(proposal, 'approve'); }, type: "button", children: expired ? 'Expired' : pendingDecision && activeDecision.action === 'approve' ? 'Approving…' : 'Approve' }), _jsx(Button, { unstyled: true, "aria-label": `Reject ${operation} ${proposal.destination}`, className: "cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50", disabled: expired || activeDecision !== null, onClick: () => { decideProposal(proposal, 'reject'); }, type: "button", children: pendingDecision && activeDecision.action === 'reject' ? 'Rejecting…' : 'Reject' })] })] }, proposal.proposalId));
                                }), proposalPage !== null && (proposalOffset > 0 || proposalPage.nextOffset !== null) && (_jsxs("nav", { "aria-label": "Proposal Pages", className: "flex flex-wrap gap-1.5", children: [_jsx(Button, { unstyled: true, "aria-label": "Previous Proposal Page", className: "cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50", disabled: proposalOffset === 0, onClick: () => { void loadProposals(Math.max(0, proposalOffset - 20)); }, type: "button", children: "Previous" }), _jsx(Button, { unstyled: true, "aria-label": "Next Proposal Page", className: "cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50", disabled: proposalPage.nextOffset === null, onClick: () => { if (proposalPage.nextOffset !== null)
                                                void loadProposals(proposalPage.nextOffset); }, type: "button", children: "Next" })] }))] }))] }) }), showJumpToLatest && (_jsxs(Button, { unstyled: true, className: "tocktutor-assistant-jump absolute right-4 bottom-28 z-2 flex items-center gap-[5px] rounded-lg border border-[var(--tta-border)] bg-[var(--tta-panel)] px-2 py-[5px] text-xs shadow-[0_1px_4px_rgb(0_0_0_/_10%)] [&_svg]:size-3.5", onClick: scrollToLatest, type: "button", children: [_jsx(ArrowDown, { "aria-hidden": "true" }), "Jump to Latest"] })), _jsxs("div", { className: "tocktutor-assistant-composer-wrap relative flex-none px-3 pb-3", children: [_jsxs("div", { className: "tocktutor-assistant-add-menu absolute bottom-[calc(100%+8px)] left-3 z-3 grid max-h-[min(520px,calc(100vh-180px))] w-[min(304px,calc(100%-24px))] gap-1 overflow-auto rounded-[10px] border border-[var(--tta-border)] bg-[var(--tta-panel)] p-2 shadow-[0_8px_24px_rgb(0_0_0_/_12%)]", hidden: !menuOpen, id: "tocktutor-assistant-add-menu", children: [_jsxs(Button, { unstyled: true, className: "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-left text-[13px] leading-[18px] text-inherit hover:border-[var(--tta-border)] hover:bg-[var(--tta-bg)] focus-visible:border-[var(--tta-border)] focus-visible:bg-[var(--tta-bg)] disabled:cursor-default disabled:opacity-50 [&_span]:min-w-0 [&_span]:truncate [&_svg]:size-3.5 [&_svg]:flex-none", disabled: props.activePath === null, onClick: () => {
                                    if (props.activePath !== null)
                                        setMessage(currentMessage => [currentMessage.trim(), `Use ${props.activePath} as context.`].filter(Boolean).join('\n'));
                                    setMenuOpen(false);
                                }, type: "button", children: [_jsx(FileText, { "aria-hidden": "true" }), _jsx("span", { children: props.activePath ?? 'Current Note' })] }), _jsxs("details", { className: "border-t border-[var(--tta-border)] pt-1", children: [_jsx("summary", { className: "cursor-pointer px-2 py-1.5 text-[13px]", children: "Assistant Settings" }), _jsxs("form", { className: "grid gap-2 p-2", onSubmit: saveSettings, children: [_jsxs(Label, { unstyled: true, className: "grid gap-1 text-xs", children: ["Provider", _jsx(Input, { unstyled: true, "aria-label": "Provider", className: "w-full rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-2 py-[7px] text-inherit", disabled: settings === null || settingsSaving, maxLength: 127, onChange: event => {
                                                            setSettings(currentSettings => currentSettings === null
                                                                ? null
                                                                : { ...currentSettings, provider: event.target.value });
                                                        }, value: settings?.provider ?? '' })] }), _jsxs(Label, { unstyled: true, className: "grid gap-1 text-xs", children: ["Model", _jsx(Input, { unstyled: true, "aria-label": "Model", className: "w-full rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-2 py-[7px] text-inherit", disabled: settings === null || settingsSaving, maxLength: 127, onChange: event => {
                                                            setSettings(currentSettings => currentSettings === null
                                                                ? null
                                                                : { ...currentSettings, model: event.target.value });
                                                        }, value: settings?.model ?? '' })] }), _jsxs(Label, { unstyled: true, className: "grid gap-1 text-xs", children: ["Write Permission", _jsxs(NativeSelect, { unstyled: true, "aria-label": "Write Permission", className: "w-full rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-2 py-[7px] text-inherit", disabled: settings === null || settingsSaving, onChange: event => {
                                                            const writePermission = event.target.value === 'propose' ? 'propose' : 'read-only';
                                                            setSettings(currentSettings => currentSettings === null
                                                                ? null
                                                                : { ...currentSettings, writePermission });
                                                        }, value: settings?.writePermission ?? 'read-only', children: [_jsx(NativeSelectOption, { value: "read-only", children: "Read Only" }), _jsx(NativeSelectOption, { value: "propose", children: "Propose Writes" })] })] }), _jsx(Button, { unstyled: true, className: "cursor-pointer rounded-[7px] border border-[var(--tta-accent)] bg-[var(--tta-accent)] px-[9px] py-1.5 font-semibold text-white disabled:cursor-default disabled:opacity-50", disabled: settings === null || settingsSaving, type: "submit", children: settingsSaving ? 'Saving…' : 'Save Settings' })] })] }), _jsxs("details", { className: "border-t border-[var(--tta-border)] pt-1", children: [_jsx("summary", { className: "cursor-pointer px-2 py-1.5 text-[13px]", children: "Audit History" }), _jsxs("section", { "aria-label": "Audit History", className: "tocktutor-assistant-audit grid gap-2 p-2", children: [auditPage === null && _jsx("p", { children: "Loading audit history\u2026" }), auditPage !== null && auditPage.entries.length === 0 && _jsx("p", { children: "No audit entries." }), auditPage?.dropped !== undefined && auditPage.dropped > 0 && (_jsxs("p", { children: [String(auditPage.dropped), " older audit ", auditPage.dropped === 1 ? 'entry was' : 'entries were', " dropped by bounded retention."] })), auditPage?.entries.slice(0, 20).map(entry => {
                                                const outcome = entry.outcome.split('-').map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
                                                const operation = entry.operation === 'create' ? 'Create' : 'Update';
                                                const time = auditTime(entry.timestamp);
                                                return (_jsxs("article", { "aria-label": `Audit entry ${entry.auditId}`, className: "grid gap-[7px] rounded-lg border border-[var(--tta-border)] bg-[var(--tta-bg)] p-2.5 [&>h3]:text-[13px] [&>h3]:[overflow-wrap:anywhere] [&>p]:text-xs [&>p]:text-[var(--tta-muted)] [&>span]:text-xs [&>span]:text-[var(--tta-muted)] [&>time]:text-xs [&>time]:text-[var(--tta-muted)]", children: [_jsxs("h3", { children: [outcome, " ", operation, " ", entry.destination] }), time === null
                                                            ? _jsx("span", { children: "Time Unavailable" })
                                                            : _jsx("time", { dateTime: time.dateTime, children: time.label }), entry.reason !== undefined && _jsx("p", { children: boundedText(entry.reason, 500) })] }, entry.auditId));
                                            }), auditPage !== null && (auditOffset > 0 || auditPage.nextOffset !== null) && (_jsxs("nav", { "aria-label": "Audit Pages", className: "flex flex-wrap gap-1.5", children: [_jsx(Button, { unstyled: true, "aria-label": "Previous Audit Page", className: "cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50", disabled: auditOffset === 0, onClick: () => { void loadAudit(Math.max(0, auditOffset - 20)); }, type: "button", children: "Previous" }), _jsx(Button, { unstyled: true, "aria-label": "Next Audit Page", className: "cursor-pointer rounded-[7px] border border-[var(--tta-border)] bg-[var(--tta-panel)] px-[9px] py-1.5 font-semibold text-inherit disabled:cursor-default disabled:opacity-50", disabled: auditPage.nextOffset === null, onClick: () => { if (auditPage.nextOffset !== null)
                                                            void loadAudit(auditPage.nextOffset); }, type: "button", children: "Next" })] }))] })] })] }), _jsxs("form", { className: "tocktutor-assistant-composer flex min-h-24 flex-col gap-2 rounded-2xl border border-[var(--tta-border)] bg-[var(--tta-panel)] p-2.5 focus-within:border-[var(--tta-accent)]", onSubmit: send, children: [_jsx(Textarea, { unstyled: true, "aria-label": "Assistant Message", className: "min-h-12 w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-[18px] text-inherit outline-0 focus-visible:shadow-none focus-visible:outline-none", id: "tocktutor-assistant-message", maxLength: 8_000, onChange: event => { setMessage(event.target.value); }, onKeyDown: submitOnEnter, placeholder: "What are your thoughts?", rows: 3, value: message }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Button, { unstyled: true, "aria-controls": "tocktutor-assistant-add-menu", "aria-expanded": menuOpen, "aria-label": "Add Context", className: "tocktutor-assistant-icon-button flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-inherit [&_svg]:size-3.5", onClick: () => { setMenuOpen(open => !open); }, type: "button", children: _jsx(Plus, { "aria-hidden": "true" }) }), _jsx(Button, { unstyled: true, "aria-label": "Send", className: "tocktutor-assistant-send flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--tta-accent)] p-0 text-white disabled:cursor-default disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:stroke-white [&_svg]:text-white", disabled: message.trim() === '', type: "submit", children: _jsx(ArrowUp, { "aria-hidden": "true" }) })] })] })] }), _jsx(Alert, { unstyled: true, "aria-live": "polite", className: "tocktutor-assistant-status absolute right-3 bottom-[120px] left-3 z-2 rounded-[7px] bg-[color-mix(in_srgb,var(--tta-accent)_9%,var(--tta-panel))] px-2.5 py-2 text-xs text-[var(--tta-muted)] empty:hidden", ref: statusRef, role: "status", tabIndex: -1, children: status === null ? '' : boundedText(status, 500) })] }));
}
//# sourceMappingURL=assistant-panel.js.map