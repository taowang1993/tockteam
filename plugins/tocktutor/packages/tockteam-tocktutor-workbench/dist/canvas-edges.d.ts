import { type CanvasSide } from './canvas-geometry.ts';
export type CanvasEdgeEndpoint = 'from' | 'to';
export declare function isConnectableCanvasNode(node: Record<string, unknown>): boolean;
/** Add one directed edge between two supported cards or groups. */
export declare function createCanvasEdge(content: string, connection: {
    fromNode: string;
    fromSide: CanvasSide;
    toNode: string;
    toSide: CanvasSide;
}): {
    edgeId: string;
    content: string;
};
/** Create one text card and incoming connection as one serialized mutation. */
export declare function createCanvasConnectedTextNode(content: string, connection: {
    fromNode: string;
    fromSide: CanvasSide;
    position: {
        x: number;
        y: number;
    };
}): {
    nodeId: string;
    edgeId: string;
    content: string;
};
/** Move one endpoint while retaining edge identity and every unrelated field. */
export declare function reconnectCanvasEdge(content: string, update: {
    edgeId: string;
    endpoint: CanvasEdgeEndpoint;
    nodeId: string;
    side: CanvasSide;
}): string;
export declare function updateCanvasEdgeLabel(content: string, edgeId: string, label: string): string;
export declare function updateCanvasEdgeColor(content: string, edgeId: string, color: string): string;
export declare function deleteCanvasEdge(content: string, edgeId: string): string;
//# sourceMappingURL=canvas-edges.d.ts.map