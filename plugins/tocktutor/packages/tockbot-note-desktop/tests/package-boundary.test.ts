import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('declares the installable Desktop-only bundle and immutable peers', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'))
  assert.equal(manifest.name, 'tockbot-note-desktop')
  assert.equal(manifest.files.includes('README.md'), true)
  assert.equal(manifest.version, '0.1.2')
  assert.deepEqual(manifest.dsh, {
    bundle: { patch: './cordis.patch.yml' },
    client: {
      inject: ['@deepseek-ai/dsh-api-remotes', '@tockteam/desktop', '@tockteam/tocktutor-workbench'],
      platform: 'web',
      immediately: true,
    },
  })
  assert.equal(manifest.peerDependencies['@tockteam/desktop'], '>=0.1.11 <0.2.0')
  assert.equal(manifest.peerDependencies['@tockteam/tocktutor-workbench'], '0.1.7')
  assert.equal(manifest.peerDependencies['tockbot-note-runtime'], '0.1.2')
  assert.equal(manifest.devDependencies['@tockteam/desktop'], 'workspace:*')
  assert.equal(manifest.devDependencies['@tockteam/tocktutor-workbench'], 'workspace:0.1.7')
  assert.equal(manifest.devDependencies['tockbot-note-runtime'], 'workspace:0.1.2')
  assert.equal(JSON.stringify(manifest).includes('file:'), false)
  assert.equal(JSON.stringify(manifest).includes('/Users/'), false)
})

test('contributes one Host row and a real DSH client bundle', async () => {
  assert.equal(await readFile('cordis.patch.yml', 'utf8'), [
    '- insert:',
    '    - id: tockbot-note-desktop',
    "      name: 'tockbot-note-desktop'",
    '',
  ].join('\n'))
  const bundle = await readFile('dist/client.js', 'utf8')
  assert.match(bundle, /^window\.__ModuleLoader__\.load\(\{ id: "tockbot-note-desktop"/u)
  const remoteTypes = await readFile('dist/typert.remote-client.d.ts', 'utf8')
  assert.match(remoteTypes, /import type \{ DesktopVaultReference, NativeActionResult \} from 'tockbot-note-desktop\/types'/u)
  assert.doesNotMatch(remoteTypes, /expectedVault: VaultReference/u)
})

test('never imports Electron, vault paths, or environment/browser surface heuristics', async () => {
  const clientSource = (await Promise.all([
    readFile('src/client.ts', 'utf8'),
    readFile('src/client-api.ts', 'utf8'),
    readFile('src/client-actions.tsx', 'utf8'),
  ])).join('\n')
  const source = (await Promise.all([
    readFile('src/index.ts', 'utf8'),
    readFile('src/host-actions.ts', 'utf8'),
    readFile('src/guard.ts', 'utf8'),
    readFile('src/types.ts', 'utf8'),
  ])).join('\n') + clientSource
  assert.doesNotMatch(source, /from ['"]electron['"]/u)
  assert.doesNotMatch(source, /from ['"]node:(?:fs|path)['"]/u)
  assert.doesNotMatch(source, /process\.env|typeof window|navigator\.platform/u)
  assert.doesNotMatch(clientSource, /\b(?:canonicalPath|requestId|sessionId|windowId)\b/u)
})
