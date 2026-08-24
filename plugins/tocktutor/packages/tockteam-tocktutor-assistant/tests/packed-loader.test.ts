import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { runInThisContext } from 'node:vm'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import ClientModules from '@deepseek-ai/dsh-client-modules'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import NoteVaultRuntime, { Config as RuntimeConfig } from 'tockbot-note-runtime'
import type { PennivoBinding, PennivoChildInfo } from '../src/pennivo-child.ts'
import type { AssistantTurnLease } from '../src/turn-bindings.ts'
import type { AssistantProposalView } from '../src/remote-types.ts'
import { dshRoot } from '../../../test-utils.ts'

const run = promisify(execFile)
const packageName = '@tockteam/tocktutor-assistant'
const workbenchName = '@tockteam/tocktutor-workbench'

class MemorySettings extends SettingsProvider {
  get writable(): boolean { return true }
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

interface PackedAssistant {
  saveSettings(settings: {
    provider: string
    model: string
    writePermission: 'read-only' | 'propose'
  }): Promise<void>
  ensurePennivoChild(binding: PennivoBinding): Promise<PennivoChildInfo>
  activePennivoChild(): PennivoChildInfo | null
  bindAgentTurn(input: {
    agent: Agent
    turnId: string
    requestId: string
    childInstanceId: string
    vaultId: string
    vaultGeneration: number
    allowedTools: readonly ('create_file' | 'write_file')[]
    signal: AbortSignal
  }): AssistantTurnLease
}

async function stage(
  context: Context,
  assistant: PackedAssistant,
  agent: Agent,
  child: PennivoChildInfo,
  vault: { id: string; generation: number },
  input: { content: string; path: string; tool: 'create_file' | 'write_file'; sequence: number },
): Promise<{ lease: AssistantTurnLease; proposal: AssistantProposalView }> {
  const suffix = String(input.sequence).padStart(8, '0')
  const lease = assistant.bindAgentTurn({
    agent,
    turnId: `turn-packed-${suffix}`,
    requestId: `request-packed-${suffix}`,
    childInstanceId: child.instanceId,
    vaultId: vault.id,
    vaultGeneration: vault.generation,
    allowedTools: [input.tool],
    signal: new AbortController().signal,
  })
  const result = await context.tools.execute({
    agent,
    arguments: { path: input.path, content: input.content },
    callId: CallId(`call-packed-${suffix}`),
    name: input.tool,
    signal: new AbortController().signal,
  })
  assert.equal(result.isError, false)
  assert.doesNotMatch(JSON.stringify(result), /approvalToken|private proposal|replacement body/u)
  const listed = await context.tocktutorAssistant.listProposals({}, new AbortController().signal)
  const proposal = listed.proposals.find(candidate => candidate.destination === input.path)
  assert.ok(proposal)
  assert.equal('approvalToken' in proposal, false)
  return { lease, proposal }
}

test('a fresh packed artifact loads through pinned Host and web ClientModule loaders', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(process.cwd(), '.packed-loader-'))
  const packRoot = join(root, 'packs')
  const packageRoot = join(root, 'node_modules', '@tockteam', 'tocktutor-assistant')
  const vaultRoot = join(root, 'vault')
  const stateRoot = join(root, 'state')
  const storageRoot = join(root, 'storage')
  const configPath = join(root, 'cordis.yml')
  const context = new Context()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    await Promise.all([
      mkdir(packRoot, { recursive: true }),
      mkdir(vaultRoot, { recursive: true }),
      mkdir(stateRoot, { recursive: true }),
    ])
    const packed = await run('pnpm', [
      'pack',
      '--pack-destination',
      packRoot,
    ], { cwd: process.cwd() })
    const artifact = packed.stdout.trim().split('\n').at(-1)
    if (artifact === undefined || !artifact.endsWith('.tgz')) {
      throw new Error(`pnpm pack returned an unexpected artifact path: ${packed.stdout}`)
    }
    const sourceManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const linkFromProject = (name: string) => `link:${join(process.cwd(), 'node_modules', name)}`
    const linkedPeers = Object.fromEntries(Object.keys(sourceManifest.peerDependencies ?? {}).map(name => [
      name,
      linkFromProject(name),
    ]))
    const dependencyOverrides = Object.keys(sourceManifest.dependencies ?? {}).map(name =>
      `  ${JSON.stringify(name)}: ${JSON.stringify(linkFromProject(name))}`)
    await Promise.all([
      writeFile(join(root, 'package.json'), JSON.stringify({
        name: 'tocktutor-assistant-packed-consumer',
        private: true,
        dependencies: {
          ...linkedPeers,
          [packageName]: `file:${artifact}`,
        },
      }, undefined, 2)),
      writeFile(join(root, 'pnpm-workspace.yaml'), [
        'packages:',
        '  - .',
        'overrides:',
        ...dependencyOverrides,
        '',
      ].join('\n')),
      writeFile(configPath, [
        `- name: '@tockteam/tocktutor-workbench'`,
        `- name: '${packageName}'`,
        '  config: {}',
        '',
      ].join('\n')),
    ])
    await run('pnpm', [
      'install',
      '--offline',
      '--ignore-scripts',
      '--strict-peer-dependencies',
    ], { cwd: root })
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as {
      name?: string
      peerDependencies?: Record<string, string>
    }
    assert.equal(manifest.name, packageName)
    assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-storage-domain'], '0.1.0-rc.5')

