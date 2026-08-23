export interface AssistantPromptHistory {
    role: 'user' | 'assistant';
    content: string;
}
export interface AssistantPromptAttachment {
    relativePath: string;
    markdown: string;
}
export interface AssistantPromptInput {
    message: string;
    history?: AssistantPromptHistory[];
    attachments?: AssistantPromptAttachment[];
}
export interface AssistantPrompt {
    system: string;
    user: string;
}
export declare function assertSafeRelativePath(value: string, field?: string): void;
/** Remove path and credential-shaped data before text crosses a model or browser boundary. */
export declare function redactBoundaryText(value: string): string;
/** Bound one already-serialized tool argument/result before display or model reuse. */
export declare function boundToolText(value: string, limit: number): string;
/** Assemble one deterministic bounded provider request without creating an Agent. */
export declare function buildAssistantPrompt(input: AssistantPromptInput): AssistantPrompt;
//# sourceMappingURL=context.d.ts.map