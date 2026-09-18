import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  defineTool,
  type ParameterSchemaSpec,
  type ToolDefinition,
} from '@deepseek-ai/dsh-tools'
import {
  ReadToolError,
  type PennivoReadTool,
  type ReadBinding,
  type ReadToolOutcome,
} from './read-tools.ts'
import {
  AssistantTurnBindingError,
  type AssistantTurnBindingRegistry,
} from './turn-bindings.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', required: true },
    truncated: { type: 'boolean', required: true },
  },
  additionalProperties: false,
} as const

interface ReadToolSpec {
  name: Exclude<PennivoReadTool, 'list_workspaces'>
  description: string
  parameters: ParameterSchemaSpec
}

const PATH = { type: 'string', required: true } as const

const READ_TOOL_SPECS: readonly ReadToolSpec[] = [
  {
    name: 'list_files',
    description: 'List bounded Markdown files and folders using vault-relative paths.',
    parameters: {
      path: { type: 'string', description: 'Optional vault-relative folder.' },
      recursive: { type: 'boolean', description: 'Include nested children.' },
    },
  },
  {
    name: 'read_file',
    description: 'Read one bounded Markdown file using a vault-relative path.',
    parameters: { path: PATH },
  },
  {
    name: 'search',
    description: 'Search bounded Markdown content for whitespace-separated terms.',
    parameters: {
      query: { type: 'string', required: true },
      scope: { type: 'string', description: 'Optional vault-relative folder.' },
      caseSensitive: { type: 'boolean' },
      wholeWord: { type: 'boolean' },
      regex: { type: 'boolean' },
    },
  },
  {
    name: 'find_backlinks',
    description: 'Find bounded Markdown files that link to one vault-relative path.',
    parameters: { path: PATH },
  },
  {
    name: 'get_outline',
    description: 'Get the bounded heading outline of one Markdown file.',
    parameters: { path: PATH },
  },
  {
    name: 'list_snapshots',
    description: 'List bounded recovery snapshot metadata for one Markdown file.',
    parameters: { path: PATH },
  },
  {
    name: 'list_trash',
    description: 'List bounded soft-delete metadata for the active vault.',
    parameters: {},
  },
]

export interface AssistantReadDocument {
  readonly content: string
  readonly source: ReadToolOutcome['source']
}

export interface AssistantReadToolExecutor {
  execute(
    tool: unknown,
    args: unknown,
    binding: ReadBinding,
    signal: AbortSignal,
  ): Promise<ReadToolOutcome>
  /** Host-private full bounded content for transformations that are not model reads. */
  readDocument?(
    path: string,
    binding: ReadBinding,
    signal: AbortSignal,
  ): Promise<AssistantReadDocument>
}

function definition(
  spec: ReadToolSpec,
  executor: AssistantReadToolExecutor,
  turns: AssistantTurnBindingRegistry,
): ToolDefinition {
  return defineTool({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      try {
        const turn = turns.resolve({
          ...exec.agent === undefined ? {} : { agent: exec.agent },
          callId: exec.callId,
          signal: exec.signal,
          tool: spec.name,
        })
        const outcome = await executor.execute(spec.name, args, turn.readBinding, exec.signal)
        return {
          text: outcome.result.content[0].text,
          truncated: outcome.truncated,
        }
      } catch (error) {
        if (error instanceof AssistantTurnBindingError || error instanceof ReadToolError) throw error
        throw new Error('The assistant read tool could not complete safely.')
      }
    },
  })
}

/** Register only the reviewed, runtime-backed reads in the caller's existing DSH tool scope. */
export function registerAssistantReadTools(
  agent: Agent,
  executor: AssistantReadToolExecutor,
  turns: AssistantTurnBindingRegistry,
  allowedTools: readonly PennivoReadTool[],
): () => void {
  const allowed = new Set(allowedTools)
  if (
    allowed.size === 0
    || allowed.size !== allowedTools.length
    || [...allowed].some(tool => !READ_TOOL_SPECS.some(spec => spec.name === tool))
  ) throw new TypeError('allowedTools must contain unique supported assistant reads')
  const tools = agent.ctx.tools
  const disposers: Array<() => void> = []
  try {
    for (const spec of READ_TOOL_SPECS) {
      if (allowed.has(spec.name)) disposers.push(tools.register(definition(spec, executor, turns)))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const dispose of disposers.reverse()) dispose()
  }
}
