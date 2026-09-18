import { spawnSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'

interface LandlockResolutionHooks {
  executable?: (path: string) => boolean
  probe?: (path: string) => boolean
  resolvePackageJson?: (specifier: string) => string
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function enforcing(path: string): boolean {
  return spawnSync(path, ['--probe'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 2_000,
  }).status === 0
}

/** Resolve only a staged, executable launcher whose host kernel probe succeeds. */
export function resolveLandlockLauncher(
  runtimeRoot: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  hooks: LandlockResolutionHooks = {},
): string | undefined {
  if (platform !== 'linux' || (arch !== 'x64' && arch !== 'arm64')) return undefined
  try {
    const packageName = `@deepseek-ai/node-addon-landlock-run-linux-${arch}`
    const resolvePackageJson = hooks.resolvePackageJson
      ?? createRequire(join(runtimeRoot, 'node_modules', '@deepseek-ai', 'node-addon-landlock-run', 'package.json')).resolve
    const launcher = join(dirname(resolvePackageJson(`${packageName}/package.json`)), 'bin', 'landlock-run')
    const child = relative(resolve(runtimeRoot), resolve(launcher))
    if (child === '..' || child.startsWith(`..${sep}`)) return undefined
    if (!(hooks.executable ?? executable)(launcher)) return undefined
    return (hooks.probe ?? enforcing)(launcher) ? launcher : undefined
  } catch {
    return undefined
  }
}
