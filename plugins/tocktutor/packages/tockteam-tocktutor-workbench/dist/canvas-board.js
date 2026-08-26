import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button } from '@tockteam/ui/button';
import { Input } from '@tockteam/ui/input';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { Textarea } from '@tockteam/ui/textarea';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createCanvasChange } from "./canvas-change.js";
import { createCanvasEdge, deleteCanvasEdge, isConnectableCanvasNode, reconnectCanvasEdge, updateCanvasEdgeColor, updateCanvasEdgeLabel, } from "./canvas-edges.js";
import { calculateCanvasPointerValue, CANVAS_GRID_SIZE } from "./canvas-geometry.js";
import { tryNormalizeCanvasLinkUrl } from "./canvas-links.js";
import { createCanvasFileNode, createCanvasGroupNode, createCanvasLinkNode, createCanvasTextNode, deleteCanvasGroup, deleteCanvasNode, duplicateCanvasGroup, duplicateCanvasNodes, moveCanvasNodes, updateCanvasGroupLabel, updateCanvasLinkNode, updateCanvasNodeGeometry, updateCanvasTextNode, } from "./canvas-nodes.js";
import { parseCanvasDocument } from "./canvas.js";
const BOARD_PADDING = 40;
const MAX_CANVAS_BOARD_SPAN = 100_000;
const SIDES = ['top', 'right', 'bottom', 'left'];
const controlClass = 'rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-2 py-1 text-xs text-inherit';
function CanvasNodeEditor(props) {
    const editedNodeId = props.editor.mode === 'edit' ? props.editor.nodeId : null;
    const node = editedNodeId === null
        ? undefined
        : props.document.nodes.find(candidate => candidate.id === editedNodeId);
    const kind = props.editor.mode === 'create' ? props.editor.kind : node?.type;
    if (kind === undefined)
        return null;
    const editing = props.editor.mode === 'edit';
    const value = kind === 'text' ? node?.text : kind === 'link' ? node?.url : kind === 'file' ? node?.file : node?.label;
    const label = editing ? kind === 'group' ? 'Group' : 'Card' : kind === 'group' ? 'Group' : 'Card';
    return (_jsxs("form", { "aria-label": `${label} Editor`, className: "absolute top-12 left-2 z-40 grid min-w-64 gap-2 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-3 shadow-lg", onSubmit: props.onSubmit, children: [_jsx("strong", { children: editing ? `Edit ${label}` : `Add ${kind === 'group' ? 'Group' : `${kind[0].toUpperCase()}${kind.slice(1)} Card`}` }), kind === 'text' && _jsxs("label", { className: "grid gap-1 text-xs", children: ["Card Text", _jsx(Textarea, { unstyled: true, "aria-label": "Card Text", className: controlClass, defaultValue: String(value ?? ''), maxLength: 100_000, name: "value", required: true })] }), kind === 'link' && _jsxs("label", { className: "grid gap-1 text-xs", children: ["Card URL", _jsx(Input, { unstyled: true, "aria-label": "Card URL", className: controlClass, defaultValue: String(value ?? ''), maxLength: 2_000, name: "value", required: true, type: "url" })] }), kind === 'file' && _jsxs("label", { className: "grid gap-1 text-xs", children: ["Card File", _jsx(Input, { unstyled: true, "aria-label": "Card File", className: controlClass, defaultValue: String(value ?? ''), maxLength: 1_000, name: "value", readOnly: editing, required: true })] }), kind === 'group' && _jsxs("label", { className: "grid gap-1 text-xs", children: ["Group Label", _jsx(Input, { unstyled: true, "aria-label": "Group Label", className: controlClass, defaultValue: String(value ?? 'Group'), maxLength: 200, name: "value", required: true })] }), editing && node !== undefined && (_jsxs("fieldset", { className: "grid grid-cols-2 gap-2 border-0 p-0", children: [_jsx("legend", { className: "sr-only", children: "Card Geometry" }), ['x', 'y', 'width', 'height'].map(key => _jsxs("label", { className: "grid gap-1 text-xs", children: [`Card ${key[0].toUpperCase()}${key.slice(1)}`, _jsx(Input, { unstyled: true, "aria-label": `Card ${key[0].toUpperCase()}${key.slice(1)}`, className: controlClass, defaultValue: String(node[key]), name: key, required: true, type: "number" })] }, key))] })), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { unstyled: true, className: controlClass, onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, className: controlClass, type: "submit", children: editing ? `Save ${label}` : `Create ${label}` })] })] }));
}
function CanvasEdgeEditor(props) {
    const edge = props.document.edges?.find(candidate => candidate.id === props.edgeId);
    if (edge === undefined)
        return null;
    return (_jsxs("form", { "aria-label": "Connection Editor", className: "absolute top-12 right-2 z-40 grid min-w-72 gap-2 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-3 shadow-lg", onSubmit: props.onSubmit, children: [_jsx("strong", { children: "Edit Connection" }), _jsxs("label", { className: "grid gap-1 text-xs", children: ["Label", _jsx(Input, { unstyled: true, "aria-label": "Connection Label", className: controlClass, defaultValue: typeof edge.label === 'string' ? edge.label : '', maxLength: 200, name: "label" })] }), _jsxs("label", { className: "grid gap-1 text-xs", children: ["Color", _jsxs(NativeSelect, { unstyled: true, "aria-label": "Connection Color", className: controlClass, defaultValue: typeof edge.color === 'string' ? edge.color : '', name: "color", children: [_jsx(NativeSelectOption, { value: "", children: "Default" }), [1, 2, 3, 4, 5, 6].map(value => _jsx(NativeSelectOption, { value: String(value), children: String(value) }, value))] })] }), ['from', 'to'].map(endpoint => {
                const nodeId = endpoint === 'from' ? edge.fromNode : edge.toNode;
                const side = endpoint === 'from' ? edge.fromSide : edge.toSide;
                return (_jsxs("fieldset", { className: "grid grid-cols-2 gap-2 border-0 p-0", children: [_jsx("legend", { className: "sr-only", children: endpoint === 'from' ? 'Connection Source' : 'Connection Target' }), _jsxs("label", { className: "grid gap-1 text-xs", children: [endpoint === 'from' ? 'Source Card' : 'Target Card', _jsx(NativeSelect, { unstyled: true, "aria-label": `Connection ${endpoint === 'from' ? 'Source' : 'Target'} Card`, className: controlClass, defaultValue: nodeId, name: `${endpoint}Node`, children: props.document.nodes.filter(isConnectableCanvasNode).map(node => _jsx(NativeSelectOption, { value: node.id, children: nodeLabel(node) }, node.id)) })] }), _jsxs("label", { className: "grid gap-1 text-xs", children: [endpoint === 'from' ? 'Source Side' : 'Target Side', _jsx(NativeSelect, { unstyled: true, "aria-label": `Connection ${endpoint === 'from' ? 'Source' : 'Target'} Side`, className: controlClass, defaultValue: typeof side === 'string' ? side : endpoint === 'from' ? 'right' : 'left', name: `${endpoint}Side`, children: SIDES.map(value => _jsx(NativeSelectOption, { value: value, children: titleCaseSide(value) }, value)) })] })] }, endpoint));
            }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { unstyled: true, className: controlClass, onClick: props.onCancel, type: "button", children: "Cancel" }), _jsx(Button, { unstyled: true, className: controlClass, type: "submit", children: "Save Connection" })] })] }));
}
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
    const [selectedNodeIds, setSelectedNodeIds] = useState(() => new Set());
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);
    const [nodeEditor, setNodeEditor] = useState(null);
    const [edgeEditor, setEdgeEditor] = useState(null);
    const [marquee, setMarquee] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [error, setError] = useState(null);
    const pointerCleanup = useRef(null);
    const document = parsed.status === 'ready' ? parsed.document : null;
    const labels = useMemo(() => new Map((document?.nodes ?? []).map(node => [node.id, nodeLabel(node)])), [document]);
    const selectedNode = document?.nodes.find(node => node.id === selectedNodeId);
    const selectedEdge = document?.edges?.find(edge => edge.id === selectedEdgeId);
    useEffect(() => () => { pointerCleanup.current?.(); }, []);
    useEffect(() => {
        if (document === null) {
            setArmed(null);
            setSelectedNodeId(null);
            setSelectedNodeIds(new Set());
            setSelectedEdgeId(null);
            setNodeEditor(null);
            setEdgeEditor(null);
            return;
        }
        if (armed !== null && !document.nodes.some(node => node.id === armed.nodeId))
            setArmed(null);
        if (selectedNodeId !== null && !document.nodes.some(node => node.id === selectedNodeId))
            setSelectedNodeId(null);
        if ([...selectedNodeIds].some(id => !document.nodes.some(node => node.id === id))) {
            setSelectedNodeIds(new Set([...selectedNodeIds].filter(id => document.nodes.some(node => node.id === id))));
        }
        if (selectedEdgeId !== null && !document.edges?.some(edge => edge.id === selectedEdgeId))
            setSelectedEdgeId(null);
        if (nodeEditor?.mode === 'edit' && !document.nodes.some(node => node.id === nodeEditor.nodeId))
            setNodeEditor(null);
        if (edgeEditor !== null && !document.edges?.some(edge => edge.id === edgeEditor.edgeId))
            setEdgeEditor(null);
    }, [armed, document, edgeEditor, nodeEditor, selectedEdgeId, selectedNodeId, selectedNodeIds]);
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
            return false;
        try {
            setError(null);
            onChange(createCanvasChange(source, revision, operation, mutate));
            return true;
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'The Canvas change could not be prepared.');
            return false;
        }
    };
    const submitNodeEditor = (event) => {
        event.preventDefault();
        if (nodeEditor === null || document === null)
            return;
        const form = new FormData(event.currentTarget);
        const value = String(form.get('value') ?? '');
        const prepared = nodeEditor.mode === 'create'
            ? emit('create-node', content => {
                if (nodeEditor.kind === 'text') {
                    const created = createCanvasTextNode(content);
                    return updateCanvasTextNode(created.content, created.nodeId, value);
                }
                if (nodeEditor.kind === 'link')
                    return createCanvasLinkNode(content, value).content;
                if (nodeEditor.kind === 'file')
                    return createCanvasFileNode(content, value).content;
                const created = createCanvasGroupNode(content);
                return updateCanvasGroupLabel(created.content, created.nodeId, value);
            })
            : emit('update-node', content => {
                const node = document.nodes.find(candidate => candidate.id === nodeEditor.nodeId);
                if (node === undefined)
                    throw new Error('The selected Canvas card no longer exists.');
                let next = updateCanvasNodeGeometry(content, node.id, {
                    x: Number(form.get('x')),
                    y: Number(form.get('y')),
                    width: Number(form.get('width')),
                    height: Number(form.get('height')),
                });
                if (node.type === 'text')
                    next = updateCanvasTextNode(next, node.id, value);
                else if (node.type === 'link')
                    next = updateCanvasLinkNode(next, node.id, value);
                else if (node.type === 'group')
                    next = updateCanvasGroupLabel(next, node.id, value);
                return next;
            });
        if (prepared)
            setNodeEditor(null);
    };
    const submitEdgeEditor = (event) => {
        event.preventDefault();
        if (edgeEditor === null)
            return;
        const form = new FormData(event.currentTarget);
        const prepared = emit('reconnect-edge', content => {
            let next = reconnectCanvasEdge(content, {
                edgeId: edgeEditor.edgeId,
                endpoint: 'from',
                nodeId: String(form.get('fromNode') ?? ''),
                side: String(form.get('fromSide') ?? ''),
            });
            next = reconnectCanvasEdge(next, {
                edgeId: edgeEditor.edgeId,
                endpoint: 'to',
                nodeId: String(form.get('toNode') ?? ''),
                side: String(form.get('toSide') ?? ''),
            });
            next = updateCanvasEdgeLabel(next, edgeEditor.edgeId, String(form.get('label') ?? ''));
            return updateCanvasEdgeColor(next, edgeEditor.edgeId, String(form.get('color') ?? ''));
        });
        if (prepared)
            setEdgeEditor(null);
    };
    const duplicateSelectedNode = () => {
        if (document === null || selectedNodeId === null)
            return;
        const node = document.nodes.find(candidate => candidate.id === selectedNodeId);
        if (node === undefined)
            return;
        const geometry = { x: node.x + CANVAS_GRID_SIZE, y: node.y + CANVAS_GRID_SIZE, width: node.width, height: node.height };
        const prepared = emit('duplicate-node', content => node.type === 'group'
            ? duplicateCanvasGroup(content, node.id, geometry).content
            : duplicateCanvasNodes(content, [{ nodeId: node.id, geometry }]).content);
        if (prepared) {
            setSelectedNodeIds(new Set());
            setSelectedNodeId(null);
        }
    };
    const deleteSelectedNode = () => {
        if (document === null || selectedNodeId === null)
            return;
        const node = document.nodes.find(candidate => candidate.id === selectedNodeId);
        if (node === undefined)
            return;
        const prepared = emit('delete-node', content => node.type === 'group'
            ? deleteCanvasGroup(content, node.id)
            : deleteCanvasNode(content, node.id));
        if (prepared) {
            setSelectedNodeIds(new Set());
            setSelectedNodeId(null);
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
        const selected = selectedNodeIds.has(nodeId) ? [...selectedNodeIds] : [nodeId];
        emit('move-node', content => moveCanvasNodes(content, selected, delta.x, delta.y));
    };
    const beginPointerGeometry = (node, event, mode) => {
        if (disabled || event.button !== 0)
            return;
        event.preventDefault();
        pointerCleanup.current?.();
        const startX = event.clientX;
        const startY = event.clientY;
        const snappingDisabled = event.altKey;
        let deltaX = 0;
        let deltaY = 0;
        const move = (next) => {
            deltaX = calculateCanvasPointerValue(0, (next.clientX - startX) / zoom, snappingDisabled);
            deltaY = calculateCanvasPointerValue(0, (next.clientY - startY) / zoom, snappingDisabled);
        };
        const cleanup = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', cancel);
            if (pointerCleanup.current === cleanup)
                pointerCleanup.current = null;
        };
        const finish = () => {
            cleanup();
            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1)
                return;
            emit(mode === 'move' ? 'move-node' : 'resize-node', content => mode === 'move'
                ? moveCanvasNodes(content, selectedNodeIds.has(node.id) ? [...selectedNodeIds] : [node.id], deltaX, deltaY)
                : updateCanvasNodeGeometry(content, node.id, { x: node.x, y: node.y, width: node.width + deltaX, height: node.height + deltaY }));
        };
        const cancel = () => { cleanup(); };
        pointerCleanup.current = cleanup;
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', cancel);
    };
    const beginMarquee = (event) => {
        if (disabled || event.button !== 0 || event.target !== event.currentTarget || document === null)
            return;
        event.preventDefault();
        pointerCleanup.current?.();
        const rectangle = event.currentTarget.getBoundingClientRect();
        const startX = (event.clientX - rectangle.left) / zoom;
        const startY = (event.clientY - rectangle.top) / zoom;
        const additive = event.shiftKey;
        let endX = startX;
        let endY = startY;
        const update = () => {
            setMarquee({
                height: Math.abs(endY - startY),
                left: Math.min(startX, endX),
                top: Math.min(startY, endY),
                width: Math.abs(endX - startX),
            });
        };
        const move = (next) => {
            endX = (next.clientX - rectangle.left) / zoom;
            endY = (next.clientY - rectangle.top) / zoom;
            update();
        };
        const cleanup = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', cancel);
            if (pointerCleanup.current === cleanup)
                pointerCleanup.current = null;
            setMarquee(null);
        };
        const finish = () => {
            const left = Math.min(startX, endX);
            const right = Math.max(startX, endX);
            const top = Math.min(startY, endY);
            const bottom = Math.max(startY, endY);
            const matched = document.nodes.filter(node => {
                const nodeLeft = node.x - bounds.minX + BOARD_PADDING;
                const nodeTop = node.y - bounds.minY + BOARD_PADDING;
                return nodeLeft < right && nodeLeft + node.width > left && nodeTop < bottom && nodeTop + node.height > top;
            }).map(node => node.id);
            const next = new Set(additive ? selectedNodeIds : []);
            for (const id of matched)
                next.add(id);
            setSelectedNodeIds(next);
            setSelectedNodeId(matched.at(-1) ?? (additive ? selectedNodeId : null));
            setSelectedEdgeId(null);
            cleanup();
        };
        const cancel = () => { cleanup(); };
        pointerCleanup.current = cleanup;
        update();
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', cancel);
    };
    const cancelConnection = (event) => {
        if (event.key !== 'Escape')
            return;
        if (armed === null && marquee === null)
            return;
        event.preventDefault();
        pointerCleanup.current?.();
        setArmed(null);
        setMarquee(null);
    };
    if (document === null) {
        const reason = parsed.status === 'unsupported' ? parsed.reason : 'This Canvas could not be displayed.';
        return _jsx("section", { "aria-label": "Canvas Board", role: "region", children: _jsx("p", { role: "note", children: reason }) });
    }
    if (!bounds.supported) {
        return (_jsx("section", { "aria-label": "Canvas Board", role: "region", children: _jsx("p", { role: "note", children: "This Canvas exceeds the bounded board display limit." }) }));
    }
    return (_jsxs("section", { "aria-label": "Canvas Board", className: "relative min-h-0 overflow-auto bg-[var(--tt-bg)] text-[var(--tt-text)]", "data-canvas-revision": revision, onKeyDown: cancelConnection, role: "region", children: [armed !== null && _jsxs("p", { className: "sr-only", role: "status", children: ["Choose a target side for ", labels.get(armed.nodeId) ?? armed.nodeId, "."] }), error !== null && _jsx("p", { className: "m-3 text-sm text-red-600", role: "note", children: error }), !disabled && (_jsxs("div", { "aria-label": "Canvas Actions", className: "sticky top-2 left-2 z-30 m-2 flex w-fit max-w-[calc(100%-16px)] flex-wrap gap-1 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-1 shadow-sm", role: "toolbar", children: [_jsx(Button, { unstyled: true, className: controlClass, onClick: () => { setNodeEditor({ kind: 'text', mode: 'create' }); }, type: "button", children: "Add Text Card" }), _jsx(Button, { unstyled: true, className: controlClass, onClick: () => { setNodeEditor({ kind: 'link', mode: 'create' }); }, type: "button", children: "Add Link Card" }), _jsx(Button, { unstyled: true, className: controlClass, onClick: () => { setNodeEditor({ kind: 'file', mode: 'create' }); }, type: "button", children: "Add File Card" }), _jsx(Button, { unstyled: true, className: controlClass, onClick: () => { setNodeEditor({ kind: 'group', mode: 'create' }); }, type: "button", children: "Add Group" }), _jsx(Button, { unstyled: true, "aria-label": "Zoom Canvas Out", className: controlClass, disabled: zoom <= 0.5, onClick: () => { setZoom(value => Math.max(0.5, value - 0.25)); }, type: "button", children: "\u2212" }), _jsxs(Button, { unstyled: true, "aria-label": "Reset Canvas Zoom", className: controlClass, onClick: () => { setZoom(1); }, type: "button", children: [String(Math.round(zoom * 100)), "%"] }), _jsx(Button, { unstyled: true, "aria-label": "Zoom Canvas In", className: controlClass, disabled: zoom >= 2, onClick: () => { setZoom(value => Math.min(2, value + 0.25)); }, type: "button", children: "+" }), selectedNode !== undefined && (_jsxs(_Fragment, { children: [_jsxs(Button, { unstyled: true, className: controlClass, onClick: () => { setNodeEditor({ mode: 'edit', nodeId: selectedNode.id }); }, type: "button", children: ["Edit ", selectedNode.type === 'group' ? 'Group' : 'Card'] }), _jsxs(Button, { unstyled: true, className: controlClass, onClick: duplicateSelectedNode, type: "button", children: ["Duplicate ", selectedNode.type === 'group' ? 'Group' : 'Card'] }), _jsxs(Button, { unstyled: true, className: controlClass, onClick: deleteSelectedNode, type: "button", children: ["Delete ", selectedNode.type === 'group' ? 'Group' : 'Card'] })] })), selectedEdge !== undefined && (_jsxs(_Fragment, { children: [_jsx(Button, { unstyled: true, className: controlClass, onClick: () => { setEdgeEditor({ edgeId: selectedEdge.id }); }, type: "button", children: "Edit Connection" }), _jsx(Button, { unstyled: true, className: controlClass, onClick: () => { if (emit('delete-edge', content => deleteCanvasEdge(content, selectedEdge.id)))
                                    setSelectedEdgeId(null); }, type: "button", children: "Delete Connection" })] }))] })), nodeEditor !== null && _jsx(CanvasNodeEditor, { document: document, editor: nodeEditor, onCancel: () => { setNodeEditor(null); }, onSubmit: submitNodeEditor }), edgeEditor !== null && _jsx(CanvasEdgeEditor, { document: document, edgeId: edgeEditor.edgeId, onCancel: () => { setEdgeEditor(null); }, onSubmit: submitEdgeEditor }), _jsxs("div", { "aria-label": "Canvas Board Surface", className: "relative", onPointerDown: beginMarquee, style: { height: bounds.height, width: bounds.width, zoom }, children: [marquee !== null && _jsx("div", { "aria-label": "Canvas Marquee Selection", className: "pointer-events-none absolute z-20 border border-[var(--tt-accent)] bg-[color-mix(in_srgb,var(--tt-accent)_12%,transparent)]", role: "img", style: marquee }), document.nodes.map(node => {
                        const label = labels.get(node.id) ?? node.id;
                        const connectable = isConnectableCanvasNode(node);
                        const safeLink = node.type === 'link' ? tryNormalizeCanvasLinkUrl(node.url) : undefined;
                        const style = {
                            height: node.height,
                            left: node.x - bounds.minX + BOARD_PADDING,
                            top: node.y - bounds.minY + BOARD_PADDING,
                            width: node.width,
                        };
                        return (_jsxs("article", { "aria-label": `${node.type === 'group' ? 'Canvas Group' : 'Canvas Card'} ${label}`, className: "absolute rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-2 shadow-sm", style: style, children: [_jsxs(Button, { unstyled: true, "aria-label": `${node.type === 'group' ? 'Canvas Group' : 'Canvas Card'} ${label}`, "aria-pressed": selectedNodeIds.has(node.id), className: "h-full w-full border-0 bg-transparent p-1 text-left text-inherit outline-offset-2", "data-canvas-x": String(node.x), disabled: disabled || !connectable, onClick: event => {
                                        if (event.shiftKey) {
                                            const next = new Set(selectedNodeIds);
                                            if (next.has(node.id))
                                                next.delete(node.id);
                                            else
                                                next.add(node.id);
                                            setSelectedNodeIds(next);
                                            setSelectedNodeId(next.has(node.id) ? node.id : [...next].at(-1) ?? null);
                                        }
                                        else {
                                            setSelectedNodeIds(new Set([node.id]));
                                            setSelectedNodeId(node.id);
                                        }
                                        setSelectedEdgeId(null);
                                    }, onKeyDown: event => { moveNode(node.id, event); }, onPointerDown: event => { beginPointerGeometry(node, event, 'move'); }, type: "button", children: [_jsx("strong", { className: "block truncate", children: label }), node.type === 'text' && typeof node.text === 'string' && _jsx("span", { className: "block line-clamp-3 whitespace-pre-wrap text-xs", children: node.text }), node.type === 'link' && safeLink === undefined && _jsx("span", { className: "block text-xs", role: "note", children: "This unsafe link is inert." }), !connectable && _jsx("span", { className: "block text-xs", role: "note", children: "This unsupported card is inert." })] }), connectable && !disabled && _jsx(Button, { unstyled: true, "aria-label": `Resize ${node.type === 'group' ? 'Group' : 'Card'} ${label}`, className: "absolute right-0 bottom-0 z-10 size-5 translate-1/2 cursor-nwse-resize rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] p-0", onPointerDown: event => { beginPointerGeometry(node, event, 'resize'); }, type: "button" }), connectable && (_jsxs("fieldset", { className: "contents", disabled: disabled, children: [_jsxs("legend", { className: "sr-only", children: ["Connect ", label] }), SIDES.map(side => (_jsx(Button, { unstyled: true, "aria-label": `${titleCaseSide(side)} Connection Handle for ${label}`, "aria-pressed": armed?.nodeId === node.id && armed.side === side, className: "absolute z-10 m-0 size-5 rounded-full border border-[var(--tt-border)] bg-[var(--tt-panel)] text-[10px]", onClick: () => { activateHandle(node.id, side); }, style: sideHandleStyle(side), type: "button", children: _jsx("span", { "aria-hidden": "true", children: side.slice(0, 1).toUpperCase() }) }, side)))] }))] }, node.id));
                    })] }), (document.edges?.length ?? 0) > 0 && (_jsx("ul", { "aria-label": "Canvas Connections", className: "absolute top-2 right-2 z-20 m-0 max-w-72 list-none rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-1 text-xs shadow-sm", children: document.edges?.map(edge => (_jsx("li", { children: _jsxs(Button, { unstyled: true, "aria-pressed": selectedEdgeId === edge.id, className: "block w-full rounded-sm border-0 bg-transparent px-2 py-1 text-left text-inherit outline-offset-2", onClick: () => {
                            setSelectedEdgeId(edge.id);
                            setSelectedNodeIds(new Set());
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