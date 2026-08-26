import { assertUniqueCanvasDocumentIdentities } from "./canvas-identity.js";
export const MAX_CANVAS_BYTES = 2_000_000;
export const MAX_CANVAS_NODES = 2_000;
export const MAX_CANVAS_EDGES = 4_000;
export const MAX_CANVAS_ID_LENGTH = 256;
export const MAX_CANVAS_LABEL_LENGTH = 32_768;
export const MAX_CANVAS_COORDINATE = 1_000_000_000;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSafeId(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_CANVAS_ID_LENGTH
        && !/[\0\r\n]/u.test(value);
}
function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_CANVAS_COORDINATE;
}
function isSafeLabel(value) {
    return typeof value === 'string' && value.length <= MAX_CANVAS_LABEL_LENGTH;
}
function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
}
function unsupported(reason) {
    return { status: 'unsupported', reason };
}
function parseNode(value) {
    if (!isRecord(value)
        || !isSafeId(value.id)
        || typeof value.type !== 'string'
        || value.type.length === 0
        || value.type.length > 64
        || !isFiniteCoordinate(value.x)
        || !isFiniteCoordinate(value.y)
        || !isFiniteCoordinate(value.width)
        || !isFiniteCoordinate(value.height)
        || value.width <= 0
        || value.height <= 0)
        return null;
    if (value.text !== undefined && !isSafeLabel(value.text))
        return null;
    if (value.file !== undefined && !isSafeLabel(value.file))
        return null;
    if (value.url !== undefined && !isSafeLabel(value.url))
        return null;
    return value;
}
function parseEdge(value) {
    if (!isRecord(value)
        || !isSafeId(value.id)
        || !isSafeId(value.fromNode)
        || !isSafeId(value.toNode))
        return null;
    if (value.label !== undefined && !isSafeLabel(value.label))
        return null;
    return value;
}
export function parseCanvasDocument(content) {
    if (byteLength(content) > MAX_CANVAS_BYTES)
        return unsupported('Canvas document exceeds the byte limit.');
    let value;
    try {
        value = JSON.parse(content);
    }
    catch {
        return unsupported('Canvas document is not valid JSON.');
    }
    if (!isRecord(value) || !Array.isArray(value.nodes))
        return unsupported('Canvas document must contain a nodes array.');
    try {
        assertUniqueCanvasDocumentIdentities(value);
    }
    catch (error) {
        return unsupported(error instanceof Error ? error.message : 'Canvas document contains duplicate identities.');
    }
    if (value.nodes.length > MAX_CANVAS_NODES)
        return unsupported('Canvas document exceeds the node limit.');
    if (value.edges !== undefined && !Array.isArray(value.edges))
        return unsupported('Canvas edges must be an array.');
    if (Array.isArray(value.edges) && value.edges.length > MAX_CANVAS_EDGES)
        return unsupported('Canvas document exceeds the edge limit.');
    const ids = new Set();
    const nodes = [];
    for (const entry of value.nodes) {
        const node = parseNode(entry);
        if (node === null || ids.has(node.id))
            return unsupported('Canvas document contains an invalid or duplicate node.');
        ids.add(node.id);
        nodes.push(node);
    }
    const edges = [];
    if (Array.isArray(value.edges)) {
        for (const entry of value.edges) {
            const edge = parseEdge(entry);
            if (edge === null || ids.has(edge.id) || !ids.has(edge.fromNode) || !ids.has(edge.toNode)) {
                return unsupported('Canvas document contains an invalid, duplicate, or dangling edge.');
            }
            ids.add(edge.id);
            edges.push(edge);
        }
    }
    return {
        status: 'ready',
        document: {
            ...value,
            nodes,
            ...(value.edges === undefined ? {} : { edges }),
        },
    };
}
const SUPPORTED_NODE_TYPES = new Set(['text', 'file', 'link', 'group']);
export function isCredentialFreeCanvasLink(value) {
    if (typeof value !== 'string' || value.length > MAX_CANVAS_LABEL_LENGTH)
        return false;
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:')
            && url.username === ''
            && url.password === '';
    }
    catch {
        return false;
    }
}
export function projectCanvas(parsed) {
    if (parsed.status !== 'ready')
        return parsed;
    const { document } = parsed;
    const nodes = document.nodes.map(node => ({
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        supported: SUPPORTED_NODE_TYPES.has(node.type),
        text: typeof node.text === 'string' ? node.text : null,
        file: typeof node.file === 'string' ? node.file : null,
        linkSafe: node.type === 'link' && isCredentialFreeCanvasLink(node.url),
    }));
    const edges = (document.edges ?? []).map(edge => ({
        id: edge.id,
        fromNode: edge.fromNode,
        toNode: edge.toNode,
        label: typeof edge.label === 'string' ? edge.label : null,
    }));
    return { status: 'ready', nodes, edges, document };
}
export function parseCanvasForMutation(content) {
    const parsed = parseCanvasDocument(content);
    if (parsed.status !== 'ready')
        throw new Error(parsed.reason);
    return parsed.document;
}
export function serializeCanvasDocument(document) {
    const content = `${JSON.stringify(document, null, 2)}\n`;
    const parsed = parseCanvasDocument(content);
    if (parsed.status !== 'ready')
        throw new Error(parsed.reason);
    return content;
}
export function updateCanvasNodePosition(content, nodeId, x, y) {
    if (!isSafeId(nodeId) || !isFiniteCoordinate(x) || !isFiniteCoordinate(y)) {
        throw new Error('Canvas node position is invalid.');
    }
    const document = parseCanvasForMutation(content);
    const node = document.nodes.find(candidate => candidate.id === nodeId);
    if (node === undefined)
        throw new Error('Canvas node no longer exists.');
    node.x = x;
    node.y = y;
    return serializeCanvasDocument(document);
}
//# sourceMappingURL=canvas.js.map