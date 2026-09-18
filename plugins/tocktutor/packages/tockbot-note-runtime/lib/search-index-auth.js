import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createConnection, createServer } from 'node:net';
import { INDEX_FRAME_BYTES, IndexChannel } from "./search-index-channel.js";
const VERSION = 1;
const AUTH_DEADLINE_MS = 15_000;
const PEER_DEADLINE_MS = 2_000;
const MAX_ATTEMPTS = 8;
function fields(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
const tokenValid = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const generationValid = (value) => typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value);
function parseBootstrap(json) {
    let value;
    try {
        if (typeof json !== 'string' || Buffer.byteLength(json) > 1024)
            throw new Error();
        value = JSON.parse(json);
    }
    catch {
        throw new Error('Invalid index bootstrap');
    }
    if (!fields(value, ['port', 'token', 'generation']) || !Number.isSafeInteger(value.port)
        || value.port < 1 || value.port > 65535
        || !tokenValid(value.token) || !generationValid(value.generation))
        throw new Error('Invalid index bootstrap');
    return value;
}
/** A fresh, private bootstrap goes only into the owned child's explicit environment. */
export async function listenForIndexPeer(signal) {
    signal.throwIfAborted();
    const generation = randomBytes(16).toString('hex');
    const token = randomBytes(32);
    const peer = Promise.withResolvers();
    void peer.promise.catch(() => { });
    const sockets = new Set();
    const server = createServer({ highWaterMark: INDEX_FRAME_BYTES });
    server.maxConnections = 2;
    let attempts = 0;
    let authenticated = false;
    let closed = false;
    let closing;
    const stopListening = () => {
        closing ??= new Promise((resolve, reject) => server.close(error => {
            if (error && error.code !== 'ERR_SERVER_NOT_RUNNING')
                reject(error);
            else
                resolve();
        }));
        void closing.catch(() => { });
        return closing;
    };
    const close = (error = new Error('Index listener is closed')) => {
        closed = true;
        clearTimeout(deadline);
        signal.removeEventListener('abort', abort);
        peer.reject(error);
        for (const socket of sockets)
            socket.destroy();
        return stopListening();
    };
    const abort = () => { void close(new Error('Index authentication cancelled')); };
    const deadline = setTimeout(() => { void close(new Error('Index authentication timed out')); }, AUTH_DEADLINE_MS);
    signal.addEventListener('abort', abort, { once: true });
    server.on('error', error => { void close(error); });
    server.on('connection', socket => {
        const channel = new IndexChannel(socket);
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
        attempts += 1;
        if (closed || authenticated || attempts > MAX_ATTEMPTS) {
            channel.close();
            return;
        }
        const timeout = setTimeout(() => channel.close(), PEER_DEADLINE_MS);
        let admitted = false;
        void (async () => {
            try {
                const first = await channel.frames.next();
                const hello = first.value;
                if (first.done || !fields(hello, ['type', 'version', 'generation', 'token'])
                    || hello.type !== 'hello' || hello.version !== VERSION || hello.generation !== generation
                    || !tokenValid(hello.token) || !timingSafeEqual(Buffer.from(hello.token, 'hex'), token)
                    || closed || authenticated)
                    throw new Error('Invalid index authentication');
                authenticated = true;
                admitted = true;
                clearTimeout(deadline);
                void stopListening();
                for (const other of sockets)
                    if (other !== socket)
                        other.destroy();
                await channel.send({ type: 'accepted', version: VERSION, generation });
                if (closed)
                    throw new Error('Index listener is closed');
                peer.resolve({ channel, generation });
            }
            catch {
                channel.close();
                if (admitted)
                    await close(new Error('Index authentication failed'));
                else if (!authenticated && attempts >= MAX_ATTEMPTS)
                    await close(new Error('Index authentication attempt limit exceeded'));
            }
            finally {
                clearTimeout(timeout);
            }
        })().catch(error => { void close(error); });
    });
    try {
        server.listen({ host: '127.0.0.1', port: 0, signal });
        await once(server, 'listening', { signal });
        const address = server.address();
        if (address === null || typeof address === 'string')
            throw new Error('Index listener has no loopback address');
        return { bootstrap: JSON.stringify({ port: address.port, token: token.toString('hex'), generation }), peer: peer.promise, close };
    }
    catch (error) {
        await close();
        throw error;
    }
}
export async function connectIndexPeer(bootstrap, signal) {
    const { port, token, generation } = parseBootstrap(bootstrap);
    signal.throwIfAborted();
    const options = { host: '127.0.0.1', port, highWaterMark: INDEX_FRAME_BYTES };
    const socket = createConnection(options);
    const channel = new IndexChannel(socket);
    const abort = () => channel.close();
    const timeout = setTimeout(abort, AUTH_DEADLINE_MS);
    signal.addEventListener('abort', abort, { once: true });
    socket.once('close', () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); });
    try {
        if (signal.aborted)
            abort();
        await channel.send({ type: 'hello', version: VERSION, generation, token });
        const first = await channel.frames.next();
        const accepted = first.value;
        if (first.done || !fields(accepted, ['type', 'version', 'generation']) || accepted.type !== 'accepted'
            || accepted.version !== VERSION || accepted.generation !== generation)
            throw new Error('Invalid index authentication acknowledgement');
        clearTimeout(timeout);
        return { channel, generation };
    }
    catch (error) {
        channel.close();
        throw error;
    }
}
