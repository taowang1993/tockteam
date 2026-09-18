import { encodeIndexFrame, INDEX_FRAME_BYTES } from "./search-index-channel.js";
export const ISOLATED_SEARCH_SCHEMA = 'tocktutor-search-v3';
export function exact(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    return Number.isSafeInteger(value) && value >= min && value <= max;
}
export function text(value, max = 32768) {
    return typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0');
}
export function relativePath(value) {
    return text(value) && !value.includes('\\') && !value.includes(':') && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
export function documentRecord(value) {
    return exact(value, ['path', 'revision', 'modifiedAt']) && relativePath(value.path) && text(value.revision, 1024)
        && typeof value.modifiedAt === 'number' && Number.isFinite(value.modifiedAt);
}
/** One acknowledged data page per direction; at most four live requests, including abandoned work. */
export class IndexProtocol {
    peer;
    sequence = 0;
    queuedWrites = 0;
    writeTail = Promise.resolve();
    receivedSequence = 0;
    nextId = 0;
    incomingId = 0;
    failure;
    pending = new Map();
    incoming = new Map();
    queue = [];
    serving = false;
    ack;
    handle;
    notice;
    failed;
    constructor(peer, handle, notice, failed) {
        this.peer = peer;
        this.handle = handle;
        this.notice = notice;
        this.failed = failed;
        void this.receive().catch(error => this.close(error));
    }
    async send(body) {
        if (this.failure)
            throw this.failure;
        // Four admitted requests must not consume the capacity needed by control and ACK/data frames.
        if (this.queuedWrites >= 10)
            throw new Error('Index protocol write queue exceeded');
        if (!Number.isSafeInteger(this.sequence + 1))
            throw new Error('Index sequence exhausted');
        const bytes = encodeIndexFrame({ ...body, generation: this.peer.generation, sequence: ++this.sequence });
        // Snapshot before asynchronous admission; every queued value is already bounded to one frame.
        const snapshot = JSON.parse(bytes.subarray(4).toString('utf8'));
        this.queuedWrites += 1;
        const write = this.writeTail.then(() => {
            if (this.failure)
                throw this.failure;
            return this.peer.channel.send(snapshot);
        });
        this.writeTail = write.catch(() => { });
        try {
            await write;
        }
        finally {
            this.queuedWrites -= 1;
        }
    }
    notify(action, value) {
        return this.send({ type: 'notice', action, value });
    }
    request(action, args, limit, maxBytes, signal) {
        if (this.failure)
            return Promise.reject(this.failure);
        if (this.pending.size >= 4 || !Number.isSafeInteger(this.nextId + 1))
            return Promise.reject(new Error('Index request limit exceeded'));
        const id = ++this.nextId;
        const pending = { ...Promise.withResolvers(), items: [], page: 0, bytes: 0, limit, maxBytes };
        this.pending.set(id, pending);
        void this.send({ type: 'request', id, action, args }).catch(error => this.close(error));
        const abort = () => {
            if (action === 'search' && this.pending.has(id))
                void this.send({ type: 'cancel', id }).catch(error => this.close(error));
        };
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted)
            abort();
        // The wire request remains admitted until its terminal reply, even after its caller cancels.
        return pending.promise.finally(() => signal?.removeEventListener('abort', abort));
    }
    close(error = new Error('Index protocol is closed')) {
        if (this.failure)
            return;
        this.failure = error instanceof Error ? error : new Error('Index protocol failed');
        this.peer.channel.close();
        for (const pending of this.pending.values())
            pending.reject(this.failure);
        this.pending.clear();
        for (const incoming of this.incoming.values())
            incoming.controller.abort();
        this.incoming.clear();
        this.queue.length = 0;
        this.ack?.gate.reject(this.failure);
        this.ack = undefined;
        this.failed(this.failure);
    }
    async receive() {
        for await (const value of this.peer.channel.frames) {
            if (this.failure)
                return;
            if (value === null || typeof value !== 'object' || Array.isArray(value))
                throw new Error('Invalid index envelope');
            const message = value;
            if (message.generation !== this.peer.generation || !integer(message.sequence, 1) || message.sequence !== ++this.receivedSequence)
                throw new Error('Invalid index generation or sequence');
            const keys = ['generation', 'sequence', 'type'];
            if (message.type === 'request' && exact(message, [...keys, 'id', 'action', 'args'])) {
                if (!integer(message.id, 1) || message.id !== this.incomingId + 1 || this.incoming.size >= 4
                    || !['init', 'inventory', 'document', 'search'].includes(message.action))
                    throw new Error('Invalid index request');
                this.incomingId += 1;
                const incoming = { id: this.incomingId, action: message.action, args: message.args, controller: new AbortController() };
                this.incoming.set(incoming.id, incoming);
                this.queue.push(incoming);
                void this.serve().catch(error => this.close(error));
            }
            else if (message.type === 'cancel' && exact(message, [...keys, 'id'])) {
                if (!integer(message.id, 1, this.incomingId))
                    throw new Error('Invalid index cancellation');
                const incoming = this.incoming.get(message.id);
                if (incoming && incoming.action !== 'search')
                    throw new Error('Invalid index cancellation action');
                // A final response may have crossed cancellation on the two independent directions.
                incoming?.controller.abort();
            }
            else if (message.type === 'notice' && exact(message, [...keys, 'action', 'value'])) {
                if (!['invalidate', 'ready', 'step', 'failure'].includes(message.action))
                    throw new Error('Invalid index notice');
                this.notice(message.action, message.value);
            }
            else if (message.type === 'ack' && exact(message, [...keys, 'id', 'page'])) {
                if (!this.ack || message.id !== this.ack.id || message.page !== this.ack.page)
                    throw new Error('Invalid index acknowledgement');
                this.ack.gate.resolve();
                this.ack = undefined;
            }
            else if (message.type === 'page' && exact(message, [...keys, 'id', 'page', 'items', 'done', 'meta'])) {
                const pending = this.pending.get(message.id);
                if (!pending || message.page !== pending.page++ || !Array.isArray(message.items) || message.items.length > 256
                    || typeof message.done !== 'boolean' || (!message.done && (message.items.length === 0 || message.meta !== null)))
                    throw new Error('Invalid index data page');
                pending.bytes += Buffer.byteLength(JSON.stringify(message.items));
                if (pending.items.length + message.items.length > pending.limit || pending.bytes > pending.maxBytes)
                    throw new Error('Index response limit exceeded');
                pending.items.push(...message.items);
                await this.send({ type: 'ack', id: message.id, page: message.page });
                if (message.done) {
                    this.pending.delete(message.id);
                    pending.resolve({ items: pending.items, meta: message.meta });
                }
            }
            else
                throw new Error('Invalid index action');
        }
        throw new Error('Index peer disconnected');
    }
    async serve() {
        if (this.serving)
            return;
        this.serving = true;
        try {
            while (this.queue.length && !this.failure) {
                const incoming = this.queue.shift();
                const result = await this.handle(incoming.action, incoming.args, incoming.controller.signal);
                if (this.failure)
                    return;
                let offset = 0;
                let page = 0;
                do {
                    const items = [];
                    // Account for UTF-8 and the full envelope without repeatedly serializing a growing page.
                    let bytes = encodeIndexFrame({ type: 'page', generation: this.peer.generation, sequence: Number.MAX_SAFE_INTEGER,
                        id: incoming.id, page, items, done: false, meta: null }).length - 4;
                    while (offset < result.items.length && items.length < 256) {
                        const encoded = JSON.stringify(result.items[offset]);
                        if (encoded === undefined)
                            throw new Error('Invalid index record');
                        const size = Buffer.byteLength(encoded) + (items.length ? 1 : 0);
                        if (bytes + size > INDEX_FRAME_BYTES) {
                            if (!items.length)
                                throw new Error('Index record exceeds frame limit');
                            break;
                        }
                        bytes += size;
                        items.push(result.items[offset++]);
                    }
                    // Send terminal metadata separately so it cannot make a full data page overflow.
                    const done = items.length === 0;
                    const gate = Promise.withResolvers();
                    void gate.promise.catch(() => { });
                    this.ack = { id: incoming.id, page, gate };
                    const timer = setTimeout(() => this.close(new Error('Index acknowledgement stalled')), 15_000);
                    try {
                        await this.send({ type: 'page', id: incoming.id, page, items, done, meta: done ? result.meta : null });
                        await gate.promise;
                    }
                    finally {
                        clearTimeout(timer);
                    }
                    page += 1;
                    if (done)
                        break;
                } while (!this.failure);
                this.incoming.delete(incoming.id);
            }
        }
        finally {
            this.serving = false;
        }
    }
}
