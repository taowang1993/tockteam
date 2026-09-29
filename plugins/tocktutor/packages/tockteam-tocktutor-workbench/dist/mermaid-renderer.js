import { mermaidFrameDocument, passiveMermaidImageUrl } from "./mermaid-browser.js";
import { MAX_MERMAID_DIAGRAMS, MAX_MERMAID_SOURCE } from "./mermaid-contract.js";
const CHANNEL = 'tocktutor-mermaid';
function colorsFor(root) {
    const style = getComputedStyle(root);
    const probe = document.createElement('span');
    probe.hidden = true;
    root.append(probe);
    const resolved = (name) => {
        probe.style.color = `var(${name})`;
        const color = getComputedStyle(probe).color;
        return /^rgba?\([\d.,\s%]+\)$/u.test(color) ? color : style.getPropertyValue(name).trim();
    };
    const colors = {
        background: resolved('--tt-panel'),
        foreground: resolved('--tt-text'),
        accent: resolved('--dsw-specific-markdown-accent'),
    };
    probe.remove();
    return colors;
}
/** Rendering never touches authored Markdown; a failed or late response leaves the escaped fence intact. */
export function attachBrowserMermaid(root) {
    const figures = Array.from(root.querySelectorAll('figure.mermaid[data-language="mermaid"]')).slice(0, MAX_MERMAID_DIAGRAMS)
        .map(element => ({ element, source: element.querySelector('pre')?.textContent ?? '', fallback: element.querySelector('pre')?.cloneNode(true) }))
        .filter(entry => entry.source.length > 0 && entry.source.length <= MAX_MERMAID_SOURCE && entry.fallback !== null);
    if (figures.length === 0)
        return () => { };
    let disposed = false;
    let active = 0;
    let requestId = 0;
    let lastColors = colorsFor(root);
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.className = 'pointer-events-none fixed -left-[10000px] -top-[10000px] h-[768px] w-[1024px] opacity-0';
    try {
        frame.srcdoc = mermaidFrameDocument(location.origin);
    }
    catch {
        return () => { };
    }
    let ready = false;
    let timeout;
    const request = () => {
        if (!ready || disposed || active >= figures.length)
            return;
        const entry = figures[active];
        requestId += 1;
        frame.contentWindow?.postMessage({ channel: CHANNEL, id: requestId, source: entry.source }, '*');
        clearTimeout(timeout);
        timeout = setTimeout(() => { frame.remove(); ready = false; }, 5000);
    };
    const onMessage = (event) => {
        if (disposed || event.source !== frame.contentWindow || event.origin !== 'null')
            return;
        const data = event.data;
        if (data?.channel !== CHANNEL)
            return;
        if (data.ready === true) {
            ready = true;
            request();
            return;
        }
        if (data.id !== requestId || active >= figures.length)
            return;
        clearTimeout(timeout);
        const entry = figures[active];
        if (typeof data.svg === 'string') {
            const url = passiveMermaidImageUrl(data.svg, lastColors);
            if (url !== null) {
                const image = document.createElement('img');
                image.alt = 'Mermaid Diagram';
                image.className = 'mermaid-svg';
                image.src = url;
                entry.element.replaceChildren(image);
            }
        }
        active += 1;
        request();
    };
    window.addEventListener('message', onMessage);
    const refreshColors = () => {
        const next = colorsFor(root);
        if (disposed || JSON.stringify(next) === JSON.stringify(lastColors))
            return;
        lastColors = next;
        for (const entry of figures)
            entry.element.replaceChildren(entry.fallback.cloneNode(true));
        active = 0;
        request();
    };
    const observer = new MutationObserver(refreshColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-tockteam-skin'] });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    window.addEventListener('message', refreshColors);
    root.append(frame);
    return () => {
        disposed = true;
        clearTimeout(timeout);
        observer.disconnect();
        window.removeEventListener('message', onMessage);
        window.removeEventListener('message', refreshColors);
        frame.remove();
    };
}
//# sourceMappingURL=mermaid-renderer.js.map