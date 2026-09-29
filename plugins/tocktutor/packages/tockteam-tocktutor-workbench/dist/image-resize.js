import { imageWidthHint } from "./rich-markdown.js";
export const MAX_IMAGE_WIDTH = 2_000;
const MIN_IMAGE_WIDTH = 80;
const WIDTH_SUFFIX = /(?:^|\|)(\d{1,4})(?:x(\d{1,4}))?$/iu;
/** The inline node is the exact occurrence, so repeated embeds cannot resize a neighbour. */
export function resizeWikilinkToken(token, width) {
    if (!Number.isSafeInteger(width) || width < MIN_IMAGE_WIDTH || width > MAX_IMAGE_WIDTH)
        return null;
    const match = token.match(/^!\[\[([^\]\r\n]{1,4096})\]\]$/u);
    if (!match)
        return null;
    const body = match[1];
    const marker = body.lastIndexOf('|');
    if (marker < 0)
        return `![[${body}|${String(width)}]]`;
    if (marker === 0 || !imageWidthHint(body.slice(marker)))
        return null; // An alias or caption is not a size.
    return `![[${body.slice(0, marker)}|${String(width)}]]`;
}
export function resizedImageAlt(alt, width) {
    if (!Number.isSafeInteger(width) || width < MIN_IMAGE_WIDTH || width > MAX_IMAGE_WIDTH)
        return null;
    const match = alt.match(WIDTH_SUFFIX);
    return `${match ? alt.slice(0, match.index) : alt}|${String(width)}`;
}
/** Preview only until release/Enter; the owning ProseMirror transaction is the sole writer. */
export function mountImageResizeControl(host, image, authored, onCommit) {
    const hint = imageWidthHint(authored);
    const paneWidth = Math.floor(image.closest('.tocktutor-crepe-editor')?.getBoundingClientRect().width ?? 0);
    const max = Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, paneWidth || MAX_IMAGE_WIDTH));
    const initial = hint?.width ?? Math.min(max, Math.max(MIN_IMAGE_WIDTH, Math.round(image.getBoundingClientRect().width) || image.naturalWidth || 320));
    let committed = initial, drag = null;
    const listeners = new AbortController();
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'cursor-ew-resize rounded border border-border bg-surface px-2 py-1 text-foreground focus-visible:outline-2 focus-visible:outline-ring [-webkit-app-region:no-drag]';
    handle.setAttribute('aria-label', 'Drag to Resize Image');
    handle.textContent = 'Resize';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'w-16 rounded border border-border bg-surface px-1 py-1 text-foreground focus-visible:outline-2 focus-visible:outline-ring [-webkit-app-region:no-drag]';
    input.setAttribute('aria-label', 'Image Width');
    input.min = String(MIN_IMAGE_WIDTH);
    input.max = String(max);
    input.step = '1';
    input.value = String(initial);
    host.append(handle, input);
    const originalWidth = image.style.width, originalHeight = image.style.height;
    const paint = (width, height) => {
        image.style.width = `${String(width)}px`;
        image.style.height = height === undefined ? 'auto' : `${String(height)}px`;
    };
    if (hint)
        paint(hint.width, hint.height);
    image.addEventListener('load', () => { if (!listeners.signal.aborted && hint && drag === null)
        paint(hint.width, hint.height); }, { signal: listeners.signal });
    const reset = () => {
        input.value = String(committed);
        if (committed === initial && !hint) {
            image.style.width = originalWidth;
            image.style.height = originalHeight;
        }
        else
            paint(committed, committed === initial ? hint?.height : undefined);
    };
    const commit = () => {
        const value = Number(input.value);
        if (!Number.isSafeInteger(value) || value < MIN_IMAGE_WIDTH || value > max || value === committed || !onCommit(value)) {
            reset();
            return;
        }
        committed = value;
        paint(value);
    };
    const stopDrag = () => { drag?.abort(); drag = null; };
    handle.addEventListener('click', () => { input.focus(); }, { signal: listeners.signal });
    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || drag)
            return;
        event.preventDefault();
        event.stopPropagation();
        const start = event.clientX, width = committed, pointerId = event.pointerId;
        drag = new AbortController();
        const move = (next) => {
            if (next.pointerId !== pointerId)
                return;
            input.value = String(Math.min(max, Math.max(MIN_IMAGE_WIDTH, Math.round(width + next.clientX - start))));
            paint(Number(input.value));
        };
        window.addEventListener('pointermove', move, { signal: drag.signal });
        window.addEventListener('pointerup', next => { if (next.pointerId !== pointerId)
            return; move(next); stopDrag(); commit(); }, { signal: drag.signal });
        window.addEventListener('pointercancel', next => { if (next.pointerId !== pointerId)
            return; stopDrag(); reset(); }, { signal: drag.signal });
    }, { signal: listeners.signal });
    input.addEventListener('pointerdown', event => { event.stopPropagation(); }, { signal: listeners.signal });
    input.addEventListener('mousedown', event => { event.stopPropagation(); }, { signal: listeners.signal });
    input.addEventListener('input', () => {
        const value = Number(input.value);
        if (Number.isSafeInteger(value) && value >= MIN_IMAGE_WIDTH && value <= max)
            paint(value);
    }, { signal: listeners.signal });
    input.addEventListener('change', commit, { signal: listeners.signal });
    input.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Enter') {
            event.preventDefault();
            commit();
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            reset();
        }
    }, { signal: listeners.signal });
    return () => { listeners.abort(); stopDrag(); host.remove(); };
}
//# sourceMappingURL=image-resize.js.map