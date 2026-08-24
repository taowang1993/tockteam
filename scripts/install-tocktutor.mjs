import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

if (process.env.DSH_SOURCE !== undefined) {
  throw new Error('install:tocktutor uses the DSH revision pinned by dsh-source.json; unset DSH_SOURCE first')
}

execFileSync('pnpm', ['run', 'build:dsh'], { cwd: root, stdio: 'inherit' })
execFileSync('pnpm', ['-C', 'plugins/tocktutor', 'install'], { cwd: root, stdio: 'inherit' })
