import type { InspectedSourceFile, PlannedSourceResult } from './markdown.ts';
export declare function planCsv(bytes: Uint8Array, sourceName: string): PlannedSourceResult;
export declare function planHtml(files: InspectedSourceFile[], rootName: string): PlannedSourceResult;
export declare function planHtmlZip(bytes: Uint8Array, rootName: string): PlannedSourceResult;
export declare function planAppleJournal(files: InspectedSourceFile[]): PlannedSourceResult;
export declare function planRoam(bytes: Uint8Array): PlannedSourceResult;
export declare function planGoogleKeep(bytes: Uint8Array): PlannedSourceResult;
export declare function planTextbundle(files: InspectedSourceFile[]): PlannedSourceResult;
export declare function planTextpack(bytes: Uint8Array): PlannedSourceResult;
export declare function planEvernote(bytes: Uint8Array, sourceName: string): PlannedSourceResult;
export declare function planBear(bytes: Uint8Array): PlannedSourceResult;
//# sourceMappingURL=converters.d.ts.map