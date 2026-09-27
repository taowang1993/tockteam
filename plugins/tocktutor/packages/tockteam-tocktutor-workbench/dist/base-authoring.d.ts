import { type ExecutableBaseViewDefinition } from './base-parser.ts';
/** Replace only one bounded view field; refuse ambiguous or unsupported source. */
export declare function setBaseViewField(source: string, viewName: string, field: 'sort' | 'filters' | 'order' | 'name' | 'limit' | 'type' | 'rowHeight', value: string | readonly string[]): string | null;
export declare function appendBaseView(source: string, kind: ExecutableBaseViewDefinition['type'], name: string): string | null;
//# sourceMappingURL=base-authoring.d.ts.map