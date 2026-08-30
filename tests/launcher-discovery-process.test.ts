import assert from 'node:assert/strict'
import { lstat, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  launchDetachedLauncherExecutable,
  resolveLinuxDesktopEntryInvocation,
  resolveWindowsApplicationElevationInvocation,
  revalidateLauncherPath,
  revalidateLauncherUrl,
  resolveLauncherExecutable,
  revalidateLauncherWindowsStoreId,
  revalidateLauncherVscodeUri,
} from '../src/launcher-discovery-process.ts'

test('fixed process adapters reject generic or malformed targets', () => {
  assert.deepEqual(resolveLinuxDesktopEntryInvocation('/usr/share/applications/tockteam.desktop'), { executable: 'gio', args: ['launch', '/usr/share/applications/tockteam.desktop'] })
  assert.throws(() => resolveLinuxDesktopEntryInvocation('../unsafe.desktop'), /desktop entry/u)
  assert.deepEqual(resolveWindowsApplicationElevationInvocation('C:\\Program Files\\TockTeam\\tockteam.exe').executable, 'powershell.exe')
  assert.deepEqual(resolveWindowsApplicationElevationInvocation('shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App').args.at(-1), 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App')
  assert.throws(() => resolveWindowsApplicationElevationInvocation('powershell.exe; evil'), /Windows application target/u)
})

test('detached launch uses argument arrays and hidden detached children', async () => {
  const calls: unknown[] = []
  let spawnListener: (() => void) | undefined
  await launchDetachedLauncherExecutable('code', ['--folder-uri', 'file:///work/tockteam'], (executable, args, options) => {
    calls.push([executable, args, options]);
    return { once: (event: 'error' | 'spawn', listener: (() => void) | ((error: Error) => void)) => { if (event === 'spawn') { spawnListener = listener as () => void; spawnListener() } }, unref: () => calls.push('unref') }
  })
  spawnListener?.()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, [['code', ['--folder-uri', 'file:///work/tockteam'], { detached: true, stdio: 'ignore', windowsHide: true }], 'unref'])
})

test('custom-browser detached launches opt into shell-free cancellation and a startup timeout', async () => {
  const child = {
    once: (event: 'error' | 'spawn', listener: (() => void) | ((error: Error) => void)) => { if (event === 'spawn') (listener as () => void)() },
    unref: () => {},
    kill: () => {},
  }
  const signal = new AbortController().signal
  let received: unknown
  await launchDetachedLauncherExecutable('browser.exe', ['https://example.com/'], (_executable, _args, options) => { received = options; return child }, { signal, timeoutMs: 1_000 })
  assert.deepEqual(received, { detached: true, shell: false, signal, stdio: 'ignore', windowsHide: true })
})

test('resolves finite Windows VS Code requests to the concrete Code.exe install target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-code-'))
  try {
    const install = join(root, 'Microsoft VS Code')
    const bin = join(install, 'bin')
    const executable = join(install, 'Code.exe')
    await mkdir(bin, { recursive: true })
    await writeFile(join(bin, 'code.cmd'), 'echo should never execute', 'utf8')
    await writeFile(executable, 'Code executable', 'utf8')
    assert.equal(await resolveLauncherExecutable('code', 'Windows', { PATH: bin }), executable)
    assert.equal(await resolveLauncherExecutable('code.cmd', 'Windows', { PATH: bin }), executable)
    assert.equal(await resolveLauncherExecutable('code.exe', 'Windows', { PATH: bin }), executable)
    assert.equal((await resolveLauncherExecutable('code', 'Windows', { PATH: bin }))?.toLocaleLowerCase('en-US').endsWith('.cmd'), false)
    assert.equal(await resolveLauncherExecutable('code;evil', 'Windows', { PATH: bin }), undefined)
    assert.equal(await resolveLauncherExecutable('code\n&', 'Windows', { PATH: bin }), undefined)
    assert.equal(await resolveLauncherExecutable('code', 'Windows', { PATH: '' }), undefined)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('canonicalizes POSIX VS Code symlinks and rejects retargeted identities', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-code-symlink-'))
  try {
    const link = join(root, 'code')
    const target = join(root, 'code-real')
    const replacement = join(root, 'code-replacement')
    await writeFile(target, 'Code executable', 'utf8')
    await symlink(target, link)
    for (const platform of ['Linux', 'macOS'] as const) {
      const resolved = await resolveLauncherExecutable('code', platform, { PATH: root })
      assert.equal(resolved, await realpath(target))
      assert.equal(await resolveLauncherExecutable(link, platform, { PATH: '' }), await realpath(target))
      const stats = await lstat(target, { bigint: true })
      assert.equal(await revalidateLauncherPath(resolved!, { kind: 'file', identity: { dev: String(stats.dev), ino: String(stats.ino) } }), true)
    }
    await writeFile(replacement, 'replacement', 'utf8')
    await rm(target)
    await rm(link)
    await symlink(replacement, link)
    const replacementStats = await lstat(replacement, { bigint: true })
    assert.equal(await resolveLauncherExecutable('code', 'macOS', { PATH: root }), await realpath(replacement))
    assert.equal(await revalidateLauncherPath(await realpath(target).catch(() => target), { kind: 'file', identity: { dev: String(replacementStats.dev), ino: String(replacementStats.ino) } }), false)
    assert.equal(await revalidateLauncherPath(link, { kind: 'file', identity: { dev: String(replacementStats.dev), ino: String(replacementStats.ino) } }), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('path and URL revalidation rejects drift immediately before effect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-revalidate-'))
  try {
    const target = join(root, 'tool.exe')
    await writeFile(target, 'tool', 'utf8')
    const stat = await import('node:fs/promises').then(fs => fs.lstat(target, { bigint: true }))
    assert.equal(await revalidateLauncherPath(target, { kind: 'file', identity: { dev: String(stat.dev), ino: String(stat.ino) } }), true)
    assert.equal(await revalidateLauncherPath(target, { kind: 'directory', identity: { dev: String(stat.dev), ino: String(stat.ino) } }), false)
    assert.equal(await revalidateLauncherPath(target, { kind: 'file' }), false)
    assert.equal(await revalidateLauncherUrl('https://example.test/a'), true)
    assert.equal(await revalidateLauncherUrl('file:///etc/passwd'), false)
    assert.equal(revalidateLauncherWindowsStoreId('shell:AppsFolder\\Microsoft.App_1!App'), true)
    assert.equal(revalidateLauncherWindowsStoreId('shell:AppsFolder\\bad space'), false)
    assert.equal(await revalidateLauncherVscodeUri('vscode-remote://ssh/work.code-workspace'), true)
    assert.equal(await revalidateLauncherVscodeUri('file://server/share/work.code-workspace'), false)
    assert.equal(await revalidateLauncherVscodeUri('file:///etc/passwd'), false)
    assert.equal(await revalidateLauncherVscodeUri('javascript:alert(1)'), false)
    await assert.rejects(launchDetachedLauncherExecutable('C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd', []), /detached launcher invocation/u)
    await assert.rejects(launchDetachedLauncherExecutable('C:\\Program Files\\Microsoft VS Code\\bin\\code.bat', []), /detached launcher invocation/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})
