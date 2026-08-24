import { WEB_CLIP_APPLY_API_PATH, WEB_CLIP_CANCEL_API_PATH, WEB_CLIP_READER_API_PATH, WEB_CLIP_REVIEW_API_PATH, WEB_CLIP_VIEWER_API_PATH, normalizeViewerPageUrl, } from "./viewer.js";
const MAX_VIEWER_HTML_CHARS = 1_000_000;
const MAX_VIEWER_RESPONSE_BYTES = 6_100_000;
const acceptedContentTypes = new Set(['application/xhtml+xml', 'text/html', 'text/plain']);
export function viewerInputUrl(raw) {
    const value = raw.trim();
    if (!value || /[\u0000-\u001f\u007f]/u.test(value))
        throw new Error('Enter a public HTTP(S) URL.');
    try {
        return normalizeViewerPageUrl(/^[a-z][a-z\d+.-]*:/iu.test(value) ? value : `https://${value}`);
    }
    catch {
        throw new Error('Enter a credential-free public HTTP(S) hostname.');
    }
}
export function parseReaderViewResult(value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('The Host returned an invalid Reader View.');
    const input = value;
    if (typeof input.content !== 'string'
        || input.content.length > 200_000
        || typeof input.sourceUrl !== 'string'
        || typeof input.title !== 'string'
        || input.title.length > 200
        || !Array.isArray(input.warnings)
        || input.warnings.length > 8
        || input.warnings.some(warning => typeof warning !== 'string' || warning.length > 200)) {
        throw new Error('The Host returned an invalid Reader View.');
    }
    return {
        content: input.content,
        sourceUrl: viewerInputUrl(input.sourceUrl),
        title: input.title,
        warnings: input.warnings,
    };
}
export function parseViewerPageResult(value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('The Host returned an invalid viewer page.');
    const input = value;
    if (typeof input.contentType !== 'string'
        || !acceptedContentTypes.has(input.contentType)
        || typeof input.html !== 'string'
        || input.html.length > MAX_VIEWER_HTML_CHARS
        || typeof input.title !== 'string'
        || input.title.length > 240
        || typeof input.url !== 'string')
        throw new Error('The Host returned an invalid viewer page.');
    const url = viewerInputUrl(input.url);
    return {
        contentType: input.contentType,
        html: input.html,
        title: input.title,
        url,
    };
}
function validatedClipPath(value) {
    if (typeof value !== 'string'
        || !value
        || value.length > 1024
        || value.startsWith('/')
        || value.startsWith('\\')
        || /^[A-Za-z]:/u.test(value))
        throw new Error('The Host returned an invalid clip path.');
    const parts = value.split('/');
    if (parts.some(part => (!part
        || part !== part.trim()
        || part === '.'
        || part === '..'
        || part.length > 255
        || /[:*?"<>|\\\u0000-\u001f\u007f]/u.test(part))) || !/\.(?:md|markdown)$/iu.test(value))
        throw new Error('The Host returned an invalid clip path.');
    return value;
}
export function parseClipPreview(value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('The Host returned an invalid clip preview.');
    const input = value;
    const destination = validatedClipPath(input.destination);
    const target = input.target;
    const vault = input.vault;
    if (typeof input.contentDigest !== 'string'
        || !/^sha256:[0-9a-f]{64}$/u.test(input.contentDigest)
        || typeof input.expiresAt !== 'number'
        || !Number.isSafeInteger(input.expiresAt)
        || input.expiresAt < 0
        || typeof input.markdown !== 'string'
        || input.markdown.length > 210_000
        || new TextEncoder().encode(input.markdown).byteLength > 256 * 1024
        || input.permission !== 'user-approval-required'
        || typeof input.reviewId !== 'string'
        || !input.reviewId
        || input.reviewId.length > 128
        || typeof input.sourceUrl !== 'string'
        || typeof input.title !== 'string'
        || input.title.length > 200
        || typeof target !== 'object'
        || target === null
        || target.state !== 'absent'
        || typeof vault !== 'object'
        || vault === null
        || typeof vault.id !== 'string'
        || vault.id.length > 256
        || !Number.isSafeInteger(vault.generation)
        || (vault.generation < 0)) {
        throw new Error('The Host returned an invalid clip preview.');
    }
    return {
        contentDigest: input.contentDigest,
        destination,
        expiresAt: input.expiresAt,
        markdown: input.markdown,
        permission: 'user-approval-required',
        reviewId: input.reviewId,
        sourceUrl: viewerInputUrl(input.sourceUrl),
        target: { state: 'absent' },
        title: input.title,
        vault: {
            generation: vault.generation,
            id: vault.id,
        },
    };
}
export function parseClipApplyResult(value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('The Host returned an invalid clip result.');
    const input = value;
    const path = validatedClipPath(input.path);
    if (input.status !== 'created'
        || typeof input.digest !== 'string'
        || !/^sha256:[0-9a-f]{64}$/u.test(input.digest)
        || typeof input.generation !== 'number'
        || !Number.isSafeInteger(input.generation)
        || input.generation < 0
        || typeof input.revision !== 'string'
        || !input.revision
        || input.revision.length > 256)
        throw new Error('The Host returned an invalid clip result.');
    return {
        digest: input.digest,
        generation: input.generation,
        path,
        revision: input.revision,
        status: 'created',
    };
}
async function responseText(response) {
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            bytes += value.byteLength;
            if (bytes > MAX_VIEWER_RESPONSE_BYTES)
                throw new Error('The Host response is too large.');
            text += decoder.decode(value, { stream: true });
        }
        return text + decoder.decode();
    }
    catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
}
async function requestApi(path, body, signal) {
    const response = await fetch(path, {
        body: JSON.stringify(body),
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal,
    });
    const raw = await responseText(response);
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new Error('The Host returned an invalid response.');
    }
    if (!response.ok) {
        const code = typeof value === 'object' && value !== null && typeof value.error === 'string'
            ? value.error
            : `HTTP ${String(response.status)}`;
        throw new Error(`Viewer request failed: ${code.slice(0, 80)}`);
    }
    return value;
}
export async function requestViewerPage(url, signal) {
    return parseViewerPageResult(await requestApi(WEB_CLIP_VIEWER_API_PATH, { url: viewerInputUrl(url) }, signal));
}
export async function requestReaderView(url, signal) {
    return parseReaderViewResult(await requestApi(WEB_CLIP_READER_API_PATH, { url: viewerInputUrl(url) }, signal));
}
export async function requestClipPreview(url, destination, signal) {
    return parseClipPreview(await requestApi(WEB_CLIP_REVIEW_API_PATH, {
        ...(destination?.trim() ? { destination: destination.trim() } : {}),
        url: viewerInputUrl(url),
    }, signal));
}
export async function requestClipApply(approval, signal) {
    return parseClipApplyResult(await requestApi(WEB_CLIP_APPLY_API_PATH, approval, signal));
}
export async function requestClipCancel(reviewId, signal) {
    const value = await requestApi(WEB_CLIP_CANCEL_API_PATH, { reviewId }, signal);
    if (typeof value !== 'object' || value === null || typeof value.cancelled !== 'boolean') {
        throw new Error('The Host returned an invalid clip cancellation.');
    }
    return value.cancelled;
}
