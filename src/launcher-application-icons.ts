import { createHash, randomUUID } from 'node:crypto'
import { access, lstat, mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

type RunCommand = (executable: string, args: readonly string[]) => Promise<Readonly<{ stdout: string }>>

export async function resolveMacOSApplicationIconPath(
  applicationPath: string,
  cacheDirectory: string,
  run: RunCommand,
): Promise<string> {
  const cachedPath = path.join(cacheDirectory, `${createHash('sha256').update(applicationPath).digest('hex')}.png`)
  const applicationModifiedAt = (await stat(applicationPath)).mtimeMs
  try {
    const cached = await lstat(cachedPath)
    if (cached.isFile() && cached.size > 0 && cached.size <= 64 * 1024 && cached.mtimeMs >= applicationModifiedAt) return cachedPath
  } catch {
    // Populate the cache below.
  }

  const infoPath = path.join(applicationPath, 'Contents', 'Info.plist')
  const { stdout } = await run('/usr/bin/defaults', ['read', infoPath, 'CFBundleIconFile'])
  const configuredName = stdout.trim()
  if (!configuredName || configuredName.length > 256 || path.basename(configuredName) !== configuredName) {
    throw new Error('Application bundle contains an invalid icon name')
  }
  const iconName = configuredName.endsWith('.icns') ? configuredName : `${configuredName}.icns`
  const iconPath = path.join(applicationPath, 'Contents', 'Resources', iconName)
  await access(iconPath)
  await mkdir(cacheDirectory, { mode: 0o700, recursive: true })
  const temporaryPath = `${cachedPath}.${randomUUID()}.tmp`
  try {
    await run('/usr/bin/sips', ['-z', '32', '32', '-s', 'format', 'png', iconPath, '-o', temporaryPath])
    const converted = await lstat(temporaryPath)
    if (!converted.isFile() || converted.size === 0 || converted.size > 64 * 1024) {
      throw new Error('Application icon conversion returned an invalid PNG')
    }
    await rename(temporaryPath, cachedPath)
    return cachedPath
  } finally {
    await rm(temporaryPath, { force: true })
  }
}
