import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import WebClipHost, { ClipRuntimeError } from '../src/index.ts'

const packageName = 'tockbot-web-clip'

async function load(config = ''): Promise<{ context: Context; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'web-clip-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    `- name: '${packageName}'`,
    ...(config ? ['  config:', ...config.split('\n').map(line => `    ${line}`)] : []),
    '',
  ].join('\n'))

  const context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== packageName) throw new Error(`unexpected Loader import: ${specifier}`)
      return WebClipHost
    },
  } as unknown as NonNullable<typeof context.loader.internal>

  try {
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()
    return { context, root }
  } catch (error) {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

async function dispose(context: Context, root: string): Promise<void> {
  await context.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}

test('Loader mounts and disposes the bounded Host fetch service', async () => {
  const { context, root } = await load()
  try {
    assert.ok(context.webClip instanceof WebClipHost)
    const host = context.webClip
    const vault = { generation: 2, id: 'vault:loader' }
    const input = {
      capturedAt: new Date('2026-01-02T03:04:05.000Z'),
      content: 'Readable body.',
      sourceUrl: 'https://example.com/article',
      title: 'Article',
      vault,
    }
    const approved = host.createClipReview(input)
    assert.equal(host.consumeClipReview({
      contentDigest: approved.contentDigest,
      destination: approved.destination,
      expiresAt: approved.expiresAt,
      permission: 'user-approved',
      reviewId: approved.reviewId,
      sourceUrl: approved.sourceUrl,
      target: approved.target,
      vault: approved.vault,
    }, vault).path, approved.destination)
    const pending = host.createClipReview(input)
    const entry = [...context.loader.entries()].find(item => item.options.name === packageName)
    if (entry?.fiber === undefined) throw new Error('web clip Loader entry is not active')

    await entry.fiber.dispose()

    assert.equal(context.get('webClip'), undefined)
    assert.throws(() => host.consumeClipReview({
      contentDigest: pending.contentDigest,
      destination: pending.destination,
      expiresAt: pending.expiresAt,
      permission: 'user-approved',
      reviewId: pending.reviewId,
      sourceUrl: pending.sourceUrl,
      target: pending.target,
      vault: pending.vault,
    }, vault), (error: unknown) => error instanceof ClipRuntimeError && error.code === 'runtime-unavailable')
  } finally {
    await dispose(context, root)
  }
})

test('Loader rejects invalid or effectively unbounded limits', async () => {
  await assert.rejects(load('timeoutMs: 0'), /timeoutMs/i)
  for (const key of [
    'connectTimeoutMs',
    'maxAddresses',
    'maxConcurrentRequests',
    'maxParserInputChars',
    'maxParserTokens',
    'maxReaderOutputChars',
    'maxReaderTitleChars',
    'maxReaderWarningChars',
    'maxReaderWarnings',
    'maxRedirects',
    'maxResponseBytes',
    'maxResponseHeadersBytes',
    'maxTextChars',
    'maxUrlBytes',
    'timeoutMs',
  ]) {
    await assert.rejects(load(`${key}: ${String(Number.MAX_SAFE_INTEGER)}`), new RegExp(key, 'iu'))
  }
})
