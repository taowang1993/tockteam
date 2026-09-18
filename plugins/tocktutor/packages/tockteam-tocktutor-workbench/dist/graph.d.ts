import type { VaultGraphResult } from './types.ts';
export declare const MAX_GRAPH_NODES = 180;
export declare const MAX_GRAPH_EDGES = 512;
export interface GraphProjection {
    activePath: string | null;
    edges: VaultGraphResult['edges'];
    nodes: VaultGraphResult['nodes'];
}
export interface GraphProjectionOptions {
    includeOrphans: boolean;
    query: string;
}
export interface GraphLayoutOptions {
    centerForce: number;
    iterations: number;
    linkDistance: number;
    linkForce: number;
    repelForce: number;
}
export interface GraphPosition {
    depth: number | null;
    path: string;
    x: number;
    y: number;
}
export declare function projectGraph(result: VaultGraphResult, options: GraphProjectionOptions): GraphProjection;
export declare function layoutGraph(graph: GraphProjection, options: GraphLayoutOptions): GraphPosition[];
//# sourceMappingURL=graph.d.ts.map