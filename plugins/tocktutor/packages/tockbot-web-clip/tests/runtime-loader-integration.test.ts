import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import NoteVaultRuntime, { NoteVaultError } from 'tockbot-note-runtime'
import WebClipHost from '../src/index.ts'

async function load(): Promise<{ context: Context, root: string, vaultRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), 'web-clip-runtime-'))
  const vaultRoot = join(root, 'vault')
  await mkdir(vaultRoot)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: 'tockbot-note-runtime'",
    '  config:',
    `    stateRoot: ${JSON.stringify(join(root, 'state'))}`,
    `    vaultRoot: ${JSON.stringify(vaultRoot)}`,
    "- name: 'tockbot-web-clip'",
    '',
  ].join('\n'))
  const context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier === 'tockbot-note-runtime') return NoteVaultRuntime
      if (specifier === 'tockbot-web-clip') return WebClipHost
      throw new Error(`unexpected Loader import: ${specifier}`)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  try {
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()
    return { context, root, vaultRoot }
  } catch (error) {
    await context.fiber.dispose()
    await rm(root, { force: true, recursive: true })
    throw error
  }
}

test('Loader applies a reviewed clip through the pinned runtime as the sole writer', async () => {
  const loaded = await load()
  try {
    const state = loaded.context.noteVault.state
    if (!state.active) assert.fail('configured runtime vault must be active')
    const vault = { generation: state.generation, id: state.id }
    const createReview = () => loaded.context.webClip.createClipReview({
      capturedAt: new Date('2026-01-02T03:04:05.000Z'),
      content: 'Pinned runtime content.',
      sourceUrl: 'https://example.com/article',
      title: 'Pinned Runtime',
      vault,
    })
    const approve = (preview: ReturnType<typeof createReview>) => ({
      contentDigest: preview.contentDigest,
      destination: preview.destination,
      expiresAt: preview.expiresAt,
      permission: 'user-approved' as const,
      reviewId: preview.reviewId,
      sourceUrl: preview.sourceUrl,
      target: preview.target,
      vault: preview.vault,
    })

    const preview = createReview()
    const created = await loaded.context.webClip.applyClipReview(approve(preview), new AbortController().signal)
    assert.equal(created.status, 'created')
    assert.equal(created.path, '2026-01-02-pinned-runtime.md')
    assert.equal(created.digest, preview.contentDigest)
    assert.equal(await readFile(join(loaded.vaultRoot, '2026-01-02-pinned-runtime.md'), 'utf8'), preview.markdown)
    assert.match(preview.markdown, /source: https:\/\/example\.com\/article/u)

    const conflict = createReview()
    await assert.rejects(
      loaded.context.webClip.applyClipReview(approve(conflict), new AbortController().signal),
      error => error instanceof NoteVaultError && error.code === 'exists',
    )
    assert.equal(await readFile(join(loaded.vaultRoot, '2026-01-02-pinned-runtime.md'), 'utf8'), preview.markdown)
  } finally {
    await loaded.context.fiber.dispose()
    await rm(loaded.root, { force: true, recursive: true })
  }
})
