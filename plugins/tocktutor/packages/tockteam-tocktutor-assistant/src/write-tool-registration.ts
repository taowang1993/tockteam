import { Buffer } from 'node:buffer'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assertSafeRelativePath } from './context.ts'
import {
  ProposalError,
  type ProposalSummary,
  type StageProposalInput,
} from './proposals.ts'
import type {
  AssistantReadDocument,
  AssistantReadToolExecutor,
} from './read-tool-registration.ts'
import { ReadToolError } from './read-tools.ts'
import {
  AssistantTurnBindingError,
  type AssistantTurnBindingRegistry,
  type AssistantToolName,
} from './turn-bindings.ts'

const MAX_CONTENT_CHARS = 1024 * 1024
const MAX_CONTENT_BYTES = 1024 * 1024
const MAX_CAPTURE_TITLE_CHARS = 256
const WRITE_TOOLS = new Set<AssistantToolName>([
  'create_file',
  'write_file',
  'notes_stage_write',
  'notes_organize_capture',
])
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
  stage(input: StageProposalInput): Promise<Pick<ProposalSummary, 'proposalId' | 'auditCorrelationId'> & Partial<Pick<ProposalSummary, 'createdAt'>>>
}

export interface TockDriverWriteResult {
  id: string
  status: 'pending_review'
  source: 'tockdriver'
  approvalQueue: 'tockdriver-notes'
  inlineAssistantMcp: false
  vaultId: string
  relativePath: string
  title: string
  operation: 'create' | 'update'
  createdAt: number
}

const TOCKDRIVER_WRITE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', required: true },
    status: { type: 'string', const: 'pending_review', required: true },
    source: { type: 'string', const: 'tockdriver', required: true },
    approvalQueue: { type: 'string', const: 'tockdriver-notes', required: true },
    inlineAssistantMcp: { type: 'boolean', const: false, required: true },
    vaultId: { type: 'string', required: true },
    relativePath: { type: 'string', required: true },
    title: { type: 'string', required: true },
    operation: { type: 'string', enum: ['create', 'update'], required: true },
    createdAt: { type: 'integer', required: true },
  },
  additionalProperties: false,
} as const

class TockDriverWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TockDriverWriteError'
  }
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
  if (args.content.includes('\0')) throw new Error('The staged write arguments are invalid.')
  return { path: args.path, content: args.content }
}

function notesWriteArguments(value: unknown): {
  vaultId: string
  path: string
  content: string
  operation: 'create' | 'update'
} {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.keys(value).some(key => !['vaultId', 'path', 'content', 'operation'].includes(key))
  ) throw new TockDriverWriteError('The TockDriver write arguments are invalid.')
  const args = value as Record<string, unknown>
  if (
    typeof args.vaultId !== 'string'
    || args.vaultId.length < 8
    || args.vaultId.length > 256
    || typeof args.path !== 'string'
    || typeof args.content !== 'string'
    || (args.operation !== 'create' && args.operation !== 'update')
  ) throw new TockDriverWriteError('The TockDriver write arguments are invalid.')
  try {
    assertSafeRelativePath(args.path)
  } catch {
    throw new TockDriverWriteError('The TockDriver write arguments are invalid.')
  }
  if (
    !/\.(?:md|markdown)$/iu.test(args.path)
    || args.content.length > MAX_CONTENT_CHARS
    || Buffer.byteLength(args.content, 'utf8') > MAX_CONTENT_BYTES
    || args.content.includes('\0')
  ) throw new TockDriverWriteError('The TockDriver write arguments are invalid.')
  return {
    vaultId: args.vaultId,
    path: args.path,
    content: args.content,
    operation: args.operation,
  }
}

function organizeCaptureArguments(value: unknown): { vaultId: string; path: string } {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.keys(value).some(key => key !== 'vaultId' && key !== 'path')
  ) throw new TockDriverWriteError('The TockDriver capture arguments are invalid.')
  const args = value as Record<string, unknown>
  if (
    typeof args.vaultId !== 'string'
    || args.vaultId.length < 8
    || args.vaultId.length > 256
    || typeof args.path !== 'string'
    || !/^Inbox\/.+\.(?:md|markdown)$/u.test(args.path)
  ) throw new TockDriverWriteError('The TockDriver capture arguments are invalid.')
  try {
    assertSafeRelativePath(args.path)
  } catch {
    throw new TockDriverWriteError('The TockDriver capture arguments are invalid.')
  }
  return { vaultId: args.vaultId, path: args.path }
}

