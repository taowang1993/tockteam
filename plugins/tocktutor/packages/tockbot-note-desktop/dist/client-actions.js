import { Fragment as _Fragment, jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { useEffect, useRef, useState } from 'react';
function responseWasLost(result) {
    return !result.ok && result.error.code === 'gateway/internal';
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
async function nativeCall(bridge, operation, signal, call, expectedVault) {
    const { authorization } = await bridge.authorize(operation, expectedVault);
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
async function saveCurrent(owner) {
    return owner.saveCurrent === undefined ? true : await owner.saveCurrent();
}
function workbenchEvent(event) {
    return event.kind === 'quick-action'
        ? { action: event.action, kind: 'quick-action', operationId: event.operationId }
        : { kind: 'protocol', operationId: event.operationId, request: event.request };
}
async function waitForVault(currentOwner, target, signal) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const owner = currentOwner();
        if (owner?.vault?.id === target.id)
            return owner;
        if (signal?.aborted === true)
            return undefined;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    return undefined;
}
async function waitForActivePath(currentOwner, vaultId, expectedPath, previousPath, signal) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const owner = currentOwner();
        if (owner?.vault?.id === vaultId && owner.activePath !== null
            && (expectedPath === undefined ? owner.activePath !== previousPath : owner.activePath === expectedPath))
            return owner;
        if (signal?.aborted === true)
            return undefined;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    return undefined;
}
async function handleDesktopDispatch(event, initialOwner, currentOwner, bridge, remote, signal) {
    let owner = initialOwner;
    if (event.kind !== 'protocol')
        return owner.handleDispatch(workbenchEvent(event));
    let request = event.request;
    const target = request.vaultId === undefined ? undefined : { id: request.vaultId };
    if (request.vaultGeneration !== undefined && target === undefined)
        return 'failed';
    if (target !== undefined) {
        if (!/^vault:[0-9a-f]{64}$/u.test(target.id))
            return 'failed';
        if (owner.vault?.id !== target.id) {
            if (!await saveCurrent(owner))
                return 'failed';
            const activated = dispatchStatus(await nativeCall(bridge, 'activate-vault', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.activateVaultTarget(authorization, target, ownerSignal))));
            if (activated !== 'handled')
                return activated === 'stale' ? 'stale' : 'failed';
            const activatedOwner = await waitForVault(currentOwner, target, signal);
            if (activatedOwner === undefined)
                return signal?.aborted === true ? 'stale' : 'failed';
            owner = activatedOwner;
        }
        if (owner.vault === null)
            return 'stale';
        request = { ...request, vaultGeneration: owner.vault.generation };
    }
    if (request.action === 'choose-vault') {
        if (!await saveCurrent(owner))
            return 'failed';
        return dispatchStatus(await nativeCall(bridge, 'activate-vault', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.activateVault(authorization, ownerSignal))));
    }
    if (request.paneType === 'window') {
        if (owner.vault === null || !await saveCurrent(owner))
            return 'failed';
        if (request.action === 'open') {
            if (request.file === undefined)
                return 'failed';
            return dispatchStatus(await nativeCall(bridge, 'popout-open', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.openPopOut(authorization, request.file, owner.vault, ownerSignal)), owner.vault));
        }
        const { paneType: _paneType, silent: _silent, ...windowRequest } = request;
        const previousPath = owner.activePath;
        const created = await owner.handleDispatch({ kind: 'protocol', operationId: event.operationId, request: windowRequest });
        if (created !== 'handled')
            return created;
        const updatedOwner = await waitForActivePath(currentOwner, owner.vault.id, request.file, previousPath, signal);
        if (updatedOwner === undefined || updatedOwner.vault === null || updatedOwner.activePath === null)
            return signal?.aborted === true ? 'stale' : 'failed';
        owner = updatedOwner;
        const activePath = updatedOwner.activePath;
        const activeVault = updatedOwner.vault;
        return dispatchStatus(await nativeCall(bridge, 'popout-open', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.openPopOut(authorization, activePath, activeVault, ownerSignal)), activeVault));
    }
    return owner.handleDispatch({ kind: 'protocol', operationId: event.operationId, request });
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
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
function sameRecordingOwner(path, vault, current) {
    return current.activePath === path && current.vault?.id === vault.id
        && current.vault.generation === vault.generation;
}
function recordingExtension(mimeType) {
    switch (mimeType.toLowerCase().split(';', 1)[0]) {
        case 'audio/mp4': return '.m4a';
        case 'audio/ogg': return '.ogg';
        case 'audio/wav': return '.wav';
        case 'audio/webm': return '.weba';
        default: return null;
    }
}
function base64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return btoa(binary);
}
/** Record only after Desktop grants the exact live note, then re-check it before returning bytes. */
export async function startAudioRecording(authorization, path, vault, current, request, mediaDevices, createRecorder, now = () => new Date(), readBlob = blob => blob.arrayBuffer(), signal) {
    if (signal?.aborted)
        return { result: { ok: true, value: { status: 'stale' } }, status: 'not-started' };
    const result = await request(authorization, vault);
    if (!result.ok || result.value.status !== 'granted')
        return { result, status: 'not-started' };
    if (signal?.aborted)
        return { result: { ok: true, value: { status: 'stale' } }, status: 'not-started' };
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    const tracks = stream.getTracks();
    const cleanup = () => { for (const track of tracks)
        track.stop(); };
    if (signal?.aborted || !sameRecordingOwner(path, vault, current())) {
        cleanup();
        return { result: { ok: true, value: { status: 'stale' } }, status: 'not-started' };
    }
    let recorder;
    try {
        recorder = createRecorder(stream);
    }
    catch (error) {
        cleanup();
        throw error;
    }
    const extension = recordingExtension(recorder.mimeType);
    if (extension === null) {
        cleanup();
        return { result: { ok: true, value: { status: 'unavailable' } }, status: 'not-started' };
    }
    const chunks = [];
    let bytes = 0;
    let cancelled = false;
    let settled = false;
    let resolve;
    const completed = new Promise(finish => { resolve = finish; });
    const finish = (value) => {
        if (settled)
            return;
        settled = true;
        cleanup();
        resolve(value);
    };
    recorder.addEventListener('dataavailable', event => {
        if (event === undefined || event.data.size === 0 || settled)
            return;
        bytes += event.data.size;
        if (bytes <= MAX_AUDIO_BYTES)
            chunks.push(event.data);
    });
    recorder.addEventListener('error', () => { finish({ status: 'failed' }); });
    recorder.addEventListener('stop', () => {
        if (cancelled) {
            finish({ status: 'stale' });
            return;
        }
        if (bytes > MAX_AUDIO_BYTES) {
            finish({ status: 'too-large' });
            return;
        }
        if (!sameRecordingOwner(path, vault, current())) {
            finish({ status: 'stale' });
            return;
        }
        void readBlob(new Blob(chunks, { type: recorder.mimeType }))
            .then(buffer => {
            if (cancelled || signal?.aborted || !sameRecordingOwner(path, vault, current())) {
                finish({ status: 'stale' });
                return;
            }
            const timestamp = now().toISOString().slice(0, 19).replace('T', ' ').replaceAll(':', '-');
            finish({ dataBase64: base64(new Uint8Array(buffer)), fileName: `Recording ${timestamp}${extension}`, status: 'recorded' });
        })
            .catch(() => { finish({ status: 'failed' }); });
    });
    try {
        recorder.start();
    }
    catch (error) {
        cleanup();
        throw error;
    }
    return {
        status: 'recording',
        recording: {
            cancel() {
                cancelled = true;
                if (recorder.state === 'recording')
                    recorder.stop();
                else
                    finish({ status: 'stale' });
            },
            async stop() {
                if (recorder.state === 'recording')
                    recorder.stop();
                return completed;
            },
        },
    };
}
/** Consume the trusted-main dispatch facade until Desktop closes the consumer. */
export async function runDesktopDispatchLoop(options) {
    const active = options.active ?? (() => true);
    let unavailablePolls = 0;
    while (active() && !options.signal?.aborted) {
        const event = await options.bridge.nextDispatch();
        if (event === null) {
            const retryLimit = options.unavailableRetryLimit ?? 0;
            if (!active() || options.signal?.aborted || unavailablePolls >= retryLimit)
                return;
            unavailablePolls += 1;
            await new Promise(resolve => setTimeout(resolve, Math.min(25 * (2 ** (unavailablePolls - 1)), 250)));
            continue;
        }
        unavailablePolls = 0;
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
                status = await handleDesktopDispatch(event, owner, options.owner, options.bridge, options.remote, options.signal);
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
        case 'moved': return 'Vault moved.';
        case 'opened': return 'Pop-out opened.';
        case 'printed': return 'Print request opened.';
        case 'renamed': return 'Vault renamed.';
        case 'revealed': return 'Entry revealed.';
        case 'cancelled': return 'Action cancelled.';
        case 'denied': return 'Action denied.';
        case 'stale': return 'The note or vault changed. Try again.';
        case 'unavailable': return 'This native action is unavailable.';
    }
}
export async function openFolderAsVault(owner, bridge, remote, signal) {
    if (!await saveCurrent(owner))
        return undefined;
    return await nativeCall(bridge, 'activate-vault', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.activateVault(authorization, ownerSignal)));
}
export async function revealVault(owner, bridge, remote, signal) {
    if (owner.vault === null)
        return undefined;
    return await nativeCall(bridge, 'reveal-vault', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.revealVault(authorization, owner.vault, ownerSignal)), owner.vault);
}
export async function renameVault(owner, name, bridge, remote, signal) {
    if (owner.vault === null || !await saveCurrent(owner))
        return undefined;
    return await nativeCall(bridge, 'rename-vault', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.renameVault(authorization, name, owner.vault, ownerSignal)), owner.vault);
}
export async function moveVault(owner, bridge, remote, signal) {
    if (owner.vault === null || !await saveCurrent(owner))
        return undefined;
    return await nativeCall(bridge, 'move-vault', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.moveVault(authorization, owner.vault, ownerSignal)), owner.vault);
}
export async function removeVault(owner, bridge, remote, signal) {
    if (owner.vault === null || !await saveCurrent(owner))
        return undefined;
    const result = await nativeCall(bridge, 'remove-vault', signal, (authorization, ownerSignal) => (remote.tocktutorDesktop.removeVault(authorization, owner.vault, ownerSignal)), owner.vault);
    if (result.status === 'closed')
        owner.close();
    return result;
}
/** Desktop-only vault picker and management contribution for the vault dialog. */
export function TockTutorVaultActions(props) {
    const operation = useRef();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => () => { operation.current?.abort(); }, []);
    const runMenu = async (pending, failure, action) => {
        const controller = replaceActionController(operation.current);
        operation.current = controller;
        setBusy(true);
        setMessage(pending);
        let closeMenu = false;
        try {
            const result = await action(controller.signal);
            if (!controller.signal.aborted) {
                if (result === undefined)
                    setMessage(failure);
                else {
                    setMessage(resultMessage(result));
                    closeMenu = ['cancelled', 'closed', 'moved', 'revealed'].includes(result.status);
                }
            }
        }
        catch {
            if (!controller.signal.aborted)
                setMessage(failure);
        }
        finally {
            if (!controller.signal.aborted) {
                setBusy(false);
                if (closeMenu)
                    props.closeMenu();
            }
        }
    };
    const open = async () => {
        const controller = replaceActionController(operation.current);
        operation.current = controller;
        setBusy(true);
        setMessage('Opening folder picker…');
        try {
            const result = await openFolderAsVault(props, props.bridge, props.remote, controller.signal);
            if (!controller.signal.aborted && result !== undefined) {
                setMessage(resultMessage(result));
                if (result.status === 'activated')
                    props.close();
            }
        }
        catch {
            if (!controller.signal.aborted)
                setMessage('The folder picker could not be opened.');
        }
        finally {
            if (!controller.signal.aborted)
                setBusy(false);
        }
    };
    if (props.placement === 'menu') {
        const disabled = busy || props.vault === null;
        return (_jsxs(_Fragment, { children: [props.renderMenuItem({
                    disabled,
                    icon: 'rename',
                    label: 'Rename vault...',
                    select() {
                        props.beginRename(async (name, signal) => {
                            try {
                                return (await renameVault(props, name, props.bridge, props.remote, signal))?.status === 'renamed';
                            }
                            catch {
                                return false;
                            }
                        });
                        props.closeMenu();
                    },
                }), props.renderMenuItem({
                    disabled,
                    icon: 'move',
                    label: 'Move vault...',
                    select() {
                        void runMenu('Moving vault…', 'The vault could not be moved.', signal => (moveVault(props, props.bridge, props.remote, signal)));
                    },
                }), props.renderMenuItem({
                    disabled,
                    icon: 'reveal',
                    label: 'Reveal vault in Finder',
                    select() {
                        void runMenu('Revealing vault…', 'The vault could not be revealed.', signal => (revealVault(props, props.bridge, props.remote, signal)));
                    },
                    separatorBefore: true,
                }), props.renderMenuItem({
                    destructive: true,
                    disabled,
                    icon: 'remove',
                    label: 'Remove from list',
                    select() {
                        void runMenu('Removing vault…', 'The vault could not be removed.', signal => (removeVault(props, props.bridge, props.remote, signal)));
                    },
                    separatorBefore: true,
                }), message !== '' && props.renderMenuItem({ disabled: true, label: message, live: true, select() { } })] }));
    }
    return (_jsxs("div", { className: "flex items-center gap-4 p-4", "data-vault-action-row": true, children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "m-0 font-medium", children: "Open Folder as Vault" }), _jsx("p", { className: "mt-1 text-xs text-[var(--tt-muted)]", children: "Choose an existing folder of Markdown files." })] }), _jsx(Button, { "aria-label": "Open Folder as Vault", disabled: busy, onClick: () => { void open(); }, variant: "outline", children: busy ? 'Opening…' : 'Open' }), _jsx("span", { "aria-live": "polite", className: "sr-only", children: message })] }));
}
/** Accessible contribution for Workbench's root-scoped Native Actions seat. */
export function TockTutorNativeActions(props) {
    const owner = useRef(props);
    const lifetime = useRef();
    const activeRecording = useRef();
    const [busy, setBusy] = useState(null);
    const [recording, setRecording] = useState(false);
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
            unavailableRetryLimit: 20,
        }).catch(() => { if (active)
            setMessage('Desktop dispatch is unavailable.'); });
        return () => {
            active = false;
            activeRecording.current?.cancel();
            activeRecording.current = undefined;
            controller.abort();
            if (lifetime.current === controller)
                lifetime.current = undefined;
            void props.bridge.cancelDispatch().catch(() => { });
        };
    }, [props.bridge, props.remote]);
    const run = async (label, operation, call, expectedVault) => {
        const signal = lifetime.current?.signal;
        if (signal === undefined || signal.aborted)
            return undefined;
        setBusy(label);
        setMessage(`${label}…`);
        try {
            const { authorization } = await props.bridge.authorize(operation, expectedVault);
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
    const withNote = (label, operation, call, saveFirst = false) => async () => {
        if (props.activePath === null || props.vault === null || (saveFirst && !await saveCurrent(props)))
            return;
        await run(label, operation, (authorization, signal) => (call(authorization, props.activePath, props.vault, signal)), props.vault);
    };
    const startRecording = async () => {
        const signal = lifetime.current?.signal;
        if (signal === undefined || signal.aborted || props.activePath === null || props.vault === null || props.storeAudio === undefined)
            return;
        setBusy('Starting Recording');
        setMessage('Starting Recording…');
        try {
            const path = props.activePath;
            const vault = props.vault;
            const { authorization } = await props.bridge.authorize('microphone', vault);
            const started = await startAudioRecording(authorization, path, vault, () => owner.current, async (token, expectedVault) => {
                let response = await props.remote.tocktutorDesktop.requestMicrophone(token, expectedVault, signal);
                if (responseWasLost(response) && !signal.aborted)
                    response = await props.remote.tocktutorDesktop.requestMicrophone(token, expectedVault, signal);
                return response;
            }, navigator.mediaDevices, stream => new MediaRecorder(stream), undefined, undefined, signal);
            if (started.status !== 'recording') {
                if (!signal.aborted)
                    setMessage(started.result.ok ? resultMessage(started.result.value) : 'Audio recording is unavailable.');
                return;
            }
            if (signal.aborted) {
                started.recording.cancel();
                return;
            }
            activeRecording.current = started.recording;
            setRecording(true);
            setMessage('Recording Audio…');
        }
        catch {
            if (!signal.aborted)
                setMessage('Audio recording could not start.');
        }
        finally {
            if (!signal.aborted)
                setBusy(null);
        }
    };
    const stopRecording = async () => {
        const signal = lifetime.current?.signal;
        const currentRecording = activeRecording.current;
        if (signal === undefined || currentRecording === undefined)
            return;
        setBusy('Stopping Recording');
        setMessage('Stopping Recording…');
        const result = await currentRecording.stop();
        if (activeRecording.current === currentRecording)
            activeRecording.current = undefined;
        if (signal.aborted)
            return;
        setRecording(false);
        if (result.status === 'recorded') {
            const stored = await owner.current.storeAudio?.(result.fileName, result.dataBase64);
            setMessage(stored === true ? 'Audio recording added to the note.' : 'The audio recording could not be added safely.');
        }
        else {
            setMessage(result.status === 'stale'
                ? 'The note or vault changed. The recording was discarded.'
                : result.status === 'too-large' ? 'The audio recording exceeded 25 MiB.' : 'Audio recording failed safely.');
        }
        setBusy(null);
    };
    const button = (label, action, enabled = true) => (_jsx(Button, { unstyled: true, className: "min-h-9 cursor-pointer rounded-md border border-transparent bg-transparent px-2.5 py-[7px] text-left text-inherit enabled:hover:bg-[var(--tt-selected,color-mix(in_srgb,var(--tt-accent,#2457d6)_12%,transparent))] focus-visible:border-[var(--tt-accent,#2457d6)] focus-visible:bg-[var(--tt-selected,color-mix(in_srgb,var(--tt-accent,#2457d6)_12%,transparent))] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50", disabled: !enabled || busy !== null, onClick: () => { void action(); }, type: "button", children: busy === label ? `${label}…` : label }, label));
    return (_jsxs("div", { "aria-label": "Desktop Note Actions", className: "tocktutor-desktop-actions grid gap-2 px-[18px] pt-3.5 pb-[18px]", role: "group", children: [_jsxs("div", { className: "tocktutor-desktop-actions-grid grid grid-cols-2 gap-2", children: [button('Reveal Entry', withNote('Revealing Entry', 'reveal-entry', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.revealEntry(authorization, path, vault, signal))), hasNote), button('Open Pop-Out', withNote('Opening Pop-Out', 'popout-open', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.openPopOut(authorization, path, vault, signal)), true), hasNote), button('Close Pop-Out', withNote('Closing Pop-Out', 'popout-close', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.closePopOut(authorization, path, vault, signal))), hasNote), button('Close All Pop-Outs', async () => {
                        if (props.vault === null)
                            return;
                        await run('Closing Pop-Outs', 'popout-close-all', (authorization, signal) => (props.remote.tocktutorDesktop.closeAllPopOuts(authorization, props.vault, signal)), props.vault);
                    }, props.vault !== null), button('Request Microphone', withNote('Requesting Microphone', 'microphone', (authorization, path, vault, signal) => requestMicrophoneAccess(authorization, path, vault, () => owner.current, (token, expectedVault) => props.remote.tocktutorDesktop.requestMicrophone(token, expectedVault, signal), navigator.mediaDevices)), hasNote), recording
                        ? button('Stop Recording', stopRecording)
                        : button('Start Recording', startRecording, hasNote && props.storeAudio !== undefined && typeof MediaRecorder !== 'undefined'), button('Print Note', withNote('Printing Note', 'print', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.printNote(authorization, path, vault, signal)), true), hasNote), button('Export HTML', withNote('Exporting HTML', 'export-html', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.exportNote(authorization, 'html', path, vault, signal)), true), hasNote), button('Export PDF', withNote('Exporting PDF', 'export-pdf', (authorization, path, vault, signal) => (props.remote.tocktutorDesktop.exportNote(authorization, 'pdf', path, vault, signal)), true), hasNote)] }), _jsx(Alert, { unstyled: true, "aria-live": "polite", className: "mt-1 mb-0 text-[var(--tt-muted,#667085)]", role: "status", children: message })] }));
}
//# sourceMappingURL=client-actions.js.map