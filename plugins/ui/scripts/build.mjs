import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(join(root, 'lib'), { recursive: true })
await build({
  bundle: true,
  entryPoints: [join(root, 'src', 'index.ts')],
  format: 'esm',
  logLevel: 'info',
  minify: true,
  outfile: join(root, 'lib', 'index.js'),
  packages: 'external',
  platform: 'node',
  target: 'node22',
})
