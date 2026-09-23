import { MAX_EMBED_TARGETS } from "./embeds.js";
import { classifyExternalEmbed } from "./external-embeds.js";
const MAX_IMAGE_RESPONSE_BYTES = 14_000_000;
let active = 0;
const waiting = [];
async function imageData(url, signal) {
    signal.throwIfAborted();
    if (active >= 4)
        await new Promise((resolve, reject) => {
            const start = () => { signal.removeEventListener('abort', cancel); resolve(); };
            const cancel = () => { waiting.splice(waiting.indexOf(start), 1); reject(signal.reason); };
            signal.addEventListener('abort', cancel, { once: true });
            waiting.push(start);
        });
    else
        active++;
    try {
        signal.throwIfAborted();
        // The Desktop Web Clip Host owns public-address checks, DNS pinning and redirects.
        // No authored URL is ever installed as an image resource in the privileged renderer.
        const response = await fetch('/web-clip/api/image', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url }), signal, cache: 'no-store',
        });
        if (!response.ok || !response.body)
            throw new Error('Image unavailable');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0, text = '';
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                bytes += value.byteLength;
                if (bytes > MAX_IMAGE_RESPONSE_BYTES)
                    throw new Error('Image too large');
                text += decoder.decode(value, { stream: true });
            }
        }
        catch (error) {
            await reader.cancel().catch(() => undefined);
            throw error;
        }
        finally {
            reader.releaseLock();
        }
        const result = JSON.parse(text + decoder.decode());
        if (typeof result.mimeType !== 'string' || !/^image\/(?:png|jpeg|gif|webp|avif)$/u.test(result.mimeType)
            || typeof result.dataBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(result.dataBase64))
            throw new Error('Invalid image');
        signal.throwIfAborted();
        const image = new Image();
        image.decoding = 'async';
        let abort;
        const aborted = new Promise((_resolve, reject) => {
            abort = () => { image.removeAttribute('src'); reject(signal.reason); };
            signal.addEventListener('abort', abort, { once: true });
        });
        const loaded = typeof image.decode === 'function' ? new Promise((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('Invalid image'));
        }) : Promise.resolve();
        try {
            image.src = `data:${result.mimeType};base64,${result.dataBase64}`;
            await Promise.race([loaded, aborted]);
            if (image.naturalWidth * image.naturalHeight * 4 > 64 * 1024 * 1024)
                throw new Error('Image dimensions too large');
            await Promise.race([image.decode?.(), aborted]);
            signal.throwIfAborted();
            return image;
        }
        finally {
            signal.removeEventListener('abort', abort);
            image.onload = image.onerror = null;
        }
    }
    finally {
        const next = waiting.shift();
        if (next)
            next();
        else
            active--;
    }
}
/** One note/view owns its requests and decoded cache; widget disposal only detaches that consumer. */
export class InlineImageLoader {
    entries = new Map();
    bytes = 0;
    prefetched = new Set();
    load(url) {
        const cached = this.entries.get(url);
        if (cached)
            return cached.promise;
        const controller = new AbortController();
        const entry = { controller, bytes: 0, promise: imageData(url, controller.signal) };
        this.entries.set(url, entry);
        entry.promise = entry.promise.then(image => {
            if (this.entries.get(url) === entry) {
                entry.bytes = image.src.length * 2 + image.naturalWidth * image.naturalHeight * 4;
                this.bytes += entry.bytes;
                // ponytail: a 128 MiB per-view cache; exceptionally image-heavy notes may reload evicted images.
                for (const [key, value] of this.entries) {
                    if (this.bytes <= 128 * 1024 * 1024)
                        break;
                    if (value.bytes === 0)
                        continue;
                    this.entries.delete(key);
                    this.bytes -= value.bytes;
                }
            }
            return image;
        });
        return entry.promise;
    }
    sync(urls) {
        const current = new Set(urls);
        for (const [url, entry] of this.entries)
            if (!current.has(url)) {
                entry.controller.abort();
                this.bytes -= entry.bytes;
                this.entries.delete(url);
            }
        // Keep speculative work finite, even in a generated note containing thousands of images.
        this.prefetched = new Set([...this.prefetched].filter(url => current.has(url)));
        for (const url of [...current].slice(0, MAX_EMBED_TARGETS))
            if (!this.prefetched.has(url)) {
                this.prefetched.add(url);
                void this.load(url).catch(() => { });
            }
    }
    dispose() { this.sync([]); }
}
/** Start immediately, and only publish fully decoded images. */
export function attachInlineImages(root, onSizeChange = () => { }, shared) {
    const controller = new AbortController();
    const loader = shared ?? new InlineImageLoader();
    for (const placeholder of Array.from(root.querySelectorAll('[data-external-embed-kind="image"]'))) {
        const target = classifyExternalEmbed(placeholder.dataset.externalUrl ?? '');
        if (target === null)
            continue;
        const image = document.createElement('img');
        image.className = 'tocktutor-inline-image';
        image.alt = placeholder.dataset.imageAlt ?? placeholder.textContent?.replace(/^External Image:\s*/u, '') ?? '';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        const failed = () => {
            if (controller.signal.aborted || image.dataset.loadError === 'true')
                return;
            image.alt = image.alt ? `Image Unavailable: ${image.alt}` : 'Image Unavailable';
            image.dataset.loadError = 'true';
            onSizeChange();
        };
        image.addEventListener('load', onSizeChange, { signal: controller.signal });
        image.addEventListener('error', failed, { signal: controller.signal });
        void loader.load(target.sourceUrl).then(async (ready) => {
            if (controller.signal.aborted)
                return;
            image.src = ready.src;
            if (ready.naturalWidth) {
                image.width = ready.naturalWidth;
                image.height = ready.naturalHeight;
            }
            await image.decode?.();
            if (!controller.signal.aborted) {
                placeholder.replaceWith(image);
                onSizeChange();
            }
        }).catch(() => { failed(); if (!controller.signal.aborted)
            placeholder.replaceWith(image); });
    }
    return () => { controller.abort(); if (!shared)
        loader.dispose(); };
}
//# sourceMappingURL=inline-images.js.map