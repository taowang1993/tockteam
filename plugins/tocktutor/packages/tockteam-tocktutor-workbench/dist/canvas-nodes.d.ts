import { type CanvasNodeGeometry, type CanvasNodeGeometryUpdate } from './canvas-geometry.ts';
export declare const CANVAS_DEFAULT_TEXT_CARD_SIZE: {
    readonly width: 260;
    readonly height: 140;
};
export declare function isSupportedCanvasCard(node: Record<string, unknown>): boolean;
/** Add a new editable text card without replacing unrelated fields. */
export declare function createCanvasTextNode(content: string, position?: {
    x: number;
    y: number;
}): {
    nodeId: string;
    content: string;
};
/** Add an editable group boundary. */
export declare function createCanvasGroupNode(content: string): {
    nodeId: string;
    content: string;
};
/** Add a snapped group around an exact selection of supported cards. */
export declare function createCanvasGroupFromSelection(content: string, nodeIds: readonly string[]): {
    nodeId: string;
    content: string;
};
/** Add a syntactically safe vault-relative file card. Host authority still resolves the path. */
export declare function createCanvasFileNode(content: string, relativePath: string): {
    nodeId: string;
    content: string;
};
export declare function createCanvasLinkNode(content: string, value: string): {
    nodeId: string;
    content: string;
};
export declare function updateCanvasLinkNode(content: string, nodeId: string, value: string): string;
export declare function updateCanvasTextNode(content: string, nodeId: string, text: string): string;
/** Validate every selected card before applying one atomic geometry update. */
export declare function updateCanvasNodeGeometries(content: string, updates: readonly CanvasNodeGeometryUpdate[]): string;
/** Move or resize a group; position-only moves translate fully contained non-group nodes. */
export declare function updateCanvasGroupGeometry(content: string, nodeId: string, geometry: CanvasNodeGeometry): string;
export declare function updateCanvasNodeGeometry(content: string, nodeId: string, geometry: CanvasNodeGeometry): string;
export declare function updateCanvasGroupLabel(content: string, nodeId: string, label: string): string;
/** Delete a group boundary without deleting contained cards or edges. */
export declare function deleteCanvasGroup(content: string, nodeId: string): string;
/** Delete supported cards and only their incident edges. */
export declare function deleteCanvasNodes(content: string, nodeIds: readonly string[]): string;
export declare function deleteCanvasNode(content: string, nodeId: string): string;
export declare function duplicateCanvasGroup(content: string, nodeId: string, geometry: CanvasNodeGeometry): {
    nodeId: string;
    content: string;
};
/** Duplicate supported cards and edges wholly contained by the selection. */
export declare function duplicateCanvasNodes(content: string, updates: readonly CanvasNodeGeometryUpdate[]): {
    nodeIds: string[];
    content: string;
};
//# sourceMappingURL=canvas-nodes.d.ts.map