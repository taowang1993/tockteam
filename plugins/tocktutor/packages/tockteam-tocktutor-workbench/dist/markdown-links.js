import { isSafeVaultRelativePath } from "./session.js";
export class SlashWriteUncertainError extends Error {
    constructor(path) { super(`The write outcome for ${path} is uncertain. Check the vault and use an existing-file link before trying another write.`); }
}
function safePath(path) {
    return isSafeVaultRelativePath(path) && !/[\u0000-\u001f\u007f]/u.test(path);
}
/** Inputs are decoded, vault-relative identities; output is a Markdown URL, not a Host path. */
export function markdownLinkHref(source, target) {
    if (!safePath(source) || !safePath(target))
        throw new Error('Invalid note or attachment path.');
    const from = source.split('/').slice(0, -1), to = target.split('/');
    while (from.length && to.length > 1 && from[0] === to[0]) {
        from.shift();
        to.shift();
    }
    const encoded = to.map(part => encodeURIComponent(part).replace(/[!'()*]/gu, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
    return `${from.length ? '../'.repeat(from.length) : './'}${encoded}`;
}
export function resolveMarkdownLink(source, href) {
    if (!safePath(source) || !href || href.length > 4096 || /^[a-z][a-z\d+.-]*:|^[\/\\]|[\u0000-\u001f\u007f]/iu.test(href))
        return null;
    const hash = href.indexOf('#'), raw = hash < 0 ? href : href.slice(0, hash);
    if (raw.includes('?'))
        return null;
    try {
        const parts = source.split('/').slice(0, -1);
        for (const segment of raw.split('/')) {
            const decoded = decodeURIComponent(segment);
            if (/[\/\\]/u.test(decoded))
                return null;
            if (decoded === '.')
                continue;
            if (decoded === '..') {
                if (!parts.length)
                    return null;
                parts.pop();
            }
            else
                parts.push(decoded);
        }
        const path = raw === '' ? source : parts.join('/');
        return safePath(path) ? { path, fragment: hash < 0 ? null : decodeURIComponent(href.slice(hash + 1)) } : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=markdown-links.js.map