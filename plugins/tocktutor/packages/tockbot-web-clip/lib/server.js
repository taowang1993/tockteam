import { WEB_CLIP_APPLY_API_PATH, WEB_CLIP_CANCEL_API_PATH, WEB_CLIP_READER_API_PATH, WEB_CLIP_REVIEW_API_PATH, WEB_CLIP_VIEWER_API_PATH, } from "./viewer.js";
export { WEB_CLIP_APPLY_API_PATH, WEB_CLIP_CANCEL_API_PATH, WEB_CLIP_READER_API_PATH, WEB_CLIP_REVIEW_API_PATH, WEB_CLIP_VIEWER_API_PATH, };
const MAX_VIEWER_REQUEST_BYTES = 8192;
const DEFAULT_REQUEST_BODY_TIMEOUT_MS = 5_000;
function sendJson(response, status, value) {
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
        'x-content-type-options': 'nosniff',
    });
    response.end(JSON.stringify(value));
}
export function isTrustedDesktopRequest(request) {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (!origin || !host || request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    try {
        const authority = new URL(`http://${host}`);
        const loopback = authority.hostname === 'localhost'
            || authority.hostname.endsWith('.localhost')
            || authority.hostname === '127.0.0.1'
            || authority.hostname === '[::1]';
        if (!loopback)
            return false;
        const url = new URL(origin);
        const protocol = request.socket.encrypted === true ? 'https:' : 'http:';
        return url.protocol === protocol && url.host === authority.host;
    }
    catch {
        return false;
    }
}
async function readRequest(request, timeoutMs) {
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== undefined && contentType !== 'application/json')
        throw new Error('invalid content type');
    const declared = request.headers['content-length'];
    if (declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > MAX_VIEWER_REQUEST_BYTES)) {
        throw new Error('request body is too large');
    }
    const body = await new Promise((resolve, reject) => {
        const chunks = [];
        let bytes = 0;
        const cleanup = () => {
            clearTimeout(timer);
            request.removeListener('aborted', aborted);
            request.removeListener('data', data);
            request.removeListener('end', end);
            request.removeListener('error', error);
        };
        const aborted = () => { cleanup(); reject(new Error('request was aborted')); };
        const error = (cause) => { cleanup(); reject(cause); };
        const data = (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.byteLength;
            if (bytes > MAX_VIEWER_REQUEST_BYTES) {
                cleanup();
                request.resume();
                reject(new Error('request body is too large'));
                return;
            }
            chunks.push(buffer);
        };
        const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('request body timed out'));
            request.destroy();
        }, timeoutMs);
        request.once('aborted', aborted);
        request.on('data', data);
        request.once('end', end);
        request.once('error', error);
    });
    return JSON.parse(body.toString('utf8'));
}
function record(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('request body is invalid');
    return value;
}
function urlRequest(value) {
    const url = record(value).url;
    if (typeof url !== 'string')
        throw new Error('request body is invalid');
    return url;
}
function reviewRequest(value) {
    const input = record(value);
    if (typeof input.url !== 'string'
        || (input.destination !== undefined && typeof input.destination !== 'string')) {
        throw new Error('request body is invalid');
    }
    return {
        ...(input.destination === undefined ? {} : { destination: input.destination }),
        url: input.url,
    };
}
function approvalRequest(value) {
    const input = record(value);
    const target = record(input.target);
    const vault = record(input.vault);
    if (typeof input.contentDigest !== 'string'
        || input.contentDigest.length > 80
        || typeof input.destination !== 'string'
        || input.destination.length > 1024
        || !Number.isSafeInteger(input.expiresAt)
        || input.expiresAt < 0
        || input.permission !== 'user-approved'
        || typeof input.reviewId !== 'string'
        || input.reviewId.length > 128
        || typeof input.sourceUrl !== 'string'
        || input.sourceUrl.length > 4096
        || target.state !== 'absent'
        || typeof vault.id !== 'string'
        || vault.id.length > 256
        || !Number.isSafeInteger(vault.generation)
        || vault.generation < 0)
        throw new Error('request body is invalid');
    return {
        contentDigest: input.contentDigest,
        destination: input.destination,
        expiresAt: input.expiresAt,
        permission: 'user-approved',
        reviewId: input.reviewId,
        sourceUrl: input.sourceUrl,
        target: { state: 'absent' },
        vault: { generation: vault.generation, id: vault.id },
    };
}
function cancelRequest(value) {
    const reviewId = record(value).reviewId;
    if (typeof reviewId !== 'string' || !reviewId || reviewId.length > 128)
        throw new Error('request body is invalid');
    return reviewId;
}
function createApiHandler(parse, load, options) {
    const timeoutMs = options.requestBodyTimeoutMs ?? DEFAULT_REQUEST_BODY_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
        throw new Error('request body timeout is invalid');
    }
    return async (request, response) => {
        if (request.method !== 'POST') {
            response.writeHead(405, { allow: 'POST' });
            response.end();
            return;
        }
        if (!isTrustedDesktopRequest(request)) {
            sendJson(response, 403, { error: 'untrusted origin' });
            return;
        }
        const controller = new AbortController();
        const abort = () => { controller.abort(); };
        const abortClosed = () => {
            if (!response.writableEnded)
                controller.abort();
        };
        request.once('aborted', abort);
        response.once('close', abortClosed);
        try {
            const input = parse(await readRequest(request, timeoutMs));
            sendJson(response, 200, await load(input, controller.signal));
        }
        catch (error) {
            if (controller.signal.aborted)
                return;
            const code = typeof error === 'object' && error !== null && 'code' in error
                ? String(error.code).slice(0, 40)
                : 'invalid-request';
            sendJson(response, 400, { error: code });
        }
        finally {
            request.removeListener('aborted', abort);
            response.removeListener('close', abortClosed);
        }
    };
}
export function createViewerHandler(load, options = {}) {
    return createApiHandler(urlRequest, load, options);
}
export function createReaderHandler(load, options = {}) {
    return createApiHandler(urlRequest, load, options);
}
export function createClipReviewHandler(load, options = {}) {
    return createApiHandler(reviewRequest, load, options);
}
export function createClipApplyHandler(load, options = {}) {
    return createApiHandler(approvalRequest, load, options);
}
export function createClipCancelHandler(load, options = {}) {
    return createApiHandler(cancelRequest, async (reviewId) => ({ cancelled: load(reviewId) }), options);
}
