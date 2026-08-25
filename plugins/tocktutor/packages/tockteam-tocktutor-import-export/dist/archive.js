import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { destinationAliasKey, ImportExportError, normalizeRelativePath, } from "./core.js";
const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const UNIX_FILE = 0x8000;
const UNIX_DIRECTORY = 0x4000;
const UNIX_SYMLINK = 0xa000;
const MAX_END_SEARCH = 65_557;
const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    CRC_TABLE[index] = value >>> 0;
}
export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes)
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function invalidArchive() {
    throw new ImportExportError('invalid-archive');
}
function limitExceeded() {
    throw new ImportExportError('limit-exceeded');
}
function safeInteger(value, maximum) {
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum && !Object.is(value, -0);
}
function validateLimits(limits) {
    if (!safeInteger(limits.maxArchiveBytes, Number.MAX_SAFE_INTEGER)
        || !safeInteger(limits.maxEntries, 100_000)
        || !safeInteger(limits.maxDepth, 128)
        || !safeInteger(limits.maxEntryBytes, Number.MAX_SAFE_INTEGER)
        || !safeInteger(limits.maxFilenameBytes, 4_096)
        || !safeInteger(limits.maxParserMs, 120_000)
        || !safeInteger(limits.maxTotalBytes, Number.MAX_SAFE_INTEGER)
        || !Number.isFinite(limits.maxCompressionRatio)
        || limits.maxArchiveBytes === 0
        || limits.maxEntries === 0
        || limits.maxDepth === 0
        || limits.maxEntryBytes === 0
        || limits.maxFilenameBytes === 0
        || limits.maxParserMs === 0
        || limits.maxTotalBytes === 0
        || limits.maxCompressionRatio < 1)
        limitExceeded();
}
function findEnd(archive) {
    const minimum = Math.max(0, archive.byteLength - MAX_END_SEARCH);
    for (let offset = archive.byteLength - 22; offset >= minimum; offset -= 1) {
        if (archive.readUInt32LE(offset) === END_SIGNATURE)
            return offset;
    }
    return invalidArchive();
}
function decodeName(bytes, flags) {
    if ((flags & UTF8_FLAG) === 0 && bytes.some(byte => byte > 0x7f))
        return invalidArchive();
    const value = bytes.toString('utf8');
    if (Buffer.from(value, 'utf8').compare(bytes) !== 0 || value.includes('\0'))
        return invalidArchive();
    return value;
}
function confinedArchivePath(raw, limits) {
    const directory = raw.endsWith('/');
    const candidate = directory ? raw.slice(0, -1) : raw;
    if (candidate === '' || Buffer.byteLength(candidate, 'utf8') > limits.maxFilenameBytes) {
        return invalidArchive();
    }
    let path;
    try {
        path = normalizeRelativePath(candidate);
    }
    catch {
        return invalidArchive();
    }
    const segments = path.split('/');
    if (segments.length > limits.maxDepth)
        limitExceeded();
    if (segments.some(segment => segment === '__MACOSX' || segment.startsWith('._')))
        return invalidArchive();
    return { directory, path };
}
function nestedArchive(path) {
    return /\.(?:bear2bk|textpack|zip)$/iu.test(path);
}
function unixKind(entry) {
    return (entry.externalAttributes >>> 16) & 0xf000;
}
function assertEntryKind(entry, directory) {
    const kind = unixKind(entry);
    if (kind === UNIX_SYMLINK)
        return invalidArchive();
    if (kind !== 0 && kind !== UNIX_FILE && kind !== UNIX_DIRECTORY)
        return invalidArchive();
    if (!directory && kind === UNIX_FILE && ((entry.externalAttributes >>> 16) & 0o111) !== 0)
        return invalidArchive();
    if (directory && kind !== 0 && kind !== UNIX_DIRECTORY)
        return invalidArchive();
    if (!directory && kind === UNIX_DIRECTORY)
        return invalidArchive();
}
export function parseZip(input, limits, options = {}) {
    validateLimits(limits);
    const startedAt = Date.now();
    const checkpoint = () => {
        options.signal?.throwIfAborted();
        if (Date.now() - startedAt > limits.maxParserMs)
            limitExceeded();
    };
    checkpoint();
    if (!(input instanceof Uint8Array) || input.byteLength > limits.maxArchiveBytes)
        limitExceeded();
    const archive = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    if (archive.byteLength < 22)
        return invalidArchive();
    const end = findEnd(archive);
    if (archive.readUInt16LE(end + 4) !== 0
        || archive.readUInt16LE(end + 6) !== 0
        || archive.readUInt16LE(end + 8) !== archive.readUInt16LE(end + 10))
        return invalidArchive();
    const count = archive.readUInt16LE(end + 10);
    const centralSize = archive.readUInt32LE(end + 12);
    const centralOffset = archive.readUInt32LE(end + 16);
    const commentLength = archive.readUInt16LE(end + 20);
    if (end + 22 + commentLength !== archive.byteLength
        || count > limits.maxEntries
        || centralOffset + centralSize !== end
        || centralOffset > archive.byteLength)
        return invalidArchive();
    const central = [];
    let offset = centralOffset;
    for (let index = 0; index < count; index += 1) {
        checkpoint();
        if (offset + 46 > end || archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE)
            return invalidArchive();
        const flags = archive.readUInt16LE(offset + 8);
        const method = archive.readUInt16LE(offset + 10);
        const compressedSize = archive.readUInt32LE(offset + 20);
        const uncompressedSize = archive.readUInt32LE(offset + 24);
        const nameLength = archive.readUInt16LE(offset + 28);
        const extraLength = archive.readUInt16LE(offset + 30);
        const entryCommentLength = archive.readUInt16LE(offset + 32);
        const diskStart = archive.readUInt16LE(offset + 34);
        const next = offset + 46 + nameLength + extraLength + entryCommentLength;
        if (next > end || diskStart !== 0 || nameLength === 0
            || (flags & ~(UTF8_FLAG | DATA_DESCRIPTOR_FLAG)) !== 0
            || (method !== 0 && method !== 8)
            || compressedSize > limits.maxArchiveBytes
            || uncompressedSize > limits.maxEntryBytes)
            return invalidArchive();
        const name = archive.subarray(offset + 46, offset + 46 + nameLength);
        const decoded = decodeName(name, flags);
        const confined = confinedArchivePath(decoded, limits);
        central.push({
            compressedSize,
            crc: archive.readUInt32LE(offset + 16),
            externalAttributes: archive.readUInt32LE(offset + 38),
            flags,
            localOffset: archive.readUInt32LE(offset + 42),
            method,
            name: Buffer.from(name),
            path: confined.path,
            uncompressedSize,
        });
        assertEntryKind(central.at(-1), confined.directory);
        offset = next;
    }
    if (offset !== end)
        return invalidArchive();
    const aliases = new Set();
    for (const entry of central) {
        const alias = destinationAliasKey(entry.path);
        if (aliases.has(alias))
            return invalidArchive();
        aliases.add(alias);
    }
    const output = [];
    let totalBytes = 0;
    let totalCompressed = 0;
    for (const entry of central) {
        checkpoint();
        const rawName = decodeName(entry.name, entry.flags);
        const directory = rawName.endsWith('/');
        if (directory)
            continue;
        if (!options.allowNestedArchives && nestedArchive(entry.path))
            return invalidArchive();
        totalBytes += entry.uncompressedSize;
        totalCompressed += entry.compressedSize;
        if (totalBytes > limits.maxTotalBytes)
            limitExceeded();
        if (entry.uncompressedSize > 0
            && entry.uncompressedSize / Math.max(1, entry.compressedSize) > limits.maxCompressionRatio) {
            limitExceeded();
        }
        if (entry.localOffset + 30 > centralOffset
            || archive.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE
            || archive.readUInt16LE(entry.localOffset + 6) !== entry.flags
            || archive.readUInt16LE(entry.localOffset + 8) !== entry.method)
            return invalidArchive();
        const localNameLength = archive.readUInt16LE(entry.localOffset + 26);
        const localExtraLength = archive.readUInt16LE(entry.localOffset + 28);
        const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataOffset + entry.compressedSize;
        if (dataEnd > centralOffset
            || localNameLength !== entry.name.byteLength
            || archive.subarray(entry.localOffset + 30, entry.localOffset + 30 + localNameLength).compare(entry.name) !== 0) {
            return invalidArchive();
        }
        const compressed = archive.subarray(dataOffset, dataEnd);
        let bytes;
        try {
            bytes = entry.method === 0
                ? Buffer.from(compressed)
                : inflateRawSync(compressed, { maxOutputLength: limits.maxEntryBytes + 1 });
        }
        catch {
            return invalidArchive();
        }
        if (bytes.byteLength !== entry.uncompressedSize || crc32(bytes) !== entry.crc)
            return invalidArchive();
        checkpoint();
        output.push({ bytes: new Uint8Array(bytes), compressedSize: entry.compressedSize, path: entry.path });
    }
    if (totalBytes > 0 && totalBytes / Math.max(1, totalCompressed) > limits.maxCompressionRatio) {
        limitExceeded();
    }
    return output.sort((left, right) => left.path.localeCompare(right.path));
}
function localHeader(name, bytes, compressed, method) {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_SIGNATURE, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(UTF8_FLAG, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(compressed.byteLength, 18);
    header.writeUInt32LE(bytes.byteLength, 22);
    header.writeUInt16LE(name.byteLength, 26);
    return Buffer.concat([header, name, compressed]);
}
function centralHeader(name, bytes, compressed, method, localOffset) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    header.writeUInt16LE((3 << 8) | 20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_FLAG, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(crc32(bytes), 16);
    header.writeUInt32LE(compressed.byteLength, 20);
    header.writeUInt32LE(bytes.byteLength, 24);
    header.writeUInt16LE(name.byteLength, 28);
    header.writeUInt32LE((0o100600 << 16) >>> 0, 38);
    header.writeUInt32LE(localOffset, 42);
    return Buffer.concat([header, name]);
}
export function createDeterministicZip(entries, maxCompressionRatio = Number.POSITIVE_INFINITY) {
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 65_535
        || (maxCompressionRatio !== Number.POSITIVE_INFINITY
            && (!Number.isFinite(maxCompressionRatio) || maxCompressionRatio < 1)))
        return invalidArchive();
    const aliases = new Set();
    const normalized = entries.map(entry => {
        if (!(entry.bytes instanceof Uint8Array))
            return invalidArchive();
        let path;
        try {
            path = normalizeRelativePath(entry.path);
        }
        catch {
            return invalidArchive();
        }
        const alias = destinationAliasKey(path);
        if (aliases.has(alias))
            return invalidArchive();
        aliases.add(alias);
        const bytes = Buffer.from(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength);
        if (bytes.byteLength > 0xffffffff)
            limitExceeded();
        const deflated = deflateRawSync(bytes, { level: 9 });
        const useDeflate = deflated.byteLength < bytes.byteLength
            && bytes.byteLength / Math.max(1, deflated.byteLength) <= maxCompressionRatio;
        return {
            bytes: Buffer.from(bytes),
            compressed: useDeflate ? deflated : Buffer.from(bytes),
            method: useDeflate ? 8 : 0,
            name: Buffer.from(path, 'utf8'),
            path,
        };
    }).sort((left, right) => left.path.localeCompare(right.path));
    const locals = [];
    const centrals = [];
    let localOffset = 0;
    for (const entry of normalized) {
        const local = localHeader(entry.name, entry.bytes, entry.compressed, entry.method);
        locals.push(local);
        centrals.push(centralHeader(entry.name, entry.bytes, entry.compressed, entry.method, localOffset));
        localOffset += local.byteLength;
    }
    const central = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(END_SIGNATURE, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(central.byteLength, 12);
    end.writeUInt32LE(localOffset, 16);
    return new Uint8Array(Buffer.concat([...locals, central, end]));
}
//# sourceMappingURL=archive.js.map