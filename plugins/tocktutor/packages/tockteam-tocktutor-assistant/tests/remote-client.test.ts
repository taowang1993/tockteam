import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, { default: string; types: string }>
}

function accepts(codec: TypertCodec, value: unknown): boolean {
  assert.equal(codec.mode, 'strict')
  if (codec.mode !== 'strict') assert.fail('expected strict generated codec')
  try {
    codec.schema.parse(value)
    return true
  } catch {
    return false
  }
}

test('publishes deterministic strict Remote descriptors for only the browser contract', async () => {
  assert.deepEqual(manifest.exports['./typert'], {
    types: './lib/typert.host.d.ts',
    default: './lib/typert.host.js',
  })
  assert.deepEqual(manifest.exports['./remote'], {
    types: './lib/typert.remote-client.d.ts',
    default: './lib/typert.remote-client.js',
  })

  const { default: remote } = await import('../lib/typert.remote-client.js')
  assert.equal(remote.package, '@tockteam/tocktutor-assistant')
  assert.deepEqual(remote.descriptors.map(descriptor => descriptor.method), [
    'approveProposal',
    'audit',
    'continueTurn',
    'currentSettings',
    'listProposals',
    'rejectProposal',
    'saveSettings',
  ])
  for (const descriptor of remote.descriptors) {
    assert.deepEqual(descriptor.cancellation, { parameter: 'signal' })
    assert.equal(descriptor.namespace, 'tocktutorAssistant')
    assert.equal(descriptor.service, 'tocktutorAssistant')
    assert.equal(descriptor.result.mode, 'strict')
    assert.equal(descriptor.parameters.every(parameter => parameter.codec.mode === 'strict'), true)
  }

  const turn = remote.descriptors.find(descriptor => descriptor.method === 'continueTurn')!
  if (turn.invocation.kind !== 'context') assert.fail('continueTurn must be Agent-scoped')
  assert.deepEqual(turn.invocation, {
    kind: 'context',
    context: 'agent',
    wire: 'agentId',
    codec: turn.invocation.codec,
  })
  assert.deepEqual(turn.parameters.map(parameter => parameter.name), ['request'])
  assert.equal(accepts(turn.parameters[0]!.codec, { mode: 'followup', text: 'Hello' }), true)
  assert.equal(accepts(turn.parameters[0]!.codec, { mode: 'invalid', text: 'Hello' }), false)
  assert.equal(accepts(turn.parameters[0]!.codec, { mode: 'followup' }), false)
  assert.equal(accepts(turn.result, {
    status: 'accepted',
    mode: 'followup',
    redacted: false,
    truncated: false,
  }), true)
  assert.equal(accepts(turn.result, {
    agentId: 'private-agent',
    messageId: 'private-message',
    mode: 'followup',
    redacted: false,
    truncated: false,
  }), false)

  const proposals = remote.descriptors.find(descriptor => descriptor.method === 'listProposals')!
  assert.deepEqual(proposals.parameters.map(parameter => parameter.name), ['request'])
  assert.equal(accepts(proposals.parameters[0]!.codec, { offset: 0, limit: 20 }), true)
  assert.equal(accepts(proposals.parameters[0]!.codec, { offset: '0' }), false)

  const approval = remote.descriptors.find(descriptor => descriptor.method === 'approveProposal')!
  assert.equal(accepts(approval.parameters[0]!.codec, { proposalId: 'opaque-proposal' }), true)
  assert.equal(accepts(approval.parameters[0]!.codec, { token: 'forbidden-secret' }), false)
  assert.equal(accepts(approval.parameters[0]!.codec, {}), false)
  assert.equal(accepts(approval.result, {
    proposalId: 'proposal',
    auditCorrelationId: 'audit',
    operation: 'create',
    destination: 'Safe.md',
    snapshotCaptured: false,
    status: 'created',
  }), true)
  assert.equal(accepts(approval.result, {
    proposalId: 'proposal',
    auditCorrelationId: 'audit',
    content: '# forbidden',
  }), false)

  const generated = await readFile(new URL('../lib/typert.remote-client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(generated, /node:|child_process|noteVault|subprocess|contentDigest|vaultId|childInstanceId|turnId|requestId/u)
  assert.doesNotMatch(generated, /['"]content['"]\s*:/u)
})

test('regenerates byte-identical pinned Remote artifacts', async () => {
  const paths = [
    '../lib/typert.host.js',
    '../lib/typert.host.d.ts',
    '../lib/typert.remote-client.js',
    '../lib/typert.remote-client.d.ts',
    '../lib/typert.remote-client.d.ts.map',
  ]
  const before = await Promise.all(paths.map(path => readFile(new URL(path, import.meta.url), 'utf8')))
  await import(`../scripts/generate-typert.mjs?determinism=${String(Date.now())}`)
  const after = await Promise.all(paths.map(path => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.deepEqual(after, before)
})

test('client mounts Remote and the exact lifecycle-owned Workbench assistant seat', async () => {
  const client = await import('../lib/client.js')
  const { TockTutorAssistantPanel } = await import('../lib/assistant-panel.js')
  const { default: remote } = await import('../lib/typert.remote-client.js')
  const mounted: TypertRemoteContribution[] = []
  const injected: string[] = []
  const injectedServices: string[][] = []
  const registered: Array<{ component: unknown; options: Record<string, unknown> }> = []
  const disposed: string[] = []
  const sessions = { marker: 'selected-session-runtime' }
  let declaration: (() => () => void) | undefined
  const assistantRemote = {}
  const context = {
    remote: {
      tocktutorAssistant: assistantRemote,
      async $mount(contribution: TypertRemoteContribution) {
        mounted.push(contribution)
        return async () => { disposed.push('remote') }
      },
    },
    sessions,
    slots: {
      inject(name: string, callback: () => () => void) {
        injected.push(name)
        declaration = callback
        return () => { disposed.push('inject') }
      },
      register(options: Record<string, unknown>, component: unknown) {
        registered.push({ component, options })
        return () => { disposed.push('panel') }
      },
    },
  } as Record<string, unknown> & { inject?: unknown }
  context.inject = (services: string[], callback: (child: typeof context) => () => void) => {
    injectedServices.push(services)
    const disposeInjection = callback(context)
    return Object.assign(Promise.resolve(), {
      dispose: async () => { disposeInjection() },
    })
  }

  const dispose = await client.apply(context as never)
  assert.deepEqual(client.inject, ['remote', 'sessions', 'slots'])
  assert.deepEqual(mounted, [remote])
  assert.deepEqual(injectedServices, [['remote', 'remote.tocktutorAssistant', 'sessions', 'slots']])
  assert.deepEqual(injected, ['tockteam.tocktutor.workbench.assistant'])
  assert.ok(declaration)
  const disposePanel = declaration()
  assert.equal(registered.length, 1)
  assert.equal(registered[0]?.component, TockTutorAssistantPanel)
  assert.deepEqual(registered[0]?.options, {
    inject: registered[0]?.options.inject,
    name: 'tockteam.tocktutor.workbench.assistant',
    registrant: '@tockteam/tocktutor-assistant',
  })
  const inject = registered[0]?.options.inject as (() => unknown)
  assert.deepEqual(inject(), { remote: { tocktutorAssistant: assistantRemote }, sessions })
  disposePanel()
  await dispose()
  assert.deepEqual(disposed, ['panel', 'inject', 'remote'])
})

test('client mount failures fail closed', async () => {
  const client = await import('../lib/client.js')
  const failure = new Error('carrier unavailable')
  await assert.rejects(client.apply({
    remote: { $mount: () => Promise.reject(failure) },
  } as never), error => error === failure)
})

test('real Client Remote propagates cancellation and retires retained handles on unload', async () => {
  const client = await import('../lib/client.js')
  const require = createRequire(import.meta.url)
  const gatewayRoot = dirname(require.resolve('@deepseek-ai/dsh-api-gateway/package.json'))
  const gateway = await import(pathToFileURL(join(gatewayRoot, 'lib/types/client/index.js')).href)
  const context = new Context()
  let observedSignal: AbortSignal | undefined
  const calls: Array<{ method: string; payload: unknown }> = []
  const call: ConnectionHandle['rpc']['call'] = async (_path, method, payload, signal) => {
    observedSignal = signal
    calls.push({ method, payload })
    return method === 'tocktutorAssistant/continueTurn'
      ? { ok: true, value: { status: 'accepted', mode: 'followup', redacted: false, truncated: false } }
      : {
          ok: true,
          value: { provider: 'provider-safe', model: 'model-safe', writePermission: 'read-only' },
        }
  }

  await context.plugin(TypertRegistry)
  context.provide('connection', { rpc: { call } } as unknown as ConnectionHandle)
  context.provide('sessions', {} as never)
  context.provide('slots', { inject: () => () => {} } as never)
  const gatewayFiber = context.plugin(Object.assign(gateway.apply, { inject: gateway.inject }))
  await gatewayFiber
  const clientFiber = context.plugin(Object.assign(client.apply, { inject: client.inject }))
  await clientFiber
  const namespace = (context.remote as unknown as {
    tocktutorAssistant: {
      currentSettings(signal?: AbortSignal): Promise<unknown>
    }
  }).tocktutorAssistant
  const retained = namespace.currentSettings
  context.typert.contexts.registerClient('agent', {
    identity: candidate => (candidate as Context & { agentIdentity?: string }).agentIdentity as SessionId | undefined,
  })
  const agentContext = context.extend({ agentIdentity: 'agent-scoped-wire' })
  const scopedTurn = (agentContext.remote as unknown as {
    tocktutorAssistant: {
      continueTurn(
        request: { mode: 'followup'; text: string },
        signal?: AbortSignal,
      ): Promise<unknown>
    }
  }).tocktutorAssistant.continueTurn
  assert.deepEqual(await scopedTurn({ mode: 'followup', text: 'Scoped request' }), {
    ok: true,
    value: { status: 'accepted', mode: 'followup', redacted: false, truncated: false },
  })
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    method: 'tocktutorAssistant/continueTurn',
    payload: {
      args: {
        agentId: 'agent-scoped-wire',
        request: { mode: 'followup', text: 'Scoped request' },
      },
    },
  })

  const controller = new AbortController()
  assert.deepEqual(await retained(controller.signal), {
    ok: true,
    value: { provider: 'provider-safe', model: 'model-safe', writePermission: 'read-only' },
  })
  assert.ok(observedSignal instanceof AbortSignal)
  assert.notStrictEqual(observedSignal, controller.signal)
  const reason = new Error('caller cancelled')
  controller.abort(reason)
  assert.equal(observedSignal.aborted, true)
  assert.equal(observedSignal.reason, reason)

  await clientFiber.dispose()
  assert.equal((context.remote as unknown as Record<string, unknown>).tocktutorAssistant, undefined)
  assert.deepEqual(await retained(), {
    ok: false,
    error: {
      code: 'internal',
      message: 'client api: Remote method tocktutorAssistant/currentSettings is no longer mounted',
      details: {},
    },
  })
  await context.fiber.dispose()
})
