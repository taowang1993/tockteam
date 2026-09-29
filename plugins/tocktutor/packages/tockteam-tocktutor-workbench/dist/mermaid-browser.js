import { MERMAID_FRAME_PATH } from "./mermaid-contract.js";
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_SVG_BYTES = 200_000;
const TAGS = new Set(['svg', 'g', 'defs', 'marker', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'symbol', 'use', 'clipPath', 'mask', 'linearGradient', 'stop', 'title', 'desc']);
const ATTRS = new Set(['id', 'class', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'opacity', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule', 'clip-rule', 'marker-start', 'marker-end', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient', 'stop-color', 'stop-opacity', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'dy', 'font-size', 'font-weight', 'font-style', 'xmlns']);
const COLOR = /^(?:#[\da-f]{3,8}|rgba?\([\d.,\s%]+\))$/iu;
const INTERNAL_URL = /^url\(#[A-Za-z][\w:.-]{0,127}\)$/u;
/** The frame is opaque-origin and script-only. Its one local bundle can run, but no authored resource can load. */
export function mermaidFrameDocument(origin) {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname))
        throw new Error('Mermaid requires the Desktop loopback origin.');
    const script = new URL(MERMAID_FRAME_PATH, url.origin).href;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${url.origin}; connect-src 'none'; img-src 'none'; font-src 'none'; style-src 'unsafe-inline'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script src="${script}"></script></body></html>`;
}
/** No returned markup is inserted. This allowlisted projection is used only as an image URL. */
export function passiveMermaidImageUrl(source, colors) {
    if (source.length > MAX_SVG_BYTES || /<!DOCTYPE|<!ENTITY/iu.test(source) || Object.values(colors).some(color => !COLOR.test(color)))
        return null;
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = parsed.documentElement;
    if (svg.namespaceURI !== SVG_NS || svg.localName !== 'svg' || parsed.querySelector('parsererror'))
        return null;
    const box = svg.getAttribute('viewBox')?.split(/[\s,]+/u).map(Number);
    if (!box || box.length !== 4 || box.some(value => !Number.isFinite(value)) || box[2] <= 0 || box[3] <= 0 || box[2] > 8192 || box[3] > 8192)
        return null;
    let remaining = 2500;
    const project = (input) => {
        if (--remaining < 0)
            return null;
        const tag = input.localName;
        if (tag === 'style')
            return /@import|@namespace|url\s*\(/iu.test(input.textContent ?? '') ? null : document.createElementNS(SVG_NS, 'g');
        if (tag === 'foreignObject') {
            if (Array.from(input.querySelectorAll('*')).some(node => !['div', 'span', 'p', 'b', 'strong', 'em', 'br'].includes(node.localName)))
                return null;
            const text = input.textContent?.trim() ?? '';
            if (text.length > 500)
                return null;
            const label = document.createElementNS(SVG_NS, 'text');
            const x = Number(input.getAttribute('x') ?? 0) + Number(input.getAttribute('width') ?? 0) / 2;
            const y = Number(input.getAttribute('y') ?? 0) + Number(input.getAttribute('height') ?? 0) / 2;
            if (!Number.isFinite(x) || !Number.isFinite(y))
                return null;
            label.setAttribute('x', String(x));
            label.setAttribute('y', String(y));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
            label.setAttribute('fill', colors.foreground);
            label.setAttribute('stroke', colors.background);
            label.setAttribute('stroke-width', '2');
            label.setAttribute('paint-order', 'stroke fill');
            label.textContent = text;
            return label;
        }
        if (input.namespaceURI !== SVG_NS || !TAGS.has(tag))
            return null;
        const safe = document.createElementNS(SVG_NS, tag);
        for (const attribute of Array.from(input.attributes)) {
            const name = attribute.name;
            const value = attribute.value;
            if (name === 'xmlns' && value === SVG_NS || name === 'xmlns:xlink' && value === 'http://www.w3.org/1999/xlink')
                continue;
            if (/^on/iu.test(name) || /(?:href|src)$/iu.test(name) || /(?:https?:|file:|data:|javascript:|@import)/iu.test(value) || /url\s*\(/iu.test(value) && !INTERNAL_URL.test(value))
                return null;
            if (ATTRS.has(name) && value.length <= 4096)
                safe.setAttribute(name, value);
        }
        for (const child of Array.from(input.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
                if (tag === 'text' || tag === 'tspan' || tag === 'title' || tag === 'desc')
                    safe.append(document.createTextNode(child.textContent ?? ''));
            }
            else if (child.nodeType === Node.ELEMENT_NODE) {
                const projected = project(child);
                if (projected === null)
                    return null;
                safe.append(projected);
            }
            else if (child.nodeType !== Node.COMMENT_NODE)
                return null;
        }
        if (tag === 'text' || tag === 'tspan') {
            safe.setAttribute('fill', colors.foreground);
            safe.setAttribute('stroke', colors.background);
            safe.setAttribute('stroke-width', '2');
            safe.setAttribute('paint-order', 'stroke fill');
            safe.setAttribute('font-family', 'system-ui');
        }
        if (tag === 'rect' || tag === 'circle' || tag === 'ellipse' || tag === 'polygon') {
            safe.setAttribute('fill', colors.background);
            if (!safe.hasAttribute('stroke'))
                safe.setAttribute('stroke', colors.accent);
        }
        if (tag === 'path') {
            if (!safe.hasAttribute('stroke'))
                safe.setAttribute('stroke', colors.accent);
            if (!safe.hasAttribute('fill'))
                safe.setAttribute('fill', input.closest('marker') ? colors.accent : 'none');
        }
        if (tag === 'line' || tag === 'polyline')
            safe.setAttribute('stroke', colors.accent);
        return safe;
    };
    const safe = project(svg);
    if (safe === null)
        return null;
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('x', String(box[0]));
    background.setAttribute('y', String(box[1]));
    background.setAttribute('width', String(box[2]));
    background.setAttribute('height', String(box[3]));
    background.setAttribute('fill', colors.background);
    safe.insertBefore(background, safe.firstChild);
    const output = new XMLSerializer().serializeToString(safe);
    return output.length > MAX_SVG_BYTES ? null : `data:image/svg+xml,${encodeURIComponent(output)}`;
}
//# sourceMappingURL=mermaid-browser.js.map