import { Buffer } from 'node:buffer'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assertSafeRelativePath } from './context.ts'
import {
  ProposalError,
  type ProposalSummary,
  type StageProposalInput,
} from './proposals.ts'
import type { AssistantReadToolExecutor } from './read-tool-registration.ts'
import { ReadToolError } from './read-tools.ts'
import {
  AssistantTurnBindingError,
  type AssistantTurnBindingRegistry,
  type AssistantToolName,
} from './turn-bindings.ts'

const MAX_CONTENT_CHARS = 1024 * 1024
const MAX_CONTENT_BYTES = 1024 * 1024
const WRITE_TOOLS = new Set<AssistantToolName>(['create_file', 'write_file'])
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    proposalId: { type: 'string', required: true },
    auditCorrelationId: { type: 'string', required: true },
    operation: { type: 'string', enum: ['create', 'update'], required: true },
    path: { type: 'string', required: true },
    status: { type: 'string', const: 'staged', required: true },
  },
  additionalProperties: false,
} as const

export interface AssistantProposalStager {
  stage(input: StageProposalInput): Promise<Pick<ProposalSummary, 'proposalId' | 'auditCorrelationId'>>
}

function writeArguments(value: unknown): { path: string; content: string } {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.keys(value).some(key => key !== 'path' && key !== 'content')
  ) throw new Error('The staged write arguments are invalid.')
  const args = value as Record<string, unknown>
  if (
    typeof args.path !== 'string'
    || !/\.(?:md|markdown)$/iu.test(args.path)
    || typeof args.content !== 'string'
    || args.content.length > MAX_CONTENT_CHARS
    || Buffer.byteLength(args.content, 'utf8') > MAX_CONTENT_BYTES
  ) throw new Error('The staged write arguments are invalid.')
  try {
    assertSafeRelativePath(args.path)
  } catch {
    throw new Error('The staged write arguments are invalid.')
  }
  return { path: args.path, content: args.content }
}

export function registerAssistantWriteTools(
  agent: Agent,
  reader: AssistantReadToolExecutor,
  stager: AssistantProposalStager,
  turns: AssistantTurnBindingRegistry,
  allowedTools: readonly AssistantToolName[],
): () => void {
  const allowed = new Set(allowedTools)
  if (
    allowed.size === 0
    || allowed.size !== allowedTools.length
    || [...allowed].some(tool => !WRITE_TOOLS.has(tool))
  ) throw new TypeError('allowedTools must contain unique supported staged writes')

  const disposers: Array<() => void> = []
  try {
    for (const name of ['create_file', 'write_file'] as const) {
      if (!allowed.has(name)) continue
      const operation: 'create' | 'update' = name === 'create_file' ? 'create' : 'update'
      disposers.push(agent.ctx.tools.register(defineTool({
        name,
        description: operation === 'create'
          ? 'Stage creation of a new Markdown file for explicit user approval.'
          : 'Stage replacement of an existing Markdown file for explicit user approval.',
        parameters: {
          path: { type: 'string', required: true, description: 'Vault-relative Markdown path.' },
          content: { type: 'string', required: true, description: 'Complete proposed Markdown content.' },
        },
        output: {
          schema: OUTPUT_SCHEMA,
          render: (_args, value) => [{
            type: 'text',
            text: `Staged ${value.operation} proposal for ${value.path}. User approval is required.`,
          }],
        },
        async execute(rawArgs, exec) {
          try {
            const args = writeArguments(rawArgs)
            const turn = turns.resolve({
              ...exec.agent === undefined ? {} : { agent: exec.agent },
              callId: exec.callId,
              signal: exec.signal,
              tool: name,
            })
            if (turn.permission !== 'propose') throw new AssistantTurnBindingError('TOOL_UNAVAILABLE')
            let source: StageProposalInput['source']
            let expectedTarget: StageProposalInput['expectedTarget'] = { exists: false }
            if (operation === 'update') {
              const read = await reader.execute('read_file', { path: args.path }, turn.readBinding, exec.signal)
              if (
                read.source === null
                || read.source.path !== args.path
                || read.source.generation !== turn.readBinding.vaultGeneration
                || !read.source.digest.startsWith('sha256:')
              ) throw new ReadToolError('INVALID_RESULT', 'The note runtime returned an invalid bounded result.')
              source = {
                relativePath: read.source.path,
                identity: read.source.revision,
                contentDigest: read.source.digest.slice('sha256:'.length),
              }
              expectedTarget = { exists: true, identity: read.source.revision }
            }
            if (exec.signal.aborted) throw new AssistantTurnBindingError('ABORTED')
            if (!turns.isCurrent(turn.readBinding)) throw new AssistantTurnBindingError('STALE_TURN')
            const summary = await stager.stage({
              vaultId: turn.readBinding.vaultId,
              vaultGeneration: turn.readBinding.vaultGeneration,
              destination: args.path,
              operation,
              ...source === undefined ? {} : { source },
              expectedTarget,
              content: args.content,
              childInstanceId: turn.readBinding.childInstanceId,
              turnId: turn.readBinding.turnId,
              requestId: turn.requestId,
              provider: turn.provider,
              model: turn.model,
              writePermission: turn.permission,
              permissionEpoch: turn.permissionEpoch,
            })
            return {
              proposalId: summary.proposalId,
              auditCorrelationId: summary.auditCorrelationId,
              operation,
              path: args.path,
              status: 'staged' as const,
            }
          } catch (error) {
            if (
              error instanceof AssistantTurnBindingError
              || error instanceof ProposalError
              || error instanceof ReadToolError
              || (error instanceof Error && error.message === 'The staged write arguments are invalid.')
            ) throw error
            throw new Error('The staged write tool could not complete safely.')
          }
        },
      })))
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
