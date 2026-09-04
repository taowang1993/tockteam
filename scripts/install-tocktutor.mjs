import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = join(dirname(fileURLToPath(import.meta.resolve('pnpm'))), 'bin', 'pnpm.mjs')

execFileSync(process.execPath, [
  pnpm,
  '-C', 'plugins/tocktutor',
  'install',
  '--frozen-lockfile',
], { cwd: root, stdio: 'inherit' })
