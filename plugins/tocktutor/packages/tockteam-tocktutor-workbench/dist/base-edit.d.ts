import { type BaseHydratedFile } from './base-query.ts';
import { type PropertyValue } from './properties.ts';
export interface ExecutableBaseFrontmatterEditRequest {
    expectedPropertyIdentity: string;
    expectedRevision: string;
    operation: 'base-frontmatter';
    path: string;
    previousSource: string;
    previousValue: PropertyValue;
    property: string;
    source: string;
    value: Exclude<PropertyValue, string[] | null>;
}
export declare function executableBasePropertyIdentity(property: string, value: PropertyValue): string;
/** Stage one source-preserving note-property edit with exact revision and rollback source. */
export declare function createExecutableBaseFrontmatterEdit(file: BaseHydratedFile, column: string, rawValue: string): ExecutableBaseFrontmatterEditRequest | null;
//# sourceMappingURL=base-edit.d.ts.map