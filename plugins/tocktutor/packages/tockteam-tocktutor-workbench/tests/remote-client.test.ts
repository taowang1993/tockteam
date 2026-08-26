import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, { default: string; types: string }>
}

function codecAccepts(codec: TypertCodec, value: unknown): boolean {
  assert.equal(codec.mode, 'strict')
  if (codec.mode !== 'strict') assert.fail('expected a strict generated codec')
  try {
    codec.schema.parse(value)
    return true
  } catch {
    return false
  }
}

test('publishes deterministic strict read, tree, save, and recovery Remote artifacts', async () => {
  assert.deepEqual(manifest.exports['./typert'], {
    types: './dist/typert.host.d.ts',
    default: './dist/typert.host.js',
  })
  assert.deepEqual(manifest.exports['./remote'], {
    types: './dist/typert.remote-client.d.ts',
    default: './dist/typert.remote-client.js',
  })

  const { default: remote } = await import('../dist/typert.remote-client.js')
  assert.equal(remote.package, '@tockteam/tocktutor-workbench')
  assert.deepEqual(remote.descriptors.map(descriptor => descriptor.method), [
    'activateRecentVault',
    'clearDraft',
    'createDocument',
    'currentVault',
    'facets',
    'links',
    'listRecentVaults',
    'listSnapshots',
    'listTrash',
    'listTree',
    'openDocument',
    'openSandboxVault',
    'outline',
    'readDraft',
    'readSnapshot',
    'removeRecentVault',
    'restoreSnapshotAsNew',
    'restoreTrash',
    'saveDocument',
    'saveDraft',
    'search',
    'trashEntry',
  ])
  for (const descriptor of remote.descriptors) {
    assert.deepEqual(descriptor.cancellation, { parameter: 'signal' })
    assert.equal(descriptor.namespace, 'tocktutorWorkbench')
    assert.equal(descriptor.service, 'tocktutorWorkbench')
    assert.equal(descriptor.result.mode, 'strict')
    assert.equal(descriptor.parameters.every(parameter => parameter.codec.mode === 'strict'), true)
    assert.deepEqual(
      descriptor.parameters.map(parameter => parameter.name),
      descriptor.method === 'currentVault' || descriptor.method === 'listRecentVaults'
        ? []
        : descriptor.method === 'openDocument' ? ['path', 'expectedVault'] : ['request'],
    )
  }

  const open = remote.descriptors.find(descriptor => descriptor.method === 'openDocument')!
  assert.equal(codecAccepts(open.parameters[0]!.codec, '../escape.md'), true)
  assert.equal(codecAccepts(open.parameters[1]!.codec, { generation: 7, id: `vault:${'f'.repeat(64)}` }), true)
  assert.equal(codecAccepts(open.parameters[1]!.codec, { generation: '7', id: 'unsafe' }), false)
  assert.equal(codecAccepts(open.result, {
    content: '# Exact\n',
    digest: `sha256:${'a'.repeat(64)}`,
    generation: 7,
    path: 'Note.md',
    revision: `file:${'b'.repeat(64)}`,
  }), true)
  assert.equal(codecAccepts(open.result, { content: '# Missing identity\n' }), false)

  const save = remote.descriptors.find(descriptor => descriptor.method === 'saveDocument')!
  const expectedVault = { generation: 7, id: `vault:${'f'.repeat(64)}` }
  assert.equal(codecAccepts(save.parameters[0]!.codec, {
    content: '# Saved\n',
    expectedRevision: `file:${'c'.repeat(64)}`,
    expectedVault,
    path: 'Note.md',
  }), true)
  assert.equal(codecAccepts(save.parameters[0]!.codec, {
    content: '# Missing revision\n',
    expectedVault,
    path: 'Note.md',
  }), false)
  assert.equal(codecAccepts(save.result, {
    digest: `sha256:${'d'.repeat(64)}`,
    generation: 7,
    path: 'Note.md',
    revision: `file:${'e'.repeat(64)}`,
    snapshotId: '2026-08-22T18-00-00-000Z-deadbeef',
    status: 'saved',
  }), true)
  assert.equal(codecAccepts(save.result, {
    digest: `sha256:${'d'.repeat(64)}`,
    generation: 7,
    path: 'Note.md',
    revision: `file:${'e'.repeat(64)}`,
    status: 'saved',
  }), false)
})

test('regenerates byte-identical pinned artifacts', async () => {
  const paths = [
    '../dist/typert.host.js',
    '../dist/typert.host.d.ts',
    '../dist/typert.remote-client.js',
    '../dist/typert.remote-client.d.ts',
    '../dist/typert.remote-client.d.ts.map',
  ]
  const before = await Promise.all(paths.map(path => readFile(new URL(path, import.meta.url), 'utf8')))
  await import(`../scripts/generate-typert.mjs?determinism=${String(Date.now())}`)
  const after = await Promise.all(paths.map(path => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.deepEqual(after, before)
})

test('client entry mounts exactly one generated contribution and returns its disposer', async () => {
  const client = await import('../dist/client-api.js')
  const { default: remote } = await import('../dist/typert.remote-client.js')
  const mounted: TypertRemoteContribution[] = []
  let disposed = 0
  const context = {
    inject(_deps: string[], callback: (child: unknown) => unknown) {
      let disposeChild: unknown
      const settled = Promise.resolve().then(() => { disposeChild = callback(context) })
      return Object.assign(settled.then(() => undefined), {
        async dispose() {
          await settled.catch(() => undefined)
          if (typeof disposeChild === 'function') await disposeChild()
        },
      })
    },
    remote: {
      $on() { return () => {} },
      async $mount(contribution: TypertRemoteContribution) {
        mounted.push(contribution)
        return async () => { disposed += 1 }
      },
      tocktutorWorkbench: {},
    },
    slots: {
      inject() { return () => {} },
    },
  }

  const dispose = await client.apply(context as never)
  assert.deepEqual(mounted, [remote])
  await dispose()
  assert.equal(disposed, 1)
})

test('client mount fails closed when the Remote carrier rejects the contribution', async () => {
  const client = await import('../dist/client-api.js')
  const failure = new Error('carrier unavailable')
  await assert.rejects(client.apply({
    remote: { $mount: () => Promise.reject(failure) },
  } as never), error => error === failure)
})
