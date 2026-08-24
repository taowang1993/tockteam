import type { Agent } from '@deepseek-ai/dsh-agent';
import { type PennivoReadTool, type ReadBinding, type ReadToolOutcome } from './read-tools.ts';
import { type AssistantTurnBindingRegistry } from './turn-bindings.ts';
export interface AssistantReadToolExecutor {
    execute(tool: unknown, args: unknown, binding: ReadBinding, signal: AbortSignal): Promise<ReadToolOutcome>;
}
/** Register only the reviewed, runtime-backed reads in the caller's existing DSH tool scope. */
export declare function registerAssistantReadTools(agent: Agent, executor: AssistantReadToolExecutor, turns: AssistantTurnBindingRegistry, allowedTools: readonly PennivoReadTool[]): () => void;
//# sourceMappingURL=read-tool-registration.d.ts.map