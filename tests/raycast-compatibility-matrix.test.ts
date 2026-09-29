import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import matrix from './fixtures/raycast-compatibility-matrix.json' with { type: 'json' }
import { getTrustedRaycastDescriptor } from '../src/trusted-raycast-descriptors.ts'

test('pinned compatibility matrix records real commands without claiming unmeasured support', () => {
  assert.match(matrix.revision, /^[a-f0-9]{40}$/)
  assert.ok(matrix.commands.length + matrix.bundledOnly.length >= 10)
  assert.deepEqual(new Set(matrix.commands.map(({ extensionId, command }) => `${extensionId}/${command}`)).size, matrix.commands.length)
  for (const mode of ['view', 'no-view', 'menu-bar']) assert.ok(matrix.commands.some(command => command.mode === mode))
  for (const command of matrix.commands) {
    assert.match(command.blob, /^[a-f0-9]{40}$/)
    assert.ok(command.needs.length > 0)
    const descriptor = getTrustedRaycastDescriptor(command.extensionId)
    assert.equal(command.admitted, descriptor?.command === command.command)
  }
  for (const bundled of matrix.bundledOnly) {
    assert.equal(getTrustedRaycastDescriptor(bundled.extensionId)?.command, bundled.command)
    assert.match(bundled.revision, /^[a-f0-9]{40}$/)
  }
})

test('optional local research samples match pinned source and command blobs without executing them', t => {
  const root = process.env.RAYCAST_EXTENSION_SAMPLES
  if (!root) return t.skip('set RAYCAST_EXTENSION_SAMPLES to verify the separately stored upstream source snapshot')
  const provenance = JSON.parse(readFileSync(join(root, 'SOURCE.json'), 'utf8')) as { revision: string; files: { path: string; sha: string }[] }
  assert.equal(provenance.revision, matrix.revision)
  const source = new Map(provenance.files.map(file => [file.path, file.sha]))
  for (const { extensionId, command, blob, mode } of matrix.commands) {
    const manifest = JSON.parse(readFileSync(join(root, extensionId, 'package.json'), 'utf8')) as { commands: { name: string; mode: string }[] }
    assert.equal(manifest.commands.find(entry => entry.name === command)?.mode, mode)
    const relative: string | undefined = [`${extensionId}/src/${command}.tsx`, `${extensionId}/src/${command}.ts`].find(file => existsSync(join(root, file)))
    assert.ok(relative, `${extensionId}/${command} source exists`)
    const bytes: Buffer = readFileSync(join(root, relative))
    const actual: string = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    assert.equal(actual, blob)
    assert.equal(source.get(relative), blob)
  }
})
