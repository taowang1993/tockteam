import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const output = join(root, '.cache', 'tocktutor-tests', `tockteam-desktop-${String(version)}.tgz`)

mkdirSync(dirname(output), { recursive: true })
rmSync(output, { force: true })
execFileSync(process.execPath, [join(root, 'scripts', 'pack-desktop.mjs'), output], {
  cwd: root,
  stdio: 'inherit',
})
