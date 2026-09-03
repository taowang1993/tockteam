import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

execFileSync('pnpm', [
  '-C', 'plugins/tocktutor',
  'install',
  '--frozen-lockfile',
], { cwd: root, stdio: 'inherit' })