function titleFromPath(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf('/') + 1).replace(/\.(?:md|markdown)$/iu, '')
}

function captureTitle(relativePath: string, markdown: string): string {
  const heading = markdown.match(/^#\s+(.+)$/mu)?.[1]?.trim()
  if (!heading) return titleFromPath(relativePath)
  return heading.slice(0, MAX_CAPTURE_TITLE_CHARS)
}

function stripFirstHeading(markdown: string): string {
  let removed = false
  return markdown.split(/\r?\n/u).filter(line => {
    if (!removed && /^#\s+/u.test(line)) {
      removed = true
      return false
    }
    return true
  }).join('\n').trim()
}

function firstMeaningfulLine(markdown: string): string | undefined {
  return markdown.split(/\r?\n/u)
    .map(line => line.trim())
    .find(line => line !== '' && !/^#+\s/u.test(line) && !/^[-*+]\s*$/u.test(line))
}

function dateStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\.(?:md|markdown)$/iu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64) || 'organized-capture'
}

function organizedCaptureContent(
  sourcePath: string,
  sourceMarkdown: string,
  organizedAt: Date,
): { title: string; destination: string; content: string } {
  const title = captureTitle(sourcePath, sourceMarkdown)
  const body = stripFirstHeading(sourceMarkdown)
  const summary = firstMeaningfulLine(body) ?? title
  const destination = `Organized/${dateStamp(organizedAt)}-${slug(title)}.md`
  const sourceLink = `../${sourcePath}`
  return {
    title,
    destination,
    content: [
      `# ${title}`,
      '',
      `> Organized from [${sourcePath}](${sourceLink}) on ${dateStamp(organizedAt)}.`,
      '',
      '## Summary',
      '',
      summary,
      '',
      '## Notes',
      '',
      body || summary,
      '',
      '## Source',
      '',
      `- [${sourcePath}](${sourceLink})`,
      '',
    ].join('\n'),
  }
}

async function readDocumentForWrite(
  reader: AssistantReadToolExecutor,
  path: string,
  binding: Parameters<AssistantReadToolExecutor['execute']>[2],
  signal: AbortSignal,
): Promise<AssistantReadDocument> {
  if (reader.readDocument !== undefined) return reader.readDocument(path, binding, signal)
  const read = await reader.execute('read_file', { path }, binding, signal)
  if (read.truncated || read.source === null) {
    throw new ReadToolError('RESULT_TOO_LARGE', 'The note runtime returned an incomplete bounded source.')
  }
  const content = read.result.content[0]?.text
  if (typeof content !== 'string') throw new ReadToolError('INVALID_RESULT', 'The note runtime returned an invalid bounded result.')
  return { content, source: read.source }
}

