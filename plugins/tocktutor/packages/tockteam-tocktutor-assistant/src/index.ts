import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent, AgentRegistry, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type NoteVaultRuntime from 'tockbot-note-runtime'
import type { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import {
  ProposalApprovalExecutor,
  type ApprovalResult,
} from './approval.ts'
import {
  ProposalQueue,
  type ApprovalContext,
  type ProposalAuditEntry,
  type ProposalAuditStatus,
  type ProposalErrorCode,
  type ProposalSummary,
  type StageProposalInput,
} from './proposals.ts'
import { AssistantProposalStateStore } from './proposal-state.ts'
import {
  AgentContinuationRouter,
  type AgentContinuationRequest,
  type AgentContinuationResult,
} from './agent-continuation.ts'
import { registerAssistantReadTools } from './read-tool-registration.ts'
import {
  PennivoReadAdapter,
  REVIEWED_PENNIVO_READ_TOOLS,
  type PennivoReadTool,
} from './read-tools.ts'
import {
  AssistantTurnBindingError,
  AssistantTurnBindingRegistry,
  type AssistantToolName,
  type AssistantTurnLease,
} from './turn-bindings.ts'
import {
  organizedCaptureContent,
  publicTockDriverWriteResult,
  registerAssistantWriteTools,
  registerMainTockDriverWriteTools,
  type TockDriverOrganizeArguments,
  type TockDriverStageWriteArguments,
  type TockDriverWriteResult,
} from './write-tool-registration.ts'
import {
  TockTutorAssistantGateway,
  type AssistantRemoteHost,
} from './remote.ts'
import {
  PennivoChildManager,
  type PennivoBinding,
  type PennivoChildInfo,
} from './pennivo-child.ts'
import {
  ProductionAssistantTurnBinder,
  type ProductionTurnBinding,
} from './production-turns.ts'

export {
  buildAssistantPrompt,
  boundToolText,
  redactBoundaryText,
  type AssistantPrompt,
  type AssistantPromptAttachment,
  type AssistantPromptHistory,
  type AssistantPromptInput,
} from './context.ts'
export * from './agent-continuation.ts'
export * from './approval.ts'
export * from './proposals.ts'
export * from './production-turns.ts'
export * from './read-tool-registration.ts'
export * from './read-tools.ts'
export * from './remote.ts'
export * from './remote-types.ts'
export * from './text-turn.ts'
export * from './turn-bindings.ts'
export * from './write-tool-registration.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    noteAssistant: NoteAssistant
    noteVault: NoteVaultRuntime
    settings: import('@deepseek-ai/dsh-settings').SettingsProvider
    storageDomain: DomainFacility
    subprocess: SubprocessRuntime
  }
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u
const MAIN_TOCKDRIVER_BINDING = 'tockdriver-main'

export type AssistantWritePermission = 'read-only' | 'propose'

export interface BoundAssistantContinuationRequest {
  mode: AgentContinuationRequest['mode']
  text: string
}

export interface BindAssistantTurnInput {
  agent: Agent
  turnId: string
  requestId: string
  childInstanceId: string
  vaultId: string
  vaultGeneration: number
  allowedTools: readonly AssistantToolName[]
  signal: AbortSignal
  requestModelOverride?: true
}

export interface AssistantSettings {
  provider: string
  model: string
  writePermission: AssistantWritePermission
}

export type Config = AssistantSettings

export const Config: Schema<Config> = Schema.object({
  provider: Schema.string().min(1).max(128).pattern(IDENTIFIER_PATTERN).default('deepseek-official'),
  model: Schema.string().min(1).max(256).pattern(IDENTIFIER_PATTERN).default('deepseek-v4-flash'),
  writePermission: Schema.union([
    Schema.const('read-only'),
    Schema.const('propose'),
  ]).default('read-only'),
})

export const ASSISTANT_SETTINGS_NAMESPACE = 'tocktutor-assistant'

export class NoteAssistant extends Service implements AssistantRemoteHost {
  static Config = Config
  static inject = ['agents', 'noteVault', 'settings', 'storageDomain', 'subprocess', 'tools']

