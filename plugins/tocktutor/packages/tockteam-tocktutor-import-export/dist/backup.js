import { isPassiveBackupPath } from 'tockbot-note-runtime';
import { createDeterministicZip, parseZip } from "./archive.js";
import { comparePortableText, destinationAliasKey, ImportExportError, normalizeRelativePath, sha256, stableJson, } from "./core.js";
export const BACKUP_FORMAT = 'tockbot-vault-backup';
export const BACKUP_VERSION = 3;
export const BACKUP_ARCHIVE_LIMITS = {
    maxArchiveBytes: 512 * 1024 * 1024,
    maxCompressionRatio: 100,
    maxDepth: 128,
    maxEntries: 20_001,
    maxEntryBytes: 50 * 1024 * 1024,
    maxFilenameBytes: 4_096,
    maxParserMs: 120_000,
    maxTotalBytes: 500 * 1024 * 1024 + 4 * 1024 * 1024,
};
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_BACKUP_ENTRIES = 20_000;
function invalidManifest() {
    throw new ImportExportError('invalid-manifest');
}
function exact(value, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function safeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
    return typeof value === 'number' && Number.isSafeInteger(value)
        && value >= 0 && value <= maximum && !Object.is(value, -0);
}
function supported(path, kind) {
    if (kind === 'passive')
        return isPassiveBackupPath(path);
    const extension = path.split('/').at(-1)?.split('.').at(-1)?.toLocaleLowerCase('en-US') ?? '';
    return kind === 'document'
        ? ['base', 'canvas', 'markdown', 'md'].includes(extension)
        : ['3gp', 'avif', 'bmp', 'flac', 'gif', 'jpeg', 'jpg', 'm4a', 'mkv', 'mov', 'mp3', 'mp4', 'ogg', 'ogv', 'pdf', 'png', 'wav', 'webm', 'webp'].includes(extension);
}
function backupPath(path, kind) {
    if (kind === 'passive') {
        if (!isPassiveBackupPath(path))
            invalidManifest();
        return path;
    }
    return normalizeRelativePath(path);
}
function payloadPath(entry) {
    return entry.kind === 'passive'
        ? `backup/passive/${sha256(entry.path).slice('sha256:'.length)}`
        : `backup/files/${entry.path}`;
}
function manifestEntry(entry) {
    const path = backupPath(entry.path, entry.kind);
    if (!(entry.bytes instanceof Uint8Array)
        || entry.bytes.byteLength > BACKUP_ARCHIVE_LIMITS.maxEntryBytes
        || typeof entry.revision !== 'string'
        || entry.revision.length === 0
        || Buffer.byteLength(entry.revision, 'utf8') > 4_096
        || !supported(path, entry.kind))
        invalidManifest();
    return {
        kind: entry.kind,
        path,
        revision: entry.revision,
        sha256: sha256(entry.bytes),
        size: entry.bytes.byteLength,
    };
}
export function createBackupArchive(input) {
    if (!safeInteger(input.createdAt)
        || !safeInteger(input.vault.generation)
        || typeof input.vault.id !== 'string'
        || input.vault.id.length === 0
        || input.entries.length === 0
        || input.entries.length > MAX_BACKUP_ENTRIES)
        invalidManifest();
    const byPath = new Map(input.entries.map(entry => [backupPath(entry.path, entry.kind), entry]));
    if (byPath.size !== input.entries.length)
        invalidManifest();
    const aliases = new Set();
    const manifestEntries = input.entries.map(manifestEntry).sort((left, right) => comparePortableText(left.path, right.path));
    let totalBytes = 0;
    for (const entry of manifestEntries) {
        const alias = destinationAliasKey(entry.path);
        if (aliases.has(alias))
            invalidManifest();
        aliases.add(alias);
        totalBytes += entry.size;
        if (totalBytes > 500 * 1024 * 1024)
            throw new ImportExportError('limit-exceeded');
    }
    const manifest = {
        createdAt: input.createdAt,
        entries: manifestEntries,
        format: BACKUP_FORMAT,
        totalBytes,
        vault: input.vault,
        version: BACKUP_VERSION,
    };
    const manifestBytes = new TextEncoder().encode(`${stableJson(manifest)}\n`);
    if (manifestBytes.byteLength > MAX_MANIFEST_BYTES)
        throw new ImportExportError('limit-exceeded');
    return createDeterministicZip([
        { bytes: manifestBytes, path: 'backup/manifest.json' },
        ...manifestEntries.map(entry => ({
            bytes: byPath.get(entry.path).bytes,
            path: payloadPath(entry),
        })),
    ], BACKUP_ARCHIVE_LIMITS.maxCompressionRatio);
}
function parseManifest(bytes) {
    if (bytes.byteLength > MAX_MANIFEST_BYTES)
        throw new ImportExportError('limit-exceeded');
    let value;
    try {
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    catch {
        return invalidManifest();
    }
    if (!exact(value, ['createdAt', 'entries', 'format', 'totalBytes', 'vault', 'version'])
        || value.format !== BACKUP_FORMAT
        || (value.version !== 2 && value.version !== BACKUP_VERSION)
        || !safeInteger(value.createdAt)
        || !safeInteger(value.totalBytes, 500 * 1024 * 1024)
        || !exact(value.vault, ['generation', 'id'])
        || !safeInteger(value.vault.generation)
        || typeof value.vault.id !== 'string'
        || value.vault.id.length === 0
        || !Array.isArray(value.entries)
        || value.entries.length === 0
        || value.entries.length > MAX_BACKUP_ENTRIES)
        invalidManifest();
    const entries = [];
    const aliases = new Set();
    let totalBytes = 0;
    let previous = '';
    for (const raw of value.entries) {
        if (!exact(raw, ['kind', 'path', 'revision', 'sha256', 'size'])
            || (raw.kind !== 'attachment' && raw.kind !== 'document' && raw.kind !== 'passive')
            || (raw.kind === 'passive' && value.version !== BACKUP_VERSION)
            || typeof raw.path !== 'string'
            || typeof raw.revision !== 'string'
            || raw.revision.length === 0
            || Buffer.byteLength(raw.revision, 'utf8') > 4_096
            || typeof raw.sha256 !== 'string'
            || !/^sha256:[0-9a-f]{64}$/u.test(raw.sha256)
            || !safeInteger(raw.size, BACKUP_ARCHIVE_LIMITS.maxEntryBytes))
            invalidManifest();
        let path;
        try {
            path = backupPath(raw.path, raw.kind);
        }
        catch {
            return invalidManifest();
        }
        if (path !== raw.path || !supported(path, raw.kind))
            invalidManifest();
        const alias = destinationAliasKey(path);
        if (aliases.has(alias) || (previous !== '' && comparePortableText(previous, path) >= 0))
            invalidManifest();
        aliases.add(alias);
        previous = path;
        totalBytes += raw.size;
        entries.push({ kind: raw.kind, path, revision: raw.revision, sha256: raw.sha256, size: raw.size });
    }
    if (totalBytes !== value.totalBytes)
        invalidManifest();
    return {
        createdAt: value.createdAt,
        entries,
        format: BACKUP_FORMAT,
        totalBytes,
        vault: { generation: value.vault.generation, id: value.vault.id },
        version: value.version,
    };
}
export function verifyBackupArchive(bytes, signal) {
    signal?.throwIfAborted();
    const archive = parseZip(bytes, BACKUP_ARCHIVE_LIMITS, signal === undefined ? {} : { signal });
    const manifestMember = archive.find(entry => entry.path === 'backup/manifest.json');
    if (manifestMember === undefined)
        invalidManifest();
    const manifest = parseManifest(manifestMember.bytes);
    const payload = archive.filter(entry => entry.path !== 'backup/manifest.json');
    if (payload.length !== manifest.entries.length)
        invalidManifest();
    const members = new Map(payload.map(entry => [entry.path, entry]));
    if (members.size !== payload.length)
        invalidManifest();
    const entries = [];
    for (const declared of manifest.entries) {
        signal?.throwIfAborted();
        const member = members.get(payloadPath(declared));
        if (member === undefined
            || member.bytes.byteLength !== declared.size
            || sha256(member.bytes) !== declared.sha256)
            invalidManifest();
        entries.push({
            bytes: new Uint8Array(member.bytes),
            kind: declared.kind,
            path: declared.path,
            revision: declared.revision,
        });
    }
    return {
        entries,
        manifest,
        manifestDigest: sha256(manifestMember.bytes),
        outerDigest: sha256(bytes),
    };
}
export function planVerifiedRestore(bytes, signal) {
    const verified = verifyBackupArchive(bytes, signal);
    const files = verified.entries.map(entry => ({
        bytes: entry.bytes,
        destination: entry.path,
        kind: entry.kind,
        sourceKey: `${entry.revision}:${sha256(entry.bytes)}`,
    }));
    return {
        digest: sha256(stableJson({ manifest: verified.manifest, outerDigest: verified.outerDigest })),
        files,
        size: verified.manifest.totalBytes,
        skipped: [],
        sourceEntries: files.length,
        warnings: [],
    };
}
//# sourceMappingURL=backup.js.map