function publicTockDriverWriteResult(
  summary: Pick<ProposalSummary, 'proposalId'> & Partial<Pick<ProposalSummary, 'createdAt'>>,
  binding: { vaultId: string },
  path: string,
  title: string,
  operation: 'create' | 'update',
): TockDriverWriteResult {
  return {
    id: summary.proposalId,
    status: 'pending_review',
    source: 'tockdriver',
    approvalQueue: 'tockdriver-notes',
    inlineAssistantMcp: false,
    vaultId: binding.vaultId,
    relativePath: path,
    title,
    operation,
    createdAt: summary.createdAt ?? Date.now(),
  }
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

    if (allowed.has('notes_stage_write')) {
      disposers.push(agent.ctx.tools.register(defineTool({
        name: 'notes_stage_write',
        description: 'Stage a TockDriver note create or update for explicit user approval. This never writes before approval.',
        parameters: {
          vaultId: { type: 'string', required: true, description: 'Opaque id of the active Notes vault.' },
          path: { type: 'string', required: true, description: 'Vault-relative Markdown path.' },
          content: { type: 'string', required: true, description: 'Complete proposed Markdown content.' },
          operation: { type: 'string', required: true, enum: ['create', 'update'] },
        },
        output: {
          schema: TOCKDRIVER_WRITE_OUTPUT_SCHEMA,
          render: (_args, value) => [{
            type: 'text',
            text: `Staged ${value.operation} proposal for ${value.relativePath}. User approval is required.`,
          }],
        },
        async execute(rawArgs, exec) {
          try {
            const args = notesWriteArguments(rawArgs)
            const turn = turns.resolve({
              ...exec.agent === undefined ? {} : { agent: exec.agent },
              callId: exec.callId,
              signal: exec.signal,
              tool: 'notes_stage_write',
            })
            if (turn.permission !== 'propose' || args.vaultId !== turn.readBinding.vaultId) {
              throw new AssistantTurnBindingError('TOOL_UNAVAILABLE')
            }
            let source: StageProposalInput['source']
            let expectedTarget: StageProposalInput['expectedTarget'] = { exists: false }
            if (args.operation === 'update') {
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
              operation: args.operation,
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
            return publicTockDriverWriteResult(summary, turn.readBinding, args.path, titleFromPath(args.path), args.operation)
          } catch (error) {
            if (error instanceof TockDriverWriteError) throw error
            if (
              error instanceof AssistantTurnBindingError
              || error instanceof ProposalError
              || error instanceof ReadToolError
            ) throw error
            throw new Error('The TockDriver note write could not complete safely.')
          }
        },
      })))
    }

    if (allowed.has('notes_organize_capture')) {
      disposers.push(agent.ctx.tools.register(defineTool({
        name: 'notes_organize_capture',
        description: 'Stage an organized Markdown note from an Inbox capture for explicit user approval. This never writes before approval.',
        parameters: {
          vaultId: { type: 'string', required: true, description: 'Opaque id of the active Notes vault.' },
          path: { type: 'string', required: true, description: 'Vault-relative Inbox Markdown path.' },
        },
        output: {
          schema: TOCKDRIVER_WRITE_OUTPUT_SCHEMA,
          render: (_args, value) => [{
            type: 'text',
            text: `Staged organized note for ${value.relativePath}. User approval is required.`,
          }],
        },
        async execute(rawArgs, exec) {
          try {
            const args = organizeCaptureArguments(rawArgs)
            const turn = turns.resolve({
              ...exec.agent === undefined ? {} : { agent: exec.agent },
              callId: exec.callId,
              signal: exec.signal,
              tool: 'notes_organize_capture',
            })
            if (turn.permission !== 'propose' || args.vaultId !== turn.readBinding.vaultId) {
              throw new AssistantTurnBindingError('TOOL_UNAVAILABLE')
            }
            const read = await readDocumentForWrite(reader, args.path, turn.readBinding, exec.signal)
            if (
              read.source === null
              || read.source.path !== args.path
              || read.source.generation !== turn.readBinding.vaultGeneration
              || !read.source.digest.startsWith('sha256:')
              || read.content.includes('\0')
            ) throw new ReadToolError('INVALID_RESULT', 'The note runtime returned an invalid bounded result.')
            const organized = organizedCaptureContent(args.path, read.content, new Date())
            if (organized.content.length > MAX_CONTENT_CHARS || Buffer.byteLength(organized.content, 'utf8') > MAX_CONTENT_BYTES) {
              throw new ReadToolError('RESULT_TOO_LARGE', 'The organized note exceeds the safe write limit.')
            }
            if (exec.signal.aborted) throw new AssistantTurnBindingError('ABORTED')
            if (!turns.isCurrent(turn.readBinding)) throw new AssistantTurnBindingError('STALE_TURN')
            const summary = await stager.stage({
              vaultId: turn.readBinding.vaultId,
              vaultGeneration: turn.readBinding.vaultGeneration,
              destination: organized.destination,
              operation: 'create',
              source: {
                relativePath: read.source.path,
                identity: read.source.revision,
                contentDigest: read.source.digest.slice('sha256:'.length),
              },
              expectedTarget: { exists: false },
              content: organized.content,
              childInstanceId: turn.readBinding.childInstanceId,
              turnId: turn.readBinding.turnId,
              requestId: turn.requestId,
              provider: turn.provider,
              model: turn.model,
              writePermission: turn.permission,
              permissionEpoch: turn.permissionEpoch,
            })
            return publicTockDriverWriteResult(summary, turn.readBinding, organized.destination, organized.title, 'create')
          } catch (error) {
            if (error instanceof TockDriverWriteError) throw error
            if (
              error instanceof AssistantTurnBindingError
              || error instanceof ProposalError
              || error instanceof ReadToolError
            ) throw error
            throw new Error('The TockDriver capture organization could not complete safely.')
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
