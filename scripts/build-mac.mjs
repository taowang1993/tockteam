import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveMacPackageArchitecture } from '../src/node-platform.ts'
import { resolveProductVersion } from '../src/version.ts'
import { ensureElectronInstalled } from './electron-runtime.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = resolveProductVersion(root)
const arch = resolveMacPackageArchitecture(process.argv[2])
ensureElectronInstalled()

const icon = join(root, 'assets', 'TockTeam-Desktop.icns')
if (!existsSync(icon)) {
  const iconResult = spawnSync('sh', [join(root, 'scripts', 'generate-icon.sh')], {
    cwd: root,
    stdio: 'inherit',
  })
  if (iconResult.error !== undefined) throw iconResult.error
  if (iconResult.status !== 0) process.exit(iconResult.status ?? 1)
}

const builder = join(root, 'node_modules', '.bin', 'electron-builder')
// Packaging runs on tag commits; never let electron-builder infer a publish
// step from the tag. Releases are attached by the workflow instead.
const result = spawnSync(builder, [
  '--mac',
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
