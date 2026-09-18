import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export function ensureElectronInstalled(root = projectRoot, installerNode = join(
  root,
  '.stage',
  'node-runtime',
  ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node']),
)) {
  const electron = join(root, 'node_modules', 'electron')
  const executable = {
    darwin: 'Electron.app/Contents/MacOS/Electron',
    linux: 'electron',
    win32: 'electron.exe',
  }[process.platform]
  if (executable === undefined) throw new Error(`unsupported Electron platform: ${process.platform}`)

  const pathFile = join(electron, 'path.txt')
  const versionFile = join(electron, 'dist', 'version')
  const version = JSON.parse(readFileSync(join(electron, 'package.json'), 'utf8')).version
  const binary = join(electron, 'dist', executable)
  const isInstalled = () => existsSync(binary)
    && existsSync(pathFile)
    && existsSync(versionFile)
    && readFileSync(pathFile, 'utf8') === executable
    && readFileSync(versionFile, 'utf8').replace(/^v/, '') === version
  if (isInstalled()) return binary
  if (!existsSync(installerNode)) throw new Error(`staged Node runtime is missing: ${installerNode}`)

  rmSync(join(electron, 'dist'), { recursive: true, force: true })
  rmSync(pathFile, { force: true })
  console.log('Installing Electron with staged Node')
  const env = {
    ...process.env,
    ELECTRON_INSTALL_ARCH: process.arch,
    ELECTRON_INSTALL_PLATFORM: process.platform,
    npm_config_arch: process.arch,
    npm_config_platform: process.platform,
  }
  delete env.ELECTRON_OVERRIDE_DIST_PATH
  const result = spawnSync(installerNode, [join(electron, 'install.js')], {
    cwd: root,
    env,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  if (!isInstalled()) throw new Error('Electron installer completed without producing a runnable binary')
  return binary
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureElectronInstalled()
}
