import { assertSafeRelativePath, redactBoundaryText } from "./context.js";
export const REVIEWED_PENNIVO_READ_TOOLS = [
    'list_files',
    'read_file',
    'search',
    'find_backlinks',
    'get_outline',
    'list_workspaces',
    'list_snapshots',
    'list_trash',
];
export class ReadToolError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ReadToolError';
        this.code = code;
    }
}
const MAX_READ_RESULT_CHARS = 32_000;
const MAX_RUNTIME_RESULT_CHARS = 2_097_152;
const MAX_TREE_PAGES = 10;
const MAX_TREE_ENTRIES = 2_000;
const MAX_PROJECTED_ENTRIES = 100;
const MAX_PROJECTED_PATH_CHARS = 8_000;
const MAX_TREE_WARNINGS = 20;
const MAX_SEARCH_PAGES = 10;
const MAX_SEARCH_MATCHES = 200;
const MAX_PROJECTED_SEARCH_MATCHES = 100;
const MAX_SEARCH_PREVIEW_CHARS = 240;
const MAX_LINK_RESULTS = 200;
const MAX_PROJECTED_LINKS = 100;
const MAX_LINK_METADATA_CHARS = 1_024;
const MAX_OUTLINE_HEADINGS = 200;
const MAX_PROJECTED_HEADINGS = 100;
const MAX_HEADING_METADATA_CHARS = 1_024;
const MAX_SNAPSHOT_RESULTS = 50;
const MAX_TRASH_ENTRIES = 1_000;
const MAX_TRASH_RESULTS = 50;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/~-]{7,255}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const REVISION_PATTERN = /^file:[A-Za-z0-9._~-]{1,256}$/u;
const TREE_REVISION_PATTERN = /^(?:entry|file):[a-f0-9]{64}$/u;
const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SNAPSHOT_REASON_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const TRASH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const UNAVAILABLE_READ_TOOLS = new Set(REVIEWED_PENNIVO_READ_TOOLS.filter(tool => (tool !== 'read_file'
    && tool !== 'list_files'
    && tool !== 'search'
    && tool !== 'find_backlinks'
    && tool !== 'get_outline'
    && tool !== 'list_snapshots'
    && tool !== 'list_trash')));
