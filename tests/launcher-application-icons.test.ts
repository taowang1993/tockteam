import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { resolveMacOSApplicationIconPath } from '../src/launcher-application-icons.ts'

test('macOS application icon cache evicts stale path churn', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tockteam-launcher-application-icon-quota-'))
  try {
    const applicationPath = path.join(root, 'Current.app')
    const iconPath = path.join(applicationPath, 'Contents', 'Resources', 'AppIcon.icns')
    const cacheDirectory = path.join(root, 'cache')
    await mkdir(path.dirname(iconPath), { recursive: true })
    await mkdir(cacheDirectory)
    await writeFile(iconPath, 'icns')
    await Promise.all(Array.from({ length: 257 }, (_, index) => writeFile(path.join(cacheDirectory, `${index.toString(16).padStart(64, '0')}.png`), 'png')))
    await resolveMacOSApplicationIconPath(applicationPath, cacheDirectory, async (executable, args) => {
      if (executable === '/usr/bin/defaults') return { stdout: 'AppIcon\n' }
      await writeFile(args.at(-1)!, 'png')
      return { stdout: '' }
    })
    assert.ok((await readdir(cacheDirectory)).filter(name => name.endsWith('.png')).length <= 256)
  } finally { await rm(root, { force: true, recursive: true }) }
})

test('macOS application icons use the bundle icon and reuse the bounded cache', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tockteam-launcher-application-icon-'))
  try {
    const applicationPath = path.join(root, 'Notes.app')
    const iconPath = path.join(applicationPath, 'Contents', 'Resources', 'AppIcon.icns')
    await mkdir(path.dirname(iconPath), { recursive: true })
    await writeFile(iconPath, 'icns')
    const calls: Array<{ args: readonly string[]; executable: string }> = []
    const run = async (executable: string, args: readonly string[]): Promise<Readonly<{ stdout: string }>> => {
      calls.push({ args, executable })
      if (executable === '/usr/bin/defaults') return { stdout: 'AppIcon\n' }
      await writeFile(args.at(-1)!, 'png')
      return { stdout: '' }
    }

    const first = await resolveMacOSApplicationIconPath(applicationPath, path.join(root, 'cache'), run)
    const second = await resolveMacOSApplicationIconPath(applicationPath, path.join(root, 'cache'), run)

    assert.equal(first, second)
    assert.deepEqual(calls[0], {
      args: ['read', path.join(applicationPath, 'Contents', 'Info.plist'), 'CFBundleIconFile'],
      executable: '/usr/bin/defaults',
    })
    const conversion = calls.find(call => call.executable === '/usr/bin/sips')
    assert.deepEqual(conversion?.args.slice(0, -1), ['-z', '32', '32', '-s', 'format', 'png', iconPath, '-o'])
    assert.match(conversion?.args.at(-1) ?? '', /^.+\.png\..+\.tmp$/u)
    assert.equal(conversion?.args.at(-1)?.startsWith(`${first}.`), true)
    assert.equal(calls.length, 2)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
