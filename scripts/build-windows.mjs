import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProductVersion } from '../src/version.ts'
import { ensureElectronInstalled } from './electron-runtime.mjs'
import {
  windowsPortableArchiveArgs,
  writeWindowsPortableManifest,
  writeWindowsPortableMarker,
} from './windows-portable-archive.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = resolveProductVersion(root)
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const requestedArch = process.argv[2]
const arch = requestedArch ?? { arm64: 'arm64', x64: 'x64' }[process.arch] ?? process.arch
if (arch !== 'x64') {
  throw new Error(`unsupported Windows architecture: ${arch}; only x64 is packaged`)
}

ensureElectronInstalled()

// The `.bin` shim is a POSIX script; on Windows the package has no usable
// wrapper in PATH, so run the CLI entry with Node directly.
const builder = join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
// Packaging runs on tag commits; never let electron-builder infer a publish
// step from the tag. Releases are attached by the workflow instead.
const result = spawnSync(process.execPath, [
  builder,
  '--win',
  `--${arch}`,
  '--publish',
  'never',
  `--config.extraMetadata.version=${version}`,
], {
  cwd: root,
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  },
  stdio: 'inherit',
})
if (result.error !== undefined) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

// Archive only the finite manifest so staged runtime junctions/symlinks are
// preserved as entries without recursive traversal. Windows' System32
// bsdtar handles tar.gz and retains those link entries for the portable app.
const outputDir = join(root, 'release')
const systemRoot = process.env.SystemRoot?.trim()
if (systemRoot === undefined || !isAbsolute(systemRoot)) throw new Error('Windows SystemRoot must be an absolute path')
const tar = join(systemRoot, 'System32', 'tar.exe')
if (!existsSync(tar)) throw new Error(`Windows bsdtar is missing: ${tar}`)
await writeWindowsPortableMarker(outputDir, {
  appId: packageJson.build?.appId,
  productName: packageJson.productName,
  version,
})
const manifestPath = join(outputDir, 'tockteam-portable-manifest.txt')
await writeWindowsPortableManifest(outputDir, manifestPath)
const archive = join(outputDir, `TockTeam-Desktop-${version}-x64.tar.gz`)
const archiveResult = spawnSync(tar, windowsPortableArchiveArgs({ archive, outputDir, manifestPath }), {
  cwd: outputDir,
  stdio: 'inherit',
})
if (archiveResult.error !== undefined) throw archiveResult.error
if (archiveResult.status !== 0) process.exit(archiveResult.status ?? 1)
if (!existsSync(archive)) throw new Error(`Windows archive was not produced: ${archive}`)
console.log(`Packaged TockTeam Desktop ${version}: ${archive}`)
