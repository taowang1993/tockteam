export const IMPORT_INSPECT_FORMATS = [
    'markdown-folder',
    'markdown-zip',
    'html',
    'csv',
    'apple-journal',
    'bear-backup',
    'evernote',
    'google-keep',
    'roam-research',
    'textbundle',
    'restore-backup',
];
export function isImportInspectFormat(value) {
    return typeof value === 'string' && IMPORT_INSPECT_FORMATS.includes(value);
}
//# sourceMappingURL=types.js.map