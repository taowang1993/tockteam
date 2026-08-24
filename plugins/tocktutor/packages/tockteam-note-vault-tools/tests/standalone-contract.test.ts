import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue, ToolDefinition } from '@deepseek-ai/dsh-tools'
// @ts-expect-error The standalone plugin intentionally publishes no root declarations.
import { apply as applyStandalone } from 'tockbot-note-vault'
import { apply as applyConsumer } from '../src/index.ts'

function publicContract(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    output: tool.output.schema,
  }
}

test('all eight public contracts exactly match standalone note-vault 0.6.0', async () => {
  const root = await mkdtemp(join(tmpdir(), 'note-vault-contract-'))
  try {
    const expected: ToolDefinition[] = []
    await applyStandalone({
      tools: { register(tool: ToolDefinition) { expected.push(tool) } },
    }, {
      root,
      maxReadBytes: 256 * 1024,
      maxSearchBytes: 64 * 1024 * 1024,
      maxSearchEntries: 20_000,
      maxSearchFileBytes: 2 * 1024 * 1024,
      maxSearchResults: 50,
    })

    const actual: ToolDefinition[] = []
    applyConsumer({
      noteVault: { state: { active: true, generation: 1, id: 'vault:test' } },
      tools: { register(tool: ToolDefinition) { actual.push(tool) } },
    } as unknown as Context)

    assert.deepEqual(actual.map(publicContract), expected.map(publicContract))
    assert.equal(actual.length, 8)
    for (let index = 0; index < actual.length; index += 1) {
      const expectedTool = expected[index]
      const actualTool = actual[index]
      assert.ok(expectedTool && actualTool)
      assert.equal(actualTool.isConcurrencySafe?.({}), expectedTool.isConcurrencySafe?.({}))
      const value = (actualTool.name === 'vault_read'
        ? { path: 'note.md', content: 'canary' }
        : { canary: index }) as JsonValue
      assert.deepEqual(
        actualTool.output.render({}, value),
        expectedTool.output.render({}, value),
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
