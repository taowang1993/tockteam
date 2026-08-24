import { Buffer } from 'node:buffer'
import { z } from 'zod'
import {
  defineDomain,
  type Domain,
  type DomainFacility,
} from '@deepseek-ai/dsh-storage-domain'
import { ProposalQueue, type ProposalQueueOptions } from './proposals.ts'

const MAX_QUEUE_BYTES = 8 * 1024 * 1024
export const MAX_PROPOSAL_STATE_BYTES = MAX_QUEUE_BYTES + 1_024
const EMPTY_QUEUE = '{"version":1,"proposals":[],"audits":[],"auditDropped":0}'

const proposalStateSchema = z.object({
  permissionEpoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  queue: z.string().max(MAX_QUEUE_BYTES),
}).strict().refine(
  value => Buffer.byteLength(value.queue, 'utf8') <= MAX_QUEUE_BYTES,
  { message: 'assistant proposal queue exceeds its persisted byte bound' },
)

export const assistantProposalStateSpec = defineDomain({
  name: 'tocktutor_assistant',
  version: 1,
  global: {
    schema: proposalStateSchema,
    initial: { permissionEpoch: 0, queue: EMPTY_QUEUE },
  },
  tables: {},
})

type AssistantProposalDomain = Domain<typeof assistantProposalStateSpec>

export class AssistantProposalStateStore {
  private readonly domain: AssistantProposalDomain
  private state: z.infer<typeof proposalStateSchema>
  private readonly queueOptions: ProposalQueueOptions
  private closed = false

  private constructor(
    domain: AssistantProposalDomain,
    state: z.infer<typeof proposalStateSchema>,
    queueOptions: ProposalQueueOptions,
  ) {
    this.domain = domain
    this.state = state
    this.queueOptions = queueOptions
  }

  static async open(
    facility: DomainFacility,
    queueOptions: ProposalQueueOptions = {},
  ): Promise<AssistantProposalStateStore> {
    const domain = await facility.open(assistantProposalStateSpec)
    try {
      const state = domain.global.get()
      ProposalQueue.hydrate(state.queue, queueOptions)
      return new AssistantProposalStateStore(domain, state, queueOptions)
    } catch (error) {
      await domain.close()
      throw error
    }
  }

  load(): { permissionEpoch: number; queue: ProposalQueue } {
    return {
      permissionEpoch: this.state.permissionEpoch,
      queue: ProposalQueue.hydrate(this.state.queue, this.queueOptions),
    }
  }

  save(queue: ProposalQueue, permissionEpoch: number): Promise<void> {
    return this.saveSerialized(queue.serialize(), permissionEpoch)
  }

  async saveSerialized(queue: string, permissionEpoch: number): Promise<void> {
    if (this.closed) throw new Error('assistant proposal state store is closed')
    const state = proposalStateSchema.parse({ permissionEpoch, queue })
    await this.domain.global.set(state)
    this.state = state
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.domain.close()
  }
}
