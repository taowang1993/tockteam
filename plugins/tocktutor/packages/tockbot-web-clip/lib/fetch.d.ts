import { type LookupFunction } from 'node:net';
export type WebFetchErrorCode = 'aborted' | 'address' | 'body' | 'content-type' | 'encoding' | 'headers' | 'network' | 'redirect' | 'status' | 'text' | 'timeout' | 'url';
export declare class WebFetchError extends Error {
    readonly code: WebFetchErrorCode;
    constructor(code: WebFetchErrorCode, message: string);
}
export interface PublicFetchLimits {
    connectTimeoutMs: number;
    maxAddresses: number;
    maxRedirects: number;
    maxResponseBytes: number;
    maxResponseHeadersBytes: number;
    maxTextChars: number;
    maxUrlBytes: number;
    timeoutMs: number;
}
export declare const defaultPublicFetchLimits: Readonly<PublicFetchLimits>;
export declare const maximumPublicFetchLimits: Readonly<PublicFetchLimits>;
export interface PublicAddress {
    address: string;
}
export interface PublicFetchRequest {
    address: string;
    connectTimeoutMs: number;
    headers: Readonly<Record<string, string>>;
    maxResponseHeadersBytes: number;
    signal: AbortSignal;
    url: string;
}
export interface PublicTextResult {
    contentType: 'application/xhtml+xml' | 'text/html' | 'text/plain';
    text: string;
    url: string;
}
export interface FetchPublicTextOptions {
    limits?: Partial<PublicFetchLimits>;
    lookup?: (hostname: string, signal: AbortSignal) => Promise<PublicAddress[]>;
    request?: (request: PublicFetchRequest) => Promise<Response>;
    signal?: AbortSignal;
}
export declare function normalizePublicHttpUrl(value: string, maxBytes?: number): string;
export declare function isPublicAddress(rawAddress: string): boolean;
export declare function createPinnedLookup(rawAddress: string): LookupFunction;
export declare function fetchPublicText(value: string, options?: FetchPublicTextOptions): Promise<PublicTextResult>;
