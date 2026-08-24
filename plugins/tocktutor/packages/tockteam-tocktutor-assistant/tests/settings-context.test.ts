import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import NoteVaultRuntime, { Config as RuntimeConfig } from 'tockbot-note-runtime'
import SubprocessRuntime, {
  type SubprocessHandle,
  type SubprocessSpawnSpec,
  type SubprocessTerminalHandle,
  type SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import NoteAssistant, {
  ASSISTANT_SETTINGS_NAMESPACE,
  type AssistantSettings,
} from '../src/index.ts'
import {
  buildAssistantPrompt,
  boundToolText,
  type AssistantPromptInput,
} from '../src/context.ts'

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

class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

const defaults: AssistantSettings = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  writePermission: 'read-only',
}

async function installStorage(ctx: Context, root: string): Promise<void> {
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
}

async function boot(): Promise<{ ctx: Context; assistant: NoteAssistant; assistantFiber: Context['fiber']; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'assistant-settings-'))
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await installStorage(ctx, join(root, 'storage'))
  await ctx.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot: null, vaultRoot: null } as never))
  await ctx.plugin(MemorySettings)
  await ctx.plugin(MemorySubprocess)
  const assistantFiber = ctx.plugin(NoteAssistant, defaults)
  await assistantFiber
  return { ctx, assistant: ctx.noteAssistant, assistantFiber, root }
}

test('settings are bounded, persisted through DSH settings, and unregistered on unload', async () => {
  const { ctx, assistant, assistantFiber, root } = await boot()
  try {
    assert.deepEqual(assistant.currentSettings(), defaults)
    await assistant.saveSettings({
      provider: 'gateway/acme',
      model: 'acme:model-v2',
      writePermission: 'propose',
    })
    assert.deepEqual(assistant.currentSettings(), {
      provider: 'gateway/acme',
      model: 'acme:model-v2',
      writePermission: 'propose',
    })
    assert.equal(ctx.settings.describe().some(entry => entry.ns === ASSISTANT_SETTINGS_NAMESPACE), true)

    await assert.rejects(
      assistant.saveSettings({ ...defaults, provider: 'x'.repeat(129) }),
      /provider/i,
    )
    await assert.rejects(
      assistant.saveSettings({ ...defaults, model: `unsafe\nmodel` }),
      /model/i,
    )
    await assert.rejects(
      assistant.saveSettings({ ...defaults, writePermission: 'write' as never }),
      /writePermission/i,
    )

    await assistantFiber.dispose()
    assert.equal(ctx.get('settings')?.describe().some(entry => entry.ns === ASSISTANT_SETTINGS_NAMESPACE), false)
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('public proposal staging cannot bypass live turn acquisition', async () => {
  const { ctx, assistant, root } = await boot()
  try {
    await ctx.settings.replace(ASSISTANT_SETTINGS_NAMESPACE, {
      provider: defaults.provider,
      model: defaults.model,
      writePermission: 'propose',
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    await assert.rejects(assistant.stageProposal({
      vaultId: 'vault-settings-12345678',
      vaultGeneration: 1,
      destination: 'Settings.md',
      operation: 'create',
      expectedTarget: { exists: false },
      content: '# Settings',
      childInstanceId: 'child-settings-12345678',
      turnId: 'turn-settings-12345678',
      requestId: 'request-settings-12345678',
      provider: defaults.provider,
      model: defaults.model,
      writePermission: 'propose',
      permissionEpoch: 1,
    }), /turn/i)
    assert.deepEqual(await assistant.listProposals(), [])
    assert.deepEqual(await assistant.proposalAudit(), [])
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('invalid persisted settings fail plugin activation closed', async () => {
  class InvalidSettings extends MemorySettings {
    doc = {
      [ASSISTANT_SETTINGS_NAMESPACE]: {
        provider: 'unsafe provider',
        model: 'model',
        writePermission: 'propose',
      },
    }
  }
  const root = await mkdtemp(join(tmpdir(), 'assistant-invalid-settings-'))
  const ctx = new Context()
  ctx.baseUrl = import.meta.url
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await installStorage(ctx, join(root, 'storage'))
  await ctx.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot: null, vaultRoot: null } as never))
  await ctx.plugin(InvalidSettings)
  await ctx.plugin(MemorySubprocess)
  try {
    await assert.rejects(async () => { await ctx.plugin(NoteAssistant, defaults) }, /provider/i)
    assert.equal(ctx.get('noteAssistant'), undefined)
    assert.equal(ctx.get('settings')?.describe().some(entry => entry.ns === ASSISTANT_SETTINGS_NAMESPACE), false)
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('prompt assembly keeps the current message and newest bounded context', () => {
  const input: AssistantPromptInput = {
    message: 'CURRENT-MESSAGE',
    history: Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `${index === 11 ? 'NEWEST-HISTORY ' : ''}${'h'.repeat(4_000)}`,
    })),
    attachments: Array.from({ length: 8 }, (_, index) => ({
      relativePath: `Attachments/spec-${index}.pdf`,
      markdown: `${index === 0 ? 'FIRST-ATTACHMENT ' : ''}![[Attachments/spec-${index}.pdf]]${'a'.repeat(2_000)}`,
    })),
  }

  const prompt = buildAssistantPrompt(input)

  assert.match(prompt.user, /Current User Message:\nCURRENT-MESSAGE/)
  assert.match(prompt.user, /NEWEST-HISTORY/)
  assert.match(prompt.user, /FIRST-ATTACHMENT/)
  assert.ok(prompt.user.length <= 33_000)
  assert.match(prompt.system, /relative note paths/i)
})

test('prompt and tool text redact credentials and absolute paths', () => {
  const prompt = buildAssistantPrompt({
    message: 'Read /srv/private.md with API_KEY="secret-value" and Bearer token-value',
    history: [{ role: 'assistant', content: 'Windows path C:\\Users\\alice\\private.md' }],
    attachments: [{ relativePath: 'Notes/Safe.md', markdown: '![[Notes/Safe.md]]' }],
  })
  const combined = `${prompt.system}\n${prompt.user}`

  assert.doesNotMatch(combined, /srv\/private|C:\\Users|secret-value|token-value/)
  assert.match(combined, /\[REDACTED\]/)
  assert.doesNotMatch(boundToolText('/private/tmp/vault/Note.md TOKEN=abc123', 80), /private\/tmp|abc123/)
  const assigned = boundToolText(
    'OPENAI_API_KEY=top-secret path=/Users/alice/private AWS_ACCESS_TOKEN:another-secret',
    200,
  )
  assert.doesNotMatch(assigned, /top-secret|Users\/alice|another-secret/u)
  assert.match(assigned, /OPENAI_API_KEY=\[REDACTED\]/u)
  assert.match(assigned, /path=\[REDACTED\]/u)
})

test('prompt assembly rejects malformed or excessive context containers', () => {
  assert.throws(() => buildAssistantPrompt({
    message: 'hello',
    history: Array.from({ length: 13 }, () => ({ role: 'user', content: 'x' })),
  }), /history/i)
  assert.throws(() => buildAssistantPrompt({
    message: 'hello',
    attachments: [{ relativePath: '../secret.md', markdown: '![[secret]]' }],
  }), /relativePath/i)
  assert.throws(() => buildAssistantPrompt({
    message: 'hello',
    attachments: Array.from({ length: 33 }, (_, index) => ({
      relativePath: `safe-${index}.md`,
      markdown: 'safe',
    })),
  }), /attachments/i)
  assert.throws(() => boundToolText('x', 0), /limit/i)
})
