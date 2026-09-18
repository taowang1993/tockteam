import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishTrustedRaycastProofExclusive } from '../scripts/trusted-raycast-proof-publication.ts'

async function fixture(): Promise<{ destination: string; root: string; staging: string }> {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-proof-publication-'))
  const staging = join(root, 'staging'); await mkdir(join(staging, 'reference'), { recursive: true })
  await writeFile(join(staging, 'reference', 'image.png'), 'image')
  await writeFile(join(staging, 'proof.json'), '{"complete":true}\n')
  return { destination: join(root, 'published'), root, staging }
}

test('publishes a complete proof exclusively and removes its staging directory', async () => {
  const value = await fixture()
  try {
    await publishTrustedRaycastProofExclusive(value.staging, value.destination)
    assert.equal(existsSync(value.staging), false)
    assert.equal(await readFile(join(value.destination, 'proof.json'), 'utf8'), '{"complete":true}\n')
    assert.equal(await readFile(join(value.destination, 'reference', 'image.png'), 'utf8'), 'image')
  } finally { await rm(value.root, { recursive: true, force: true }) }
})

test('preserves an existing destination and rejects staged symbolic links', async () => {
  const existing = await fixture()
  try {
    await mkdir(existing.destination); await writeFile(join(existing.destination, 'sentinel'), 'owned')
    await assert.rejects(() => publishTrustedRaycastProofExclusive(existing.staging, existing.destination), /EEXIST/u)
    assert.equal(await readFile(join(existing.destination, 'sentinel'), 'utf8'), 'owned')
  } finally { await rm(existing.root, { recursive: true, force: true }) }

  const linked = await fixture()
  try {
    await symlink(join(linked.staging, 'proof.json'), join(linked.staging, 'reference', 'link'))
    await assert.rejects(() => publishTrustedRaycastProofExclusive(linked.staging, linked.destination), /symbolic link/u)
    assert.equal(existsSync(linked.destination), false)
  } finally { await rm(linked.root, { recursive: true, force: true }) }
})
