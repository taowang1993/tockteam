import { isSafeVaultRelativePath } from "./session.js";
export const ATTACHMENT_ACCEPT = '.avif,.bmp,.gif,.ico,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.ogg,.wav,.weba,.webm,.mp4,.mov,.pdf';
export function isSupportedAttachment(path) {
    return ATTACHMENT_ACCEPT.split(',').includes(`.${path.split('.').at(-1)?.toLowerCase()}`);
}
export function attachmentTargetPath(folder, fileName, existing) {
    if (!isSafeVaultRelativePath(folder) || /^[A-Za-z]:/u.test(folder))
        throw new Error('Attachment folder is invalid.');
    const name = fileName.trim();
    if (name.length === 0 || name.length > 255 || name.includes('/') || name.includes('\\') || name === '.' || name === '..')
        throw new Error('Attachment name is invalid.');
    if (!isSupportedAttachment(name))
        throw new Error('Attachment type is unsupported.');
    const first = `${folder}/${name}`;
    if (!existing.has(first))
        return first;
    const extension = name.match(/(\.[^.]+)$/u)[1];
    const stem = name.slice(0, -extension.length);
    for (let index = 2; index <= 1_000; index += 1) {
        const candidate = `${folder}/${stem} ${String(index)}${extension}`;
        if (!existing.has(candidate))
            return candidate;
    }
    throw new Error('Attachment destination capacity is full.');
}
export function appendAttachmentMarkdown(source, markdown) {
    const block = markdown.replace(/^\s+|\s+$/gu, '');
    if (block === '')
        return source;
    const separator = source === '' ? '' : /(?:\r\n|[\r\n]){2}$/u.test(source) ? '' : /(?:\r\n|[\r\n])$/u.test(source) ? '\n' : '\n\n';
    return `${source}${separator}${block}\n`;
}
//# sourceMappingURL=attachments.js.map