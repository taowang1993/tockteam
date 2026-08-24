import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import {
  AssistantProposalStateStore,
  MAX_PROPOSAL_STATE_BYTES,
} from '../src/proposal-state.ts'
import { ProposalError, ProposalQueue, type StageProposalInput } from '../src/proposals.ts'

const proposal: StageProposalInput = {
  vaultId: 'vault-state-12345678',
  vaultGeneration: 3,
  destination: 'Notes/Restart.md',
  operation: 'create',
  expectedTarget: { exists: false },
  content: '# Restart-safe private proposal',
  childInstanceId: 'child-state-12345678',
  turnId: 'turn-state-12345678',
  requestId: 'request-state-12345678',
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  writePermission: 'propose',
  permissionEpoch: 7,
}

async function context(root: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  return ctx
}

test('durably hydrates bounded queue and audit state through the approved atomic storage domain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-proposal-state-'))
  const first = await context(root)
  try {
    const store = await AssistantProposalStateStore.open(first.storageDomain)
    const queue = new ProposalQueue()
    const staged = queue.stage(proposal)
    queue.reject(staged.proposalId, 'User rejected after review.')
    await store.save(queue, 7)
    await store.close()

    const names = await readdir(root)
    assert.deepEqual(names, ['tocktutor_assistant.json'])
    assert.equal(names.some(name => name.endsWith('.tmp')), false)
    const persisted = await readFile(join(root, names[0]!), 'utf8')
    assert.ok(Buffer.byteLength(persisted, 'utf8') <= MAX_PROPOSAL_STATE_BYTES)
    assert.doesNotMatch(persisted, /approvalToken/u)
  } finally {
    await first.fiber.dispose()
  }

  const second = await context(root)
  try {
    const store = await AssistantProposalStateStore.open(second.storageDomain)
    const restored = store.load()
    assert.equal(restored.permissionEpoch, 7)
    assert.deepEqual(restored.queue.list(), [])
    assert.deepEqual(restored.queue.audit().map(entry => entry.outcome), ['staged', 'rejected'])
    await store.close()
  } finally {
    await second.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('malformed or oversized persisted state fails activation closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-proposal-corrupt-'))
  await mkdir(root, { recursive: true })
  const path = join(root, 'tocktutor_assistant.json')
  try {
    await writeFile(path, JSON.stringify({
      unit: { name: 'tocktutor_assistant', version: 1 },
      global: { permissionEpoch: 0, queue: '{bad' },
      tables: {},
    }))
    const malformed = await context(root)
    try {
      await assert.rejects(
        AssistantProposalStateStore.open(malformed.storageDomain),
        error => error instanceof ProposalError && error.code === 'CORRUPT_QUEUE',
      )
    } finally {
      await malformed.fiber.dispose()
    }

    await writeFile(path, JSON.stringify({
      unit: { name: 'tocktutor_assistant', version: 1 },
      global: { permissionEpoch: 0, queue: 'x'.repeat(MAX_PROPOSAL_STATE_BYTES + 1) },
      tables: {},
    }))
    const oversized = await context(root)
    try {
      await assert.rejects(AssistantProposalStateStore.open(oversized.storageDomain))
    } finally {
      await oversized.fiber.dispose()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
