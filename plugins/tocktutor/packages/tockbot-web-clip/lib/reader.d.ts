import type { PublicTextResult } from './fetch.ts';
export type ReaderViewErrorCode = 'input' | 'limits' | 'parser';
export declare class ReaderViewError extends Error {
    readonly code: ReaderViewErrorCode;
    constructor(code: ReaderViewErrorCode, message: string);
}
export interface ReaderViewLimits {
    maxParserInputChars: number;
    maxParserTokens: number;
    maxReaderOutputChars: number;
    maxReaderTitleChars: number;
    maxReaderWarningChars: number;
    maxReaderWarnings: number;
}
export declare const defaultReaderViewLimits: Readonly<ReaderViewLimits>;
export declare const maximumReaderViewLimits: Readonly<ReaderViewLimits>;
export interface ReaderViewResult {
    content: string;
    sourceUrl: string;
    title: string;
    warnings: string[];
}
export declare function projectReaderView(input: PublicTextResult, overrides?: Partial<ReaderViewLimits>): ReaderViewResult;
