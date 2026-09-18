export declare const MAX_CANVAS_BYTES = 2000000;
export declare const MAX_CANVAS_NODES = 2000;
export declare const MAX_CANVAS_EDGES = 4000;
export declare const MAX_CANVAS_ID_LENGTH = 256;
export declare const MAX_CANVAS_LABEL_LENGTH = 32768;
export declare const MAX_CANVAS_COORDINATE = 1000000000;
export interface CanvasNode extends Record<string, unknown> {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface CanvasEdge extends Record<string, unknown> {
    id: string;
    fromNode: string;
    toNode: string;
}
export interface CanvasDocument extends Record<string, unknown> {
    nodes: CanvasNode[];
    edges?: CanvasEdge[];
}
export type CanvasParseResult = {
    status: 'ready';
    document: CanvasDocument;
} | {
    status: 'unsupported';
    reason: string;
};
export interface CanvasNodeProjection {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    supported: boolean;
    text: string | null;
    file: string | null;
    linkSafe: boolean;
}
export interface CanvasEdgeProjection {
    id: string;
    fromNode: string;
    toNode: string;
    label: string | null;
}
export type CanvasProjection = {
    status: 'ready';
    nodes: CanvasNodeProjection[];
    edges: CanvasEdgeProjection[];
    document: CanvasDocument;
} | {
    status: 'unsupported';
    reason: string;
};
export declare function parseCanvasDocument(content: string): CanvasParseResult;
export declare function isCredentialFreeCanvasLink(value: unknown): boolean;
export declare function projectCanvas(parsed: {
    status: 'ready';
    document: CanvasDocument;
}): Extract<CanvasProjection, {
    status: 'ready';
}>;
export declare function projectCanvas(parsed: CanvasParseResult): CanvasProjection;
export declare function parseCanvasForMutation(content: string): CanvasDocument;
export declare function serializeCanvasDocument(document: CanvasDocument): string;
export declare function updateCanvasNodePosition(content: string, nodeId: string, x: number, y: number): string;
//# sourceMappingURL=canvas.d.ts.map