import { Resolver } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';
export class WebFetchError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'WebFetchError';
        this.code = code;
    }
}
export const defaultPublicFetchLimits = {
    connectTimeoutMs: 5_000,
    maxAddresses: 16,
    maxRedirects: 5,
    maxResponseBytes: 1_000_000,
    maxResponseHeadersBytes: 32_768,
    maxTextChars: 1_000_000,
    maxUrlBytes: 4096,
    timeoutMs: 15_000,
};
export const maximumPublicFetchLimits = {
    connectTimeoutMs: 30_000,
    maxAddresses: 64,
    maxRedirects: 10,
    maxResponseBytes: 10_000_000,
    maxResponseHeadersBytes: 65_536,
    maxTextChars: 2_000_000,
    maxUrlBytes: 4096,
    timeoutMs: 60_000,
};
export const defaultPublicImageMaxBytes = maximumPublicFetchLimits.maxResponseBytes;
const utf8 = new TextEncoder();
const acceptedContentTypes = new Set([
    'application/xhtml+xml',
    'text/html',
    'text/plain',
]);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const ipv4Blocks = new BlockList();
const mappedIpv4Blocks = new BlockList();
const ipv6Blocks = new BlockList();
const ipv4Ranges = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.31.196.0', 24],
    ['192.52.193.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['192.175.48.0', 24],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
];
const ipv6Ranges = [
    ['::', 96],
    ['64:ff9b::', 96],
    ['64:ff9b:1::', 48],
    ['100::', 64],
    ['2001::', 23],
    ['2001:1::1', 128],
    ['2001:1::2', 128],
    ['2001:2::', 48],
    ['2001:3::', 32],
    ['2001:4:112::', 48],
    ['2001:10::', 28],
    ['2001:20::', 28],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
    ['5f00::', 16],
    ['2620:4f:8000::', 48],
    ['fc00::', 7],
    ['fe80::', 10],
    ['fec0::', 10],
    ['ff00::', 8],
];
for (const [address, prefix] of ipv4Ranges) {
    ipv4Blocks.addSubnet(address, prefix, 'ipv4');
    mappedIpv4Blocks.addSubnet(`::ffff:${address}`, 96 + prefix, 'ipv6');
}
for (const [address, prefix] of ipv6Ranges)
    ipv6Blocks.addSubnet(address, prefix, 'ipv6');
