var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { OWNED_PROCESS_EXIT_DEADLINE_MS } from "./owned-process.js";
export async function loadWindowsOwnedBindings() {
    if (process.platform !== 'win32' || !['x64', 'arm64'].includes(process.arch))
        throw new Error('Windows owned processes require a supported 64-bit Windows host');
    const entry = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-win32-process');
    const publicApi = await import(__rewriteRelativeImportExtension(pathToFileURL(entry).href));
    const koffi = createRequire(entry)('koffi');
    const api = publicApi.extendWin32ProcessBindings(({ bind, kernel32 }) => ({
        createIoCompletionPort: bind(kernel32, 'CreateIoCompletionPort', 'void *', ['void *', 'void *', 'uintptr_t', 'uint32']),
        getQueuedCompletionStatus: bind(kernel32, 'GetQueuedCompletionStatus', 'int', ['void *', 'void *', 'void *', 'void *', 'uint32']),
        openProcess: bind(kernel32, 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']),
        initializeProcThreadAttributeList: bind(kernel32, 'InitializeProcThreadAttributeList', 'int', ['void *', 'uint32', 'uint32', 'void *']),
        updateProcThreadAttribute: bind(kernel32, 'UpdateProcThreadAttribute', 'int', ['void *', 'uint32', 'uintptr_t', 'void *', 'size_t', 'void *', 'void *']),
        deleteProcThreadAttributeList: bind(kernel32, 'DeleteProcThreadAttributeList', 'void', ['void *']),
        createProcessW: bind(kernel32, 'CreateProcessW', 'int', ['str16', 'void *', 'void *', 'void *', 'int', 'uint32', 'void *', 'str16', 'void *', 'void *']),
        queryInformationJobObject: bind(kernel32, 'QueryInformationJobObject', 'int', ['void *', 'int', 'void *', 'uint32', 'void *']),
        terminateJobObject: bind(kernel32, 'TerminateJobObject', 'int', ['void *', 'uint32']),
    }));
    return { ...api, address: buffer => koffi.address(buffer) };
}
// Same CRT quoting rules as Node/libuv; CreateProcessW also receives the exact
// application name, so the executable is never inferred from this command line.
function quoteArgument(value) {
    if (value !== '' && !/[\s"]/u.test(value))
        return value;
    return `"${value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\+)$/u, '$1$1')}"`;
}
export function encodeWindowsInvocation(options) {
    if ([options.executable, ...options.args].some(value => value.includes('\0')))
        throw new Error('Invalid Windows process argument');
    const keys = new Set();
    const entries = Object.entries(options.env).filter((entry) => entry[1] !== undefined);
    for (const [key, value] of entries) {
        const normalized = key.toUpperCase();
        if (!key || /[=\0]/u.test(key) || value.includes('\0') || keys.has(normalized))
            throw new Error('Invalid Windows process environment');
        keys.add(normalized);
    }
    entries.sort(([a], [b]) => a.toUpperCase() < b.toUpperCase() ? -1 : 1);
    const commandLine = [quoteArgument(options.executable), ...options.args.map(value => options.windowsVerbatimArguments ? value : quoteArgument(value))].join(' ') + '\0';
    const environment = entries.map(([key, value]) => `${key}=${value}\0`).join('') + (entries.length ? '\0' : '\0\0');
    if (commandLine.length > 32767 || environment.length > 32767)
        throw new Error('Windows process invocation limit exceeded');
    return { commandLine: Buffer.from(commandLine, 'utf16le'), environment: Buffer.from(environment, 'utf16le') };
}
/** Creation-time Job ownership; public dispatch is restricted to verified Windows x64. */
export async function spawnWindowsOwnedProcess(options, bindings) {
    if (options.admit) {
        const { admit, ...invocation } = options;
        const api = bindings ?? await loadWindowsOwnedBindings();
        return admit(() => spawnWindowsOwnedProcess(invocation, api));
    }
    if (options.signal.aborted)
        throw new Error('Owned process cancelled');
    const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024;
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 1024 * 1024)
        throw new Error('Invalid owned process output limit');
    const encoded = encodeWindowsInvocation(options);
    const api = bindings ?? await loadWindowsOwnedBindings();
    if (options.signal.aborted)
        throw new Error('Owned process cancelled');
    const owned = new Set();
    const held = [encoded.commandLine, encoded.environment];
    const allocate = (size) => { const buffer = Buffer.alloc(size); held.push(buffer); return buffer; };
    const error = (operation) => new Error(`${operation} failed (Win32 ${api.getLastError()})`);
    const check = (ok, operation) => { if (!ok)
        throw error(operation); };
    const keep = (handle) => { if (!handle)
        throw error('Acquire owned handle'); owned.add(handle); return handle; };
    let releaseFailure;
    const close = (handle) => {
        if (!owned.delete(handle))
            return;
        try {
            check(api.closeHandle(handle), 'CloseHandle');
        }
        catch (caught) {
            // A failed early release remains uncertain even if every later check
            // succeeds. Never blindly retry a possibly invalid/reused handle.
            releaseFailure ??= caught;
            throw caught;
        }
    };
    const closeAll = () => {
        // The kill-on-close Job is acquired first and released last.
        for (const handle of [...owned].reverse()) {
            try {
                close(handle);
            }
            catch { /* retained above; keep attempting remaining handles */ }
        }
        return releaseFailure;
    };
    const pipe = () => {
        const read = allocate(8), write = allocate(8);
        check(api.createPipe(api.address(read), api.address(write), null, 0), 'CreatePipe');
        const handles = [read.readBigUInt64LE(), write.readBigUInt64LE()];
        for (const handle of handles)
            if (handle)
                owned.add(handle);
        if (handles.some(handle => !handle))
            throw new Error('CreatePipe returned a null handle');
        return [...handles];
    };
    let job;
    let port;
    let root;
    let stdout;
    let stderr;
    let pid = 0;
    let created = false;
    let initializedAttributes;
    let launchError;
    try {
        job = keep(api.createJobObjectW(null, null));
        const limits = allocate(144);
        limits.writeUInt32LE(0x2000, 16);
        check(api.setInformationJobObject(job, 9, limits, limits.length), 'SetInformationJobObject');
        port = keep(api.createIoCompletionPort(0xffffffffffffffffn, null, 0n, 1));
        const association = allocate(16);
        association.writeBigUInt64LE(job);
        association.writeBigUInt64LE(port, 8);
        check(api.setInformationJobObject(job, 7, association, association.length), 'Associate Job completion port');
        const input = pipe(), output = pipe(), errors = pipe();
        stdout = output[0];
        stderr = errors[0];
        const childHandles = [input[0], output[1], errors[1]];
        for (const handle of childHandles)
            check(api.setHandleInformation(handle, 1, 1), 'SetHandleInformation');
        const size = allocate(8);
        const sized = api.initializeProcThreadAttributeList(null, 2, 0, api.address(size));
        if (sized !== 0 || api.getLastError() !== 122)
            throw error('InitializeProcThreadAttributeList size query');
        const bytes = Number(size.readBigUInt64LE());
        if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 1024 * 1024)
            throw new Error('Invalid process attribute size');
        const attributes = allocate(bytes);
        check(api.initializeProcThreadAttributeList(api.address(attributes), 2, 0, api.address(size)), 'InitializeProcThreadAttributeList');
        initializedAttributes = api.address(attributes);
        const jobList = allocate(8);
        jobList.writeBigUInt64LE(job);
        const handleList = allocate(24);
        childHandles.forEach((handle, index) => handleList.writeBigUInt64LE(handle, index * 8));
        check(api.updateProcThreadAttribute(initializedAttributes, 0, 0x2000d, api.address(jobList), jobList.length, null, null), 'UpdateProcThreadAttribute Job list');
        check(api.updateProcThreadAttribute(initializedAttributes, 0, 0x20002, api.address(handleList), handleList.length, null, null), 'UpdateProcThreadAttribute handle list');
        const startup = allocate(112), information = allocate(24);
        startup.writeUInt32LE(112, 0);
        startup.writeUInt32LE(0x100, 60);
        childHandles.forEach((handle, index) => startup.writeBigUInt64LE(handle, 80 + index * 8));
        startup.writeBigUInt64LE(initializedAttributes, 104);
        check(api.createProcessW(options.executable, api.address(encoded.commandLine), null, null, 1, 0x08080400, api.address(encoded.environment), options.cwd, api.address(startup), api.address(information)), 'CreateProcessW');
        created = true;
        // Capture both handles before validating, so partial results cannot leak.
        const processHandle = information.readBigUInt64LE(0);
        const thread = information.readBigUInt64LE(8);
        if (processHandle) {
            root = processHandle;
            owned.add(root);
        }
        if (thread)
            owned.add(thread);
        pid = information.readUInt32LE(16);
        if (!root || !thread || !pid)
            throw new Error('CreateProcessW returned incomplete process information');
        for (const handle of [...input, output[1], errors[1], thread])
            close(handle);
    }
    catch (caught) {
        launchError = caught;
    }
    finally {
        if (initializedAttributes) {
            try {
                api.deleteProcThreadAttributeList(initializedAttributes);
            }
            catch (caught) {
                launchError ??= caught;
            }
        }
        // Retain and actually touch every backing Buffer until attribute deletion;
        // native attribute pointers must not outlive temporary JS marshalling.
        for (const buffer of held)
            buffer.fill(0);
    }
    if (!created) {
        const cleanupError = closeAll();
        if (cleanupError)
            throw new Error('Owned process cleanup could not be verified', { cause: cleanupError });
        throw launchError ?? new Error('Owned process could not start');
    }
    const result = Promise.withResolvers();
    const cleanup = Promise.withResolvers();
    void result.promise.catch(() => { });
    void cleanup.promise.catch(() => { });
    let finished = false, rootExited = false, stdoutClosed = false, stderrClosed = false;
    let code = null;
    let stdoutBytes = 0, stderrBytes = 0;
    let stoppingAt;
    let failure;
    let timer;
    const count = Buffer.alloc(4), accounting = Buffer.alloc(48), chunk = Buffer.alloc(16 * 1024);
    const message = Buffer.alloc(4), key = Buffer.alloc(8), value = Buffer.alloc(8);
    const processes = new Map();
    let trackingFailure;
    const observeBirths = () => {
        try {
            // Bound both native work per tick and retained process identities. All
            // failed opens (including error 87) stay uncertain, never assumed exited.
            for (let index = 0; index < 64; index++) {
                value.fill(0);
                if (!api.getQueuedCompletionStatus(port, api.address(message), api.address(key), api.address(value), 0)) {
                    const code = api.getLastError();
                    if (code === 258 && value.readBigUInt64LE() === 0n)
                        return true;
                    throw new Error(`Job completion queue failed (Win32 ${code})`);
                }
                if (key.readBigUInt64LE() !== job)
                    throw new Error('Unexpected Job completion key');
                if (message.readUInt32LE() !== 6)
                    continue;
                const born = Number(value.readBigUInt64LE());
                if (!Number.isSafeInteger(born) || born <= 0 || born > 0xffffffff || processes.has(born) || processes.size >= 1024)
                    throw new Error('Owned process birth tracking limit or identity violation');
                const handle = born === pid ? root : api.openProcess(0x100000, 0, born);
                processes.set(born, handle ?? 0n);
                if (!handle)
                    throw error('Open owned process for settlement');
                // Root is already owned; additional handles are observation-only. Never
                // terminate by a notification PID, which could have been recycled.
                owned.add(handle);
            }
            return false;
        }
        catch (caught) {
            trackingFailure ??= caught;
            throw caught;
        }
    };
    const finish = (cleanupError) => {
        if (finished)
            return;
        finished = true;
        clearInterval(timer);
        options.signal.removeEventListener('abort', cancel);
        // Always attempt every handle release, even if verification already failed.
        const releaseError = closeAll();
        cleanupError ??= trackingFailure ?? releaseError;
        if (cleanupError) {
            const rejected = new Error('Owned process cleanup could not be verified', { cause: cleanupError });
            cleanup.reject(rejected);
            result.reject(rejected);
        }
        else {
            cleanup.resolve();
            if (failure)
                result.reject(failure);
            else
                result.resolve({ code, signal: null, stdoutBytes, stderrBytes });
        }
    };
    const stop = (reason) => {
        failure ??= reason;
        if (finished || stoppingAt !== undefined)
            return;
        stoppingAt = performance.now();
        try {
            check(api.terminateJobObject(job, 1), 'TerminateJobObject');
        }
        catch (caught) {
            failure ??= caught;
        }
    };
    const cancel = () => stop(new Error('Owned process cancelled'));
    const read = (handle) => {
        if (!api.peekNamedPipe(handle, null, 0, null, api.address(count), null)) {
            if (api.getLastError() === 109)
                return null;
            throw error('PeekNamedPipe');
        }
        const available = Math.min(count.readUInt32LE(), chunk.length);
        if (available === 0)
            return 0;
        check(api.readFile(handle, chunk, available, api.address(count), null), 'ReadFile');
        const bytes = count.readUInt32LE();
        if (bytes > available)
            throw new Error('Invalid owned pipe read count');
        return bytes;
    };
    const poll = () => {
        if (finished)
            return;
        try {
            const queueEmpty = observeBirths();
            check(api.queryInformationJobObject(job, 1, accounting, accounting.length, null), 'QueryInformationJobObject');
            const total = accounting.readUInt32LE(36);
            if (total < 1 || total > 1024) {
                trackingFailure ??= new Error('Owned process birth tracking limit exceeded');
                throw trackingFailure;
            }
            // One available-byte read per pipe per tick. Continuous output cannot
            // monopolize the Host loop or starve cancellation/force-verification.
            if (!stdoutClosed) {
                const bytes = read(stdout);
                stdoutClosed = bytes === null;
                stdoutBytes += bytes ?? 0;
            }
            if (!stderrClosed) {
                const bytes = read(stderr);
                stderrClosed = bytes === null;
                stderrBytes += bytes ?? 0;
            }
            if (stdoutBytes + stderrBytes > maxOutputBytes)
                stop(new Error('Owned process output limit exceeded'));
            if (!rootExited) {
                if (!root)
                    throw new Error('Owned root handle is unavailable');
                const waited = api.waitForSingleObject(root, 0);
                if (waited === 0) {
                    check(api.getExitCodeProcess(root, api.address(count)), 'GetExitCodeProcess');
                    code = count.readUInt32LE();
                    rootExited = true;
                    stop();
                }
                else if (waited !== 258) {
                    trackingFailure ??= error('WaitForSingleObject');
                    throw trackingFailure;
                }
            }
            if (stoppingAt !== undefined && rootExited && stdoutClosed && stderrClosed) {
                if (queueEmpty && total > 0 && total === processes.size && processes.has(pid) && accounting.readUInt32LE(40) === 0) {
                    let signaled = true;
                    for (const handle of processes.values()) {
                        if (!handle)
                            continue; // sticky trackingFailure prevents successful cleanup
                        const waited = api.waitForSingleObject(handle, 0);
                        if (waited === 258)
                            signaled = false;
                        else if (waited !== 0) {
                            trackingFailure ??= error('Wait for owned process settlement');
                            throw trackingFailure;
                        }
                    }
                    if (signaled) {
                        finish();
                        return;
                    }
                }
            }
        }
        catch (caught) {
            stop(caught);
        }
        if (stoppingAt !== undefined && performance.now() - stoppingAt >= OWNED_PROCESS_EXIT_DEADLINE_MS)
            finish(new Error('Owned Job did not settle'));
    };
    timer = setInterval(poll, 10);
    options.signal.addEventListener('abort', cancel, { once: true });
    if (options.signal.aborted)
        cancel();
    if (launchError)
        stop(launchError);
    poll();
    if (launchError) {
        await cleanup.promise;
        throw launchError;
    }
    return { pid, completion: result.promise, terminate: () => { stop(); return cleanup.promise; } };
}
