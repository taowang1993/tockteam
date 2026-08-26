import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { createCanvasChange } from "./canvas-change.js";
import { createCanvasEdge, deleteCanvasEdge, isConnectableCanvasNode } from "./canvas-edges.js";
import { CANVAS_GRID_SIZE } from "./canvas-geometry.js";
import { tryNormalizeCanvasLinkUrl } from "./canvas-links.js";
import { updateCanvasNodeGeometry } from "./canvas-nodes.js";
import { parseCanvasDocument } from "./canvas.js";
const BOARD_PADDING = 40;
const MAX_CANVAS_BOARD_SPAN = 100_000;
const SIDES = ['top', 'right', 'bottom', 'left'];
function nodeLabel(node) {
    if (node.type === 'file' && typeof node.file === 'string')
        return node.file;
    if (node.type === 'link' && typeof node.url === 'string')
        return node.url;
    if (node.type === 'group' && typeof node.label === 'string')
        return node.label;
    if (typeof node.text === 'string') {
        const first = node.text.trim().split(/\r?\n/u)[0]?.replace(/^#{1,6}\s+/u, '').trim();
        if (first)
            return first;
    }
    return typeof node.id === 'string' ? node.id : 'Canvas Card';
}
function titleCaseSide(side) {
    return `${side.slice(0, 1).toUpperCase()}${side.slice(1)}`;
}
function sideHandleStyle(side) {
    return {
        bottom: side === 'bottom' ? 0 : undefined,
        left: side === 'left' ? 0 : side === 'top' || side === 'bottom' ? '50%' : undefined,
        right: side === 'right' ? 0 : undefined,
        top: side === 'top' ? 0 : side === 'left' || side === 'right' ? '50%' : undefined,
        transform: {
            top: 'translate(-50%, -50%)',
            right: 'translate(50%, -50%)',
            bottom: 'translate(-50%, 50%)',
            left: 'translate(-50%, -50%)',
        }[side],
    };
}
/**
 * Controlled, browser-only Canvas seam. It never saves or owns optimistic
 * source; every edit carries the exact previous source and expected revision.
 */
export function CanvasBoard({ source, revision, onChange, disabled = false }) {
    const parsed = useMemo(() => parseCanvasDocument(source), [source]);
    const [armed, setArmed] = useState(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);
    const [error, setError] = useState(null);
    const document = parsed.status === 'ready' ? parsed.document : null;
    const labels = useMemo(() => new Map((document?.nodes ?? []).map(node => [node.id, nodeLabel(node)])), [document]);
    useEffect(() => {
        if (document === null) {
            setArmed(null);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            return;
        }
        if (armed !== null && !document.nodes.some(node => node.id === armed.nodeId))
            setArmed(null);
        if (selectedNodeId !== null && !document.nodes.some(node => node.id === selectedNodeId))
            setSelectedNodeId(null);
        if (selectedEdgeId !== null && !document.edges?.some(edge => edge.id === selectedEdgeId))
            setSelectedEdgeId(null);
    }, [armed, document, selectedEdgeId, selectedNodeId]);
    const bounds = useMemo(() => {
        if (document === null || document.nodes.length === 0) {
            return { minX: 0, minY: 0, width: 800, height: 500, supported: true };
        }
        const minX = Math.min(0, ...document.nodes.map(node => node.x));
        const minY = Math.min(0, ...document.nodes.map(node => node.y));
        const maxX = Math.max(...document.nodes.map(node => node.x + node.width));
        const maxY = Math.max(...document.nodes.map(node => node.y + node.height));
        const width = maxX - minX + BOARD_PADDING * 2;
        const height = maxY - minY + BOARD_PADDING * 2;
        return {
            minX,
            minY,
            width: Math.max(800, width),
            height: Math.max(500, height),
            supported: width <= MAX_CANVAS_BOARD_SPAN && height <= MAX_CANVAS_BOARD_SPAN,
        };
    }, [document]);
    const emit = (operation, mutate) => {
        if (disabled)
            return;
        try {
            setError(null);
            onChange(createCanvasChange(source, revision, operation, mutate));
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'The Canvas change could not be prepared.');
        }
    };
    const activateHandle = (nodeId, side) => {
        if (disabled)
            return;
        if (armed === null) {
            setError(null);
            setArmed({ nodeId, side });
            return;
        }
        emit('create-edge', content => createCanvasEdge(content, {
            fromNode: armed.nodeId,
            fromSide: armed.side,
            toNode: nodeId,
            toSide: side,
        }).content);
        setArmed(null);
    };
    const moveNode = (nodeId, event) => {
        const delta = {
            ArrowDown: { x: 0, y: CANVAS_GRID_SIZE },
            ArrowLeft: { x: -CANVAS_GRID_SIZE, y: 0 },
            ArrowRight: { x: CANVAS_GRID_SIZE, y: 0 },
            ArrowUp: { x: 0, y: -CANVAS_GRID_SIZE },
        }[event.key];
        if (delta === undefined || document === null)
            return;
        const node = document.nodes.find(candidate => candidate.id === nodeId);
        if (node === undefined)
            return;
        event.preventDefault();
        emit('move-node', content => updateCanvasNodeGeometry(content, nodeId, {
            x: node.x + delta.x,
            y: node.y + delta.y,
            width: node.width,
            height: node.height,
        }));
    };
    const cancelConnection = (event) => {
        if (event.key !== 'Escape' || armed === null)
            return;
        event.preventDefault();
        setArmed(null);
    };
    if (document === null) {
        const reason = parsed.status === 'unsupported' ? parsed.reason : 'This Canvas could not be displayed.';
        return _jsx("section", { "aria-label": "Canvas Board", role: "region", children: _jsx("p", { role: "note", children: reason }) });
    }
    if (!bounds.supported) {
        return (_jsx("section", { "aria-label": "Canvas Board", role: "region", children: _jsx("p", { role: "note", children: "This Canvas exceeds the bounded board display limit." }) }));
    }
    return (_jsxs("section", { "aria-label": "Canvas Board", className: "relative min-h-0 overflow-auto bg-[var(--tt-bg)] text-[var(--tt-text)]", "data-canvas-revision": revision, onKeyDown: cancelConnection, role: "region", children: [armed !== null && _jsxs("p", { className: "sr-only", role: "status", children: ["Choose a target side for ", labels.get(armed.nodeId) ?? armed.nodeId, "."] }), error !== null && _jsx("p", { className: "m-3 text-sm text-red-600", role: "note", children: error }), _jsx("div", { "aria-label": "Canvas Board Surface", className: "relative", style: { height: bounds.height, width: bounds.width }, children: document.nodes.map(node => {
                    const label = labels.get(node.id) ?? node.id;
                    const connectable = isConnectableCanvasNode(node);
                    const safeLink = node.type === 'link' ? tryNormalizeCanvasLinkUrl(node.url) : undefined;
                    const style = {
                        height: node.height,
                        left: node.x - bounds.minX + BOARD_PADDING,
                        top: node.y - bounds.minY + BOARD_PADDING,
                        width: node.width,
                    };
                    return (_jsxs("article", { "aria-label": `${node.type === 'group' ? 'Canvas Group' : 'Canvas Card'} ${label}`, className: "absolute rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-2 shadow-sm", style: style, children: [_jsxs("button", { "aria-label": `${node.type === 'group' ? 'Canvas Group' : 'Canvas Card'} ${label}`, "aria-pressed": selectedNodeId === node.id, className: "h-full w-full border-0 bg-transparent p-1 text-left text-inherit outline-offset-2", "data-canvas-x": String(node.x), disabled: disabled || !connectable, onClick: () => {
                                    setSelectedNodeId(node.id);
                                    setSelectedEdgeId(null);
                                }, onKeyDown: event => { moveNode(node.id, event); }, type: "button", children: [_jsx("strong", { className: "block truncate", children: label }), node.type === 'text' && typeof node.text === 'string' && _jsx("span", { className: "block line-clamp-3 whitespace-pre-wrap text-xs", children: node.text }), node.type === 'link' && safeLink === undefined && _jsx("span", { className: "block text-xs", role: "note", children: "This unsafe link is inert." }), !connectable && _jsx("span", { className: "block text-xs", role: "note", children: "This unsupported card is inert." })] }), connectable && (_jsxs("fieldset", { className: "contents", disabled: disabled, children: [_jsxs("legend", { className: "sr-only", children: ["Connect ", label] }), SIDES.map(side => (_jsx("button", { "aria-label": `${titleCaseSide(side)} Connection Handle for ${label}`, "aria-pressed": armed?.nodeId === node.id && armed.side === side, className: "absolute z-10 m-0 size-5 rounded-full border border-[var(--tt-border)] bg-[var(--tt-panel)] text-[10px]", onClick: () => { activateHandle(node.id, side); }, style: sideHandleStyle(side), type: "button", children: _jsx("span", { "aria-hidden": "true", children: side.slice(0, 1).toUpperCase() }) }, side)))] }))] }, node.id));
                }) }), (document.edges?.length ?? 0) > 0 && (_jsx("ul", { "aria-label": "Canvas Connections", className: "absolute top-2 right-2 z-20 m-0 max-w-72 list-none rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-1 text-xs shadow-sm", children: document.edges?.map(edge => (_jsx("li", { children: _jsxs("button", { "aria-pressed": selectedEdgeId === edge.id, className: "block w-full rounded-sm border-0 bg-transparent px-2 py-1 text-left text-inherit outline-offset-2", onClick: () => {
                            setSelectedEdgeId(edge.id);
                            setSelectedNodeId(null);
                        }, onKeyDown: event => {
                            if (event.key !== 'Delete' && event.key !== 'Backspace')
                                return;
                            event.preventDefault();
                            emit('delete-edge', content => deleteCanvasEdge(content, edge.id));
                            setSelectedEdgeId(null);
                        }, type: "button", children: ["Canvas Edge ", typeof edge.label === 'string' ? edge.label : 'Unlabeled', " from ", labels.get(edge.fromNode) ?? edge.fromNode, " to ", labels.get(edge.toNode) ?? edge.toNode] }) }, edge.id))) }))] }));
}
//# sourceMappingURL=canvas-board.js.map