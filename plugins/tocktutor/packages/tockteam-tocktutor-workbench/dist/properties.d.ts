export type PropertyType = 'text' | 'list' | 'number' | 'checkbox' | 'date' | 'datetime' | 'mixed';
export type PropertyValue = string | string[] | number | boolean | null;
export interface FrontmatterProperty {
    key: string;
    type: PropertyType;
    value: PropertyValue;
}
export interface PropertyRenameFile {
    path: string;
    revision: string;
    source: string;
}
export interface PropertyRenameWrite extends PropertyRenameFile {
    nextSource: string;
}
export interface PropertyRenameOperations {
    save(file: PropertyRenameWrite): Promise<{
        revision: string;
    }>;
    rollback(file: PropertyRenameWrite & {
        savedRevision: string;
    }): Promise<void>;
}
export type PropertyRenameResult = {
    status: 'saved';
    paths: string[];
} | {
    status: 'rolled-back';
    paths: string[];
} | {
    status: 'partial';
    paths: string[];
    rollbackFailures: string[];
};
export declare function inferPropertyType(value: unknown): PropertyType;
export declare function parseFrontmatterProperties(source: string): FrontmatterProperty[];
export declare function setFrontmatterProperty(source: string, key: string, value: PropertyValue): string;
export declare function renameFrontmatterProperty(source: string, from: string, to: string): string;
export declare function renamePropertiesRecoverably(files: readonly PropertyRenameFile[], from: string, to: string, operations: PropertyRenameOperations): Promise<PropertyRenameResult>;
//# sourceMappingURL=properties.d.ts.map