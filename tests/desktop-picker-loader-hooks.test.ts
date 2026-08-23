import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const temp = async (prefix: string) => await realpath(await mkdtemp(join(tmpdir(), prefix)))
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const ownedIdentity = (stat: Awaited<ReturnType<typeof lstat>>) => createHash('sha256').update([
  String(stat.dev), String(stat.ino), String(stat.mode), String(stat.birthtimeMs),
].join(':')).digest('hex')

test('managed picker production has no path deletion, replacement, or obsolete replacement artifacts', async () => {
  const source = await readFile(new URL('../src/desktop-picker-owner.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:unlinkSync|rmSync|rmdirSync|renameSync)\b|\b(?:unlink|rm|rmdir|rename)\s*\(/u)
  assert.doesNotMatch(source, /snapshotPath|backupPath|commitPath|replaceAuthorized/u)
})

function runHook(mode: string, destination: string, recoveryRoot: string, vault: string, result: string, foreign: string, stage?: string) {
  return spawnSync(process.execPath, [
    '--import', new URL('./fixtures/desktop-picker-no-delete-hook.mjs', import.meta.url).pathname,
    new URL('./fixtures/desktop-picker-hook-runner.ts', import.meta.url).pathname,
    mode, destination, recoveryRoot, vault, result,
  ], {
    encoding: 'utf8',
    env: { ...process.env, TOCKTEAM_HOOK_FOREIGN: foreign, TOCKTEAM_HOOK_MODE: mode, ...(stage === undefined ? {} : { TOCKTEAM_HOOK_STAGE: stage }) },
    timeout: 30_000,
  })
}

test('loader hooks preserve late occupants and source swaps at the final no-clobber link', async () => {
  for (const mode of ['link-source-swap', 'link-destination-occupy']) {
    const root = await temp(`tockteam-hook-${mode}-`)
    const recoveryRoot = await temp('tockteam-hook-recovery-')
    const vault = await temp('tockteam-hook-vault-')
    const result = join(await temp('tockteam-hook-result-'), 'result.json')
    const destination = join(root, 'output.html')
    const foreign = `foreign-${mode}`
    const child = runHook(mode, destination, recoveryRoot, vault, result, foreign)
    assert.equal(child.status, 0, child.stderr || child.stdout)
    assert.equal(JSON.parse(await readFile(result, 'utf8')).outcome, 'error:changed')
    assert.equal(await readFile(destination, 'utf8'), foreign)
    const stage = (await readdir(root)).find(name => name.startsWith('.tockteam-picker-stage-'))
    assert.ok(stage)
    if (mode === 'link-source-swap') {
      assert.equal((await readFile(join(root, stage, 'selected-file-recorded-owner'))).byteLength, 0)
      assert.equal(await readFile(join(root, stage, 'selected-file'), 'utf8'), foreign)
    } else {
      assert.equal((await readFile(join(root, stage, 'selected-file'))).byteLength, 0)
    }
  }
})

test('loader hook proves normal publication invokes no destructive managed-path primitive', async () => {
  const root = await temp('tockteam-hook-forbid-')
  const recoveryRoot = await temp('tockteam-hook-recovery-')
  const vault = await temp('tockteam-hook-vault-')
  const result = join(await temp('tockteam-hook-result-'), 'result.json')
  const destination = join(root, 'output.html')
  const child = runHook('forbid-destructive', destination, recoveryRoot, vault, result, 'foreign')
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(JSON.parse(await readFile(result, 'utf8')).outcome, 'published:retained')
  assert.equal(await readFile(destination, 'utf8'), 'reviewed-output')
})

test('startup journal-open swap preserves both files and blocks the current process', async () => {
  const root = await temp('tockteam-hook-journal-swap-')
  const recoveryRoot = await temp('tockteam-hook-recovery-')
  const vault = await temp('tockteam-hook-vault-')
  const result = join(await temp('tockteam-hook-result-'), 'result.json')
  const destination = join(root, 'output.html')
  const parentStat = await lstat(root)
  const journal = join(recoveryRoot, 'destination-swap.json')
  await writeFile(journal, JSON.stringify({
    destinationIdentity: null,
    destinationPath: destination,
    newDigest: sha(''),
    newSize: 0,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [],
    resolution: 'scrubbed',
    version: 2,
  }), { mode: 0o600 })
  const foreign = 'foreign-journal-occupant'
  const child = runHook('startup-journal-open-swap', destination, recoveryRoot, vault, result, foreign)
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(JSON.parse(await readFile(result, 'utf8')).outcome, 'error:recovery-required')
  assert.equal(await readFile(journal, 'utf8'), foreign)
  assert.equal(JSON.parse(await readFile(`${journal}-recorded-owner`, 'utf8')).resolution, 'scrubbed')
})

test('startup post-open resolved stage swap rebinds the path and blocks globally', async () => {
  const root = await temp('tockteam-hook-resolved-stage-swap-')
  const recoveryRoot = await temp('tockteam-hook-recovery-')
  const vault = await temp('tockteam-hook-vault-')
  const result = join(await temp('tockteam-hook-result-'), 'result.json')
  const nextDestination = join(root, 'next.html')
  const publishedDestination = join(root, 'published.html')
  const stageRoot = join(root, '.tockteam-picker-stage-resolved')
  const stage = join(stageRoot, 'selected-file')
  const secret = 'resolved-published-content'
  const foreign = 'foreign-resolved-stage'
  await mkdir(stageRoot, { mode: 0o700 })
  await writeFile(stage, secret, { mode: 0o600 })
  await link(stage, publishedDestination)
  const [parentStat, stageRootStat, stageStat, destinationStat] = await Promise.all([lstat(root), lstat(stageRoot), lstat(stage), lstat(publishedDestination)])
  await writeFile(join(recoveryRoot, 'destination-resolved.json'), JSON.stringify({
    destinationIdentity: ownedIdentity(destinationStat),
    destinationPath: publishedDestination,
    newDigest: sha(secret),
    newSize: secret.length,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [
      { disposition: 'scrubbed', identity: ownedIdentity(stageRootStat), kind: 'directory', path: stageRoot, size: 0 },
      { disposition: 'published-alias', identity: ownedIdentity(stageStat), kind: 'file', path: stage, size: secret.length },
    ],
    resolution: 'retained',
    version: 2,
  }), { mode: 0o600 })
  const child = runHook('startup-resolved-stage-open-swap', nextDestination, recoveryRoot, vault, result, foreign, stage)
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(JSON.parse(await readFile(result, 'utf8')).outcome, 'error:recovery-required')
  assert.equal(await readFile(stage, 'utf8'), foreign)
  assert.equal(await readFile(`${stage}-recorded-owner`, 'utf8'), secret)
  assert.equal(await readFile(publishedDestination, 'utf8'), secret)
})

test('startup unresolved stage swap preserves both occupants and blocks', async () => {
  const root = await temp('tockteam-hook-startup-')
  const recoveryRoot = await temp('tockteam-hook-recovery-')
  const vault = await temp('tockteam-hook-vault-')
  const result = join(await temp('tockteam-hook-result-'), 'result.json')
  const destination = join(root, 'output.html')
  const stageRoot = join(root, '.tockteam-picker-stage-startup')
  const stage = join(stageRoot, 'selected-file')
  const secret = 'unresolved-confidential-stage'
  const foreign = 'foreign-startup-stage'
  await mkdir(stageRoot, { mode: 0o700 })
  await writeFile(stage, secret, { mode: 0o600 })
  const [parentStat, stageRootStat, stageStat] = await Promise.all([lstat(root), lstat(stageRoot), lstat(stage)])
  await writeFile(join(recoveryRoot, 'destination-startup.json'), JSON.stringify({
    destinationIdentity: null,
    destinationPath: destination,
    newDigest: sha(secret),
    newSize: secret.length,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [
      { disposition: 'scrubbed', identity: ownedIdentity(stageRootStat), kind: 'directory', path: stageRoot, size: 0 },
      { disposition: 'scrubbed', identity: ownedIdentity(stageStat), kind: 'file', path: stage, size: 0 },
    ],
    resolution: 'unresolved',
    version: 2,
  }), { mode: 0o600 })
  const child = runHook('startup-stage-swap', destination, recoveryRoot, vault, result, foreign, stage)
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(await readFile(stage, 'utf8'), foreign)
  assert.equal(await readFile(`${stage}-recorded-owner`, 'utf8'), secret)
  await assert.rejects(readFile(destination), { code: 'ENOENT' })
})
