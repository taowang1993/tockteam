export declare class CanvasLinkUrlError extends Error {
    readonly code: 'invalid' | 'http-only' | 'credential-bearing';
    constructor(code: 'invalid' | 'http-only' | 'credential-bearing', message: string);
}
/** Normalize user-entered Canvas links without allowing credentials or non-web schemes. */
export declare function normalizeCanvasLinkUrl(value: string): string;
/** Validate persisted Canvas URLs while preserving valid explicit spelling. */
export declare function tryNormalizeCanvasLinkUrl(value: unknown): string | undefined;
//# sourceMappingURL=canvas-links.d.ts.map