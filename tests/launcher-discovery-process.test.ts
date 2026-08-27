import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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
  resolveLauncherExecutableInvocation,
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

test('resolves only finite PATH VS Code executable candidates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-code-'))
  try {
    await writeFile(join(root, 'code.cmd'), 'code', 'utf8')
    assert.equal(await resolveLauncherExecutable('code', 'Windows', { PATH: root }), join(root, 'code.cmd'))
    assert.equal(await resolveLauncherExecutable('code.cmd', 'Windows', { PATH: root }), join(root, 'code.cmd'))
    assert.equal(await resolveLauncherExecutable('code;evil', 'Windows', { PATH: root }), undefined)
    assert.equal(await resolveLauncherExecutable('code', 'Windows', { PATH: '' }), undefined)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('launches Windows command files through one fixed PowerShell data adapter', () => {
  const invocation = resolveLauncherExecutableInvocation('C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd', ['--folder-uri', 'vscode-remote://ssh/work'])
  assert.equal(invocation.executable, 'powershell.exe')
  assert.equal(invocation.args.at(-2), '--folder-uri')
  assert.equal(invocation.args.at(-1), 'vscode-remote://ssh/work')
  assert.match(String(invocation.args[4]), /Start-Process -FilePath \$target/u)
  assert.doesNotMatch(String(invocation.args[4]), /code\\.cmd/u)
})

test('path and URL revalidation rejects drift immediately before effect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-revalidate-'))
  try {
    const target = join(root, 'tool.exe')
    await writeFile(target, 'tool', 'utf8')
    const stat = await import('node:fs/promises').then(fs => fs.lstat(target, { bigint: true }))
    assert.equal(await revalidateLauncherPath(target, { kind: 'file', identity: { dev: String(stat.dev), ino: String(stat.ino) } }), true)
    assert.equal(await revalidateLauncherPath(target, { kind: 'directory', identity: { dev: String(stat.dev), ino: String(stat.ino) } }), false)
    assert.equal(await revalidateLauncherUrl('https://example.test/a'), true)
    assert.equal(await revalidateLauncherUrl('file:///etc/passwd'), false)
    assert.equal(revalidateLauncherWindowsStoreId('shell:AppsFolder\\Microsoft.App_1!App'), true)
    assert.equal(revalidateLauncherWindowsStoreId('shell:AppsFolder\\bad space'), false)
    assert.equal(await revalidateLauncherVscodeUri('vscode-remote://ssh/work.code-workspace'), true)
    assert.equal(await revalidateLauncherVscodeUri('javascript:alert(1)'), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