function failure(code) {
    const messages = {
        ABORTED: 'The note read was cancelled.',
        INVALID_ARGUMENTS: 'The note read arguments are invalid.',
        INVALID_RESULT: 'The note runtime returned an invalid bounded result.',
        READ_DENIED: 'The note runtime denied the read.',
        READ_UNAVAILABLE: 'The note read is unavailable.',
        RESULT_TOO_LARGE: 'The note is too large to read safely.',
        RUNTIME_FAILURE: 'The note runtime could not complete the read.',
        STALE_CONTEXT: 'The vault, child, or assistant turn changed during the read.',
        TOOL_DENIED: 'The requested tool is not an approved read tool.',
        TOOL_UNAVAILABLE: 'The approved read tool is unavailable until its runtime capability is active.',
    };
    return new ReadToolError(code, messages[code]);
}
function isPlainRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function snapshotBinding(value) {
    if (!isPlainRecord(value)
        || Object.keys(value).some(key => ![
            'vaultId',
            'vaultGeneration',
            'childInstanceId',
            'turnId',
        ].includes(key))
        || !OPAQUE_ID_PATTERN.test(value.vaultId)
        || !OPAQUE_ID_PATTERN.test(value.childInstanceId)
        || !OPAQUE_ID_PATTERN.test(value.turnId)
        || !Number.isSafeInteger(value.vaultGeneration)
        || value.vaultGeneration < 1) {
        throw failure('INVALID_ARGUMENTS');
    }
    return Object.freeze({
        vaultId: value.vaultId,
        vaultGeneration: value.vaultGeneration,
        childInstanceId: value.childInstanceId,
        turnId: value.turnId,
    });
}
function readPath(args) {
    if (!isPlainRecord(args)
        || Object.keys(args).length !== 1
        || !Object.hasOwn(args, 'path')
        || typeof args.path !== 'string') {
        throw failure('INVALID_ARGUMENTS');
    }
    try {
        assertSafeRelativePath(args.path);
    }
    catch {
        throw failure('INVALID_ARGUMENTS');
    }
    return args.path;
}
function emptyArguments(args) {
    if (!isPlainRecord(args) || Object.keys(args).length !== 0) {
        throw failure('INVALID_ARGUMENTS');
    }
}
function listFilesArguments(args) {
    if (!isPlainRecord(args) || Object.keys(args).some(key => key !== 'path' && key !== 'recursive')) {
        throw failure('INVALID_ARGUMENTS');
    }
    if (args.path !== undefined && typeof args.path !== 'string')
        throw failure('INVALID_ARGUMENTS');
    if (args.recursive !== undefined && typeof args.recursive !== 'boolean') {
        throw failure('INVALID_ARGUMENTS');
    }
    const path = args.path ?? '';
    if (path !== '') {
        try {
            assertSafeRelativePath(path);
        }
        catch {
            throw failure('INVALID_ARGUMENTS');
        }
    }
    else if (Object.hasOwn(args, 'path')) {
        throw failure('INVALID_ARGUMENTS');
    }
    return { path, recursive: args.recursive ?? false };
}
function searchArguments(args) {
    if (!isPlainRecord(args)
        || Object.keys(args).some(key => ![
            'query',
            'scope',
            'caseSensitive',
            'wholeWord',
            'regex',
        ].includes(key))
        || typeof args.query !== 'string'
        || args.query.length === 0
        || args.query.length > 512
        || !args.query.trim()
        || (args.scope !== undefined && typeof args.scope !== 'string')
        || (args.caseSensitive !== undefined && typeof args.caseSensitive !== 'boolean')
        || (args.wholeWord !== undefined && typeof args.wholeWord !== 'boolean')
        || (args.regex !== undefined && typeof args.regex !== 'boolean'))
        throw failure('INVALID_ARGUMENTS');
    const scope = args.scope ?? '';
    if (scope !== '') {
        try {
            assertSafeRelativePath(scope);
        }
        catch {
            throw failure('INVALID_ARGUMENTS');
        }
    }
    else if (Object.hasOwn(args, 'scope')) {
        throw failure('INVALID_ARGUMENTS');
    }
    return {
        query: args.query,
        runtimeQuery: args.query.trim().split(/\s+/u).map(term => `content:${term}`).join(' '),
        scope,
        caseSensitive: args.caseSensitive ?? false,
        wholeWord: args.wholeWord ?? false,
        regex: args.regex ?? false,
    };
}
function isSupportedMarkdown(path) {
    return /\.(?:md|markdown)$/iu.test(path);
}
function validateSearchPage(value, args, binding) {
    if (!isPlainRecord(value)
        || value.generation !== binding.vaultGeneration
        || value.query !== args.runtimeQuery
        || !Array.isArray(value.matches)
        || value.matches.length > MAX_SEARCH_MATCHES
        || !Array.isArray(value.warnings)
        || value.warnings.length > MAX_TREE_WARNINGS
        || !isPlainRecord(value.scan)
        || !Number.isSafeInteger(value.scan.bytes)
        || value.scan.bytes < 0
        || value.scan.bytes > 1_000_000_000
        || !Number.isSafeInteger(value.scan.entries)
        || value.scan.entries < 0
        || value.scan.entries > 100_000
        || !Number.isSafeInteger(value.scan.files)
        || value.scan.files < 0
        || value.scan.files > 100_000
        || typeof value.truncated !== 'boolean'
        || ![null, 'byte-limit', 'entry-limit', 'file-limit', 'metadata-limit', 'result-limit'].includes(value.truncationReason)
        || (value.cursor !== null && (typeof value.cursor !== 'string'
            || value.cursor.length === 0
            || value.cursor.length > 4_096))
        || (!value.truncated && (value.cursor !== null || value.truncationReason !== null))
        || (value.truncated && value.truncationReason === null))
        throw failure('INVALID_RESULT');
    for (const warning of value.warnings) {
        if (typeof warning !== 'string' || warning.length > 1_024)
            throw failure('INVALID_RESULT');
    }
    for (const match of value.matches) {
        if (!isPlainRecord(match)
            || typeof match.path !== 'string'
            || ![
                'base', 'block', 'canvas', 'content', 'line', 'path', 'property', 'section', 'tag', 'task',
            ].includes(match.kind)
            || (match.line !== null && (!Number.isSafeInteger(match.line) || match.line < 1))
            || typeof match.preview !== 'string'
            || match.preview.length > MAX_SEARCH_PREVIEW_CHARS)
            throw failure('INVALID_RESULT');
        try {
            assertSafeRelativePath(match.path);
        }
        catch {
            throw failure('INVALID_RESULT');
        }
    }
    return value;
}
function searchPayload(args, matches, runtimeTruncated) {
    const selected = matches.slice(0, MAX_PROJECTED_SEARCH_MATCHES);
    let text = '';
    let payload;
    do {
        const byPath = new Map();
        for (const match of selected) {
            const group = byPath.get(match.path);
            if (group === undefined)
                byPath.set(match.path, [match]);
            else
                group.push(match);
        }
        const truncated = runtimeTruncated || selected.length < matches.length;
        payload = {
            query: redactBoundaryText(args.query),
            scope: args.scope,
            matchCount: matches.length,
            capped: truncated,
            files: [...byPath].map(([path, lines]) => ({
                path,
                matchCount: lines.length,
                lines: lines.map(match => ({ line: match.line, snippet: match.preview })),
            })),
            matches: selected,
        };
        text = JSON.stringify(payload, null, 2);
        if (text.length <= MAX_READ_RESULT_CHARS)
            return { text, truncated };
        selected.pop();
    } while (selected.length > 0);
    throw failure('INVALID_RESULT');
}
function validateRelativeResultPath(value) {
    if (typeof value !== 'string')
        throw failure('INVALID_RESULT');
    try {
        assertSafeRelativePath(value);
    }
    catch {
        throw failure('INVALID_RESULT');
    }
}
function validateLinkRecord(value, requestedPath, backlink) {
    if (!isPlainRecord(value)
        || typeof value.authoredTarget !== 'string'
        || value.authoredTarget.length > MAX_LINK_METADATA_CHARS
        || typeof value.displayText !== 'string'
        || value.displayText.length > MAX_LINK_METADATA_CHARS
        || (value.fragment !== null && (typeof value.fragment !== 'string' || value.fragment.length > MAX_LINK_METADATA_CHARS))
        || !['canvas-file', 'embed', 'image', 'image-reference', 'markdown', 'reference', 'tag', 'wiki'].includes(value.kind)
        || !Number.isSafeInteger(value.line)
        || value.line < 1
        || typeof value.normalizedTarget !== 'string'
        || value.normalizedTarget.length > MAX_LINK_METADATA_CHARS
        || (value.resolvedPath !== null && typeof value.resolvedPath !== 'string')
        || typeof value.sourcePath !== 'string'
        || !['ambiguous', 'resolved', 'unresolved'].includes(value.status))
        throw failure('INVALID_RESULT');
    validateRelativeResultPath(value.sourcePath);
    if (value.resolvedPath !== null)
        validateRelativeResultPath(value.resolvedPath);
    if (backlink && (value.status !== 'resolved' || value.resolvedPath !== requestedPath)) {
        throw failure('INVALID_RESULT');
    }
}
function validateLinksPage(value, requestedPath, binding) {
    if (!isPlainRecord(value)
        || value.generation !== binding.vaultGeneration
        || value.path !== requestedPath
        || !Array.isArray(value.outgoing)
        || value.outgoing.length > MAX_LINK_RESULTS
        || !Array.isArray(value.backlinks)
        || value.backlinks.length > MAX_LINK_RESULTS
        || !Array.isArray(value.outgoingDetails)
        || value.outgoingDetails.length > MAX_LINK_RESULTS
        || !Array.isArray(value.backlinkDetails)
        || value.backlinkDetails.length > MAX_LINK_RESULTS
        || !Array.isArray(value.tagRelations)
        || value.tagRelations.length > MAX_LINK_RESULTS
        || !Array.isArray(value.warnings)
        || value.warnings.length > MAX_TREE_WARNINGS
        || !isPlainRecord(value.scan)
        || !Number.isSafeInteger(value.scan.bytes)
        || value.scan.bytes < 0
        || value.scan.bytes > 1_000_000_000
        || !Number.isSafeInteger(value.scan.entries)
        || value.scan.entries < 0
        || value.scan.entries > 100_000
        || !Number.isSafeInteger(value.scan.files)
        || value.scan.files < 0
        || value.scan.files > 100_000
        || typeof value.truncated !== 'boolean'
        || ![null, 'byte-limit', 'entry-limit', 'file-limit', 'metadata-limit', 'result-limit'].includes(value.truncationReason)
        || (value.cursor !== null && (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > 4_096))
        || (!value.truncated && (value.cursor !== null || value.truncationReason !== null))
        || (value.truncated && value.truncationReason === null))
        throw failure('INVALID_RESULT');
    validateRelativeResultPath(value.path);
    for (const path of [...value.outgoing, ...value.backlinks])
        validateRelativeResultPath(path);
    for (const record of value.outgoingDetails)
        validateLinkRecord(record, requestedPath, false);
    for (const record of value.backlinkDetails)
        validateLinkRecord(record, requestedPath, true);
    for (const relation of value.tagRelations) {
        if (!isPlainRecord(relation)
            || typeof relation.tag !== 'string'
            || relation.tag.length > MAX_LINK_METADATA_CHARS
            || !Array.isArray(relation.paths)
            || relation.paths.length > MAX_LINK_RESULTS)
            throw failure('INVALID_RESULT');
        for (const path of relation.paths)
            validateRelativeResultPath(path);
    }
    for (const warning of value.warnings) {
        if (typeof warning !== 'string' || warning.length > 1_024)
            throw failure('INVALID_RESULT');
    }
    return value;
}
function backlinkPayload(path, backlinks, runtimeTruncated) {
    const selected = backlinks.slice(0, MAX_PROJECTED_LINKS);
    do {
        const truncated = runtimeTruncated || selected.length < backlinks.length;
        const text = JSON.stringify({
            path,
            count: backlinks.length,
            capped: truncated,
            backlinks: selected,
        }, null, 2);
        if (text.length <= MAX_READ_RESULT_CHARS)
            return { text, truncated };
        selected.pop();
    } while (selected.length > 0);
    throw failure('INVALID_RESULT');
}
function validateOutline(value, requestedPath, binding) {
    if (!isPlainRecord(value)
        || Object.keys(value).some(key => !['generation', 'headings', 'path', 'truncated'].includes(key))
        || value.generation !== binding.vaultGeneration
        || value.path !== requestedPath
        || !Array.isArray(value.headings)
        || value.headings.length > MAX_OUTLINE_HEADINGS
        || typeof value.truncated !== 'boolean')
        throw failure('INVALID_RESULT');
    validateRelativeResultPath(value.path);
    let previousLine = 0;
    for (const heading of value.headings) {
        if (!isPlainRecord(heading)
            || !Number.isSafeInteger(heading.level)
            || heading.level < 1
            || heading.level > 6
            || !Number.isSafeInteger(heading.line)
            || heading.line <= previousLine
            || typeof heading.selector !== 'string'
            || heading.selector.length > MAX_HEADING_METADATA_CHARS
            || typeof heading.text !== 'string'
            || heading.text.length > MAX_HEADING_METADATA_CHARS)
            throw failure('INVALID_RESULT');
        previousLine = heading.line;
    }
    return value;
}
function outlinePayload(path, headings, runtimeTruncated) {
    const selected = headings.slice(0, MAX_PROJECTED_HEADINGS);
    do {
        const truncated = runtimeTruncated || selected.length < headings.length;
        const text = JSON.stringify({ path, headings: selected, truncated }, null, 2);
        if (text.length <= MAX_READ_RESULT_CHARS)
            return { text, truncated };
        selected.pop();
    } while (selected.length > 0);
    throw failure('INVALID_RESULT');
}
function entryName(path) {
    return path.slice(path.lastIndexOf('/') + 1);
}
function parentPath(path) {
    const index = path.lastIndexOf('/');
    return index === -1 ? '' : path.slice(0, index);
}
function validateTreeEntry(entry) {
    if (!isPlainRecord(entry) || typeof entry.path !== 'string')
        throw failure('INVALID_RESULT');
    try {
        assertSafeRelativePath(entry.path);
    }
    catch {
        throw failure('INVALID_RESULT');
    }
    if (!Number.isFinite(entry.modifiedAt)
        || entry.modifiedAt < 0
        || typeof entry.revision !== 'string'
        || !TREE_REVISION_PATTERN.test(entry.revision))
        throw failure('INVALID_RESULT');
    if (entry.kind === 'directory')
        return entry;
    if (entry.kind !== 'document' && entry.kind !== 'attachment')
        throw failure('INVALID_RESULT');
    if (!Number.isSafeInteger(entry.size)
        || entry.size < 0
        || !Number.isFinite(entry.createdAt)
        || entry.createdAt < 0)
        throw failure('INVALID_RESULT');
    if (entry.kind === 'attachment' && !['audio', 'image', 'pdf', 'video'].includes(entry.mediaKind)) {
        throw failure('INVALID_RESULT');
    }
    return entry;
}
function validateTreePage(value, binding) {
    if (!isPlainRecord(value)
        || typeof value.complete !== 'boolean'
        || typeof value.truncated !== 'boolean'
        || value.generation !== binding.vaultGeneration
        || (value.cursor !== null && (typeof value.cursor !== 'string'
            || value.cursor.length === 0
            || value.cursor.length > 4_096))
        || !Array.isArray(value.entries)
        || value.entries.length > 1_000
        || !Array.isArray(value.warnings)
        || value.warnings.length > MAX_TREE_WARNINGS
        || !isPlainRecord(value.scan)
        || !Number.isSafeInteger(value.scan.entries)
        || value.scan.entries < 0
        || value.scan.entries > 100_000
        || ![null, 'depth-limit', 'entry-limit', 'result-limit'].includes(value.truncationReason)
        || value.truncated !== (value.truncationReason !== null)
        || value.complete === value.truncated
        || (value.complete && (value.truncated || value.cursor !== null || value.truncationReason !== null))
        || (value.cursor !== null && (!value.truncated || value.truncationReason !== 'result-limit'))
        || (value.cursor === null && value.truncationReason === 'result-limit'))
        throw failure('INVALID_RESULT');
    for (const warning of value.warnings) {
        if (typeof warning !== 'string' || warning.length > 1_024)
            throw failure('INVALID_RESULT');
    }
    for (const entry of value.entries)
        validateTreeEntry(entry);
    return value;
}
function sortPennivoEntries(entries) {
    return entries.sort((left, right) => {
        if (left.type === 'folder' && right.type !== 'folder')
            return -1;
        if (left.type !== 'folder' && right.type === 'folder')
            return 1;
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });
}
function projectTree(allEntries, scope, recursive) {
    const relevant = allEntries
        .filter(entry => entry.kind !== 'attachment')
        .filter(entry => entry.kind !== 'document' || isSupportedMarkdown(entry.path))
        .filter(entry => scope === '' || entry.path.startsWith(`${scope}/`))
        .sort((left, right) => {
        if (left.kind === 'directory' && right.kind !== 'directory')
            return -1;
        if (left.kind !== 'directory' && right.kind === 'directory')
            return 1;
        return left.path.localeCompare(right.path, undefined, { sensitivity: 'base' });
    });
    const selected = [];
    let pathChars = 0;
    for (const entry of relevant) {
        const cost = entry.path.length + entryName(entry.path).length;
        if (selected.length >= MAX_PROJECTED_ENTRIES
            || pathChars + cost > MAX_PROJECTED_PATH_CHARS)
            break;
        selected.push(entry);
        pathChars += cost;
    }
    const truncated = selected.length < relevant.length;
    const directories = new Set(selected.filter(entry => entry.kind === 'directory').map(entry => entry.path));
    const documents = selected.filter((entry) => (entry.kind === 'document'));
    const children = (directory) => {
        const folders = [...directories]
            .filter(path => parentPath(path) === directory)
            .map(path => {
            const nested = recursive ? children(path) : undefined;
            return {
                name: entryName(path),
                path,
                type: 'folder',
                ...nested === undefined ? {} : { children: nested },
            };
        })
            .filter(entry => !recursive || (entry.children?.length ?? 0) > 0);
        const files = documents
            .filter(entry => parentPath(entry.path) === directory)
            .map(entry => ({
            name: entryName(entry.path),
            path: entry.path,
            type: 'file',
            size: entry.size,
            mtimeMs: entry.modifiedAt,
        }));
        return sortPennivoEntries([...folders, ...files]);
    };
    return { entries: children(scope), truncated };
}
function validateSnapshotList(value, requestedPath, binding) {
    if (!isPlainRecord(value)
        || value.generation !== binding.vaultGeneration
        || !Array.isArray(value.snapshots)
        || value.snapshots.length > 100)
        throw failure('INVALID_RESULT');
    const ids = new Set();
    let previousCreatedAt = Number.POSITIVE_INFINITY;
    for (const snapshot of value.snapshots) {
        if (!isPlainRecord(snapshot)
            || typeof snapshot.path !== 'string'
            || snapshot.path !== requestedPath
            || typeof snapshot.id !== 'string'
            || !SNAPSHOT_ID_PATTERN.test(snapshot.id)
            || ids.has(snapshot.id)
            || typeof snapshot.digest !== 'string'
            || !DIGEST_PATTERN.test(snapshot.digest)
            || !Number.isSafeInteger(snapshot.createdAt)
            || snapshot.createdAt < 0
            || snapshot.createdAt > previousCreatedAt
            || !Number.isSafeInteger(snapshot.size)
            || snapshot.size < 0
            || snapshot.size > MAX_RUNTIME_RESULT_CHARS
            || typeof snapshot.reason !== 'string'
            || !SNAPSHOT_REASON_PATTERN.test(snapshot.reason))
            throw failure('INVALID_RESULT');
        try {
            assertSafeRelativePath(snapshot.path);
        }
        catch {
            throw failure('INVALID_RESULT');
        }
        ids.add(snapshot.id);
        previousCreatedAt = snapshot.createdAt;
    }
    return value;
}
function validateTrashList(value, binding) {
    if (!isPlainRecord(value)
        || value.generation !== binding.vaultGeneration
        || !Array.isArray(value.entries)
        || value.entries.length > MAX_TRASH_ENTRIES)
        throw failure('INVALID_RESULT');
    const ids = new Set();
    let previousCreatedAt = Number.POSITIVE_INFINITY;
    for (const entry of value.entries) {
        if (!isPlainRecord(entry)
            || typeof entry.id !== 'string'
            || !TRASH_ID_PATTERN.test(entry.id)
            || ids.has(entry.id)
            || !Number.isSafeInteger(entry.createdAt)
            || entry.createdAt < 0
            || entry.createdAt > previousCreatedAt
            || (entry.kind !== 'attachment' && entry.kind !== 'document' && entry.kind !== 'folder')
            || typeof entry.originalPath !== 'string')
            throw failure('INVALID_RESULT');
        try {
            assertSafeRelativePath(entry.originalPath);
        }
        catch {
            throw failure('INVALID_RESULT');
        }
        ids.add(entry.id);
        previousCreatedAt = entry.createdAt;
    }
    return value;
}
function runtimeError(error, signal) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return failure('ABORTED');
    }
    const code = typeof error === 'object'
        && error !== null
        && 'code' in error
        && typeof error.code === 'string'
        ? error.code
        : null;
    switch (code) {
        case 'changed':
        case 'stale-vault':
            return failure('STALE_CONTEXT');
        case 'inactive':
        case 'invalid-vault':
        case 'not-found':
        case 'recovery-unavailable':
            return failure('READ_UNAVAILABLE');
        case 'invalid-path':
        case 'unsupported-type':
            return failure('INVALID_ARGUMENTS');
        case 'too-large':
            return failure('RESULT_TOO_LARGE');
        case 'unsafe-target':
            return failure('READ_DENIED');
        default:
            return failure('RUNTIME_FAILURE');
    }
}
function validateResult(value, requestedPath, binding) {
    if (!isPlainRecord(value)
        || typeof value.path !== 'string'
        || value.path !== requestedPath
        || typeof value.content !== 'string'
        || value.content.length > MAX_RUNTIME_RESULT_CHARS
        || typeof value.digest !== 'string'
        || !DIGEST_PATTERN.test(value.digest)
        || typeof value.revision !== 'string'
        || !REVISION_PATTERN.test(value.revision)
        || value.generation !== binding.vaultGeneration) {
        throw failure('INVALID_RESULT');
    }
    try {
        assertSafeRelativePath(value.path);
    }
    catch {
        throw failure('INVALID_RESULT');
    }
    return value;
}
function boundedText(value) {
    const redacted = redactBoundaryText(value);
    if (redacted.length <= MAX_READ_RESULT_CHARS)
        return { text: redacted, truncated: false };
    return {
        text: `${redacted.slice(0, MAX_READ_RESULT_CHARS - 1)}…`,
        truncated: true,
    };
}
export class PennivoReadAdapter {
    runtime;
    isCurrent;
    constructor(runtime, isCurrent) {
        this.runtime = runtime;
        this.isCurrent = isCurrent;
    }
    async execute(tool, args, requestedBinding, signal) {
        if (tool !== 'read_file'
            && tool !== 'list_files'
            && tool !== 'search'
            && tool !== 'find_backlinks'
            && tool !== 'get_outline'
            && tool !== 'list_snapshots'
            && tool !== 'list_trash') {
            if (UNAVAILABLE_READ_TOOLS.has(tool))
                throw failure('TOOL_UNAVAILABLE');
            throw failure('TOOL_DENIED');
        }
        let binding;
        try {
            binding = snapshotBinding(requestedBinding);
        }
        catch (error) {
            if (error instanceof ReadToolError)
                throw error;
            throw failure('INVALID_ARGUMENTS');
        }
        if (tool === 'search') {
            let searchArgs;
            try {
                searchArgs = searchArguments(args);
            }
            catch (error) {
                if (error instanceof ReadToolError)
                    throw error;
                throw failure('INVALID_ARGUMENTS');
            }
            return this.search(searchArgs, binding, signal);
        }
        if (tool === 'list_files') {
            let listArgs;
            try {
                listArgs = listFilesArguments(args);
            }
            catch (error) {
                if (error instanceof ReadToolError)
                    throw error;
                throw failure('INVALID_ARGUMENTS');
            }
            return this.listFiles(listArgs, binding, signal);
        }
        if (tool === 'list_trash') {
            emptyArguments(args);
            return this.listTrash(binding, signal);
        }
        let path;
        try {
            path = readPath(args);
        }
        catch (error) {
            if (error instanceof ReadToolError)
                throw error;
            throw failure('INVALID_ARGUMENTS');
        }
        if (tool === 'find_backlinks')
            return this.findBacklinks(path, binding, signal);
        if (tool === 'get_outline')
            return this.getOutline(path, binding, signal);
        if (tool === 'list_snapshots')
            return this.listSnapshots(path, binding, signal);
        this.assertCurrent(binding);
        if (signal.aborted)
            throw failure('ABORTED');
        let opened;
        try {
            opened = await this.runtime.openDocument(path, Object.freeze({ id: binding.vaultId, generation: binding.vaultGeneration }), signal);
        }
        catch (error) {
            throw runtimeError(error, signal);
        }
        if (signal.aborted)
            throw failure('ABORTED');
        let document;
        try {
            document = validateResult(opened, path, binding);
        }
        catch (error) {
            if (error instanceof ReadToolError)
                throw error;
            throw failure('INVALID_RESULT');
        }
        this.assertCurrent(binding);
        const { text, truncated } = boundedText(document.content);
        return Object.freeze({
            result: Object.freeze({
                content: Object.freeze([Object.freeze({ type: 'text', text })]),
            }),
            source: Object.freeze({
                path: document.path,
                digest: document.digest,
                revision: document.revision,
                generation: document.generation,
            }),
            truncated,
        });
    }
    /** Return full bounded source only to Host-owned transformations, never model output. */
    async readDocument(requestedPath, requestedBinding, signal) {
        let binding;
        try {
            binding = snapshotBinding(requestedBinding);
            assertSafeRelativePath(requestedPath);
        }
        catch (error) {
            if (error instanceof ReadToolError)
                throw error;
            throw failure('INVALID_ARGUMENTS');
        }
        this.assertCurrent(binding);
        if (signal.aborted)
            throw failure('ABORTED');
        let opened;
        try {
            opened = await this.runtime.openDocument(requestedPath, Object.freeze({ id: binding.vaultId, generation: binding.vaultGeneration }), signal);
        }
        catch (error) {
            throw runtimeError(error, signal);
        }
        if (signal.aborted)
            throw failure('ABORTED');
        let document;
        try {
            document = validateResult(opened, requestedPath, binding);
        }
        catch (error) {
            if (error instanceof ReadToolError)
                throw error;
            throw failure('INVALID_RESULT');
        }
        this.assertCurrent(binding);
        return Object.freeze({
            content: document.content,
            source: Object.freeze({
                path: document.path,
                digest: document.digest,
                revision: document.revision,
                generation: document.generation,
            }),
        });
    }
    async getOutline(path, binding, signal) {
        this.assertCurrent(binding);
        if (signal.aborted)
            throw failure('ABORTED');
        if (this.runtime.outline === undefined)
            throw failure('READ_UNAVAILABLE');
        let raw;
        try {
            raw = await this.runtime.outline(Object.freeze({
                path,
                limit: MAX_OUTLINE_HEADINGS,
            }), Object.freeze({
                id: binding.vaultId,
                generation: binding.vaultGeneration,
            }), signal);
        }
        catch (error) {
            throw runtimeError(error, signal);
        }
        if (signal.aborted)
            throw failure('ABORTED');
        let outline;
        try {
            outline = validateOutline(raw, path, binding);
        }
        catch (error) {
            if (error instanceof ReadToolError)
                throw error;
            throw failure('INVALID_RESULT');
        }
        this.assertCurrent(binding);
        const projected = outlinePayload(path, outline.headings.map(heading => Object.freeze({
            level: heading.level,
            text: redactBoundaryText(heading.text),
            line: heading.line,
        })), outline.truncated);
        return Object.freeze({
            result: Object.freeze({
                content: Object.freeze([Object.freeze({ type: 'text', text: projected.text })]),
            }),
            source: null,
            truncated: projected.truncated,
        });
    }
    async findBacklinks(path, binding, signal) {
        this.assertCurrent(binding);
        if (signal.aborted)
            throw failure('ABORTED');
        if (this.runtime.links === undefined)
            throw failure('READ_UNAVAILABLE');
        const backlinks = [];
        const seen = new Set();
        const cursors = new Set();
        let cursor = null;
        let runtimeTruncated = false;
        let adapterTruncated = false;
        for (let pageIndex = 0; pageIndex < MAX_SEARCH_PAGES; pageIndex += 1) {
            let raw;
            try {
                raw = await this.runtime.links(Object.freeze({
                    path,
                    ...cursor === null ? {} : { cursor },
                }), Object.freeze({
                    id: binding.vaultId,
                    generation: binding.vaultGeneration,
                }), signal);
            }
            catch (error) {
                throw runtimeError(error, signal);
            }
            if (signal.aborted)
                throw failure('ABORTED');
            let page;
            try {
                page = validateLinksPage(raw, path, binding);
            }
            catch (error) {
                if (error instanceof ReadToolError)
                    throw error;
                throw failure('INVALID_RESULT');
            }
            this.assertCurrent(binding);
            for (const record of page.backlinkDetails) {
                if (!isSupportedMarkdown(record.sourcePath))
                    continue;
                const key = JSON.stringify([
                    record.sourcePath,
                    record.line,
                    record.displayText,
                    record.authoredTarget,
                ]);
                if (seen.has(key))
                    throw failure('INVALID_RESULT');
                seen.add(key);
                backlinks.push(Object.freeze({
                    path: record.sourcePath,
                    line: record.line,
                    linkText: redactBoundaryText(record.displayText),
                    url: redactBoundaryText(record.authoredTarget),
                }));
            }
            runtimeTruncated ||= page.truncated && page.cursor === null;
            if (page.cursor === null) {
                cursor = null;
                break;
            }
            if (cursors.has(page.cursor))
                throw failure('INVALID_RESULT');
            cursors.add(page.cursor);
            cursor = page.cursor;
        }
        if (cursor !== null)
            adapterTruncated = true;
        const projected = backlinkPayload(path, backlinks, runtimeTruncated || adapterTruncated);
        return Object.freeze({
            result: Object.freeze({
                content: Object.freeze([Object.freeze({ type: 'text', text: projected.text })]),
            }),
            source: null,
            truncated: projected.truncated,
        });
    }
    async search(args, binding, signal) {
        this.assertCurrent(binding);
        if (signal.aborted)
            throw failure('ABORTED');
        if (this.runtime.search === undefined)
            throw failure('READ_UNAVAILABLE');
        if (args.query.replace(/\s+/gu, '').length < 2) {
            const projected = searchPayload(args, [], false);
            return Object.freeze({
                result: Object.freeze({
                    content: Object.freeze([Object.freeze({ type: 'text', text: projected.text })]),
                }),
                source: null,
                truncated: false,
            });
        }
        const matches = [];
        const seenMatches = new Set();
        const seenCursors = new Set();
        let cursor = null;
        let runtimeTruncated = false;
        let adapterTruncated = false;
        for (let pageIndex = 0; pageIndex < MAX_SEARCH_PAGES; pageIndex += 1) {
            let raw;
            try {
                raw = await this.runtime.search(Object.freeze({
                    query: args.runtimeQuery,
                    mode: 'query',
                    ...args.scope === '' ? {} : { directory: args.scope },
                    caseSensitive: args.caseSensitive,
                    wholeWord: args.wholeWord,
                    regex: args.regex,
                    limit: MAX_SEARCH_MATCHES,
                    ...cursor === null ? {} : { cursor },
                }), Object.freeze({
                    id: binding.vaultId,
                    generation: binding.vaultGeneration,
                }), signal);
            }
            catch (error) {
                throw runtimeError(error, signal);
            }
            if (signal.aborted)
                throw failure('ABORTED');
            let page;
            try {
                page = validateSearchPage(raw, args, binding);
            }
            catch (error) {
                if (error instanceof ReadToolError)
                    throw error;
                throw failure('INVALID_RESULT');
            }
            this.assertCurrent(binding);
            for (const match of page.matches) {
                const key = JSON.stringify([match.path, match.kind, match.line, match.preview]);
                if (seenMatches.has(key))
                    throw failure('INVALID_RESULT');
                seenMatches.add(key);
                if (!isSupportedMarkdown(match.path) || match.line === null)
                    continue;
                matches.push(Object.freeze({
                    path: match.path,
                    line: match.line,
                    preview: redactBoundaryText(match.preview),
                }));
            }
            runtimeTruncated ||= page.truncated && page.cursor === null;
            if (page.cursor === null) {
                cursor = null;
                break;
            }
            if (seenCursors.has(page.cursor))
                throw failure('INVALID_RESULT');
            seenCursors.add(page.cursor);
            cursor = page.cursor;
        }
        if (cursor !== null)
            adapterTruncated = true;
        const projected = searchPayload(args, matches, runtimeTruncated || adapterTruncated);
        return Object.freeze({
            result: Object.freeze({
                content: Object.freeze([Object.freeze({ type: 'text', text: projected.text })]),
            }),
            source: null,
            truncated: projected.truncated,
        });
    }
    async listTrash(binding, signal) {
        this.assertCurrent(binding);
        if (signal.aborted)
            throw failure('ABORTED');
        if (this.runtime.listTrash === undefined)
            throw failure('READ_UNAVAILABLE');
        let raw;
        try {
            raw = await this.runtime.listTrash(Object.freeze({
                expectedVault: Object.freeze({ id: binding.vaultId, generation: binding.vaultGeneration }),
            }), signal);
        }
        catch (error) {
            throw runtimeError(error, signal);
        }
        if (signal.aborted)
            throw failure('ABORTED');
        let trash;
        try {
            trash = validateTrashList(raw, binding);
        }
        catch (error) {
            if (error instanceof ReadToolError)
                throw error;
            throw failure('INVALID_RESULT');
        }
        this.assertCurrent(binding);
        const truncated = trash.entries.length > MAX_TRASH_RESULTS;
        const payload = {
            entries: trash.entries.slice(0, MAX_TRASH_RESULTS).map(entry => ({
                trashId: entry.id,
                originalPath: entry.originalPath,
                deletedAtMs: entry.createdAt,
                expiresAtMs: null,
            })),
            truncated,
        };
        const text = JSON.stringify(payload, null, 2);
        if (text.length > MAX_READ_RESULT_CHARS)
            throw failure('INVALID_RESULT');
        return Object.freeze({
            result: Object.freeze({
                content: Object.freeze([Object.freeze({ type: 'text', text })]),
            }),
            source: null,
            truncated,
        });
    }
    async listSnapshots(path, binding, signal) {
        this.assertCurrent(binding);
        if (signal.aborted)
            throw failure('ABORTED');
        if (this.runtime.listSnapshots === undefined)
            throw failure('READ_UNAVAILABLE');
        let raw;
        try {
            raw = await this.runtime.listSnapshots(Object.freeze({
                expectedVault: Object.freeze({ id: binding.vaultId, generation: binding.vaultGeneration }),
                path,
            }), signal);
        }
        catch (error) {
            throw runtimeError(error, signal);
        }
        if (signal.aborted)
            throw failure('ABORTED');
        let snapshots;
        try {
            snapshots = validateSnapshotList(raw, path, binding);
        }
        catch (error) {
            if (error instanceof ReadToolError)
                throw error;
            throw failure('INVALID_RESULT');
        }
        this.assertCurrent(binding);
        const truncated = snapshots.snapshots.length > MAX_SNAPSHOT_RESULTS;
        const payload = {
            path,
            snapshots: snapshots.snapshots.slice(0, MAX_SNAPSHOT_RESULTS).map(snapshot => ({
                id: snapshot.id,
                ts: snapshot.createdAt,
                sizeBytes: snapshot.size,
                author: snapshot.reason,
                source: 'local',
            })),
            truncated,
        };
        const text = JSON.stringify(payload, null, 2);
        if (text.length > MAX_READ_RESULT_CHARS)
            throw failure('INVALID_RESULT');
        return Object.freeze({
            result: Object.freeze({
                content: Object.freeze([Object.freeze({ type: 'text', text })]),
            }),
            source: null,
            truncated,
        });
    }
    async listFiles(args, binding, signal) {
        this.assertCurrent(binding);
        if (signal.aborted)
            throw failure('ABORTED');
        const entries = [];
        const paths = new Set();
        const warnings = [];
        const cursors = new Set();
        let cursor = null;
        let runtimeTruncated = false;
        let adapterTruncated = false;
        for (let pageIndex = 0; pageIndex < MAX_TREE_PAGES; pageIndex += 1) {
            let rawPage;
            try {
                rawPage = await this.runtime.listTree(Object.freeze({
                    expectedVault: Object.freeze({ id: binding.vaultId, generation: binding.vaultGeneration }),
                    cursor,
                    limit: 1_000,
                }), signal);
            }
            catch (error) {
                throw runtimeError(error, signal);
            }
            if (signal.aborted)
                throw failure('ABORTED');
            let page;
            try {
                page = validateTreePage(rawPage, binding);
            }
            catch (error) {
                if (error instanceof ReadToolError)
                    throw error;
                throw failure('INVALID_RESULT');
            }
            this.assertCurrent(binding);
            for (const entry of page.entries) {
                if (paths.has(entry.path))
                    throw failure('INVALID_RESULT');
                paths.add(entry.path);
                if (entries.length >= MAX_TREE_ENTRIES) {
                    adapterTruncated = true;
                    break;
                }
                entries.push(entry);
            }
            for (const warning of page.warnings) {
                if (warnings.length >= MAX_TREE_WARNINGS)
                    break;
                warnings.push(redactBoundaryText(warning).slice(0, 200));
            }
            runtimeTruncated ||= page.truncated && page.cursor === null;
            if (adapterTruncated || page.cursor === null) {
                cursor = page.cursor;
                break;
            }
            if (cursors.has(page.cursor))
                throw failure('INVALID_RESULT');
            cursors.add(page.cursor);
            cursor = page.cursor;
        }
        if (cursor !== null)
            adapterTruncated = true;
        const projected = projectTree(entries, args.path, args.recursive);
        const truncated = runtimeTruncated || adapterTruncated || projected.truncated;
        const payload = {
            root: args.path,
            recursive: args.recursive,
            entries: projected.entries,
            truncated,
            warnings,
        };
        const text = JSON.stringify(payload, null, 2);
        if (text.length > MAX_READ_RESULT_CHARS)
            throw failure('INVALID_RESULT');
        return Object.freeze({
            result: Object.freeze({
                content: Object.freeze([Object.freeze({ type: 'text', text })]),
            }),
            source: null,
            truncated,
        });
    }
    assertCurrent(binding) {
        let matches;
        try {
            const state = this.runtime.state;
            matches = this.isCurrent(binding)
                && state.active
                && state.id === binding.vaultId
                && state.generation === binding.vaultGeneration;
        }
        catch {
            throw failure('RUNTIME_FAILURE');
        }
        if (!matches)
            throw failure('STALE_CONTEXT');
    }
}
//# sourceMappingURL=read-tools.js.map