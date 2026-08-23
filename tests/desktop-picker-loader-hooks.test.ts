import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { link, lstat, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const temp = async (prefix: string) => await realpath(await mkdtemp(join(tmpdir(), prefix)))
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const ownedIdentity = (stat: Awaited<ReturnType<typeof lstat>>) => createHash('sha256').update([
  String(stat.dev), String(stat.ino), String(stat.mode), String(stat.birthtimeMs),
].join(':')).digest('hex')

async function writeScrubbedJournal(root: string, recoveryRoot: string, suffix: string) {
  const stage = join(root, `.tockteam-picker-stage-${suffix}`)
  await writeFile(stage, '', { mode: 0o600 })
  const [parentStat, stageStat] = await Promise.all([lstat(root), lstat(stage)])
  const journal = join(recoveryRoot, `destination-${suffix}.json`)
  await writeFile(journal, JSON.stringify({
    destinationIdentity: null,
    destinationPath: join(root, `${suffix}.html`),
    newDigest: sha(''),
    newSize: 0,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [{ disposition: 'scrubbed', identity: ownedIdentity(stageStat), kind: 'file', path: stage, size: 0 }],
    resolution: 'scrubbed',
    version: 2,
  }), { mode: 0o600 })
  return { journal, stage }
}

test('managed picker production has no path deletion, replacement, or obsolete replacement artifacts', async () => {
  const source = await readFile(new URL('../src/desktop-picker-owner.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:unlinkSync|rmSync|rmdirSync|renameSync)\b|\b(?:unlink|rm|rmdir|rename)\s*\(/u)
  assert.doesNotMatch(source, /snapshotPath|backupPath|commitPath|replaceAuthorized|stagingRoot|opendir\(directoryResidue/u)
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

test('loader hooks preserve late occupants and flat-stage source swaps at final link', async () => {
  for (const mode of ['link-source-swap', 'link-destination-occupy']) {
    const root = await temp(`tockteam-hook-${mode}-`)
    const recoveryRoot = await temp('tockteam-hook-recovery-')
    const vault = await temp('tockteam-hook-vault-')
    const result = join(await temp('tockteam-hook-result-'), 'result.json')
    const destination = join(root, 'output.html')
    const foreign = `foreign-${mode}`
    const child = runHook(mode, destination, recoveryRoot, vault, result, foreign)
    assert.equal(child.status, 0, child.stderr || child.stdout)
    assert.equal(JSON.parse(await readFile(result, 'utf8')).outcome, 'error:recovery-required')
    assert.equal(await readFile(destination, 'utf8'), foreign)
    const stage = (await readdir(root)).find(name => name.startsWith('.tockteam-picker-stage-'))
    assert.ok(stage)
    if (mode === 'link-source-swap') {
      assert.equal((await readFile(join(root, `${stage}-recorded-owner`))).byteLength, 0)
      assert.equal(await readFile(join(root, stage), 'utf8'), foreign)
    } else {
      assert.equal((await readFile(join(root, stage))).byteLength, 0)
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

test('startup recovery-root opendir swap cannot hide a flat unresolved journal', async () => {
  const root = await temp('tockteam-hook-recovery-root-swap-')
  const recoveryRoot = await temp('tockteam-hook-recovery-')
  const vault = await temp('tockteam-hook-vault-')
  const result = join(await temp('tockteam-hook-result-'), 'result.json')
  const destination = join(root, 'next.html')
  const { journal, stage } = await writeScrubbedJournal(root, recoveryRoot, 'root-swap')
  const record = JSON.parse(await readFile(journal, 'utf8'))
  record.resolution = 'unresolved'
  await writeFile(journal, JSON.stringify(record), { mode: 0o600 })
  const child = runHook('startup-recovery-root-opendir-swap', destination, recoveryRoot, vault, result, 'foreign')
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(JSON.parse(await readFile(result, 'utf8')).outcome, 'error:recovery-required')
  assert.equal((await readFile(stage)).byteLength, 0)
  assert.equal(JSON.parse(await readFile(journal, 'utf8')).resolution, 'unresolved')
})

test('startup journal growth, same-size rewrite, and shrink block globally', async () => {
  for (const mode of ['startup-journal-growth', 'startup-journal-same-size', 'startup-journal-shrink']) {
    const root = await temp(`tockteam-hook-${mode}-`)
    const recoveryRoot = await temp('tockteam-hook-recovery-')
    const vault = await temp('tockteam-hook-vault-')
    const result = join(await temp('tockteam-hook-result-'), 'result.json')
    const destination = join(root, 'next.html')
    const { journal, stage } = await writeScrubbedJournal(root, recoveryRoot, mode)
    const child = runHook(mode, destination, recoveryRoot, vault, result, 'foreign')
    assert.equal(child.status, 0, child.stderr || child.stdout)
    assert.equal(JSON.parse(await readFile(result, 'utf8')).outcome, 'error:recovery-required')
    assert.equal((await readFile(stage)).byteLength, 0)
    if (mode === 'startup-journal-growth') assert.ok((await lstat(journal)).size > 64 * 1024)
  }
})

test('startup journal-open swap preserves both files and blocks current process', async () => {
  const root = await temp('tockteam-hook-journal-swap-')
  const recoveryRoot = await temp('tockteam-hook-recovery-')
  const vault = await temp('tockteam-hook-vault-')
  const result = join(await temp('tockteam-hook-result-'), 'result.json')
  const destination = join(root, 'next.html')
  const { journal } = await writeScrubbedJournal(root, recoveryRoot, 'swap')
  const foreign = 'foreign-journal-occupant'
  const child = runHook('startup-journal-open-swap', destination, recoveryRoot, vault, result, foreign)
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(JSON.parse(await readFile(result, 'utf8')).outcome, 'error:recovery-required')
  assert.equal(await readFile(journal, 'utf8'), foreign)
  assert.equal(JSON.parse(await readFile(`${journal}-recorded-owner`, 'utf8')).resolution, 'scrubbed')
})

test('startup post-open resolved flat-stage swap rebinds path and blocks globally', async () => {
  const root = await temp('tockteam-hook-resolved-stage-swap-')
  const recoveryRoot = await temp('tockteam-hook-recovery-')
  const vault = await temp('tockteam-hook-vault-')
  const result = join(await temp('tockteam-hook-result-'), 'result.json')
  const nextDestination = join(root, 'next.html')
  const publishedDestination = join(root, 'published.html')
  const stage = join(root, '.tockteam-picker-stage-resolved')
  const secret = 'resolved-published-content'
  const foreign = 'foreign-resolved-stage'
  await writeFile(stage, secret, { mode: 0o600 })
  await link(stage, publishedDestination)
  const [parentStat, stageStat, destinationStat] = await Promise.all([lstat(root), lstat(stage), lstat(publishedDestination)])
  await writeFile(join(recoveryRoot, 'destination-resolved.json'), JSON.stringify({
    destinationIdentity: ownedIdentity(destinationStat),
    destinationPath: publishedDestination,
    newDigest: sha(secret),
    newSize: secret.length,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [{ disposition: 'published-alias', identity: ownedIdentity(stageStat), kind: 'file', path: stage, size: secret.length }],
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

test('startup unresolved flat-stage swap preserves both occupants and blocks', async () => {
  const root = await temp('tockteam-hook-startup-')
  const recoveryRoot = await temp('tockteam-hook-recovery-')
  const vault = await temp('tockteam-hook-vault-')
  const result = join(await temp('tockteam-hook-result-'), 'result.json')
  const destination = join(root, 'output.html')
  const stage = join(root, '.tockteam-picker-stage-startup')
  const secret = 'unresolved-confidential-stage'
  const foreign = 'foreign-startup-stage'
  await writeFile(stage, secret, { mode: 0o600 })
  const [parentStat, stageStat] = await Promise.all([lstat(root), lstat(stage)])
  await writeFile(join(recoveryRoot, 'destination-startup.json'), JSON.stringify({
    destinationIdentity: null,
    destinationPath: destination,
    newDigest: sha(secret),
    newSize: secret.length,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [{ disposition: 'scrubbed', identity: ownedIdentity(stageStat), kind: 'file', path: stage, size: 0 }],
    resolution: 'unresolved',
    version: 2,
  }), { mode: 0o600 })
  const child = runHook('startup-stage-swap', destination, recoveryRoot, vault, result, foreign, stage)
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(await readFile(stage, 'utf8'), foreign)
  assert.equal(await readFile(`${stage}-recorded-owner`, 'utf8'), secret)
  await assert.rejects(readFile(destination), { code: 'ENOENT' })
})