  private readonly agents: AgentRegistry
  private readonly noteVault: NoteVaultRuntime
  private readonly settings: SettingsScope<AssistantSettings>
  private observedSettings: AssistantSettings
  private settingsAbort = new AbortController()
  private childAbort = new AbortController()
  private readonly continuation: AgentContinuationRouter
  private readonly pennivoChild: PennivoChildManager
  private readonly readAdapter: PennivoReadAdapter
  private readonly productionTurns: ProductionAssistantTurnBinder
  private readonly turnBindings = new AssistantTurnBindingRegistry()
  private vaultBarrier: Promise<void> = Promise.resolve()
  private permissionEpoch = 0
  private proposalQueue = new ProposalQueue()
  private readonly proposalAgents = new Map<string, Agent>()
  private proposalState?: AssistantProposalStateStore
  private proposalPersistence: Promise<void> = Promise.resolve()
  private readonly decisionTasks = new Set<Promise<unknown>>()
  private decisionAdmissionOpen = true
  private mainTockDriverDispose: (() => void) | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, 'noteAssistant')
    this.agents = ctx.agents
    this.noteVault = ctx.noteVault
    this.settings = ctx.settings.register(ASSISTANT_SETTINGS_NAMESPACE, Config, { base: config })
    this.observedSettings = { ...this.settings.get() }
    this.continuation = new AgentContinuationRouter(
      ctx.agents,
      (agentId, agent) => agent.id === agentId && this.agents.get(agent.id) === agent,
    )
    this.pennivoChild = new PennivoChildManager(ctx.subprocess, {
      onInstanceChange: instanceId => {
        this.childAbort.abort(new Error('Assistant child changed.'))
        this.childAbort = new AbortController()
        this.proposalQueue.invalidateForChild(instanceId)
        this.scheduleProposalPersistence()
        this.turnBindings.invalidateChild(instanceId)
      },
    })
    this.readAdapter = new PennivoReadAdapter(ctx.noteVault, binding => this.turnBindings.isCurrent(binding))
    this.productionTurns = new ProductionAssistantTurnBinder({
      bind: (agent, turn, messageId, signal) => this.bindProductionTurn(agent, turn, messageId, signal),
      requestConfig: (agent, turn, signal, config) => this.productionRequestConfig(agent, turn, signal, config),
    })
    this.syncMainTockDriverTools()
    ctx.on('settings/updated', (namespace) => {
      if (namespace === ASSISTANT_SETTINGS_NAMESPACE) this.observeSettings(this.settings.get())
    })
    ctx.plugin(TockTutorAssistantGateway)
    ctx.on('note-vault/change', event => {
      this.turnBindings.invalidateVault(event.vault)
      this.proposalQueue.invalidateVault(event.vault)
      this.scheduleProposalPersistence()
      if (event.action !== 'activated') return
      this.productionTurns.invalidateAll()
      this.quiesceChild()
    })
    ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
      this.productionTurns.onClaimed(agent, message, turn)
    })
    ctx.on('agent/inbox/discarded', ({ agent, message }) => {
      this.productionTurns.onDiscarded(agent, message)
    })
    ctx.on('agent/pre-step', (payload, next): Promise<PreStepDecision> =>
      this.productionTurns.onPreStep(payload, next))
    ctx.on('agent/request', (payload, next): Promise<LlmCallConfig> =>
      this.productionTurns.onRequest(payload, next))
    ctx.on('agent/turn-stopping', ({ agent, turn }) => {
      this.productionTurns.onTurnStopping(agent, turn)
    })
    ctx.on('agent/status', ({ agent, status }) => {
      if (status === 'idle') {
        this.productionTurns.invalidateAgent(agent)
        this.turnBindings.invalidateAgent(agent)
      }
    })
    ctx.on('agent/disposed', ({ agent }) => {
      this.productionTurns.invalidateAgent(agent)
      this.turnBindings.invalidateAgent(agent)
    })
    ctx.effect(() => async () => {
      this.decisionAdmissionOpen = false
      this.settingsAbort.abort(new Error('Assistant settings disposed.'))
      this.childAbort.abort(new Error('Assistant child disposed.'))
      this.productionTurns.dispose()
      this.turnBindings.dispose()
      this.mainTockDriverDispose?.()
      this.mainTockDriverDispose = undefined
      await this.vaultBarrier.catch(() => undefined)
      await this.pennivoChild.dispose()
      await Promise.allSettled(this.decisionTasks)
      await this.proposalPersistence
      await this.proposalState?.close()
    }, 'tocktutor-assistant Host lifecycle')
  }

  protected async [Service.init](): Promise<void> {
    this.proposalState = await AssistantProposalStateStore.open(this.ctx.storageDomain)
    const restored = this.proposalState.load()
    this.permissionEpoch = restored.permissionEpoch
    this.proposalQueue = restored.queue
    this.proposalAgents.clear()
    await this.proposalQueue.invalidateRestored(proposal => this.restoredProposalMismatch(proposal))
    await this.persistProposalState()
  }

  continueAgent(
    request: AgentContinuationRequest,
    signal: AbortSignal,
  ): AgentContinuationResult {
    return this.continuation.route(request, signal)
  }

  continueBoundAgent(
    agent: Agent,
    request: BoundAssistantContinuationRequest,
    signal: AbortSignal,
  ): AgentContinuationResult {
    if (
      this.agents.get(agent.id) !== agent
      || (agent.status !== 'idle' && agent.status !== 'running')
    ) throw new AssistantTurnBindingError('STALE_TURN')
    return this.continuation.route(
      { ...request, agentId: agent.id },
      signal,
      (resolved, message) => this.productionTurns.reserve(resolved, message.id),
    )
  }

  bindAgentTurn(input: BindAssistantTurnInput): AssistantTurnLease {
    this.observeSettings(this.settings.get())
    const settings = this.settings.get()
    const child = this.pennivoChild.active()
    const vault = this.noteVault.state
    if (
      this.agents.get(input.agent.id) !== input.agent
      || (input.requestModelOverride !== true && (
        input.agent.options.provider !== settings.provider
        || input.agent.options.model !== settings.model
      ))
      || child === null
      || child.instanceId !== input.childInstanceId
      || child.binding.vaultId !== input.vaultId
      || child.binding.vaultGeneration !== input.vaultGeneration
      || child.binding.writePermission !== settings.writePermission
      || !vault.active
      || vault.id !== input.vaultId
      || vault.generation !== input.vaultGeneration
    ) throw new AssistantTurnBindingError('STALE_TURN')

    const { requestModelOverride: _requestModelOverride, ...bindingInput } = input
    const lease = this.turnBindings.begin({
      ...bindingInput,
      provider: settings.provider,
      model: settings.model,
      permission: settings.writePermission,
      permissionEpoch: this.permissionEpoch,
    })
    try {
      const readTools = input.allowedTools.filter((tool): tool is PennivoReadTool => (
        REVIEWED_PENNIVO_READ_TOOLS.includes(tool as PennivoReadTool) && tool !== 'list_workspaces'
      ))
      const writeTools = input.allowedTools.filter(tool => (
        tool === 'create_file'
        || tool === 'write_file'
        || tool === 'notes_stage_write'
        || tool === 'notes_organize_capture'
      ))
      if (readTools.length > 0) {
        lease.addCleanup(registerAssistantReadTools(
          input.agent,
          this.readAdapter,
          this.turnBindings,
          readTools,
        ))
      }
      if (writeTools.length > 0) {
        lease.addCleanup(registerAssistantWriteTools(
          input.agent,
          this.readAdapter,
          { stage: proposal => this.stageBoundProposal(proposal) },
          this.turnBindings,
          writeTools,
        ))
      }
      const currentChild = this.pennivoChild.active()
      const currentVault = this.noteVault.state
      const currentSettings = this.settings.get()
      if (
        currentChild === null
        || currentChild.instanceId !== input.childInstanceId
        || currentChild.binding.vaultId !== input.vaultId
        || currentChild.binding.vaultGeneration !== input.vaultGeneration
        || currentChild.binding.writePermission !== settings.writePermission
        || !currentVault.active
        || currentVault.id !== input.vaultId
        || currentVault.generation !== input.vaultGeneration
        || currentSettings.provider !== settings.provider
        || currentSettings.model !== settings.model
        || currentSettings.writePermission !== settings.writePermission
      ) throw new AssistantTurnBindingError('STALE_TURN')
      return lease
    } catch (error) {
      lease.end()
      throw error
    }
  }

  private syncMainTockDriverTools(): void {
    const enabled = this.settings.get().writePermission === 'propose'
    if (enabled && this.mainTockDriverDispose === undefined) {
      this.mainTockDriverDispose = registerMainTockDriverWriteTools(this.ctx.tools, {
        organize: (args, signal) => this.organizeMainTockDriverCapture(args, signal),
        stage: (args, signal) => this.stageMainTockDriverWrite(args, signal),
      })
    } else if (!enabled && this.mainTockDriverDispose !== undefined) {
      this.mainTockDriverDispose()
      this.mainTockDriverDispose = undefined
    }
  }

  private mainTockDriverFacts(signal: AbortSignal, vaultId?: string): {
    settings: AssistantSettings
    vault: { generation: number; id: string }
  } {
    if (signal.aborted) throw new AssistantTurnBindingError('ABORTED')
    const settings = this.settings.get()
    this.observeSettings(settings)
    const state = this.noteVault.state
    if (settings.writePermission !== 'propose' || !state.active || vaultId !== undefined && vaultId !== state.id) {
      throw new AssistantTurnBindingError('TOOL_UNAVAILABLE')
    }
    return { settings, vault: { generation: state.generation, id: state.id } }
  }

  private async stageMainTockDriverProposal(
    input: Pick<StageProposalInput, 'content' | 'destination' | 'expectedTarget' | 'operation' | 'source'>,
    facts: ReturnType<NoteAssistant['mainTockDriverFacts']>,
    signal: AbortSignal,
  ): Promise<ProposalSummary> {
    const current = this.mainTockDriverFacts(signal, facts.vault.id)
    if (current.vault.generation !== facts.vault.generation
      || current.settings.provider !== facts.settings.provider
      || current.settings.model !== facts.settings.model) throw new AssistantTurnBindingError('STALE_TURN')
    const summary = this.proposalQueue.stage({
      vaultId: facts.vault.id,
      vaultGeneration: facts.vault.generation,
      destination: input.destination,
      operation: input.operation,
      ...(input.source === undefined ? {} : { source: input.source }),
      expectedTarget: input.expectedTarget,
      content: input.content,
      childInstanceId: MAIN_TOCKDRIVER_BINDING,
      turnId: MAIN_TOCKDRIVER_BINDING,
      requestId: MAIN_TOCKDRIVER_BINDING,
      provider: facts.settings.provider,
      model: facts.settings.model,
      writePermission: 'propose',
      permissionEpoch: this.permissionEpoch,
    })
    await this.persistProposalState()
    return summary
  }

  private async stageMainTockDriverWrite(
    args: TockDriverStageWriteArguments,
    signal: AbortSignal,
  ): Promise<TockDriverWriteResult> {
    const facts = this.mainTockDriverFacts(signal, args.vaultId)
    let source: StageProposalInput['source']
    let expectedTarget: StageProposalInput['expectedTarget'] = { exists: false }
    if (args.operation === 'update') {
      const opened = await this.noteVault.openDocument(args.path, facts.vault, signal)
      if (opened.generation !== facts.vault.generation || opened.path !== args.path || !opened.digest.startsWith('sha256:')) {
        throw new Error('The Notes update source changed during staging.')
      }
      source = { relativePath: opened.path, identity: opened.revision, contentDigest: opened.digest.slice('sha256:'.length) }
      expectedTarget = { exists: true, identity: opened.revision }
    }
    const summary = await this.stageMainTockDriverProposal({
      content: args.content,
      destination: args.path,
      operation: args.operation,
      ...(source === undefined ? {} : { source }),
      expectedTarget,
    }, facts, signal)
    return publicTockDriverWriteResult(summary, { vaultId: facts.vault.id }, args.path,
      args.path.slice(args.path.lastIndexOf('/') + 1).replace(/\.(?:md|markdown)$/iu, ''), args.operation)
  }

  private async organizeMainTockDriverCapture(
    args: TockDriverOrganizeArguments,
    signal: AbortSignal,
  ): Promise<TockDriverWriteResult> {
    const facts = this.mainTockDriverFacts(signal, args.vaultId)
    const opened = await this.noteVault.openDocument(args.path, facts.vault, signal)
    if (opened.generation !== facts.vault.generation || opened.path !== args.path || !opened.digest.startsWith('sha256:')) {
      throw new Error('The Inbox capture changed during staging.')
    }
    const organized = organizedCaptureContent(args.path, opened.content, new Date())
    if (new TextEncoder().encode(organized.content).byteLength > 1024 * 1024) {
      throw new Error('The organized note exceeds the safe staging limit.')
    }
    const summary = await this.stageMainTockDriverProposal({
      content: organized.content,
      destination: organized.destination,
      operation: 'create',
      source: { relativePath: opened.path, identity: opened.revision, contentDigest: opened.digest.slice('sha256:'.length) },
      expectedTarget: { exists: false },
    }, facts, signal)
    return publicTockDriverWriteResult(summary, { vaultId: facts.vault.id }, organized.destination, organized.title, 'create')
  }

  private async stageBoundProposal(proposal: StageProposalInput): Promise<ProposalSummary> {
    this.observeSettings(this.settings.get())
    if (!this.turnBindings.isCurrentProposal({
      vaultId: proposal.vaultId,
      vaultGeneration: proposal.vaultGeneration,
      childInstanceId: proposal.childInstanceId,
      turnId: proposal.turnId,
      requestId: proposal.requestId,
      provider: proposal.provider,
      model: proposal.model,
      permission: proposal.writePermission,
      permissionEpoch: proposal.permissionEpoch,
    })) throw new AssistantTurnBindingError('STALE_TURN')
    const agent = this.turnBindings.agentForTurn(proposal.turnId)
    const summary = this.proposalQueue.stage(proposal)
    if (agent !== undefined) {
      if (this.proposalAgents.size >= 100) this.proposalAgents.clear()
      this.proposalAgents.set(summary.proposalId, agent)
    }
    await this.persistProposalState()
    return summary
  }

  private persistProposalState(): Promise<void> {
    const store = this.proposalState
    if (store === undefined) return Promise.reject(new Error('Assistant proposal state is unavailable.'))
    const serialized = this.proposalQueue.serialize()
    const permissionEpoch = this.permissionEpoch
    const operation = this.proposalPersistence.then(() =>
      store.saveSerialized(serialized, permissionEpoch))
    this.proposalPersistence = operation.catch(() => undefined)
    return operation
  }

  private scheduleProposalPersistence(): void {
    if (this.proposalState === undefined) return
    void this.persistProposalState().catch(() => undefined)
  }

  private async restoredCreateTargetExists(proposal: ProposalSummary, signal: AbortSignal): Promise<boolean> {
    const expectedVault = { id: proposal.vaultId, generation: proposal.vaultGeneration }
    const cursors = new Set<string>()
    let cursor: string | null = null
    for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
      const page = await this.noteVault.listTree({
        expectedVault,
        limit: 1_000,
        ...(cursor === null ? {} : { cursor }),
      }, signal)
      if (page.generation !== proposal.vaultGeneration
        || page.entries.some(entry => entry.path === proposal.destination)) return true
      if (page.complete && page.cursor === null) return false
      if (page.cursor === null || cursors.has(page.cursor)) return true
      cursors.add(page.cursor)
      cursor = page.cursor
    }
    return true
  }

  private async restoredProposalMismatch(proposal: ProposalSummary): Promise<ProposalErrorCode | undefined> {
    const state = this.noteVault.state
    if (
      !state.active
      || state.id !== proposal.vaultId
      || state.generation !== proposal.vaultGeneration
    ) return 'STALE_VAULT'

    const expectedVault = { id: proposal.vaultId, generation: proposal.vaultGeneration }
    const signal = new AbortController().signal
    if (proposal.source !== undefined) {
      try {
        const source = await this.noteVault.openDocument(
          proposal.source.relativePath,
          expectedVault,
          signal,
        )
        if (
          source.revision !== proposal.source.identity
          || source.digest !== `sha256:${proposal.source.contentDigest}`
        ) return 'SOURCE_CHANGED'
      } catch {
        return 'SOURCE_CHANGED'
      }
    }
    if (proposal.operation === 'create') {
      try {
        if (await this.restoredCreateTargetExists(proposal, signal)) return 'TARGET_CHANGED'
      } catch {
        return 'TARGET_CHANGED'
      }
    } else {
      try {
        const target = await this.noteVault.openDocument(proposal.destination, expectedVault, signal)
        if (target.revision !== proposal.expectedTarget.identity) return 'TARGET_CHANGED'
      } catch {
        return 'TARGET_CHANGED'
      }
    }

    const settings = this.settings.get()
    this.observeSettings(settings)
    if (
      settings.writePermission !== proposal.writePermission
      || this.permissionEpoch !== proposal.permissionEpoch
    ) return 'PERMISSION_CHANGED'
    if (settings.provider !== proposal.provider || settings.model !== proposal.model) {
      return 'PROVIDER_MISMATCH'
    }
    const mainBinding = proposal.childInstanceId === MAIN_TOCKDRIVER_BINDING
      && proposal.turnId === MAIN_TOCKDRIVER_BINDING
      && proposal.requestId === MAIN_TOCKDRIVER_BINDING
    if (mainBinding) return undefined
    if (!this.turnBindings.isCurrentProposal({
      vaultId: proposal.vaultId,
      vaultGeneration: proposal.vaultGeneration,
      childInstanceId: proposal.childInstanceId,
      turnId: proposal.turnId,
      requestId: proposal.requestId,
      provider: proposal.provider,
      model: proposal.model,
      permission: proposal.writePermission,
      permissionEpoch: proposal.permissionEpoch,
    })) return 'TURN_MISMATCH'
    if (this.pennivoChild.active()?.instanceId !== proposal.childInstanceId) return 'CHILD_REPLACED'
    return undefined
  }

  private observeSettings(next: AssistantSettings): void {
    const previous = this.observedSettings
    const providerChanged = next.provider !== previous.provider || next.model !== previous.model
    const permissionChanged = next.writePermission !== previous.writePermission
    if (!providerChanged && !permissionChanged) return
    this.observedSettings = { ...next }
    this.settingsAbort.abort(new Error('Assistant settings changed.'))
    this.settingsAbort = new AbortController()
    this.productionTurns.invalidateAll()
    if (providerChanged) {
      this.proposalQueue.invalidateProvider(next.provider, next.model)
      this.scheduleProposalPersistence()
      this.turnBindings.invalidateProvider(next.provider, next.model)
    }
    if (permissionChanged) {
      this.permissionEpoch += 1
      this.proposalQueue.invalidatePermission(next.writePermission, this.permissionEpoch)
      this.scheduleProposalPersistence()
      this.turnBindings.invalidatePermission(next.writePermission, this.permissionEpoch)
      this.quiesceChild()
    }
    this.syncMainTockDriverTools()
  }

  private quiesceChild(): Promise<void> {
    const previous = this.vaultBarrier
    const stopping = this.pennivoChild.stop()
    const quiescence = Promise.all([previous, stopping]).then(() => undefined)
    this.vaultBarrier = quiescence
    return quiescence
  }

  private assertCurrentChildBinding(binding: PennivoBinding): void {
    const state = this.noteVault.state
    const settings = this.settings.get()
    this.observeSettings(settings)
    if (
      !state.active
      || state.id !== binding.vaultId
      || state.generation !== binding.vaultGeneration
      || settings.writePermission !== binding.writePermission
    ) throw new AssistantTurnBindingError('STALE_TURN')
  }

  private async bindProductionTurn(
    agent: Agent,
    _turn: number,
    messageId: string,
    signal: AbortSignal,
  ): Promise<ProductionTurnBinding> {
    this.observeSettings(this.settings.get())
    try {
      await this.vaultBarrier
    } catch {
      throw new AssistantTurnBindingError('STALE_TURN')
    }
    if (signal.aborted || this.agents.get(agent.id) !== agent || agent.status !== 'running') {
      throw new AssistantTurnBindingError('STALE_TURN')
    }
    const settings = this.settings.get()
    const vault = this.noteVault.state
    if (!vault.active) throw new AssistantTurnBindingError('STALE_TURN')
    const child = await this.pennivoChild.ensure({
      vaultId: vault.id,
      vaultGeneration: vault.generation,
      writePermission: settings.writePermission,
    })
    const currentSettings = this.settings.get()
    this.observeSettings(currentSettings)
    const currentVault = this.noteVault.state
    if (
      signal.aborted
      || this.agents.get(agent.id) !== agent
      || agent.status !== 'running'
      || currentSettings.provider !== settings.provider
      || currentSettings.model !== settings.model
      || currentSettings.writePermission !== settings.writePermission
      || !currentVault.active
      || currentVault.id !== vault.id
      || currentVault.generation !== vault.generation
      || child.binding.vaultId !== vault.id
      || child.binding.vaultGeneration !== vault.generation
      || child.binding.writePermission !== settings.writePermission
    ) throw new AssistantTurnBindingError('STALE_TURN')
    const allowedTools: AssistantToolName[] = [
      ...REVIEWED_PENNIVO_READ_TOOLS.filter(tool => tool !== 'list_workspaces'),
      'notes_search',
      'notes_read',
      ...(settings.writePermission === 'propose'
        ? ['create_file' as const, 'write_file' as const, 'notes_stage_write' as const, 'notes_organize_capture' as const]
        : []),
    ]
    return {
      lease: this.bindAgentTurn({
        agent,
        turnId: messageId,
        requestId: messageId,
        childInstanceId: child.instanceId,
        vaultId: vault.id,
        vaultGeneration: vault.generation,
        allowedTools,
        signal,
        requestModelOverride: true,
      }),
    }
  }

  private productionRequestConfig(
    agent: Agent,
    _turn: number,
    signal: AbortSignal,
    config: LlmCallConfig,
  ): LlmCallConfig {
    this.observeSettings(this.settings.get())
    if (signal.aborted) throw new AssistantTurnBindingError('STALE_TURN')
    const binding = this.turnBindings.current(agent)
    const settings = this.settings.get()
    const child = this.pennivoChild.active()
    const vault = this.noteVault.state
    if (
      binding.provider !== settings.provider
      || binding.model !== settings.model
      || binding.permission !== settings.writePermission
      || binding.permissionEpoch !== this.permissionEpoch
      || child === null
      || child.instanceId !== binding.readBinding.childInstanceId
      || child.binding.vaultId !== binding.readBinding.vaultId
      || child.binding.vaultGeneration !== binding.readBinding.vaultGeneration
      || child.binding.writePermission !== binding.permission
      || !vault.active
      || vault.id !== binding.readBinding.vaultId
      || vault.generation !== binding.readBinding.vaultGeneration
    ) throw new AssistantTurnBindingError('STALE_TURN')
    return { ...config, provider: settings.provider, model: settings.model }
  }

  currentSettings(): AssistantSettings {
    const current = this.settings.get()
    this.observeSettings(current)
    return { ...current }
  }

  async saveSettings(settings: AssistantSettings): Promise<void> {
    await this.settings.replace(settings)
    this.observeSettings(this.settings.get())
    await this.proposalPersistence
  }

  stageProposal(input: StageProposalInput): Promise<ProposalSummary> {
    return this.stageBoundProposal(input)
  }

  async listProposals(): Promise<ProposalSummary[]> {
    const proposals = this.proposalQueue.list()
    const pending = new Set(proposals.map(proposal => proposal.proposalId))
    for (const proposalId of this.proposalAgents.keys()) {
      if (!pending.has(proposalId)) this.proposalAgents.delete(proposalId)
    }
    await this.persistProposalState()
    return proposals
  }

  async invalidateProposals(context: ApprovalContext): Promise<number> {
    const invalidated = this.proposalQueue.invalidateMismatched(context)
    await this.persistProposalState()
    return invalidated
  }

  private async ensurePennivoChild(binding: PennivoBinding): Promise<PennivoChildInfo> {
    await this.vaultBarrier
    this.assertCurrentChildBinding(binding)
    const info = await this.pennivoChild.ensure(binding)
    await this.vaultBarrier
    this.assertCurrentChildBinding(binding)
    if (
      info.binding.vaultId !== binding.vaultId
      || info.binding.vaultGeneration !== binding.vaultGeneration
      || info.binding.writePermission !== binding.writePermission
    ) throw new AssistantTurnBindingError('STALE_TURN')
    return info
  }

  private async listPennivoTools(binding: PennivoBinding): Promise<unknown> {
    await this.vaultBarrier
    this.assertCurrentChildBinding(binding)
    const tools = await this.pennivoChild.listTools(binding)
    await this.vaultBarrier
    this.assertCurrentChildBinding(binding)
    return tools
  }

  private stopPennivoChild(): Promise<void> {
    return this.quiesceChild()
  }

  private activePennivoChild(): PennivoChildInfo | null {
    return this.pennivoChild.active()
  }

  approveProposal(proposalId: string, signal: AbortSignal): Promise<ApprovalResult> {
    if (!this.decisionAdmissionOpen) {
      return Promise.reject(new Error('The assistant is unloading.'))
    }
    this.observeSettings(this.settings.get())
    const settingsSignal = this.settingsAbort.signal
    const childSignal = this.childAbort.signal
    const proposal = this.proposalQueue.list().find(candidate => candidate.proposalId === proposalId)
    const executor = new ProposalApprovalExecutor(
      this.proposalQueue,
      this.noteVault,
      () => {
        const state = this.noteVault.state
        const settings = this.settings.get()
        this.observeSettings(settings)
        const mainBinding = proposal?.childInstanceId === MAIN_TOCKDRIVER_BINDING
        return {
          vaultId: state.active ? state.id : 'inactive-vault',
          vaultGeneration: state.generation,
          childInstanceId: mainBinding ? MAIN_TOCKDRIVER_BINDING : this.pennivoChild.active()?.instanceId ?? 'missing-child',
          turnId: mainBinding ? MAIN_TOCKDRIVER_BINDING : proposal?.turnId ?? 'missing-turn',
          requestId: mainBinding ? MAIN_TOCKDRIVER_BINDING : proposal?.requestId ?? 'missing-request',
          provider: settings.provider,
          model: settings.model,
          writePermission: settings.writePermission,
          permissionEpoch: this.permissionEpoch,
        }
      },
      () => this.persistProposalState(),
    )
    const decisionSignal = proposal?.childInstanceId === MAIN_TOCKDRIVER_BINDING
      ? AbortSignal.any([signal, settingsSignal])
      : AbortSignal.any([signal, settingsSignal, childSignal])
    const task = executor.approve(proposalId, decisionSignal).then(result => {
      const agent = this.proposalAgents.get(proposalId)
      this.proposalAgents.delete(proposalId)
      if (agent !== undefined && !decisionSignal.aborted) {
        try {
          this.continueBoundAgent(agent, {
            mode: 'followup',
            text: `TockTutor write proposal ${proposalId} was approved with status ${result.status}.`,
          }, decisionSignal)
        } catch { /* A stale originating Agent does not roll back an approved vault write. */ }
      }
      return result
    })
    this.decisionTasks.add(task)
    return task.finally(() => { this.decisionTasks.delete(task) })
  }

  rejectProposal(
    proposalId: string,
    reason: string,
  ): Promise<Pick<ProposalSummary, 'proposalId' | 'auditCorrelationId'>> {
    if (!this.decisionAdmissionOpen) {
      return Promise.reject(new Error('The assistant is unloading.'))
    }
    const task = (async () => {
      const result = this.proposalQueue.reject(proposalId, reason)
      await this.persistProposalState()
      const agent = this.proposalAgents.get(proposalId)
      this.proposalAgents.delete(proposalId)
      if (agent !== undefined) {
        try {
          this.continueBoundAgent(agent, {
            mode: 'followup',
            text: `TockTutor write proposal ${proposalId} was rejected by the user.`,
          }, new AbortController().signal)
        } catch { /* A stale originating Agent has nothing left to resume. */ }
      }
      return result
    })()
    this.decisionTasks.add(task)
    return task.finally(() => { this.decisionTasks.delete(task) })
  }

  async proposalAudit(): Promise<ProposalAuditEntry[]> {
    await this.proposalPersistence
    return this.proposalQueue.audit()
  }

  async proposalAuditStatus(): Promise<ProposalAuditStatus> {
    await this.proposalPersistence
    return this.proposalQueue.auditStatus()
  }
}

export default NoteAssistant
