export type CanvasNodeGeometry = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export type CanvasNodeGeometryUpdate = {
    nodeId: string;
    geometry: CanvasNodeGeometry;
};
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';
export declare const CANVAS_GRID_SIZE = 20;
export declare const MIN_CANVAS_NODE_WIDTH = 120;
export declare const MIN_CANVAS_NODE_HEIGHT = 80;
export declare function isCanvasSide(value: unknown): value is CanvasSide;
export declare function isBoundedCanvasGeometry(value: CanvasNodeGeometry): boolean;
export declare function calculateCanvasPointerValue(start: number, delta: number, snappingDisabled: boolean): number;
/** Calculate lower-right resize geometry, optionally preserving the starting aspect ratio. */
export declare function calculateCanvasResizeGeometry(start: CanvasNodeGeometry, delta: {
    x: number;
    y: number;
}, aspectRatioLocked: boolean, snappingDisabled: boolean): CanvasNodeGeometry;
//# sourceMappingURL=canvas-geometry.d.ts.map