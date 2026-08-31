import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { desktopArtifact, packPlugin, repositoryRoot } from '../../../test-utils.ts'

const execFile = promisify(execFileCallback)
const root = dirname(dirname(fileURLToPath(import.meta.url)))

async function run(command: string, args: string[], cwd: string): Promise<string> {
  const result = await execFile(command, args, { cwd, maxBuffer: 10 * 1024 * 1024 })
  return result.stdout
}

test('fresh packed artifact runs through the pinned Loader and retained authorities', { timeout: 120_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'web-clip-package-'))
  const packRoot = join(temporary, 'pack')
  const consumerRoot = join(temporary, 'consumer')
  const artifact = join(packRoot, 'tockbot-web-clip-0.1.2.tgz')
  try {
    await run('mkdir', ['-p', packRoot, consumerRoot], temporary)
    await run('pnpm', ['pack', '--pack-destination', packRoot], root)
    const runtimeArtifact = await packPlugin('tockbot-note-runtime', packRoot)
    const vaultArtifact = await packPlugin('tockbot-note-vault', packRoot)
    const entries = await run('tar', ['-tzf', artifact], temporary)
    assert.match(entries, /package\/lib\/index\.js/u)
    assert.match(entries, /package\/lib\/client\.js/u)
    assert.match(entries, /package\/cordis\.patch\.yml/u)
    assert.doesNotMatch(entries, /package\/(?:src|tests)\//u)

    const pin = JSON.parse(await readFile(join(repositoryRoot, 'dsh-source.json'), 'utf8')) as { revision?: unknown }
    assert.equal(pin.revision, 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e')
    const desktopMain = await run('tar', ['-xOf', desktopArtifact, 'package/dist/main.js'], temporary)
    for (const invariant of [
      "default-src 'none'",
      'webPreferences.nodeIntegration = false',
      'webPreferences.javascript = false',
      'webPreferences.sandbox = true',
      'guestSession.setPermissionRequestHandler',
      'guestSession.webRequest.onBeforeRequest',
    ]) assert.match(desktopMain, new RegExp(invariant.replaceAll('.', '\\.'), 'u'))

    await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({
      name: 'web-clip-disposable-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@deepseek-ai/cordis': '4.0.1',
        '@deepseek-ai/cordis-plugin-include': '1.0.6',
        '@deepseek-ai/cordis-plugin-loader': '1.0.2',
        react: '18.3.1',
        'tockbot-note-runtime': `file:${runtimeArtifact}`,
        'tockbot-note-vault': `file:${vaultArtifact}`,
        'tockbot-web-clip': `file:${artifact}`,
      },
    }, null, 2))
    await run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], consumerRoot)

    const nonce = randomUUID()
    const script = `
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { NoteVaultError } from 'tockbot-note-runtime'
import { WebFetchError, fetchPublicText, projectReaderView } from 'tockbot-web-clip'

const nonce = ${JSON.stringify(nonce)}
const root = process.cwd()
const metadata = JSON.parse(await readFile(join(root, 'node_modules/tockbot-web-clip/package.json'), 'utf8'))
assert.deepEqual(metadata.dsh.client.inject, ['@tockteam/desktop', '@tockteam/sidebar', '@tockteam/tocktutor-workbench'])
let clientRegistration
Object.assign(globalThis, {
  window: { __ModuleLoader__: { load(value) { clientRegistration = value } } },
})
await import('tockbot-web-clip/client')
assert.equal(clientRegistration?.id, 'tockbot-web-clip')
const clientPlugin = clientRegistration.factory(id => {
  if (id === 'react') return { forwardRef(render) { return render }, useCallback() {}, useEffect() {}, useRef() {}, useState() {} }
  if (id === 'react/jsx-runtime') return { jsx() {}, jsxs() {} }
  throw new Error('unexpected client import: ' + id)
})
assert.equal(typeof clientPlugin.apply, 'function')
delete globalThis.window

const vaultRoot = join(root, 'vault')
await mkdir(vaultRoot)
await writeFile(join(root, 'cordis.yml'), [
  "- name: 'tockbot-note-runtime'",
  '  config:',
  '    stateRoot: ' + JSON.stringify(join(root, 'state')),
  '    vaultRoot: ' + JSON.stringify(vaultRoot),
  "- name: 'tockbot-web-clip'",
  '',
].join('\\n'))

const fixtureFetch = async (url, signal) => await fetchPublicText(url, {
  lookup: async hostname => [{ address: hostname === 'fixture.example' ? '93.184.216.34' : '1.1.1.1' }],
  request: async request => {
    assert.deepEqual(request.headers, {
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
      'accept-encoding': 'identity',
    })
    return request.url.includes('/start')
      ? new Response(null, { status: 302, headers: { location: 'https://final.example/article' } })
      : new Response('<title>' + nonce + '</title><main><p>' + nonce + '</p><script>active()</script></main>', {
          headers: { 'content-type': 'text/html' },
        })
  },
  signal,
})

const context = new Context()
context.baseUrl = pathToFileURL(root).href + '/'
await context.plugin(Loader)
context.loader.builtins.include = Include
try {
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(join(root, 'cordis.yml')).href },
  })
  await context.loader.await()
  const host = context.webClip
  const fixtureResult = await fixtureFetch('https://fixture.example/start', new AbortController().signal)
  assert.equal(fixtureResult.url, 'https://final.example/article')
  assert.match(projectReaderView(fixtureResult).content, new RegExp(nonce, 'u'))
  const publicUrl = 'https://httpbin.org/base64/' + Buffer.from(nonce).toString('base64url')
  const reader = await host.readerView(publicUrl)
  assert.match(reader.content, new RegExp(nonce, 'u'))
  const page = await host.viewerPage(publicUrl)
  assert.match(page.html, new RegExp(nonce, 'u'))
  assert.doesNotMatch(page.html, /script|active\\(\\)/iu)

  await assert.rejects(
    fetchPublicText('http://127.0.0.1/', { request: async () => { throw new Error('must not request') } }),
    error => error instanceof WebFetchError && error.code === 'address',
  )
  await assert.rejects(fetchPublicText('https://fixture.example/', {
    limits: { maxResponseBytes: 4 },
    lookup: async () => [{ address: '93.184.216.34' }],
    request: async () => new Response('oversized', { headers: { 'content-type': 'text/plain' } }),
  }), error => error instanceof WebFetchError && error.code === 'body')
  await assert.rejects(fetchPublicText('https://fixture.example/', {
    lookup: async () => [{ address: '93.184.216.34' }],
    request: async () => new Response('png', { headers: { 'content-type': 'image/png' } }),
  }), error => error instanceof WebFetchError && error.code === 'content-type')

  const preview = await host.createClipReviewFromUrl({
    destination: nonce + '.md',
    url: publicUrl,
  }, new AbortController().signal)
  assert.match(preview.markdown, new RegExp(nonce, 'u'))
  const approve = value => ({
    contentDigest: value.contentDigest,
    destination: value.destination,
    expiresAt: value.expiresAt,
    permission: 'user-approved',
    reviewId: value.reviewId,
    sourceUrl: value.sourceUrl,
    target: value.target,
    vault: value.vault,
  })
  const created = await host.applyClipReview(approve(preview), new AbortController().signal)
  assert.equal(created.digest, preview.contentDigest)
  assert.equal(await readFile(join(vaultRoot, preview.destination), 'utf8'), preview.markdown)
  const conflict = host.createClipReview({
    capturedAt: new Date(),
    content: nonce,
    destination: preview.destination,
    sourceUrl: preview.sourceUrl,
    title: nonce,
    vault: preview.vault,
  })
  await assert.rejects(
    host.applyClipReview(approve(conflict), new AbortController().signal),
    error => error instanceof NoteVaultError && error.code === 'exists',
  )

  const entry = [...context.loader.entries()].find(value => value.options.name === 'tockbot-web-clip')
  assert.ok(entry?.fiber)
  await entry.fiber.dispose()
  assert.equal(context.get('webClip'), undefined)
} finally {
  await context.fiber.dispose()
}
`
    await writeFile(join(consumerRoot, 'consumer.mjs'), script)
    await run(process.execPath, ['consumer.mjs'], consumerRoot)
  } finally {
    await rm(temporary, { force: true, recursive: true })
  }
})
