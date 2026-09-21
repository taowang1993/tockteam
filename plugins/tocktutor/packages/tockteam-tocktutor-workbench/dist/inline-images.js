import { classifyExternalEmbed } from "./external-embeds.js";
const MAX_IMAGE_RESPONSE_BYTES = 14_000_000;
let active = 0;
const waiting = [];
async function imageData(url, signal) {
    if (active >= 4)
        await new Promise(resolve => waiting.push(resolve));
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
        return `data:${result.mimeType};base64,${result.dataBase64}`;
    }
    finally {
        const next = waiting.shift();
        if (next)
            next();
        else
            active--;
    }
}
/** Load only visible image placeholders, with view-owned cancellation and bounded concurrency. */
export function attachInlineImages(root, onSizeChange = () => { }) {
    const controller = new AbortController();
    const pending = new Map();
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
        for (const entry of entries)
            if (entry.isIntersecting) {
                pending.get(entry.target)?.();
                pending.delete(entry.target);
                observer?.unobserve(entry.target);
            }
    }, { rootMargin: '300px' });
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
        placeholder.replaceWith(image);
        const load = () => {
            void imageData(target.sourceUrl, controller.signal).then(src => {
                if (!controller.signal.aborted)
                    image.src = src;
            }).catch(failed);
        };
        if (observer) {
            pending.set(image, load);
            observer.observe(image);
        }
        else
            load();
    }
    return () => { controller.abort(); observer?.disconnect(); pending.clear(); };
}
//# sourceMappingURL=inline-images.js.map