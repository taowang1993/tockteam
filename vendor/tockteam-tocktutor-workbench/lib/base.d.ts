export declare const MAX_BASE_BYTES = 2000000;
export declare const MAX_BASE_LINES = 4096;
export declare const MAX_BASE_LINE_LENGTH = 4096;
export declare const MAX_BASE_VIEWS = 64;
export declare const MAX_BASE_FIELDS = 128;
export type BaseViewStatus = 'ready' | 'unsupported';
export interface BaseViewProjection {
    status: BaseViewStatus;
    type: string;
    name: string;
    fields: Record<string, string>;
    order: string[];
    warnings: string[];
}
export type BaseProjection = {
    status: 'ready';
    views: BaseViewProjection[];
    warnings: string[];
} | {
    status: 'unsupported';
    reason: string;
};
export declare function projectBase(content: string): BaseProjection;
//# sourceMappingURL=base.d.ts.map