    const consumerRequire = createRequire(join(root, 'package.json'))
    const packedHostPath = consumerRequire.resolve(packageName)
    const packedClientPath = consumerRequire.resolve(`${packageName}/client`)
    assert.ok(packedHostPath.startsWith(root))
    assert.ok(packedClientPath.startsWith(root))
    const packedHost = await import(pathToFileURL(packedHostPath).href)
    assert.equal(typeof packedHost.default, 'function')

    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(AgentRegistry)
    await context.plugin(SystemPrompt)
    await context.plugin(ToolRuntime)
    await context.plugin(Storage)
    await context.plugin(StorageJson, { root: storageRoot })
    await context.plugin(StorageDomain, { backend: 'json' })
    await context.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot, vaultRoot } as never))
    await context.plugin(MemorySettings)
    await context.plugin(LocalSubprocessRuntime)
    await context.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()
    await context.plugin(ClientModules)

    assert.equal(typeof context.noteAssistant?.saveSettings, 'function')
    assert.ok(context.get('tocktutorAssistant'))
    const assistant = context.noteAssistant as unknown as PackedAssistant
    const vault = context.noteVault.state
    assert.equal(vault.active, true)
    if (!vault.active) throw new Error('expected active fixture vault')
    await assistant.saveSettings({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      writePermission: 'propose',
    })
    const child = await assistant.ensurePennivoChild({
      vaultId: vault.id,
      vaultGeneration: vault.generation,
      writePermission: 'propose',
    })
    const agentContext = context.extend()
    const agentId = 'agent-packed-12345678'
    const agent = {
      id: agentId,
      ctx: agentContext,
      options: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      session: { id: agentId },
      status: 'running',
    } as unknown as Agent
    Object.defineProperty(agentContext, 'agent', { configurable: true, value: agent })
    const unregister = context.agents.register(agent)

    const created = await stage(context, assistant, agent, child, vault, {
      content: '# Packed private proposal',
      path: 'packed-proof.md',
      tool: 'create_file',
      sequence: 1,
    })
    assert.deepEqual(await context.tocktutorAssistant.approveProposal(
      { proposalId: created.proposal.proposalId },
      new AbortController().signal,
    ), {
      proposalId: created.proposal.proposalId,
      auditCorrelationId: created.proposal.auditCorrelationId,
      operation: 'create',
      destination: 'packed-proof.md',
      snapshotCaptured: false,
      status: 'created',
    })
    created.lease.end()
    assert.equal(await readFile(join(vaultRoot, 'packed-proof.md'), 'utf8'), '# Packed private proposal')

    const updated = await stage(context, assistant, agent, child, vault, {
      content: '# Packed replacement body',
      path: 'packed-proof.md',
      tool: 'write_file',
      sequence: 2,
    })
    const saved = await context.tocktutorAssistant.approveProposal(
      { proposalId: updated.proposal.proposalId },
      new AbortController().signal,
    )
    assert.equal(saved.status, 'saved')
    assert.equal(saved.snapshotCaptured, true)
    updated.lease.end()
    assert.equal(await readFile(join(vaultRoot, 'packed-proof.md'), 'utf8'), '# Packed replacement body')
    const snapshots = await context.noteVault.listSnapshots({
      expectedVault: vault,
      path: 'packed-proof.md',
    }, new AbortController().signal)
    assert.equal(snapshots.snapshots.length, 1)

    const graph = context.clientModules.graph()
    assert.deepEqual(
      graph.entries.filter(row => row.id === workbenchName || row.id === packageName).map(row => row.id),
      [workbenchName, packageName],
    )
    const assistantRow = graph.entries.find(row => row.id === packageName)
    assert.ok(assistantRow)
    assert.equal(assistantRow.url.startsWith(`/plugins/${packageName}/client.js?rev=`), true)

    Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
    const { ClientModuleSystem } = await import(
      pathToFileURL(join(dshRoot, 'packages/client/modules/lib/types/client/system.js')).href
    )
    const fetched: string[] = []
    const modules = new ClientModuleSystem({
      modules: graph.entries,
      staticModules: {
        react: await import(pathToFileURL(consumerRequire.resolve('react')).href),
        'react/jsx-runtime': await import(pathToFileURL(consumerRequire.resolve('react/jsx-runtime')).href),
        '@tockteam/desktop/client': await import(
          pathToFileURL(consumerRequire.resolve('@tockteam/desktop/client')).href
        ),
      },
      loadBundle: async (url: string) => {
        const response = await fetch(new URL(url, `http://127.0.0.1:${String(context.webServer.port)}`))
        assert.equal(response.status, 200)
        assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/u)
        const source = await response.text()
        fetched.push(url)
        runInThisContext(source, { filename: url })
      },
    })
    await modules.import(workbenchName)

    let remoteDisposed = 0
    let slotDisposed = 0
    let panelDisposed = 0
    const assistantRemote = {}
    const remote = {
      tocktutorAssistant: assistantRemote,
      async $mount(contribution: { package?: string }) {
        assert.equal(contribution.package, packageName)
        return async () => { remoteDisposed += 1 }
      },
    }
    const sessions = { marker: 'packed-client-session' }
    const mountAssistant = async (): Promise<() => Promise<void>> => {
      const client = await modules.import(packageName) as {
        apply(context: unknown): Promise<() => Promise<void>>
        name: string
      }
      assert.equal(client.name, packageName)
      let declaration: (() => () => void) | undefined
      const registered: Array<{ component: unknown; options: Record<string, unknown> }> = []
      const clientContext = {
        remote,
        sessions,
        slots: {
          inject(name: string, callback: () => () => void) {
            assert.equal(name, 'tockteam.tocktutor.workbench.assistant')
            declaration = callback
            return () => { slotDisposed += 1 }
          },
          register(options: Record<string, unknown>, component: unknown) {
            registered.push({ component, options })
            return () => { panelDisposed += 1 }
          },
        },
      } as Record<string, unknown> & { inject?: unknown }
      clientContext.inject = (services: string[], callback: (child: typeof clientContext) => () => void) => {
        assert.deepEqual(services, ['remote', 'remote.tocktutorAssistant', 'sessions', 'slots'])
        const disposePanel = callback(clientContext)
        return Object.assign(Promise.resolve(), { dispose: async () => { disposePanel() } })
      }
      const disposeClient = await client.apply(clientContext)
      assert.ok(declaration)
      const disposePanel = declaration()
      assert.equal(registered.length, 1)
      assert.equal(registered[0]?.options.name, 'tockteam.tocktutor.workbench.assistant')
      assert.equal(registered[0]?.options.registrant, packageName)
      const injectPanel = registered[0]?.options.inject as (() => unknown)
      assert.deepEqual(injectPanel(), {
        remote: { tocktutorAssistant: assistantRemote },
        sessions,
      })
      return async () => {
        disposePanel()
        await disposeClient()
      }
    }

    const disposeFirstClient = await mountAssistant()
    await disposeFirstClient()
    modules.invalidate(packageName)
    const disposeReloadedClient = await mountAssistant()
    await disposeReloadedClient()
    assert.equal(fetched.filter(url => url === assistantRow.url).length, 2)
    assert.equal(panelDisposed, 2)
    assert.equal(slotDisposed, 2)
    assert.equal(remoteDisposed, 2)

    const entry = [...context.loader.entries()].find(item => item.options.name === packageName)
    assert.ok(entry?.fiber)
    await entry.fiber.dispose()
    assert.equal(context.get('noteAssistant'), undefined)
    assert.equal(context.get('tocktutorAssistant'), undefined)
    assert.equal(assistant.activePennivoChild(), null)
    assert.deepEqual(context.tools.schemas(agent), [])
    unregister()
  } finally {
    delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
