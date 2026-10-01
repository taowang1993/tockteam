export interface PropertySuggestions {
    names: readonly string[];
    tags: readonly string[];
    status: 'idle' | 'loading' | 'ready' | 'error';
    incomplete: boolean;
    onRetry(): void;
}
/** Suggestions are optional; the ordinary input always accepts free-form values. */
export declare function PropertySuggestionMenu(props: {
    label: string;
    suggestions: PropertySuggestions;
    items: readonly string[];
    value: string;
    onSelect(value: string): boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=property-suggestions.d.ts.map