function fail(code, message) {
    throw new WebFetchError(code, message);
}
function bareHostname(hostname) {
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}
function isLocalHostname(hostname) {
    const name = hostname.toLowerCase().replace(/\.$/u, '');
    return name === 'localhost'
        || name.endsWith('.localhost')
        || name.endsWith('.local')
        || name === 'home.arpa'
        || name.endsWith('.home.arpa');
}
export function normalizePublicHttpUrl(value, maxBytes = defaultPublicFetchLimits.maxUrlBytes) {
    if (!value || /[\u0000-\u001f\u007f]/u.test(value) || utf8.encode(value).byteLength > maxBytes) {
        return fail('url', 'The URL is malformed or too long.');
    }
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return fail('url', 'The URL is malformed or too long.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return fail('url', 'Only HTTP and HTTPS URLs are allowed.');
    if (url.username || url.password)
        return fail('url', 'URLs cannot include credentials.');
    if (!url.hostname || isLocalHostname(url.hostname))
        return fail('url', 'The URL must name a public host.');
    url.hash = '';
    const normalized = url.toString();
    if (utf8.encode(normalized).byteLength > maxBytes)
        return fail('url', 'The URL is malformed or too long.');
    return normalized;
}
export function isPublicAddress(rawAddress) {
    const address = bareHostname(rawAddress);
    const family = isIP(address);
    if (family === 4)
        return !ipv4Blocks.check(address, 'ipv4');
    if (family === 6) {
        return !ipv6Blocks.check(address, 'ipv6') && !mappedIpv4Blocks.check(address, 'ipv6');
    }
    return false;
}
export function createPinnedLookup(rawAddress) {
    const address = bareHostname(rawAddress);
    const family = isIP(address);
    if (family !== 4 && family !== 6)
        return fail('address', 'A validated IP address is required.');
    return (_hostname, options, callback) => {
        if (options.all)
            callback(null, [{ address, family }]);
        else
            callback(null, address, family);
    };
}
async function defaultLookup(hostname, signal) {
    const address = bareHostname(hostname);
    if (isIP(address))
        return [{ address }];
    const resolver = new Resolver();
    const cancel = () => resolver.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try {
        const results = await Promise.allSettled([
            resolver.resolve4(address),
            resolver.resolve6(address),
        ]);
        return results.flatMap(result => result.status === 'fulfilled'
            ? result.value.map(value => ({ address: value }))
            : []);
    }
    finally {
        signal.removeEventListener('abort', cancel);
    }
}
function incomingHeaders(headers) {
    const result = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value))
            for (const item of value)
                result.append(name, item);
        else if (value !== undefined)
            result.set(name, value);
    }
    return result;
}
async function defaultRequest(input) {
    const url = new URL(input.url);
    const request = url.protocol === 'https:' ? https.request : http.request;
    return await new Promise((resolve, reject) => {
        const outgoing = request(url, {
            agent: false,
            headers: input.headers,
            lookup: createPinnedLookup(input.address),
            maxHeaderSize: input.maxResponseHeadersBytes,
            method: 'GET',
            signal: input.signal,
        }, incoming => {
            const status = incoming.statusCode ?? 502;
            const body = status === 204 || status === 304
                ? null
                : Readable.toWeb(incoming);
            resolve(new Response(body, {
                headers: incomingHeaders(incoming.headers),
                status,
                ...(incoming.statusMessage === undefined ? {} : { statusText: incoming.statusMessage }),
            }));
        });
        outgoing.once('socket', socket => {
            if (!socket.connecting)
                return;
            const timer = setTimeout(() => {
                outgoing.destroy(new WebFetchError('timeout', 'The connection timed out.'));
            }, input.connectTimeoutMs);
            const clear = () => { clearTimeout(timer); };
            socket.once('connect', clear);
            socket.once('close', clear);
        });
        outgoing.once('error', reject);
        outgoing.end();
    });
}
function checkedLimits(overrides) {
    const limits = { ...defaultPublicFetchLimits, ...overrides };
    for (const key of Object.keys(maximumPublicFetchLimits)) {
        const value = limits[key];
        const minimum = key === 'maxRedirects' ? 0 : 1;
        if (!Number.isSafeInteger(value) || value < minimum || value > maximumPublicFetchLimits[key]) {
            return fail('network', 'Fetch limits are invalid.');
        }
    }
    return limits;
}
async function abortable(promise, signal) {
    if (signal.aborted)
        throw signal.reason;
    let abort;
    const aborted = new Promise((_resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
    });
    try {
        return await Promise.race([promise, aborted]);
    }
    finally {
        if (abort)
            signal.removeEventListener('abort', abort);
    }
}
async function resolvePublicAddress(url, lookup, limits, signal) {
    const hostname = bareHostname(url.hostname);
    let addresses;
    try {
        addresses = isIP(hostname) ? [{ address: hostname }] : await abortable(lookup(hostname, signal), signal);
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        return fail('address', 'The public host could not be resolved.');
    }
    if (addresses.length === 0 || addresses.length > limits.maxAddresses || addresses.some(result => !isPublicAddress(result.address))) {
        return fail('address', 'Only public HTTP(S) addresses are allowed.');
    }
    return addresses[0]?.address ?? fail('address', 'Only public HTTP(S) addresses are allowed.');
}
export function responseHeaderBytes(headers) {
    let bytes = 2;
    for (const [name, value] of headers)
        bytes += utf8.encode(`${name}: ${value}\r\n`).byteLength;
    return bytes;
}
async function discard(response) {
    await response.body?.cancel().catch(() => undefined);
}
function contentType(response) {
    const value = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (!value || !acceptedContentTypes.has(value)) {
        return fail('content-type', 'The response must contain HTML or plain text.');
    }
    return value;
}
export async function readBoundedText(response, limits, signal) {
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
        if (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > limits.maxResponseBytes) {
            await discard(response);
            return fail('body', 'The response body is too large.');
        }
    }
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
        while (true) {
            const { done, value } = await abortable(reader.read(), signal);
            if (done)
                break;
            if (value === undefined)
                continue;
            bytes += value.byteLength;
            if (bytes > limits.maxResponseBytes)
                return fail('body', 'The response body is too large.');
            text += decoder.decode(value, { stream: true });
            if (text.length > limits.maxTextChars)
                return fail('text', 'The decoded response text is too large.');
        }
        text += decoder.decode();
        if (text.length > limits.maxTextChars)
            return fail('text', 'The decoded response text is too large.');
        return text;
    }
    catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
}
function mappedFailure(error, timedOut, callerAborted) {
    if (error instanceof WebFetchError)
        return error;
    if (callerAborted)
        return new WebFetchError('aborted', 'The request was cancelled.');
    if (timedOut)
        return new WebFetchError('timeout', 'The request timed out.');
    return new WebFetchError('network', 'The public request failed.');
}
async function fetchPublicResource(value, options, accept, read) {
    const limits = checkedLimits(options.limits);
    let currentUrl = normalizePublicHttpUrl(value, limits.maxUrlBytes);
    const controller = new AbortController();
    let timedOut = false;
    let callerAborted = options.signal?.aborted ?? false;
    const abortFromCaller = () => {
        callerAborted = true;
        controller.abort(options.signal?.reason);
    };
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (callerAborted)
        controller.abort(options.signal?.reason);
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, limits.timeoutMs);
    try {
        for (let redirects = 0;; redirects += 1) {
            if (controller.signal.aborted)
                throw controller.signal.reason;
            const url = new URL(currentUrl);
            const address = await resolvePublicAddress(url, options.lookup ?? defaultLookup, limits, controller.signal);
            if (controller.signal.aborted)
                throw controller.signal.reason;
            const responsePromise = (options.request ?? defaultRequest)({
                address,
                connectTimeoutMs: limits.connectTimeoutMs,
                headers: {
                    accept,
                    'accept-encoding': 'identity',
                },
                maxResponseHeadersBytes: limits.maxResponseHeadersBytes,
                signal: controller.signal,
                url: currentUrl,
            });
            void responsePromise.then(async (response) => {
                if (controller.signal.aborted)
                    await discard(response);
            }, () => undefined);
            const response = await abortable(responsePromise, controller.signal);
            if (responseHeaderBytes(response.headers) > limits.maxResponseHeadersBytes) {
                await discard(response);
                return fail('headers', 'The response headers are too large.');
            }
            if (redirectStatuses.has(response.status)) {
                const location = response.headers.get('location');
                await discard(response);
                if (!location || redirects >= limits.maxRedirects)
                    return fail('redirect', 'The redirect chain is invalid or too long.');
                currentUrl = normalizePublicHttpUrl(new URL(location, currentUrl).toString(), limits.maxUrlBytes);
                continue;
            }
            if (!response.ok) {
                await discard(response);
                return fail('status', 'The public server returned an unsuccessful status.');
            }
            const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
            if (encoding && encoding !== 'identity') {
                await discard(response);
                return fail('encoding', 'Compressed response bodies are not accepted.');
            }
            try {
                return await read(response, limits, controller.signal, currentUrl);
            }
            catch (error) {
                await discard(response);
                throw error;
            }
        }
    }
    catch (error) {
        throw mappedFailure(error, timedOut, callerAborted);
    }
    finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abortFromCaller);
    }
}
export async function fetchPublicText(value, options = {}) {
    return await fetchPublicResource(value, options, 'text/html,application/xhtml+xml,text/plain;q=0.8', async (response, limits, signal, url) => {
        const type = contentType(response);
        return { contentType: type, text: await readBoundedText(response, limits, signal), url };
    });
}
/** Public raster bytes only: no cookies, active SVG, renderer network access, or private redirects. */
export async function fetchPublicImage(value, options = {}) {
    const imageOptions = { ...options, limits: { maxResponseBytes: defaultPublicImageMaxBytes, ...options.limits } };
    return await fetchPublicResource(value, imageOptions, 'image/avif,image/webp,image/png,image/jpeg,image/gif', async (response, limits, signal, url) => {
        const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
        if (!/^image\/(?:png|jpeg|gif|webp|avif)$/u.test(mimeType))
            return fail('content-type', 'A raster image is required.');
        const length = response.headers.get('content-length');
        if (length !== null && (!/^\d+$/u.test(length) || Number(length) > limits.maxResponseBytes))
            return fail('body', 'The image is too large.');
        const reader = response.body?.getReader();
        if (!reader)
            return fail('body', 'The image is empty.');
        const chunks = [];
        let total = 0;
        try {
            while (true) {
                const { done, value } = await abortable(reader.read(), signal);
                if (done)
                    break;
                total += value.byteLength;
                if (total > limits.maxResponseBytes)
                    return fail('body', 'The image is too large.');
                chunks.push(value);
            }
        }
        catch (error) {
            await reader.cancel().catch(() => undefined);
            throw error;
        }
        finally {
            reader.releaseLock();
        }
        const data = Buffer.concat(chunks, total);
        const signature = mimeType === 'image/png' ? data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
            : mimeType === 'image/jpeg' ? data.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
                : mimeType === 'image/gif' ? /^GIF8[79]a$/u.test(data.subarray(0, 6).toString('ascii'))
                    : mimeType === 'image/webp' ? data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP'
                        : data.subarray(4, 8).toString('ascii') === 'ftyp' && /avif|avis/u.test(data.subarray(8, 32).toString('ascii'));
        if (!signature)
            return fail('content-type', 'The image bytes do not match their content type.');
        return { dataBase64: data.toString('base64'), mimeType, url };
    });
}
