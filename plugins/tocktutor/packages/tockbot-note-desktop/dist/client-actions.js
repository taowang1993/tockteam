import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
function responseWasLost(result) {
    return !result.ok && result.error.code === 'transport';
}
function valueOf(result) {
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
async function completeDispatch(bridge, request) {
    try {
        await bridge.completeDispatch(request);
    }
    catch {
        try {
            await bridge.completeDispatch(request);
        }
        catch (error) {
            try {
                await bridge.cancelDispatch();
            }
            catch (cancelError) {
                throw new AggregateError([error, cancelError], 'Desktop dispatch rollback failed.');
            }
            throw error;
        }
    }
}
async function nativeCall(bridge, operation, signal, call) {
    const { authorization } = await bridge.authorize(operation);
    let result = await call(authorization, signal);
    if (responseWasLost(result))
        result = await call(authorization, signal);
    return valueOf(result);
}
function dispatchStatus(result) {
    if (result.status === 'stale')
        return 'stale';
    return result.status === 'activated' || result.status === 'focused' || result.status === 'opened'
        ? 'handled'
        : 'failed';
}
function workbenchEvent(event) {
    return event.kind === 'quick-action'
        ? { action: event.action, kind: 'quick-action', operationId: event.operationId }
        : { kind: 'protocol', operationId: event.operationId, request: event.request };
}
async function handleDesktopDispatch(event, owner, bridge, remote, signal) {
    if (event.kind !== 'protocol')
        return owner.handleDispatch(workbenchEvent(event));
    if (event.request.action === 'choose-vault') {
        return dispatchStatus(await nativeCall(bridge, 'activate-vault', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.activateVault(authorization, ownerSignal))));
    }
    if (event.request.action === 'open' && event.request.paneType === 'window') {
        if (owner.vault === null || event.request.file === undefined)
            return 'failed';
        return dispatchStatus(await nativeCall(bridge, 'popout-open', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.openPopOut(authorization, event.request.file, owner.vault, ownerSignal))));
    }
    return owner.handleDispatch(workbenchEvent(event));
}
/** Complete permission only while the initiating note and vault remain current. */
export async function requestMicrophoneAccess(authorization, path, vault, current, request, mediaDevices) {
    const result = await request(authorization, vault);
    if (!result.ok || result.value.status !== 'granted')
        return result;
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    try {
        const owner = current();
        if (owner.activePath !== path || owner.vault?.id !== vault.id
            || owner.vault.generation !== vault.generation) {
            return { ok: true, value: { status: 'stale' } };
        }
        return result;
    }
    finally {
        for (const track of stream.getTracks())
            track.stop();
    }
}
/** Consume the trusted-main dispatch facade until Desktop closes the consumer. */
export async function runDesktopDispatchLoop(options) {
    const active = options.active ?? (() => true);
    while (active() && !options.signal?.aborted) {
        const event = await options.bridge.nextDispatch();
        if (event === null)
            return;
        if (!active()) {
            await completeDispatch(options.bridge, {
                deliveryId: event.deliveryId,
                operationId: event.operationId,
                status: 'stale',
            });
            return;
        }
        let status = 'stale';
        const owner = options.owner();
        if (owner !== undefined) {
            try {
                status = await handleDesktopDispatch(event, owner, options.bridge, options.remote, options.signal);
            }
            catch {
                status = 'failed';
            }
        }
        if (!active())
            status = 'stale';
        await completeDispatch(options.bridge, {
            deliveryId: event.deliveryId,
            operationId: event.operationId,
            status,
        });
    }
}
export function replaceActionController(current, reset = () => { }) {
    current?.abort();
    reset();
    return new AbortController();
}
function resultMessage(result) {
    switch (result.status) {
        case 'activated': return 'Vault selected.';
        case 'closed': return 'Pop-out closed.';
        case 'exported': return 'Note exported.';
        case 'focused': return 'Pop-out focused.';
        case 'granted': return 'Microphone ready.';
        case 'opened': return 'Pop-out opened.';
        case 'printed': return 'Print request opened.';
        case 'revealed': return 'Entry revealed.';
        case 'cancelled': return 'Action cancelled.';
        case 'denied': return 'Action denied.';
        case 'stale': return 'The note or vault changed. Try again.';
        case 'unavailable': return 'This native action is unavailable.';
    }
}
/** Accessible contribution for Workbench's root-scoped Native Actions seat. */
export function TockTutorNativeActions(props) {
    const owner = useRef(props);
    const lifetime = useRef();
    const [busy, setBusy] = useState(null);
    const [message, setMessage] = useState('Ready.');
    const hasNote = props.activePath !== null && props.vault !== null;
    useEffect(() => {
        owner.current = props;
    }, [props]);
    useEffect(() => {
        let active = true;
        const controller = replaceActionController(lifetime.current, () => { setBusy(null); });
        lifetime.current = controller;
        void runDesktopDispatchLoop({
            active: () => active,
            bridge: props.bridge,
            owner: () => owner.current,
            remote: props.remote,
            signal: controller.signal,
        }).catch(() => { if (active)
            setMessage('Desktop dispatch is unavailable.'); });
        return () => {
            active = false;
            controller.abort();
            if (lifetime.current === controller)
                lifetime.current = undefined;
            void props.bridge.cancelDispatch().catch(() => { });
        };
    }, [props.bridge, props.remote]);
    const run = async (label, operation, call) => {
        const signal = lifetime.current?.signal;
        if (signal === undefined || signal.aborted)
            return undefined;
        setBusy(label);
        setMessage(`${label}…`);
        try {
            const { authorization } = await props.bridge.authorize(operation);
            let response = await call(authorization, signal);
            if (responseWasLost(response) && !signal.aborted)
                response = await call(authorization, signal);
            const result = valueOf(response);
            if (!signal.aborted)
                setMessage(resultMessage(result));
            return result;
        }
        catch {
            if (!signal.aborted)
                setMessage('The native action failed safely.');
            return undefined;
        }
        finally {
            if (!signal.aborted)
                setBusy(null);
        }
    };
    const withNote = (label, operation, call) => async () => {
        if (props.activePath === null || props.vault === null)
            return;
        await run(label, operation, (authorization, signal) => (call(authorization, props.activePath, props.vault, signal)));
    };
    const button = (label, action, enabled = true) => (_jsx("button", { disabled: !enabled || busy !== null, onClick: () => { void action(); }, type: "button", children: busy === label ? `${label}…` : label }, label));
    return (_jsxs("div", { "aria-label": "Desktop Note Actions", className: "tocktutor-desktop-actions tocktutor-native-actions-styles", role: "group", children: [_jsxs("div", { className: "tocktutor-desktop-actions-grid", children: [button('Choose Vault', async () => {
                        await run('Choosing Vault', 'activate-vault', (authorization, signal) => (props.remote.tocktutorDesktop.activateVault(authorization, signal)));
                    }), button('Reveal Entry', withNote('Revealing Entry', 'reveal-entry', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.revealEntry(authorization, path, vault, signal))), hasNote), button('Open Pop-Out', withNote('Opening Pop-Out', 'popout-open', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.openPopOut(authorization, path, vault, signal))), hasNote), button('Close Pop-Out', withNote('Closing Pop-Out', 'popout-close', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.closePopOut(authorization, path, vault, signal))), hasNote), button('Close All Pop-Outs', async () => {
                        if (props.vault === null)
                            return;
                        await run('Closing Pop-Outs', 'popout-close-all', (authorization, signal) => (props.remote.tocktutorDesktop.closeAllPopOuts(authorization, props.vault, signal)));
                    }, props.vault !== null), button('Request Microphone', withNote('Requesting Microphone', 'microphone', (authorization, path, vault, signal) => requestMicrophoneAccess(authorization, path, vault, () => owner.current, (token, expectedVault) => props.remote.tocktutorDesktop.requestMicrophone(token, expectedVault, signal), navigator.mediaDevices)), hasNote), button('Print Note', withNote('Printing Note', 'print', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.printNote(authorization, path, vault, signal))), hasNote), button('Export HTML', withNote('Exporting HTML', 'export-html', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.exportNote(authorization, 'html', path, vault, signal))), hasNote), button('Export PDF', withNote('Exporting PDF', 'export-pdf', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.exportNote(authorization, 'pdf', path, vault, signal))), hasNote)] }), _jsx("p", { "aria-live": "polite", role: "status", children: message })] }));
}
//# sourceMappingURL=client-actions.js.map