import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry, { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SubprocessRuntime, {
  type SubprocessHandle,
  type SubprocessSpawnSpec,
  type SubprocessTerminalHandle,
  type SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import NoteVaultRuntime, { Config as RuntimeConfig } from 'tockbot-note-runtime'
import NoteAssistant, { Config, TockTutorAssistantGateway } from '../src/index.ts'
import type { PennivoBinding, PennivoChildInfo } from '../src/pennivo-child.ts'
import { apply as applyClient } from '../lib/client.js'

const packageName = '@tockteam/tocktutor-assistant'

interface NoteAssistantInternals {
  ensurePennivoChild(binding: PennivoBinding): Promise<PennivoChildInfo>
  listPennivoTools(binding: PennivoBinding): Promise<unknown>
  stopPennivoChild(): Promise<void>
  activePennivoChild(): PennivoChildInfo | null
}

function assistantInternals(assistant: NoteAssistant): NoteAssistantInternals {
  return assistant as unknown as NoteAssistantInternals
}

class MemorySubprocess extends SubprocessRuntime {
  resolveExecutable(command: string): Promise<string> {
    return Promise.resolve(command)
  }

  spawn(_spec: SubprocessSpawnSpec): SubprocessHandle {
    throw new Error('unexpected child spawn')
  }

  spawnTerminal(_spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    return Promise.reject(new Error('unexpected terminal spawn'))
  }
}

let stagingSequence = 0

async function stageBoundCreate(
  context: Context,
  input: {
    childInstanceId: string
    content: string
    destination: string
    vaultGeneration: number
    vaultId: string
  },
): Promise<{
  proposal: Awaited<ReturnType<NoteAssistant['listProposals']>>[number]
  dispose(): void
}> {
  const sequence = ++stagingSequence
  const agentContext = context.extend()
  const agentId = `agent-stage-${String(sequence).padStart(8, '0')}`
  const agent = {
    id: agentId,
    ctx: agentContext,
    options: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    session: { id: agentId },
    status: 'running',
  } as unknown as Agent
  Object.defineProperty(agentContext, 'agent', { configurable: true, value: agent })
  const unregister = context.agents.register(agent)
  const lease = context.noteAssistant.bindAgentTurn({
    agent,
    turnId: `turn-stage-${String(sequence).padStart(8, '0')}`,
    requestId: `request-stage-${String(sequence).padStart(8, '0')}`,
    childInstanceId: input.childInstanceId,
    vaultId: input.vaultId,
    vaultGeneration: input.vaultGeneration,
    allowedTools: ['create_file'],
    signal: new AbortController().signal,
  })
  const result = await context.tools.execute({
    agent,
    arguments: { path: input.destination, content: input.content },
    callId: CallId(`call-stage-${String(sequence).padStart(8, '0')}`),
    name: 'create_file',
    signal: new AbortController().signal,
  })
  assert.equal(result.isError, false)
  const proposal = (await context.noteAssistant.listProposals())
    .find(candidate => candidate.destination === input.destination)
  assert.ok(proposal)
  return {
    proposal,
    dispose() {
      lease.end()
      unregister()
    },
  }
}

class MemorySettings extends SettingsProvider {
  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve({})
  }

  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

async function load(realSubprocess = false, existingRoot?: string): Promise<{
  context: Context
  root: string
  agentsFiber: Fiber
  runtimeFiber: Fiber
  toolsFiber: Fiber
}> {
  const root = existingRoot ?? await mkdtemp(join(tmpdir(), 'tocktutor-assistant-'))
  const configPath = join(root, 'cordis.yml')
  const vaultRoot = join(root, 'vault')
  const stateRoot = join(root, 'state')
  await mkdir(vaultRoot, { recursive: true })
  await mkdir(stateRoot, { recursive: true })
  await writeFile(configPath, `- name: '${packageName}'\n  config: {}\n`)

  const context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  const agentsFiber = await context.plugin(AgentRegistry)
  await context.plugin(SystemPrompt)
  const toolsFiber = await context.plugin(ToolRuntime)
  await context.plugin(Storage)
  await context.plugin(StorageJson, { root: join(stateRoot, 'storages') })
  await context.plugin(StorageDomain, { backend: 'json' })
  const runtimeFiber = await context.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot, vaultRoot } as never))
  await context.plugin(MemorySettings)
  await context.plugin(realSubprocess ? LocalSubprocessRuntime : MemorySubprocess)
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== packageName) throw new Error(`unexpected Loader import: ${specifier}`)
      return NoteAssistant
    },
  } as unknown as NonNullable<typeof context.loader.internal>

  try {
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()
    return { context, root, agentsFiber, runtimeFiber, toolsFiber }
  } catch (error) {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

test('the real Loader mounts and disposes the Host service', async () => {
  const { context, root } = await load()
  try {
    assert.ok(context.noteAssistant instanceof NoteAssistant)
    assert.ok(context.tocktutorAssistant instanceof TockTutorAssistantGateway)
    const entry = [...context.loader.entries()].find(item => item.options.name === packageName)
    assert.ok(entry?.fiber)

    await entry.fiber.dispose()

    assert.equal(context.get('noteAssistant'), undefined)
    assert.equal(context.get('tocktutorAssistant'), undefined)
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('disposing the required agent registry deactivates the Host service', async () => {
  const { context, root, agentsFiber } = await load()
  try {
    await agentsFiber.dispose()
    assert.equal(context.get('noteAssistant'), undefined)
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('disposing the required runtime or tool registry deactivates the Host service', async () => {
  for (const dependency of ['runtime', 'tools'] as const) {
    const loaded = await load()
    try {
      await (dependency === 'runtime' ? loaded.runtimeFiber : loaded.toolsFiber).dispose()
      assert.equal(loaded.context.get('noteAssistant'), undefined)
    } finally {
      await loaded.context.fiber.dispose()
      await rm(loaded.root, { recursive: true, force: true })
    }
  }
})

test('the real Loader owns and cleans the packaged Pennivo child', { timeout: 15_000 }, async () => {
  const { context, root } = await load(true)
  try {
    const assistant = context.noteAssistant
    const state = context.noteVault.state
    assert.equal(state.active, true)
    if (!state.active) throw new Error('expected active vault')
    const info = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: state.id,
      vaultGeneration: state.generation,
      writePermission: 'read-only',
    })
    const result = await assistantInternals(assistant).listPennivoTools(info.binding) as {
      tools?: Array<{ name?: string }>
    }
    const names = result.tools?.map(tool => tool.name) ?? []
    assert.ok(names.includes('list_files'))
    assert.ok(names.includes('read_file'))

    await assistantInternals(assistant).stopPennivoChild()
    assert.equal(assistantInternals(assistant).activePennivoChild(), null)

    const delivered: UserMessage[] = []
    const agentContext = context.extend()
    const agent = {
      id: 'agent-loader-12345678',
      ctx: agentContext,
      followup(message: UserMessage) { delivered.push(message) },
      options: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      session: { id: 'agent-loader-12345678' },
      status: 'running',
    } as unknown as Agent
    Object.defineProperty(agentContext, 'agent', { configurable: true, value: agent })
    const unregisterAgent = context.agents.register(agent)
    assert.deepEqual(await agentContext.tocktutorAssistant.continueTurn(
      { mode: 'followup', text: 'Continue through scoped Remote' },
      new AbortController().signal,
    ), {
      status: 'accepted',
      mode: 'followup',
      redacted: false,
      truncated: false,
    })
    assert.equal(delivered.length, 1)
    const assistantMessage = delivered[0]
    assert.ok(assistantMessage)
    const productionTurn = 1
    const productionSignal = new AbortController().signal
    const events = agentEvents(context, agent)
    events.emit('agent/inbox/claimed', { message: assistantMessage, turn: productionTurn })
    const decision = await events.waterfall(
      'agent/pre-step',
      { messages: [assistantMessage], turn: productionTurn, step: 1, signal: productionSignal },
      (): Promise<PreStepDecision> => Promise.resolve({ kind: 'enter', messages: [assistantMessage] }),
    )
    assert.deepEqual(decision, { kind: 'enter', messages: [assistantMessage] })
    assert.deepEqual(context.tools.schemas(agent).map(tool => tool.name), [
      'list_files',
      'read_file',
      'search',
      'find_backlinks',
      'get_outline',
      'list_snapshots',
      'list_trash',
    ])
    assert.deepEqual(await events.waterfall(
      'agent/request',
      { turn: productionTurn, step: 1, signal: productionSignal },
      () => Promise.resolve({ provider: 'other-provider', model: 'other-model' }),
    ), {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    const spoofScope = context.extend()
    const spoofAgent = { ...agent, ctx: spoofScope } as unknown as Agent
    Object.defineProperty(spoofScope, 'agent', { configurable: true, value: spoofAgent })
    await assert.rejects(
      spoofScope.tocktutorAssistant.continueTurn(
        { mode: 'followup', text: 'Wrong scoped agent object' },
        new AbortController().signal,
      ),
      /turn/i,
    )
    await writeFile(join(root, 'vault', 'proof.md'), '# Non-Guessable Loader Proof 7f31c2\n', 'utf8')
    const toolResult = await context.tools.execute({
      agent,
      arguments: { path: 'proof.md' },
      callId: CallId('call-loader-12345678'),
      name: 'read_file',
      signal: new AbortController().signal,
    })
    assert.equal(toolResult.isError, false)
    assert.match(JSON.stringify(toolResult), /Non-Guessable Loader Proof 7f31c2/u)
    assert.doesNotMatch(JSON.stringify(toolResult), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))

    await events.serial('agent/turn-stopping', {
      turn: productionTurn,
      signal: productionSignal,
    })
    assert.deepEqual(context.tools.schemas(agent), [])
    await assistant.saveSettings({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
    })
    const proposingChild = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: state.id,
      vaultGeneration: state.generation,
      writePermission: 'propose',
    })
    const proposingTurn = assistant.bindAgentTurn({
      agent,
      turnId: 'turn-loader-propose-12345678',
      requestId: 'request-loader-propose-12345678',
      childInstanceId: proposingChild.instanceId,
      vaultId: state.id,
      vaultGeneration: state.generation,
      allowedTools: ['create_file', 'write_file'],
      signal: new AbortController().signal,
    })
    const staged = await context.tools.execute({
      agent,
      arguments: { path: 'staged-only.md', content: '# Never Written Before Approval' },
      callId: CallId('call-loader-stage-12345678'),
      name: 'create_file',
      signal: new AbortController().signal,
    })
    assert.equal(staged.isError, false)
    const pending = await context.tocktutorAssistant.listProposals({}, new AbortController().signal)
    const [proposal] = pending.proposals
    assert.ok(proposal)
    assert.doesNotMatch(JSON.stringify(staged), /Never Written|token|digest/u)
    assert.doesNotMatch(JSON.stringify(pending), /contentDigest|vaultId|childInstanceId|turnId|requestId/u)
    await assert.rejects(readFile(join(root, 'vault', 'staged-only.md')), { code: 'ENOENT' })
    const applied = await context.tocktutorAssistant.approveProposal(
      { proposalId: proposal.proposalId },
      new AbortController().signal,
    )
    assert.deepEqual(applied, {
      proposalId: proposal.proposalId,
      auditCorrelationId: proposal.auditCorrelationId,
      operation: 'create',
      destination: 'staged-only.md',
      snapshotCaptured: false,
      status: 'created',
    })
    assert.equal(await readFile(join(root, 'vault', 'staged-only.md'), 'utf8'), '# Never Written Before Approval')

    const rejectedStage = await context.tools.execute({
      agent,
      arguments: { path: 'rejected-only.md', content: '# Must Stay Rejected' },
      callId: CallId('call-loader-reject-12345678'),
      name: 'create_file',
      signal: new AbortController().signal,
    })
    assert.equal(rejectedStage.isError, false)
    const rejectedPending = await context.tocktutorAssistant.listProposals({}, new AbortController().signal)
    const [rejectedProposal] = rejectedPending.proposals
    assert.ok(rejectedProposal)
    assert.deepEqual(await context.tocktutorAssistant.rejectProposal({
      proposalId: rejectedProposal.proposalId,
      reason: 'User rejected this proposal.',
    }, new AbortController().signal), {
      proposalId: rejectedProposal.proposalId,
      auditCorrelationId: rejectedProposal.auditCorrelationId,
    })
    await assert.rejects(readFile(join(root, 'vault', 'rejected-only.md')), { code: 'ENOENT' })
    await assert.rejects(
      context.tocktutorAssistant.approveProposal(
        { proposalId: rejectedProposal.proposalId },
        new AbortController().signal,
      ),
      /proposal/i,
    )

    const entry = [...context.loader.entries()].find(item => item.options.name === packageName)
    assert.ok(entry?.fiber)
    await entry.fiber.dispose()

    assert.equal(assistantInternals(assistant).activePennivoChild(), null)
    assert.equal(context.get('noteAssistant'), undefined)
    assert.deepEqual(context.tools.schemas(agent), [])
    proposingTurn.end()
    unregisterAgent()
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('real vault activation invalidates queued writes and quiesces the old child before replacement', async () => {
  const { context, root } = await load(true)
  try {
    const assistant = context.noteAssistant
    const oldVault = context.noteVault.state
    assert.equal(oldVault.active, true)
    if (!oldVault.active) throw new Error('expected active vault')
    await assistant.saveSettings({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
    })
    const oldChild = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: oldVault.id,
      vaultGeneration: oldVault.generation,
      writePermission: 'propose',
    })
    const staged = await stageBoundCreate(context, {
      childInstanceId: oldChild.instanceId,
      content: '# Old Vault',
      destination: 'old-vault.md',
      vaultGeneration: oldVault.generation,
      vaultId: oldVault.id,
    })

    const nextRoot = join(root, 'next-vault')
    await mkdir(nextRoot)
    const nextVault = context.noteVault.activate(nextRoot, oldVault.generation)
    assert.equal(nextVault.active, true)
    if (!nextVault.active) throw new Error('expected replacement vault')
    assert.deepEqual(await assistant.listProposals(), [])
    assert.equal(assistantInternals(assistant).activePennivoChild(), null)
    assert.equal((await assistant.proposalAudit()).at(-1)?.reason, 'STALE_VAULT')
    await assert.rejects(assistantInternals(assistant).ensurePennivoChild({
      vaultId: oldVault.id,
      vaultGeneration: oldVault.generation,
      writePermission: 'propose',
    }), /current|stale|replaced/i)

    const nextChild = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: nextVault.id,
      vaultGeneration: nextVault.generation,
      writePermission: 'propose',
    })
    assert.notEqual(nextChild.instanceId, oldChild.instanceId)

    await assistant.saveSettings({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'read-only',
    })
    assert.equal(assistantInternals(assistant).activePennivoChild(), null)
    const readOnlyChild = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: nextVault.id,
      vaultGeneration: nextVault.generation,
      writePermission: 'read-only',
    })
    assert.notEqual(readOnlyChild.instanceId, nextChild.instanceId)
    staged.dispose()
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('child replacement aborts an approval before the Runtime mutation commits', async () => {
  const { context, root } = await load(true)
  try {
    const assistant = context.noteAssistant
    const vault = context.noteVault.state
    assert.equal(vault.active, true)
    if (!vault.active) throw new Error('expected active vault')
    await assistant.saveSettings({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
    })
    const child = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: vault.id,
      vaultGeneration: vault.generation,
      writePermission: 'propose',
    })
    const staged = await stageBoundCreate(context, {
      childInstanceId: child.instanceId,
      content: '# Child Race',
      destination: 'child-race.md',
      vaultGeneration: vault.generation,
      vaultId: vault.id,
    })
    const proposal = staged.proposal
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let committed = 0
    const runtime = context.noteVault as unknown as {
      createDocument: typeof context.noteVault.createDocument
    }
    const originalCreate = runtime.createDocument
    runtime.createDocument = async (request, signal) => {
      started.resolve()
      await release.promise
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      committed += 1
      return {
        digest: `sha256:${proposal.contentDigest}`,
        generation: vault.generation,
        path: request.path,
        revision: `file:${'d'.repeat(64)}`,
        status: 'created',
      }
    }
    try {
      const approval = assistant.approveProposal(proposal.proposalId, new AbortController().signal)
      await started.promise
      await assistantInternals(assistant).stopPennivoChild()
      release.resolve()
      await assert.rejects(approval, /cancelled|aborted|child changed/i)
      assert.equal(committed, 0)
    } finally {
      runtime.createDocument = originalCreate
      staged.dispose()
    }
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Host unload cancels and drains an approval before closing durable state', async () => {
  const { context, root } = await load(true)
  try {
    const assistant = context.noteAssistant
    const vault = context.noteVault.state
    assert.equal(vault.active, true)
    if (!vault.active) throw new Error('expected active vault')
    await assistant.saveSettings({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
    })
    const child = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: vault.id,
      vaultGeneration: vault.generation,
      writePermission: 'propose',
    })
    const staged = await stageBoundCreate(context, {
      childInstanceId: child.instanceId,
      content: '# Unload Race',
      destination: 'unload-race.md',
      vaultGeneration: vault.generation,
      vaultId: vault.id,
    })
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let committed = 0
    const runtime = context.noteVault as unknown as {
      createDocument: typeof context.noteVault.createDocument
    }
    const originalCreate = runtime.createDocument
    runtime.createDocument = async (request, signal) => {
      started.resolve()
      await release.promise
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      committed += 1
      return {
        digest: `sha256:${staged.proposal.contentDigest}`,
        generation: vault.generation,
        path: request.path,
        revision: `file:${'e'.repeat(64)}`,
        status: 'created',
      }
    }
    try {
      const approval = assistant.approveProposal(
        staged.proposal.proposalId,
        new AbortController().signal,
      )
      await started.promise
      const entry = [...context.loader.entries()].find(item => item.options.name === packageName)
      assert.ok(entry?.fiber)
      let disposed = false
      const unloading = entry.fiber.dispose().then(() => { disposed = true })
      await Promise.resolve()
      assert.equal(disposed, false)
      release.resolve()
      await assert.rejects(approval, /cancelled|aborted|child changed/i)
      await unloading
      assert.equal(committed, 0)
      assert.equal(context.get('noteAssistant'), undefined)
    } finally {
      runtime.createDocument = originalCreate
      staged.dispose()
    }
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Host unload drains a concurrent rejection before closing durable state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tocktutor-assistant-reject-unload-'))
  const first = await load(true, root)
  let proposalId = ''
  try {
    const assistant = first.context.noteAssistant
    const vault = first.context.noteVault.state
    assert.equal(vault.active, true)
    if (!vault.active) throw new Error('expected active vault')
    await assistant.saveSettings({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
    })
    const child = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: vault.id,
      vaultGeneration: vault.generation,
      writePermission: 'propose',
    })
    const staged = await stageBoundCreate(first.context, {
      childInstanceId: child.instanceId,
      content: '# Rejected During Unload',
      destination: 'reject-unload.md',
      vaultGeneration: vault.generation,
      vaultId: vault.id,
    })
    proposalId = staged.proposal.proposalId
    const rejection = assistant.rejectProposal(proposalId, 'Rejected during unload.')
    const entry = [...first.context.loader.entries()].find(item => item.options.name === packageName)
    assert.ok(entry?.fiber)
    await Promise.all([rejection, entry.fiber.dispose()])
    staged.dispose()
  } finally {
    await first.context.fiber.dispose()
  }

  const second = await load(true, root)
  try {
    assert.deepEqual(await second.context.noteAssistant.listProposals(), [])
    const audit = await second.context.noteAssistant.proposalAudit()
    assert.ok(audit.some(entry => entry.proposalId === proposalId && entry.outcome === 'rejected'))
  } finally {
    await second.context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('restart hydration preserves terminal audit and cannot revive consumed or stale authority', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tocktutor-assistant-restart-'))
  const first = await load(true, root)
  let appliedId = ''
  let staleId = ''
  try {
    const assistant = first.context.noteAssistant
    const vault = first.context.noteVault.state
    assert.equal(vault.active, true)
    if (!vault.active) throw new Error('expected active vault')
    await assistant.saveSettings({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
    })
    const child = await assistantInternals(assistant).ensurePennivoChild({
      vaultId: vault.id,
      vaultGeneration: vault.generation,
      writePermission: 'propose',
    })
    const applied = await stageBoundCreate(first.context, {
      childInstanceId: child.instanceId,
      content: '# Durable Applied',
      destination: 'durable-applied.md',
      vaultGeneration: vault.generation,
      vaultId: vault.id,
    })
    appliedId = applied.proposal.proposalId
    assert.equal((await assistant.approveProposal(
      appliedId,
      new AbortController().signal,
    )).status, 'created')
    applied.dispose()

    const stale = await stageBoundCreate(first.context, {
      childInstanceId: child.instanceId,
      content: '# Must Never Commit',
      destination: 'restart-stale.md',
      vaultGeneration: vault.generation,
      vaultId: vault.id,
    })
    staleId = stale.proposal.proposalId
    stale.dispose()
  } finally {
    await first.context.fiber.dispose()
  }

  const second = await load(true, root)
  try {
    assert.deepEqual(await second.context.noteAssistant.listProposals(), [])
    await assert.rejects(
      second.context.noteAssistant.approveProposal(appliedId, new AbortController().signal),
      /proposal/i,
    )
    await assert.rejects(
      second.context.noteAssistant.approveProposal(staleId, new AbortController().signal),
      /proposal/i,
    )
    assert.equal(await readFile(join(root, 'vault', 'durable-applied.md'), 'utf8'), '# Durable Applied')
    await assert.rejects(readFile(join(root, 'vault', 'restart-stale.md')), { code: 'ENOENT' })
    const audit = await second.context.noteAssistant.proposalAudit()
    assert.ok(audit.some(entry => entry.proposalId === appliedId && entry.outcome === 'applied'))
    assert.ok(audit.some(entry => entry.proposalId === staleId
      && entry.outcome === 'approval-denied'
      && ['CHILD_REPLACED', 'TARGET_CHANGED', 'TURN_MISMATCH'].includes(entry.reason ?? '')), JSON.stringify(audit))
  } finally {
    await second.context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('the package publishes a browser client contribution without Host behavior', async () => {
  assert.ok(Config)
  let disposed = 0
  const context = {
    remote: {
      tocktutorAssistant: {},
      async $mount() {
        return async () => { disposed += 1 }
      },
    },
    sessions: {},
    slots: { inject: () => () => {} },
  } as Record<string, unknown> & { inject?: unknown }
  context.inject = (_services: string[], callback: (child: typeof context) => () => void) => {
    const disposePanel = callback(context)
    return Object.assign(Promise.resolve(), { dispose: async () => { disposePanel() } })
  }
  const dispose = await applyClient(context as never)
  await dispose()
  assert.equal(disposed, 1)
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    dsh?: { client?: { external?: string[]; inject?: string[]; platform?: string } }
    exports?: Record<string, { default?: string; types?: string }>
  }
  assert.deepEqual(manifest.dsh?.client, {
    external: ['@tockteam/tocktutor-workbench/client'],
    inject: ['@deepseek-ai/dsh-client-runtime', '@tockteam/tocktutor-workbench'],
    platform: 'web',
    immediately: true,
  })
  assert.deepEqual(manifest.exports?.['./client'], {
    types: './lib/client.d.ts',
    default: './lib/client-bundle.js',
  })
  const bundle = await readFile(new URL('../lib/client-bundle.js', import.meta.url), 'utf8')
  assert.match(bundle, /^window\.__ModuleLoader__\.load\(\{ id: "@tockteam\/tocktutor-assistant"/u)
  assert.doesNotMatch(bundle, /^import\s/mu)
})

test('the package binds the shared plugin workspace exactly', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    version?: string
    peerDependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const workspace = await readFile(new URL('../../../pnpm-workspace.yaml', import.meta.url), 'utf8')
  const lockfile = await readFile(new URL('../../../pnpm-lock.yaml', import.meta.url), 'utf8')

  assert.equal(manifest.version, '0.1.5')
  assert.equal(manifest.peerDependencies?.['@tockteam/tocktutor-workbench'], '0.1.7')
  assert.equal(manifest.devDependencies?.['@tockteam/tocktutor-workbench'], 'workspace:0.1.7')
  assert.equal(manifest.peerDependencies?.['@tockteam/desktop'], undefined)
  assert.equal(manifest.devDependencies?.['@tockteam/desktop'], 'workspace:*')
  assert.equal(manifest.peerDependencies?.['tockbot-note-runtime'], '0.1.2')
  assert.equal(manifest.devDependencies?.['tockbot-note-runtime'], 'workspace:0.1.2')
  assert.match(workspace, /packages:\n  - packages\/\*/u)
  assert.match(workspace, /'@tockteam\/desktop': link:\.\.\/\.\./u)
  assert.match(lockfile, /packages\/tockteam-tocktutor-assistant:/u)
  assert.match(lockfile, /specifier: workspace:0\.1\.7/u)
  assert.match(lockfile, /version: link:\.\.\/tockteam-tocktutor-workbench/u)
  assert.doesNotMatch(workspace + lockfile, /tocktutor-workbench-0\.1\.[4-7]\.tgz|tockteam-desktop-0\.1\.[6-8]\.tgz/u)
})
