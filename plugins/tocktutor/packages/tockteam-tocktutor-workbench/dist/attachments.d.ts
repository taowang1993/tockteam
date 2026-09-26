export declare const ATTACHMENT_ACCEPT = ".avif,.bmp,.gif,.ico,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.ogg,.wav,.weba,.webm,.mp4,.mov,.pdf";
export declare function isSupportedAttachment(path: string): boolean;
export declare function attachmentTargetPath(folder: string, fileName: string, existing: ReadonlySet<string>): string;
export declare function appendAttachmentMarkdown(source: string, markdown: string): string;
//# sourceMappingURL=attachments.d.ts.map