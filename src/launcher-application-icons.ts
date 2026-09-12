import { createHash, randomUUID } from 'node:crypto'
import { access, lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

type RunCommand = (executable: string, args: readonly string[]) => Promise<Readonly<{ stdout: string }>>

const MAX_CACHE_FILES = 128
const RETAINED_CACHE_FILES = 96
const CACHE_FILE_NAME = /^[a-f0-9]{64}\.png$/u

async function pruneIconCache(cacheDirectory: string, currentPath: string): Promise<void> {
  const names = await readdir(cacheDirectory)
  const cacheNames = names.filter(name => CACHE_FILE_NAME.test(name))
  if (cacheNames.length <= MAX_CACHE_FILES) return
  const entries = (await Promise.all(cacheNames.map(async name => {
    const target = path.join(cacheDirectory, name)
    try {
      const metadata = await lstat(target)
      return metadata.isFile() ? { modifiedAt: metadata.mtimeMs, target } : undefined
    } catch { return undefined }
  }))).filter(entry => entry !== undefined)
  entries.sort((left, right) => Number(right.target === currentPath) - Number(left.target === currentPath) || right.modifiedAt - left.modifiedAt)
  let retainedFiles = 0
  await Promise.all(entries.map(async entry => {
    if (retainedFiles < RETAINED_CACHE_FILES) {
      retainedFiles += 1
      return
    }
    await rm(entry.target, { force: true })
  }))
}

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
    await pruneIconCache(cacheDirectory, cachedPath).catch(() => undefined)
    return cachedPath
  } finally {
    await rm(temporaryPath, { force: true })
  }
}
